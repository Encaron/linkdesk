/**
 * IpcBridge——插件 WebView ↔ 壳渲染进程的 IPC 中继
 *
 * E3a #26：插件 → 壳（请求-响应）——config:get/set、commands:execute
 * E3a #27：壳 → 插件（事件推送）——串口数据、配置变更等推到插件 WebView
 *
 * 双向流程：
 *   请求：插件 → ipcMain.handle → mainWindow.webContents.send → 壳 preload →
 *         IpcBridgeHandler（React）→ 壳 preload → ipcMain.on → 返回插件
 *   推送：壳 → ipcMain.on('bridge:push-to-plugin') → pluginView.webContents.send →
 *         插件 preload → 插件 React 回调
 */

import { BrowserWindow, ipcMain } from 'electron';
import type { WindowManager } from './window-manager.js';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class IpcBridge {
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;
  /** #27：每个插件的待推送事件队列——保证顺序交付 */
  private pushQueues = new Map<string, Array<{ channel: string; payload: unknown }>>();
  private flushing = new Set<string>();

  /** 需要从插件 WebView 代理到壳渲染进程的 channel（#26） */
  private static PROXY_CHANNELS = [
    'config:get',
    'config:set',
    'commands:execute',
  ];

  constructor(
    private mainWindow: BrowserWindow,
    private windowManager: WindowManager,
  ) {
    this.registerProxyHandlers();
    this.registerResponseListener();
    this.registerPushListener();
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

  // ═══════════════════════════════════════════════════════
  // E3a #27——事件推送（壳 → 插件 WebView）
  // ═══════════════════════════════════════════════════════

  /**
   * 壳渲染进程通过 IPC 推送事件到指定插件 WebView。
   * 壳侧调用：ipcRenderer.send('bridge:push-to-plugin', {pluginId, channel, payload})
   */
  private registerPushListener(): void {
    ipcMain.on('bridge:push-to-plugin', (_event, { pluginId, channel, payload }: {
      pluginId: string;
      channel: string;
      payload: unknown;
    }) => {
      this.pushToPlugin(pluginId, channel, payload);
    });

    console.log('[IpcBridge] 已注册 bridge:push-to-plugin 事件推送通道');
  }

  /**
   * 推送事件到插件 WebView。
   * 主进程服务（serial-service 等）可以直接调用此方法，
   * 壳渲染进程通过 bridge:push-to-plugin IPC 间接调用。
   *
   * 使用队列串行化——同一插件的多个推送严格按序交付，
   * 防止 JS 事件乱序（对标主线程单线程语义）。
   */
  pushToPlugin(pluginId: string, channel: string, payload: unknown): void {
    const view = this.windowManager.getPluginView(pluginId);
    if (!view) {
      // 插件 WebView 不存在——可能已卸载或尚未创建，静默丢弃
      return;
    }

    // 入队
    const queue = this.pushQueues.get(pluginId) ?? [];
    queue.push({ channel, payload });
    this.pushQueues.set(pluginId, queue);

    // 触发冲刷（防重入——同一插件已在冲刷中则跳过）
    this.flushPushQueue(pluginId);
  }

  /**
   * 冲刷插件的推送队列——保证顺序：前一个 send 完成后再发下一个。
   * Electron webContents.send() 本身是同步的（消息入队到 IO 线程），
   * 但队列串行化防止 JS 侧回调乱序——如果多个 send 密集发送，
   * 渲染进程的 ipcRenderer.on 回调可能交错。
   */
  private flushPushQueue(pluginId: string): void {
    if (this.flushing.has(pluginId)) return;
    this.flushing.add(pluginId);

    const queue = this.pushQueues.get(pluginId);
    if (!queue || queue.length === 0) {
      this.flushing.delete(pluginId);
      return;
    }

    const view = this.windowManager.getPluginView(pluginId);
    if (!view) {
      // WebView 在排队期间销毁了——清空队列
      this.pushQueues.delete(pluginId);
      this.flushing.delete(pluginId);
      return;
    }

    // 逐条发送——每个 send 内部是同步的，队列保证顺序
    try {
      while (queue.length > 0) {
        const event = queue.shift()!;
        view.webContents.send('plugin:push', {
          channel: event.channel,
          payload: event.payload,
        });
      }
    } finally {
      this.pushQueues.delete(pluginId);
      this.flushing.delete(pluginId);
    }
  }

  /** 清理所有待处理请求和推送队列——应用退出时调用 */
  dispose(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('[IpcBridge] 应用退出，请求取消'));
    }
    this.pendingRequests.clear();
    this.pushQueues.clear();
    this.flushing.clear();
  }
}
