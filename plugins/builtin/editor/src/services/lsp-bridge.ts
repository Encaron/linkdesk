/**
 * E4V#40s2 LSP 桥——渲染进程端。通过 IPC 启动语言服务器，
 * 创建 MonacoLanguageClient 连接，对接 IEditorService.openEditor() 导航。
 *
 * 对标 VS Code Extension Host——每个语言一个 LSP 客户端。
 */
import { MonacoLanguageClient } from "monaco-languageclient";
import type { MessageReader, MessageWriter } from "vscode-jsonrpc";
const lsp = window.linkdesk?.lsp;
const lk = window.linkdesk;

/** 语言 ID → MonacoLanguageClient 注册表——goToDefinitionAt 查表分派 */
const _clients = new Map<string, MonacoLanguageClient>();

export function getLspClient(languageId: string): MonacoLanguageClient | undefined {
  return _clients.get(languageId);
}

/**
 * 为指定语言启动 LSP 客户端。
 * 语言服务器通过主进程 child_process.spawn 启动，stdin/stdout 经 IPC 桥接。
 *
 * @returns MonacoLanguageClient——调用方可存引用、dispose 或注册 provider
 */
export async function startLspClient(
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
    const msg = `${languageId} LSP 启动失败（spawn）: ${(err as Error).message ?? String(err)}`;
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
          reject(new Error(`${languageId} LSP initialize 超时（${LSP_INIT_TIMEOUT_MS / 1000}s 无响应）——语言服务器未就绪，请检查依赖与配置`));
        }, LSP_INIT_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    const msg = `${languageId} LSP 启动失败（initialize）: ${(err as Error).message ?? String(err)}`;
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
