/**
 * 标签页状态类型层——TabState 模型 + 派生纯函数 + result 契约。
 * E5.8#0d.10-2a：自 useTabManager.ts 拆出——类型定义与派生查询脱离 Hook 模块。
 * 依赖方向：types → core/utils/splitTree（仅 type SplitNode）；反向消费方（splitTree/tabIdentity/
 * usePoolSync/LayoutService）对 useTabManager 的导入全为 type-only——编译期擦除，无运行时环。
 */

import type { SplitNode } from "../../core/utils/splitTree";

/** 标签页类型——Phase 5g 从联合类型放开为 string。
 * 任何插件都可以定义自己的类型（= pluginId），不需要改核心代码。
 * VS Code 对标：EditorInput.typeId——纯字符串，不维护编辑器类型 enum。 */
export type TabType = string;

export interface Tab {
  id: string;
  type: TabType;
  label: string;
  workspaceName?: string;
  filePath?: string;
  dirty: boolean;
  pluginId?: string;
  detailPluginId?: string;
  sourceId?: string;
  /** 对标 VS Code preview editor：false=预览模式（斜体，下次点别的会替换），true=已固定 */
  pinned?: boolean;
}

export interface TabGroup {
  id: string;
  tabs: Tab[];
  activeTabId: string;
}

/** 布局持久化格式（v2：递归树） */
export interface LayoutData {
  groups: { id: string; tabs: Tab[]; activeTabId: string }[];
  activeGroupId: string;
  /** 新格式（Phase 3.x）：递归分裂树 */
  root?: SplitNode;
  /** @deprecated 旧格式（Phase 3 v4）：扁平 SplitLayout——启动时自动迁移 */
  split?: { direction: "horizontal" | "vertical"; groupIds: [string, string]; sizes: [number, number] } | null;
}

export interface TabState {
  groups: TabGroup[];
  activeGroupId: string;
  /** 递归分裂树——单面板时 = { type:"leaf", groupId:"main" } */
  root: SplitNode;
}

/** 派生：平板化所有组中的标签页 */
export function allTabs(state: TabState): Tab[] {
  return state.groups.flatMap((g) => g.tabs);
}

/** 派生：如何找到 tab 所属的组 */
export function findGroup(state: TabState, tabId: string): TabGroup | undefined {
  return state.groups.find((g) => g.tabs.some((t) => t.id === tabId));
}

export interface CreateTabResult {
  state: TabState;
  createdId: string;
}

export interface CloseTabResult {
  closed: boolean;
  tabId: string;
  reason?: "blocked" | "dirty" | "unsplit";
  state?: TabState;
  newActiveTabId?: string;
}
