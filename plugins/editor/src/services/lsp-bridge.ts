/**
 * E4V#40s2 LSP 桥——渲染进程端。通过 IPC 启动语言服务器，
 * 创建 MonacoLanguageClient 连接，对接 IEditorService.openEditor() 导航。
 *
 * 对标 VS Code Extension Host——每个语言一个 LSP 客户端。
 */
import { MonacoLanguageClient } from "monaco-languageclient";
import type { MessageReader, MessageWriter } from "vscode-jsonrpc";
// E6#73h（D3）：非组件模块走 i18next 默认实例（marketplace marketShared 先例）——本文件的报错
// 会经 EditorView catch 直接成为用户可见 toast，此前是硬编码中文模板串（审计因含 ${} 插值跳过，
// 英文界面下这条链路全中文）。
import i18n from "i18next";
const lsp = window.linkdesk?.lsp;
const lk = window.linkdesk;

/** 语言 ID → MonacoLanguageClient 注册表——goToDefinitionAt 查表分派 */
const _clients = new Map<string, MonacoLanguageClient>();

export function getLspClient(languageId: string): MonacoLanguageClient | undefined {
  return _clients.get(languageId);
}

/* ── E6#73m K4：语言服务器的可见状态 ── */

/**
 * 语言服务器这一刻处在哪一档。`undefined` = 这个语言压根没配 LSP（TS/JS 走 worker，正常）。
 *
 * 病根：启动要 1~15 秒（取决于服务器本身，15s 只是防挂护栏上限，不是每次都等 15 秒），
 * 而这期间**界面上没有任何一处说得出「正在起来」**——用户按 F12 得到的是一片安静，
 * 只会得出「跳转坏了」的结论，甚至会去重启软件。
 */
export type LspState = "starting" | "ready" | "failed";

const _states = new Map<string, LspState>();
const _stateSubs = new Set<(languageId: string, state: LspState) => void>();

/** 同语言的启动中 promise——**两个编辑器不得各起一个进程**。
 *  老判据只挡 `_clients`（要 start 成功才有值），快速连开两个 .py = 两次 spawn。 */
const _pending = new Map<string, Promise<MonacoLanguageClient>>();
/** 「启动中点了跳转」的一次性发言权——每轮启动只出声一次，F12 连按不刷屏 */
const _blockedNoticed = new Set<string>();

export function getLspState(languageId: string): LspState | undefined {
  return _states.get(languageId);
}

/** 订阅状态变化——返回退订函数（EditorView 在 mount/unmount 里配对调用） */
export function onLspStateChange(cb: (languageId: string, state: LspState) => void): () => void {
  _stateSubs.add(cb);
  return () => { _stateSubs.delete(cb); };
}

function setLspState(languageId: string, state: LspState): void {
  _states.set(languageId, state);
  for (const cb of _stateSubs) cb(languageId, state);
}

/**
 * 取一次「现在点跳转也没用」的发言权——返回要说的那一档，或 null（不该出声 / 本轮已说过）。
 * 只有 `starting` / `failed` 该出声：`ready` 时走的是正常跳转，`undefined` 是这个语言本来就没 LSP。
 */
export function takeBlockedNotice(languageId: string): LspState | null {
  const st = _states.get(languageId);
  if (st !== "starting" && st !== "failed") return null;
  if (_blockedNoticed.has(languageId)) return null;
  _blockedNoticed.add(languageId);
  return st;
}

/**
 * 为指定语言启动 LSP 客户端。
 * 语言服务器通过主进程 child_process.spawn 启动，stdin/stdout 经 IPC 桥接。
 *
 * @returns MonacoLanguageClient——调用方可存引用、dispose 或注册 provider
 */
export function startLspClient(
  languageId: string,
  command: string,
  args?: string[],
  workspaceRoot?: string,
): Promise<MonacoLanguageClient> {
  // E6#73m K4：同语言已在起 → 复用同一个 promise（并发两个编辑器只起一个进程）。
  // `setLspState` 必须**同步**跑在第一个 await 之前——调用方订阅完立刻就能拿到
  // 「启动中」，否则订阅者会错过这一档（状态直接从 undefined 跳到 ready）。
  const inflight = _pending.get(languageId);
  if (inflight) return inflight;
  setLspState(languageId, "starting");
  _blockedNoticed.delete(languageId); // 新一轮启动——「启动中」的提示权重新发放
  const p = doStartLspClient(languageId, command, args, workspaceRoot)
    .then((client) => { setLspState(languageId, "ready"); return client; })
    .catch((err) => { setLspState(languageId, "failed"); throw err; })
    .finally(() => { _pending.delete(languageId); });
  _pending.set(languageId, p);
  return p;
}

async function doStartLspClient(
  languageId: string,
  command: string,
  args?: string[],
  workspaceRoot?: string,
): Promise<MonacoLanguageClient> {
  if (!lsp) throw new Error("linkdesk.lsp 不可用——非 Electron 环境");

  // 1. main process spawn 语言服务器
  console.error(`[lsp-bridge:debug] calling lsp.spawn command=${command} args=${JSON.stringify(args)} languageId=${languageId}`);
  let channelId: string;
  try {
    channelId = await lsp.spawn(command, args, languageId);
  } catch (err) {
    // E5.8#24.6：spawn 失败（缺依赖/命令不可用）→ 显性抛错——调用方 catch 弹 toast，杜绝静默
    // （回归 #24：pyright 被删 → spawn ENOENT → invoke 仍返 channelId → client.start() 挂死）
    // E6#73h（D3/D5）：结论句 + 细节（命令名让用户知道是哪个程序没起来）——整句走 i18n
    const msg = i18n.t("无法启动语言服务器（{{command}}）：{{detail}}", {
      command,
      detail: (err as Error).message ?? String(err),
    });
    console.error(`[lsp-bridge] ${msg}`);
    throw new Error(msg);
  }
  console.error(`[lsp-bridge:debug] lsp.spawn returned channelId=${channelId}`);

  // 2. 构造 IPC 桥接的 MessageTransports
  const reader = createIpcReader(channelId);
  const writer = createIpcWriter(channelId);

  const client = new MonacoLanguageClient({
    name: `${languageId} LSP`,
    clientOptions: {
      documentSelector: [{ language: languageId }],
      workspaceFolder: workspaceRoot
        ? {
            // E5.7#98：运行时只需 toString()（initialize 序列化），手写轻量 URI——窄接口 cast 替代 as any
            uri: {
              scheme: "file",
              authority: "",
              path: `/${lk.path.normalize(workspaceRoot)}`,
              toString: () => `file:///${lk.path.normalize(workspaceRoot)}`,
            } as unknown as import("vscode").Uri,
            name: "workspace",
            index: 0,
          }
        : undefined,
    },
    messageTransports: { reader, writer },
  });

  // 3. E5.8#24.6：initialize 超时护栏——spawn 成功但服务器不响应（进程没起来/握手卡死/脚本内部报错退出）
  //    → 显性报错而非 client.start() 永久挂起（回归 #24 静默链第二环）。失败后 `_clients` 不入半启动态，
  //    getLspClient 恒 undefined → 后续跳转不会用死客户端。
  const LSP_INIT_TIMEOUT_MS = 15000;
  const startPromise = client.start();
  // 超时赢后 start 迟到 reject 变 unhandled rejection——先挂 sink 消费
  startPromise.catch(() => {});
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      startPromise,
      new Promise((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          // E6#73h（D3）：原文「${languageId} LSP initialize 超时（15s 无响应）——…」是完整句，但它会
          // **再套一层**下方 catch 的「无法连接语言服务器」→ 变成两句结论叠着。改成细节短语，让外层
          // 那句当结论、这句当细节。顺带去掉「initialize」黑话（用户不知道握手阶段叫什么）。
          reject(new Error(i18n.t("启动后 {{sec}} 秒没有响应——请检查它是否已正确安装", {
            sec: LSP_INIT_TIMEOUT_MS / 1000,
          })));
        }, LSP_INIT_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    const msg = i18n.t("无法连接语言服务器（{{lang}}）：{{detail}}", {
      lang: languageId,
      detail: (err as Error).message ?? String(err),
    });
    console.error(`[lsp-bridge] ${msg}`);
    client.stop().catch(() => {});
    lsp.dispose(channelId).catch(() => {});
    throw new Error(msg);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  _clients.set(languageId, client);
  console.log(`[lsp-bridge] ${languageId} LSP 客户端已启动, channel:`, channelId);
  return client;
}

/* ── IPC MessageReader ── */

function createIpcReader(channelId: string): MessageReader {
  const listeners: Array<(msg: string) => void> = [];
  let buffer = "";

  const unsub = lsp.onData((cid: string, data: string) => {
    if (cid !== channelId) return;
    buffer += data;

    // LSP 协议：Content-Length: N\r\n\r\n{json}
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;

      const header = buffer.slice(0, headerEnd);
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) { buffer = ""; break; }

      const contentLength = parseInt(lengthMatch[1]);
      const bodyStart = headerEnd + 4;
      if (buffer.length < bodyStart + contentLength) break; // 等完整 body

      const body = buffer.slice(bodyStart, bodyStart + contentLength);
      buffer = buffer.slice(bodyStart + contentLength);
      for (const cb of listeners) cb(JSON.parse(body));
    }
  });

  return {
    listen: (cb: (msg: string) => void) => {
      listeners.push(cb);
      return {
        dispose: () => {
          const idx = listeners.indexOf(cb);
          if (idx >= 0) listeners.splice(idx, 1);
        },
      };
    },
    onClose: (_cb: () => void) => ({ dispose: () => {} }),
    onError: (_cb: (err: Error) => void) => ({ dispose: () => {} }),
    onPartialMessage: (_cb: (msg: string) => void) => ({ dispose: () => {} }),
    dispose: () => { unsub(); listeners.length = 0; },
  } as unknown as MessageReader;
}

/* ── IPC MessageWriter ── */

function createIpcWriter(channelId: string): MessageWriter {
  return {
    write: (msg: string) => {
      const content = typeof msg === "string" ? msg : JSON.stringify(msg);
      const length = new TextEncoder().encode(content).length;
      const framed = `Content-Length: ${length}\r\n\r\n${content}`;
      lsp.write(channelId, framed);
      return Promise.resolve();
    },
    end: () => { lsp.dispose(channelId).catch(() => {}); }, // 非关键操作——清理 LSP 通道，编辑器关闭时失败不阻塞
    dispose: () => {},
    onClose: (_cb: () => void) => ({ dispose: () => {} }),
    onError: (_cb: (err: Error) => void) => ({ dispose: () => {} }),
  } as unknown as MessageWriter;
}
