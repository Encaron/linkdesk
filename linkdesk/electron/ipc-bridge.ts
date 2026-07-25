/**
 * IpcBridge——插件 WebView ↔ 壳渲染进程的 IPC 中继
 *
 * E3a #26：插件 WebView 不能直接 import 壳侧的 ConfigurationService/CommandRegistry
 * ——它们在另一个渲染进程。IpcBridge 在主进程注册 ipcMain.handle()，把插件侧的
 * ipcRenderer.invoke() 调用转发给壳渲染进程处理，再把结果返回。
 *
 * 流程：插件 → ipcMain.handle → mainWindow.webContents.send → 壳 preload →
 *       IpcBridgeHandler（React）→ 壳 preload → ipcMain.on → 返回插件
 */

import { BrowserWindow, ipcMain } from 'electron';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class IpcBridge {
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;

  /** 需要从插件 WebView 代理到壳渲染进程的 channel */
  private static PROXY_CHANNELS = [
    'config:get',
    'config:set',
    'commands:execute',
  ];

  constructor(private mainWindow: BrowserWindow) {
    this.registerProxyHandlers();
    this.registerResponseListener();
  }

  /**
   * 为每个代理 channel 注册 ipcMain.handle()。
   * 插件 WebView 调用 ipcRenderer.invoke(channel, ...args) →
   * 主进程接收 → 转发给壳渲染进程 → 等待响应 → 返回给插件。
   */
  private registerProxyHandlers(): void {
    for (const channel of IpcBridge.PROXY_CHANNELS) {
      ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
        const requestId = `bridge-${++this.requestCounter}-${Date.now()}`;

        return new Promise<unknown>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pendingRequests.delete(requestId);
            reject(new Error(`[IpcBridge] 请求超时: ${channel} (requestId=${requestId})`));
          }, 10_000);

          this.pendingRequests.set(requestId, { resolve, reject, timer });

          this.mainWindow.webContents.send('bridge:request', {
            requestId,
            channel,
            args,
          });
        });
      });
    }

    console.log(`[IpcBridge] 已注册 ${IpcBridge.PROXY_CHANNELS.length} 个代理 channel: ${IpcBridge.PROXY_CHANNELS.join(', ')}`);
  }

  /**
   * 监听壳渲染进程的响应——壳侧 IpcBridgeHandler 处理后通过
   * ipcRenderer.send('bridge:response', ...) 发回。
   */
  private registerResponseListener(): void {
    ipcMain.on('bridge:response', (_event, { requestId, result, error }: {
      requestId: string;
      result?: unknown;
      error?: string;
    }) => {
      const pending = this.pendingRequests.get(requestId);
      if (!pending) return;

      clearTimeout(pending.timer);
      this.pendingRequests.delete(requestId);

      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(result);
      }
    });
  }

  /** 清理所有待处理请求——应用退出时调用 */
  dispose(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('[IpcBridge] 应用退出，请求取消'));
    }
    this.pendingRequests.clear();
  }
}
