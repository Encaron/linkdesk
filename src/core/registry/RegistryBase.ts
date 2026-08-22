/**
 * 桌子管理规则——机制 1：登记注销自动对称（E5.8#9 v2）。
 *
 * 所有 Registry 继承此类 → register() 内部调 `track()`/`markPlugin()` →
 * 插件卸载时自动逆序回滚（registrationTracker 订阅 PluginLifecycle.onWillUninstall）。
 *
 * 🔥 v2 变化（E5.8#9）：注销逻辑下放到模块级 `registrationTracker`——
 *   函数注册表（Command/Keybinding/… 非类形态）也能用同一套逆序回滚。
 *   - markPlugin(pluginId) → 登记"整插件清理" disposer（调子类 unregisterAll）
 *   - unregisterAll(pluginId) → rollback(pluginId)（归并到追踪器）
 *   - hasPlugin 删（全仓零消费，追踪器 hasRegistrations 替代）
 *   类注册表 #10 迁移到 per-entry track() 后，markPlugin/unregisterAll 即可摘除。
 *
 * @see [[hall-architecture-model]] §桌子管理规则
 * @see [[reversible-registration-decision]]
 */

import { trackRegistration, rollback } from "./registrationTracker";

export abstract class RegistryBase {
  /**
   * 登记一个 disposer（#10 迁移目标）——卸载时逆序回滚。
   * register() 内部把条目入表后调此方法登记"删这一条"的清理。
   */
  protected track(pluginId: string, disposer: () => void): () => void {
    return trackRegistration(pluginId, disposer);
  }

  /**
   * 标记插件在此 Registry 中有登记项（v1 语义保留）。
   * 登记一个"整插件清理"disposer——卸载时调用子类 unregisterAll 做真实清理。
   * 子类的每个 register 方法必须调此方法（直到 #10 迁移为 per-entry track()）。
   */
  protected markPlugin(pluginId: string): void {
    trackRegistration(pluginId, () => { this.unregisterAll(pluginId); });
  }

  /**
   * 清理插件在此 Registry 中的所有登记项。
   * v2 归并 = rollback 追踪器层（disposer 逆序跑）。子类覆写 = 真实数据结构清理。
   */
  protected unregisterAll(pluginId: string): void {
    rollback(pluginId);
  }
}
