/**
 * SerialSettingsView 门面——E6#87b：原 views/SerialSettingsView.tsx（221 行）拆为同名夹 + 本门面。
 * 🔴 门面形态：views/ 用**同级同名文件**（非夹内 index）——本文件路径 = plugin.json
 *    `contributes.views[].render` 字面值，也是 SDK 编译表面 key（views/SerialSettingsView.bundle.js）。
 *    改成夹内 index 会让 render 指向不存在文件 → SDK 静默跳过该表面 + dev 池按路径 import 直接炸。
 * E36#8.4：从 sidebar.tsx 搬出设置 helpers + 三个 setting-group。不包 SidebarSection——SidePanel 渲染循环统一包。
 *
 * 对标 VS Code Explorer 下半 = 文件属性（收发设置，随选中会话联动）。
 *
 * 子模块：setters（读写接线三件套）/ useHandshakeChange（DTR·RTS 直发）/
 *        DisplayGroup · SendBehaviorGroup · CodingGroup · HandshakeGroup（四个 setting-group）。
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSerialSessions } from "../hooks/useSerialSessions";
import { useSerialContext } from "../services/SerialContext";
import "../styles/SerialMonitorSidebar.css";
import { RAW_TIME_FORMATS } from "./SerialSettingsView/constants";
import { useSessionSetters } from "./SerialSettingsView/setters";
import { useHandshakeChange } from "./SerialSettingsView/useHandshakeChange";
import { DisplayGroup } from "./SerialSettingsView/DisplayGroup";
import { SendBehaviorGroup } from "./SerialSettingsView/SendBehaviorGroup";
import { CodingGroup } from "./SerialSettingsView/CodingGroup";
import { HandshakeGroup } from "./SerialSettingsView/HandshakeGroup";

export default function SerialSettingsView() {
  const { t } = useTranslation();
  const timeFormats = RAW_TIME_FORMATS.map((f) => f === "无" ? t("无") : f);
  const { activeSession, activeSessionId, updateSession } = useSerialSessions();
  const { actions } = useSerialContext();
  const { setDtr, setRts } = actions;

  const api = useSessionSetters(activeSession, activeSessionId, updateSession);
  const handleHandshakeChange = useHandshakeChange(activeSession, activeSessionId, updateSession, setDtr, setRts);

  // ── 动态标题——随 activeSession.name 变化更新 ViewDescriptor ──
  // registerView 同一 (pluginId, id) 重复调用 = 更新已有（不创建第二条记录）
  useEffect(() => {
    const title = activeSession?.name
      ? `${t("收发设置")} — ${activeSession.name}`
      : t("收发设置");
    window.linkdesk?.viewContainer?.registerView?.("serial-monitor", "serial-monitor", {
      id: "receive-and-send",
      title,
    });
  }, [activeSession?.name, t]);

  // ── 无活跃会话时显示占位 ──
  if (!activeSession) {
    return (
      <div className="session-settings-placeholder">
        {t("选择一个会话以编辑收发设置")}
      </div>
    );
  }

  // ── 有活跃会话时显示四个 setting-group ──
  return (
    <>
      <DisplayGroup api={api} timeFormats={timeFormats} />
      <SendBehaviorGroup api={api} session={activeSession} />
      <CodingGroup api={api} session={activeSession} />
      <HandshakeGroup session={activeSession} onHandshakeChange={handleHandshakeChange} />
    </>
  );
}
