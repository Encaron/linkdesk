/**
 * 编辑器状态栏数据（E4V#40j，E6#87c 拆自 EditorTab.tsx）——行:列/编码/语言/缩进/EOL + LSP 档位。
 */
import { useCallback, useState } from "react";
import type { LspState } from "../../services/lsp-bridge";
import type { EditorStatus } from "../EditorStatusBar";
import type { PatchStatus } from "./types";

export function useEditorStatus(): {
  editorStatus: EditorStatus;
  patchStatus: PatchStatus;
  handleCursorChange: (lineNumber: number, column: number) => void;
  handleLspStateChange: (lspState: LspState | null) => void;
  handleEditorMount: (opts: { tabSize: number; insertSpaces: boolean; eol: string }) => void;
} {
  const [editorStatus, setEditorStatus] = useState<EditorStatus>({
    lineNumber: 1,
    column: 1,
    encoding: "",
    language: "",
    tabSize: 2,
    insertSpaces: true,
    eol: "LF",
  });

  const patchStatus = useCallback<PatchStatus>((patch) => {
    setEditorStatus((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
  }, []);

  const handleCursorChange = useCallback((lineNumber: number, column: number) => {
    setEditorStatus((prev) => ({ ...prev, lineNumber, column }));
  }, []);

  // E6#73m K4——语言服务器状态（null = 本语言无 LSP，状态栏不显示这一格）
  const handleLspStateChange = useCallback((lspState: LspState | null) => {
    setEditorStatus((prev) => ({ ...prev, lspState }));
  }, []);

  const handleEditorMount = useCallback(
    (opts: { tabSize: number; insertSpaces: boolean; eol: string }) => {
      setEditorStatus((prev) => ({
        ...prev,
        tabSize: opts.tabSize,
        insertSpaces: opts.insertSpaces,
        eol: opts.eol as "LF" | "CRLF",
      }));
    },
    [],
  );

  return { editorStatus, patchStatus, handleCursorChange, handleLspStateChange, handleEditorMount };
}
