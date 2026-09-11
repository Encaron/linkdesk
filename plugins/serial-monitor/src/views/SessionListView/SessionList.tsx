/**
 * 会话列表容器——E6#87b 从 views/SessionListView.tsx 搬出（只搬不改）。
 * 只管容器语义（F2 键盘分区）+ 逐项渲染；单项交给 components/SessionListItem。
 */

import type { SerialSession } from "../../hooks/useSerialSessions";
import { SessionListItem } from "../../components/SessionListItem";

export interface SessionListProps {
  sessions: SerialSession[];
  activeSessionId: string | null;
  renamingSessionId: string | null;
  openPorts: Set<string>;
  onSelect: (id: string) => void;
  onRename: (id: string) => (name: string) => void;
  onDelete: (id: string) => () => void;
  /** F2——请求把当前活动会话切进重命名态（由门面写 renamingSessionId） */
  onF2: (id: string) => void;
}

export function SessionList({
  sessions, activeSessionId, renamingSessionId, openPorts, onSelect, onRename, onDelete, onF2,
}: SessionListProps) {
  /* ── E5.8#24.8.4：F2 重命名——容器 onKeyDown + tabIndex（对齐池侧自处理）──
   * 原 document 级 keydown 监听无焦点守卫——串口有活动会话时劫持全池 F2
   * （文件树聚焦按 F2 会同时触发串口重命名）。改容器 tabIndex=0 + onKeyDown：
   * DOM 焦点天然分区——点击列表项浏览器把焦点给最近可聚焦祖先（本容器），
   * 只有本列表聚焦才收到 F2；Monaco/文件树聚焦时收不到，互不打扰。
   * 新建输入框在容器外（聚焦按 F2 不触发）；重命名 InlineInput 已 stopPropagation。 */
  return (
    <div
      className="session-list"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "F2") {
          e.preventDefault();
          if (activeSessionId) onF2(activeSessionId);
        }
      }}
    >
      {sessions.map((s) => (
        <SessionListItem
          key={s.id}
          session={s}
          isActive={s.id === activeSessionId}
          isRenaming={s.id === renamingSessionId}
          connected={openPorts.has(s.port)}
          onSelect={() => onSelect(s.id)}
          onRename={onRename(s.id)}
          onDelete={onDelete(s.id)}
        />
      ))}
    </div>
  );
}
