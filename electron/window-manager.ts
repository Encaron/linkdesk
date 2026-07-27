/**
 * WindowManager——插件 WebContentsView 生命周期管理
 *
 * E3a #24：底座——创建/销毁/聚焦插件 WebContentsView。
 * #25a 资源休眠 + #25b 保活宽限期在后续任务追加。
 *
 * 对标 VS Code 的 ExtensionHost management——每个插件独立进程，
 * 崩了不波及壳，卸载时物理清空 JS heap。
 */

import { BrowserWindow, WebContentsView, app } from 'electron';
import * as path from 'path';

/** RSS 超过 1GB 时触发内存压力警告（MemoryInfo.workingSetSize 单位是 KB） */
const MEMORY_PRESSURE_THRESHOLD = 1024 * 1024; // 1GB = 1,048,576 KB
const MEMORY_CHECK_INTERVAL = 30_000; // 每 30s 采样一次
/** 关闭标签页后保留 WebView 的宽限期——60s 内重开则复用，超时则真正销毁 */
const GRACE_PERIOD_MS = 60_000;

export class WindowManager {
  private pluginViews = new Map<string, WebContentsView>();
  private memoryTimer: ReturnType<typeof setInterval> | null = null;
  /** 保活宽限期定时器——key=pluginId，value=setTimeout handle */
  private graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private ipcBridge: any = null;

  constructor(private mainWindow: BrowserWindow) {
    this.startMemoryMonitoring();
  }

  /** E3c #40：setter——IpcBridge 晚于 WindowManager 创建 */
  setIpcBridge(bridge: any): void {
    this.ipcBridge = bridge;
  }

  /**
   * 为指定插件创建独立的 WebContentsView。
   *
   * @param pluginId - 插件 ID
   * @param url - 要加载的 URL（dev: http://localhost:1420/..., prod: linkdesk://...）
   * @returns 创建的 WebContentsView
   */
  createPluginView(pluginId: string, url: string): WebContentsView {
    // 幂等——如果已存在则先销毁旧的
    if (this.pluginViews.has(pluginId)) {
      console.warn(`[WindowManager] 插件 "${pluginId}" 已有 WebContentsView，先销毁旧的`);
      this.destroyPluginView(pluginId);
    }

    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'preload-plugin.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false, // preload 需要访问 Node.js API 做 contextBridge
      },
    });

    // ── 崩溃检测（模式 2 预防——插件崩了触发壳侧清理链）──
    // Electron 43+: "crashed" 已废弃，用 "render-process-gone"
    view.webContents.on('render-process-gone', (_event, details) => {
      console.error(`[WindowManager] 插件 "${pluginId}" WebContentsView 崩溃:`, details.reason);
      // 清理：从 contentView 移除 + 关闭 + 从 Map 删除
      this.cleanupCrashedView(pluginId);
    });

    // WebContentsView 被外部关闭（非崩溃）——同样清理
    view.webContents.on('destroyed', () => {
      this.pluginViews.delete(pluginId);
    });

    // ── 新 WebView 创建后重放当前状态（#35 + #40）──
    view.webContents.on('did-finish-load', () => {
      this.ipcBridge?.replayToPlugin(pluginId);
    });

    // 加载内容
    view.webContents.loadURL(url);

    // 🔥 默认隐藏——等 MainContent 设好 bounds 后再显示。
    // 不隐藏 → 多 WebView 同时全屏覆盖 = 壳 React 内容全部被挡。
    view.setVisible(false);

    // 添加到壳窗口
    this.mainWindow.contentView.addChildView(view);
    this.pluginViews.set(pluginId, view);

    console.log(`[WindowManager] 插件 "${pluginId}" WebContentsView 已创建`);
    return view;
  }

  /**
   * 销毁指定插件的 WebContentsView。
   * 从 contentView 移除 → 关闭 webContents → 从 Map 删除。
   */
  destroyPluginView(pluginId: string): void {
    const view = this.pluginViews.get(pluginId);
    if (!view) {
      console.warn(`[WindowManager] 插件 "${pluginId}" 没有 WebContentsView，跳过销毁`);
      return;
    }

    try {
      this.mainWindow.contentView.removeChildView(view);
    } catch (err) {
      console.error(`[WindowManager] 移除 "${pluginId}" WebContentsView 失败:`, err);
    }

    // 取消保活定时器（如果处于宽限期）
    this.cancelGraceTimer(pluginId);
    view.webContents.close();
    this.pluginViews.delete(pluginId);
    console.log(`[WindowManager] 插件 "${pluginId}" WebContentsView 已销毁`);
  }

  /** 获取指定插件的 WebContentsView */
  getPluginView(pluginId: string): WebContentsView | undefined {
    return this.pluginViews.get(pluginId);
  }

  /** 检查插件是否有活跃的 WebContentsView */
  hasPluginView(pluginId: string): boolean {
    return this.pluginViews.has(pluginId);
  }

  /** 返回所有活跃的插件 ID */
  getAllPluginIds(): string[] {
    return Array.from(this.pluginViews.keys());
  }

  /**
   * 聚焦指定插件的 WebContentsView——将其置于最前并聚焦。
   * 对标 VS Code 标签页切换时的 WebView focus 行为。
   */
  focusPluginView(pluginId: string): void {
    const view = this.pluginViews.get(pluginId);
    if (!view) return;
    view.webContents.focus();
  }

  /**
   * 🔧 开发辅助——切换指定插件的 DevTools。
   * 只在非打包模式下生效。
   */
  toggleDevTools(pluginId: string): void {
    if (app.isPackaged) return;

    const view = this.pluginViews.get(pluginId);
    if (!view) {
      console.warn(`[WindowManager] 插件 "${pluginId}" 没有 WebContentsView，无法打开 DevTools`);
      return;
    }

    if (view.webContents.isDevToolsOpened()) {
      view.webContents.closeDevTools();
    } else {
      view.webContents.openDevTools({ mode: 'detach' });
    }
  }

  // ═══════════════════════════════════════════════════════
  // E3a #25a——资源休眠
  // ═══════════════════════════════════════════════════════

  /**
   * 标签页切换时调用——活跃的解除限流，隐藏的降频。
   * 对标 Chromium 的后台标签页节流行为。
   */
  setThrottling(pluginId: string, isVisible: boolean): void {
    const view = this.pluginViews.get(pluginId);
    if (!view) return;
    view.webContents.setBackgroundThrottling(!isVisible);
  }

  /**
   * 每 30s 采样所有插件 WebView 的内存。
   * 通过 app.getAppMetrics() + PID 匹配——Electron 43 的 getProcessMemoryInfo()
   * 在 Process 上（Node 进程自身），不在 WebContents 上。
   *
   * RSS 总和 > 1GB → 通知壳渲染进程（toast 提示用户）。
   */
  checkMemoryPressure(): void {
    // 收集所有插件 WebView 的 OS PID
    const pluginPids = new Set<number>();
    for (const [pluginId, view] of this.pluginViews) {
      try {
        pluginPids.add(view.webContents.getOSProcessId());
      } catch {
        // WebView 可能已销毁但还没从 Map 清理，忽略
      }
    }

    if (pluginPids.size === 0) return;

    // 获取所有进程指标，按 PID 匹配插件 WebView
    const metrics = app.getAppMetrics();
    let totalRSS = 0;
    for (const m of metrics) {
      if (pluginPids.has(m.pid)) {
        totalRSS += m.memory.workingSetSize;
      }
    }

    if (totalRSS > MEMORY_PRESSURE_THRESHOLD) {
      console.warn(`[WindowManager] 内存压力——插件 WebView 总 Working Set: ${(totalRSS / 1024).toFixed(0)} MB`);
      // 内存安全优先——无视宽限期立即销毁
      this.flushGracePeriods();
      // 通知壳渲染进程显示 toast
      this.mainWindow.webContents.send('system:memory-pressure', {
        totalRSS,
        threshold: MEMORY_PRESSURE_THRESHOLD,
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  // E3a #25b——保活宽限期
  // ═══════════════════════════════════════════════════════

  /**
   * 关闭标签页时不立即销毁 WebView——先隐藏并启动 60s 宽限期。
   * 期间重开标签页 → 零重建延迟。超时 → 真正销毁。
   * 对标 VS Code Extension Host 的保活策略。
   */
  scheduleViewDestroy(pluginId: string): void {
    const view = this.pluginViews.get(pluginId);
    if (!view || this.graceTimers.has(pluginId)) return;

    // 先隐藏 + 降频（不销毁——保留 JS 状态）
    view.setVisible(false);
    view.webContents.setBackgroundThrottling(true);

    const timer = setTimeout(() => {
      this.destroyPluginView(pluginId);
      this.graceTimers.delete(pluginId);
    }, GRACE_PERIOD_MS);
    this.graceTimers.set(pluginId, timer);

    console.log(`[WindowManager] 插件 "${pluginId}" 进入保活宽限期（${GRACE_PERIOD_MS / 1000}s）`);
  }

  /**
   * 重开标签页——如果在宽限期内则复用 WebView。
   * @returns true=复用成功，false=已销毁需重建
   */
  cancelViewDestroy(pluginId: string): boolean {
    const timer = this.graceTimers.get(pluginId);
    if (!timer) return false;

    clearTimeout(timer);
    this.graceTimers.delete(pluginId);

    const view = this.pluginViews.get(pluginId);
    if (view) {
      view.setVisible(true);
      view.webContents.setBackgroundThrottling(false);
      console.log(`[WindowManager] 插件 "${pluginId}" 从宽限期恢复——零重建`);
      return true;
    }
    return false;
  }

  /**
   * 检查插件是否处于保活宽限期（隐藏但未销毁）。
   */
  isInGracePeriod(pluginId: string): boolean {
    return this.graceTimers.has(pluginId);
  }

  /** 取消保活定时器（内部使用） */
  private cancelGraceTimer(pluginId: string): void {
    const timer = this.graceTimers.get(pluginId);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(pluginId);
    }
  }

  /**
   * 内存压力时立即销毁所有处于宽限期的 WebView——内存安全优先。
   */
  private flushGracePeriods(): void {
    for (const pluginId of this.getAllPluginIds()) {
      if (this.graceTimers.has(pluginId)) {
        console.warn(`[WindowManager] 内存压力——强制销毁宽限期插件 "${pluginId}"`);
        this.cancelGraceTimer(pluginId);
        this.destroyPluginView(pluginId);
      }
    }
  }

  /** 启动周期性内存监控（构造函数中自动调用） */
  private startMemoryMonitoring(): void {
    this.memoryTimer = setInterval(() => {
      this.checkMemoryPressure();
    }, MEMORY_CHECK_INTERVAL);
  }

  /**
   * 销毁所有插件 WebContentsView——应用退出时调用。
   */
  dispose(): void {
    if (this.memoryTimer) {
      clearInterval(this.memoryTimer);
      this.memoryTimer = null;
    }
    // 清理所有保活定时器
    for (const timer of this.graceTimers.values()) {
      clearTimeout(timer);
    }
    this.graceTimers.clear();
    for (const pluginId of this.getAllPluginIds()) {
      this.destroyPluginView(pluginId);
    }
  }

  /**
   * 清理崩溃的 WebContentsView。
   * 不调用 destroyPluginView——崩溃的 webContents 已经不可用。
   */
  private cleanupCrashedView(pluginId: string): void {
    const view = this.pluginViews.get(pluginId);
    if (!view) return;

    try {
      this.mainWindow.contentView.removeChildView(view);
    } catch {
      // contentView 中可能已不存在，忽略
    }

    this.pluginViews.delete(pluginId);
    // TODO E3e: 通知壳侧（toast "插件 xxx 已崩溃"）
    // mainWindow.webContents.send('plugin:crashed', { pluginId })
  }
}
