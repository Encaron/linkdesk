/**
 * typeAhead——1s 窗口内累积字符跳转到匹配文件名（E6#87a 从 FileTreeKeyboard.ts 拆出）。
 */
import { useCallback, useRef } from "react";
import { scrollToItem } from "./scrollToItem";
import type { KeyboardCallbacks, KeyboardState } from "./types";

/** 1 秒窗口 */
const TYPE_WINDOW = 1000;

export function useTypeAhead(state: KeyboardState, callbacks: KeyboardCallbacks): (char: string) => void {
  // type-ahead 状态——走 ref 不触发重渲染（按键累积不改变 UI 渲染输出）
  const typeBuffer = useRef("");
  const typeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** type-ahead：在当前 buffer 匹配的文件名中搜索 */
  return useCallback(
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
}
