/**
 * E4V#40s2 LSP 桥——渲染进程端。通过 IPC 启动语言服务器，
 * 创建 MonacoLanguageClient 连接，对接 IEditorService.openEditor() 导航。
 *
 * 对标 VS Code Extension Host——每个语言一个 LSP 客户端。
 */
import { MonacoLanguageClient } from "monaco-languageclient";
import type { MessageReader, MessageWriter } from "vscode-jsonrpc";

const lsp = (window as any).linkdesk?.lsp;

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
): Promise<MonacoLanguageClient> {
  if (!lsp) throw new Error("linkdesk.lsp 不可用——非 Electron 环境");

  // 1. main process spawn 语言服务器
  const channelId: string = await lsp.spawn(command, args, languageId);

  // 2. 构造 IPC 桥接的 MessageTransports
  const reader = createIpcReader(channelId);
  const writer = createIpcWriter(channelId);

  const client = new MonacoLanguageClient({
    name: `${languageId} LSP`,
    clientOptions: {
      documentSelector: [{ language: languageId }],
    },
    messageTransports: { reader, writer },
  });

  await client.start();
  console.log(`[lsp-bridge] ${languageId} LSP 客户端已启动, channel:`, channelId);
  return client;
}

/* ── IPC MessageReader ── */

function createIpcReader(channelId: string): MessageReader {
  const listeners: Array<(msg: string) => void> = [];
  const unsub = lsp.onData((cid: string, data: string) => {
    if (cid !== channelId) return;
    for (const line of data.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) {
        for (const cb of listeners) cb(trimmed);
      }
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
      lsp.write(channelId, content + "\n");
      return Promise.resolve();
    },
    end: () => { lsp.dispose(channelId).catch(() => {}); },
    dispose: () => {},
    onClose: (_cb: () => void) => ({ dispose: () => {} }),
    onError: (_cb: (err: Error) => void) => ({ dispose: () => {} }),
  } as unknown as MessageWriter;
}
