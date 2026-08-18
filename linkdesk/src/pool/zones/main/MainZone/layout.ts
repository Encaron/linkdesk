/**
 * MainZone 布局几何纯函数——computeLayout / buildBranchMaps / 分支 key 助手 / 常量。
 * E5.8#0d.10-6a：自 MainZone.tsx 拆出——纯函数：SplitNode 树 → 面板+分割条百分比 rect（B22 平级渲染）。
 * 零 React 依赖。依赖方向：layout → core/utils/splitTree（type）；无反向。
 */

import type { SplitNode } from "../../../../core/utils/splitTree";

export const TAB_BAR_HEIGHT = 35;

function firstLeafId(node: SplitNode): string {
  if (node.type === "leaf") return node.groupId;
  return firstLeafId(node.children[0]);
}

function getBranchKey(node: SplitNode & { type: "branch" }): string {
  return `${firstLeafId(node.children[0])}|${firstLeafId(node.children[1])}`;
}

interface PanelRect {
  groupId: string;
  x: number; y: number; w: number; h: number;
}

interface HandleRect {
  branchIndex: number;
  direction: "horizontal" | "vertical";
  x: number; y: number; w: number; h: number;
  /** 当前有效 sizes（含 localSizesRef 覆盖）——onMouseDown 时作为起始值 */
  sizes: [number, number];
}

/** Handle 宽度/高度占容器的百分比——对标旧 SplitPane 的 0.4 */
const HANDLE_PCT = 0.4;

/**
 * 从 SplitNode 树递归计算所有面板 + 分割条的百分比 rect。
 * 面板全部平级——key=groupId 永远同级，树变化只改 x/y/w/h，不触发 unmount。
 *
 * 🔴 不要改回递归 flex 嵌套——B22 教训：DOM 深度变化 → React unmount → 编辑器状态丢失。
 */
export function computeLayout(
  node: SplitNode,
  x: number, y: number, w: number, h: number,
  branchIndices: Map<string, number>,
  localSizes: Map<number, [number, number]>,
): { panels: PanelRect[]; handles: HandleRect[] } {
  if (node.type === "leaf") {
    return { panels: [{ groupId: node.groupId, x, y, w, h }], handles: [] };
  }

  const branchIdx = branchIndices.get(getBranchKey(node));
  const effective = branchIdx != null ? (localSizes.get(branchIdx) ?? node.sizes) : node.sizes;
  const total = effective[0] + effective[1];
  const s0 = total > 0 ? effective[0] / total : 0.5;
  const s1 = total > 0 ? effective[1] / total : 0.5;

  if (node.direction === "horizontal") {
    const w0 = w * s0;
    const w1 = w * s1;
    const left = computeLayout(node.children[0], x, y, w0, h, branchIndices, localSizes);
    const right = computeLayout(node.children[1], x + w0 + HANDLE_PCT, y, w1, h, branchIndices, localSizes);
    const handle: HandleRect = {
      branchIndex: branchIdx ?? 0,
      direction: "horizontal",
      x: x + w0, y,
      w: HANDLE_PCT, h,
      sizes: [effective[0], effective[1]],
    };
    return { panels: [...left.panels, ...right.panels], handles: [...left.handles, handle, ...right.handles] };
  } else {
    const h0 = h * s0;
    const h1 = h * s1;
    const top = computeLayout(node.children[0], x, y, w, h0, branchIndices, localSizes);
    const bottom = computeLayout(node.children[1], x, y + h0 + HANDLE_PCT, w, h1, branchIndices, localSizes);
    const handle: HandleRect = {
      branchIndex: branchIdx ?? 0,
      direction: "vertical",
      x, y: y + h0,
      w, h: HANDLE_PCT,
      sizes: [effective[0], effective[1]],
    };
    return { panels: [...top.panels, ...bottom.panels], handles: [...top.handles, handle, ...bottom.handles] };
  }
}

/**
 * Branch indices（pre-order, matches updateBranchSizesByIndex）——同时建 index→branch 反查表。
 * E5.7#86：回执对齐 effect 用反查表读推送分支的当前 sizes。
 */
export function buildBranchMaps(root: SplitNode | undefined): {
  branchIndices: Map<string, number>;
  branchNodesByIndex: Map<number, SplitNode & { type: "branch" }>;
} {
  const keyMap = new Map<string, number>();
  const nodeMap = new Map<number, SplitNode & { type: "branch" }>();
  let counter = 1;
  function walk(node: SplitNode): void {
    if (node.type === "branch") {
      keyMap.set(getBranchKey(node), counter);
      nodeMap.set(counter, node);
      counter++;
      walk(node.children[0]);
      walk(node.children[1]);
    }
  }
  if (root) walk(root);
  return { branchIndices: keyMap, branchNodesByIndex: nodeMap };
}
