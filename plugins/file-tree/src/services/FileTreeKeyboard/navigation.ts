/**
 * navigation——键盘导航分支（E6#87a 从 FileTreeKeyboard.ts 拆出，逐字搬运）。
 *
 * 对标 VS Code List Widget（listWidget.ts）的 onKeyDown + typeController。
 */

import type { ExplorerItem } from "../FileTreeModel";
import { scrollToItem } from "./scrollToItem";
import type { KeyboardCallbacks, KeyboardState } from "./types";

export function handleNavKey(
  e: React.KeyboardEvent,
  idx: number,
  fi: ExplorerItem,
  state: KeyboardState,
  callbacks: KeyboardCallbacks,
  handleTypeAhead: (char: string) => void,
): void {
  const { flatItems, model } = state;
  switch (e.key) {
    /* ── 导航 ── */

    case "ArrowUp": {
      e.preventDefault();
      const prev = Math.max(0, idx - 1);
      callbacks.setFocusedUri(flatItems[prev].item.uri);
      scrollToItem(prev, callbacks.getContainerEl());
      break;
    }

    case "ArrowDown": {
      e.preventDefault();
      const next = Math.min(flatItems.length - 1, idx + 1);
      callbacks.setFocusedUri(flatItems[next].item.uri);
      scrollToItem(next, callbacks.getContainerEl());
      break;
    }

    /* ── ArrowLeft——折叠或跳父节点（对标 VS Code） ── */

    case "ArrowLeft": {
      e.preventDefault();
      if (model.isExpanded(fi.uri) && fi.children !== null) {
        // 已展开 → 折叠
        model.collapse(fi.uri);
        callbacks.rerender();
      } else {
        // 已折叠或不可展开项 → 跳父节点
        const parent = fi.parent;
        if (parent) {
          const pIdx = flatItems.findIndex((f) => f.item.uri === parent.uri);
          if (pIdx !== -1) {
            callbacks.setFocusedUri(parent.uri);
            scrollToItem(pIdx, callbacks.getContainerEl());
          }
        }
      }
      break;
    }

    /* ── ArrowRight——展开或跳首子节点（对标 VS Code） ── */

    case "ArrowRight": {
      e.preventDefault();
      if (fi.children !== null && !model.isExpanded(fi.uri)) {
        // 已折叠 → 展开
        model.expand(fi.uri);
        model.getChildren(fi).then(() => callbacks.rerender());
      } else if (model.isExpanded(fi.uri) && fi.children !== null) {
        // 已展开 → 跳首子节点
        if (fi.children && fi.children.length > 0) {
          const child = fi.children[0];
          const childIdx = flatItems.findIndex((f) => f.item.uri === child.uri);
          if (childIdx !== -1) {
            callbacks.setFocusedUri(child.uri);
            scrollToItem(childIdx, callbacks.getContainerEl());
          }
        }
      }
      // 文件 → 无操作
      break;
    }

    /* ── Home / End ── */

    case "Home": {
      e.preventDefault();
      callbacks.setFocusedUri(flatItems[0].item.uri);
      scrollToItem(0, callbacks.getContainerEl());
      break;
    }

    case "End": {
      e.preventDefault();
      const last = flatItems.length - 1;
      callbacks.setFocusedUri(flatItems[last].item.uri);
      scrollToItem(last, callbacks.getContainerEl());
      break;
    }

    /* ── Enter——选中并打开聚焦项 ── */

    case "Enter": {
      e.preventDefault();
      callbacks.setSelectedUri(fi.uri);
      if (fi.isDirectory || fi.children !== null) {
        callbacks.onTwistie(fi);
      } else {
        callbacks.onOpenFile(fi, "pin");
      }
      break;
    }

    /* ── Space——展开/折叠（对标 VS Code） ── */

    case " ": {
      e.preventDefault();
      if (fi.isDirectory || fi.children !== null) {
        callbacks.onTwistie(fi);
      }
      break;
    }

    /* ── F2——重命名 ── */

    case "F2": {
      e.preventDefault();
      if (fi.parent !== null) {
        window.linkdesk?.commands?.executeCommand?.("explorer.rename");
      }
      break;
    }

    /* ── Delete——删除 ── */

    case "Delete": {
      e.preventDefault();
      if (fi.parent !== null) {
        window.linkdesk?.commands?.executeCommand?.("explorer.delete");
      }
      break;
    }

    /* ── type-ahead（单字符且无修饰键） ── */

    default: {
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleTypeAhead(e.key);
      }
      break;
    }
  }
}
