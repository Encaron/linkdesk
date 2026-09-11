/**
 * FileTreeModel 的类型契约（E6#87a 从 FileTreeModel.ts 拆出）。
 */

// E5.7#60：本地装饰契约类型——原 @src/core/registry/FileDecorationRegistry 已整删（注册表池内化，
// 经 linkdesk.decorations 消费）；形状与 01-插件API契约 §3.24 的 FileDecoration 对齐
export interface FileDecoration {
  badge?: string;
  tooltip?: string;
  color?: string;
  propagate?: boolean;
}

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
