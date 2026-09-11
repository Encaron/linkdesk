/**
 * keep-alive 与尺寸自适应（E6#87c 拆自 EditorView.tsx 的三条常驻 effect）。
 *
 * keep-alive 靠 CSS display 切换，面板不 unmount——所以「切回来」要自己补三件事：
 * layout（display:none 期间量到的尺寸是 0）+ 焦点 + 待揭示位置。
 */
import { useEffect } from "react";
import type { MutableRefObject, RefObject } from "react";
import { consumePendingReveal } from "../../services/navigation-bridge";
import { focusAt } from "./reveal";
import type { MonacoEditor } from "./types";

const lk = window.linkdesk;

export function useEditorKeepAlive(args: {
  editorRef: MutableRefObject<MonacoEditor | null>;
  containerRef: RefObject<HTMLDivElement>;
  isActive: boolean;
  filePath: string;
}): void {
  const { editorRef, containerRef, isActive, filePath } = args;

  // ── keep-alive——标签页切换时 layout + focus + reveal。双 rAF 防光标被后续渲染覆盖 ──
  // E5.7 fix（2026-08-16）：激活时 focus()——Ctrl+S 是 Monaco 局部键位，只打到持有 DOM 焦点的
  // 实例。切标签页不搬焦点时：分屏下 Ctrl+S 打到另一组的编辑器（保存错文件），单组下焦点
  // 已随 display:none 落到 body（Ctrl+S 失效）。对标 VS Code：点击标签 = 该编辑器获焦。
  useEffect(() => {
    if (!isActive) return;
    const raf1 = requestAnimationFrame(() => {
      editorRef.current?.layout();
      const pos = consumePendingReveal(filePath);
      if (pos && editorRef.current) {
        const editor = editorRef.current;
        requestAnimationFrame(() => {
          focusAt(editor, pos.line, pos.column);
        });
      } else {
        editorRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(raf1);
  }, [isActive, filePath, editorRef]);

  // ── 跨文件跳转——mount/isActive effect 之外的事件通道（含 ShellEvents buffer 回放）──
  useEffect(() => {
    return lk.events.on<{ filePath: string }>("editor:revealRequested", ({ filePath: fp }) => {
      if (fp !== filePath) return;
      requestAnimationFrame(() => {
        const pos = consumePendingReveal(filePath);
        if (pos && editorRef.current) {
          const editor = editorRef.current;
          requestAnimationFrame(() => {
            focusAt(editor, pos.line, pos.column);
          });
        }
      });
    });
  }, [filePath, editorRef]);

  // ── 容器 resize（全屏/分屏/窗口缩放）→ Monaco layout() ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      editorRef.current?.layout();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, editorRef]);
}
