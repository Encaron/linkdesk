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
  private pushQueues = new Map<string, Array<{ channel: string; payload: unknown; source?: string }>>();
  private flushing = new Set<string>();
  /** #72：每个插件的请求 Promise 链——保证 FIFO 串行处理 */
  private pluginRequestQueues = new Map<string, Promise<unknown>>();

  /** 需要从插件 WebView 代理到壳渲染进程的 channel（#26） */
  private static PROXY_CHANNELS = [
    'config:get',
    'config:set',
    'commands:execute',
    // E5#67：弹窗归一化——插件调壳的 ConfirmDialog
    'dialog:confirm',
    'dialog:alert',
    // E3a #31：插件管理——marketplace 数据路径 IPC 化
    'plugins:call',
  ];

  constructor(
    private mainWindow: BrowserWindow,
    private windowManager: WindowManager,
  ) {
    this.registerProxyHandlers();
    this.registerResponseListener();
    this.registerPushListener();
    this.registerBroadcastListener();
    this.registerPluginEmitListener();
    this.registerRequestToPluginListener();    // E5#62
    this.registerP2pListener();               // E5#65
  }

  /**
   * 为每个代理 channel 注册 ipcMain.handle()。
   * 插件 WebView 调用 ipcRenderer.invoke(channel, ...args) →
   * 主进程接收 → 转发给壳渲染进程 → 等待响应 → 返回给插件。
   */
  private registerProxyHandlers(): void {
    for (const channel of IpcBridge.PROXY_CHANNELS) {
      ipcMain.handle(channel, async (event, ...args: unknown[]) => {
        const requestId = `bridge-${++this.requestCounter}-${Date.now()}`;

        const doRequest = (): Promise<unknown> => {
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
        };

        // #72：同插件请求 FIFO 串行——后续请求等前面完成才执行
        const pluginId = this.windowManager.getPluginIdFromWebContents(event.sender);
        if (pluginId) {
          const prev = this.pluginRequestQueues.get(pluginId) ?? Promise.resolve();
          // prev 可能已拒绝——.catch() 确保链不断，错误隔离
          const current = prev
            .catch(() => {})
            .then(() => doRequest());
          this.pluginRequestQueues.set(pluginId, current);
          return current;
        }

        // 非插件来源（壳自身等）——直接执行，不走队列
        return doRequest();
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
      this.pushToPlugin(pluginId, channel, payload, "shell");
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
  pushToPlugin(pluginId: string, channel: string, payload: unknown, source?: string): void {
    const view = this.windowManager.getPluginView(pluginId);
    if (!view) {
      // 插件 WebView 不存在——可能已卸载或尚未创建，静默丢弃
      return;
    }

    // 入队
    const queue = this.pushQueues.get(pluginId) ?? [];
    queue.push({ channel, payload, source });
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
          source: event.source,
        });
      }
    } finally {
      this.pushQueues.delete(pluginId);
      this.flushing.delete(pluginId);
    }
  }

  // ═══════════════════════════════════════════════════════
  // E3j #77——插件间数据管道（插件 → 主进程 → 广播到所有插件 + 壳）
  // ═══════════════════════════════════════════════════════

  private registerPluginEmitListener(): void {
    ipcMain.on('plugin:emit', (event, { channel, payload }: {
      channel: string;
      payload: unknown;
    }) => {
      // E5#61b：解析事件来源——壳 emit 标 "shell"，插件 emit 标 pluginId
      const sourceId = event.sender === this.mainWindow.webContents
        ? "shell"
        : this.windowManager.getPluginIdFromWebContents(event.sender) ?? undefined;
      // 广播到所有插件 WebView（含自己——对标 CoreEvents 模式）
      this.broadcast(channel, payload, sourceId);
      // 也转发到壳渲染进程——壳侧 components 可订阅插件事件
      this.mainWindow.webContents.send('plugin:push', { channel, payload, source: sourceId });
    });
    console.log('[IpcBridge] 已注册 plugin:emit 插件间数据管道');
  }

  // ═══════════════════════════════════════════════════════
  // E3b #35 + E3c #40——广播推送（壳 → 所有插件 WebView）
  // ═══════════════════════════════════════════════════════

  /** 按 channel 存储最后一次广播——新 WebView 创建时重放 */
  private lastBroadcasts = new Map<string, unknown>();

  private registerBroadcastListener(): void {
    ipcMain.on('bridge:broadcast', (_event, { channel, payload }: {
      channel: string;
      payload: unknown;
    }) => {
      // 壳发起的广播——source 为 "shell"
      this.broadcast(channel, payload, "shell");
    });
    console.log('[IpcBridge] 已注册 bridge:broadcast 广播通道');
  }

  /** 广播事件到所有已注册的插件 WebView——并存储 payload 供新 WebView 重放 */
  broadcast(channel: string, payload: unknown, source?: string): void {
    this.lastBroadcasts.set(channel, payload);
    for (const pluginId of this.windowManager.getAllPluginIds()) {
      this.pushToPlugin(pluginId, channel, payload, source);
    }
  }

  /** 新 WebView 创建后重放所有已存储的广播状态（E3c #40） */
  replayToPlugin(pluginId: string): void {
    for (const [channel, payload] of this.lastBroadcasts) {
      this.pushToPlugin(pluginId, channel, payload);
    }
  }

  /**
   * #72：清空指定插件的请求队列——插件卸载时调用。
   * 队列中已入队的请求仍会完成（不中断进行中的请求），
   * 但后续新请求不再受旧链约束——新链从头开始。
   *
   * #73 调用点：WindowManager.destroyPluginView——WebView 销毁时自动清理。
   * 四条高风险路径覆盖：
   *   - 插件加载/卸载（plugins:call）→ #72 请求队列（PROXY_CHANNELS）
   *   - 主题切换（bridge:broadcast）      → #27 push 队列（pushToPlugin）
   *   - 语言切换（bridge:broadcast）      → #27 push 队列（pushToPlugin）
   *   - 生命周期事件（onWill/DidUninstall）→ shell 同步 Emitter，不经过 IPC
   */
  clearPluginQueue(pluginId: string): void {
    this.pluginRequestQueues.delete(pluginId);
  }

  // ═══════════════════════════════════════════════════════
  // E5#62——壳→插件请求-响应管道（bridge:request-to-plugin）
  // ═══════════════════════════════════════════════════════

  /** 壳→插件请求的待处理 Promise Map——requestId → { resolve, reject, timer } */
  private pendingPluginRequests = new Map<string, {
    resolve: (v: unknown) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  private registerRequestToPluginListener(): void {
    // 壳 invoke 入口
    ipcMain.handle('bridge:request-to-plugin', async (_event, pluginId: string, channel: string, payload: unknown) => {
      const view = this.windowManager.getPluginView(pluginId);
      if (!view) {
        throw new Error(`[IpcBridge] 插件 "${pluginId}" 未运行——无法发送请求`);
      }

      const requestId = `plugin-req-${++this.requestCounter}-${Date.now()}`;
      const result = await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingPluginRequests.delete(requestId);
          reject(new Error(`[IpcBridge] 插件 "${pluginId}" 请求超时 (10s)，channel="${channel}"`));
        }, 10000);
        this.pendingPluginRequests.set(requestId, { resolve, reject, timer });
        view.webContents.send('plugin:request', { requestId, channel, payload });
      });
      return result;
    });

    // 插件回复入口
    ipcMain.on('bridge:plugin-response', (_event, { requestId, result, error }: {
      requestId: string;
      result?: unknown;
      error?: string;
    }) => {
      const pending = this.pendingPluginRequests.get(requestId);
      if (!pending) return; // 已超时或已处理
      clearTimeout(pending.timer);
      this.pendingPluginRequests.delete(requestId);
      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(result);
      }
    });

    console.log('[IpcBridge] 已注册 bridge:request-to-plugin 壳→插件请求通道');
  }

  // ═══════════════════════════════════════════════════════
  // E5#65——p2p 插件→插件定向推流
  // ═══════════════════════════════════════════════════════

  private registerP2pListener(): void {
    ipcMain.on('p2p:send', (event, { target, channel, data }: {
      target: string; channel: string; data: unknown;
    }) => {
      const targetView = this.windowManager.getPluginView(target);
      if (!targetView) return;
      const sourceId = this.windowManager.getPluginIdFromWebContents(event.sender) ?? "unknown";
      // 和 bridge:broadcast → broadcast() 完全一致——裸 webContents.send('plugin:push')
      targetView.webContents.send('plugin:push', { channel, payload: data, source: sourceId });
      console.log(`[p2p] ${sourceId} → ${target}  channel="${channel}"`);
    });
    console.log('[IpcBridge] 已注册 p2p:send 插件间定向推流通道');
  }

  /** 清理所有待处理请求和推送队列——应用退出时调用 */
  dispose(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('[IpcBridge] 应用退出，请求取消'));
    }
    this.pendingRequests.clear();
    for (const [id, pending] of this.pendingPluginRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('[IpcBridge] 应用退出，请求取消'));
    }
    this.pendingPluginRequests.clear();
    this.pushQueues.clear();
    this.flushing.clear();
    this.pluginRequestQueues.clear();
  }
}
