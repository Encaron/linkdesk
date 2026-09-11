/**
 * FileTree 的类型契约（E6#87a 从 FileTree.tsx 拆出）。
 */
import type React from "react";
import type { ExplorerItem, FileTreeModel } from "../../services/FileTreeModel";

/** 🔥 command handler 通过此接口查询 FileTree 实时状态——一个桥接点替代多个模块级变量 */
export interface FileTreeHandle {
  getSelection(): string[];
  getFocusedUri(): string | null;
  getModel(): FileTreeModel;
  rerender(): void;
  /** E4V#27: 对 focused item 启动行内重命名 */
  startRename(): void;
  /** E4V#30: 定位文件——展开目录链 + 选中 + 滚动到可见位置 */
  reveal(uri: string): Promise<void>;
}

export interface FileTreeProps {
  model: FileTreeModel;
  onOpenFile: (item: ExplorerItem, mode: "preview" | "pin") => void;
  onContextMenu?: (item: ExplorerItem, event: React.MouseEvent) => void;
}
