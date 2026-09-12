/**
 * WindowManager——E5.7 极简Pool：唯一 Pool WebContentsView 生命周期管理
 *
 * E5.7#4：单 WCV 满窗 100%×100%——创建/销毁/重建（崩溃恢复）+ bounds 跟随 + 布局推流。
 * #39 单 Pool 内存压力采样。E5.7#41（Phase 10）：per-tab 多实例集群整删——
 * pluginViews Map / 保活宽限期 / rekey 等 E5.5#9 时代代码随插件 WebView 消亡。
 * 安全靠 preload 沙箱，不靠进程数。
 */

import { BrowserWindow, WebContentsView, WebContents, app, nativeTheme, screen } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { DEV_SERVER_URL } from '../constants.js'; // E5.6#5：Pool URL 构建（E5.7#45.5：shared/ 并入 constants.ts）
import { attachKeyboardRouting } from './keyboard-router.js'; // E5.7 快捷键路由：池 WCV 挂载（工厂处——含 rebuildPool 覆盖）
import { resolveFocusedWindowId } from './focus-router.js'; // E5.8#46.12 Step2：聚焦池窗解析（纯函数，单测独立）
import { cacheLayoutSnapshot } from './crash-recovery.js'; // E5.7#36：崩溃恢复快照——pushLayout 中转处缓存
import type { IpcBridge } from '../ipc/ipc-bridge.js'; // 类型引用——无运行时环（ipc-bridge 反向同是 type-only）
import { IPC } from '../ipc/channels.js';
import type { CreatePoolWindowRequest } from '../../src/core/types/ipc/poolActions'; // E5.8#43-1（A4）多窗口底座 wire 契约

// E6#73g（18 档 §五 G 配套 / B2）：阈值 + 回落水位 + 上升沿判据整段抽到纯函数模块
// （`memory-pressure-latch.ts`）——状态机在边界上最容易写反，抽出去才能穷举单测。
import { MEMORY_PRESSURE_THRESHOLD, memoryPressureLatch } from './memory-pressure-latch.js';

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

/** 窗口最小可见宽度/高度——越界钳制时保证窗口在屏幕可视区内至少露出这么多（I9-14） */
const MIN_VISIBLE_EDGE = 80;

/**
 * E5.8#43-3：越界钳制（I9-14）——窗口起点移出屏幕可视区 → 拉回最近屏 workArea 边缘。
 * 多屏：getDisplayMatching 取与 bounds 相交最多的显示器，宽高收窄到该屏 workArea 内，
 * 起点钳到 [workArea 左缘 + MIN_VISIBLE - width, 右缘 - MIN_VISIBLE] 区间——窗口至少 MIN_VISIBLE 可见。
 * 纯函数（仅依赖 electron.screen）——app ready 后调用（createPoolWindow 由壳驱动，安全）。
 * 非 export——纯内部工具（createPoolWindow 越界钳制一处消费），无外部消费面即不留死 export（knip 门禁）。
 */
function clampToWorkArea(bounds: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
  if (screen.getAllDisplays().length === 0) return bounds;
  const display = screen.getDisplayMatching({
    x: bounds.x,
    y: bounds.y,
    width: Math.max(bounds.width, 1),
    height: Math.max(bounds.height, 1),
  });
  const wa = display.workArea;
  const width = Math.min(bounds.width, wa.width);
  const height = Math.min(bounds.height, wa.height);
  // width ≤ wa.width 保证 x 区间非空（MIN_VISIBLE ≤ width + wa.width - MIN_VISIBLE 恒真）
  const x = Math.min(Math.max(bounds.x, wa.x + MIN_VISIBLE_EDGE - width), wa.x + wa.width - MIN_VISIBLE_EDGE);
  const y = Math.min(Math.max(bounds.y, wa.y), wa.y + wa.height - MIN_VISIBLE_EDGE);
  return { x, y, width, height };
}

export class WindowManager {
  private memoryTimer: ReturnType<typeof setInterval> | null = null;
  /** E6#73g：内存压力的上升沿闩——true = 已发过、还没回落到 MEMORY_PRESSURE_RESET 以下 */
  private memoryPressureLatched = false;
  private ipcBridge: IpcBridge | null = null;

  // ── E5.8#43-1（A2）：多窗口注册表——通用登记/枚举（主池='main'；脱出窗口由壳生成 id 传入）──
  private poolWindows = new Map<string, PoolWindowEntry>();

  // E5.8#46.12 Step2：当前聚焦池窗——registerPool 每窗 focus 事件更新。
  // 壳→池 UI 推流（QuickPick/Toast/Dialog/FloatingPanel）默认聚焦窗：用户在哪个窗触发，壳 UI 显示在哪个窗
  // （脱出窗 Ctrl+Shift+P 命令面板、Ctrl+W dirty 确认弹窗归位）。null = 尚无聚焦事件 → 回退主池（getFocusedWindowId）。
  private _focusedWindowId: string | null = null;

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
   * Working Set > 1GB → 通知壳渲染进程 → 通知服务 pushToast → 铃铛宽通知面板
   * （E6#72：右下窄卡链路已整删，通知统一走 store → 宽面板）。
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
    // E6#73g：上升沿单发（判据见 memory-pressure-latch.ts）——越过阈值发一次，
    // 回落到 0.9×阈值以下才解锁下一发。此前每轮都发 ⇒ 面板每 30 秒被弹一次。
    const next = memoryPressureLatch(this.memoryPressureLatched, totalRSS);
    this.memoryPressureLatched = next.latched;
    if (next.emit) {
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

    // E6#37e（2026-09-12）：改用新签名——⚠️ **这不是纯外观清理，是行为改动**。
    //   旧签名把 level 当**数字**（Blink 的 kVerbose=0 / kInfo=1 / kWarning=2 / kError=3），
    //   故旧代码写 `level >= 3` 判错误。新签名里 level 是**字符串**
    //   （`'debug' | 'info' | 'warning' | 'error'`，见 electron.d.ts 的
    //   `WebContentsConsoleMessageEventParams`）——**沿用 `level >= 3` 会恒为 false**
    //   （'error' 转数字是 NaN，NaN >= 3 为假）⇒ **池侧真错误全部静默降级成普通 log**，
    //   即「失败不出声」。故此处按**等价映射**改写：旧数字 3（kError）↔ 新字符串 'error'，
    //   0/1/2 ↔ 'debug'/'info'/'warning' 仍走 log。**改这里前先看清单 #37e 判据②**。
    view.webContents.on('console-message', (event) => {
      const tag = `[pool:${debugLabel}]`;
      if (event.level === 'error') console.error(`${tag} ${event.message}`);
      else console.log(`${tag} ${event.message}`);
      // E5.7#86 诊断：池渲染进程 console 也写 protocol-debug.log——与壳 [renderer] 同文件。
      // 此前池侧只打主进程终端——安装版 F12 禁用，池侧错误永远落不了盘（调试缺口）。
      try {
        const logFile = path.join(app.getPath('userData'), 'protocol-debug.log');
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] [pool] ${event.message}\n`);
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
    attachKeyboardRouting(view, this.mainWindow, windowId);

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
    // E5.8#46.5 修复：moved/resized → 壳 bounds 上报——归一化收拢到共用创建路径（主池/脱出池同源）。
    // 此前仅脱出窗在 createPoolWindow 挂载 → 主窗移动后壳注册表 bounds 冻结在启动值，跨窗命中检测
    // 对旧位置算 → 拖入主窗=新窗根因（用户移动主窗即复现；脱出窗有上报故恒新鲜）。moved/resized =
    // 完成事件（Windows/macOS，用户操作后触发一次）；初始 clamp 发生在监听挂载前，不触发自上报。
    const reportBounds = () => this.notifyShellWindowBoundsChanged(windowId);
    hostWindow.on('moved', reportBounds);
    hostWindow.on('resized', reportBounds);
    // E5.8#46.12 Step2：聚焦窗跟踪——主/脱出池共用创建路径统一挂载，用户聚焦哪个窗，
    // 壳 UI 推流（pushQuickPick/pushDialog/pushFloatingPanel）默认落该窗。
    const onFocus = () => { this._focusedWindowId = windowId; };
    hostWindow.on('focus', onFocus);
    // E5.8#46.18：宿主窗 OS 置顶状态 → 该窗池 WCV 推 alwaysOnTopChange（TitleBarZone pin 按钮两态跟随）。
    // registerPool = 主/脱出/漂移三窗共用创建路径——三窗统一覆盖（#46.16 只补 createPoolWindow 只覆盖脱出窗的教训：
    // 新监听挂共用路径，任何新窗口类型自动继承）。
    const onAlwaysOnTopChanged = (_e: Electron.Event, isAlwaysOnTop: boolean) =>
      this.sendPoolAlwaysOnTopChange(windowId, isAlwaysOnTop);
    hostWindow.on('always-on-top-changed', onAlwaysOnTopChanged);

    // E6#70d：页内 `<video>` HTML 全屏桥（池 = WebContentsView child，宿主窗 frameless 自绘标题栏只懂最大化）。
    // 实机根因：元素全屏在池渲染进程提交后，Electron 默认把宿主窗拉进原生全屏但 WCV bounds 不随动 →
    // 视频 :fullscreen 只盖旧视口（「整窗全屏、视频没变」），且帧窗无原生「退出全屏」入口 + □ 对全屏态是
    // maximize() no-op → 用户被困。桥 = 四条监听 + 进入侧 settle 重落（全在 verify 实证）：
    //  · enter/leave-full-screen（宿主窗层，原生全屏进出都发）→ 重铺池 bounds 到 contentBounds
    //    （全屏态 contentBounds=整屏，元素 :fullscreen 即盖满；退出态随窗缩回）。实测原生全屏切换会重建
    //    视图 surface，renderer 视口正确跟缩（unmaximize 还原不重建则是另一既有缺陷，非本路径）。
    //  · pool enter/leave-html-full-screen（webContents 层）→ 兜底把宿主窗带进/带出原生全屏（守卫幂等）：
    //    Electron 默认已进全屏则跳过；元素退出（Esc/⛶/exitFullscreen）时强制还原宿主窗——逃生口，防被困。
    //  · 进入侧 = 即时重铺 + settle 兜底：元素全屏请求 → Electron 默认先把宿主窗拉进原生全屏（实测
    //    enter-full-screen 先于 enter-html-full-screen 到）。池 bounds 须跟到 contentBounds（全屏态=整屏），
    //    视频 :fullscreen 才盖得满物理屏——即首铺一次（进全屏瞬间把池放大，让元素 :fullscreen 直接提交进
    //    已放大的视口，避免提交后再 resize 惹出重排），再在 ~450ms 后（晚于 Windows 全屏动画）settle 重落
    //    一次最终 bounds 兜底过渡竞态。实证（真实点击路径）首点即铺满、保持不回弹。
    //  · 退出侧（leave-full-screen/leave-html-full-screen）无 promote 竞争，可即时跟缩。
    const settleFullTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const settleFullBounds = () => {
      const t = settleFullTimers.get(windowId);
      if (t) clearTimeout(t);
      settleFullTimers.set(
        windowId,
        setTimeout(() => {
          settleFullTimers.delete(windowId);
          if (!hostWindow.isDestroyed()) this.syncPoolBounds(windowId);
        }, 450),
      );
    };
    const syncToContentBounds = () => setImmediate(() => this.syncPoolBounds(windowId));
    const onHostEnterFull = () => {
      syncToContentBounds();
      settleFullBounds();
    };
    const onHostLeaveFull = () => syncToContentBounds();
    const onPoolEnterHtmlFull = () => {
      if (!hostWindow.isDestroyed() && !hostWindow.isFullScreen()) hostWindow.setFullScreen(true);
      syncToContentBounds();
      settleFullBounds();
    };
    const onPoolLeaveHtmlFull = () => {
      if (!hostWindow.isDestroyed() && hostWindow.isFullScreen()) hostWindow.setFullScreen(false);
      syncToContentBounds();
    };
    hostWindow.on('enter-full-screen', onHostEnterFull);
    hostWindow.on('leave-full-screen', onHostLeaveFull);
    view.webContents.on('enter-html-full-screen', onPoolEnterHtmlFull);
    view.webContents.on('leave-html-full-screen', onPoolLeaveHtmlFull);
    this.poolWindows.set(windowId, {
      windowId,
      hostWindow,
      view,
      unbindResize: () => {
        const t = settleFullTimers.get(windowId);
        if (t) clearTimeout(t);
        settleFullTimers.delete(windowId);
        hostWindow.removeListener('resize', onHostResize);
        hostWindow.removeListener('moved', reportBounds);
        hostWindow.removeListener('resized', reportBounds);
        hostWindow.removeListener('focus', onFocus);
        hostWindow.removeListener('always-on-top-changed', onAlwaysOnTopChanged);
        hostWindow.removeListener('enter-full-screen', onHostEnterFull);
        hostWindow.removeListener('leave-full-screen', onHostLeaveFull);
        view.webContents.removeListener('enter-html-full-screen', onPoolEnterHtmlFull);
        view.webContents.removeListener('leave-html-full-screen', onPoolLeaveHtmlFull);
      },
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

  /** E5.8#44 实机修复诊断：主进程关键路径写 protocol-debug.log（终端不可达时也能定位——与池 console-message 转发同文件） */
  private logToFile(msg: string): void {
    try {
      const logFile = path.join(app.getPath('userData'), 'protocol-debug.log');
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] [window-manager] ${msg}\n`);
    } catch { /* ignore */ }
  }

  /**
   * 创建脱出池窗——壳驱动（壳生成 windowId + bounds，tab 归属归壳），主进程只执行窗口+池生命周期。
   * detach 核心 API 的窗口侧；纯工作区窗口（拍板 7：frame:false + 池内自绘标题栏），无原生 chrome/菜单栏。
   * tab 内容由壳 pushLayout 定向到该 windowId（#43-2 接线）。
   */
  createPoolWindow(opts: CreatePoolWindowRequest): WebContentsView {
    // E5.8#43-3：幂等复用——F5 壳刷新后壳按持久化清单重建接管，窗口仍在 → 复用已有 view + 重发就绪
    //（壳 onReady 收到 → 标记该窗 ready → 定向推布局；窗口 bounds 保持当前实际值，不重设用户已移动位置）。
    const existing = this.poolWindows.get(opts.windowId);
    if (existing) {
      console.warn(`[WindowManager] 脱出池窗 "${opts.windowId}" 已存在——复用并重发就绪（壳刷新接管）`);
      this.sendShellPoolReady(opts.windowId);
      return existing.view;
    }
    // E5.8#43-3：越界钳制（I9-14）——持久化 bounds 可能因显示器拔掉/分辨率变化越界，拉回最近屏边缘
    const bounds = clampToWorkArea({
      x: opts.x ?? 200,
      y: opts.y ?? 120,
      width: opts.width ?? 900,
      height: opts.height ?? 600,
    });
    this.logToFile(`createPoolWindow → windowId=${opts.windowId} clamped=${JSON.stringify(bounds)}`);
    const win = new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
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
    // E5.8#46.16：脱出窗宿主窗最大化/还原 → 该窗池 WCV 推 maximizeChange（TitleBarZone □/还原按钮态跟随）。
    // main.ts createWindow（仅主窗）已挂 maximize/unmaximize 监听——脱出窗走本方法创建宿主窗，此前漏挂
    // → 池收不到状态（图标不变）且点 □ 恒走 maximize 分支（无法还原）。sendPoolMaximizeChange 按宿主窗反查天然覆盖本窗。
    win.on('maximize', () => this.sendPoolMaximizeChange(win, true));
    win.on('unmaximize', () => this.sendPoolMaximizeChange(win, false));
    // E5.8#46.5：moved/resized → 壳 bounds 上报已归一化收拢进 registerPool（主池/脱出池同源），此处不再重复挂载。
    const view = this.registerPool(win, opts.windowId, `detached:${opts.windowId}`);
    // E5.8#44 实机修复：WCV 宿主窗自身的 ready-to-show 不保证触发（宿主无页面加载，只挂 WCV）——
    // 显示时机改绑 WCV did-finish-load（内容就绪才亮，无白闪）+ 2s 兜底（WCV 加载失败/事件已过也不隐身）。
    view.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed() && !win.isVisible()) win.show();
    });
    setTimeout(() => {
      if (!win.isDestroyed() && !win.isVisible()) win.show();
    }, 2000);
    this.logToFile(`createPoolWindow → 已注册 view（windowId=${opts.windowId}），等待 did-finish-load 显示`);
    return view;
  }

  /** E5.8#43-3：主进程主动补发池窗就绪给壳——复用既有窗口时（壳刷新接管）壳需知道该窗已可推布局。
   *  就绪流的常态路径 = 池 WCV 发 IPC.pool.ready → 主进程按 sender 解析转壳；此处跳过池（窗口没重建），主进程直发壳。 */
  private sendShellPoolReady(windowId: string): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC.pool.ready, { windowId });
    }
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

  /** E5.8#44-B：壳侧主动请求某窗当前 bounds——pool:ready 时补推（主窗启动 bounds 壳未握，TabBar 命中检测需权威 bounds）。
   *  复用 notifyShellWindowBoundsChanged（同通道同载荷），仅公共化入口。 */
  pushWindowBounds(windowId: string): void {
    this.notifyShellWindowBoundsChanged(windowId);
  }

  /** E5.8#46.11：全量补推当前 bounds——壳每次加载（preloadReady）seed 用。壳 reload 后注册表 bounds 清空、
   *  池不随壳 reload 重发 pool:ready → 主进程主动播种；单窗幂等推送合并到 notifyShellWindowBoundsChanged 守卫内。 */
  pushAllWindowBounds(): void {
    for (const windowId of this.poolWindows.keys()) {
      this.notifyShellWindowBoundsChanged(windowId);
    }
  }

  /** E5.8#43-3（I9-14 A6）：上报池窗当前 bounds 给壳——moved/resized 完成事件触发，壳据 windowId 更新注册表 + 落盘浮窗位置 */
  private notifyShellWindowBoundsChanged(windowId: string): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    const entry = this.poolWindows.get(windowId);
    if (!entry || entry.hostWindow.isDestroyed()) return;
    const b = entry.hostWindow.getBounds();
    this.mainWindow.webContents.send(IPC.pool.windowBoundsChanged, {
      windowId,
      bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
    });
  }

  /** E5.6#5f → E5.7#4：重建 Pool——destroy → create（设计 §9.2 崩溃恢复用） */
  rebuildPool(): WebContentsView {
    this.destroyPool();
    return this.createMainPool();
  }

  /**
   * E5.8#46.12 Step2：当前聚焦池窗——壳→池 UI 推流默认目标（QuickPick/Toast/Dialog/FloatingPanel）。
   * 聚焦窗已销毁（用户关了该窗）→ 回退主池（防御——迟到推流不落空窗）。
   */
  getFocusedWindowId(): string {
    return resolveFocusedWindowId(this._focusedWindowId, new Set(this.poolWindows.keys()));
  }

  /** E5.8#43-1（A2）：取指定 Pool 窗口条目（已销毁则告警 + undefined）——哑渲染通道守卫咽喉。send 通道仍各方法字面量直发（E5.7#63.6 通道审计）。
   *  E5.8#46.12 回归加固：补 hostWindow.isDestroyed() 守卫（392/512 行同款）——WebContents 存活但宿主窗
   *  已销毁时 entry 仍残留 → pushLayout 的 getTitle()/setTitle() 抛 "Object has been destroyed"（实机崩溃 trace）。 */
  private getPoolEntry(windowId: string, label: string): PoolWindowEntry | undefined {
    const entry = this.poolWindows.get(windowId);
    if (!entry || entry.view.webContents.isDestroyed() || entry.hostWindow.isDestroyed()) {
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

  /**
   * E5.7#15：推送 QuickPick 哑渲染数据——壳序列化 DTO，池 QuickPickHost 纯渲染。
   * E5.8#46.12 Step2：windowId 默认聚焦窗——脱出窗触发（Ctrl+Shift+P 命令面板/插件 API）落触发窗，主窗/无聚焦落主池。
   */
  pushQuickPick(data: unknown, windowId = this.getFocusedWindowId()): void {
    const entry = this.getPoolEntry(windowId, 'pushQuickPick');
    if (!entry) return;
    entry.view.webContents.send(IPC.pool.quickpick, data);
  }

  /**
   * E5.7#17：推送 Dialog 哑渲染数据——壳 DialogService 桥序列化 DTO，池 DialogHost 纯渲染。
   * E5.8#46.12 Step2：windowId 默认聚焦窗——脱出窗 Ctrl+W dirty 确认等弹窗落触发窗，不再漏到主窗。
   */
  pushDialog(data: unknown, windowId = this.getFocusedWindowId()): void {
    const entry = this.getPoolEntry(windowId, 'pushDialog');
    if (!entry) return;
    entry.view.webContents.send(IPC.pool.dialog, data);
  }

  /**
   * E5.8#37（Phase 8 类型 B）：推送悬浮面板哑渲染数据——壳 FloatingPanelService 桥序列化 DTO，池 FloatingPanelHost 纯渲染。
   * E5.8#46.12 Step2：windowId 默认聚焦窗——面板浮层跟随触发窗。
   */
  pushFloatingPanel(data: unknown, windowId = this.getFocusedWindowId()): void {
    const entry = this.getPoolEntry(windowId, 'pushFloatingPanel');
    if (!entry) return;
    entry.view.webContents.send(IPC.pool.floatingPanel, data);
  }

  /** E5.8#44-C：推送吸附提示哑数据——壳窗口间拖拽吸附命中检测后的 TabBar 高亮/清除（按 windowId 定向，默认主池）。
   *  载荷 = { groupId: string | null }——null 清光目标窗高亮。壳命中检测排除了源窗，故同窗恒不触发。 */
  pushAdsorbHint(data: unknown, windowId = 'main'): void {
    const entry = this.getPoolEntry(windowId, 'pushAdsorbHint');
    if (!entry) return;
    entry.view.webContents.send(IPC.pool.adsorbHint, data);
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

  /** E5.8#62 审计#2：全部 Pool 宿主窗（主窗 + 脱出/漂移窗）——theme:changed 更新 OS 层背景用。
   *  脱出宿主窗 backgroundColor 是创建时一次性值（nativeTheme 快照），切主题只更新主窗 → 脱出窗
   *  OS 背景残留旧主题色（池加载/闪白间隙可见）。setBackgroundColor 幂等，主窗重复设置无害。 */
  getAllHostWindows(): BrowserWindow[] {
    return [...this.poolWindows.values()]
      .filter((e) => !e.hostWindow.isDestroyed())
      .map((e) => e.hostWindow);
  }

  /** E5.8#43-1（A3）：按发送者 webContents 反查 windowId——池 IPC 的 sender 校验/就绪路由用（非池来源返回 null） */
  getWindowIdByWebContents(wc: WebContents): string | null {
    for (const [windowId, entry] of this.poolWindows) {
      if (entry.view.webContents === wc) return windowId;
    }
    return null;
  }

  /** E5.8#43-2（B3）：取指定 Pool 窗口的宿主 BrowserWindow——窗口控制按发送者路由消费（未知/已销毁返回 null） */
  getHostWindow(windowId: string): BrowserWindow | null {
    const entry = this.poolWindows.get(windowId);
    return entry && !entry.hostWindow.isDestroyed() ? entry.hostWindow : null;
  }

  /** E5.8#43-4（②）：取指定 Pool 窗口的 WebContentsView——IpcBridge.broadcast 定向发目标窗口池用（未知/已销毁返回 null） */
  getPoolViewByWindowId(windowId: string): WebContentsView | null {
    const entry = this.poolWindows.get(windowId);
    return entry && !entry.view.webContents.isDestroyed() ? entry.view : null;
  }

  /** E5.8#43-2（B3）：宿主窗口最大化状态 → 该窗池 WCV（按宿主窗反查注册表）——TitleBar □/还原按钮态跟随所在窗口。
   *  ⚠ 主进程事件（win.on('maximize')）发宿主 webContents 是壳渲染进程——池是独立 WCV，须定向池发。
   *  专用方法（字面量频道）——check-ipc-audit 要求直发通道可审计，变量 channel 走不了。 */
  sendPoolMaximizeChange(hostWindow: BrowserWindow, maximized: boolean): void {
    for (const entry of this.poolWindows.values()) {
      if (entry.hostWindow === hostWindow && !entry.view.webContents.isDestroyed()) {
        entry.view.webContents.send(IPC.window.maximizeChange, maximized);
        return;
      }
    }
  }

  /** E5.8#46.18：宿主窗 OS 置顶状态 → 该窗池 WCV（按 windowId 定向——registerPool 挂载处持有 windowId）。
   *  与 sendPoolMaximizeChange 同款：字面量频道直发池（check-ipc-audit 可审计）。 */
  sendPoolAlwaysOnTopChange(windowId: string, isAlwaysOnTop: boolean): void {
    const view = this.getPoolViewByWindowId(windowId);
    if (view) view.webContents.send(IPC.window.alwaysOnTopChange, isAlwaysOnTop);
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
