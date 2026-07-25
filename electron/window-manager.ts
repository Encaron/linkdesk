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

export class WindowManager {
  private pluginViews = new Map<string, WebContentsView>();

  constructor(private mainWindow: BrowserWindow) {}

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

  /**
   * 销毁所有插件 WebContentsView——应用退出时调用。
   */
  dispose(): void {
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
