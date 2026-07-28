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

/* ── 类型 ── */

export type SortOrder = "foldersFirst" | "name" | "modifiedAt";

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
}

/* ── 模型 ── */

export class FileTreeModel {
  private _roots: ExplorerItem[] = [];
  private _expanded = new Set<string>();
  private _sortOrder: SortOrder;
  private _excludeFilter: FileExcludeFilter | null = null;

  constructor(sortOrder?: SortOrder) {
    this._sortOrder = sortOrder ?? "foldersFirst";
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
      uri: p,
      name: p.split(/[/\\]/).pop() ?? p,
      isDirectory: true,
      isSymlink: false,
      children: null,
      parent: null,
    }));
  }

  /** 懒加载子节点——对标 VS Code ExplorerModel.getChildren() */
  async getChildren(parent: ExplorerItem): Promise<ExplorerItem[]> {
    if (parent.children !== null) return parent.children;
    const entries = await listDir(parent.uri);
    const parentLen = parent.uri.replace(/\\/g, "/").length;
    const filtered = this._excludeFilter
      ? entries.filter((e) => {
          // 计算相对路径给 FileExcludeFilter.matches()
          const relPath = e.path.replace(/\\/g, "/").slice(parentLen + 1);
          return !this._excludeFilter!.matches(relPath);
        })
      : entries;
    parent.children = filtered.map((e) => this._toExplorerItem(e, parent));
    this._sort(parent.children);
    return parent.children;
  }

  /** 按路径查找已加载节点——不触发懒加载 */
  findClosest(uri: string): ExplorerItem | null {
    const root = this.findClosestRoot(uri);
    if (!root) return null;
    if (root.uri === uri) return root;

    const relative = uri.slice(root.uri.length).replace(/^[/\\]/, "");
    if (!relative) return root;
    const parts = relative.split(/[/\\]/);
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

  private _sort(items: ExplorerItem[]): void {
    items.sort((a, b) => {
      if (this._sortOrder === "foldersFirst") {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      }
      if (this._sortOrder === "modifiedAt") {
        const ma = a.modifiedAt ?? 0;
        const mb = b.modifiedAt ?? 0;
        if (ma !== mb) return mb - ma;
      }
      return a.name.localeCompare(b.name);
    });
  }

  private _toExplorerItem(entry: FileEntry, parent: ExplorerItem | null): ExplorerItem {
    return {
      uri: entry.path,
      name: entry.name,
      isDirectory: entry.isDirectory,
      isSymlink: false,
      children: null,
      parent,
      size: entry.size,
      modifiedAt: entry.modifiedAt,
    };
  }
}
