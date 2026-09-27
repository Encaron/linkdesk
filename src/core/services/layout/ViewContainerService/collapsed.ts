/**
 * ViewContainerService 折叠持久化域——自 ViewContainerService.ts 拆出（E5.8#0d.10-11c）。
 * setCollapsed/isCollapsed/loadCollapsedKeys/loadExpandedKeys 模块化——唯一不碰实例私有状态的独立域
 * （只走 PluginStateService，零 this._* 依赖）→ 委派式拆分，聚合器保留同名方法薄委派。
 * 依赖方向：collapsed → plugins/PluginStateService（getPluginStateValue/setPluginStateValue/APP_PLUGIN_ID）。
 *
 * E5.8#41.9.2：持久化键迁移——存 `pluginId:viewId` 复合键数组（#41.8 碰撞面 #5）。
 *  存量裸键（升级前遗留）静默弃（不迁移不报错）。
 *
 * 04 有效折叠集（2026-09-28）：持久化拆**两列**——`collapsedViews`（用户显式折叠）+
 *  `expandedViews`（用户显式展开）。根因：单列是「只记折叠、缺省即展开」的记录法，
 *  表达不了「插件声明 collapsed:true，用户又手动拉开」——这类视图的折叠记录无处可落，
 *  于是勾选态印反、点击方向也算反（点「展开」发 collapsed:false = 空操作）。
 *  两列互斥（同一手势的两个方向，同键不得同时在两列）；有效折叠由调用方合并：
 *  **显式展开 > 显式折叠 > 插件声明**（用户手势永远赢过插件默认）。
 */

import { getPluginStateValue, setPluginStateValue, APP_PLUGIN_ID } from "../../plugins/PluginStateService";
import { viewKey, isViewKey } from "./keys";

/** 持久化键——显式折叠 / 显式展开（两列互斥） */
const COLLAPSED_KEY = "collapsedViews";
const EXPANDED_KEY = "expandedViews";

/** 读持久化原始数组（含存量裸键——加载侧只收复合键，静默弃裸键） */
function readKeys(stateKey: string): string[] {
  return getPluginStateValue<string[]>(APP_PLUGIN_ID, stateKey) ?? [];
}

/** 写持久化数组（失败仅告警——折叠态是体验项，不阻断布局） */
function persistKeys(stateKey: string, keys: string[]): void {
  setPluginStateValue(APP_PLUGIN_ID, stateKey, keys).catch((e) => {
    console.error(`[ViewContainer] 保存折叠状态失败（${stateKey}）:`, e);
  });
}

/** 加载用户**显式折叠**的复合键集——有效折叠集第 1 列（复合键，同名视图各存各的）。
 *  存量裸键静默弃（#41.8 §3.4 不迁移不报错）。 */
export function loadCollapsedKeys(): Set<string> {
  return new Set(readKeys(COLLAPSED_KEY).filter(isViewKey));
}

/** 加载用户**显式展开**的复合键集——有效折叠集第 2 列：记录「插件声明 collapsed:true
 *  但被用户手动拉开」的视图（04 新增；旧记录法表达不了这类状态）。 */
export function loadExpandedKeys(): Set<string> {
  return new Set(readKeys(EXPANDED_KEY).filter(isViewKey));
}

/** 保存单个 view 折叠状态——E5.8#41.9.2：签名加 pluginId，复合键精确寻址同名视图。
 *  04：折叠/展开 = 同一手势的两方向 → 同键在两列之间**搬移**（互斥维护）。 */
export function setCollapsed(pluginId: string, viewId: string, collapsed: boolean): void {
  const key = viewKey(pluginId, viewId);
  const collapsedKeys = readKeys(COLLAPSED_KEY);
  const expandedKeys = readKeys(EXPANDED_KEY);
  const ci = collapsedKeys.indexOf(key);
  const ei = expandedKeys.indexOf(key);

  let changed = false;
  if (collapsed) {
    if (ci === -1) { collapsedKeys.push(key); changed = true; }
    if (ei !== -1) { expandedKeys.splice(ei, 1); changed = true; }
  } else {
    if (ci !== -1) { collapsedKeys.splice(ci, 1); changed = true; }
    if (ei === -1) { expandedKeys.push(key); changed = true; }
  }
  if (!changed) return;

  persistKeys(COLLAPSED_KEY, collapsedKeys);
  persistKeys(EXPANDED_KEY, expandedKeys);
}

/** 查询 view 是否被持久化为折叠（显式折叠列；不含插件声明——有效折叠由调用方合并）。 */
export function isCollapsed(pluginId: string, viewId: string): boolean {
  return readKeys(COLLAPSED_KEY).includes(viewKey(pluginId, viewId));
}
