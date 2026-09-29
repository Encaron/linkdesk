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

/**
 * 移动标签页到另一个组。
 * E5.8#51：insertIndex = 目标组内插入缝（跨组拖拽落点 = 竖杠缝隙）→ splice 中插；
 * 缺省 → append 末尾（第三方插件裸 moveTab 无落点语义）。越界钳制 [0, tabs.length]。
 */
export function reduceMoveTab(prev: TabState, tabId: string, targetGroupId: string, insertIndex?: number): TabState {
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

  // 目标组落位——insertIndex 中插（竖杠缝），缺省 append
  const insertIntoTarget = (tabs: Tab[]): Tab[] => {
    if (insertIndex === undefined) return [...tabs, tab];
    const at = Math.min(Math.max(insertIndex, 0), tabs.length);
    const next = [...tabs];
    next.splice(at, 0, tab);
    return next;
  };

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
          ? { ...g, tabs: insertIntoTarget(g.tabs), activeTabId: tab.id }
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
      if (g.id === targetGroup.id) return { ...g, tabs: insertIntoTarget(g.tabs), activeTabId: tab.id };
      return g;
    }),
  };
}

/* ── 分屏回执——「跑了、但树没变」必须说得出为什么（M2 生长格 `AI#55`）──────────
   修前：几种不同的「没做事」一律 `return prev`（`ok=true`、树一字不变、无报错）⇒ 同一个
   `ok=true` 同时承担「执行了 / 没执行 / 超层」多种含义，AI 只能靠截图与反复试探去猜。
   今日起：**单一权威 = 本层判定**（命令层只透出，⛔ 不重算深度/标签数——那会造第二份真相源）。 */

/** 分屏没做成的原因——**可分辨的字面量**（新原因必须显式登记，⛔ 不加「其它」兜底）。
 *  ⚠️ 不 export：唯一的消费者是本文件的 `refused()` 与 `SplitResult.reason`（导出过一版，
 *  `knip` 判「无人 import」⇒ 收回模块内）。 */
type SplitRefusal =
  | "no-tab-id"      // 命令面缺参数（调用方没给 tabId）——原本也是静默 no-op
  | "no-such-tab"    // tabId 不在任何组里（多数 = 刚被关掉）
  | "single-tab"     // 自切、且源组只剩这一条标签 ⇒ 源组会变空（本仓无空组占位 UI）⇒ 拒绝
  | "max-depth"      // 树深已到 `MAX_TREE_DEPTH`（splitTree.ts）——要再切得先合掉一格
  | "no-such-target" // 指定 targetGroupId 不在树里（落点组已消失）
  | "no-callbacks";  // 命令层专用：宿主没注册标签页管理器

/** 分屏回执——命令面返回值形状（门③ 的 `exec` 原样透出）。
 *  · `ok:true` 无 `noop` = 树变了；
 *  · `ok:true` ＋ `noop:true` = **调用没问题、但树没变**，`reason` 说明为什么；
 *  · `ok:false` ＋ `noop:true` = 这次**调用**有问题（缺参数 / 没宿主）。
 *  ⛔ 三种都不许再靠「什么都不回」表达。 */
export interface SplitResult {
  ok: boolean;
  noop?: true;
  reason?: SplitRefusal;
}

/** 一次分屏尝试的完整产物：`state` 变没变 ＋ 回执（没变时 = 原引用） */
export interface SplitAttempt {
  state: TabState;
  result: SplitResult;
}

const SPLIT_DONE: SplitResult = { ok: true };

/** 没做事但**不是故障**——它是结果之一 */
function refused(reason: SplitRefusal): SplitResult {
  return { ok: true, noop: true, reason };
}

/**
 * 分屏（带目标面板与落点）——**判定单点**，`reduceSplitTabAt` 只是它的 `.state` 皮。
 * 对标 VS Code「拖到另一个面板边缘」。
 * targetGroupId: 鼠标落点的面板（用来算分裂方向和位置）。省略 = 源组自己（自切）。
 * zone: 拖拽落点方向（left/right/up/down）——决定新面板在目标面板的哪一侧。
 */
export function attemptSplitTabAt(
  prev: TabState,
  tabId: string,
  direction: "horizontal" | "vertical",
  targetGroupId?: string,
  zone?: "left" | "right" | "up" | "down"
): SplitAttempt {
  if (treeDepth(prev.root) >= MAX_TREE_DEPTH) return { state: prev, result: refused("max-depth") };

  const sourceGroup = findGroup(prev, tabId);
  if (!sourceGroup) return { state: prev, result: refused("no-such-tab") };

  const tab = sourceGroup.tabs.find((t) => t.id === tabId)!;
  const effectiveTarget = targetGroupId ?? sourceGroup.id;

  // 从源组移除 tab
  const sourceRemaining = sourceGroup.tabs.filter((t) => t.id !== tabId);

  // 🔴 自切 ＋ 源组只剩这一条 ⇒ 源组会变空，而本仓没有空组占位 UI ⇒ **响亮拒绝**。
  //    ⛔ 别退回老路「先摘叶、再到目标处建 branch」：单叶树时目标已消失 ⇒ 静默 `return prev`；
  //    单组树时目标还在 ⇒ 同一条标签被留在**两个组**里（同 id 双开 = 更坏的静默）。
  if (effectiveTarget === sourceGroup.id && sourceRemaining.length === 0) {
    return { state: prev, result: refused("single-tab") };
  }

  // 创建新 group（含被拖走的 tab）——放在守卫之后：被拒的那几次不再白吃一个组号
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
  if (!newRoot) return { state: prev, result: refused("no-such-target") };

  return {
    state: {
      groups: groupsWithoutSource.concat(newGroup),
      activeGroupId: newGroup.id,
      root: newRoot,
    },
    result: SPLIT_DONE,
  };
}

/** 分屏（带目标面板与落点）——状态转换皮；回执走 `attemptSplitTabAt`（`AI#55`） */
export function reduceSplitTabAt(
  prev: TabState,
  tabId: string,
  direction: "horizontal" | "vertical",
  targetGroupId?: string,
  zone?: "left" | "right" | "up" | "down"
): TabState {
  return attemptSplitTabAt(prev, tabId, direction, targetGroupId, zone).state;
}

/**
 * 分屏（源组自己）——`core.splitDown` / `core.splitRight` 那条路，**判定单点**同 `attemptSplitTabAt`。
 */
export function attemptSplitTab(
  prev: TabState,
  tabId: string,
  direction: "horizontal" | "vertical"
): SplitAttempt {
  // 深度限制
  if (treeDepth(prev.root) >= MAX_TREE_DEPTH) return { state: prev, result: refused("max-depth") };

  const sourceGroup = findGroup(prev, tabId);
  if (!sourceGroup) return { state: prev, result: refused("no-such-tab") };
  if (sourceGroup.tabs.length < 1) return { state: prev, result: refused("no-such-tab") };

  const tab = sourceGroup.tabs.find((t) => t.id === tabId)!;
  const sourceRemaining = sourceGroup.tabs.filter((t) => t.id !== tabId);

  // ── 源组只有 1 个 tab → 分屏后源组会变空 → 拒绝（对标 VS Code 空组行为，V3 暂无空组占位 UI）──
  //    `AI#55`：拒绝照旧，但**不再静默**——回 `noop` ＋ `reason`，AI 由此看得见「跑了、没变、为什么」。
  if (sourceRemaining.length === 0) return { state: prev, result: refused("single-tab") };

  // 创建新 group（含被拖走的 tab）——守卫之后才建：被拒的那几次不再白吃一个组号
  const newGroup = createGroup([tab]);

  // ── 正常分屏：源组至少还有 1 个 tab，创建 branch ──
  const sourceActiveId = sourceGroup.activeTabId === tabId
    ? (sourceRemaining[0]?.id ?? "")
    : sourceGroup.activeTabId;

  const newRoot = replaceLeafWithBranch(prev.root, sourceGroup.id, direction, newGroup.id);
  if (!newRoot) return { state: prev, result: refused("no-such-target") };

  const newGroups = prev.groups
    .map((g) =>
      g.id === sourceGroup.id
        ? { ...g, tabs: sourceRemaining, activeTabId: sourceActiveId }
        : g
    )
    .concat(newGroup);

  return {
    state: {
      groups: newGroups,
      activeGroupId: newGroup.id,
      root: newRoot,
    },
    result: SPLIT_DONE,
  };
}

/** 分屏——在 tab 所在面板的方向创建新面板（向后兼容皮；回执走 `attemptSplitTab`） */
export function reduceSplitTab(
  prev: TabState,
  tabId: string,
  direction: "horizontal" | "vertical"
): TabState {
  return attemptSplitTab(prev, tabId, direction).state;
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

/**
 * M2 `AI#21`：分屏比例**整体复位**——树里所有 branch 的 sizes 回 `[50, 50]`
 * （分屏时的初值，与 `splitTree.ts` 的 `replaceLeafWithBranch` 同源）。
 *
 * 这是 `updateSplitSizes` 通道的**非鼠标路径**：池侧双击分隔条只治被点的那一条分支
 * （`useDividerDrag`），本函数治整棵树——AI 不必知道 branchIndex 也能把布局收回均分。
 * 未分屏（树是单 leaf）→ 返回同一引用（调用方/测试可据此判「无事发生」）。
 */
export function reduceResetSplitSizes(prev: TabState): TabState {
  const newRoot = resetBranchSizes(prev.root);
  return newRoot === prev.root ? prev : { ...prev, root: newRoot };
}

function resetBranchSizes(node: SplitNode): SplitNode {
  if (node.type === "leaf") return node;
  const left = resetBranchSizes(node.children[0]);
  const right = resetBranchSizes(node.children[1]);
  const unchanged = left === node.children[0] && right === node.children[1]
    && node.sizes[0] === 50 && node.sizes[1] === 50;
  return unchanged ? node : { ...node, children: [left, right], sizes: [50, 50] };
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
