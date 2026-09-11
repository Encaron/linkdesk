/**
 * 内联新建会话输入行——E6#87b 从 views/SessionListView.tsx 搬出（只搬不改）。
 * 内容顶部，不靠 SidebarSection header actions。
 */

import { useTranslation } from "react-i18next";
import type { RefObject } from "react";

export interface SessionCreateInlineProps {
  inputRef: RefObject<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SessionCreateInline({ inputRef, value, onChange, onConfirm, onCancel }: SessionCreateInlineProps) {
  const { t } = useTranslation();
  return (
    <div className="session-create-inline">
      <input
        ref={inputRef}
        className="session-create-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onConfirm();
          if (e.key === "Escape") onCancel();
        }}
        placeholder={t("新会话名称：") ?? ""}
      />
      <button className="session-create-ok" onMouseDown={(e) => { e.preventDefault(); onConfirm(); }} title={t("确定")}><span className="codicon codicon-check" /></button>
      <button className="session-create-cancel" onMouseDown={(e) => { e.preventDefault(); onCancel(); }} title={t("取消")}><span className="codicon codicon-close" /></button>
    </div>
  );
}
