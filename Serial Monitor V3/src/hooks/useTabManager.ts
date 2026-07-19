/**
 * useTabManager — 标签页状态管理 hook。
 * Phase 3 v4：VS Code 模型——每个面板独立标签栏，TabGroup 管理标签页归属。
 *
 * 设计依据：[V3-Phase3-标签页分屏设计.md §3]
 */

import { useState, useCallback, useRef } from "react";
import i18n from "../i18n";
import {
  type SplitNode,
  getAllLeafGroupIds,
  treeDepth,
  MAX_TREE_DEPTH,
  findParentInTree,
  replaceLeafWithBranch,
  removeLeafFromTree,
  migrateLayout,
} from "./splitTree";
import { LEGACY_TYPE_TO_PLUGIN_ID } from "../core/types";
import { getTabBehavior, findFallbackPlugin, getViewPlugin } from "../pluginLoader/viewRegistry";

/* ── 类型 ── */

export type TabType = "terminal" | "workspace" | "oled" | "settings" | "editor" | "welcome" | "plugin-detail" | "marketplace";

export interface Tab {
  id: string;
  type: TabType;
  label: string;
  workspaceName?: string;   // workspace 类型才有
  filePath?: string;         // editor 类型才有
  dirty: boolean;
  /** Phase 4：指定哪个插件实现该标签页。渲染走 pluginId，规则走 type。 */
  pluginId?: string;
  /** Phase 4 预留：数据源标识（= 终端标签页的 id），Phase 5 卡片绑定数据源用。 */
  sourceId?: string;
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

/* ── 默认值工厂 ── */

let _terminalCounter = 0;

export function resetTerminalCounter(n = 0): void {
  _terminalCounter = n;
}

/** type 可能是内置 TabType 或自定义 pluginId——创建 Tab 时统一对待 */
export function createTabDefaults(
  type: string,
  overrides?: Partial<Tab>
): Tab {
  const pluginId = overrides?.pluginId ?? LEGACY_TYPE_TO_PLUGIN_ID[type] ?? type;
  const base: Tab = {
    id: "",
    type: type as TabType,
    label: getDefaultLabel(type, overrides?.workspaceName, overrides?.filePath),
    workspaceName: overrides?.workspaceName,
    filePath: overrides?.filePath,
    dirty: false,
    pluginId,
    sourceId: overrides?.sourceId,
  };

  if (type === "terminal") {
    _terminalCounter++;
    base.id = `terminal-${_terminalCounter}`;
  } else if (type === "welcome") {
    base.id = "welcome";
  } else if (type === "workspace" && base.workspaceName) {
    base.id = `workspace-${base.workspaceName}`;
  } else if (type === "editor" && base.filePath) {
    base.id = `editor-${base.filePath.replace(/[^a-zA-Z0-9]/g, "_")}`;
  } else {
    base.id = type;
  }

  // sourceId 默认 = tab.id——跨组移动时组件用此 ID 恢复状态
  if (!base.sourceId) base.sourceId = base.id;

  return { ...base, ...overrides, id: base.id };
}

/** 标签名——内置类型走 i18n，自定义插件从 viewRegistry 拿名称 */
export function getDefaultLabel(
  type: string,
  workspaceName?: string,
  filePath?: string
): string {
  switch (type) {
    case "terminal":  return i18n.t("终端");
    case "workspace": return workspaceName || i18n.t("工作台");
    case "settings":  return i18n.t("设置");
    case "oled":      return i18n.t("OLED");
    case "editor":    return filePath || i18n.t("编辑器");
    case "welcome":   return i18n.t("欢迎");
    case "plugin-detail": return i18n.t("插件详情");
    case "marketplace": return i18n.t("插件市场");
    default: {
      // 自定义插件——从 viewRegistry 查显示名
      const plugin = getViewPlugin(type);
      return plugin?.manifest.name ?? type;
    }
  }
}

/* ── 辅助 ── */

let _groupCounter = 0;

function createGroup(tabs: Tab[] = []): TabGroup {
  _groupCounter++;
  return {
    id: `group-${_groupCounter}`,
    tabs,
    activeTabId: tabs[0]?.id ?? "",
  };
}

/** Phase 4：只在全场标签页数为 0 时才补保底标签页（对标浏览器——全关才重生） */
function ensureFallback(state: TabState): TabState {
  const all = allTabs(state);
  if (all.length === 0) {
    const fallbackId = findFallbackPlugin()?.pluginId ?? "welcome";
    const fb = createTabDefaults(fallbackId);
    const mainGroup = state.groups.find((g) => g.id === state.activeGroupId) ?? state.groups[0];
    if (mainGroup) {
      mainGroup.tabs = [fb];
      mainGroup.activeTabId = fb.id;
    }
  }
  return state;
}

/** 选焦点标签页——关掉后选相邻的 */
function pickNextActive(tabs: Tab[], closedId: string): string {
  const idx = tabs.findIndex((t) => t.id === closedId);
  if (idx === -1) return tabs[0]?.id ?? "";
  const next = tabs[idx + 1] || tabs[idx - 1];
  return next?.id ?? "";
}

/* ── 初始状态 ── */

export function createInitialTabState(): TabState {
  // Phase 4：查 viewRegistry 找 isFallback 插件，没有则降级到 welcome
  const fallbackId = findFallbackPlugin()?.pluginId ?? "welcome";
  const fb = createTabDefaults(fallbackId);
  return {
    groups: [{ id: "main", tabs: [fb], activeTabId: fb.id }],
    activeGroupId: "main",
    root: { type: "leaf", groupId: "main" },
  };
}

/* ── 纯状态转换函数 ── */

export interface CreateTabResult {
  state: TabState;
  createdId: string;
}

export function reduceCreateTab(
  prev: TabState,
  type: string,
  opts?: { workspaceName?: string; filePath?: string; label?: string; targetGroupId?: string }
): CreateTabResult {
  const all = allTabs(prev);

  // 去重：workspace 同名
  if (type === "workspace" && opts?.workspaceName) {
    const existing = all.find(
      (t) => t.type === "workspace" && t.workspaceName === opts.workspaceName
    );
    if (existing) {
      const group = findGroup(prev, existing.id)!;
      return {
        state: { ...prev, activeGroupId: group.id, groups: prev.groups.map((g) => (g.id === group.id ? { ...g, activeTabId: existing.id } : g)) },
        createdId: existing.id,
      };
    }
  }

  // Phase 4 单例去重：读 tabBehavior.singleton（不再硬编码 type 名）
  if (getTabBehavior(type).singleton && all.some((t) => t.type === type || t.pluginId === type)) {
    const existing = all.find((t) => t.type === type || t.pluginId === type)!;
    const group = findGroup(prev, existing.id)!;
    return {
      state: { ...prev, activeGroupId: group.id, groups: prev.groups.map((g) => (g.id === group.id ? { ...g, activeTabId: existing.id } : g)) },
      createdId: existing.id,
    };
  }

  const overrides: Partial<Tab> = {};
  if (opts?.workspaceName) overrides.workspaceName = opts.workspaceName;
  if (opts?.filePath) overrides.filePath = opts.filePath;
  if (opts?.label) overrides.label = opts.label;
  const newTab = createTabDefaults(type, overrides);

  const targetGroupId = opts?.targetGroupId ?? prev.activeGroupId;
  const targetGroup = prev.groups.find((g) => g.id === targetGroupId);
  if (!targetGroup) return { state: prev, createdId: "" };

  const newGroups = prev.groups.map((g) => {
    if (g.id !== targetGroupId) return g;
    return { ...g, tabs: [...g.tabs, newTab], activeTabId: newTab.id };
  });

  return {
    state: { ...prev, groups: newGroups, activeGroupId: targetGroupId },
    createdId: newTab.id,
  };
}

/** Phase 4 归一化：type 可以是内置 TabType 或自定义 pluginId */
export function reduceOpenOrFocus(
  prev: TabState,
  type: string,
  lastFocusedId?: string | null
): { state: TabState; focusedId: string | null } {
  const all = allTabs(prev);
  // 同时按 type 和 pluginId 匹配——归一化后两者等价
  const existing = all.filter((t) => t.type === type || t.pluginId === type);

  if (existing.length > 0) {
    const target = existing.find((t) => t.id === lastFocusedId) ?? existing[existing.length - 1];
    const group = findGroup(prev, target.id)!;
    return {
      state: {
        ...prev,
        activeGroupId: group.id,
        groups: prev.groups.map((g) => (g.id === group.id ? { ...g, activeTabId: target.id } : g)),
      },
      focusedId: target.id,
    };
  }

  // 隐式创建：任何 type 都可以——不再只认 terminal/settings
  const r = reduceCreateTab(prev, type);
  if (r.createdId) {
    return { state: r.state, focusedId: r.createdId };
  }

  return { state: prev, focusedId: null };
}

export function reduceFocusTab(prev: TabState, tabId: string): TabState {
  const group = findGroup(prev, tabId);
  if (!group) return prev;
  return {
    ...prev,
    activeGroupId: group.id,
    groups: prev.groups.map((g) =>
      g.id === group.id ? { ...g, activeTabId: tabId } : g
    ),
  };
}

export interface CloseTabResult {
  closed: boolean;
  tabId: string;
  reason?: "blocked" | "dirty" | "unsplit";
  state?: TabState;
  newActiveTabId?: string;
}

export function reduceCloseTab(prev: TabState, tabId: string): CloseTabResult {
  const group = findGroup(prev, tabId);
  if (!group) return { closed: false, tabId, reason: "blocked" };

  const tab = group.tabs.find((t) => t.id === tabId)!;

  // dirty 阻断
  if (tab.dirty) {
    return { closed: false, tabId, reason: "dirty" };
  }

  // 从组中移除
  const remaining = group.tabs.filter((t) => t.id !== tabId);

  // 该组变空
  if (remaining.length === 0) {
    const allLeafIds = getAllLeafGroupIds(prev.root);
    if (allLeafIds.length > 1) {
      // 多面板 → 移除该 leaf
      const result = removeLeafFromTree(prev.root, group.id);
      if (result) {
        const newGroups = prev.groups.filter((g) => g.id !== group.id);
        const survivingGroup = prev.groups.find((g) => g.id === result.survivingSiblingGroupId);
        const newState = ensureFallback({
          groups: newGroups,
          activeGroupId: result.survivingSiblingGroupId,
          root: result.tree,
        });
        return { closed: true, tabId, reason: "unsplit", state: newState, newActiveTabId: survivingGroup?.activeTabId ?? "" };
      }
    }
    // 单面板 + 最后一个标签页 → 全场 0 标签，ensureFallback 补欢迎页
    const fbId = findFallbackPlugin()?.pluginId ?? "welcome";
    const fb = createTabDefaults(fbId);
    const newGroups = prev.groups.map((g) =>
      g.id === group.id ? { ...g, tabs: [fb], activeTabId: fb.id } : g
    );
    return {
      closed: true, tabId,
      state: { ...prev, groups: newGroups, root: prev.root },
      newActiveTabId: fb.id,
    };
  }

  const newActiveId = pickNextActive(remaining, tabId);
  const newGroups = prev.groups.map((g) =>
    g.id === group.id ? { ...g, tabs: remaining, activeTabId: newActiveId } : g
  );

  return {
    closed: true, tabId,
    state: { ...prev, groups: newGroups },
    newActiveTabId: newActiveId,
  };
}

export function reduceForceCloseTab(prev: TabState, tabId: string): CloseTabResult {
  const group = findGroup(prev, tabId);
  if (!group) return { closed: false, tabId, reason: "blocked" };
  // dirty 已由调用方清除，直接走正常关闭
  return reduceCloseTab({ ...prev }, tabId);
}

/** 移动标签页到另一个组 */
export function reduceMoveTab(prev: TabState, tabId: string, targetGroupId: string): TabState {
  const sourceGroup = findGroup(prev, tabId);
  if (!sourceGroup || sourceGroup.id === targetGroupId) return prev;

  const tab = sourceGroup.tabs.find((t) => t.id === tabId)!;
  const targetGroup = prev.groups.find((g) => g.id === targetGroupId);
  if (!targetGroup) return prev;

  // 从源组移除
  const sourceRemaining = sourceGroup.tabs.filter((t) => t.id !== tabId);
  const sourceActiveId = sourceGroup.activeTabId === tabId
    ? (sourceRemaining[0]?.id ?? "")
    : sourceGroup.activeTabId;

  // 如果源组变空 → 从树中移除该 leaf
  if (sourceRemaining.length === 0) {
    const allLeafIds = getAllLeafGroupIds(prev.root);
    let newRoot = prev.root;
    if (allLeafIds.length > 1) {
      const result = removeLeafFromTree(prev.root, sourceGroup.id);
      if (result) newRoot = result.tree;
    }
    const newGroups = prev.groups
      .filter((g) => g.id !== sourceGroup.id)
      .map((g) =>
        g.id === targetGroupId
          ? { ...g, tabs: [...g.tabs, tab], activeTabId: tab.id }
          : g
      );
    return {
      ...prev,
      groups: newGroups,
      activeGroupId: targetGroupId,
      root: newRoot,
    };
  }

  return {
    ...prev,
    activeGroupId: targetGroupId,
    groups: prev.groups.map((g) => {
      if (g.id === sourceGroup.id) return { ...g, tabs: sourceRemaining, activeTabId: sourceActiveId };
      if (g.id === targetGroup.id) return { ...g, tabs: [...g.tabs, tab], activeTabId: tab.id };
      return g;
    }),
  };
}

/**
 * 分屏——在指定目标面板的方向创建新面板，对标 VS Code "拖到另一个面板边缘"。
 * targetGroupId: 鼠标落点的面板（用来算分裂方向和位置）。
 * zone: 拖拽落点方向（left/right/up/down）——决定新面板在目标面板的哪一侧。
 * 如果省略，默认用 tab 所在的源组，新面板放右边/下边。
 */
export function reduceSplitTabAt(
  prev: TabState,
  tabId: string,
  direction: "horizontal" | "vertical",
  targetGroupId?: string,
  zone?: "left" | "right" | "up" | "down"
): TabState {
  if (treeDepth(prev.root) >= MAX_TREE_DEPTH) return prev;

  const sourceGroup = findGroup(prev, tabId);
  if (!sourceGroup) return prev;

  const tab = sourceGroup.tabs.find((t) => t.id === tabId)!;
  const effectiveTarget = targetGroupId ?? sourceGroup.id;

  // 从源组移除 tab
  const sourceRemaining = sourceGroup.tabs.filter((t) => t.id !== tabId);

  // 创建新 group（含被拖走的 tab）
  const newGroup = createGroup([tab]);

  // ── 处理源组变空 ──
  let groupsWithoutSource = prev.groups;
  let rootWithoutSource = prev.root;

  if (sourceRemaining.length === 0) {
    // 源组空了 → 移除
    const leafIds = getAllLeafGroupIds(prev.root);
    if (leafIds.length > 1) {
      const remResult = removeLeafFromTree(prev.root, sourceGroup.id);
      if (remResult) {
        rootWithoutSource = remResult.tree;
        groupsWithoutSource = prev.groups.filter((g) => g.id !== sourceGroup.id);
      }
    }
  } else {
    // 源组还有 tab → 只 update tabs
    const sourceActiveId = sourceGroup.activeTabId === tabId
      ? (sourceRemaining[0]?.id ?? "")
      : sourceGroup.activeTabId;
    groupsWithoutSource = prev.groups.map((g) =>
      g.id === sourceGroup.id
        ? { ...g, tabs: sourceRemaining, activeTabId: sourceActiveId }
        : g
    );
  }

  // ── 在目标面板位置创建 branch ──
  // left/up → 新面板放 children[0]（左/上）；right/down → children[1]（右/下）
  const newLeafSide: 0 | 1 = (zone === "left" || zone === "up") ? 0 : 1;
  const newRoot = replaceLeafWithBranch(
    rootWithoutSource,
    effectiveTarget,
    direction,
    newGroup.id,
    newLeafSide
  );
  if (!newRoot) return prev;

  return {
    groups: groupsWithoutSource.concat(newGroup),
    activeGroupId: newGroup.id,
    root: newRoot,
  };
}

/** 复制标签页——新 ID、新实例、相同属性。对标 VS Code Shift+拖 */
export function reduceDuplicateTab(prev: TabState, tabId: string): TabState | null {
  const group = findGroup(prev, tabId);
  if (!group) return null;
  const tab = group.tabs.find((t) => t.id === tabId);
  if (!tab) return null;

  // 创建副本（terminal 会自增 ID，workspace 同名去重会被 reduceCreateTab 拦截）
  const copy = createTabDefaults(
    tab.type,
    { workspaceName: tab.workspaceName, filePath: tab.filePath, label: tab.label }
  );
  // terminal 副本用新 ID；非 terminal 追加后缀避免冲突
  if (tab.type !== "terminal") {
    copy.id = `${tab.id}-copy-${Date.now()}`;
  }
  copy.dirty = false;

  const newGroups = prev.groups.map((g) =>
    g.id === group.id
      ? { ...g, tabs: [...g.tabs, copy] }
      : g
  );

  return { ...prev, groups: newGroups, activeGroupId: group.id };
}

/** 分屏——在 tab 所在面板的方向创建新面板（向后兼容） */
export function reduceSplitTab(
  prev: TabState,
  tabId: string,
  direction: "horizontal" | "vertical"
): TabState {
  // 深度限制
  if (treeDepth(prev.root) >= MAX_TREE_DEPTH) return prev;

  const sourceGroup = findGroup(prev, tabId);
  if (!sourceGroup) return prev;
  if (sourceGroup.tabs.length < 1) return prev;

  const tab = sourceGroup.tabs.find((t) => t.id === tabId)!;
  const sourceRemaining = sourceGroup.tabs.filter((t) => t.id !== tabId);

  // 创建新 group（含被拖走的 tab）
  const newGroup = createGroup([tab]);

  // ── 源组只有 1 个 tab → 分屏后源组会变空 → 阻止（对标 VS Code 空组行为，V3 暂无空组占位 UI）──
  if (sourceRemaining.length === 0) return prev;

  // ── 正常分屏：源组至少还有 1 个 tab，创建 branch ──
  const sourceActiveId = sourceGroup.activeTabId === tabId
    ? (sourceRemaining[0]?.id ?? "")
    : sourceGroup.activeTabId;

  const newRoot = replaceLeafWithBranch(prev.root, sourceGroup.id, direction, newGroup.id);
  if (!newRoot) return prev;

  const newGroups = prev.groups
    .map((g) =>
      g.id === sourceGroup.id
        ? { ...g, tabs: sourceRemaining, activeTabId: sourceActiveId }
        : g
    )
    .concat(newGroup);

  return {
    groups: newGroups,
    activeGroupId: newGroup.id,
    root: newRoot,
  };
}

/** 收起指定面板——从树中移除该 leaf。只有一个 leaf 时忽略。 */
export function reduceUnsplit(prev: TabState, groupId: string): TabState {
  const allLeafIds = getAllLeafGroupIds(prev.root);
  if (allLeafIds.length <= 1) return prev;  // 只有一个面板，不能 unsplit

  const group = prev.groups.find((g) => g.id === groupId);
  if (!group) return prev;

  const result = removeLeafFromTree(prev.root, groupId);
  if (!result) return prev;

  const newGroups = prev.groups.filter((g) => g.id !== groupId);

  return ensureFallback({
    groups: newGroups,
    activeGroupId: result.survivingSiblingGroupId,
    root: result.tree,
  });
}

/**
 * 更新分屏尺寸。
 * anchorGroupId: 参与 resize 的两个 group 中任意一个的 groupId——用于在树中定位对应的 branch。
 * 如果树中只有一个 branch（2-pane），anchorGroupId 可以为任意 groupId。
 */
export function reduceUpdateSplitSizes(prev: TabState, anchorGroupId: string, sizes: [number, number]): TabState {
  const parent = findParentInTree(prev.root, anchorGroupId);
  if (parent) {
    // 找到了父 branch——更新它的 sizes
    const newRoot = updateBranchSizes(prev.root, parent.parent, sizes);
    if (newRoot) return { ...prev, root: newRoot };
  }
  // 如果没有父（即 anchor 是根 leaf）或者树是单 leaf——忽略
  return prev;
}

/** 在树中定位并更新特定 branch 的 sizes */
function updateBranchSizes(
  node: SplitNode,
  target: SplitNode & { type: "branch" },
  newSizes: [number, number]
): SplitNode | null {
  if (node.type === "leaf") return null;
  if (node === target) {
    return { ...node, sizes: newSizes };
  }
  const leftResult = updateBranchSizes(node.children[0], target, newSizes);
  if (leftResult) {
    return { ...node, children: [leftResult, node.children[1]] };
  }
  const rightResult = updateBranchSizes(node.children[1], target, newSizes);
  if (rightResult) {
    return { ...node, children: [node.children[0], rightResult] };
  }
  return null;
}

export function reduceSetDirty(prev: TabState, tabId: string, dirty: boolean): TabState {
  return {
    ...prev,
    groups: prev.groups.map((g) => ({
      ...g,
      tabs: g.tabs.map((t) => (t.id === tabId ? { ...t, dirty } : t)),
    })),
  };
}

export function reduceUpdateTabLabel(prev: TabState, tabId: string, label: string): TabState {
  return {
    ...prev,
    groups: prev.groups.map((g) => ({
      ...g,
      tabs: g.tabs.map((t) => (t.id === tabId ? { ...t, label } : t)),
    })),
  };
}

/** 标签栏内拖拽重排——在组内交换位置 */
export function reduceReorderTab(prev: TabState, tabId: string, toIndex: number): TabState {
  const group = findGroup(prev, tabId);
  if (!group) return prev;
  const fromIndex = group.tabs.findIndex((t) => t.id === tabId);
  if (fromIndex === -1) return prev;
  const newTabs = [...group.tabs];
  const [moved] = newTabs.splice(fromIndex, 1);
  newTabs.splice(toIndex, 0, moved);
  return {
    ...prev,
    groups: prev.groups.map((g) =>
      g.id === group.id ? { ...g, tabs: newTabs } : g
    ),
  };
}

/** 恢复布局——兼容旧格式（split: SplitLayout）和新格式（root: SplitNode） */
export function reduceRestoreLayout(saved: LayoutData): TabState {
  // 1. 验证 groups + Phase 4 自动补 pluginId（旧布局兼容）
  const validGroups = saved.groups
    .map((g) => ({
      ...g,
      tabs: g.tabs
        .filter((t) => t.id && t.type && t.label)
        .map((t) => ({
          ...t,
          pluginId: (t as Tab).pluginId ?? LEGACY_TYPE_TO_PLUGIN_ID[(t as Tab).type],
          sourceId: (t as Tab).sourceId,
        } as Tab)),
    } as typeof g))
    .filter((g) => g.tabs.length > 0);

  if (validGroups.length === 0) return createInitialTabState();

  const activeGroupId = validGroups.some((g) => g.id === saved.activeGroupId)
    ? saved.activeGroupId
    : validGroups[0].id;

  // 2. 迁移或验证树
  let root: SplitNode;
  try {
    root = migrateLayout(saved);
  } catch {
    root = { type: "leaf", groupId: validGroups[0].id };
  }

  // 3. 验证树：所有 leaf groupId 必须在 groups 中存在
  const groupIdSet = new Set(validGroups.map((g) => g.id));
  const leafIds = getAllLeafGroupIds(root);
  for (const id of leafIds) {
    if (!groupIdSet.has(id)) {
      // 树中引用了不存在的 group——回退到单面板
      root = { type: "leaf", groupId: validGroups[0].id };
      break;
    }
  }

  // 4. 确保 groups 中有树中所有 leaf 的 group（防止树中有、groups 中无）
  const groupsInTree = new Set(getAllLeafGroupIds(root));
  const filteredGroups = validGroups.filter((g) => groupsInTree.has(g.id));

  if (filteredGroups.length === 0) return createInitialTabState();

  // Phase 4：恢复布局尊重用户保存的内容——不强制插入欢迎页。
  // 关闭所有标签页时会通过 ensureFallback 自动加回。

  return {
    groups: filteredGroups,
    activeGroupId,
    root,
  };
}

/* ── Hook ── */

export function useTabManager() {
  const [tabState, setTabState] = useState<TabState>(() => createInitialTabState());

  const lastFocusedByType = useRef<Map<string, string>>(new Map());
  for (const tab of tabState.groups.flatMap((g) => g.tabs)) {
    const key = tab.pluginId ?? tab.type;
    if (!lastFocusedByType.current.has(key)) {
      lastFocusedByType.current.set(key, tab.id);
    }
  }

  const createTab = useCallback(
    (type: string, opts?: { workspaceName?: string; filePath?: string; label?: string; targetGroupId?: string }): string => {
      let createdId = "";
      setTabState((prev) => {
        const r = reduceCreateTab(prev, type, opts);
        createdId = r.createdId;
        if (createdId) {
          const tab = findGroup(r.state, createdId)?.tabs.find((t) => t.id === createdId);
          if (tab) lastFocusedByType.current.set(tab.pluginId ?? tab.type, createdId);
        }
        return r.state;
      });
      return createdId;
    },
    []
  );

  const openOrFocusTab = useCallback(
    (type: string): string | null => {
      let focusedId: string | null = null;
      setTabState((prev) => {
        const r = reduceOpenOrFocus(prev, type, lastFocusedByType.current.get(type));
        focusedId = r.focusedId;
        if (focusedId) lastFocusedByType.current.set(type, focusedId);
        return r.state;
      });
      return focusedId;
    },
    []
  );

  const focusTab = useCallback((tabId: string) => {
    setTabState((prev) => {
      const next = reduceFocusTab(prev, tabId);
      const group = findGroup(next, tabId);
      const tab = group?.tabs.find((t) => t.id === tabId);
      if (tab) lastFocusedByType.current.set(tab.pluginId ?? tab.type, tabId);
      return next;
    });
  }, []);

  const closeTab = useCallback(
    (tabId: string): CloseTabResult => {
      let result: CloseTabResult = { closed: false, tabId };
      setTabState((prev) => {
        const r = reduceCloseTab(prev, tabId);
        result = { closed: r.closed, tabId, reason: r.reason, newActiveTabId: r.newActiveTabId };
        return r.state ?? prev;
      });
      return result;
    },
    []
  );

  const forceCloseTab = useCallback(
    (tabId: string): CloseTabResult => {
      let result: CloseTabResult = { closed: false, tabId };
      setTabState((prev) => {
        const r = reduceForceCloseTab(prev, tabId);
        result = { closed: r.closed, tabId, reason: r.reason, newActiveTabId: r.newActiveTabId };
        return r.state ?? prev;
      });
      return result;
    },
    []
  );

  const moveTab = useCallback((tabId: string, targetGroupId: string) => {
    setTabState((prev) => reduceMoveTab(prev, tabId, targetGroupId));
  }, []);

  const splitTab = useCallback(
    (tabId: string, direction: "horizontal" | "vertical" = "horizontal") => {
      setTabState((prev) => reduceSplitTab(prev, tabId, direction));
    },
    []
  );

  const splitTabAt = useCallback(
    (tabId: string, direction: "horizontal" | "vertical", targetGroupId?: string, zone?: "left" | "right" | "up" | "down") => {
      setTabState((prev) => reduceSplitTabAt(prev, tabId, direction, targetGroupId, zone));
    },
    []
  );

  const duplicateTab = useCallback(
    (tabId: string): string | null => {
      let newId: string | null = null;
      setTabState((prev) => {
        const next = reduceDuplicateTab(prev, tabId);
        if (next) {
          // 找到刚创建的副本——最新的 tab
          const group = next.groups.find((g) => g.id === next.activeGroupId);
          newId = group?.tabs[group.tabs.length - 1]?.id ?? null;
        }
        return next ?? prev;
      });
      return newId;
    },
    []
  );

  const unsplit = useCallback((groupId?: string) => {
    setTabState((prev) => {
      // 如果未指定 groupId，用 activeGroupId
      const targetId = groupId ?? prev.activeGroupId;
      return reduceUnsplit(prev, targetId);
    });
  }, []);

  const updateSplitSizes = useCallback((anchorGroupId: string, sizes: [number, number]) => {
    setTabState((prev) => reduceUpdateSplitSizes(prev, anchorGroupId, sizes));
  }, []);

  const setDirty = useCallback((tabId: string, dirty: boolean) => {
    setTabState((prev) => reduceSetDirty(prev, tabId, dirty));
  }, []);

  const updateTabLabel = useCallback((tabId: string, label: string) => {
    setTabState((prev) => reduceUpdateTabLabel(prev, tabId, label));
  }, []);

  const reorderTab = useCallback((tabId: string, toIndex: number) => {
    setTabState((prev) => reduceReorderTab(prev, tabId, toIndex));
  }, []);

  const restoreLayout = useCallback((saved: LayoutData) => {
    setTabState(() => {
      const next = reduceRestoreLayout(saved);
      for (const tab of next.groups.flatMap((g) => g.tabs)) {
        lastFocusedByType.current.set(tab.pluginId ?? tab.type, tab.id);
      }
      return next;
    });
  }, []);

  const toLayoutData = useCallback((): LayoutData => {
    let data!: LayoutData;
    setTabState((prev) => {
      data = {
        groups: prev.groups.map((g) => ({ ...g })),
        activeGroupId: prev.activeGroupId,
        root: prev.root,
      };
      return prev;
    });
    return data!;
  }, []);

  return {
    tabState,
    createTab,
    openOrFocusTab,
    focusTab,
    closeTab,
    forceCloseTab,
    moveTab,
    splitTab,
    splitTabAt,
    duplicateTab,
    unsplit,
    setDirty,
    updateTabLabel,
    updateSplitSizes,
    reorderTab,
    restoreLayout,
    toLayoutData,
  };
}
