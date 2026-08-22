/**
 * FileTreeModel——对标 VS Code ExplorerModel。
 * E4a #88：文件树数据模型——懒加载 + 排序 + findClosest。
 *
 * 关键设计：
 *   children: null = 未加载（触发懒加载），[] = 空目录（不触发）
 *
 * VS Code 对标：src/vs/workbench/contrib/files/common/explorerModel.ts
 */

// E5.8#20-c：FileEntry 契约化——types/fileEntry 已打入 linkdesk.d.ts，插件走 @linkdesk/contracts（零 @src/core）
import type { FileEntry } from "@linkdesk/contracts";
import type { FileExcludeFilter } from "./FileExcludeFilter";
import { CompactController } from "./CompactController";
import { basename, splitPath, normalizePath, extension } from "../utils/pathUtils";

// E5.7#60：本地装饰契约类型——原 @src/core/registry/FileDecorationRegistry 已整删（注册表池内化，
// 经 linkdesk.decorations 消费）；形状与 01-插件API契约 §3.24 的 FileDecoration 对齐
export interface FileDecoration {
  badge?: string;
  tooltip?: string;
  color?: string;
  propagate?: boolean;
}

const lk = window.linkdesk;

// E5.6#11.5g1：MiniEmitter——内联替代 @src/core Emitter，纯工具类无全局状态
class MiniEmitter<T> {
  private _listeners = new Set<(data: T) => void>();
  private _event?: (listener: (data: T) => void) => () => void;

  get event(): (listener: (data: T) => void) => () => void {
    if (!this._event) {
      this._event = (listener: (data: T) => void): (() => void) => {
        this._listeners.add(listener);
        return () => { this._listeners.delete(listener); };
      };
    }
    return this._event;
  }

  fire(data: T): void {
    for (const fn of this._listeners) {
      try { fn(data); } catch { /* 错误隔离——一个监听器崩溃不阻塞其他 */ }
    }
  }

  dispose(): void { this._listeners.clear(); }
}

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
  private _decorator: ((items: ExplorerItem[]) => void | Promise<void>) | null = null;
  readonly compactController: CompactController;
  /** E4V#55: 模型变更通知——FileTree 订阅后自动重渲染 */
  readonly onDidChange = new MiniEmitter<void>();

  constructor(sortOrder?: SortOrder) {
    this._sortOrder = sortOrder ?? "default";
    this.compactController = new CompactController();
  }

  /** E4V#34a: 从 lk.configuration API 加载 sortOrder 配置并订阅变更 */
  async init(): Promise<void> {
    const saved = await lk.configuration.get<SortOrder>("explorer.sortOrder");
    if (saved) this._sortOrder = saved;
    lk.configuration.onChange<SortOrder>("explorer.sortOrder", (value) => {
      this._sortOrder = value ?? "default";
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

  /** E4a #95d: 设置排除过滤器——null 清除（内部字段本就 FileExcludeFilter | null，签名补齐契约） */
  setExcludeFilter(filter: FileExcludeFilter | null): void {
    this._excludeFilter = filter;
  }

  /** E4V#31: 设置装饰器回调——getChildren 创建新节点后调用 */
  setDecorator(fn: ((items: ExplorerItem[]) => void | Promise<void>) | null): void {
    this._decorator = fn;
  }

  get roots(): ExplorerItem[] { return this._roots; }

  /** 设置工作区根 */
  async setRoots(rootPaths: string[]): Promise<void> {
    // E4V#35c: 选择性清除——只清理已移除的根对应的展开项，保留仍存在的根的展开状态
    const normalizedRoots = rootPaths.map((p) => normalizePath(p));
    for (const uri of this._expanded) {
      if (!normalizedRoots.some((r) => uri === r || uri.startsWith(r + "/"))) {
        this._expanded.delete(uri);
      }
    }
    this._roots = normalizedRoots.map((p) => ({
      uri: p,
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
    const entries = await lk.filesystem.listDir(current.uri);
    const parentLen = current.uri.length;
    const filtered = this._excludeFilter
      ? entries.filter((e: FileEntry) => {
          const relPath = normalizePath(e.path).slice(parentLen + 1);
          return !this._excludeFilter!.matches(relPath);
        })
      : entries;
    current.children = filtered.map((e: FileEntry) => this._toExplorerItem(e, current));
    this.onDidChange.fire();
    // E4V#9: 文件嵌套——相关文件折叠为父文件的子节点
    // E4V#34g2: explorer.fileNesting.enabled 开关——默认 false
    if (this._excludeFilter && (await lk.configuration.get("explorer.fileNesting.enabled") ?? false)) {
      const nesting = this._excludeFilter.buildNestingMap(filtered);
      // 归一化 key——FileEntry.path 可能含反斜杠
      const normalizedNesting = new Map<string, typeof filtered>();
      const nestedPaths = new Set<string>();
      for (const [parentPath, children] of nesting) {
        normalizedNesting.set(normalizePath(parentPath), children);
        for (const c of children) nestedPaths.add(normalizePath(c.path));
      }
      const expandNesting = await lk.configuration.get("explorer.fileNesting.expand") ?? true;
      for (const item of current.children ?? []) {
        const nested = normalizedNesting.get(item.uri);
        if (nested) {
          item.children = nested.map((e: FileEntry) => this._toExplorerItem(e, item));
          // E4V#34k: explorer.fileNesting.expand——嵌套后默认展开父项
          if (expandNesting) this.expand(item.uri);
        }
      }
      current.children = current.children!.filter((c) => !nestedPaths.has(normalizePath(c.uri)));
    }
    if (current.children) this._sort(current.children);
    if (this._decorator && current.children) await this._decorator(current.children);
    return current.children ?? [];
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
    const normalized = normalizePath(uri);
    for (const root of this._roots) {
      const rn = root.uri; // root.uri 已在 setRoots 中 normalizePath
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
      if (root.children === null) await this.getChildren(root).catch((e: unknown) => { console.error("[FileTreeModel] 加载子项失败:", e); });
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
        const entries = await lk.filesystem.listDir(current.uri).catch(() => []);
        const entry = entries.find((e: { name: string }) => e.name === segment);
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

  /**
   * 🔥 原子操作：清空缓存 + 重载磁盘 + 递归重载已展开子树。
   * 三步合一——调用方不可能忘掉某一步。refresh() 和 _reloadExpandedDescendants 共用。
   */
  private async _reloadItem(item: ExplorerItem): Promise<void> {
    item.children = null;
    await this.getChildren(item).catch((e: unknown) => { console.error("[FileTreeModel] 加载子项失败:", e); });
    await this._reloadExpandedDescendants(item);
  }

  /** 递归重载已展开的子目录——遍历 children，已展开目录走 _reloadItem 原子重载 */
  private async _reloadExpandedDescendants(item: ExplorerItem): Promise<void> {
    if (!item.children) return;
    for (const child of item.children) {
      if (child.isDirectory && this._expanded.has(child.uri)) {
        await this._reloadItem(child);
      }
    }
  }

  /** 刷新——path 为空则清空所有已展开节点的缓存。不 fire——调用方重载后统一触发 */
  async refresh(path?: string): Promise<void> {
    if (path) {
      const item = this.findClosest(path);
      if (!item?.isDirectory) return;
      if (this._expanded.has(item.uri)) {
        await this._reloadItem(item);
        return;
      }
      item.children = null;
    } else {
      for (const uri of this._expanded) {
        const node = this.findClosest(uri);
        if (node) node.children = null;
      }
      for (const root of this._roots) {
        if (root.children !== null) root.children = null;
      }
      for (const root of this._roots) {
        if (this._expanded.has(root.uri)) {
          await this._reloadItem(root);
        }
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
