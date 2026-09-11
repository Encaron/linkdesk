/**
 * FileTreeModel——对标 VS Code ExplorerModel（门面）。
 * E4a #88：文件树数据模型——懒加载 + 排序 + findClosest。
 *
 * 关键设计：
 *   children: null = 未加载（触发懒加载），[] = 空目录（不触发）
 *
 * VS Code 对标：src/vs/workbench/contrib/files/common/explorerModel.ts
 *
 * 原 436 行单文件按职责拆件（E6#87a）——本文件留类本体：
 *   - `types.ts`   FileDecoration / SortOrder / ExplorerItem
 *   - `emitter.ts` MiniEmitter
 *   - `host.ts`    TreeHost（辅助函数依赖的最小公开面）
 *   - `node.ts`    toExplorerItem / sortItems
 *   - `locate.ts`  getAncestorsOf / revealToUri
 *   - `reload.ts`  reloadItem / reloadExpandedDescendants / refreshTree
 */

// E5.8#20-c：FileEntry 契约化——types/fileEntry 已打入 linkdesk.d.ts，插件走 @linkdesk/contracts（零 @src/core）
import type { FileEntry } from "@linkdesk/contracts";
import type { FileExcludeFilter } from "../FileExcludeFilter";
import { CompactController } from "../CompactController";
import { basename, splitPath, normalizePath } from "../../utils/pathUtils";
import { MiniEmitter } from "./emitter";
import { toExplorerItem, sortItems } from "./node";
import { getAncestorsOf, revealToUri } from "./locate";
import { refreshTree } from "./reload";
import type { ExplorerItem, SortOrder } from "./types";

const lk = window.linkdesk;

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
    if (item.children) sortItems(item.children, this._sortOrder);
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
    current.children = filtered.map((e: FileEntry) => toExplorerItem(e, current));
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
          item.children = nested.map((e: FileEntry) => toExplorerItem(e, item));
          // E4V#34k: explorer.fileNesting.expand——嵌套后默认展开父项
          if (expandNesting) this.expand(item.uri);
        }
      }
      current.children = current.children!.filter((c) => !nestedPaths.has(normalizePath(c.uri)));
    }
    if (current.children) sortItems(current.children, this._sortOrder);
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
    return getAncestorsOf(node, this._expanded);
  }

  /** E4V#30: 定位文件——逐段展开目录链，绕过 FileExcludeFilter（见 locate.ts） */
  findAndExpandToBypassExclude(uri: string): Promise<ExplorerItem | null> {
    return revealToUri(this, uri, this._expanded);
  }

  /** 刷新——path 为空则清空所有已展开节点的缓存。不 fire——调用方重载后统一触发 */
  async refresh(path?: string): Promise<void> {
    await refreshTree(this, this._expanded, path);
  }
}

export type { ExplorerItem, SortOrder, FileDecoration } from "./types";
