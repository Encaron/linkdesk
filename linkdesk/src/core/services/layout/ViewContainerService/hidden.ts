/**
 * ViewContainerService 隐藏持久化域——自 collapsed.ts 同款模式拆出（E5.8#34 容器切换器）。
 * loadHiddenState/setHidden 二方法模块化——只走 PluginStateService，零实例私有状态依赖
 * （同 collapsed.ts 委派式拆分模式：模型 _hidden 运行时真相 + 本域持久化落盘）。
 * 依赖方向：hidden → plugins/PluginStateService（getPluginStateValue/setPluginStateValue/APP_PLUGIN_ID）。
 *
 * E5.8#41.9.2：持久化键迁移——hiddenViews 存 `pluginId:viewId` 复合键数组（#41.8 碰撞面 #4）。
 *  loadHiddenState strip 复合→裸 viewId 供模型 _hidden 种子；存量裸键（升级前遗留）静默弃（不迁移不报错）。
 */

import { getPluginStateValue, setPluginStateValue, APP_PLUGIN_ID } from "../../plugins/PluginStateService";
import { viewKey, splitViewKey, isViewKey } from "./keys";

/** 读持久化原始数组（含存量裸键——loadHiddenState 静默弃，setHidden 只在复合键上增删） */
function readHiddenRaw(): string[] {
  return getPluginStateValue<string[]>(APP_PLUGIN_ID, "hiddenViews") ?? [];
}

/** 加载持久化的隐藏状态——模型创建时种子 _hidden（重启隐藏态保持）。
 *  E5.8#41.9.2：只收复合键 `pluginId:viewId` → strip 出 viewId；存量裸键静默弃（无法归属插件，
 *  种子会导致同名视图误隐藏）。 */
export function loadHiddenState(): Set<string> {
  const result = new Set<string>();
  for (const key of readHiddenRaw()) {
    if (!isViewKey(key)) continue;
    result.add(splitViewKey(key)[1]);
  }
  return result;
}

/** 保存单个 view 隐藏状态（visible=false = 隐藏）——E5.8#41.9.2：签名加 pluginId，复合键精确寻址同名视图 */
export function setHidden(pluginId: string, viewId: string, hidden: boolean): void {
  const key = viewKey(pluginId, viewId);
  const saved = readHiddenRaw();
  const idx = saved.indexOf(key);
  if (hidden && idx === -1) saved.push(key);
  else if (!hidden && idx !== -1) saved.splice(idx, 1);
  setPluginStateValue(APP_PLUGIN_ID, "hiddenViews", saved).catch((e) => { console.error("[ViewContainer] 保存隐藏状态失败:", e); });
}
