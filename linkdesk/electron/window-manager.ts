/**
 * WindowManager——插件 WebContentsView 生命周期管理
 *
 * E3a #24：底座——创建/销毁/聚焦插件 WebContentsView。
 * #25a 资源休眠 + #25b 保活宽限期在后续任务追加。
 * E5.5#9a：pluginId→instanceId 架构升级。pluginViews 改为复合值——
 *         Map<instanceId, { view, pluginId }> 单 Map 同时服务正查 + 反查。
 *
 * 对标 VS Code 的 ExtensionHost management——每个插件独立进程，
 * 崩了不波及壳，卸载时物理清空 JS heap。
 */

import { BrowserWindow, WebContentsView, app, WebContents } from 'electron';
import * as path from 'path';

/** RSS 超过 1GB 时触发内存压力警告（MemoryInfo.workingSetSize 单位是 KB） */
const MEMORY_PRESSURE_THRESHOLD = 1024 * 1024; // 1GB = 1,048,576 KB
const MEMORY_CHECK_INTERVAL = 30_000; // 每 30s 采样一次
/** 关闭标签页后保留 WebView 的宽限期——60s 内重开则复用，超时则真正销毁 */
const GRACE_PERIOD_MS = 60_000;

export class WindowManager {
  /**
   * 归一化——单 Map 复合值。三个查询方向一个数据源：
   *   正查: pluginViews.get(instanceId).view → WebContentsView
   *   反查: pluginViews.get(instanceId).pluginId → string
   *   遍历过滤: getInstanceIdsForPlugin(pluginId) → instanceId[]
   */
  private pluginViews = new Map<string, {
    view: WebContentsView;
    pluginId: string;
  }>();

  private memoryTimer: ReturnType<typeof setInterval> | null = null;
  /** 保活宽限期定时器——key=instanceId，value=setTimeout handle */
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
   * 为指定标签页实例创建独立的 WebContentsView。
   * E5.5#9a：signature 改为 (instanceId, pluginId, url)。
   *
   * @param instanceId - 标签页 tab.id（唯一标识）
   * @param pluginId - 插件 ID
   * @param url - 要加载的 URL（dev: http://localhost:1420/..., prod: linkdesk://...）
   * @returns 创建的 WebContentsView
   */
  createPluginView(instanceId: string, pluginId: string, url: string): WebContentsView {
    // 防御——per-tab 模型下 instanceId 不应碰撞，但调用方 bug 可能导致重复创建。
    // 静默创建第二个 view 会让第一个 view 残留在 contentView 中成为僵尸——不可见也不可销毁。
    if (this.pluginViews.has(instanceId)) {
      console.warn(`[WindowManager] instance "${instanceId}" 已有 WebContentsView——重复 create 被拦截。返回已有 view。`);
      return this.pluginViews.get(instanceId)!.view;
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
    // 🔥 不用闭包捕获 instanceId——rekeyInstance 后 instanceId 可能已变（宽限期恢复）。
    //    改为运行时从 Map 反查当前 key。
    view.webContents.on('render-process-gone', (_event, details) => {
      const currentId = this.findInstanceIdByView(view);
      if (!currentId) return;
      const entry = this.pluginViews.get(currentId);
      console.error(`[WindowManager] 插件 "${entry?.pluginId ?? '?'}" (instance: ${currentId}) WebContentsView 崩溃:`, details.reason);
      this.cleanupCrashedView(currentId);
    });

    // WebContentsView 被外部关闭（非崩溃）——同样清理，运行时反查 key
    view.webContents.on('destroyed', () => {
      const currentId = this.findInstanceIdByView(view);
      if (currentId) this.pluginViews.delete(currentId);
    });

    // 🔥 E5.5#1b 调试：转发插件 WebView console → 主进程终端
    view.webContents.on('console-message', (_event: any, level: number, message: string, line: number, sourceId: string) => {
      const tag = `[plugin:${pluginId}#${instanceId.slice(-6)}]`;
      if (level >= 3) console.error(`${tag} ${message}`);
      else console.log(`${tag} ${message}`);
    });

    // ── 新 WebView 创建后重放当前状态（#35 + #40）──
    view.webContents.on('did-finish-load', () => {
      console.log(`[WindowManager] 插件 "${pluginId}" (instance: ${instanceId}) WebView 加载完成`);
      this.ipcBridge?.replayToPlugin(instanceId);
    });

    view.webContents.on('did-fail-load', (_event: any, errorCode: number, errorDescription: string, validatedURL: string) => {
      console.error(`[WindowManager] 插件 "${pluginId}" (instance: ${instanceId}) WebView 加载失败: ${errorDescription} (code ${errorCode}) URL=${validatedURL}`);
    });

    // 加载内容
    view.webContents.loadURL(url);

    // 🔥 默认隐藏——等 MainContent 设好 bounds 后再显示。
    // 不隐藏 → 多 WebView 同时全屏覆盖 = 壳 React 内容全部被挡。
    view.setVisible(false);

    // 添加到壳窗口 + 存入复合值——一次 set 完成正查和反查
    this.mainWindow.contentView.addChildView(view);
    this.pluginViews.set(instanceId, { view, pluginId });

    console.log(`[WindowManager] 插件 "${pluginId}" (instance: ${instanceId}) WebContentsView 已创建`);
    return view;
  }

  /**
   * 销毁指定实例的 WebContentsView。
   * 从 contentView 移除 → 关闭 webContents → 从 Map 删除。
   */
  destroyPluginView(instanceId: string): void {
    const entry = this.pluginViews.get(instanceId);
    if (!entry) {
      console.warn(`[WindowManager] instance "${instanceId}" 没有 WebContentsView，跳过销毁`);
      return;
    }

    try {
      this.mainWindow.contentView.removeChildView(entry.view);
    } catch (err) {
      console.error(`[WindowManager] 移除 instance "${instanceId}" (plugin: ${entry.pluginId}) WebContentsView 失败:`, err);
    }

    // 取消保活定时器（如果处于宽限期）
    this.cancelGraceTimer(instanceId);
    // #73：清空该实例的 IPC 请求队列
    this.ipcBridge?.clearPluginQueue?.(instanceId);
    entry.view.webContents.close();
    this.pluginViews.delete(instanceId);
    console.log(`[WindowManager] instance "${instanceId}" (plugin: ${entry.pluginId}) WebContentsView 已销毁`);
  }

  /** 获取指定实例的 WebContentsView（从复合值取 .view） */
  getPluginView(instanceId: string): WebContentsView | undefined {
    return this.pluginViews.get(instanceId)?.view;
  }

  /** 检查是否有指定实例的活跃 WebContentsView */
  hasPluginView(instanceId: string): boolean {
    return this.pluginViews.has(instanceId);
  }

  /** 返回所有活跃实例的 instanceId */
  getAllInstanceIds(): string[] {
    return Array.from(this.pluginViews.keys());
  }

  /**
   * 从 WebContents 反查插件信息。
   * E3j #72——IPC 消息队列需识别发起请求的插件。
   * E5.5#9a：返回结构变更——{ pluginId, instanceId }。
   */
  getPluginIdFromWebContents(wc: WebContents): { pluginId: string; instanceId: string } | undefined {
    for (const [instanceId, entry] of this.pluginViews) {
      if (entry.view.webContents === wc) return { pluginId: entry.pluginId, instanceId };
    }
    return undefined;
  }

  /**
   * 从 WebContentsView 反查当前 instanceId。
   * E5.5#9a——rekeyInstance 后 instanceId 可能变化，事件处理器用此方法运行时反查。
   */
  private findInstanceIdByView(view: WebContentsView): string | undefined {
    for (const [instanceId, entry] of this.pluginViews) {
      if (entry.view === view) return instanceId;
    }
    return undefined;
  }

  /**
   * 按 pluginId 过滤所有 instanceId。
   * E5.5#9a 新增——broadcast / 插件卸载清空等场景的反查。
   */
  getInstanceIdsForPlugin(pluginId: string): string[] {
    const ids: string[] = [];
    for (const [instanceId, entry] of this.pluginViews) {
      if (entry.pluginId === pluginId) ids.push(instanceId);
    }
    return ids;
  }

  /**
   * 同一插件的旧 WebView 重分配给新 instanceId（宽限期恢复场景）。
   * E5.5#9a 新增——新 tab = 新 tab.id ≠ 旧 instanceId，需要重映射。
   */
  rekeyInstance(oldInstanceId: string, newInstanceId: string): boolean {
    const entry = this.pluginViews.get(oldInstanceId);
    if (!entry) return false;
    this.pluginViews.delete(oldInstanceId);
    this.pluginViews.set(newInstanceId, entry);

    // 同步更新 graceTimers
    const timer = this.graceTimers.get(oldInstanceId);
    if (timer) {
      this.graceTimers.delete(oldInstanceId);
      this.graceTimers.set(newInstanceId, timer);
    }

    console.log(`[WindowManager] rekey "${oldInstanceId}" → "${newInstanceId}" (plugin: ${entry.pluginId})`);
    return true;
  }

  /**
   * 聚焦指定实例的 WebContentsView——将其置于最前并聚焦。
   * 对标 VS Code 标签页切换时的 WebView focus 行为。
   */
  focusPluginView(instanceId: string): void {
    const entry = this.pluginViews.get(instanceId);
    if (!entry) return;
    entry.view.webContents.focus();
  }

  /**
   * 🔧 开发辅助——切换指定实例的 DevTools。
   * 只在非打包模式下生效。
   */
  toggleDevTools(instanceId: string): void {
    if (app.isPackaged) return;

    const entry = this.pluginViews.get(instanceId);
    if (!entry) {
      console.warn(`[WindowManager] instance "${instanceId}" 没有 WebContentsView，无法打开 DevTools`);
      return;
    }

    if (entry.view.webContents.isDevToolsOpened()) {
      entry.view.webContents.closeDevTools();
    } else {
      entry.view.webContents.openDevTools({ mode: 'detach' });
    }
  }

  // ═══════════════════════════════════════════════════════
  // E3a #25a——资源休眠
  // ═══════════════════════════════════════════════════════

  /**
   * 标签页切换时调用——活跃的解除限流，隐藏的降频。
   * 对标 Chromium 的后台标签页节流行为。
   */
  setThrottling(instanceId: string, isVisible: boolean): void {
    const entry = this.pluginViews.get(instanceId);
    if (!entry) return;
    entry.view.webContents.setBackgroundThrottling(!isVisible);
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
    for (const [instanceId, entry] of this.pluginViews) {
      try {
        pluginPids.add(entry.view.webContents.getOSProcessId());
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
  scheduleViewDestroy(instanceId: string): void {
    const entry = this.pluginViews.get(instanceId);
    if (!entry || this.graceTimers.has(instanceId)) return;

    // 先隐藏 + 降频（不销毁——保留 JS 状态）
    entry.view.setVisible(false);
    entry.view.webContents.setBackgroundThrottling(true);

    const timer = setTimeout(() => {
      this.destroyPluginView(instanceId);
      this.graceTimers.delete(instanceId);
    }, GRACE_PERIOD_MS);
    this.graceTimers.set(instanceId, timer);

    console.log(`[WindowManager] instance "${instanceId}" (plugin: ${entry.pluginId}) 进入保活宽限期（${GRACE_PERIOD_MS / 1000}s）`);
  }

  /**
   * 重开标签页——如果在宽限期内则复用 WebView。
   * @returns true=复用成功，false=已销毁需重建
   */
  cancelViewDestroy(instanceId: string): boolean {
    const timer = this.graceTimers.get(instanceId);
    if (!timer) return false;

    clearTimeout(timer);
    this.graceTimers.delete(instanceId);

    const entry = this.pluginViews.get(instanceId);
    if (entry) {
      entry.view.setVisible(true);
      entry.view.webContents.setBackgroundThrottling(false);
      console.log(`[WindowManager] instance "${instanceId}" (plugin: ${entry.pluginId}) 从宽限期恢复——零重建`);
      return true;
    }
    return false;
  }

  /**
   * 检查实例是否处于保活宽限期（隐藏但未销毁）。
   */
  isInGracePeriod(instanceId: string): boolean {
    return this.graceTimers.has(instanceId);
  }

  /**
   * E5.5#9b——在宽限期中按 pluginId 查找待销毁实例。
   * 用于宽限期恢复：关闭标签页后快速重开（新 tab.id），通过 pluginId 找到旧 instanceId 后 rekey。
   */
  findInstanceInGrace(pluginId: string): string | undefined {
    for (const [instanceId, entry] of this.pluginViews) {
      if (entry.pluginId === pluginId && this.graceTimers.has(instanceId)) {
        return instanceId;
      }
    }
    return undefined;
  }

  /** 取消保活定时器（内部使用） */
  private cancelGraceTimer(instanceId: string): void {
    const timer = this.graceTimers.get(instanceId);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(instanceId);
    }
  }

  /**
   * 内存压力时立即销毁所有处于宽限期的 WebView——内存安全优先。
   */
  private flushGracePeriods(): void {
    for (const instanceId of this.getAllInstanceIds()) {
      if (this.graceTimers.has(instanceId)) {
        const entry = this.pluginViews.get(instanceId);
        console.warn(`[WindowManager] 内存压力——强制销毁宽限期 instance "${instanceId}" (plugin: ${entry?.pluginId ?? '?'})`);
        this.cancelGraceTimer(instanceId);
        this.destroyPluginView(instanceId);
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
    for (const instanceId of this.getAllInstanceIds()) {
      this.destroyPluginView(instanceId);
    }
  }

  /**
   * 清理崩溃的 WebContentsView。
   * 不调用 destroyPluginView——崩溃的 webContents 已经不可用。
   */
  private cleanupCrashedView(instanceId: string): void {
    const entry = this.pluginViews.get(instanceId);
    if (!entry) return;

    try {
      this.mainWindow.contentView.removeChildView(entry.view);
    } catch {
      // contentView 中可能已不存在，忽略
    }

    this.pluginViews.delete(instanceId);
    // TODO E3e: 通知壳侧（toast "插件 xxx 已崩溃"）
    // mainWindow.webContents.send('plugin:crashed', { instanceId, pluginId: entry.pluginId })
  }
}
