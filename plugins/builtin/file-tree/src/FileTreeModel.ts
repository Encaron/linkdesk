/**
 * FileTreeModel——对标 VS Code ExplorerModel。
 * E4a #88：文件树数据模型——懒加载 + 排序 + findClosest。
 *
 * 关键设计：
 *   children: null = 未加载（触发懒加载），[] = 空目录（不触发）
 *
 * VS Code 对标：src/vs/workbench/contrib/files/common/explorerModel.ts
 */

import type { FileEntry } from "@src/core/FileService";
import { listDir } from "@src/core/FileService";
import type { FileDecoration } from "@src/core/FileDecorationRegistry";
import type { FileExcludeFilter } from "./FileExcludeFilter";
import { CompactController } from "./CompactController";
import { basename, splitPath, normalizePath, extension } from "./pathUtils";

/* ── 类型 ── */

export type SortOrder = "default" | "mixed" | "filesFirst" | "type" | "modified" | "foldersNestsFiles";

export interface ExplorerItem {
  uri: string;
  name: string;
  isDirectory: boolean;
  isSymlink: boolean;
  /** null = 未加载，[] = 空目录 */
  children: ExplorerItem[] | null;
  parent: ExplorerItem | null;
  size?: number;
  modifiedAt?: number;
  decoration?: FileDecoration;
  /** E4V#10: 文件只读标记——驱动 explorerResourceReadonly context key */
  isReadonly?: boolean;
}

/* ── 模型 ── */

export class FileTreeModel {
  private _roots: ExplorerItem[] = [];
  private _expanded = new Set<string>();
  private _sortOrder: SortOrder;
  private _excludeFilter: FileExcludeFilter | null = null;
  readonly compactController: CompactController;

  constructor(sortOrder?: SortOrder) {
    this._sortOrder = sortOrder ?? "default";
    this.compactController = new CompactController();
  }

  /** E4a #95d: 设置排除过滤器 */
  setExcludeFilter(filter: FileExcludeFilter): void {
    this._excludeFilter = filter;
  }

  get roots(): ExplorerItem[] { return this._roots; }

  /** 设置工作区根 */
  async setRoots(rootPaths: string[]): Promise<void> {
    this._expanded.clear();
    this._roots = rootPaths.map((p) => ({
      uri: normalizePath(p),
      name: basename(p),
      isDirectory: true,
      isSymlink: false,
      children: null,
      parent: null,
    }));
  }

  /** 懒加载子节点——对标 VS Code ExplorerModel.getChildren() */
  async getChildren(parent: ExplorerItem): Promise<ExplorerItem[]> {
    // 🔥 防御过时引用：syncRoots 可能重建了 _roots，传入的 parent 可能是旧对象。
    // 用 URI 查找当前活跃对象，确保 children 写到正确的实例上。
    const current = this.findClosest(parent.uri) ?? parent;
    if (current.children !== null) return current.children;
    const entries = await listDir(current.uri);
    const parentLen = current.uri.length;
    const filtered = this._excludeFilter
      ? entries.filter((e) => {
          const relPath = e.path.replace(/\\/g, "/").slice(parentLen + 1);
          return !this._excludeFilter!.matches(relPath);
        })
      : entries;
    current.children = filtered.map((e) => this._toExplorerItem(e, current));
    // E4V#9: 文件嵌套——相关文件折叠为父文件的子节点
    if (this._excludeFilter) {
      const nesting = this._excludeFilter.buildNestingMap(filtered);
      // 归一化 key——FileEntry.path 可能含反斜杠
      const normalizedNesting = new Map<string, typeof filtered>();
      const nestedPaths = new Set<string>();
      for (const [parentPath, children] of nesting) {
        normalizedNesting.set(normalizePath(parentPath), children);
        for (const c of children) nestedPaths.add(normalizePath(c.path));
      }
      for (const item of current.children) {
        const nested = normalizedNesting.get(item.uri);
        if (nested) {
          item.children = nested.map((e) => this._toExplorerItem(e, item));
        }
      }
      current.children = current.children.filter((c) => !nestedPaths.has(normalizePath(c.uri)));
    }
    this._sort(current.children);
    return current.children;
  }

  /**
   * 按路径查找已加载节点——不触发懒加载。
   *
   * ⚠️ 限制：沿 root.children → child.children 链深度遍历。
   * 如果路径链中某个目录未展开（children === null），链在此断开→返回 null。
   * 需要绕过此限制的场景（如 revealInExplorer #104）用 findAndExpandToBypassExclude。
   *
   * E4b #99h：AI 进场须知——"找文件"前先确保路径已展开。
   */
  findClosest(uri: string): ExplorerItem | null {
    const root = this.findClosestRoot(uri);
    if (!root) return null;
    if (root.uri === uri) return root;

    const relative = uri.slice(root.uri.length).replace(/^[/\\]/, "");
    if (!relative) return root;
    const parts = splitPath(relative);
    let current: ExplorerItem = root;

    for (const part of parts) {
      if (!current.isDirectory || current.children === null) break;
      const child = current.children.find((c) => c.name === part);
      if (!child) break;
      current = child;
    }
    return current;
  }

  /** 查找 URI 所属的根节点 */
  findClosestRoot(uri: string): ExplorerItem | null {
    const normalized = uri.replace(/\\/g, "/");
    for (const root of this._roots) {
      const rn = root.uri.replace(/\\/g, "/");
      if (normalized === rn || normalized.startsWith(rn + "/")) return root;
    }
    return null;
  }

  /* ── 展开/折叠 ── */

  expand(uri: string): void { this._expanded.add(uri); }
  collapse(uri: string): void { this._expanded.delete(uri); }
  isExpanded(uri: string): boolean { return this._expanded.has(uri); }
  collapseAll(): void { this._expanded.clear(); }

  /** E4V#6a: 获取所有已展开 URI——供工作区状态持久化（E4V#36） */
  getExpandedUris(): string[] {
    return Array.from(this._expanded);
  }

  /**
   * TODO #104 revealInExplorer——绕过排除逐层展开到目标文件。
   * 与 findClosest 不同：路径链未加载时会自动展开（不受 files.exclude 影响）。
   * 对标 VS Code IExplorerService.select() —— 逐层 listDir + 绕过 FileExcludeFilter + 展开。
   * @returns 目标文件的 ExplorerItem，找不到返回 null
   */
  // findAndExpandToBypassExclude(uri: string): Promise<ExplorerItem | null> { /* TODO #104 */ }

  /** 刷新——path 为空则清空所有已展开节点的缓存 */
  async refresh(path?: string): Promise<void> {
    if (path) {
      const item = this.findClosest(path);
      if (item?.isDirectory) item.children = null;
    } else {
      for (const uri of this._expanded) {
        const item = this.findClosest(uri);
        if (item) item.children = null;
      }
      // 同时清空根节点缓存
      for (const root of this._roots) {
        if (root.children !== null) root.children = null;
      }
    }
  }

  /* ── 私有方法 ── */

  /** E4V#7: 6 种排序——对标 VS Code SortOrder enum */
  private _sort(items: ExplorerItem[]): void {
    const order = this._sortOrder;
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

  private _toExplorerItem(entry: FileEntry, parent: ExplorerItem | null): ExplorerItem {
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
}
