/**
 * SidebarTabSync——侧栏↔标签页三向同步归一化。
 *
 * 🔥 E3a #29a：单一真相源——替代各组件独立维护的同步逻辑。
 * Tauri 时代模式 3（三栏交互不同步）是第三大 bug 来源（18 个 bug）。
 * 根因：SidePanel/TabBar/MainContent 各自维护同步逻辑——三份拷贝，漏同步一个=一个 bug。
 *
 * 对标 VS Code：EditorService.openEditor() 是单一入口——Explorer/Tabs/Breadcrumbs 全部走它。
 * activateSidebarItem() 同理。
 *
 * 消费端：
 *   侧栏点条目 → activateSidebarItem(sourceId, pluginId, opts)
 *   标签页激活 → 对应的 sidebarPrimary 插件 useEffect(isActive) 同步自己的 active 状态
 *   图标栏点击 → App.handleIconClick 管理 sidebarView toggle（壳级 UI，不在此文件）
 */

import type { TabActions } from "./TabActionsContext";

/**
 * 侧栏条目被选中——聚焦/创建对应标签页。
 *
 * 所有 sidebarPrimary 插件的侧栏点击都应走这个函数。
 * 不在此函数内处理的事情（由调用方处理）：
 *   - 插件自己的 setActive 状态（如 terminal 的 setActiveSession）
 *   - 壳级 UI（sidebarView toggle / 图标栏）——这些是壳的 UI 状态，不属内容同步
 *
 * @param tabActions 从 useTabActions() 获取
 * @param sourceId   插件数据的唯一标识（sessionId / filePath / 等）
 * @param pluginId   插件 ID（如 "terminal"）
 * @param opts       创建标签页时的选项
 * @returns 标签页 ID，失败返回 null
 */
export function activateSidebarItem(
  tabActions: TabActions,
  sourceId: string,
  pluginId: string,
  opts?: { label?: string; pinned?: boolean },
): string | null {
  return tabActions.openOrFocusBySourceId(sourceId, pluginId, opts);
}
