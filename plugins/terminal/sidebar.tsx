/**
 * 终端侧栏——会话列表 + 收发设置。
 * Phase 5.5c Step C2：旧 4 个 setting-group → 2 个 `<SidebarSection>`。
 * Phase 5f useConfiguration → 5.5c useTerminalSessions.activeSession。
 *
 * 对标 VS Code Explorer 侧栏：
 * - 上半 = 文件列表（会话 CRUD）
 * - 下半 = 文件属性（收发设置，随选中会话联动）
 *
 * 硬规则（§3.12）：
 *   name 唯一写入入口 → 本文件（F2 / hover ✎）
 *   12 项设置唯一写入入口 → 本文件的"收发设置" Section
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useTerminalSessions, getSessionById } from "./useTerminalSessions";
import type { TerminalSession } from "./useTerminalSessions";
import { useSerialContext } from "@src/core/SerialContext";
import { useTabActions } from "@src/core/TabActionsContext";
import SidebarSection from "@src/components/shared/SidebarSection";
import Toggle from "@src/components/shared/Toggle";
import Select from "@src/components/shared/Select";
import FormRow from "@src/components/shared/FormRow";
import "./TerminalSidebar.css";

// ── 常量 ──

const timeFormats = ["HH:mm:ss", "HH:mm:ss:fff", "无"];
const lineEndings = ["\\r\\n", "\\n", "\\r"];

// ── 子组件：会话列表项 ──

function SessionListItem({
  session,
  isActive,
  connected,
  onSelect,
  onRename,
  onDelete,
}: {
  session: TerminalSession;
  isActive: boolean;
  /** Phase 5.5c C4b Bug 3：从 SerialContext 派生，不读 session.connected（该字段始终为 false） */
  connected: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
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
      onClick={onSelect}
    >
      {/* 连接状态点——C4b Bug 3：从 SerialContext 派生，非 session.connected */}
      <span className={`session-dot${connected ? " on" : ""}`} />

      {/* 名称 / 内联编辑 */}
      {editing ? (
        <input
          ref={inputRef}
          className="session-inline-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
        />
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
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
            >
              ✎
            </button>
            <button
              className="session-action-btn"
              title={t("关闭会话")}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              ✕
            </button>
          </span>
        </>
      )}
    </div>
  );
}

// ── 侧栏主体 ──

function TerminalSidebar() {
  const { t } = useTranslation();
  const {
    sessions,
    activeSession,
    activeSessionId,
    createSession,
    removeSession,
    updateSession,
    setActiveSession,
  } = useTerminalSessions();

  // Phase 5.5c C4b Bug 3：connected 从 SerialContext 派生——不读 session.connected（始终为 false）
  const { state: { isOpen, portName } } = useSerialContext();

  // Phase 5.5c C5：侧栏需要操作标签页——创建会话 → 开标签页，点会话 → 聚焦标签页
  const tabActions = useTabActions();

  // 新建会话默认名称计数器
  const sessionCountRef = useRef(sessions.length);
  sessionCountRef.current = sessions.length;

  const handleCreate = useCallback(() => {
    const n = sessionCountRef.current + 1;
    // 简单 prompt——Phase 7+ 可换成内联输入或模态
    const name = window.prompt(
      t("新会话名称：") ?? "新会话名称：",
      `${t("新会话")} ${n}`,
    );
    if (name && name.trim() && tabActions) {
      // 🔥 先 session（数据层）→ 再 tab（视图层）。
      // 掉转顺序会导致 window.prompt() 打断 React 批处理→"会话已失效"。
      const session = createSession(name.trim());
      const tabId = tabActions.createTab("terminal", { label: name.trim(), pinned: true, sourceId: session.id });
      // 布局恢复后 _terminalCounter 可能超前 → session.id ≠ tabId。
      // 存 tabId 到 session，handleSelectSession 用它调 focusTab。
      if (tabId) {
        updateSession(session.id, { tabId } as Partial<TerminalSession>);
      }
    }
  }, [t, createSession, tabActions, updateSession]);

  const handleRename = useCallback(
    (id: string) => (name: string) => {
      updateSession(id, { name });
    },
    [updateSession],
  );

  const handleDelete = useCallback(
    (id: string) => () => {
      const session = sessions.find((s) => s.id === id);
      if (!session) return;
      const confirmed = window.confirm(
        t("关闭会话「{{name}}」？", { name: session.name }) ??
          `关闭会话「${session.name}」？`,
      );
      if (confirmed) {
        // TODO Phase 5.5c C4: 如果 connected → 先断开串口
        // Phase 5.5c C5：先关标签页（触发 confirmOnClose），再删 session
        tabActions?.closeTab(id);
        removeSession(id);
      }
    },
    [sessions, t, removeSession, tabActions],
  );

  // ── 设置辅助：从 activeSession 读 / 通过 updateSession 写 ──

  const mkSetter = useCallback(
    <K extends keyof TerminalSession>(key: K) =>
      (value: TerminalSession[K]) => {
        if (activeSessionId) {
          updateSession(activeSessionId, { [key]: value } as Partial<TerminalSession>);
        }
      },
    [activeSessionId, updateSession],
  );

  const mkToggle = useCallback(
    (key: keyof TerminalSession) => {
      const value = activeSession?.[key];
      const setter = mkSetter(key);
      return (
        <Toggle
          checked={Boolean(value)}
          onChange={(v) => setter(v as TerminalSession[typeof key])}
        />
      );
    },
    [activeSession, mkSetter],
  );

  const mkSelect = useCallback(
    (key: keyof TerminalSession, options: string[] | { value: string; label: string }[]) => {
      const value = activeSession?.[key];
      const setter = mkSetter(key);
      return (
        <Select
          value={String(value ?? "")}
          options={options}
          onChange={(v) => setter(v as TerminalSession[typeof key])}
        />
      );
    },
    [activeSession, mkSetter],
  );

  // ── 渲染 ──

  // C4b Bug 3：从 SerialContext 派生每个 session 的 connected 状态
  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setActiveSession(sessionId);
      // 🔥 用 session.tabId（创建时写入的标签页 ID）而非 session.id。
      // 布局恢复后 _terminalCounter 可能超前 → session.id ≠ tab.id → focusTab(sessionId) 静默失败。
      const s = getSessionById(sessionId);
      tabActions?.focusTab(s?.tabId || sessionId);
    },
    [setActiveSession, tabActions],
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
    <div className="terminal-sidebar">
      {/* Section 1：会话列表 */}
      <SidebarSection
        title={t("终端会话")}
        badge={sessions.length > 0 ? `(${sessions.length})` : undefined}
        actions={
          <button
            className="session-create-btn"
            title={t("新建会话")}
            onClick={(e) => {
              e.stopPropagation();
              handleCreate();
            }}
          >
            + {t("新建")}
          </button>
        }
        defaultOpen={true}
      >
        {sessions.length === 0 ? (
          <div className="session-empty">
            {t("暂无会话")}
            <button className="session-empty-link" onClick={handleCreate}>
              [+ {t("新建")}]
            </button>
            {t("开始")}
          </div>
        ) : (
          sessionList
        )}
      </SidebarSection>

      {/* Section 2：收发设置 */}
      {activeSession ? (
        <SidebarSection
          title={`${t("收发设置")} — ${activeSession.name}`}
          defaultOpen={true}
        >
          <div className="setting-group">
            <FormRow label={t("时间戳")}>
              {mkSelect("timestampFormat", timeFormats)}
            </FormRow>
            <FormRow label={t("消息回显")}>
              {mkToggle("showEcho")}
            </FormRow>
            <FormRow label={t("行号显示")}>
              {mkToggle("showLineNumbers")}
            </FormRow>
            <FormRow label={t("系统消息独立显示")}>
              {mkToggle("separateSystemLog")}
            </FormRow>
          </div>

          <div className="setting-group">
            <FormRow label={t("换行符")}>
              {mkSelect("lineEnding", lineEndings)}
            </FormRow>
            <FormRow label={t("定时发送")}>
              {mkToggle("autoRepeat")}
            </FormRow>
            {activeSession.autoRepeat && (
              <FormRow label={t("间隔(ms)")}>
                <input
                  className="input"
                  type="number"
                  value={activeSession.repeatInterval}
                  style={{ width: 80 }}
                  onChange={(e) =>
                    mkSetter("repeatInterval")(parseInt(e.target.value) || 1000)
                  }
                />
              </FormRow>
            )}
            <FormRow label={t("发送后清空")}>
              {mkToggle("autoClear")}
            </FormRow>
          </div>

          <div className="setting-group">
            <FormRow label={t("接收模式")}>
              <Select
                value={activeSession.receiveMode}
                options={[
                  { value: "text", label: t("文本") },
                  { value: "hex", label: "HEX" },
                ]}
                onChange={(v) => mkSetter("receiveMode")(v)}
              />
            </FormRow>
            <FormRow label={t("接收编码")}>
              {mkSelect("receiveCoding", ["UTF-8", "GB2312", "Shift-JIS", "Latin-1"])}
            </FormRow>
            <FormRow label={t("发送模式")}>
              <Select
                value={activeSession.sendMode}
                options={[
                  { value: "text", label: t("文本") },
                  { value: "hex", label: "HEX" },
                ]}
                onChange={(v) => mkSetter("sendMode")(v)}
              />
            </FormRow>
            <FormRow label={t("发送编码")}>
              <Select
                value={activeSession.sendCoding}
                options={["UTF-8", "GB2312", "Shift-JIS", "Latin-1"]}
                onChange={(v) => mkSetter("sendCoding")(v)}
                disabled={activeSession.sendMode === "hex"}
              />
            </FormRow>
          </div>
        </SidebarSection>
      ) : (
        <SidebarSection
          title={t("收发设置")}
          defaultOpen={true}
        >
          <div className="session-settings-placeholder">
            {t("选择一个会话以编辑收发设置")}
          </div>
        </SidebarSection>
      )}
    </div>
  );
}

export default TerminalSidebar;
