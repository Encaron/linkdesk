/**
 * ViewContainerService 折叠持久化域——自 ViewContainerService.ts 拆出（E5.8#0d.10-11c）。
 * loadCollapsedState/setCollapsed/isCollapsed 三方法模块化——唯一不碰实例私有状态的独立域
 * （只走 PluginStateService，零 this._* 依赖）→ 委派式拆分，聚合器保留同名方法薄委派。
 * 依赖方向：collapsed → plugins/PluginStateService（getPluginStateValue/setPluginStateValue/APP_PLUGIN_ID）。
 *
 * E5.8#41.9.2：持久化键迁移——collapsedViews 存 `pluginId:viewId` 复合键数组（#41.8 碰撞面 #5）。
 *  loadCollapsedState strip 复合→裸 viewId 供池折叠态种子；存量裸键（升级前遗留）静默弃（不迁移不报错）。
 */

import { getPluginStateValue, setPluginStateValue, APP_PLUGIN_ID } from "../../plugins/PluginStateService";
import { viewKey, splitViewKey, isViewKey } from "./keys";

/** 读持久化原始数组（含存量裸键——loadCollapsedState 静默弃，setCollapsed 只在复合键上增删） */
function readCollapsedRaw(): string[] {
  return getPluginStateValue<string[]>(APP_PLUGIN_ID, "collapsedViews") ?? [];
}

/** 加载持久化的折叠状态——E5.8#41.9.2：只收复合键 `pluginId:viewId` → strip 出 viewId；存量裸键静默弃 */
export function loadCollapsedState(): Set<string> {
  const result = new Set<string>();
  for (const key of readCollapsedRaw()) {
    if (!isViewKey(key)) continue;
    result.add(splitViewKey(key)[1]);
  }
  return result;
}

/** 保存单个 view 折叠状态——E5.8#41.9.2：签名加 pluginId，复合键精确寻址同名视图 */
export function setCollapsed(pluginId: string, viewId: string, collapsed: boolean): void {
  const key = viewKey(pluginId, viewId);
  const saved = readCollapsedRaw();
  const idx = saved.indexOf(key);
  if (collapsed && idx === -1) saved.push(key);
  else if (!collapsed && idx !== -1) saved.splice(idx, 1);
  setPluginStateValue(APP_PLUGIN_ID, "collapsedViews", saved).catch((e) => { console.error("[ViewContainer] 保存折叠状态失败:", e); });
}

/** 查询 view 是否持久化为折叠——E5.8#41.9.2：签名加 pluginId，复合键精确查询 */
export function isCollapsed(pluginId: string, viewId: string): boolean {
  return readCollapsedRaw().includes(viewKey(pluginId, viewId));
}
