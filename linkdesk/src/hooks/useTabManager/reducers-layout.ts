/**
 * 分屏/布局纯状态转换层——移动/分裂/合屏/尺寸/布局恢复。
 * E5.8#0d.10-2d：自 useTabManager.ts 拆出——不依赖 React Hook，纯函数操作 SplitNode 树。
 * _groupCounter 属主在 defaults.ts——恢复布局经 syncGroupCounterFromGroups 受控同步，不直接读写。
 * 依赖方向：reducers-layout → defaults（createGroup/createInitialTabState/ensureFallback/syncGroupCounterFromGroups）+ types + core 工具；无反向。
 */

import {
  type SplitNode,
  getAllLeafGroupIds,
  treeDepth,
  MAX_TREE_DEPTH,
  findParentInTree,
  replaceLeafWithBranch,
  removeLeafFromTree,
  migrateLayout,
  updateBranchSizesByIndex,
} from "../../core/utils/splitTree";
import { isPluginDetailView, resolveLegacyPluginId, syncCountersAfterRestore } from "../../core/utils/tabIdentity";
import { findGroup } from "./types";
import type { Tab, TabState, LayoutData } from "./types";
import { createGroup, createInitialTabState, ensureFallback, syncGroupCounterFromGroups } from "./defaults";

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

/** 收起指定面板——从树中移除该 leaf。只有一个 leaf 时忽略。
 *  G1 修复：合屏时被合面板的标签页迁移到存活面板——不丢数据。 */
export function reduceUnsplit(prev: TabState, groupId: string): TabState {
  const allLeafIds = getAllLeafGroupIds(prev.root);
  if (allLeafIds.length <= 1) return prev;  // 只有一个面板，不能 unsplit

  const group = prev.groups.find((g) => g.id === groupId);
  if (!group) return prev;

  const result = removeLeafFromTree(prev.root, groupId);
  if (!result) return prev;

  const survivingId = result.survivingSiblingGroupId;
  const migratingTabs = group.tabs;

  // G1：标签页迁移到存活面板——不直接 filter 丢掉
  const newGroups = prev.groups
    .filter((g) => g.id !== groupId)
    .map((g) =>
      g.id === survivingId
        ? { ...g, tabs: [...g.tabs, ...migratingTabs] }
        : g
    );

  return ensureFallback({
    groups: newGroups,
    activeGroupId: survivingId,
    root: result.tree,
  });
}

/**
 * 更新分屏尺寸。
 * anchorGroupId: 参与 resize 的两个 group 中任意一个的 groupId——用于在树中定位对应的 branch。
 * 如果树中只有一个 branch（2-pane），anchorGroupId 可以为任意 groupId。
 */
/**
 * 更新分屏尺寸。
 * B35：优先用 branchIndex 精确定位分支（修复深层嵌套时 handle 定位错误）。
 * 无 branchIndex 时降级为旧 anchorGroupId 方案（向后兼容）。
 */
export function reduceUpdateSplitSizes(
  prev: TabState,
  anchorGroupId: string,
  sizes: [number, number],
  branchIndex?: number,
): TabState {
  // B35：branchIndex 精确定位
  if (branchIndex != null && branchIndex > 0) {
    const newRoot = updateBranchSizesByIndex(prev.root, branchIndex, sizes);
    if (newRoot) return { ...prev, root: newRoot };
  }
  // 降级：旧 anchorGroupId 方案（2-pane 等简单场景）
  const parent = findParentInTree(prev.root, anchorGroupId);
  if (parent) {
    const newRoot = updateBranchSizes(prev.root, parent.parent, sizes);
    if (newRoot) return { ...prev, root: newRoot };
  }
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
          pluginId: (t as Tab).pluginId ?? (!isPluginDetailView((t as Tab).type) ? resolveLegacyPluginId((t as Tab).type) : undefined),
          detailPluginId: (t as Tab).detailPluginId,
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

  // G3：恢复布局后同步计数器——防止 F5 后模块级计数器归零导致新建 tab ID 碰撞
  syncCountersAfterRestore(filteredGroups.flatMap((g) => g.tabs));
  // E5.6#9f：恢复布局后同步 _groupCounter（属主迁 defaults.ts）——防止计数器归零导致 group-1 重复 key
  syncGroupCounterFromGroups(filteredGroups);

  return {
    groups: filteredGroups,
    activeGroupId,
    root,
  };
}
