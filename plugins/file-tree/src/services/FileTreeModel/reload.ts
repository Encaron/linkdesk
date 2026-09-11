/**
 * reload——原子重载与刷新（E6#87a 从 FileTreeModel.ts 拆出）。
 */
import type { TreeHost } from "./host";
import type { ExplorerItem } from "./types";

/**
 * 🔥 原子操作：清空缓存 + 重载磁盘 + 递归重载已展开子树。
 * 三步合一——调用方不可能忘掉某一步。refresh() 和 _reloadExpandedDescendants 共用。
 */
export async function reloadItem(host: TreeHost, expanded: Set<string>, item: ExplorerItem): Promise<void> {
  item.children = null;
  await host.getChildren(item).catch((e: unknown) => { console.error("[FileTreeModel] 加载子项失败:", e); });
  await reloadExpandedDescendants(host, expanded, item);
}

/** 递归重载已展开的子目录——遍历 children，已展开目录走 reloadItem 原子重载 */
export async function reloadExpandedDescendants(host: TreeHost, expanded: Set<string>, item: ExplorerItem): Promise<void> {
  if (!item.children) return;
  for (const child of item.children) {
    if (child.isDirectory && expanded.has(child.uri)) {
      await reloadItem(host, expanded, child);
    }
  }
}

/** 刷新——path 为空则清空所有已展开节点的缓存。不 fire——调用方重载后统一触发 */
export async function refreshTree(host: TreeHost, expanded: Set<string>, path?: string): Promise<void> {
  if (path) {
    const item = host.findClosest(path);
    if (!item?.isDirectory) return;
    if (expanded.has(item.uri)) {
      await reloadItem(host, expanded, item);
      return;
    }
    item.children = null;
  } else {
    for (const uri of expanded) {
      const node = host.findClosest(uri);
      if (node) node.children = null;
    }
    for (const root of host.roots) {
      if (root.children !== null) root.children = null;
    }
    for (const root of host.roots) {
      if (expanded.has(root.uri)) {
        await reloadItem(host, expanded, root);
      }
    }
  }
}
