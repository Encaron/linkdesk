/**
 * 会话列表项——纯 props 驱动、零副作用。
 * 从 sidebar.tsx L36-154 搬出（E36#8.1）。
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { SerialSession } from "../hooks/useSerialSessions";
import { InlineInput } from "@src/components/shared/inline-input/InlineInput";
import type { InlineInputHandle } from "@src/components/shared/inline-input/InlineInput";

interface SessionListItemProps {
  session: SerialSession;
  isActive: boolean;
  /** E5#19b: F2 重命名——外部触发 */
  isRenaming?: boolean;
  /** Phase 5.5c C4b Bug 3：从 SerialContext 派生，不读 session.connected（该字段始终为 false） */
  connected: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

export function SessionListItem({
  session,
  isActive,
  isRenaming,
  connected,
  onSelect,
  onRename,
  onDelete,
}: SessionListItemProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const inlineRef = useRef<InlineInputHandle>(null);

  // E5#19b: F2 → shell dispatch → provider.onRename → 父组件 set isRenaming → 进入编辑
  useEffect(() => {
    if (isRenaming) setEditing(true);
  }, [isRenaming]);

  const commitRename = useCallback(() => {
    const newName = inlineRef.current?.getValue()?.trim() ?? "";
    if (newName && newName !== session.name) {
      onRename(newName);
    }
    setEditing(false);
  }, [session.name, onRename]);

  const handleRenameConfirm = useCallback((newName: string) => {
    const trimmed = newName.trim();
    if (trimmed && trimmed !== session.name) {
      onRename(trimmed);
    }
    setEditing(false);
  }, [session.name, onRename]);

  const handleRenameCancel = useCallback(() => {
    setEditing(false);
  }, []);

  // 双击开始编辑
  const handleDoubleClick = useCallback(() => {
    setEditing(true);
  }, []);

  // E5.8#30.17：协议字段已删——mockup 终态 subtitle = "COM3 · 115200"（口 + 波特率）
  const subtitle = session.port
    ? `${session.port} · ${session.baudRate}`
    : t("未配置");

  return (
    <div
      className={`session-item${isActive ? " active" : ""}`}
      style={{ "--session-color": session.color } as React.CSSProperties}
      onMouseDown={onSelect}
    >
      {/* 连接状态点——C4b Bug 3：从 SerialContext 派生，非 session.connected */}
      <span className={`session-dot${connected ? " on" : ""}`} />

      {/* 名称 / E5#19b 内联编辑——InlineInput 归一化 */}
      {editing ? (
        <>
          <span onMouseDown={(e) => e.stopPropagation()} style={{ flex: 1 }}>
            <InlineInput
              ref={inlineRef}
              size="compact"
              value={session.name}
              onConfirm={handleRenameConfirm}
              onCancel={handleRenameCancel}
              autoFocus
            />
          </span>
          <button className="session-create-ok" onMouseDown={(e) => { e.preventDefault(); commitRename(); }} title={t("确定")}><span className="codicon codicon-check" /></button>
          <button className="session-create-cancel" onMouseDown={(e) => { e.preventDefault(); handleRenameCancel(); }} title={t("取消")}><span className="codicon codicon-close" /></button>
        </>
      ) : (
        <>
          <div className="session-item-info" onDoubleClick={handleDoubleClick}>
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
