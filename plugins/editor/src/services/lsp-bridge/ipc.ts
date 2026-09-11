/**
 * LSP 通道的 MessageReader / MessageWriter——把主进程 spawn 出来的语言服务器
 * stdin/stdout（经 IPC 桥接）包装成 vscode-jsonrpc 要求的传输层（E6#87c 拆自 lsp-bridge.ts）。
 *
 * 两者都只依赖 `channelId`，彼此不共享状态——独立成文件零耦合。
 */
import type { MessageReader, MessageWriter } from "vscode-jsonrpc";

const lsp = window.linkdesk?.lsp;

/** IPC MessageReader */
export function createIpcReader(channelId: string): MessageReader {
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

/** IPC MessageWriter */
export function createIpcWriter(channelId: string): MessageWriter {
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
