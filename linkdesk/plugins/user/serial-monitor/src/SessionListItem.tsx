/**
 * 会话列表项——纯 props 驱动、零副作用。
 * 从 sidebar.tsx L36-154 搬出（E36#8.1）。
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { SerialSession } from "./useSerialSessions";

interface SessionListItemProps {
  session: SerialSession;
  isActive: boolean;
  /** Phase 5.5c C4b Bug 3：从 SerialContext 派生，不读 session.connected（该字段始终为 false） */
  connected: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

export function SessionListItem({
  session,
  isActive,
  connected,
  onSelect,
  onRename,
  onDelete,
}: SessionListItemProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(session.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setEditValue(session.name);
      // 下一帧 focus + 全选
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, session.name]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== session.name) {
      onRename(trimmed);
    }
    setEditing(false);
  }, [editValue, session.name, onRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitRename();
      } else if (e.key === "Escape") {
        setEditing(false);
      }
    },
    [commitRename],
  );

  const subtitle = session.port
    ? `${session.baudRate} · ${session.protocol}`
    : t("未配置");

  return (
    <div
      className={`session-item${isActive ? " active" : ""}`}
      style={{ "--session-color": session.color } as React.CSSProperties}
      onMouseDown={onSelect}
    >
      {/* 连接状态点——C4b Bug 3：从 SerialContext 派生，非 session.connected */}
      <span className={`session-dot${connected ? " on" : ""}`} />

      {/* 名称 / 内联编辑 */}
      {editing ? (
        <>
          <input
            ref={inputRef}
            className="session-inline-input"
            aria-label={t("重命名会话")}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
          <button className="session-create-ok" onMouseDown={(e) => { e.preventDefault(); commitRename(); }} title={t("确定")}><span className="codicon codicon-check" /></button>
          <button className="session-create-cancel" onMouseDown={(e) => { e.preventDefault(); setEditing(false); }} title={t("取消")}><span className="codicon codicon-close" /></button>
        </>
      ) : (
        <>
          <div className="session-item-info">
            <span className="session-item-name">{session.name}</span>
            <span className="session-item-subtitle">{subtitle}</span>
          </div>

          {/* hover 时出现的操作按钮 */}
          <span className="session-item-actions">
            <button
              className="session-action-btn"
              title={t("改名")}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
            >
              <span className="codicon codicon-edit" />
            </button>
            <button
              className="session-action-btn"
              title={t("关闭会话")}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <span className="codicon codicon-close" />
            </button>
          </span>
        </>
      )}
    </div>
  );
}
