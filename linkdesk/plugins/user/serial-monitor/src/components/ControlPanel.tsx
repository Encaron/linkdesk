/**
 * 串口监视器控制面板——一行命令条。
 * Phase 5.5c Step C3：toolbar.tsx → ControlPanel.tsx（COM/波特率/协议 + 连接操作）。
 *
 * 对标 VS Code 串口监视器面板的 shell 选择器——每标签页自包含。
 *
 * 硬规则（§3.12）：
 *   port/baudRate/protocol 唯一写入入口 → 本文件
 *   connected → SerialContext 派生（不独立 set）
 *   ❌ 不碰编码/时间戳/回显等 12 项设置——那些的唯一入口在 sidebar.tsx
 */

import { useTranslation } from "react-i18next";
import { useMemo, useCallback, useEffect } from "react";
import { useSerialContext } from "../services/SerialContext";
import SelectBox from "@src/components/shared/SelectBox";
import {
  listProtocols,
  getActiveProtocolId,
  setActiveProtocol,
} from "@src/core/registry/ProtocolRegistry";
import { useSession } from "../hooks/useSerialSessions";
import "../styles/ControlPanel.css";

const BAUD_RATES = [
  "9600", "19200", "38400", "57600", "115200",
  "230400", "460800", "921600",
];

function ControlPanel({ sourceId }: { sourceId?: string }) {
  const { t } = useTranslation();
  const { state, actions } = useSerialContext();
  const { ports, isOpen } = state;
  const { setSourceName: setPortName, setBaudRate, refreshPorts, openPort, closePort } = actions;

  // C1：用 sourceId 绑定 per-tab session，而非读全局 activeSession
  const { session: activeSession, update: updateSession } = useSession(sourceId);

  // Phase 5e：协议列表当前是静态的（仅内置 bracket），Phase 7 多协议时加 CoreEvent 通知
  const protocols = useMemo(() => listProtocols(), []);
  const activeProtocolId = getActiveProtocolId();

  // ── session.connected 派生规则（Bug 3 防御） ──
  // 不是独立 set——从 SerialContext 派生。
  // session.port 和 SourceState.sourceName 一致 + SourceState.isOpen = true → connected
  const connected = isOpen && activeSession !== null && state.sourceName === activeSession.port;

  // mount 时立即刷新端口列表——_initOnce() 是异步的，首帧 ports=[] 会显示"无可用串口"
  useEffect(() => {
    refreshPorts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 操作 ──

  const handlePortChange = useCallback(
    (port: string) => {
      if (!sourceId) return;
      updateSession({ port });
      // E8：receiveCoding 从 session 传入——不再读旧配置系统
      setPortName(port, activeSession?.receiveCoding);
      // E2c #19f：串口监视器自己持久化 lastPort——壳不再知道 serial-monitor 插件
      (window as any).linkdesk?.pluginState?.set("serial-monitor", "lastPort", port).catch((e: any) => { console.error("[serial-monitor] 保存最后端口失败:", e); });
    },
    [sourceId, updateSession, setPortName, activeSession?.receiveCoding],
  );

  const handleBaudChange = useCallback(
    (baud: string) => {
      if (!sourceId) return;
      updateSession({ baudRate: baud });
      setBaudRate(baud, activeSession?.receiveCoding);
    },
    [sourceId, updateSession, setBaudRate, activeSession?.receiveCoding],
  );

  const handleProtocolChange = useCallback(
    (protocolId: string) => {
      setActiveProtocol(protocolId);
      updateSession({ protocol: protocolId });
    },
    [updateSession],
  );

  const handleToggleOpen = useCallback(async () => {
    if (!activeSession) return;
    const enc = activeSession.receiveCoding;

    if (connected) {
      // 当前标签页的端口已打开 → 关闭
      await closePort();
    } else {
      // 当前标签页的端口未打开 → 打开（serial-service 会自动先关其他端口）
      // 打开前：确保 SerialContext 的 portName 和 baudRate 和 session 对齐
      if (!activeSession.port && ports.length > 0) {
        updateSession({ port: ports[0].name });
      }
      const targetPort = activeSession.port || ports[0]?.name;
      const targetBaud = Number(activeSession.baudRate || 115200);
      if (!targetPort) return;
      await openPort(targetPort, targetBaud, enc);
    }
  }, [connected, activeSession, closePort, openPort, ports, updateSession]);

  // ── 未连接 / 无会话状态 ──

  // B1：session 存的端口不在可用列表中 → 下拉框回退空值（不丢 session 数据，只影响显示）
  const portName = activeSession?.port && ports.some((p) => p.name === activeSession.port)
    ? activeSession.port
    : "";
  const baudRate = activeSession?.baudRate ?? "115200";

  return (
    <div className="control-bar">
      {/* 连接状态点 */}
      <span className={`control-dot${connected ? " on" : ""}`} />

      {/* COM 口下拉框——打开时自动刷新端口列表（USB 热插拔即时更新） */}
      <SelectBox
        value={portName}
        options={ports.map((p) => ({ value: p.name, label: p.name }))}
        onChange={handlePortChange}
        onOpen={refreshPorts}
        disabled={isOpen}
        placeholder={t("无可用串口")}
      />

      <span className="control-sep" />

      {/* 波特率下拉框 */}
      <SelectBox
        value={baudRate}
        options={BAUD_RATES}
        onChange={handleBaudChange}
      />

      <span className="control-sep" />

      {/* 协议下拉框 */}
      <SelectBox
        value={activeSession?.protocol ?? activeProtocolId}
        options={protocols.length > 0 ? protocols.map((p) => ({ value: p.id, label: p.name })) : []}
        onChange={handleProtocolChange}
        placeholder={t("方括号协议")}
        title={t("协议解析器")}
      />

      <span className="control-spacer" />

      {/* 连接/断开按钮 */}
      <button
        className={`control-connect-btn${connected ? " connected" : ""}`}
        onClick={handleToggleOpen}
        disabled={!activeSession}
      >
        {connected ? t("断开") : t("打开")}
      </button>
    </div>
  );
}

export default ControlPanel;
