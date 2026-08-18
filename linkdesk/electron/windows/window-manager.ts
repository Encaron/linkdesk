/**
 * WindowManager——E5.7 极简Pool：唯一 Pool WebContentsView 生命周期管理
 *
 * E5.7#4：单 WCV 满窗 100%×100%——创建/销毁/重建（崩溃恢复）+ bounds 跟随 + 布局推流。
 * #39 单 Pool 内存压力采样。E5.7#41（Phase 10）：per-tab 多实例集群整删——
 * pluginViews Map / 保活宽限期 / rekey 等 E5.5#9 时代代码随插件 WebView 消亡。
 * 安全靠 preload 沙箱，不靠进程数。
 */

import { BrowserWindow, WebContentsView, app, nativeTheme } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { DEV_SERVER_URL } from '../constants.js'; // E5.6#5：Pool URL 构建（E5.7#45.5：shared/ 并入 constants.ts）
import { attachKeyboardRouting } from './keyboard-router.js'; // E5.7 快捷键路由：池 WCV 挂载（工厂处——含 rebuildPool 覆盖）
import { cacheLayoutSnapshot } from './crash-recovery.js'; // E5.7#36：崩溃恢复快照——pushLayout 中转处缓存
import type { IpcBridge } from '../ipc/ipc-bridge.js'; // 类型引用——无运行时环（ipc-bridge 反向同是 type-only）
import { IPC } from '../ipc/channels.js';

/** RSS 超过 1GB 时触发内存压力警告（MemoryInfo.workingSetSize 单位是 KB） */
const MEMORY_PRESSURE_THRESHOLD = 1024 * 1024; // 1GB = 1,048,576 KB
const MEMORY_CHECK_INTERVAL = 30_000; // 每 30s 采样一次

export class WindowManager {
  private memoryTimer: ReturnType<typeof setInterval> | null = null;
  private ipcBridge: IpcBridge | null = null;

  // ── E5.6#5 → E5.7#4：单Pool——极简Pool 只有唯一 WebContentsView（#12 提前：SidebarPool 已删）──
  private mainPoolView: WebContentsView | null = null;

  constructor(private mainWindow: BrowserWindow) {
    this.startMemoryMonitoring();
    // E5.7#12.5：Pool bounds 换主——主进程跟随窗口 resize 满窗（壳不再推流）。
    // 注册在构造函数而非 createMainPool——rebuildPool 会重复注册。
    this.mainWindow.on('resize', this.syncPoolBounds);
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

  /** 创建唯一 Pool WebContentsView——pool.html 无 ?zone= 路由（E5.7#2 单入口） */
  private createPoolView(debugLabel: string): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'preload-pool.js'),
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

    // 外部关闭（非 destroyPool 主动调用）→ 清理字段
    view.webContents.on('destroyed', () => {
      if (this.mainPoolView === view) this.mainPoolView = null;
    });

    // E5.7 键盘路由：before-input-event 挂池 WCV——焦点永远在池上，壳 keydown 收不到全局快捷键
    // （Ctrl+Shift+P 等全灭）。工厂处挂载 = 初始创建 + rebuildPool 崩溃恢复全覆盖
    // （E5.5#7 只挂了插件 WebView——极简Pool 时代池是唯一视图）。
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
      view.webContents.loadFile(path.join(__dirname, '../../dist/pool.html'));
    }

    view.setVisible(false);
    // E5.6#10：Pool 背景色跟随主题——防止空内容时显示白色闪烁
    // nativeTheme.shouldUseDarkColors 反映当前实际主题（受 main.ts theme:changed IPC 更新）
    view.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f5f5f5');
    this.mainWindow.contentView.addChildView(view);

    console.log(`[WindowManager] Pool "${debugLabel}" WebContentsView 已创建`);
    return view;
  }

  /** E5.6#5c → E5.7#4：创建唯一 Pool WebContentsView */
  createMainPool(): WebContentsView {
    if (this.mainPoolView) {
      console.warn('[WindowManager] MainPool 已存在，返回已有 view');
      return this.mainPoolView;
    }
    this.mainPoolView = this.createPoolView('pool');
    // E5.7#12.5：创建即满窗接管——bounds 由主进程算（窗口内容区），不再等壳推流
    this.syncPoolBounds();
    this.mainPoolView.setVisible(true);
    return this.mainPoolView;
  }

  /**
   * E5.7#12.5：Pool 满窗零偏移——bounds 换主。
   * 主进程 = bounds 唯一真相源：窗口内容区即 Pool bounds，resize 时跟随。
   * E5.6 时代壳推流（pool:set-bounds）已死链删除——titlebar 是池内 zone，无需 TITLE_BAR_HEIGHT 偏移。
   */
  private syncPoolBounds = (): void => {
    const view = this.mainPoolView;
    if (!view || view.webContents.isDestroyed()) return;
    const { width, height } = this.mainWindow.getContentBounds();
    view.setBounds({ x: 0, y: 0, width, height });
  };

  /** E5.6#5e → E5.7#4：销毁唯一 Pool WebContentsView */
  destroyPool(): void {
    const view = this.mainPoolView;
    if (!view) return;

    try {
      this.mainWindow.contentView.removeChildView(view);
    } catch (err) {
      console.error(`[WindowManager] 移除 Pool 失败:`, err);
    }

    view.webContents.close();
    this.mainPoolView = null;
    console.log(`[WindowManager] Pool 已销毁`);
  }

  /** E5.6#5f → E5.7#4：重建 Pool——destroy → create（设计 §9.2 崩溃恢复用） */
  rebuildPool(): WebContentsView {
    this.destroyPool();
    return this.createMainPool();
  }

  /** E5.6#5g → E5.7#4：推送布局协议——单 WCV 直推（无 zone 路由） */
  pushLayout(layout: unknown): void {
    // E5.7#36：缓存布局快照——Pool 崩溃后主进程不依赖壳即时响应即可回放
    cacheLayoutSnapshot(layout);
    const view = this.mainPoolView;
    if (!view || view.webContents.isDestroyed()) {
      console.warn('[WindowManager] pushLayout 失败——Pool 不存在或已销毁');
      return;
    }
    view.webContents.send(IPC.pool.layout, layout);
  }

  /** E5.7#15：推送 QuickPick 哑渲染数据——壳序列化 DTO，池 QuickPickHost 纯渲染 */
  pushQuickPick(data: unknown): void {
    const view = this.mainPoolView;
    if (!view || view.webContents.isDestroyed()) {
      console.warn('[WindowManager] pushQuickPick 失败——Pool 不存在或已销毁');
      return;
    }
    view.webContents.send(IPC.pool.quickpick, data);
  }

  /** E5.7#16：推送 Toast 哑渲染数据——壳 toast 服务序列化 DTO，池 ToastHost 纯渲染 */
  pushToast(data: unknown): void {
    const view = this.mainPoolView;
    if (!view || view.webContents.isDestroyed()) {
      console.warn('[WindowManager] pushToast 失败——Pool 不存在或已销毁');
      return;
    }
    view.webContents.send(IPC.pool.toast, data);
  }

  /** E5.7#17：推送 Dialog 哑渲染数据——壳 DialogService 桥序列化 DTO，池 DialogHost 纯渲染 */
  pushDialog(data: unknown): void {
    const view = this.mainPoolView;
    if (!view || view.webContents.isDestroyed()) {
      console.warn('[WindowManager] pushDialog 失败——Pool 不存在或已销毁');
      return;
    }
    view.webContents.send(IPC.pool.dialog, data);
  }

  /** E5.6#5h → E5.7#4：取唯一 Pool WebContentsView */
  getPoolView(): WebContentsView | null {
    return this.mainPoolView;
  }

  /** E5.6#10f：返回已创建的 Pool WebContentsView（广播/重放用） */
  getAllPoolViews(): WebContentsView[] {
    if (this.mainPoolView && !this.mainPoolView.webContents.isDestroyed()) {
      return [this.mainPoolView];
    }
    return [];
  }

  /**
   * 销毁唯一 Pool WebContentsView + 停止监控——应用退出时调用。
   */
  dispose(): void {
    if (this.memoryTimer) {
      clearInterval(this.memoryTimer);
      this.memoryTimer = null;
    }
    // E5.7#12.5：注销 resize 跟随监听——与构造函数注册成对
    this.mainWindow.removeListener('resize', this.syncPoolBounds);
    // E5.6#5 → E5.7#4：清理唯一 Pool WebContentsView
    this.destroyPool();
  }

}
