/**
 * IpcBridgeHandler 系统插槽域——E5.8#41.14：factorySlots 命名空间三方法（list/getActive/setActive，收 role）。
 * 域委派薄壳——逻辑在 FactorySlots（槽位 + 活动持久化）+ loader（title 解析）。
 * 槽位无关：任意 factoryRole ≥2 候选都可枚举/切换（串口/市场/设置同源）。
 * 兼容别名：#41.12 建的 settings.* 三方法（listSettingsPlugins/getActiveSettingsPlugin/
 * setActiveSettingsPlugin）原样转发——settings 角色专用面，窗口期双面并存。
 * 区别于 ui.ts handleSettingsMethod（设置页导航 consumeSettingsGroup 等）——本域管
 * 「factoryRole 多候选并存」的枚举/切换，非设置页内部跳转。
 * 依赖方向：factory-slots → bootstrap/FactorySlots + pluginLoader/loader；无反向。
 */

import { factorySlots } from "../../bootstrap/FactorySlots";
import { getLoadedPluginManifests } from "../../../../pluginLoader/loader";

/** title 解析——插件显示名 = manifest.name 原文（消费方自做 i18n）；清单缺失回退 pluginId（不裸崩） */
function resolveSlotTitles(role: string): { pluginId: string; title: string }[] {
  const titleById = new Map<string, string>();
  for (const p of getLoadedPluginManifests()) titleById.set(p.pluginId, p.manifest.name);
  return factorySlots
    .getPluginIds(role)
    .map((pluginId) => ({ pluginId, title: titleById.get(pluginId) ?? pluginId }));
}

/** factorySlots 命名空间方法路由——listFactorySlotPlugins/getActiveFactorySlot/setActiveFactorySlot（收 role）
 *  + settings 角色专用别名三方法（#41.12 兼容） */
export async function handleFactorySlotMethod(method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    // ── settings 角色专用面（#41.12 兼容别名——settings.* 三方法原样转发）──
    case "listSettingsPlugins":
      return resolveSlotTitles("settings");
    case "getActiveSettingsPlugin":
      return factorySlots.getActive("settings");
    case "setActiveSettingsPlugin": {
      const [pluginId] = args as [string];
      await factorySlots.setActive("settings", pluginId);
      return undefined;
    }
    // ── 通用面（#41.14——list/getActive/setActive 收 role 参数，槽位无关）──
    case "listFactorySlotRoles":
      return factorySlots.listRoles();
    case "listFactorySlotPlugins": {
      const [role] = args as [string];
      return resolveSlotTitles(role);
    }
    case "getActiveFactorySlot": {
      const [role] = args as [string];
      return factorySlots.getActive(role);
    }
    case "setActiveFactorySlot": {
      const [role, pluginId] = args as [string, string];
      await factorySlots.setActive(role, pluginId);
      return undefined;
    }
    default:
      throw new Error(`未知的系统插槽方法: ${method}`);
  }
}
