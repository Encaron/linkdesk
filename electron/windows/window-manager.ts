/**
 * WindowManager——E5.7 极简Pool：唯一 Pool WebContentsView 生命周期管理
 *
 * E5.7#4：单 WCV 满窗 100%×100%——创建/销毁/重建（崩溃恢复）+ bounds 跟随 + 布局推流。
 * #39 单 Pool 内存压力采样。E5.7#41（Phase 10）：per-tab 多实例集群整删——
 * pluginViews Map / 保活宽限期 / rekey 等 E5.5#9 时代代码随插件 WebView 消亡。
 * 安全靠 preload 沙箱，不靠进程数。
 */

import { BrowserWindow, WebContentsView, WebContents, app, nativeTheme } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { DEV_SERVER_URL } from '../constants.js'; // E5.6#5：Pool URL 构建（E5.7#45.5：shared/ 并入 constants.ts）
import { attachKeyboardRouting } from './keyboard-router.js'; // E5.7 快捷键路由：池 WCV 挂载（工厂处——含 rebuildPool 覆盖）
import { cacheLayoutSnapshot } from './crash-recovery.js'; // E5.7#36：崩溃恢复快照——pushLayout 中转处缓存
import type { IpcBridge } from '../ipc/ipc-bridge.js'; // 类型引用——无运行时环（ipc-bridge 反向同是 type-only）
import { IPC } from '../ipc/channels.js';
import type { CreatePoolWindowRequest } from '../../src/core/types/ipc/poolActions'; // E5.8#43-1（A4）多窗口底座 wire 契约

/** RSS 超过 1GB 时触发内存压力警告（MemoryInfo.workingSetSize 单位是 KB） */
const MEMORY_PRESSURE_THRESHOLD = 1024 * 1024; // 1GB = 1,048,576 KB
const MEMORY_CHECK_INTERVAL = 30_000; // 每 30s 采样一次

/**
 * E5.8#43-1（A2）：一个 Pool 窗口的注册条目——窗口层哑，只登记窗口/视图 + resize 解绑。
 * windowId 由壳侧声明（主池='main'，脱出窗壳自生成 id）——主进程不知「脱出」概念。
 */
interface PoolWindowEntry {
  windowId: string;
  hostWindow: BrowserWindow;
  view: WebContentsView;
  /** 该窗 resize 跟随解绑函数——destroyPoolWindow 时成对清理（防监听泄漏） */
  unbindResize: () => void;
}

export class WindowManager {
  private memoryTimer: ReturnType<typeof setInterval> | null = null;
  private ipcBridge: IpcBridge | null = null;

  // ── E5.8#43-1（A2）：多窗口注册表——通用登记/枚举（主池='main'；脱出窗口由壳生成 id 传入）──
  private poolWindows = new Map<string, PoolWindowEntry>();

  constructor(private mainWindow: BrowserWindow) {
    this.startMemoryMonitoring();
    // E5.7#12.5：Pool bounds 换主——主进程跟随窗口 resize 满窗（壳不再推流）。
    // E5.8#43-1（A2）：resize 跟随移入 registerPool（每窗各自挂载）——rebuildPool 销毁重建不重复注册。
  }

  /** E3c #40：setter——IpcBridge 晚于 WindowManager 创建（池 did-finish-load 重放广播用） */
  setIpcBridge(bridge: IpcBridge): void {
    this.ipcBridge = bridge;
  }

  /**
   * E5.7#39：每 30s 采样池渲染进程内存（单 Pool 版——原多 WebView PID 集合在 E5.7 恒空，监控失效）。
   * app.getAppMetrics() + PID 匹配——Electron 43 的 getProcessMemoryInfo()
   * 在 Process 上（Node 进程自身），不在 WebContents 上。
   *
   * Working Set > 1GB → 通知壳渲染进程 → toast 服务 → 池 ToastHost 哑渲染（#16 桥）。
   */
  checkMemoryPressure(): void {
    const poolView = this.getPoolView();
    if (!poolView || poolView.webContents.isDestroyed()) return;
    let poolPid = 0;
    try {
      poolPid = poolView.webContents.getOSProcessId();
    } catch {
      return; // 池视图存在但渲染进程尚未生成——下次采样再试
    }

    const metric = app.getAppMetrics().find((m) => m.pid === poolPid);
    if (!metric) return;

    const totalRSS = metric.memory.workingSetSize;
    if (totalRSS > MEMORY_PRESSURE_THRESHOLD) {
      console.warn(`[WindowManager] 内存压力——Pool 渲染进程 Working Set: ${(totalRSS / 1024).toFixed(0)} MB`);
      // 通知壳渲染进程显示 toast
      this.mainWindow.webContents.send(IPC.system.memoryPressure, {
        totalRSS,
        threshold: MEMORY_PRESSURE_THRESHOLD,
      });
    }
  }

  /** 启动周期性内存监控（构造函数中自动调用） */
  private startMemoryMonitoring(): void {
    this.memoryTimer = setInterval(() => {
      this.checkMemoryPressure();
    }, MEMORY_CHECK_INTERVAL);
  }

  // ═══════════════════════════════════════════════════════════════
  // E5.6#5 → E5.7#4：单Pool管理——极简Pool 唯一 WebContentsView
  // ═══════════════════════════════════════════════════════════════

  /**
   * 创建 Pool WebContentsView——pool.html 无 ?zone= 路由（E5.7#2 单入口）。
   * E5.8#43-1（A1）：参数化宿主窗口——多窗口底座第一步，去 mainWindow 硬编码。
   * 主池传 this.mainWindow；未来脱出窗池传脱出 BrowserWindow（view 挂其 contentView + resize 跟随）。
   */
  private createPoolView(hostWindow: BrowserWindow, windowId: string, debugLabel: string): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        // E5.8#0d.8-2 回归修复：preload-pool 留根，window-manager 已入 windows/——__dirname 变化后需 ../ 回根。
        // （#0d.8-2 教训：path.join(__dirname,...) 字符串引用同样受__dirname 变化影响——"preload 字符串引用零改动"假设错了，补入档案 §8.3）
        preload: path.join(__dirname, '../preload-pool.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    view.webContents.on('console-message', (_event: unknown, level: number, message: string, line: number, sourceId: string) => {
      const tag = `[pool:${debugLabel}]`;
      if (level >= 3) console.error(`${tag} ${message}`);
      else console.log(`${tag} ${message}`);
      // E5.7#86 诊断：池渲染进程 console 也写 protocol-debug.log——与壳 [renderer] 同文件。
      // 此前池侧只打主进程终端——安装版 F12 禁用，池侧错误永远落不了盘（调试缺口）。
      try {
        const logFile = path.join(app.getPath('userData'), 'protocol-debug.log');
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] [pool] ${message}\n`);
      } catch { /* ignore */ }
    });

    view.webContents.on('render-process-gone', (_event, details) => {
      console.error(`[WindowManager] Pool "${debugLabel}" 崩溃:`, details.reason);
    });

    view.webContents.on('did-fail-load', (_event: unknown, errorCode: number, errorDescription: string, validatedURL: string) => {
      console.error(`[WindowManager] Pool "${debugLabel}" 加载失败: ${errorDescription} (code ${errorCode}) URL=${validatedURL}`);
    });

    // 外部关闭（非 destroyPoolWindow 主动调用）→ 注册表摘除条目（幂等：destroyPoolWindow 已删则 no-op）
    view.webContents.on('destroyed', () => {
      const entry = this.poolWindows.get(windowId);
      if (entry?.view === view) this.poolWindows.delete(windowId);
    });

    // E5.7 键盘路由：before-input-event 挂池 WCV——焦点永远在池上，壳 keydown 收不到全局快捷键
    // （Ctrl+Shift+P 等全灭）。工厂处挂载 = 初始创建 + rebuildPool 崩溃恢复全覆盖
    // （E5.5#7 只挂了插件 WebView——极简Pool 时代池是唯一视图）。
    // E5.8#43-1：恒指 this.mainWindow（壳窗口）——命中快捷键转发给壳执行；脱出窗池的输入同样发主窗壳（壳=唯一真相源），不随 hostWindow 变。
    attachKeyboardRouting(view, this.mainWindow);

    // E5.6#14-fix：Pool 加载完成后回放初始广播状态（theme:changed/lang:changed/accent:changed 等）
    // 对标 per-tab 时代的 replayToPlugin（E5.7#43 已删）——池创建晚于初始广播，需补发。
    view.webContents.on('did-finish-load', () => {
      if (this.ipcBridge?.replayToPool) {
        this.ipcBridge.replayToPool(view);
      }
    });

    // dev 走 Vite dev server（loadURL），prod 走打包产物（loadFile——避免手动构造 file:// URL 的路径分隔符问题）
    if (!app.isPackaged) {
      view.webContents.loadURL(`${DEV_SERVER_URL}/pool.html`);
    } else {
      // E5.8#0d.8-2 回归修复：window-manager 入 windows/ 后 __dirname 少一层——../../dist 变 dist-electron/dist（生产黑屏）。
      // 三级 .. 回根：windows → electron → dist-electron → 根 → dist/pool.html。dev 走 loadURL（137 行）不受影响。
      view.webContents.loadFile(path.join(__dirname, '../../../dist/pool.html'));
    }

    view.setVisible(false);
    // E5.6#10：Pool 背景色跟随主题——防止空内容时显示白色闪烁
    // nativeTheme.shouldUseDarkColors 反映当前实际主题（受 main.ts theme:changed IPC 更新）
    // E5.8#6.6 hex 豁免：WebContentsView 背景色（OS 层 setBackgroundColor，CSS 变量不可达）
    // eslint-disable-next-line linkdesk/no-hardcoded-hex
    view.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f5f5f5');
    // E5.8#43-1（A1）：挂载到宿主窗口 contentView（主池=mainWindow，脱出窗池=脱出窗口）
    hostWindow.contentView.addChildView(view);

    console.log(`[WindowManager] Pool "${debugLabel}" WebContentsView 已创建`);
    return view;
  }

  /**
   * 注册一个 Pool 窗口到注册表——创建视图 + 挂 resize 跟随 + 满窗 + 可见。
   * E5.8#43-1（A2）：createMainPool 与未来脱出窗创建共用此入口（通用登记，无「脱出」概念）。
   */
  private registerPool(hostWindow: BrowserWindow, windowId: string, debugLabel: string): WebContentsView {
    const view = this.createPoolView(hostWindow, windowId, debugLabel);
    // E5.7#12.5：创建即满窗接管——bounds 由主进程算（窗口内容区），不再等壳推流。
    // E5.8#43-1（A2）：resize 跟随每窗各自挂载——rebuildPool 销毁重建后重建条目自带监听。
    const onHostResize = () => this.syncPoolBounds(windowId);
    hostWindow.on('resize', onHostResize);
    this.poolWindows.set(windowId, {
      windowId,
      hostWindow,
      view,
      unbindResize: () => hostWindow.removeListener('resize', onHostResize),
    });
    this.syncPoolBounds(windowId);
    view.setVisible(true);
    return view;
  }

  /** E5.6#5c → E5.7#4：创建主窗口的 Pool WebContentsView */
  createMainPool(): WebContentsView {
    const existing = this.poolWindows.get('main');
    if (existing) {
      console.warn('[WindowManager] MainPool 已存在，返回已有 view');
      return existing.view;
    }
    return this.registerPool(this.mainWindow, 'main', 'pool');
  }

  /** E5.7#12.5：某 Pool 窗口满窗零偏移——bounds 换主进程，默认主池。resize 跟随按 windowId 定向。 */
  private syncPoolBounds = (windowId = 'main'): void => {
    const entry = this.poolWindows.get(windowId);
    if (!entry || entry.view.webContents.isDestroyed()) return;
    const { width, height } = entry.hostWindow.getContentBounds();
    entry.view.setBounds({ x: 0, y: 0, width, height });
  };

  /** E5.6#5e → E5.7#4：销毁主窗口 Pool WebContentsView（兼容入口——壳崩重建/退出用） */
  destroyPool(): void {
    this.destroyPoolWindow('main');
  }

  /** E5.8#43-1（A2）：销毁指定 Pool 窗口——视图摘除 + resize 解绑 + 注册表摘除（主进程不知「脱出」，通用销毁） */
  destroyPoolWindow(windowId: string): void {
    const entry = this.poolWindows.get(windowId);
    if (!entry) return;

    try {
      entry.hostWindow.contentView.removeChildView(entry.view);
    } catch (err) {
      console.error(`[WindowManager] 移除 Pool 失败:`, err);
    }

    entry.view.webContents.close();
    entry.unbindResize();
    this.poolWindows.delete(windowId);
    console.log(`[WindowManager] Pool "${windowId}" 已销毁`);
  }

  /** E5.8#43-1（A4）：壳侧主动关闭的窗口集合——closed 事件里跳过 notifyShellWindowClosed（壳已知道，防冗余通知） */
  private shellClosingWindows = new Set<string>();

  /**
   * 创建脱出池窗——壳驱动（壳生成 windowId + bounds，tab 归属归壳），主进程只执行窗口+池生命周期。
   * detach 核心 API 的窗口侧；纯工作区窗口（拍板 7：frame:false + 池内自绘标题栏），无原生 chrome/菜单栏。
   * tab 内容由壳 pushLayout 定向到该 windowId（#43-2 接线）。
   */
  createPoolWindow(opts: CreatePoolWindowRequest): WebContentsView {
    const win = new BrowserWindow({
      width: opts.width ?? 900,
      height: opts.height ?? 600,
      x: opts.x,
      y: opts.y,
      minWidth: 480,
      minHeight: 320,
      frame: false, // E5.8 拍板 7：自绘标题栏——脱出窗纯工作区窗口
      // E5.8#6.6 hex 豁免：OS 层窗口背景色（渲染进程 CSS 变量不可达；防池加载前白闪）
      // eslint-disable-next-line linkdesk/no-hardcoded-hex
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f5f5f5',
      show: false, // ready-to-show 后再显示，避免白屏闪烁
      title: 'LinkDesk',
    });
    win.once('ready-to-show', () => {
      if (!win.isDestroyed()) win.show();
    });
    // OS 关闭（用户点 × / 系统关窗）→ 通知壳按窗口策略处理 tab（空窗自灭/关窗×语义归壳决策）
    win.on('closed', () => {
      if (this.shellClosingWindows.has(opts.windowId)) {
        this.shellClosingWindows.delete(opts.windowId);
        return;
      }
      this.notifyShellWindowClosed(opts.windowId);
    });
    return this.registerPool(win, opts.windowId, `detached:${opts.windowId}`);
  }

  /** E5.8#43-1（A4）：关闭脱出池窗——壳侧主动调用（空窗自灭/并回主窗口销毁）。attach 核心 API 的窗口侧。 */
  closePoolWindow(windowId: string): void {
    const entry = this.poolWindows.get(windowId);
    if (!entry) return;
    this.shellClosingWindows.add(windowId);
    const win = entry.hostWindow;
    this.destroyPoolWindow(windowId);
    if (!win.isDestroyed()) win.destroy();
  }

  /** E5.8#43-1（A4）：通知壳某池窗被 OS 关闭——主进程只报窗口事实，tab 处理策略归壳（#43-2 窗口模式策略表消费） */
  private notifyShellWindowClosed(windowId: string): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC.pool.windowClosed, { windowId });
    }
  }

  /** E5.6#5f → E5.7#4：重建 Pool——destroy → create（设计 §9.2 崩溃恢复用） */
  rebuildPool(): WebContentsView {
    this.destroyPool();
    return this.createMainPool();
  }

  /** E5.8#43-1（A2）：取指定 Pool 窗口条目（已销毁则告警 + undefined）——哑渲染通道守卫咽喉。send 通道仍各方法字面量直发（E5.7#63.6 通道审计）。 */
  private getPoolEntry(windowId: string, label: string): PoolWindowEntry | undefined {
    const entry = this.poolWindows.get(windowId);
    if (!entry || entry.view.webContents.isDestroyed()) {
      console.warn(`[WindowManager] ${label} 失败——Pool "${windowId}" 不存在或已销毁`);
      return undefined;
    }
    return entry;
  }

  /** E5.6#5g → E5.7#4：推送布局协议——按 windowId 定向（默认主池）。 */
  pushLayout(layout: unknown, windowId = 'main'): void {
    // E5.7#36：缓存布局快照——Pool 崩溃后主进程不依赖壳即时响应即可回放。
    // E5.8#43-1（A2）：仅主池布局写快照——脱出池布局不得污染主池崩溃重放（壳崩恢复只回放主窗）。
    if (windowId === 'main') cacheLayoutSnapshot(layout);
    const entry = this.getPoolEntry(windowId, 'pushLayout');
    if (!entry) return;
    // E5.8#43-2（B2）：窗口标题随活动 tab——title 由壳 windowTitleFor 计算进 layout.titleBar.title
    //（壳侧策略单真相源），此处同步到 OS 层窗口标题（主窗原生标题栏 + 脱出窗任务栏）。布局 wire
    // 载荷为 unknown——安全窄化读 titleBar.title，非必要不改（title 恒存在：壳恒推 titleBar）。
    const title = (layout as { titleBar?: { title?: string } })?.titleBar?.title;
    if (title && entry.hostWindow.getTitle() !== title) {
      entry.hostWindow.setTitle(title);
    }
    entry.view.webContents.send(IPC.pool.layout, layout);
  }

  /** E5.7#15：推送 QuickPick 哑渲染数据——壳序列化 DTO，池 QuickPickHost 纯渲染（按 windowId 定向，默认主池） */
  pushQuickPick(data: unknown, windowId = 'main'): void {
    const entry = this.getPoolEntry(windowId, 'pushQuickPick');
    if (!entry) return;
    entry.view.webContents.send(IPC.pool.quickpick, data);
  }

  /** E5.7#16：推送 Toast 哑渲染数据——壳 toast 服务序列化 DTO，池 ToastHost 纯渲染（按 windowId 定向，默认主池） */
  pushToast(data: unknown, windowId = 'main'): void {
    const entry = this.getPoolEntry(windowId, 'pushToast');
    if (!entry) return;
    entry.view.webContents.send(IPC.pool.toast, data);
  }

  /** E5.7#17：推送 Dialog 哑渲染数据——壳 DialogService 桥序列化 DTO，池 DialogHost 纯渲染（按 windowId 定向，默认主池） */
  pushDialog(data: unknown, windowId = 'main'): void {
    const entry = this.getPoolEntry(windowId, 'pushDialog');
    if (!entry) return;
    entry.view.webContents.send(IPC.pool.dialog, data);
  }

  /** E5.8#37（Phase 8 类型 B）：推送悬浮面板哑渲染数据——壳 FloatingPanelService 桥序列化 DTO，池 FloatingPanelHost 纯渲染（按 windowId 定向，默认主池） */
  pushFloatingPanel(data: unknown, windowId = 'main'): void {
    const entry = this.getPoolEntry(windowId, 'pushFloatingPanel');
    if (!entry) return;
    entry.view.webContents.send(IPC.pool.floatingPanel, data);
  }

  /** E5.6#5h → E5.7#4：取主窗口 Pool WebContentsView（窗口控制/缩放/崩溃恢复兼容入口——主池专用） */
  getPoolView(): WebContentsView | null {
    return this.poolWindows.get('main')?.view ?? null;
  }

  /** E5.6#10f：返回全部 Pool WebContentsView（广播/重放/主题背景/发送者判定用）——多窗口通用 */
  getAllPoolViews(): WebContentsView[] {
    return [...this.poolWindows.values()]
      .filter((e) => !e.view.webContents.isDestroyed())
      .map((e) => e.view);
  }

  /** E5.8#43-1（A3）：按发送者 webContents 反查 windowId——池 IPC 的 sender 校验/就绪路由用（非池来源返回 null） */
  getWindowIdByWebContents(wc: WebContents): string | null {
    for (const [windowId, entry] of this.poolWindows) {
      if (entry.view.webContents === wc) return windowId;
    }
    return null;
  }

  /**
   * 销毁全部 Pool 窗口 + 停止监控——应用退出/壳崩重建时调用。
   * E5.8#43-1（A2）：清空注册表全部条目（主池 resize 解绑随 destroyPoolWindow 成对清理）。
   */
  dispose(): void {
    if (this.memoryTimer) {
      clearInterval(this.memoryTimer);
      this.memoryTimer = null;
    }
    for (const windowId of [...this.poolWindows.keys()]) {
      this.destroyPoolWindow(windowId);
    }
  }

}
