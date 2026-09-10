/**
 * IpcBridge——池渲染进程（插件）↔ 壳渲染进程的 IPC 中继
 *
 * E3a #26：插件 → 壳（请求-响应）——config:get/set、commands:execute
 * E3a #27（E5.7#43 重写）：壳 → 插件（事件推送）——broadcast 单 Pool webContents.send 直发
 * E5.7#43（Phase 10）：per-tab 多实例集群已删——pushToPlugin/requestToPlugin 的
 *         instanceId 链路、pushQueues/pluginRequestQueues 队列、E5#62 壳→插件请求管道
 *         全数移除（池侧无 plugin:request 接收——invokeBeforeClose 否决回路随 #43 停用，
 *         恢复需未来池侧 requests 命名空间任务）。
 *
 * 双向流程：
 *   请求：池 → ipcMain.handle → mainWindow.webContents.send → 壳 preload →
 *         IpcBridgeHandler（React）→ 壳 preload → ipcMain.on → 返回池
 *   推送：壳 → ipcMain.on(IPC.bridge.broadcast) → 唯一 Pool webContents.send →
 *         池 preload → 池内插件 React 回调
 */

import { BrowserWindow, ipcMain, WebContentsView } from 'electron';
import type { WindowManager } from '../windows/window-manager.js';
import { IPC } from './channels.js';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  /** 请求超时定时器——**用户阻塞通道为 null**（见 USER_BLOCKING_CHANNELS，E6#74） */
  timer: ReturnType<typeof setTimeout> | null;
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

  /** E5.8#6.5：数据推流 handler（serial/lsp/file）取活动实例走 broadcast——壳崩重建自动换实例（active 恒指最新） */
  static get active(): IpcBridge | null {
    return IpcBridge._active;
  }

  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;

  /** 用户阻塞通道——壳侧 handler 的语义就是「**等用户回答**」，回答耗时天生无期（思考 / 走开 / 接电话）。
   *  这些通道**不设请求超时**：超时 = 池侧 Promise 先 reject、而对话框还在屏幕上，用户之后点按钮
   *  结算的是一个**死请求** → 静默不装（E6#74，E6#71k 实机验证抓到：卡停 >10s 再点「确认安装」毫无反应）。
   *  未决请求的兜底不靠超时，靠既有 `dispose()` 两处调用点（应用退出 main.ts / 壳崩重建 rebuildShell）。 */
  private static USER_BLOCKING_CHANNELS = new Set<string>([
    IPC.dialog.confirm,
    IPC.dialog.alert,
    IPC.dialog.confirmContent,
  ]);

  /** 长任务调用——`plugins:call` 是单通道多方法（args[0] = 方法名），安装/更新族一次调用要跑
   *  下载→解压→加载，**耗时时长由网络与包大小决定**，10 秒墙钟与它毫无关系。
   *
   *  E6#73e 机器一：此前它们吃 10s 桥超时 ⇒ **装插件超 10 秒必判失败，而它其实还在装**（池侧 reject、
   *  壳侧继续跑完）——用户「试五六次才成功一次」的根，且 404 与超时被归成同一句「网络不可用」。
   *  修法 = 判据落回操作自身：下载已有**空闲超时 + 重试预算**（`plugin-download.ts`），
   *  job 级 `AbortController` 与槽级看门狗随后（E6#73q）。**取消走 job 句柄，不走这条计时器**。
   *
   *  ⚠️ 与设计原话「桥超时后取消安装」的差异（主动偏离，理由在此）：保留一个有限阈值再在它上面挂取消，
   *  只是把同一类误判换个门槛复活（E6#74 已立此论）；且真正的取消必须能命中**具体哪一个 job**，
   *  而这条计时器只知道 channel、不知道 job。⇒ 超时职责下沉到下载层，取消职责下沉到 job（73q）。
   *  未决请求的兜底仍靠既有两处 `dispose()`（应用退出 / 壳崩重建），行为同 USER_BLOCKING_CHANNELS。 */
  private static LONG_RUNNING_PLUGIN_CALLS = new Set<string>([
    "install",
    "installWithProgress",
    "reinstall",
    "update",
  ]);

  /** 该请求是否不设超时——用户阻塞通道（等用户回答）∨ 长任务安装调用（等网络/磁盘） */
  private static hasNoRequestTimeout(channel: string, args: unknown[]): boolean {
    if (IpcBridge.USER_BLOCKING_CHANNELS.has(channel)) return true;
    return channel === IPC.plugins.call && IpcBridge.LONG_RUNNING_PLUGIN_CALLS.has(String(args[0]));
  }

  /** 需要从插件 WebView 代理到壳渲染进程的 channel（#26） */
  private static PROXY_CHANNELS = [
    IPC.config.get,
    IPC.config.set,
    IPC.commands.execute,
    // E5.7 Bug C：池执行回传——壳→池占位命令转发的结果通道（resolvePoolExecution）
    IPC.commands.executeResult,
    // E5.7 Bug C 补全：池侧命令元数据同步——registerCommand 的 title/category/when 回传壳注册表
    IPC.commands.register,
    // E5.7#56：壳侧插件入口模块级注册（双进程执行的壳侧半程）——壳 preload 经主进程回壳
    IPC.commands.registerShell,
    IPC.commands.unregister,
    // E5#67：弹窗归一化——插件调壳的 ConfirmDialog
    IPC.dialog.confirm,
    IPC.dialog.alert,
    // E6#71c：富内容确认——插件自绘确认内容（同链代理到壳 DialogService.confirmContent）
    IPC.dialog.confirmContent,
    // E5#68：标签页操作——插件调壳的标签页 API
    IPC.tabs.create,
    IPC.tabs.openOrFocus,
    IPC.tabs.focus,
    IPC.tabs.close,
    IPC.tabs.focusBySourceId,
    IPC.tabs.updateLabelBySourceId,
    IPC.tabs.closeBySourceId,
    // E5#70：ContextKey——插件 SET 状态供壳 when 子句读
    IPC.contextKey.set,
    // E5#69：菜单——插件声明式读写
    IPC.menu.registerItems,
    IPC.menu.getItems,
    // E5#71：插件持久化存储——集中缓存 + 文件持久化
    IPC.pluginState.get,
    IPC.pluginState.set,
    // E3a #31：插件管理——marketplace 数据路径 IPC 化
    IPC.plugins.call,
    // E5#85：workspace——插件查询工作区信息
    IPC.workspace.getFolders,
    IPC.workspace.getActive,
    // E5.6#11.5-A：扩展 workspace——池插件完整工作区操作
    // （fileAssociation:getPluginFor 已随 E5.7#50 移 registry-handlers 主进程直答——不再代理到壳；
    //  decorations:getDecoration 已随 E5.7#60 整删——注册表池内化，池内直答零 IPC）
    IPC.workspace.setActive,
    IPC.workspace.openFolder,
    IPC.workspace.addFolder,
    IPC.workspace.removeFolder,
    // E5.6#11.5g5：文件搜索 + 编码检测——池插件跨进程使用 FileSearcher/EncodingService
    IPC.search.searchFiles,
    IPC.encoding.detect,
    IPC.encoding.decode,
    IPC.encoding.encode,
    // E5.7#58：viewContainer——池插件查询/更新壳侧视图注册表（render 等函数字段池侧 preload 已白名单剥壳）
    IPC.viewContainer.getContainer,
    IPC.viewContainer.getViews,
    IPC.viewContainer.getView,
    IPC.viewContainer.registerView,
    // E5.8#34.5：panel——插件调壳聚焦底部面板视图（IpcBridgeHandler/panel 域消费）
    IPC.panel.reveal,
    // E5.8#39.5：panel.revealFloating——悬浮面板声明制通用 API（同链代理；IpcBridgeHandler/panel 域消费）
    IPC.panel.revealFloating,
  ];

  constructor(
    private mainWindow: BrowserWindow,
    private windowManager: WindowManager,
  ) {
    // E5.7#36：换实例——先摘旧实例的 ipcMain 监听，再挂自己的（见类头注释）
    IpcBridge._active?.unregisterIpc();
    IpcBridge._active = this;

    this.registerProxyHandlers();
    ipcMain.on(IPC.bridge.response, this.onBridgeResponse);
    console.log('[IpcBridge] 已注册 bridge:response 壳响应通道');
    // 配置变更通知——SettingsView 直调 setConfigurationValue 绕过 proxy 时走此通道
    ipcMain.on(IPC.config.changedNotify, this.onConfigChangedNotify);
    ipcMain.on(IPC.bridge.broadcast, this.onBridgeBroadcast);
    console.log('[IpcBridge] 已注册 bridge:broadcast 广播通道');
    ipcMain.on(IPC.plugin.emit, this.onPluginEmit);
    console.log('[IpcBridge] 已注册 plugin:emit 插件间数据管道');
    ipcMain.on(IPC.p2p.send, this.onP2pSend);    // E5#65
    console.log('[IpcBridge] 已注册 p2p:send 插件间定向推流通道');
  }

  /** E5.7#36：摘除本实例注册的全部 ipcMain 通道——新实例构造时对旧实例调用 */
  private unregisterIpc(): void {
    for (const channel of IpcBridge.PROXY_CHANNELS) {
      ipcMain.removeHandler(channel);
    }
    ipcMain.removeListener(IPC.bridge.response, this.onBridgeResponse);
    ipcMain.removeListener(IPC.config.changedNotify, this.onConfigChangedNotify);
    ipcMain.removeListener(IPC.bridge.broadcast, this.onBridgeBroadcast);
    ipcMain.removeListener(IPC.plugin.emit, this.onPluginEmit);
    ipcMain.removeListener(IPC.p2p.send, this.onP2pSend);
  }

  /** 配置变更通知——SettingsView 直调 setConfigurationValue 绕过 proxy 时走此通道 */
  private onConfigChangedNotify = (_event: Electron.IpcMainEvent, { key, value }: { key: string; value: unknown }) => {
    this.mainWindow.webContents.send(IPC.config.changed, { key, value });
    this.broadcast(IPC.config.changed, { key, value });
  };

  /**
   * 为每个代理 channel 注册 ipcMain.handle()。
   * 插件 WebView 调用 ipcRenderer.invoke(channel, ...args) →
   * 主进程接收 → 转发给壳渲染进程 → 等待响应 → 返回给插件。
   */
  private registerProxyHandlers(): void {
    // E5.7#75：注册门诊断（E5.5#10p/E5.6#64 迁入）——原稿"收到的 invoke 不在 PROXY_CHANNELS
    // → 静默 undefined"前提已过期：E5.7 按通道独立 ipcMain.handle，登记即门。漏登记的两侧后果均
    // 非静默——池 invoke 未登记通道 → Electron "No handler registered" 拒绝（调用方可见）；
    // 已登记但壳 IpcBridgeHandler switch 无 case → 壳抛"未知的 bridge channel"（调用方可见）。
    // 本自检堵最后一个静默面：重复登记在 ipcMain.handle 处只抛原生 "second handler" 错，
    // 先在入口给出可定位错误（加新 API 方法的复制粘贴漂移场景）。
    const seen = new Set<string>();
    for (const channel of IpcBridge.PROXY_CHANNELS) {
      if (seen.has(channel)) {
        throw new Error(`[IpcBridge] PROXY_CHANNELS 重复登记代理通道: ${channel}`);
      }
      seen.add(channel);
    }

    for (const channel of IpcBridge.PROXY_CHANNELS) {
      ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
        // ── E5#19b fix: contextKey:set → 立即广播到壳 + 池（双渲染进程火种）──
        if (channel === IPC.contextKey.set) {
          const [key, value] = args as [string, unknown];
          this.mainWindow.webContents.send(IPC.contextKey.changed, { key, value });
          this.broadcast(IPC.contextKey.changed, { key, value });
        }

        // ── E5.8#43-4（①）：commands:register/executeResult/unregister 载荷加 sender windowId ──
        // 池 preload 不知自身 windowId（同就绪流 IPC.pool.ready），主进程 sender→windowId 是唯一权威映射
        // （getWindowIdByWebContents）。壳 CommandRegistry 归属表（命令→窗口集合）据此登记路由，
        // executeResult 回执校验据此验窗口——插件零改动（注入发生在主进程边界）。
        let forwardedArgs = args;
        if (
          channel === IPC.commands.register
          || channel === IPC.commands.executeResult
          || channel === IPC.commands.unregister
        ) {
          const windowId = this.windowManager.getWindowIdByWebContents(_event.sender) ?? 'main';
          forwardedArgs = [...args, windowId];
        }

        const requestId = `bridge-${++this.requestCounter}-${Date.now()}`;

        // E5.8#46.12：信封来源窗盖章——池→壳每一请求自带来源窗身份（#43-4 同款 sender 反查）。
        // 壳按此路由按窗操作（sourceId 族落到来源窗注册表）——窗口身份丢失类同根归一化。
        const sourceWindowId = this.windowManager.getWindowIdByWebContents(_event.sender) ?? 'main';

        const doRequest = (): Promise<unknown> => {
          return new Promise<unknown>((resolve, reject) => {
            // E6#74 / E6#73e：用户阻塞通道与长任务安装调用不设超时（见 hasNoRequestTimeout）——其余维持 10s 防壳无应答
            const timer = IpcBridge.hasNoRequestTimeout(channel, forwardedArgs)
              ? null
              : setTimeout(() => {
                  this.pendingRequests.delete(requestId);
                  reject(new Error(`[IpcBridge] 请求超时: ${channel} (requestId=${requestId})`));
                }, 10_000);

            this.pendingRequests.set(requestId, { resolve, reject, timer, channel, args: forwardedArgs });

            this.mainWindow.webContents.send(IPC.bridge.request, {
              requestId,
              channel,
              args: forwardedArgs,
              sourceWindowId,
            });
          });
        };

        // E5.7#43：per-tab 实例 FIFO 队列删除——唯一 Pool 来源直接执行。
        // （E5.5 时代 getPluginIdFromWebContents 对池 sender 恒返回 undefined，
        //  队列从未生效；多实例并发语义随插件 WebView 消亡不再需要。）
        return doRequest();
      });
    }

    console.log(`[IpcBridge] 已注册 ${IpcBridge.PROXY_CHANNELS.length} 个代理 channel: ${IpcBridge.PROXY_CHANNELS.join(', ')}`);
  }

  /**
   * 监听壳渲染进程的响应——壳侧 IpcBridgeHandler 处理后通过
   * ipcRenderer.send(IPC.bridge.response, ...) 发回。
   */
  private onBridgeResponse = (_event: Electron.IpcMainEvent, { requestId, result, error }: {
    requestId: string;
    result?: unknown;
    error?: string;
  }) => {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;

    if (pending.timer) clearTimeout(pending.timer);
    this.pendingRequests.delete(requestId);

    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
      // config:set 成功后广播 config:changed——shell + 所有插件 WebView 的 onChange 依赖此通道
      if (pending.channel === IPC.config.set) {
        const [key, value] = pending.args as [string, unknown];
        this.mainWindow.webContents.send(IPC.config.changed, { key, value });
        this.broadcast(IPC.config.changed, { key, value });
      }
    }
  };

  // ═══════════════════════════════════════════════════════
  // E3j #77——插件间数据管道（插件 → 主进程 → 广播到池 + 壳）
  // ═══════════════════════════════════════════════════════

  private onPluginEmit = (event: Electron.IpcMainEvent, { channel, payload }: {
    channel: string;
    payload: unknown;
  }) => {
    // E5#61b + E5.7#43：解析事件来源——壳 emit 标 "shell"，池 emit 标 "pool"
    const sourceId = event.sender === this.mainWindow.webContents ? "shell" : "pool";
    // ── E5.8#43-4（②）：commands:executeRequest 定向发目标窗口池 ──
    // 壳 CommandRegistry 归属表路由已把目标窗口算进载荷 targetWindowId——broadcast 按窗口过滤池视图，
    // 不再全池广播（否则模式 B：同命令双窗口注册 → 双池都执行 → 副作用双跑）。
    // storeForReplay=false：命令执行是命令式请求非幂等状态——新池创建不得重放过期 executeRequest
    //（否则开新窗触发陈旧命令双执行；对标 #6.5 流数据不复播同理由）。
    if (channel === "commands:executeRequest") {
      const target = (payload as { targetWindowId?: string })?.targetWindowId;
      this.broadcast(channel, payload, sourceId, false, target);
      return;
    }
    // E5.8#6.5：broadcast 已归一化为发壳+发池——壳侧补发行随 #6.5 删除（原 234 行手动 plugin:push）
    // 广播到唯一 Pool WebView + 壳（含自己——对标 CoreEvents 模式）
    this.broadcast(channel, payload, sourceId);
  };

  // ═══════════════════════════════════════════════════════
  // E3b #35 + E3c #40 → E5.7#43——广播推送（壳 → 唯一 Pool）
  // ═══════════════════════════════════════════════════════

  /** 按 channel 存储最后一次广播——新 WebView 创建时重放 */
  private lastBroadcasts = new Map<string, unknown>();

  private onBridgeBroadcast = (_event: Electron.IpcMainEvent, { channel, payload }: {
    channel: string;
    payload: unknown;
  }) => {
    // 壳发起的广播——source 为 "shell"（E5.8#6.5：broadcast 内部发壳，原 251 行手动补发已删）
    this.broadcast(channel, payload, "shell");
  };

  /** E5.7#43 + E5.8#6.5：广播事件到壳 + 唯一 Pool WebContentsView（plugin:push 包装）——
   *  数据推流唯一路径：serial/lsp/file 推送一律走本方法；壳/池双侧 events.on 订阅。
   *  默认存储 payload 供新池重放（E3c #40 状态重放——config/theme/lang/contextKey 等幂等快照）；
   *  #6.5-regress-2：流数据（serial.*、lsp:data、filesystem:changed:&lt;watcherId&gt;）传 storeForReplay=false
   *  ——#6.5 前直发从不重放，误入 lastBroadcasts 后 watcherId 动态通道 Map 永久涨 + 新池收到陈旧流数据。
   *  onPluginEmit/onBridgeBroadcast 的壳补发行随 #6.5 归一化进本方法——不再任何地方手动双发。 */
  broadcast(channel: string, payload: unknown, source?: string, storeForReplay = true, targetWindowId?: string): void {
    if (storeForReplay) {
      this.lastBroadcasts.set(channel, payload);
    }
    // 壳渲染进程（plugin:push）——壳侧 events.on 订阅（E5.6#2 双路径归一化进 broadcast）
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC.plugin.push, { channel, payload, source });
    }
    // E5.8#43-4（②）：targetWindowId 指定 → 只发目标窗口池（executeRequest 定向发——命令作用于该窗口上下文）；
    // 未指定 → 全池广播（常态：theme/lang/config 等全局事件）。壳侧恒发（executeRequest 壳无订阅，无害一致）。
    if (targetWindowId) {
      const targetView = this.windowManager.getPoolViewByWindowId(targetWindowId);
      if (targetView && !targetView.webContents.isDestroyed()) {
        targetView.webContents.send(IPC.plugin.push, { channel, payload, source });
      }
      return;
    }
    // 唯一 Pool WebContentsView（plugin:push）——lang:changed / theme:changed / serial.* 等
    for (const poolView of this.windowManager.getAllPoolViews()) {
      if (!poolView.webContents.isDestroyed()) {
        poolView.webContents.send(IPC.plugin.push, { channel, payload, source });
      }
    }
  }

  /** E5.6#14-fix：Pool 创建后重放初始广播状态——theme/language/accent 等 */
  replayToPool(poolView: WebContentsView): void {
    for (const [channel, payload] of this.lastBroadcasts) {
      poolView.webContents.send(IPC.plugin.push, { channel, payload, source: 'shell' });
    }
  }

  // ═══════════════════════════════════════════════════════
  // E5#65——p2p 插件→插件定向推流
  // ═══════════════════════════════════════════════════════

  private onP2pSend = (_event: Electron.IpcMainEvent, { target, channel, data }: {
    target: string; channel: string; data: unknown;
  }) => {
    // E5.7#43：target 路由删除——唯一接收方是池（per-tab 实例 WebView 已不存在）
    const poolView = this.windowManager.getPoolView();
    if (!poolView || poolView.webContents.isDestroyed()) return;
    poolView.webContents.send(IPC.p2p.data, { channel, data, source: 'pool' });
    console.log(`[p2p] pool → ${target}  channel="${channel}"`);
  };

  /** 清理所有待处理请求——应用退出时调用（E5.7#43：推送/请求队列随 per-tab 集群删除） */
  dispose(): void {
    for (const [, pending] of this.pendingRequests) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new Error('[IpcBridge] 应用退出，请求取消'));
    }
    this.pendingRequests.clear();
  }
}
