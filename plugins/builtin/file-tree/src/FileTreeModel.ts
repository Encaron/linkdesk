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
import { getConfigurationValue, onDidChangeConfiguration } from "@src/core/ConfigurationService";
import type { FileExcludeFilter } from "./FileExcludeFilter";
import { CompactController } from "./CompactController";
import { Emitter } from "@src/core/CoreEvents";
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
  /** E4V#31: 装饰器回调——getChildren 创建新节点后调，避免模型层 import 插件层 */
  private _decorator: ((items: ExplorerItem[]) => void) | null = null;
  readonly compactController: CompactController;
  /** E4V#55: 模型变更通知——FileTree 订阅后自动重渲染 */
  readonly onDidChange = new Emitter<void>();

  constructor(sortOrder?: SortOrder) {
    this._sortOrder = sortOrder ?? getConfigurationValue<SortOrder>("explorer.sortOrder") ?? "default";
    this.compactController = new CompactController();
    // E4V#34a: 订阅 sortOrder 变更→重新排序已加载节点→重渲染
    onDidChangeConfiguration((key, value) => {
      if (key !== "explorer.sortOrder") return;
      this._sortOrder = (value as SortOrder) ?? "default";
      // 重新排序所有已加载的 children
      for (const root of this._roots) this._resortLoaded(root);
      this.onDidChange.fire();
    });
  }

  /** 递归重新排序已加载节点（E4V#34a） */
  private _resortLoaded(item: ExplorerItem): void {
    if (item.children) this._sort(item.children);
    if (item.isDirectory && item.children) {
      for (const child of item.children) this._resortLoaded(child);
    }
  }

  /** E4a #95d: 设置排除过滤器 */
  setExcludeFilter(filter: FileExcludeFilter): void {
    this._excludeFilter = filter;
  }

  /** E4V#31: 设置装饰器回调——getChildren 创建新节点后调用 */
  setDecorator(fn: ((items: ExplorerItem[]) => void) | null): void {
    this._decorator = fn;
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
    this.onDidChange.fire();
  }

  /** 懒加载子节点——对标 VS Code ExplorerModel.getChildren() */
  async getChildren(parent: ExplorerItem): Promise<ExplorerItem[]> {
    // 🔥 防御过时引用：syncRoots 可能重建了 _roots，传入的 parent 可能是旧对象。
    // 用 URI 查找当前活跃对象，确保 children 写到正确的实例上。
    const current = this.findClosest(parent.uri) ?? parent;
    if (current.children !== null) { this.onDidChange.fire(); return current.children; }
    const entries = await listDir(current.uri);
    const parentLen = current.uri.length;
    const filtered = this._excludeFilter
      ? entries.filter((e) => {
          const relPath = e.path.replace(/\\/g, "/").slice(parentLen + 1);
          return !this._excludeFilter!.matches(relPath);
        })
      : entries;
    current.children = filtered.map((e) => this._toExplorerItem(e, current));
    this.onDidChange.fire();
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
    if (this._decorator) this._decorator(current.children);
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

  expand(uri: string): void { this._expanded.add(uri); /* fire 由 getChildren 统一触发 */ }

  collapse(uri: string): void { this._expanded.delete(uri); this.onDidChange.fire(); }
  isExpanded(uri: string): boolean { return this._expanded.has(uri); }
  collapseAll(): void { this._expanded.clear(); this.onDidChange.fire(); }

  /** E4V#6a: 获取所有已展开 URI——供工作区状态持久化（E4V#36） */
  getExpandedUris(): string[] {
    return Array.from(this._expanded);
  }

  /** E4V#20+i: 获取节点的展开祖先链——从根到最近父节点，供 sticky scroll */
  getAncestors(node: ExplorerItem): ExplorerItem[] {
    const ancestors: ExplorerItem[] = [];
    let current: ExplorerItem | null = node.parent;
    while (current) {
      if (current.isDirectory) {
        // 根（parent===null）始终纳入，其他需在 _expanded 中
        if (current.parent === null || this._expanded.has(current.uri)) {
          ancestors.push(current);
        }
      }
      current = current.parent;
    }
    ancestors.reverse();
    return ancestors;
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
  async findAndExpandToBypassExclude(uri: string): Promise<ExplorerItem | null> {
    const normalized = normalizePath(uri);
    const root = this.findClosestRoot(normalized);
    if (!root) return null;

    // 目标就是根目录本身
    if (root.uri === normalized) {
      if (!this.isExpanded(root.uri)) this.expand(root.uri);
      if (root.children === null) await this.getChildren(root).catch(() => {});
      this.onDidChange.fire();
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
      if (!this.isExpanded(current.uri)) {
        this.expand(current.uri);
        newlyExpanded.push(current.uri);
      }
      if (current.children === null) {
        try {
          await this.getChildren(current);
        } catch {
          this._rollbackExpanded(newlyExpanded);
          return null;
        }
      }

      // 在 children 中查找下一段
      let child = current.children?.find((c) => c.name === segment) ?? null;

      if (!child && isLast) {
        // 末段未找到——可能是文件被 exclude 过滤掉了。
        // 用 listDir 直读磁盘确认文件存在→手动创建临时节点（对标 VS Code reveal 越过 filter）。
        const entries = await listDir(current.uri).catch(() => []);
        const entry = entries.find((e) => e.name === segment);
        if (entry) {
          child = this._toExplorerItem(entry, current);
          if (current.children) current.children.push(child);
        }
      }

      if (!child) {
        // 任一段找不到→路径不存在
        this._rollbackExpanded(newlyExpanded);
        return null;
      }

      // 末段→返回目标
      if (isLast) {
        this.onDidChange.fire();
        return child;
      }

      // 中间段必须是目录
      if (!child.isDirectory) {
        this._rollbackExpanded(newlyExpanded);
        return null;
      }

      current = child;
    }

    this.onDidChange.fire();
    return null; // unreachable
  }

  /** 回滚展开——故障时清理 _expanded，避免 twistie ▼ children=null */
  private _rollbackExpanded(uris: string[]): void {
    for (const u of uris) this._expanded.delete(u);
    this.onDidChange.fire();
  }

  /** 递归重载已展开的子目录——refresh 后新对象 children=null 需重建 */
  private async _reloadExpandedDescendants(item: ExplorerItem): Promise<void> {
    if (!item.children) return;
    for (const child of item.children) {
      if (child.isDirectory && this._expanded.has(child.uri)) {
        child.children = null;
        await this.getChildren(child).catch(() => {});
        await this._reloadExpandedDescendants(child);
      }
    }
  }

  /** 刷新——path 为空则清空所有已展开节点的缓存。不 fire——调用方重载后统一触发 */
  async refresh(path?: string): Promise<void> {
    if (path) {
      const item = this.findClosest(path);
      if (!item?.isDirectory) return;
      // 🔥 已展开→先清再重载。getChildren 返回新对象 children=null→递归重载已展开子树
      if (this._expanded.has(item.uri)) {
        item.children = null;
        await this.getChildren(item).catch(() => {});
        await this._reloadExpandedDescendants(item);
        return;
      }
      item.children = null;
    } else {
      for (const uri of this._expanded) {
        const item = this.findClosest(uri);
        if (item) item.children = null;
      }
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
