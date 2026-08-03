/**
 * SessionListView——串口监视器会话列表 view。
 * E36#8.2：从 sidebar.tsx 搬出会话 CRUD 逻辑。不包 SidebarSection——SidePanel 渲染循环统一包。
 *
 * 对标 VS Code Explorer：上半 = 文件列表（会话 CRUD），下半 = 文件属性（收发设置）。
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSerialSessions } from "../useSerialSessions";
import { useSerialContext } from "../SerialContext";

import { activateSidebarItem } from "@src/core/SidebarTabSync";
import { SessionListItem } from "../SessionListItem";
import "../SerialMonitorSidebar.css";

export default function SessionListView() {
  const { t } = useTranslation();
  const {
    sessions,
    activeSessionId,
    createSession,
    removeSession,
    updateSession,
    setActiveSession,
  } = useSerialSessions();

  // Phase 5.5c C4b Bug 3：connected 从 SerialContext 派生——不读 session.connected（始终为 false）
  const { state: { isOpen, sourceName: portName } } = useSerialContext();

  // Phase 5.5c C5：侧栏需要操作标签页——创建会话 → 开标签页，点会话 → 聚焦标签页
  const tabs = (window as any).linkdesk?.tabs;

  // 新建会话默认名称计数器
  const sessionCountRef = useRef(sessions.length);
  sessionCountRef.current = sessions.length;

  // 内联创建——替代 window.prompt()。prompt() 破坏 React 批处理→createTab 返回空串、
  // updateTabLabel 失效、notify() 失效。内联输入始终在 React 事件上下文内执行。
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const createInputRef = useRef<HTMLInputElement>(null);

  const startCreate = useCallback(() => {
    const n = sessionCountRef.current + 1;
    setNewName(`${t("新会话")} ${n}`);
    setIsCreating(true);
  }, [t]);

  const confirmCreate = useCallback(() => {
    const name = newName.trim();
    if (name && tabs) {
      // 先 session（数据）→ 再 tab（视图），sourceId 链接两者。
      // sourceId 是通用概念——任何插件可用它将自己的数据模型绑定到标签页。
      const session = createSession(name);
      tabs?.create("serial-monitor", { label: name, pinned: true, sourceId: session.id });
    }
    setIsCreating(false);
    setNewName("");
  }, [newName, createSession, tabs]);

  const cancelCreate = useCallback(() => {
    setIsCreating(false);
    setNewName("");
  }, []);

  // 自动聚焦输入框
  useEffect(() => {
    if (isCreating) {
      createInputRef.current?.focus();
      createInputRef.current?.select();
    }
  }, [isCreating]);

  const handleRename = useCallback(
    (id: string) => (name: string) => {
      updateSession(id, { name });
      // A2+N1：侧栏改名 → 标签栏标题同步
      tabs?.updateLabelBySourceId(id, name);
    },
    [updateSession, tabs],
  );

  const handleDelete = useCallback(
    (id: string) => async () => {
      const session = sessions.find((s) => s.id === id);
      if (!session) return;
      const confirmed = await (window as any).linkdesk?.dialog?.confirm?.(
        t("关闭会话「{{name}}」？", { name: session.name }) ??
          `关闭会话「${session.name}」？`,
      );
      if (confirmed) {
        // TODO Phase 5.5c C4: 如果 connected → 先断开串口
        // Phase 5.5c C5：先关标签页（触发 confirmOnClose），再删 session。
        // 用 closeTabBySourceId——sourceId 是 session↔tab 的唯一可靠链接。
        // tab.id 和 session.id 可能因布局恢复/计数器漂移不一致。
        tabs?.closeBySourceId(id);
        removeSession(id);
      }
    },
    [sessions, t, removeSession, tabs],
  );

  // C4b Bug 3：从 SerialContext 派生每个 session 的 connected 状态
  // 🔥 E3a #29a：SidebarTabSync 归一化——侧栏↔标签页走单一入口
  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setActiveSession(sessionId);
      const session = sessions.find((s) => s.id === sessionId);
      if (tabs) {
        activateSidebarItem(tabs, sessionId, "serial-monitor", {
          label: session?.name,
          pinned: true,
        });
      }
    },
    [setActiveSession, tabs, sessions],
  );

  const sessionList = sessions.map((s) => (
    <SessionListItem
      key={s.id}
      session={s}
      isActive={s.id === activeSessionId}
      connected={isOpen && portName === s.port}
      onSelect={() => handleSelectSession(s.id)}
      onRename={handleRename(s.id)}
      onDelete={handleDelete(s.id)}
    />
  ));

  return (
    <>
      {/* 新建按钮——内容顶部，不靠 SidebarSection header actions */}
      <div className="session-list-toolbar">
        <button
          className="session-create-btn"
          title={t("新建会话")}
          onClick={(e) => {
            e.stopPropagation();
            startCreate();
          }}
        >
          + {t("新建")}
        </button>
        {sessions.length > 0 && (
          <span className="session-count">({sessions.length})</span>
        )}
      </div>

      {isCreating && (
        <div className="session-create-inline">
          <input
            ref={createInputRef}
            className="session-create-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmCreate();
              if (e.key === "Escape") cancelCreate();
            }}
            placeholder={t("新会话名称：") ?? ""}
          />
          <button className="session-create-ok" onMouseDown={(e) => { e.preventDefault(); confirmCreate(); }} title={t("确定")}><span className="codicon codicon-check" /></button>
          <button className="session-create-cancel" onMouseDown={(e) => { e.preventDefault(); cancelCreate(); }} title={t("取消")}><span className="codicon codicon-close" /></button>
        </div>
      )}

      {sessions.length === 0 && !isCreating ? (
        <div className="session-empty">
          {t("暂无串口监视器会话。")}
          <button className="session-empty-link" onClick={startCreate}>
            [+ {t("新建")}]
          </button>
        </div>
      ) : (
        sessionList
      )}
    </>
  );
}
