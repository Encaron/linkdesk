/**
 * 终端控制面板——一行命令条。
 * Phase 5.5c Step C3：toolbar.tsx → ControlPanel.tsx（COM/波特率/协议 + 连接操作）。
 *
 * 对标 VS Code 终端面板的 shell 选择器——每标签页自包含。
 *
 * 硬规则（§3.12）：
 *   port/baudRate/protocol 唯一写入入口 → 本文件
 *   connected → SerialContext 派生（不独立 set）
 *   ❌ 不碰编码/时间戳/回显等 12 项设置——那些的唯一入口在 sidebar.tsx
 */

import { useTranslation } from "react-i18next";
import { useMemo, useCallback } from "react";
import { useSerialContext } from "@src/core/SerialContext";
import {
  listProtocols,
  getActiveProtocolId,
  setActiveProtocol,
} from "@src/core/ProtocolRegistry";
import { useSession } from "./useTerminalSessions";
import "./ControlPanel.css";

const BAUD_RATES = [
  "9600", "19200", "38400", "57600", "115200",
  "230400", "460800", "921600",
];

function ControlPanel({ sourceId }: { sourceId?: string }) {
  const { t } = useTranslation();
  const { state, actions } = useSerialContext();
  const { ports, isOpen } = state;
  const { toggleOpen, setPortName, setBaudRate } = actions;

  // C1：用 sourceId 绑定 per-tab session，而非读全局 activeSession
  const { session: activeSession, update: updateSession } = useSession(sourceId);

  // Phase 5e：协议列表当前是静态的（仅内置 bracket），Phase 7 多协议时加 CoreEvent 通知
  const protocols = useMemo(() => listProtocols(), []);
  const activeProtocolId = getActiveProtocolId();

  // ── session.connected 派生规则（Bug 3 防御） ──
  // 不是独立 set——从 SerialContext 派生。
  // session.port 和 SerialContext.portName 一致 + SerialContext.isOpen = true → connected
  const connected = isOpen && activeSession !== null && state.portName === activeSession.port;

  // ── 操作 ──

  const handlePortChange = useCallback(
    (port: string) => {
      if (!sourceId) return;
      updateSession({ port });
      setPortName(port);
    },
    [sourceId, updateSession, setPortName],
  );

  const handleBaudChange = useCallback(
    (baud: string) => {
      if (!sourceId) return;
      updateSession({ baudRate: baud });
      setBaudRate(baud);
    },
    [sourceId, updateSession, setBaudRate],
  );

  const handleProtocolChange = useCallback(
    (protocolId: string) => {
      setActiveProtocol(protocolId);
      updateSession({ protocol: protocolId });
    },
    [updateSession],
  );

  const handleToggleOpen = useCallback(async () => {
    // 打开前：确保 SerialContext 的 portName 和 baudRate 和 session 对齐
    if (!isOpen && activeSession) {
      // A3+G23：会话还没选端口 → 自动填第一个可用端口
      if (!activeSession.port && ports.length > 0) {
        updateSession({ port: ports[0].name });
        await setPortName(ports[0].name);
      } else if (activeSession.port && activeSession.port !== state.portName) {
        await setPortName(activeSession.port);
      }
      if (activeSession.baudRate !== state.baudRate) {
        await setBaudRate(activeSession.baudRate);
      }
    }
    await toggleOpen();
  }, [isOpen, activeSession, state.portName, state.baudRate, setPortName, setBaudRate, toggleOpen, ports, updateSession]);

  // ── 未连接 / 无会话状态 ──

  // B1：session 存的端口已不在可用端口列表中（拔掉了）→ 下拉框回退到空值
  const portInList = !!(activeSession?.port && ports.some((p) => p.name === activeSession.port));
  const portName = portInList ? activeSession!.port : "";
  const baudRate = activeSession?.baudRate ?? "115200";

  return (
    <div className="control-bar">
      {/* 连接状态点 */}
      <span className={`control-dot${connected ? " on" : ""}`} />

      {/* COM 口下拉框 */}
      <select
        className="control-select port-select"
        value={portName}
        onChange={(e) => handlePortChange(e.target.value)}
        disabled={isOpen}
      >
        {ports.length > 0 ? (
          ports.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))
        ) : (
          <option value="">{t("无可用串口")}</option>
        )}
      </select>

      <span className="control-sep" />

      {/* 波特率下拉框 */}
      <select
        className="control-select"
        value={baudRate}
        onChange={(e) => handleBaudChange(e.target.value)}
      >
        {BAUD_RATES.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>

      <span className="control-sep" />

      {/* 协议下拉框 */}
      <select
        className="control-select"
        value={activeSession?.protocol ?? activeProtocolId}
        onChange={(e) => handleProtocolChange(e.target.value)}
        title={t("协议解析器")}
      >
        {protocols.length > 0 ? (
          protocols.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))
        ) : (
          <option value="bracket">{t("方括号协议")}</option>
        )}
      </select>

      <span className="control-spacer" />

      {/* 连接/断开按钮 */}
      <button
        className={`control-connect-btn${connected ? " connected" : ""}`}
        onClick={handleToggleOpen}
        disabled={!activeSession}
      >
        {connected ? t("断开") : t("● 打开")}
      </button>
    </div>
  );
}

export default ControlPanel;
