/**
 * node——ExplorerItem 的构造与排序（E6#87a 从 FileTreeModel.ts 拆出）。
 */
import type { FileEntry } from "@linkdesk/contracts";
import { normalizePath, extension } from "../../utils/pathUtils";
import type { ExplorerItem, SortOrder } from "./types";

/** E4V#7: 6 种排序——对标 VS Code SortOrder enum */
export function sortItems(items: ExplorerItem[], order: SortOrder): void {
  items.sort((a, b) => {
    // 目录优先（default + foldersNestsFiles）
    if (order === "default" || order === "foldersNestsFiles") {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    }
    // 文件优先
    if (order === "filesFirst") {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? 1 : -1;
    }
    // 按类型（扩展名）
    if (order === "type") {
      const ea = extension(a.name);
      const eb = extension(b.name);
      if (ea !== eb) return ea.localeCompare(eb);
    }
    // 按修改时间（最新在前）
    if (order === "modified") {
      const ma = a.modifiedAt ?? 0;
      const mb = b.modifiedAt ?? 0;
      if (ma !== mb) return mb - ma;
    }
    // mixed + 最终平局：按名称字母序
    return a.name.localeCompare(b.name);
  });
}

export function toExplorerItem(entry: FileEntry, parent: ExplorerItem | null): ExplorerItem {
  return {
    uri: normalizePath(entry.path),
    name: entry.name,
    isDirectory: entry.isDirectory,
    isSymlink: false,
    children: null,
    parent,
    size: entry.size,
    modifiedAt: entry.modifiedAt,
    isReadonly: entry.isReadonly,
  };
}
