/**
 * dropTarget——由鼠标位置解析拖放目标（E6#87a 从 FileTreeDnD.ts 拆出）。
 */
import type { ExplorerItem } from "../FileTreeModel";
import { getScaledTreeItemHeight } from "../../utils/layoutTokens";
import { dirname } from "../../utils/pathUtils";
import type { FlatItem } from "../../utils/pathUtils";
import type { DropTarget } from "./types";

/** 由鼠标 Y + scrollTop 计算 flatItems 中的索引 */
export function getDropTargetIndex(
  mouseY: number,
  scrollTop: number,
  containerTop: number,
): number {
  return Math.floor((mouseY - containerTop + scrollTop) / getScaledTreeItemHeight());
}

/**
 * 解析拖放目标——给定 flatItems 和索引，返回目标目录。
 * 目录节点 → 自身。文件节点 → 其父目录。
 */
export function resolveDropTarget(
  targetIndex: number,
  flatItems: FlatItem[],
): DropTarget | null {
  if (targetIndex < 0 || targetIndex >= flatItems.length) return null;
  const fi = flatItems[targetIndex];
  const targetDir = fi.item.isDirectory ? fi.item.uri : dirname(fi.item.uri);
  return {
    index: targetIndex,
    item: fi.item,
    targetDir,
    effect: "move",
  };
}

/** 检查 source 是否是 target 的祖先——禁止拖祖先到后代 */
export function isAncestorOf(source: ExplorerItem, target: ExplorerItem): boolean {
  if (!source.isDirectory) return false;
  const sn = source.uri;
  const tn = target.uri;
  return sn !== tn && tn.startsWith(sn + "/");
}
