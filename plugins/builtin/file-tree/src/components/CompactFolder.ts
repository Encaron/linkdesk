/**
 * CompactFolder——紧凑单子文件夹路径压缩。
 * E4a #94：对标 VS Code explorer.compactFolders。
 *
 * 当父目录只有一个子目录时，将路径压缩为单行面包屑：
 *   "src / components / Button.tsx"
 */

import type { ExplorerItem } from "../services/FileTreeModel";

/**
 * 获取压缩路径段——如果此文件夹满足压缩条件。
 * 返回 null 表示不压缩。
 *
 * 条件：文件夹有且仅有一个已加载的子节点，且子节点是文件夹。
 * 递归压缩直到遇到文件、空目录或多子目录。
 */
export function getCompactedPath(item: ExplorerItem): string[] | null {
  if (!item.isDirectory) return null;
  if (item.children === null) return null;       // 未加载→不压缩
  if (item.children.length !== 1) return null;   // 0 或 2+ → 不压缩

  const child = item.children[0];
  if (!child.isDirectory) return null;           // 唯一子节点是文件→不压缩

  // 压缩：继续检查子文件夹
  const childSegments = getCompactedPath(child);
  if (childSegments) {
    return [item.name, ...childSegments];
  }

  // 子文件夹不满足压缩条件→以子文件夹名结尾
  return [item.name, child.name];
}

/**
 * 判断 ExplorerItem 是否是压缩链的起点。
 * 用于 FileTree 决定展示为单行还是正常层级。
 */
export function isCompacted(item: ExplorerItem): boolean {
  return getCompactedPath(item) !== null;
}
