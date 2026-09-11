/**
 * SessionListView 门面——E6#87b：原 views/SessionListView.tsx（263 行）拆为同名夹 + 本门面。
 * 🔴 门面形态：views/ 用**同级同名文件**（非夹内 index）——本文件路径 = plugin.json
 *    `contributes.views[].render` 字面值，也是 SDK 编译表面 key（views/SessionListView.bundle.js）。
 *    改成夹内 index 会让 render 指向不存在文件 → SDK 静默跳过该表面 + dev 池按路径 import 直接炸。
 * E36#8.2：从 sidebar.tsx 搬出会话 CRUD 逻辑。不包 SidebarSection——SidePanel 渲染循环统一包。
 *
 * 对标 VS Code Explorer：上半 = 文件列表（会话 CRUD），下半 = 文件属性（收发设置）。
 *
 * 子模块：useSerialConnection（跨 WebView 连接集合）/ useSessionCrud（新建·重命名·删除·选中）/
 *        SessionList（列表容器 + F2 分区）/ SessionCreateInline（内联新建输入）/ SessionEmpty（空态）。
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSerialSessions } from "../hooks/useSerialSessions";
// E5.8#30.13（P9）：删除开着串口的会话 → 先断开——走 useSerialContext 的 actions.closePort
//（与 ControlPanel 同一咽喉，_openPorts/灯/pluginState 一并维护；引用计数防重复注册 IPC 监听器）
import { useSerialContext } from "../services/SerialContext";
import "../styles/SerialMonitorSidebar.css";
import { lk } from "./SessionListView/lk";
import { useSerialConnection } from "./SessionListView/useSerialConnection";
import { useSessionCrud } from "./SessionListView/useSessionCrud";
import { SessionList } from "./SessionListView/SessionList";
import { SessionCreateInline } from "./SessionListView/SessionCreateInline";
import { SessionEmpty } from "./SessionListView/SessionEmpty";

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

  const crud = useSessionCrud({
    sessions, t, tabs, openPorts, actions,
    createSession, removeSession, updateSession, setActiveSession,
  });

  useEffect(() => {
    lk().contextKey?.set("serialSessionFocus", activeSessionId !== null);
    return () => { lk().contextKey?.set("serialSessionFocus", false); };
  }, [activeSessionId]);

  return (
    <>
      {/* 新建按钮——内容顶部，不靠 SidebarSection header actions */}
      <div className="session-list-toolbar">
        <button
          className="session-create-btn"
          title={t("新建会话")}
          onClick={(e) => {
            e.stopPropagation();
            crud.startCreate();
          }}
        >
          + {t("新建")}
        </button>
        {sessions.length > 0 && (
          <span className="session-count">({sessions.length})</span>
        )}
      </div>

      {crud.isCreating && (
        <SessionCreateInline
          inputRef={crud.createInputRef}
          value={crud.newName}
          onChange={crud.setNewName}
          onConfirm={crud.confirmCreate}
          onCancel={crud.cancelCreate}
        />
      )}

      {sessions.length === 0 && !crud.isCreating ? (
        <SessionEmpty onCreate={crud.startCreate} />
      ) : (
        <SessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          renamingSessionId={crud.renamingSessionId}
          openPorts={openPorts}
          onSelect={crud.handleSelectSession}
          onRename={crud.handleRename}
          onDelete={crud.handleDelete}
          onF2={crud.setRenamingSessionId}
        />
      )}
    </>
  );
}
