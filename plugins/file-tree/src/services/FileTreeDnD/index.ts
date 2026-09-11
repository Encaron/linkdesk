/**
 * FileTreeDnD——拖放工具（门面）。
 * E4b #99：OS 拖入 + 树内拖拽 + 插入线/目录高亮 + 祖先后代约束。
 *
 * 原 249 行单文件按件拆出（E6#87a）：`types.ts` / `dropTarget.ts` / `execute.ts` / `useFileTreeDnD.ts`。
 */

export { useFileTreeDnD } from "./useFileTreeDnD";
export { executeSafeDrop } from "./execute";
export { getDropTargetIndex, resolveDropTarget, isAncestorOf } from "./dropTarget";
export type { DropEffect, DropTarget, DnDState, DnDCallbacks } from "./types";
