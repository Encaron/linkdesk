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
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** RSS 超过 1GB 时触发内存压力警告（MemoryInfo.workingSetSize 单位是 KB） */
const MEMORY_PRESSURE_THRESHOLD = 1024 * 1024; // 1GB = 1,048,576 KB
const MEMORY_CHECK_INTERVAL = 30_000; // 每 30s 采样一次

export class WindowManager {
  private pluginViews = new Map<string, WebContentsView>();
  private memoryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private mainWindow: BrowserWindow) {
    this.startMemoryMonitoring();
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

    // ── 新 WebView 创建后主动推送当前状态（新风险 4 预防）──
    // ⚠️ E3b/E3c 实现前占位——主题/语言跨进程广播就绪后替换为 IPC send
    view.webContents.on('did-finish-load', () => {
      // TODO E3b: 推送当前主题 CSS 变量到新 WebView
      // mainWindow.webContents.send('theme:push-to-plugin', { pluginId, ... })
      // TODO E3c: 推送当前语言资源到新 WebView
      // mainWindow.webContents.send('lang:push-to-plugin', { pluginId, ... })
    });

    // 加载内容
    view.webContents.loadURL(url);

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

    // 取消保活定时器（#25b 实现后替换为 this.graceTimers.delete(pluginId)）
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
      // 通知壳渲染进程显示 toast
      this.mainWindow.webContents.send('system:memory-pressure', {
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

  /**
   * 销毁所有插件 WebContentsView——应用退出时调用。
   */
  dispose(): void {
    if (this.memoryTimer) {
      clearInterval(this.memoryTimer);
      this.memoryTimer = null;
    }
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
