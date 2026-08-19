/**
 * ViewContainerService 折叠持久化域——自 ViewContainerService.ts 拆出（E5.8#0d.10-11c）。
 * loadCollapsedState/setCollapsed/isCollapsed 三方法模块化——唯一不碰实例私有状态的独立域
 * （只走 PluginStateService，零 this._* 依赖）→ 委派式拆分，聚合器保留同名方法薄委派。
 * 依赖方向：collapsed → plugins/PluginStateService（getPluginStateValue/setPluginStateValue/APP_PLUGIN_ID）。
 */

import { getPluginStateValue, setPluginStateValue, APP_PLUGIN_ID } from "../../plugins/PluginStateService";

/** 加载持久化的折叠状态 */
export function loadCollapsedState(): Set<string> {
  const saved = getPluginStateValue<string[]>(APP_PLUGIN_ID, "collapsedViews") ?? [];
  return new Set(saved);
}

/** 保存单个 view 折叠状态 */
export function setCollapsed(viewId: string, collapsed: boolean): void {
  const saved = loadCollapsedState();
  if (collapsed) saved.add(viewId);
  else saved.delete(viewId);
  setPluginStateValue(APP_PLUGIN_ID, "collapsedViews", [...saved]).catch((e) => { console.error("[ViewContainer] 保存折叠状态失败:", e); });
}

/** 查询 view 是否持久化为折叠 */
export function isCollapsed(viewId: string): boolean {
  return loadCollapsedState().has(viewId);
}
