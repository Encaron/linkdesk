/**
 * 编辑器初始化编排（E6#87c 拆自 EditorView.tsx 的 init effect）。
 *
 * ⚠️ 每个 filePath 只建一次编辑器——`value` / `readOnly` 仅初始创建读取；
 * options 走 optionsRef + updateOptions；回调全走 ref 桥。入 deps 会在回调身份变化时
 * 重建编辑器（丢 undo/光标），故 deps 只有 filePath + eslint-disable。
 *
 * 步骤块分居同夹各文件（bootstrapEnv / attachLanguageSupport / createEditorInstance /
 * wireEditorEvents / registerEditorActions / goToDefinition），本文件只负责**顺序与清理**。
 */
import { useEffect, useRef } from "react";
import type { MutableRefObject, RefObject } from "react";
import { consumePendingReveal } from "../../services/navigation-bridge";
import type { LspState } from "../../services/lsp-bridge";
import { attachLanguageSupport } from "./attachLanguageSupport";
import { bootstrapEditorEnv } from "./bootstrapEnv";
import { createEditorInstance } from "./createEditorInstance";
import { registerGoToDefinition } from "./goToDefinition";
import { focusAt } from "./reveal";
import { registerEditorActions } from "./registerEditorActions";
import type { Monaco, MonacoEditor } from "./types";
import { wireEditorEvents } from "./wireEditorEvents";

export interface EditorInitArgs {
  containerRef: RefObject<HTMLDivElement>;
  filePath: string;
  value: string;
  readOnly?: boolean;
  options?: Record<string, unknown>;
  onChange?: (value: string | undefined) => void;
  onSave?: () => void;
  onCursorChange?: (lineNumber: number, column: number) => void;
  onEditorMount?: (opts: { tabSize: number; insertSpaces: boolean; eol: string }) => void;
  onLspStateChange?: (state: LspState | null) => void;
}

export function useEditorInit(args: EditorInitArgs): { editorRef: MutableRefObject<MonacoEditor | null> } {
  const { containerRef, filePath, value, readOnly } = args;

  const editorRef = useRef<MonacoEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const themeSyncUnsubRef = useRef<(() => void) | null>(null);
  /** 语言服务器状态订阅的退订句柄——订阅发生在异步段，只能由 effect 体的清理函数收 */
  const lspUnsubRef = useRef<(() => void) | null>(null);

  // 🔴 options 异步加载——EditorTab buildMonacoOptions() 返回前 editor 已创建
  // ref 桥接：无论谁先完成，editor 创建后都能拿到最新 options
  const optionsRef = useRef(args.options);
  optionsRef.current = args.options;
  const onSaveRef = useRef(args.onSave);
  onSaveRef.current = args.onSave;
  const onCursorChangeRef = useRef(args.onCursorChange);
  onCursorChangeRef.current = args.onCursorChange;
  const onEditorMountRef = useRef(args.onEditorMount);
  onEditorMountRef.current = args.onEditorMount;
  // E6#73m K4：LSP 状态回调同样走 ref 桥——init effect per filePath 只跑一次，回调身份变化不重建
  const onLspStateRef = useRef(args.onLspStateChange);
  onLspStateRef.current = args.onLspStateChange;
  // E5.7#99：onChange ref 桥——init effect per filePath 只建一次编辑器，
  // 入 deps 会在回调身份变化时重建编辑器（丢 undo/光标）
  const onChangeRef = useRef(args.onChange);
  onChangeRef.current = args.onChange;

  const tabs = window.linkdesk?.tabs;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    lspUnsubRef.current = null;

    (async () => {
      const env = await bootstrapEditorEnv({
        container,
        disposed: () => disposed,
        monacoRef,
        tabsRef,
      });
      if (!env) return;
      const { monaco } = env;
      // 订阅退订句柄留到 cleanup 用——必须由本 effect 体自己写进 ref（见 bootstrapEnv 头注）
      themeSyncUnsubRef.current = env.themeSyncUnsub;

      const alive = await attachLanguageSupport({
        filePath,
        disposed: () => disposed,
        onLspStateRef,
        lspUnsubRef,
      });
      if (!alive) return;

      const { editor, model } = createEditorInstance({
        monaco, container, filePath, value, readOnly, optionsRef, onEditorMountRef,
      });
      editorRef.current = editor;

      // 7. F12 跳转后定位——双 rAF + 延迟 consume 防 StrictMode 双重 mount 竞态
      requestAnimationFrame(() => {
        if (disposed) return;
        requestAnimationFrame(() => {
          if (disposed) return;
          const pendingReveal = consumePendingReveal(filePath);
          if (pendingReveal) focusAt(editor, pendingReveal.line, pendingReveal.column);
        });
      });

      // 8/8b. 内容变更 + 光标位置接线
      wireEditorEvents({ editor, model, onChangeRef, onCursorChangeRef });

      // 9/10/11. Ctrl+S + 摘除 Monaco 内置字体缩放键位
      registerEditorActions({ monaco, editor, onSaveRef });

      // 12. F12 + Ctrl+Click——standalone Monaco 归一化导航通道
      registerGoToDefinition({ monaco, editor, tabsRef });
    })().catch((err) => {
      console.error("[editor] 初始化失败:", err);
    });

    return () => {
      disposed = true;
      themeSyncUnsubRef.current?.();
      lspUnsubRef.current?.();
      editorRef.current?.dispose();
    };
    // E5.7#99：编辑器创建即定型——value/readOnly 仅初始创建读取；options 走 optionsRef+updateOptions
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 同步（62/141）。入 deps 会在 options 身份变化时重建编辑器——丢 undo/光标
  }, [filePath]);

  return { editorRef };
}
