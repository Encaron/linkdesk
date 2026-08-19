/**
 * 池→壳 tab 动作 wire 契约——E5.7#96（方案 §3.2 类 1：跨堆协议值归口）。
 *
 * 池组件调用 window.linkdesk.pool.tabAction(action) → IPC pool.tabAction →
 * 壳 preload → usePoolSync.onTabAction → App.handleTabAction switch。
 * 此前两端各自写裸字面量（action 字符串 + 字段名），载荷 any 全链路——
 * 一边改名另一边静默失效（多 WebView 缝）。本模块 union literal type 一处定义，
 * 壳池双端 import type——字段名/枚举值改动 tsc 双端同时报错。
 *
 * 落点：src/core/types/ipc/（#45.5 已删 shared/，不复活；electron 侧 rootDir ".."
 * 可 import type，池侧 Path B allowTypeImports 放行类型 import——决策点 1 定死）。
 *
 * 备注：TabContext 右键菜单命令（core.splitRight 等）走壳命令系统直调 useTabManager，
 * 不经本通道——splitTab.direction 只有池侧拖拽归一化后的 horizontal/vertical 两值。
 */

import type { DropZone } from "../../../pool/hooks/tabDragTypes";

/** 分屏方向——池侧 onDropSplit 已从 drop zone 归一化（MainZone:382） */
type TabSplitDirection = "horizontal" | "vertical";

/** 池→壳 tab 动作——union literal 即 wire 枚举 */
export type PoolTabAction =
  | { action: "focusTab"; tabId: string }
  | { action: "closeTab"; tabId: string }
  // closeOtherTabs/closeTabsToRight/closeAllTabs/duplicateTab 树内零发送方——
  // 但 tabAction 是插件可见 API（第三方插件可发），壳 switch 保留为契约面
  | { action: "closeOtherTabs"; groupId: string; tabId: string }
  | { action: "closeTabsToRight"; groupId: string; tabId: string }
  | { action: "closeAllTabs"; groupId: string }
  | { action: "reorderTab"; groupId: string; tabId: string; newIndex: number; oldIndex: number }
  | { action: "moveTab"; tabId: string; targetGroupId: string }
  | { action: "splitTab"; tabId: string; direction: TabSplitDirection; zone?: DropZone; targetGroupId?: string }
  | { action: "duplicateTab"; tabId: string }
  | { action: "pinTab"; tabId: string }
  | { action: "createTab"; pluginId?: string; workspaceName?: string }
  | { action: "updateSplitSizes"; anchorGroupId: string; sizes: [number, number]; branchIndex?: number };
