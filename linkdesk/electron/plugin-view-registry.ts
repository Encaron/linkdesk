/**
 * PluginViewRegistry——插件 ID → WebContentsView 映射 + bounds 管理 + 重载
 *
 * E3a #25：在 WindowManager 之上提供应用层 API。
 * WindowManager 管底层生灭，PluginViewRegistry 管布局（bounds/显隐）和重载。
 * #29 MainContent 通过本类控制插件 WebView 的位置和可见性。
 */

import { WebContentsView } from 'electron';
import { WindowManager } from './window-manager.js';

export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class PluginViewRegistry {
  constructor(private windowManager: WindowManager) {}

  /**
   * 注册插件——创建其 WebContentsView 并记录元数据。
   * 幂等——已注册则跳过（除非 force=true 强制重建）。
   */
  registerPlugin(pluginId: string, url: string, force = false): WebContentsView {
    if (force || !this.windowManager.hasPluginView(pluginId)) {
      return this.windowManager.createPluginView(pluginId, url);
    }
    const existing = this.windowManager.getPluginView(pluginId)!;
    return existing;
  }

  /** 注销插件——销毁其 WebContentsView */
  unregisterPlugin(pluginId: string): void {
    this.windowManager.destroyPluginView(pluginId);
  }

  /**
   * 设置插件 WebContentsView 在壳窗口中的位置和大小。
   * #29 MainContent 在布局变化时调用此方法。
   */
  setBounds(pluginId: string, bounds: ViewBounds): void {
    const view = this.windowManager.getPluginView(pluginId);
    if (!view) return; // 插件 WebView 尚未创建——静默跳过
    view.setBounds(bounds);
  }

  /**
   * 控制插件 WebContentsView 的可见性。
   * 标签页切换时——当前标签页可见，其他隐藏。
   * 自动联动 WindowManager 的降频策略——可见=解除限流，隐藏=降频。
   */
  setVisible(pluginId: string, visible: boolean): void {
    const view = this.windowManager.getPluginView(pluginId);
    if (!view) return; // 插件 WebView 尚未创建——静默跳过（E3a 迁移过渡期正常）
    view.setVisible(visible);
    // E3a #25a：可见性联动资源休眠
    this.windowManager.setThrottling(pluginId, visible);
  }

  /**
   * 重载插件 WebContentsView 的内容。
   * 对标 VS Code 的"Reload Window"——开发时插件代码改了，重载即可。
   */
  reloadPlugin(pluginId: string): void {
    const view = this.windowManager.getPluginView(pluginId);
    if (!view) {
      console.warn(`[PluginViewRegistry] reload 失败——插件 "${pluginId}" 未注册`);
      return;
    }
    view.webContents.reload();
  }

  /** 获取插件的 WebContentsView */
  getView(pluginId: string): WebContentsView | undefined {
    return this.windowManager.getPluginView(pluginId);
  }

  /** 检查插件是否已注册 */
  isRegistered(pluginId: string): boolean {
    return this.windowManager.hasPluginView(pluginId);
  }

  /** 返回所有已注册的插件 ID */
  getAllPluginIds(): string[] {
    return this.windowManager.getAllPluginIds();
  }

  /** 销毁所有插件 WebContentsView——应用退出时调用 */
  dispose(): void {
    this.windowManager.dispose();
  }
}
