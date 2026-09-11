/**
 * locate——展开祖先链查询 + reveal 定位（E6#87a 从 FileTreeModel.ts 拆出）。
 *
 * `_expanded` 集合按引用传入（见 host.ts）——读走 has，reveal 的故障回滚走 delete。
 */
import { normalizePath, splitPath } from "../../utils/pathUtils";
import { toExplorerItem } from "./node";
import type { TreeHost } from "./host";
import type { ExplorerItem } from "./types";

const lk = window.linkdesk;

/** E4V#20+i: 获取节点的展开祖先链——从根到最近父节点，供 sticky scroll */
export function getAncestorsOf(node: ExplorerItem, expanded: Set<string>): ExplorerItem[] {
  const ancestors: ExplorerItem[] = [];
  let current: ExplorerItem | null = node.parent;
  while (current) {
    if (current.isDirectory) {
      // 根（parent===null）始终纳入，其他需在 _expanded 中
      if (current.parent === null || expanded.has(current.uri)) {
        ancestors.push(current);
      }
    }
    current = current.parent;
  }
  ancestors.reverse();
  return ancestors;
}

/** 回滚展开——故障时清理 _expanded，避免 twistie ▼ children=null */
export function rollbackExpanded(host: TreeHost, expanded: Set<string>, uris: string[]): void {
  for (const u of uris) expanded.delete(u);
  host.onDidChange.fire();
}

/**
 * E4V#30: 定位文件——逐段展开目录链，绕过 FileExcludeFilter。
 * 对标 VS Code IExplorerService.select()。
 *
 * 与 findClosest 的区别：路径链未加载时会自动展开。findClosest 需目录已展开，
 * 此方法逐段确保——先 expand + getChildren，再沿 children 找下一段。
 *
 * 🔥 预测 Bug R13-1 防御：展开链中途失败→回滚 _expanded，避免 twistie ▼ 但无内容。
 *
 * @returns 目标文件的 ExplorerItem，找不到返回 null
 */
export async function revealToUri(
  host: TreeHost, uri: string, expanded: Set<string>,
): Promise<ExplorerItem | null> {
  const normalized = normalizePath(uri);
  const root = host.findClosestRoot(normalized);
  if (!root) return null;

  // 目标就是根目录本身
  if (root.uri === normalized) {
    if (!host.isExpanded(root.uri)) host.expand(root.uri);
    if (root.children === null) await host.getChildren(root).catch((e: unknown) => { console.error("[FileTreeModel] 加载子项失败:", e); });
    host.onDidChange.fire();
    return root;
  }

  const relative = normalized.slice(root.uri.length).replace(/^[/\\]/, "");
  const parts = splitPath(relative);
  if (parts.length === 0) return root;

  // 记录已展开的 URI——任一段失败则全部回滚
  const newlyExpanded: string[] = [];
  let current: ExplorerItem = root;

  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i];
    const isLast = i === parts.length - 1;

    // 确保当前目录展开且 children 已加载
    if (!host.isExpanded(current.uri)) {
      host.expand(current.uri);
      newlyExpanded.push(current.uri);
    }
    if (current.children === null) {
      try {
        await host.getChildren(current);
      } catch {
        rollbackExpanded(host, expanded, newlyExpanded);
        return null;
      }
    }

    // 在 children 中查找下一段
    let child = current.children?.find((c) => c.name === segment) ?? null;

    if (!child && isLast) {
      // 末段未找到——可能是文件被 exclude 过滤掉了。
      // 用 listDir 直读磁盘确认文件存在→手动创建临时节点（对标 VS Code reveal 越过 filter）。
      const entries = await lk.filesystem.listDir(current.uri).catch(() => []);
      const entry = entries.find((e: { name: string }) => e.name === segment);
      if (entry) {
        child = toExplorerItem(entry, current);
        if (current.children) current.children.push(child);
      }
    }

    if (!child) {
      // 任一段找不到→路径不存在
      rollbackExpanded(host, expanded, newlyExpanded);
      return null;
    }

    // 末段→返回目标
    if (isLast) {
      host.onDidChange.fire();
      return child;
    }

    // 中间段必须是目录
    if (!child.isDirectory) {
      rollbackExpanded(host, expanded, newlyExpanded);
      return null;
    }

    current = child;
  }

  host.onDidChange.fire();
  return null; // unreachable
}
