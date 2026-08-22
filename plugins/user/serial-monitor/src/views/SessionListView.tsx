/**
 * SessionListView——串口监视器会话列表 view。
 * E36#8.2：从 sidebar.tsx 搬出会话 CRUD 逻辑。不包 SidebarSection——SidePanel 渲染循环统一包。
 *
 * 对标 VS Code Explorer：上半 = 文件列表（会话 CRUD），下半 = 文件属性（收发设置）。
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSerialSessions } from "../hooks/useSerialSessions";
// E5.8#30.13（P9）：删除开着串口的会话 → 先断开——走 useSerialContext 的 actions.closePort
//（与 ControlPanel 同一咽喉，_openPorts/灯/pluginState 一并维护；引用计数防重复注册 IPC 监听器）
import { useSerialContext } from "../services/SerialContext";

import { SessionListItem } from "../components/SessionListItem";
import { SERIAL_MONITOR_PLUGIN_ID } from "../utils/pluginId";
// E5.7#98：plugin-state:changed 载荷走 events.on 泛型——wire 契约类型归口 src/core/types/ipc/events
// E5.8#20-c：契约化——events 载荷类型走 @linkdesk/contracts（零 @src/core）
import type { PluginStateChangedPayload } from "@linkdesk/contracts";
import "../styles/SerialMonitorSidebar.css";

const lk = () => window.linkdesk;

// ── E5.5#7 Bug C fix：侧栏从 pluginState IPC 读取连接状态（多 WebView 下 useSerialContext 是隔离实例）。
// E5.5#9m：9l 将 key 改为 <sourceName>:isOpen 格式——侧栏用 events.on 通配订阅，从键名提取端口。
// E5.8#27（S15）：多口集合——每口自己的 key 自己亮（删 E5.7#89-fix 换灯补丁：单口顶替语义已删，
// 多口集合天然处理"任意口开→add / 关→delete"，换口/多开无需 sourceName 换灯信号）。

/** E5.8#27（S15）：从 plugin-state:changed 通配事件读多口连接集合——key 带端口前缀（如 COM3:isOpen） */
function useSerialConnection(): { openPorts: Set<string> } {
  const [openPorts, setOpenPorts] = useState<Set<string>>(new Set());

  useEffect(() => {
    // E5.5#9m：直接订阅 plugin-state:changed——key 带端口前缀（如 COM3:isOpen），
    // pluginState.onChange 的精确 key 匹配无法捕获通配键名。
    const handler = (data: PluginStateChangedPayload) => {
      if (data?.pluginId !== SERIAL_MONITOR_PLUGIN_ID) return;
      const k: string = data.key ?? "";
      if (!k.endsWith(":isOpen") || typeof data.value !== "boolean") return;
      const port = k.slice(0, -7); // "COM3:isOpen" → "COM3"
      setOpenPorts((prev) => {
        const next = new Set(prev);
        if (data.value) next.add(port);
        else next.delete(port);
        return next;
      });
    };
    const unsub = lk()?.events?.on<PluginStateChangedPayload>("plugin-state:changed", handler);
    return () => { unsub?.(); };
  }, []);

  return { openPorts };
}

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

  // Phase 5.5c C4b Bug 3：connected 从 pluginState IPC 派生——多 WebView 下侧栏在壳 WebView，
  // useSerialContext 的 _sharedState 是隔离实例，必须走跨 WebView 的 pluginState 通道。
  // E5.8#27（S15）：多口集合——每会话 connected = 自己的口 ∈ openPorts（各按口亮，互不顶替）
  const { openPorts } = useSerialConnection();
  // E5.8#30.13（P9）：删除会话时断开串口——actions.closePort 走灯写入咽喉
  const { actions } = useSerialContext();

  // Phase 5.5c C5：侧栏需要操作标签页——创建会话 → 开标签页，点会话 → 聚焦标签页
  const tabs = window.linkdesk?.tabs;

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
      // E5.8#30.13（P9）：开着串口的会话 → 强提示「会话正在使用 {{port}}，将断开连接」；
      // 未开 → 原通用确认「关闭会话「{{name}}」？」；配置开关「关闭时提示」关 → 都不弹直接删。
      const isOpen = openPorts.has(session.port);
      let promptOnClose = true;
      try {
        promptOnClose = (await lk()?.configuration?.get?.("serial-monitor.confirmOnClose")) !== false;
      } catch { /* 读配置失败按默认开——宁多提示勿静默断口 */ }
      if (promptOnClose) {
        const message = isOpen
          ? t("会话正在使用 {{port}}，将断开连接", { port: session.port }) ??
            `会话正在使用 ${session.port}，将断开连接`
          : t("关闭会话「{{name}}」？", { name: session.name }) ??
            `关闭会话「${session.name}」？`;
        const confirmed = await window.linkdesk?.dialog?.confirm?.(message);
        if (!confirmed) return;
      }
      if (isOpen) {
        // P9：确认后先断开串口——actions.closePort 走灯写入咽喉（#30.9，归一性）
        await actions.closePort(session.port);
      }
      // Phase 5.5c C5：先关标签页（触发 confirmOnClose），再删 session。
      // 用 closeTabBySourceId——sourceId 是 session↔tab 的唯一可靠链接。
      // tab.id 和 session.id 可能因布局恢复/计数器漂移不一致。
      tabs?.closeBySourceId(id);
      removeSession(id);
    },
    [sessions, t, removeSession, tabs, openPorts, actions],
  );

  // 🔥 E3a #29a：侧栏↔标签页走 tabs.create 单一入口
  // E5.6#11.5h：原 activateSidebarItem 函数体内联——tabs.create(pluginId, { sourceId, ...opts })
  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setActiveSession(sessionId);
      const session = sessions.find((s) => s.id === sessionId);
      if (tabs) {
        tabs.create("serial-monitor", {
          sourceId: sessionId,
          label: session?.name,
          pinned: true,
        });
      }
    },
    [setActiveSession, tabs, sessions],
  );

  // ── E5#19b: F2 重命名——设置 renamingSessionId → SessionListItem isRenaming 进入编辑 ──
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);

  useEffect(() => {
    lk().contextKey?.set("serialSessionFocus", activeSessionId !== null);
    return () => { lk().contextKey?.set("serialSessionFocus", false); };
  }, [activeSessionId]);

  const sessionList = sessions.map((s) => (
    <SessionListItem
      key={s.id}
      session={s}
      isActive={s.id === activeSessionId}
      isRenaming={s.id === renamingSessionId}
      connected={openPorts.has(s.port)}
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
        /* ── E5.8#24.8.4：F2 重命名——容器 onKeyDown + tabIndex（对齐池侧自处理）──
         * 原 document 级 keydown 监听无焦点守卫——串口有活动会话时劫持全池 F2
         * （文件树聚焦按 F2 会同时触发串口重命名）。改容器 tabIndex=0 + onKeyDown：
         * DOM 焦点天然分区——点击列表项浏览器把焦点给最近可聚焦祖先（本容器），
         * 只有本列表聚焦才收到 F2；Monaco/文件树聚焦时收不到，互不打扰。
         * 新建输入框在容器外（聚焦按 F2 不触发）；重命名 InlineInput 已 stopPropagation。 */
        <div
          className="session-list"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "F2") {
              e.preventDefault();
              if (activeSessionId) setRenamingSessionId(activeSessionId);
            }
          }}
        >
          {sessionList}
        </div>
      )}
    </>
  );
}
