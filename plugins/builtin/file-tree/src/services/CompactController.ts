/**
 * CompactController——压缩文件夹控制器。
 * E4V#5：对标 VS Code ITreeCompressionDelegate。
 *
 * 管理文件夹压缩链的展开/折叠状态。
 * 对标 VS Code explorerViewer.ts——ExplorerCompressionDelegate。
 */

import type { ExplorerItem } from "./FileTreeModel";
import { getCompactedPath } from "../components/CompactFolder";

export class CompactController {
  /** 已手动展开的压缩链——记录起始 item URI */
  private _uncompacted = new Set<string>();

  /* ── 查询 ── */

  /** 查询 item 是否处于压缩态（单子目录链且未手动展开） */
  isCompacted(item: ExplorerItem): boolean {
    if (this.isIncompressible(item)) return false;
    if (this._uncompacted.has(item.uri)) return false;
    return getCompactedPath(item) !== null;
  }

  /** 获取压缩路径段（供视图层渲染面包屑），null = 不压缩 */
  getCompactedSegments(item: ExplorerItem): string[] | null {
    if (!item.isDirectory) return null;
    if (this.isIncompressible(item)) return null;
    return getCompactedPath(item);
  }

  /**
   * 不可压缩判断——对标 VS Code isIncompressible。
   * - 文件不可压缩
   * - 根节点不可压缩
   * - 根直子不可压缩（对标 VS Code `!parent.isRoot` 规则）
   */
  isIncompressible(item: ExplorerItem): boolean {
    if (!item.isDirectory) return true;
    if (item.parent === null) return true; // 根
    if (item.parent.parent === null) return true; // 根直子
    return false;
  }

  /* ── 展开/折叠压缩链 ── */

  /** 展开压缩链——标记为不再压缩 */
  expandCompact(uri: string): void { this._uncompacted.add(uri); }

  /** 折叠压缩链——恢复压缩 */
  collapseCompact(uri: string): void { this._uncompacted.delete(uri); }

  /** 压缩链是否已手动展开 */
  isUncompacted(uri: string): boolean {
    return this._uncompacted.has(uri);
  }
}
