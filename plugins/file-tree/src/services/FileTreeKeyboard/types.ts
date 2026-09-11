/**
 * FileTreeKeyboard 的类型契约（E6#87a 从 FileTreeKeyboard.ts 拆出）。
 */
import type { ExplorerItem, FileTreeModel } from "../FileTreeModel";
import type { FlatItem } from "../../utils/pathUtils";

export interface KeyboardState {
  model: FileTreeModel;
  flatItems: FlatItem[];
  focusedUri: string | null;
}

export interface KeyboardCallbacks {
  setFocusedUri: (uri: string) => void;
  setSelectedUri: (uri: string) => void;
  rerender: () => void;
  onOpenFile: (item: ExplorerItem, mode: "preview" | "pin") => void;
  onTwistie: (item: ExplorerItem) => void;
  getContainerEl: () => HTMLDivElement | null;
}
