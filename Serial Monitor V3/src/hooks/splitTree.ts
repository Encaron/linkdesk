/**
 * splitTree — 递归分屏树数据结构 + 辅助函数。
 * Phase 3.x：替代扁平 SplitLayout，对标 VS Code 自由布局。
 *
 * 设计依据：[V3-Phase3-补充-递归分屏.md]
 */

import type { Tab } from "./useTabManager";

/* ── 类型 ── */

/** 递归分裂树节点——要么是叶子（含一个 TabGroup），要么是分叉（含两个子树） */
export type SplitNode =
  | { type: "leaf"; groupId: string }
  | {
      type: "branch";
      direction: "horizontal" | "vertical";
      children: [SplitNode, SplitNode];
      sizes: [number, number]; // 百分比，如 [50, 50]
    };

/** 布局持久化格式——SplitNode 可直接 JSON 序列化 */
export interface LayoutDataV2 {
  groups: { id: string; tabs: Tab[]; activeTabId: string }[];
  activeGroupId: string;
  root: SplitNode;
}

/* ── 常量 ── */

/** 最大嵌套深度——防止无限分割导致面板不可用 */
export const MAX_TREE_DEPTH = 4;

/* ── 辅助函数 ── */

/** 计算树的深度（leaf=1） */
export function treeDepth(node: SplitNode): number {
  if (node.type === "leaf") return 1;
  return 1 + Math.max(treeDepth(node.children[0]), treeDepth(node.children[1]));
}

/** 平铺所有叶子 groupId */
export function getAllLeafGroupIds(node: SplitNode): string[] {
  if (node.type === "leaf") return [node.groupId];
  return [
    ...getAllLeafGroupIds(node.children[0]),
    ...getAllLeafGroupIds(node.children[1]),
  ];
}

/** 统计叶子数量 */
export function leafCount(node: SplitNode): number {
  if (node.type === "leaf") return 1;
  return leafCount(node.children[0]) + leafCount(node.children[1]);
}

/**
 * 在树中查找 groupId 的父 branch + 它是左(0)还是右(1)孩子。
 * 如果 groupId 是根 leaf（无父节点），返回 null。
 */
export function findParentInTree(
  node: SplitNode,
  groupId: string
): { parent: SplitNode & { type: "branch" }; side: 0 | 1 } | null {
  if (node.type === "branch") {
    if (node.children[0].type === "leaf" && node.children[0].groupId === groupId) {
      return { parent: node, side: 0 };
    }
    if (node.children[1].type === "leaf" && node.children[1].groupId === groupId) {
      return { parent: node, side: 1 };
    }
    return (
      findParentInTree(node.children[0], groupId) ??
      findParentInTree(node.children[1], groupId)
    );
  }
  return null;
}

/**
 * 在树中查找 groupId 对应的 leaf 节点。
 * 返回 null 表示 groupId 不在树中。
 */
export function findLeaf(
  node: SplitNode,
  groupId: string
): (SplitNode & { type: "leaf" }) | null {
  if (node.type === "leaf") {
    return node.groupId === groupId ? node : null;
  }
  return (
    findLeaf(node.children[0], groupId) ??
    findLeaf(node.children[1], groupId)
  );
}

/**
 * 替换叶子为 branch：在 targetGroupId 的 leaf 处插入 branch(方向, [原leaf, newLeaf])。
 * 新 leaf 始终放右边/下边——children[1]。
 * 返回新树（不可变——原节点不被修改）。
 */
export function replaceLeafWithBranch(
  node: SplitNode,
  targetGroupId: string,
  direction: "horizontal" | "vertical",
  newGroupId: string
): SplitNode | null {
  if (node.type === "leaf") {
    if (node.groupId === targetGroupId) {
      return {
        type: "branch",
        direction,
        children: [node, { type: "leaf", groupId: newGroupId }],
        sizes: [50, 50],
      };
    }
    return null; // 没找到
  }
  // 递归查找
  const leftResult = replaceLeafWithBranch(
    node.children[0],
    targetGroupId,
    direction,
    newGroupId
  );
  if (leftResult) {
    return {
      ...node,
      children: [leftResult, node.children[1]],
    };
  }
  const rightResult = replaceLeafWithBranch(
    node.children[1],
    targetGroupId,
    direction,
    newGroupId
  );
  if (rightResult) {
    return {
      ...node,
      children: [node.children[0], rightResult],
    };
  }
  return null;
}

/**
 * 从树中移除 groupId 对应的 leaf。
 * 如果该 leaf 的父是 branch，用另一个 child 替换整个 branch。
 * 如果该 leaf 是根（没有父），返回 null（不能删除唯一的 leaf）。
 *
 * 返回：{ tree: 新树; survivingSiblingGroupId: 保留的兄弟 leaf 的 groupId } | null
 */
export function removeLeafFromTree(
  node: SplitNode,
  groupId: string
): { tree: SplitNode; survivingSiblingGroupId: string } | null {
  // 如果只有单个 leaf 且就是目标 → 不能删
  if (node.type === "leaf") {
    return node.groupId === groupId ? null : null;
  }

  // 左孩子是目标 leaf
  if (node.children[0].type === "leaf" && node.children[0].groupId === groupId) {
    return {
      tree: node.children[1],
      survivingSiblingGroupId:
        node.children[1].type === "leaf"
          ? node.children[1].groupId
          : getAllLeafGroupIds(node.children[1])[0],
    };
  }

  // 右孩子是目标 leaf
  if (node.children[1].type === "leaf" && node.children[1].groupId === groupId) {
    return {
      tree: node.children[0],
      survivingSiblingGroupId:
        node.children[0].type === "leaf"
          ? node.children[0].groupId
          : getAllLeafGroupIds(node.children[0])[0],
    };
  }

  // 目标在更深层——递归
  const leftResult = removeLeafFromTree(node.children[0], groupId);
  if (leftResult) {
    return {
      tree: { ...node, children: [leftResult.tree, node.children[1]] },
      survivingSiblingGroupId: leftResult.survivingSiblingGroupId,
    };
  }
  const rightResult = removeLeafFromTree(node.children[1], groupId);
  if (rightResult) {
    return {
      tree: { ...node, children: [node.children[0], rightResult.tree] },
      survivingSiblingGroupId: rightResult.survivingSiblingGroupId,
    };
  }
  return null;
}

/**
 * 根据 sizes 计算实际像素分配——满足最小尺寸约束。
 * containerPx: 容器在该方向上的像素
 * minPx: 每个 leaf 的最小像素（默认 200 水平 / 100 垂直）
 * 返回 clamped 的像素数组。
 */
export function clampSizes(
  sizes: [number, number],
  containerPx: number,
  minPx: number
): [number, number] {
  const p0 = (sizes[0] / 100) * containerPx;
  const p1 = (sizes[1] / 100) * containerPx;

  if (p0 < minPx && p1 < minPx) {
    // 两个都小于最小 → 均分
    return [50, 50];
  }
  if (p0 < minPx) {
    const clamped = (minPx / containerPx) * 100;
    return [clamped, 100 - clamped];
  }
  if (p1 < minPx) {
    const clamped = (minPx / containerPx) * 100;
    return [100 - clamped, clamped];
  }
  return sizes;
}

/**
 * 克隆整棵树——用于不可变更新前的快照。
 * SplitNode 是纯值类型，结构赋值足够，但显式函数更清晰。
 */
export function cloneTree(node: SplitNode): SplitNode {
  if (node.type === "leaf") return { ...node };
  return {
    ...node,
    children: [cloneTree(node.children[0]), cloneTree(node.children[1])],
  };
}

/**
 * 替换树中某个 leaf 的 groupId——不改变树结构。
 * 用于源组空时把 leaf 指向新 group，不创建多余 branch。
 */
export function replaceLeafGroupId(
  node: SplitNode,
  oldGroupId: string,
  newGroupId: string
): SplitNode | null {
  if (node.type === "leaf") {
    return node.groupId === oldGroupId
      ? { type: "leaf", groupId: newGroupId }
      : null;
  }
  const left = replaceLeafGroupId(node.children[0], oldGroupId, newGroupId);
  if (left) return { ...node, children: [left, node.children[1]] };
  const right = replaceLeafGroupId(node.children[1], oldGroupId, newGroupId);
  if (right) return { ...node, children: [node.children[0], right] };
  return null;
}

/**
 * 更新树中某个 branch 的 sizes。
 * 在树中查找第一个 children 匹配的 branch 并更新 sizes。
 */
export function updateSizesInTree(
  node: SplitNode,
  child0: SplitNode,
  child1: SplitNode,
  newSizes: [number, number]
): SplitNode {
  if (node.type === "leaf") return node;
  // 用引用相等判断（未 clone 的场景下）或用结构相等
  if (node.children[0] === child0 && node.children[1] === child1) {
    return { ...node, sizes: newSizes };
  }
  return {
    ...node,
    children: [
      updateSizesInTree(node.children[0], child0, child1, newSizes),
      updateSizesInTree(node.children[1], child0, child1, newSizes),
    ],
  };
}

/* ── 旧格式迁移 ── */

/** 旧 SplitLayout 格式（Phase 3 v4 扁平模型） */
export interface LegacySplitLayout {
  direction: "horizontal" | "vertical";
  groupIds: [string, string];
  sizes: [number, number];
}

/**
 * 将旧 SplitLayout 或旧 layout 对象迁移到 SplitNode。
 * 兼容三种格式：
 * - 新格式（有 root）→ 直接返回
 * - 旧分屏格式（有 split）→ 转换为两层 branch
 * - 单面板（无 split 无 root）→ 单 leaf
 */
export function migrateLayout(saved: {
  root?: SplitNode;
  split?: LegacySplitLayout | null;
  groups?: { id: string }[];
}): SplitNode {
  if (saved.root) return saved.root;

  if (saved.split && saved.split.groupIds?.length === 2) {
    return {
      type: "branch",
      direction: saved.split.direction,
      children: [
        { type: "leaf", groupId: saved.split.groupIds[0] },
        { type: "leaf", groupId: saved.split.groupIds[1] },
      ],
      sizes: saved.split.sizes,
    };
  }

  // 单面板
  const groupId = saved.groups?.[0]?.id ?? "main";
  return { type: "leaf", groupId };
}

/* ── 验证 ── */

/**
 * 验证一棵树是否有效：
 * 1. 所有 leaf 的 groupId 都在 groups 数组中
 * 2. 深度不超过 MAX_TREE_DEPTH
 * 3. 没有重复的 groupId
 * 4. sizes 总和约等于 100
 */
export function validateTree(
  node: SplitNode,
  groupIds: Set<string>
): { valid: true } | { valid: false; reason: string } {
  const allLeafIds = getAllLeafGroupIds(node);

  // 检查重复
  const seen = new Set<string>();
  for (const id of allLeafIds) {
    if (seen.has(id)) {
      return { valid: false, reason: `重复的 groupId: ${id}` };
    }
    seen.add(id);
  }

  // 检查 groupId 存在
  for (const id of allLeafIds) {
    if (!groupIds.has(id)) {
      return { valid: false, reason: `groupId "${id}" 不在 groups 中` };
    }
  }

  // 检查深度
  if (treeDepth(node) > MAX_TREE_DEPTH) {
    return {
      valid: false,
      reason: `树深度 ${treeDepth(node)} 超过最大限制 ${MAX_TREE_DEPTH}`,
    };
  }

  return { valid: true };
}
