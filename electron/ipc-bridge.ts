/**
 * IpcBridge——插件 WebView ↔ 壳渲染进程的 IPC 中继
 *
 * E3a #26：插件 → 壳（请求-响应）——config:get/set、commands:execute
 * E3a #27：壳 → 插件（事件推送）——串口数据、配置变更等推到插件 WebView
 * E5.5#9d：pluginId→instanceId——pushToPlugin/requestToPlugin/replayToPlugin 全链路适配。
 *         pluginRequestQueues/pushQueues/flushing 全部以 instanceId 为 key。
 *         getPluginIdFromWebContents 返回结构变更（{ pluginId, instanceId }）。
 *         broadcast 遍历所有 instance。clearPluginQueues(pluginId) 清同插件所有实例。
 *
 * 双向流程：
 *   请求：插件 → ipcMain.handle → mainWindow.webContents.send → 壳 preload →
 *         IpcBridgeHandler（React）→ 壳 preload → ipcMain.on → 返回插件
 *   推送：壳 → ipcMain.on('bridge:pushToPlugin') → pluginView.webContents.send →
 *         插件 preload → 插件 React 回调
 */

import { BrowserWindow, ipcMain, WebContentsView } from 'electron';
import type { WindowManager } from './window-manager.js';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  channel: string;
  args: unknown[];
}

export class IpcBridge {
  /**
   * E5.7#36：ipcMain 通道全局唯一——壳崩重建时 new IpcBridge 会再次注册。
   * 换实例模式：新实例构造时先摘旧实例监听器再挂自己的（旧闭包捕获旧窗口，
   * 不摘 = 全桥流量走已销毁窗口）。ipcMain.on 监听器提为实例箭头字段以支持 removeListener 摘除。
   */
  private static _active: IpcBridge | null = null;

  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;
  /** #27：每个实例的待推送事件队列——保证顺序交付（key=instanceId） */
  private pushQueues = new Map<string, Array<{ channel: string; payload: unknown; source?: string }>>();
  private flushing = new Set<string>();
  /** #72：每个实例的请求 Promise 链——保证 FIFO 串行处理（key=instanceId） */
  private pluginRequestQueues = new Map<string, Promise<unknown>>();

  /** 需要从插件 WebView 代理到壳渲染进程的 channel（#26） */
  private static PROXY_CHANNELS = [
    'config:get',
    'config:set',
    'commands:execute',
    // E5#67：弹窗归一化——插件调壳的 ConfirmDialog
    'dialog:confirm',
    'dialog:alert',
    // E5#68：标签页操作——插件调壳的标签页 API
    'tabs:create',
    'tabs:openOrFocus',
    'tabs:focus',
    'tabs:close',
    'tabs:focusBySourceId',
    'tabs:updateLabelBySourceId',
    'tabs:closeBySourceId',
    // E5#70：ContextKey——插件 SET 状态供壳 when 子句读
    'contextKey:set',
    // E5#69：菜单——插件声明式读写
    'menu:registerItems',
    'menu:getItems',
    // E5#71：插件持久化存储——集中缓存 + 文件持久化
    'pluginState:get',
    'pluginState:set',
    // E3a #31：插件管理——marketplace 数据路径 IPC 化
    'plugins:call',
    // E5#85：workspace——插件查询工作区信息
    'workspace:getFolders',
    'workspace:getActive',
    // E5.6#11.5-A：扩展 workspace + fileAssociation + decorations——池插件完整工作区操作
    'workspace:setActive',
    'workspace:openFolder',
    'workspace:addFolder',
    'workspace:removeFolder',
    'fileAssociation:getPluginFor',
    'decorations:getDecoration',
    // E5.6#11.5g5：文件搜索 + 编码检测——池插件跨进程使用 FileSearcher/EncodingService
    'search:searchFiles',
    'encoding:detect',
    'encoding:decode',
    'encoding:encode',
  ];

  constructor(
    private mainWindow: BrowserWindow,
    private windowManager: WindowManager,
  ) {
    // E5.7#36：换实例——先摘旧实例的 ipcMain 监听，再挂自己的（见类头注释）
    IpcBridge._active?.unregisterIpc();
    IpcBridge._active = this;

    this.registerProxyHandlers();
    ipcMain.on('bridge:response', this.onBridgeResponse);
    console.log('[IpcBridge] 已注册 bridge:response 壳响应通道');
    ipcMain.on('bridge:pushToPlugin', this.onBridgePushToPlugin);
    console.log('[IpcBridge] 已注册 bridge:pushToPlugin 事件推送通道');
    // 配置变更通知——SettingsView 直调 setConfigurationValue 绕过 proxy 时走此通道
    ipcMain.on('config:changed-notify', this.onConfigChangedNotify);
    ipcMain.on('bridge:broadcast', this.onBridgeBroadcast);
    console.log('[IpcBridge] 已注册 bridge:broadcast 广播通道');
    ipcMain.on('plugin:emit', this.onPluginEmit);
    console.log('[IpcBridge] 已注册 plugin:emit 插件间数据管道');
    this.registerRequestToPluginListener();    // E5#62
    ipcMain.on('p2p:send', this.onP2pSend);    // E5#65
    console.log('[IpcBridge] 已注册 p2p:send 插件间定向推流通道');
  }

  /** E5.7#36：摘除本实例注册的全部 ipcMain 通道——新实例构造时对旧实例调用 */
  private unregisterIpc(): void {
    for (const channel of IpcBridge.PROXY_CHANNELS) {
      ipcMain.removeHandler(channel);
    }
    ipcMain.removeHandler('bridge:request-to-plugin');
    ipcMain.removeListener('bridge:response', this.onBridgeResponse);
    ipcMain.removeListener('bridge:pushToPlugin', this.onBridgePushToPlugin);
    ipcMain.removeListener('config:changed-notify', this.onConfigChangedNotify);
    ipcMain.removeListener('bridge:broadcast', this.onBridgeBroadcast);
    ipcMain.removeListener('plugin:emit', this.onPluginEmit);
    ipcMain.removeListener('bridge:plugin-response', this.onBridgePluginResponse);
    ipcMain.removeListener('p2p:send', this.onP2pSend);
  }

  /** 配置变更通知——SettingsView 直调 setConfigurationValue 绕过 proxy 时走此通道 */
  private onConfigChangedNotify = (_event: Electron.IpcMainEvent, { key, value }: { key: string; value: unknown }) => {
    this.mainWindow.webContents.send('config:changed', { key, value });
    this.broadcast('config:changed', { key, value });
  };

  /**
   * 为每个代理 channel 注册 ipcMain.handle()。
   * 插件 WebView 调用 ipcRenderer.invoke(channel, ...args) →
   * 主进程接收 → 转发给壳渲染进程 → 等待响应 → 返回给插件。
   */
  private registerProxyHandlers(): void {
    for (const channel of IpcBridge.PROXY_CHANNELS) {
      ipcMain.handle(channel, async (event, ...args: unknown[]) => {
        // ── E5#19b fix: contextKey:set → 立即广播到所有渲染进程（多 WebView 火种）──
        if (channel === 'contextKey:set') {
          const [key, value] = args as [string, unknown];
          this.mainWindow.webContents.send('contextKey:changed', { key, value });
          this.broadcast('contextKey:changed', { key, value });
        }

        const requestId = `bridge-${++this.requestCounter}-${Date.now()}`;

        const doRequest = (): Promise<unknown> => {
          return new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(() => {
              this.pendingRequests.delete(requestId);
              reject(new Error(`[IpcBridge] 请求超时: ${channel} (requestId=${requestId})`));
            }, 10_000);

            this.pendingRequests.set(requestId, { resolve, reject, timer, channel, args });

            this.mainWindow.webContents.send('bridge:request', {
              requestId,
              channel,
              args,
            });
          });
        };

        // #72：同实例请求 FIFO 串行——后续请求等前面完成才执行
        const info = this.windowManager.getPluginIdFromWebContents(event.sender);
        if (info) {
          const { instanceId } = info;
          const prev = this.pluginRequestQueues.get(instanceId) ?? Promise.resolve();
          // prev 可能已拒绝——.catch() 确保链不断，错误隔离
          const current = prev
            .catch(() => {}) // 错误隔离——prev 可能已拒绝，重置以确保链不断
            .then(() => doRequest());
          this.pluginRequestQueues.set(instanceId, current);
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
  private onBridgeResponse = (_event: Electron.IpcMainEvent, { requestId, result, error }: {
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
      // config:set 成功后广播 config:changed——shell + 所有插件 WebView 的 onChange 依赖此通道
      if (pending.channel === 'config:set') {
        const [key, value] = pending.args as [string, unknown];
        this.mainWindow.webContents.send('config:changed', { key, value });
        this.broadcast('config:changed', { key, value });
      }
    }
  };

  // ═══════════════════════════════════════════════════════
  // E3a #27——事件推送（壳 → 插件 WebView）
  // ═══════════════════════════════════════════════════════

  /**
   * 壳渲染进程通过 IPC 推送事件到指定插件 WebView。
   * 壳侧调用：ipcRenderer.send('bridge:pushToPlugin', {instanceId, channel, payload})
   */
  private onBridgePushToPlugin = (_event: Electron.IpcMainEvent, { instanceId, channel, payload }: {
    instanceId: string;
    channel: string;
    payload: unknown;
  }) => {
    this.pushToPlugin(instanceId, channel, payload, "shell");
  };

  /**
   * 推送事件到指定实例 WebView。
   * 主进程服务（serial-service 等）可以直接调用此方法，
   * 壳渲染进程通过 bridge:pushToPlugin IPC 间接调用。
   *
   * 使用队列串行化——同一实例的多个推送严格按序交付，
   * 防止 JS 事件乱序（对标主线程单线程语义）。
   */
  pushToPlugin(instanceId: string, channel: string, payload: unknown, source?: string): void {
    const view = this.windowManager.getPluginView(instanceId);
    if (!view) {
      // 实例 WebView 不存在——可能已销毁或尚未创建，静默丢弃
      return;
    }

    // 入队
    const queue = this.pushQueues.get(instanceId) ?? [];
    queue.push({ channel, payload, source });
    this.pushQueues.set(instanceId, queue);

    // 触发冲刷（防重入——同一实例已在冲刷中则跳过）
    this.flushPushQueue(instanceId);
  }

  /**
   * 冲刷实例的推送队列——保证顺序：前一个 send 完成后再发下一个。
   * Electron webContents.send() 本身是同步的（消息入队到 IO 线程），
   * 但队列串行化防止 JS 侧回调乱序——如果多个 send 密集发送，
   * 渲染进程的 ipcRenderer.on 回调可能交错。
   */
  private flushPushQueue(instanceId: string): void {
    if (this.flushing.has(instanceId)) return;
    this.flushing.add(instanceId);

    const queue = this.pushQueues.get(instanceId);
    if (!queue || queue.length === 0) {
      this.flushing.delete(instanceId);
      return;
    }

    const view = this.windowManager.getPluginView(instanceId);
    if (!view) {
      // WebView 在排队期间销毁了——清空队列
      this.pushQueues.delete(instanceId);
      this.flushing.delete(instanceId);
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
      this.pushQueues.delete(instanceId);
      this.flushing.delete(instanceId);
    }
  }

  // ═══════════════════════════════════════════════════════
  // E3j #77——插件间数据管道（插件 → 主进程 → 广播到所有插件 + 壳）
  // ═══════════════════════════════════════════════════════

  private onPluginEmit = (event: Electron.IpcMainEvent, { channel, payload }: {
    channel: string;
    payload: unknown;
  }) => {
    // E5#61b：解析事件来源——壳 emit 标 "shell"，插件 emit 标 pluginId
    const sourceId = event.sender === this.mainWindow.webContents
      ? "shell"
      : this.windowManager.getPluginIdFromWebContents(event.sender)?.pluginId ?? undefined;
    // 广播到所有插件 WebView（含自己——对标 CoreEvents 模式）
    this.broadcast(channel, payload, sourceId);
    // 也转发到壳渲染进程——壳侧 components 可订阅插件事件
    this.mainWindow.webContents.send('plugin:push', { channel, payload, source: sourceId });
  };

  // ═══════════════════════════════════════════════════════
  // E3b #35 + E3c #40——广播推送（壳 → 所有插件 WebView）
  // ═══════════════════════════════════════════════════════

  /** 按 channel 存储最后一次广播——新 WebView 创建时重放 */
  private lastBroadcasts = new Map<string, unknown>();

  private onBridgeBroadcast = (_event: Electron.IpcMainEvent, { channel, payload }: {
    channel: string;
    payload: unknown;
  }) => {
    // 壳发起的广播——source 为 "shell"
    this.broadcast(channel, payload, "shell");
    // E5.6#2：Pool 模型——壳 WebView 内插件需接收广播事件（theme:changed 等）
    // 对标 registerPluginEmitListener 的双路径模式
    this.mainWindow.webContents.send('plugin:push', { channel, payload, source: "shell" });
  };

  /** 广播事件到所有已注册的实例 WebView + Pool WebContentsView——并存储 payload 供新 WebView 重放 */
  broadcast(channel: string, payload: unknown, source?: string): void {
    this.lastBroadcasts.set(channel, payload);
    // E5#74e debug：绕过 pushToPlugin 队列——直发 webContents.send
    for (const instanceId of this.windowManager.getAllInstanceIds()) {
      const view = this.windowManager.getPluginView(instanceId);
      if (view) view.webContents.send('plugin:push', { channel, payload, source });
    }
    // E5.6#10f：Pool WebContentsView 也需要接收广播（lang:changed / theme:changed 等）
    for (const poolView of this.windowManager.getAllPoolViews()) {
      if (!poolView.webContents.isDestroyed()) {
        poolView.webContents.send('plugin:push', { channel, payload, source });
      }
    }
  }

  /** 新 WebView 创建后重放所有已存储的广播状态（E3c #40） */
  replayToPlugin(instanceId: string): void {
    for (const [channel, payload] of this.lastBroadcasts) {
      this.pushToPlugin(instanceId, channel, payload);
    }
  }

  /** E5.6#14-fix：Pool 创建后重放初始广播状态——theme/language/accent 等 */
  replayToPool(poolView: WebContentsView): void {
    for (const [channel, payload] of this.lastBroadcasts) {
      poolView.webContents.send('plugin:push', { channel, payload, source: 'shell' });
    }
  }

  /**
   * E5.5#9d：清空指定实例的请求队列——单 instance 销毁时调用。
   */
  clearPluginQueue(instanceId: string): void {
    this.pluginRequestQueues.delete(instanceId);
  }

  /**
   * E5.5#9d：清空指定插件的所有实例请求队列——插件卸载时调用。
   * 遍历 getInstanceIdsForPlugin 一次性清空同 pluginId 全部 instance 的队列。
   */
  clearPluginQueues(pluginId: string): void {
    const instanceIds = this.windowManager.getInstanceIdsForPlugin(pluginId);
    for (const iid of instanceIds) {
      this.pluginRequestQueues.delete(iid);
    }
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
    // 壳 invoke 入口（handle 按通道名摘除——removeHandler 无需函数引用，保留内联闭包）
    ipcMain.handle('bridge:request-to-plugin', async (_event, instanceId: string, channel: string, payload: unknown) => {
      const view = this.windowManager.getPluginView(instanceId);
      if (!view) {
        throw new Error(`[IpcBridge] instance "${instanceId}" 未运行——无法发送请求`);
      }

      const requestId = `plugin-req-${++this.requestCounter}-${Date.now()}`;
      const result = await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingPluginRequests.delete(requestId);
          reject(new Error(`[IpcBridge] instance "${instanceId}" 请求超时 (10s)，channel="${channel}"`));
        }, 10000);
        this.pendingPluginRequests.set(requestId, { resolve, reject, timer });
        view.webContents.send('plugin:request', { requestId, channel, payload });
      });
      return result;
    });

    ipcMain.on('bridge:plugin-response', this.onBridgePluginResponse);

    console.log('[IpcBridge] 已注册 bridge:request-to-plugin 壳→插件请求通道');
  }

  /** 插件回复入口 */
  private onBridgePluginResponse = (_event: Electron.IpcMainEvent, { requestId, result, error }: {
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
  };

  // ═══════════════════════════════════════════════════════
  // E5#65——p2p 插件→插件定向推流
  // ═══════════════════════════════════════════════════════

  private onP2pSend = (event: Electron.IpcMainEvent, { target, channel, data }: {
    target: string; channel: string; data: unknown;
  }) => {
    const targetView = this.windowManager.getPluginView(target);
    if (!targetView) return;
    const sourceId = this.windowManager.getPluginIdFromWebContents(event.sender)?.pluginId ?? "unknown";
    // 原始路径：targetView.webContents.send('plugin:push', { channel, payload: data, source: sourceId });
    targetView.webContents.send('p2p:data', { channel, data, source: sourceId });
    console.log(`[p2p] ${sourceId} → ${target}  channel="${channel}"`);
  };

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
