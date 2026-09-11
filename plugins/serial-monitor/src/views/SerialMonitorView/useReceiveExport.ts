/**
 * 接收区导出——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 *
 * 优先 File System Access API（saveFilePicker）；不可用时回落 Blob + <a download>。
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { EditorView } from "@codemirror/view";
import { saveFilePicker } from "../../utils/saveFile";
import type { LineType } from "../../types";

export interface ReceiveExportOptions {
  cmView: React.MutableRefObject<EditorView | null>;
  appendLine: (text: string, color: LineType) => void;
}

export function useReceiveExport(o: ReceiveExportOptions) {
  const { cmView, appendLine } = o;
  const { t } = useTranslation();

  const handleExport = useCallback(async () => {
    const view = cmView.current;
    if (!view) return;
    const text = view.state.doc.toString();
    const filename = `serial-log-${Date.now()}.txt`;
    try {
      const handle = await saveFilePicker?.({
        suggestedName: filename,
        types: [{ description: "Text", accept: { "text/plain": [".txt"] } }],
      });
      if (!handle) throw new Error("File System Access API 不可用");
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      appendLine(t("---- 日志已导出至 {{filename}} ----", { filename }), "system");
    } catch {
      const blob = new Blob([text], { type: "text/plain;charset=UTF-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [cmView, appendLine, t]);

  return { handleExport };
}
