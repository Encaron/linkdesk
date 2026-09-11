/**
 * TreeHost——FileTreeModel 对同夹辅助函数暴露的最小面（E6#87a）。
 *
 * 辅助函数（locate / reload）只依赖这些**公开成员**，`_expanded` 集合按引用传入——
 * 类的私有性不变，逻辑只是换了存放位置。
 */
import type { ExplorerItem } from "./types";

export interface TreeHost {
  readonly roots: ExplorerItem[];
  readonly onDidChange: { fire(): void };
  findClosest(uri: string): ExplorerItem | null;
  findClosestRoot(uri: string): ExplorerItem | null;
  getChildren(parent: ExplorerItem): Promise<ExplorerItem[]>;
  expand(uri: string): void;
  isExpanded(uri: string): boolean;
}
