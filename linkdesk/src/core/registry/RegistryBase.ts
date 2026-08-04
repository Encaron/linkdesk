/**
 * 桌子管理规则——机制 1：登记注销自动对称。
 *
 * 所有 Registry 继承此类 → 调 `markPlugin(pluginId)` →
 * 插件卸载时 `unregisterAll(pluginId)` 自动被调用。
 *
 * 消除 lifecycle.ts 中手动列举每个 Registry 的 unregister* 调用——
 * 人记不住，代码记得住。
 *
 * @see [[hall-architecture-model]] §桌子管理规则
 */

import { PluginLifecycle } from "../../pluginLoader/lifecycle";

export abstract class RegistryBase {
  /** 在此 Registry 中登记过的插件 ID 集合 */
  private _pluginIds = new Set<string>();

  protected constructor() {
    // 订阅一次——任何标记过的插件卸载时自动清理
    PluginLifecycle.onWillUninstall.event(({ pluginId }) => {
      if (this._pluginIds.has(pluginId)) {
        this.unregisterAll(pluginId);
        this._pluginIds.delete(pluginId);
      }
    });
  }

  /**
   * 标记插件在此 Registry 中有登记项。
   * 子类的每个 register 方法必须调此方法。
   */
  protected markPlugin(pluginId: string): void {
    this._pluginIds.add(pluginId);
  }

  /**
   * 插件是否在此 Registry 中登记过。
   */
  protected hasPlugin(pluginId: string): boolean {
    return this._pluginIds.has(pluginId);
  }

  /**
   * 清理插件在此 Registry 中的所有登记项。
   * 子类必须实现——知道自己的数据结构怎么删。
   */
  protected abstract unregisterAll(pluginId: string): void;
}
