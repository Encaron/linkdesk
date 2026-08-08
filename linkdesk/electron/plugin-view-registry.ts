/**
 * PluginViewRegistry——instanceId → WebContentsView 映射 + bounds 管理 + 重载
 *
 * E3a #25：在 WindowManager 之上提供应用层 API。
 * WindowManager 管底层生灭，PluginViewRegistry 管布局（bounds/显隐）和重载。
 * E5.5#9b：pluginId→instanceId——每个标签页独立 WebView。所有方法签名同步更新。
 *         新增 getInstanceIdsForPlugin + rekeyInstance + findGraceInstance。
 *
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
   * 注册插件实例——创建其 WebContentsView 并记录元数据。
   * E5.5#9b：signature → (instanceId, pluginId, url, force?)。
   * 幂等——已注册则跳过（除非 force=true 强制重建）。
   */
  registerPlugin(instanceId: string, pluginId: string, url: string, force = false): WebContentsView {
    if (force || !this.windowManager.hasPluginView(instanceId)) {
      return this.windowManager.createPluginView(instanceId, pluginId, url);
    }
    const existing = this.windowManager.getPluginView(instanceId)!;
    return existing;
  }

  /** 注销插件实例——销毁其 WebContentsView */
  unregisterPlugin(instanceId: string): void {
    this.windowManager.destroyPluginView(instanceId);
  }

  /**
   * 设置实例 WebContentsView 在壳窗口中的位置和大小。
   * #29 MainContent 在布局变化时调用此方法。
   */
  setBounds(instanceId: string, bounds: ViewBounds): void {
    const view = this.windowManager.getPluginView(instanceId);
    if (!view) return; // 实例 WebView 尚未创建——静默跳过
    view.setBounds(bounds);
  }

  /**
   * 控制实例 WebContentsView 的可见性。
   * 标签页切换时——当前标签页可见，其他隐藏。
   * 自动联动 WindowManager 的降频策略——可见=解除限流，隐藏=降频。
   */
  setVisible(instanceId: string, visible: boolean): void {
    const view = this.windowManager.getPluginView(instanceId);
    if (!view) return; // 实例 WebView 尚未创建——静默跳过
    view.setVisible(visible);
    // E3a #25a：可见性联动资源休眠
    this.windowManager.setThrottling(instanceId, visible);
  }

  /**
   * E5.5#3c + E5.5#9b：标签页关闭时调用——不立即销毁，进入 60s 保活宽限期。
   * 期间重开标签页 → cancelDestroy 复用，零重建延迟。超时 → 真销毁。
   */
  scheduleDestroy(instanceId: string): void {
    this.windowManager.scheduleViewDestroy(instanceId);
  }

  /**
   * E5.5#3c + E5.5#9b：重开标签页时调用——检查是否在宽限期内。
   * @returns true=复用成功（WebView 恢复可见），false=已销毁需重建
   */
  cancelDestroy(instanceId: string): boolean {
    return this.windowManager.cancelViewDestroy(instanceId);
  }

  /**
   * 重载实例 WebContentsView 的内容。
   * 对标 VS Code 的"Reload Window"——开发时插件代码改了，重载即可。
   */
  reloadPlugin(instanceId: string): void {
    const view = this.windowManager.getPluginView(instanceId);
    if (!view) {
      console.warn(`[PluginViewRegistry] reload 失败——instance "${instanceId}" 未注册`);
      return;
    }
    view.webContents.reload();
  }

  /** 获取实例的 WebContentsView */
  getView(instanceId: string): WebContentsView | undefined {
    return this.windowManager.getPluginView(instanceId);
  }

  /** E3f #58 + E5.5#9b：切换实例 DevTools——委托 WindowManager */
  toggleDevTools(instanceId: string): void {
    this.windowManager.toggleDevTools(instanceId);
  }

  /** 检查实例是否已注册 */
  isRegistered(instanceId: string): boolean {
    return this.windowManager.hasPluginView(instanceId);
  }

  /** E5.5#9b：返回所有已注册的 instanceId */
  getAllInstanceIds(): string[] {
    return this.windowManager.getAllInstanceIds();
  }

  /**
   * E5.5#9b 新增——按 pluginId 过滤所有 instanceId。
   * 用于 broadcast / 插件卸载清空等场景。
   */
  getInstanceIdsForPlugin(pluginId: string): string[] {
    return this.windowManager.getInstanceIdsForPlugin(pluginId);
  }

  /**
   * E5.5#9b 新增——宽限期恢复时重映射 instanceId。
   * 新 tab = 新 tab.id ≠ 旧 instanceId，需要把旧 WebView 移到新 key。
   */
  rekeyInstance(oldInstanceId: string, newInstanceId: string): boolean {
    return this.windowManager.rekeyInstance(oldInstanceId, newInstanceId);
  }

  /**
   * E5.5#9b 新增——在宽限期中按 pluginId 查找待销毁实例。
   * 用于：关闭标签页后又快速重开（新 tab.id），通过 pluginId 找到旧 instanceId 后 rekey。
   */
  findGraceInstance(pluginId: string): string | undefined {
    return this.windowManager.findInstanceInGrace(pluginId);
  }

  /** 销毁所有插件 WebContentsView——应用退出时调用 */
  dispose(): void {
    this.windowManager.dispose();
  }
}
