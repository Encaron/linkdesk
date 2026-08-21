/**
 * IpcBridgeHandler 设置套域——E5.8#41.12：settings 命名空间三方法（list/getActive/setActive）。
 * 域委派薄壳——逻辑在 FactorySlots（槽位 + 活动持久化）+ loader（title 解析）。
 * 区别于 ui.ts handleSettingsMethod（设置页导航 consumeSettingsGroup 等）——本域管
 * 「factoryRole:settings 多套并存」的枚举/切换，非设置页内部跳转。
 * 依赖方向：settings → bootstrap/FactorySlots + pluginLoader/loader；无反向。
 */

import { factorySlots } from "../../bootstrap/FactorySlots";
import { getLoadedPluginManifests } from "../../../../pluginLoader/loader";

/** title 解析——插件显示名 = manifest.name 原文（消费方自做 i18n）；清单缺失回退 pluginId（不裸崩） */
function resolveSettingsTitles(): { pluginId: string; title: string }[] {
  const titleById = new Map<string, string>();
  for (const p of getLoadedPluginManifests()) titleById.set(p.pluginId, p.manifest.name);
  return factorySlots
    .getPluginIds("settings")
    .map((pluginId) => ({ pluginId, title: titleById.get(pluginId) ?? pluginId }));
}

/** settings 命名空间方法路由——listSettingsPlugins / getActiveSettingsPlugin / setActiveSettingsPlugin */
export async function handleSettingsPluginMethod(method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    case "listSettingsPlugins":
      return resolveSettingsTitles();
    case "getActiveSettingsPlugin":
      return factorySlots.getActive("settings");
    case "setActiveSettingsPlugin": {
      const [pluginId] = args as [string];
      await factorySlots.setActive("settings", pluginId);
      return undefined;
    }
    default:
      throw new Error(`未知的设置插件方法: ${method}`);
  }
}
