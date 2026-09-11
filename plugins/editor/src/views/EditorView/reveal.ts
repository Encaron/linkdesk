/**
 * 光标定位动作（E6#87c 拆自 EditorView.tsx）。
 *
 * 三处揭示路径（mount 双 rAF 定位 / 标签激活 / 跨文件跳转事件）内层是**同一段动作**——
 * 抽出这一处，免得三份各写各的、其中一处漏掉 `focus()`（漏了的表现是「跳过去了但焦点没跟过去，
 * Ctrl+S 保存错文件」）。外层的 rAF/consume 时序各家不同，不强行归一。
 */
import type { MonacoEditor } from "./types";

/** 把光标移到指定位置、在视野中央揭示、并让编辑器获焦 */
export function focusAt(editor: MonacoEditor, line: number, column: number): void {
  const p = { lineNumber: line, column };
  editor.setPosition(p);
  editor.revealPositionInCenter(p);
  editor.focus();
}
