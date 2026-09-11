/**
 * flatten——扁平化 + compact 折叠链求解（E6#87a 从 FileTree.tsx 拆出）。
 *
 * 🔴 **模块级 mutable 单一属主**：`_compactFolders` 全仓仅在本文件声明；
 * 跨文件写走 `setCompactFolders()`（组件订阅变更时调用），读走 `compactFoldersRef`。
 */
import type { ExplorerItem, FileTreeModel } from "../../services/FileTreeModel";
import type { FlatItem } from "../../services/FileTreeKeyboard";

const lk = window.linkdesk;

/** E4V#34b: explorer.compactFolders 配置缓存——flattenTree 在 useMemo 中同步读取 */
let _compactFolders = true;
export const compactFoldersRef = { get current() { return _compactFolders; } };

/** 组件订阅到配置变更时调用（订阅生命周期留在组件里） */
export function setCompactFolders(v: boolean): void {
  _compactFolders = v;
}

/** 从 lk.configuration 加载 compactFolders */
export async function loadCompactFolders(): Promise<void> {
  _compactFolders = await lk.configuration.get("explorer.compactFolders") ?? true;
}

export function flattenTree(model: FileTreeModel): FlatItem[] {
  const result: FlatItem[] = [];
  // E4V#34b: explorer.compactFolders 配置开关
  const compactFolders = compactFoldersRef.current;
  function walk(item: ExplorerItem, depth: number, guide: boolean) {
    if (item.isDirectory && compactFolders) {
      const compacted = model.compactController.getCompactedSegments(item);
      if (compacted) {
        const leaf = findLeaf(item);
        const currentLeaf = leaf ? (model.findClosest(leaf.uri) ?? leaf) : null;
        const twistieItem = (currentLeaf && !currentLeaf.isDirectory && currentLeaf.parent)
          ? currentLeaf.parent : currentLeaf;
        const shouldUnfold = twistieItem?.isDirectory === true
          && model.isExpanded(twistieItem.uri) && twistieItem.children !== null;
        if (!shouldUnfold) {
          result.push({ item: twistieItem ?? item, depth, compactedSegments: compacted, guide });
          return;
        }
      }
    }
    result.push({ item, depth, guide });
    if (model.isExpanded(item.uri) && item.children !== null) {
      const len = item.children.length;
      for (let i = 0; i < len; i++) walk(item.children[i], depth + 1, i < len - 1);
    }
  }
  const roots = model.roots;
  for (let i = 0; i < roots.length; i++) walk(roots[i], 1, i < roots.length - 1);
  return result;
}

function findLeaf(item: ExplorerItem): ExplorerItem | null {
  if (!item.isDirectory || item.children === null || item.children.length !== 1) return item;
  const child = item.children[0];
  if (!child.isDirectory) return child;
  return findLeaf(child);
}
