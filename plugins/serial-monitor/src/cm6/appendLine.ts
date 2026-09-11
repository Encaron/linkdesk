/**
 * CM6 追加一行（带颜色）——接收区核心写入，主栏 / HEX 栏共用（E5.8#30.19a 抽取）。
 * E6#87b：从 src/index.tsx 的 appendToView useCallback 搬出（零状态纯函数，只搬不改）。
 */

import type { EditorView } from "@codemirror/view";
import { addLineDeco, addTimestampMark } from "./decorations";
import { CM6_MAX_DOC_LINES, CM6_TRIM_KEEP_LINES } from "../constants";
import type { LineType } from "../types";

export function appendLineToView(view: EditorView | null, text: string, color: LineType): void {
  if (!view) return;

  const doc = view.state.doc;
  const from = doc.length;
  const pre = doc.length > 0 ? "\n" : "";
  const lineStart = from + pre.length;
  const effects = [addLineDeco.of({ from: lineStart, cls: `cm-line-${color}` })];

  if (color === "received") {
    const arrowIdx = text.indexOf(" -> ");
    if (arrowIdx !== -1) {
      effects.push(addTimestampMark.of({ from: lineStart, to: lineStart + arrowIdx + 4 }));
    }
  } else if (color === "sent") {
    const dashIdx = text.indexOf(" ---- ");
    if (dashIdx !== -1) {
      effects.push(addTimestampMark.of({ from: lineStart, to: lineStart + dashIdx + 5 }));
    }
  }

  view.dispatch({ changes: { from, insert: pre + text }, effects });
  if (view.state.doc.lines > CM6_MAX_DOC_LINES) {
    const line = view.state.doc.line(CM6_TRIM_KEEP_LINES);
    view.dispatch({ changes: { from: 0, to: line.from } });
  }
}
