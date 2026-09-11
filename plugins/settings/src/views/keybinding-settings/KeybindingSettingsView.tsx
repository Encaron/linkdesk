/**
 * Keyboard Shortcuts 设置子栏——对标 VS Code Keyboard Shortcuts 页面。
 * E3f #59：双 tab + 表格视图 + 搜索 + 双击改绑定 + 冲突检测。
 * #59-C：完整命令视图——以 CommandRegistry 为数据源。
 * #59-D：行内编辑——双框 chord 捕获 + ✕ + 点击外部取消 + 字体归一化。
 *
 * 🔥 E5.5#7-p2 多 WebView 改造：零 import @src/core，全走 window.linkdesk.* IPC。
 * E6#87d：数据层 → `useKeybindingRows.ts`、行内编辑状态机 → `useKeybindingEditor.ts`、
 *   编辑单元格 → `InlineChordEditor.tsx`、类型 → `types.ts`（子件留本夹内，不搬去 SettingsView/）。
 */

import { useTranslation } from "react-i18next";
import InlineChordEditor from "./InlineChordEditor";
import { useKeybindingEditor } from "./useKeybindingEditor";
import { useKeybindingReset } from "./useKeybindingReset";
import { useKeybindingRows } from "./useKeybindingRows";
import type { KeybindingSettingsViewProps } from "./types";
import "./KeybindingSettingsView.css";

function KeybindingSettingsView({ initialQuery }: KeybindingSettingsViewProps) {
  const { t } = useTranslation();
  const { search, setSearch, rows, allKeybindings } = useKeybindingRows(initialQuery);
  const editor = useKeybindingEditor(allKeybindings);
  const handleResetDefault = useKeybindingReset();
  const { editingRow, editRowRef, startEdit, splitChord } = editor;

  const sourceLabel = (s: string) => {
    if (s === "user") return t("用户");
    if (s === "plugin") return t("插件");
    if (s === "builtin") return t("内置");
    return "—";
  };

  return (
    <div className="keybindings-view">
      <div className="keybindings-search-bar">
        <span className="codicon codicon-search keybindings-search-icon" />
        <input
          className="keybindings-search-input"
          type="text"
          placeholder={t("搜索快捷键")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="keybindings-table">
        <div className="keybindings-header">
          <span>{t("命令")}</span>
          <span>{t("快捷键")}</span>
          <span>{t("来源")}</span>
          <span>{t("when 条件")}</span>
        </div>
        {rows.length === 0 ? (
          <div className="keybindings-empty">{t("无匹配快捷键")}</div>
        ) : (
          rows.map((row) => {
            const isEditing = editingRow?.command === row.command;
            return (
              <div
                key={row.command}
                ref={isEditing ? editRowRef : undefined}
                className={`keybindings-row ${row._conflict ? "conflict" : ""} ${isEditing ? "editing" : ""}`}
                onDoubleClick={isEditing ? undefined : () => { startEdit(row); splitChord(row); }}
              >
                <div className="keybindings-col-command">
                  <div>{t(row.title)}</div>
                  <div className="keybindings-col-command-id">{row.command}</div>
                </div>
                <div className="keybindings-col-key-cell">
                  {isEditing ? (
                    <InlineChordEditor editor={editor} />
                  ) : row.key === "—" ? (
                    <span className="keybindings-col-key-none">{row.key}</span>
                  ) : (
                    <span className={`keybindings-col-key ${row._conflict ? "conflict-key" : ""}`}>
                      {row.key}
                    </span>
                  )}
                  {/* E3f #59-G：自定义过（source=user）的行显示重置齿轮 */}
                  {!isEditing && row.source === "user" && (
                    <button
                      className="keybindings-row-gear"
                      title={t("重置为默认")}
                      onClick={(e) => { e.stopPropagation(); handleResetDefault(row); }}
                    >
                      <span className="codicon codicon-gear" />
                    </button>
                  )}
                </div>
                <div className="keybindings-col-source">{sourceLabel(row.source)}</div>
                <div className="keybindings-col-when">{row.when || "—"}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default KeybindingSettingsView;
