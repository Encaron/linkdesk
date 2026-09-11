/**
 * 会话 CRUD 接线——E6#87b 从 views/SessionListView.tsx 搬出（只搬不改）。
 *
 * 覆盖：内联新建（替代 window.prompt）/ 重命名（F2）/ 删除（先断串口再关标签页）/ 选中。
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { TabsAPI } from "@linkdesk/contracts";
import type { SerialSession } from "../../hooks/useSerialSessions";
import type { SerialActions } from "../../services/SerialContext";
import { lk } from "./lk";

type T = ReturnType<typeof useTranslation>["t"];

export interface SessionCrudOptions {
  sessions: SerialSession[];
  t: T;
  tabs: TabsAPI["tabs"] | undefined;
  openPorts: Set<string>;
  actions: SerialActions;
  createSession: (name: string, id?: string) => SerialSession;
  removeSession: (id: string) => void;
  updateSession: (id: string, patch: Partial<SerialSession>) => void;
  setActiveSession: (id: string | null) => void;
}

export function useSessionCrud(o: SessionCrudOptions) {
  const { sessions, t, tabs, openPorts, actions, createSession, removeSession, updateSession, setActiveSession } = o;

  // 新建会话默认名称计数器
  const sessionCountRef = useRef(sessions.length);
  sessionCountRef.current = sessions.length;

  // 内联创建——替代 window.prompt()。prompt() 破坏 React 批处理→createTab 返回空串、
  // updateTabLabel 失效、notify() 失效。内联输入始终在 React 事件上下文内执行。
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const createInputRef = useRef<HTMLInputElement>(null);

  // ── E5#19b: F2 重命名——设置 renamingSessionId → SessionListItem isRenaming 进入编辑 ──
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);

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

  return {
    isCreating, newName, setNewName, createInputRef,
    startCreate, confirmCreate, cancelCreate,
    renamingSessionId, setRenamingSessionId,
    handleRename, handleDelete, handleSelectSession,
  };
}
