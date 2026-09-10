/**
 * E4V#40j EditorStatusBar——编辑器状态栏。
 *
 * 对标 VS Code 编辑器底部状态栏：行:列 / 编码 / 语言 / 缩进 / EOL。
 * 渲染在 EditorTab 内部、EditorView 下方——per-tab，不是全局 StatusBar。
 *
 * 数据来源：encoding/language 从 EditorModel，光标/缩进/EOL 从 Monaco editor。
 */
import React from "react";
import { useTranslation } from "react-i18next";
import type { LspState } from "../services/lsp-bridge";

export interface EditorStatus {
  lineNumber: number;
  column: number;
  encoding: string;
  language: string;
  tabSize: number;
  insertSpaces: boolean;
  eol: "LF" | "CRLF";
  /** E6#73m K4——语言服务器状态。null/undefined = 本语言没有 LSP，这一格不显示。 */
  lspState?: LspState | null;
}

const EditorStatusBar: React.FC<EditorStatus> = ({
  lineNumber,
  column,
  encoding,
  language,
  tabSize,
  insertSpaces,
  eol,
  lspState,
}) => {
  const { t } = useTranslation();
  const indentLabel = insertSpaces ? `Spaces: ${tabSize}` : `Tab Size: ${tabSize}`;

  return (
    <div className="editor-status-bar">
      <div className="editor-status-bar-left">
        <span className="editor-status-item">
          Ln {lineNumber}, Col {column}
        </span>
      </div>
      <div className="editor-status-bar-right">
        {/* E6#73m K4：语言服务器状态——只在「启动中 / 起不来」时占位。ready 不显示
            （一切都好就别占地方），无 LSP 的语言也不显示（null，不是故障）。 */}
        {lspState && lspState !== "ready" && (
          <>
            <span className="editor-status-item">
              {lspState === "starting" ? t("语言服务器启动中…") : t("语言支持不可用")}
            </span>
            <span className="editor-status-sep">│</span>
          </>
        )}
        <span className="editor-status-item">{indentLabel}</span>
        <span className="editor-status-sep">│</span>
        <span className="editor-status-item">{encoding.toUpperCase()}</span>
        <span className="editor-status-sep">│</span>
        <span className="editor-status-item">{language}</span>
        <span className="editor-status-sep">│</span>
        <span className="editor-status-item">{eol}</span>
      </div>
    </div>
  );
};

export default EditorStatusBar;
