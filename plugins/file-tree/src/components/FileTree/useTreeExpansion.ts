/**
 * useTreeExpansion——twistie 展开/折叠（E6#87a 从 FileTree.tsx 拆出）。
 */
import { useCallback } from "react";
import type { ExplorerItem, FileTreeModel } from "../../services/FileTreeModel";

export function useTreeExpansion(model: FileTreeModel) {
  return useCallback(async (item: ExplorerItem) => {
    if (!item.isDirectory && item.children === null) return;
    if (model.isExpanded(item.uri)) {
      model.collapse(item.uri);
      model.compactController.collapseCompact(item.uri);
    } else {
      model.expand(item.uri);
      model.compactController.expandCompact(item.uri);
      try {
        await model.getChildren(item);
        // 🔥 递归展开单子目录链——一次点击展开整条 compact chain
        let next = item;
        while (next.children?.length === 1 && next.children[0].isDirectory) {
          const child = next.children[0];
          model.expand(child.uri);
          model.compactController.expandCompact(child.uri);
          await model.getChildren(child);
          next = child;
        }
      } catch (e) { console.error("[file-tree] expand failed:", item.name, e); }
    }
  }, [model]);
}
