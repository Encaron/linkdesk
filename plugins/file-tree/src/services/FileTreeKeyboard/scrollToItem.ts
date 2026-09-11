/**
 * scrollToItem——滚动使指定 index 的节点可见（E6#87a 从 FileTreeKeyboard.ts 拆出）。
 */
import { getScaledTreeItemHeight } from "../../utils/layoutTokens";

/** 滚动使指定 index 的节点可见 */
export function scrollToItem(index: number, containerEl: HTMLDivElement | null): void {
  if (!containerEl) return;
  const itemHeight = getScaledTreeItemHeight();
  const targetTop = index * itemHeight;
  const { scrollTop: st, clientHeight: ch } = containerEl;
  if (targetTop < st) {
    containerEl.scrollTop = targetTop;
  } else if (targetTop + itemHeight > st + ch) {
    containerEl.scrollTop = targetTop - ch + itemHeight;
  }
}
