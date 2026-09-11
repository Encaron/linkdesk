/**
 * 快捷发送条——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 * 药丸按钮 + 内联新增/编辑表单 + 右键菜单（编辑/删除）。
 */

import { useTranslation } from "react-i18next";
import { ContextMenu } from "@linkdesk/ui";

export interface QuickSendBarProps {
  quickSends: Record<string, string>;
  onQuickSend: (content: string) => void;
  onCtxMenu: (key: string, e: React.MouseEvent) => void;
  qsAdding: boolean;
  setQsAdding: (v: boolean) => void;
  qsEditing: string | null;
  setQsEditing: (v: string | null) => void;
  qsName: string;
  setQsName: (v: string) => void;
  qsContent: string;
  setQsContent: (v: string) => void;
  onSave: () => void;
  qsCtxMenu: { key: string; x: number; y: number } | null;
  onCloseQsCtxMenu: () => void;
}

export default function QuickSendBar(p: QuickSendBarProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* 快捷发送条 */}
      <div className="quick-send-bar">
        {Object.entries(p.quickSends).map(([name, content]) => (
          <button
            key={name}
            className="quick-send-pill"
            onClick={() => p.onQuickSend(content)}
            onContextMenu={(e) => p.onCtxMenu(name, e)}
            title={content}
          >
            {name}
          </button>
        ))}
        {p.qsAdding ? (
          <div className="quick-send-add-form">
            <input
              className="input qs-input"
              placeholder={t("名称")}
              value={p.qsName}
              onChange={(e) => p.setQsName(e.target.value)}
              autoFocus
            />
            <input
              className="input qs-input"
              placeholder={t("发送内容")}
              value={p.qsContent}
              onChange={(e) => p.setQsContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") p.onSave(); if (e.key === "Escape") { p.setQsAdding(false); p.setQsEditing(null); } }}
            />
            <button className="toolbar-btn" onClick={p.onSave}>{p.qsEditing ? <span className="codicon codicon-edit" /> : <span className="codicon codicon-check" />}</button>
            <button className="toolbar-btn" onClick={() => { p.setQsAdding(false); p.setQsEditing(null); }}><span className="codicon codicon-close" /></button>
          </div>
        ) : (
          <button className="quick-send-add" title={t("添加快捷发送")} onClick={() => p.setQsAdding(true)}>
            + {t("添加")}
          </button>
        )}
      </div>

      {/* Phase 5b：快捷发送右键菜单——共享 ContextMenu */}
      {p.qsCtxMenu && (
        <ContextMenu
          menuId={"quickSendContext"}
          anchor={{ x: p.qsCtxMenu.x, y: p.qsCtxMenu.y }}
          context={{ quickSendName: p.qsCtxMenu.key }}
          onClose={p.onCloseQsCtxMenu}
        />
      )}
    </>
  );
}
