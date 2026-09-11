/**
 * 启动 LSP 客户端（E6#87c 拆自 lsp-bridge.ts）。
 *
 * 容器读写一律走 `./registry` 的 accessor——本文件**不持有任何模块级状态**，
 * 两份导出（start / doStart）共用的是 registry 里的 `_pending` / `_states` / `_clients`。
 */
import { MonacoLanguageClient } from "monaco-languageclient";
// E6#73h（D3）：非组件模块走 i18next 默认实例（marketplace marketShared 先例）——本文件的报错
// 会经 EditorView catch 直接成为用户可见 toast，此前是硬编码中文模板串（审计因含 ${} 插值跳过，
// 英文界面下这条链路全中文）。
import i18n from "i18next";
import { createIpcReader, createIpcWriter } from "./ipc";
import { clearPendingStart, getPendingStart, resetBlockedNotice, setLspClient, setLspState, setPendingStart } from "./registry";

const lsp = window.linkdesk?.lsp;
const lk = window.linkdesk;

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
  const inflight = getPendingStart(languageId);
  if (inflight) return inflight;
  setLspState(languageId, "starting");
  resetBlockedNotice(languageId); // 新一轮启动——「启动中」的提示权重新发放
  const p = doStartLspClient(languageId, command, args, workspaceRoot)
    .then((client) => { setLspState(languageId, "ready"); return client; })
    .catch((err) => { setLspState(languageId, "failed"); throw err; })
    .finally(() => { clearPendingStart(languageId); });
  setPendingStart(languageId, p);
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

  setLspClient(languageId, client);
  console.log(`[lsp-bridge] ${languageId} LSP 客户端已启动, channel:`, channelId);
  return client;
}
