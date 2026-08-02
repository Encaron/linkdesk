/**
 * E4V#40j EditorStatusBar——编辑器状态栏。
 *
 * 对标 VS Code 编辑器底部状态栏：行:列 / 编码 / 语言 / 缩进 / EOL。
 * 渲染在 EditorTab 内部、EditorView 下方——per-tab，不是全局 StatusBar。
 *
 * 数据来源：encoding/language 从 EditorModel，光标/缩进/EOL 从 Monaco editor。
 */
import React from "react";

export interface EditorStatus {
  lineNumber: number;
  column: number;
  encoding: string;
  language: string;
  tabSize: number;
  insertSpaces: boolean;
  eol: "LF" | "CRLF";
}

const EditorStatusBar: React.FC<EditorStatus> = ({
  lineNumber,
  column,
  encoding,
  language,
  tabSize,
  insertSpaces,
  eol,
}) => {
  const indentLabel = insertSpaces ? `Spaces: ${tabSize}` : `Tab Size: ${tabSize}`;

  return (
    <div className="editor-status-bar">
      <div className="editor-status-bar-left">
        <span className="editor-status-item">
          Ln {lineNumber}, Col {column}
        </span>
      </div>
      <div className="editor-status-bar-right">
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
