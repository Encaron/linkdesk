/**
 * 内容变更与光标位置接线（E6#87c 拆自 EditorView.tsx 的初始化步骤 8/8b）。
 *
 * 回调一律走 ref 桥——init effect per filePath 只建一次编辑器，回调身份变化不重建。
 */
import type { MutableRefObject } from "react";
import type { editor as MonacoEditorApi } from "monaco-editor";
import type { MonacoEditor } from "./types";

export function wireEditorEvents(args: {
  editor: MonacoEditor;
  model: MonacoEditorApi.ITextModel;
  onChangeRef: MutableRefObject<((value: string | undefined) => void) | undefined>;
  onCursorChangeRef: MutableRefObject<((lineNumber: number, column: number) => void) | undefined>;
}): void {
  const { editor, model, onChangeRef, onCursorChangeRef } = args;

  // 8. onChange 接线
  model.onDidChangeContent(() => {
    onChangeRef.current?.(model.getValue());
  });

  // 8b. 光标位置跟踪——E4V#40j EditorStatusBar 消费
  editor.onDidChangeCursorPosition((e) => {
    onCursorChangeRef.current?.(e.position.lineNumber, e.position.column);
  });
  // 初始触发一次
  const initPos = editor.getPosition();
  if (initPos) {
    onCursorChangeRef.current?.(initPos.lineNumber, initPos.column);
  }
}
