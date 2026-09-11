/**
 * FileTreeDnD 的类型契约（E6#87a 从 FileTreeDnD.ts 拆出）。
 */
import type { ExplorerItem, FileTreeModel } from "../FileTreeModel";
import type { FlatItem } from "../../utils/pathUtils";

export type DropEffect = "copy" | "move" | "none";

export interface DropTarget {
  /** flatItems 中的索引 */
  index: number;
  /** 目标项 */
  item: ExplorerItem;
  /** 目标目录路径——drop 后的实际目标 */
  targetDir: string;
  /** 拖放效果 */
  effect: DropEffect;
}

export interface DnDState {
  /** 正在被拖拽的源 URI */
  sourceUri: string | null;
  /** 鼠标悬停位置对应的 flatItems 索引（-1 = 无有效目标） */
  hoverIndex: number;
}

export interface DnDCallbacks {
  flatItems: FlatItem[];
  model: FileTreeModel;
  rerender: () => void;
  getContainerEl: () => HTMLDivElement | null;
  /** E4V#34h2: OS 拖入文件后自动打开回调 */
  onAutoOpenDroppedFile?: (filePath: string, name: string) => void;
}
