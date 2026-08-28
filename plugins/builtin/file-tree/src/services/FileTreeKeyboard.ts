/**
 * FileTreeKeyboard——键盘导航 + type-ahead 字母跳转。
 * E4b #97：对标 VS Code List Widget（listWidget.ts）的 onKeyDown + typeController。
 *
 * 关键行为：
 *   ArrowUp/Down → 移动焦点（不改选中）
 *   ArrowLeft → 折叠已展开目录，否则跳转到父节点
 *   ArrowRight → 展开已折叠目录，否则跳转到首个子节点
 *   Home/End → 首/尾
 *   Enter → 选中并打开聚焦项
 *   Space → 展开/折叠目录
 *   type-ahead → 1s 窗口内累积字符 → 跳到匹配文件名（大小写不敏感）
 */

import { useRef, useCallback } from "react";
import { useClipboardKeys } from "@src/pool/hooks/useClipboardKeys";
import type { ExplorerItem } from "./FileTreeModel";
import type { FileTreeModel } from "./FileTreeModel";
import { getScaledTreeItemHeight } from "../utils/layoutTokens";
import type { FlatItem } from "../utils/pathUtils";

/* ── 类型 ── */

export type { FlatItem } from "../utils/pathUtils";

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

/* ── 工具 ── */

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

/* ── type-ahead 常量 ── */

const TYPE_WINDOW = 1000; // 1 秒窗口

/* ── Hook ── */

export function useFileTreeKeyboard(
  state: KeyboardState,
  callbacks: KeyboardCallbacks,
): (e: React.KeyboardEvent) => void {
  // type-ahead 状态——走 ref 不触发重渲染（按键累积不改变 UI 渲染输出）
  const typeBuffer = useRef("");
  const typeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── E5.8#24.8.3：Ctrl+C/V/X——文件树剪贴板（机制归一共享 hook）──
   * 壳级剪贴板键已删（E5.8#24.8.1，主进程无条件 preventDefault 吞键修因）——
   * 文件树按「插件自己的键」自监听（对标 VS Code explorer 键盘复制/粘贴）。
   * 焦点感知天然成立：本 hook 挂在容器 onKeyDown + tabIndex=0——只有文件树
   * 容器聚焦才收到事件；Monaco/其他池内控件聚焦时本组件不接收，原生键不受影响。
   * 重命名输入框 InlineInput 已 stopPropagation——打字时 Ctrl+C/V/X 不冒泡到容器。
   * 语义回调复用右键命令（explorer.copy/cut/paste）——无参时自动回退 selection/focused，
   * 内置系统剪贴板写入（writeFileList CF_HDROP + 纯文本 fallback）+ cut 灰显标记。 */
  const handleClipboard = useClipboardKeys({
    onCopy: () => window.linkdesk?.commands?.executeCommand?.("explorer.copy"),
    onCut: () => window.linkdesk?.commands?.executeCommand?.("explorer.cut"),
    onPaste: () => window.linkdesk?.commands?.executeCommand?.("explorer.paste"),
  });

  /** type-ahead：在当前 buffer 匹配的文件名中搜索 */
  const handleTypeAhead = useCallback(
    (char: string) => {
      const { flatItems, focusedUri } = state;
      // 清除之前的超时
      if (typeTimeout.current) clearTimeout(typeTimeout.current);

      typeBuffer.current += char.toLowerCase();

      // 1s 后重置 buffer
      typeTimeout.current = setTimeout(() => {
        typeBuffer.current = "";
        typeTimeout.current = null;
      }, TYPE_WINDOW);

      // 从当前焦点下一个位置开始搜（wrapping）
      const currentIdx = flatItems.findIndex((f) => f.item.uri === focusedUri);
      const startIdx = currentIdx === -1 ? -1 : currentIdx;
      for (let i = 0; i < flatItems.length; i++) {
        const idx = (startIdx + 1 + i) % flatItems.length;
        const name = flatItems[idx].item.name.toLowerCase();
        if (name.startsWith(typeBuffer.current)) {
          callbacks.setFocusedUri(flatItems[idx].item.uri);
          scrollToItem(idx, callbacks.getContainerEl());
          return;
        }
      }
      // 无匹配——不跳
    },
    [state, callbacks],
  );

  /** 主键盘处理器 */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const { flatItems, focusedUri, model } = state;
      if (flatItems.length === 0) return;

      const currentIdx = flatItems.findIndex((f) => f.item.uri === focusedUri);
      const idx = currentIdx === -1 ? 0 : currentIdx;
      const fi = flatItems[idx].item;

      // E5.8#24.8.3：剪贴板键——机制归一在 useClipboardKeys（命中 → 已消费，不继续走导航）
      if (handleClipboard(e)) return;

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
    },
    [state, callbacks, handleTypeAhead, handleClipboard],
  );

  return handleKeyDown;
}
