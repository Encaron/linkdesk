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
import { useState, useCallback, useEffect } from "react";
import { useSerialContext, getOpenPorts } from "../services/SerialContext";
import SelectBox from "@src/components/shared/select-box/SelectBox";
// E5.6#11.5h：协议注册表走 lk.protocol.*（IPC 到壳侧 ProtocolRegistry）
import { useSession } from "../hooks/useSerialSessions";
import "../styles/ControlPanel.css";

const BAUD_RATES = [
  "9600", "19200", "38400", "57600", "115200",
  "230400", "460800", "921600",
];

function ControlPanel({ sourceId }: { sourceId?: string }) {
  const { t } = useTranslation();
  const { state, actions } = useSerialContext();
  const { ports } = state;
  // E5.8#30.8：openPort/closePort 合并为 toggleOpen 单动作（本组件不再拆分支；openPort/closePort 保留为 SerialActions 公共原子动作）
  const { setSourceName: setPortName, setBaudRate, refreshPorts, toggleOpen } = actions;

  // C1：用 sourceId 绑定 per-tab session，而非读全局 activeSession
  const { session: activeSession, update: updateSession } = useSession(sourceId);

  // Phase 5e：协议列表当前是静态的（仅内置 bracket），Phase 7 多协议时加 CoreEvent 通知
  // E5.6#11.5h：协议注册表走 lk.protocol.*（IPC 到壳侧），async → useState + useEffect
  const [protocols, setProtocols] = useState<Array<{ id: string; name: string; pluginId: string; mode: string }>>([]);
  const [shellActiveProtocolId, setShellActiveProtocolId] = useState("bracket");
  useEffect(() => {
    const lk = window.linkdesk;
    lk?.protocol?.listProtocols?.().then((p) => setProtocols(p ?? []));
    lk?.protocol?.getActiveProtocolId?.().then((id) => setShellActiveProtocolId(id ?? "bracket"));
  }, []);

  // ── session.connected 派生规则（Bug 3 防御） ──
  // 不是独立 set——从 SerialContext 派生。
  // E5.8#29（S14）：多口下从「会话口 ∈ openPorts 集合」派生——state.sourceName 是共享投影口，
  // 另一标签页开口会污染本标签页的 isOpen/sourceName 判断；按本会话口判才 per-tab 精确。
  const connected = activeSession !== null && getOpenPorts().has(activeSession.port);

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
      window.linkdesk?.pluginState?.set("serial-monitor", "lastPort", port).catch((e) => { console.error("[serial-monitor] 保存最后端口失败:", e); });
    },
    [sourceId, updateSession, setPortName, activeSession?.receiveCoding],
  );

  const handleBaudChange = useCallback(
    (baud: string) => {
      if (!sourceId) return;
      updateSession({ baudRate: baud });
      // E5.8#30.8：显式传会话口——setBaudRate 内部按该口真开着才关旧重开（per-tab 精确）
      setBaudRate(baud, activeSession?.port ?? "", activeSession?.receiveCoding);
    },
    [sourceId, updateSession, setBaudRate, activeSession?.port, activeSession?.receiveCoding],
  );

  const handleProtocolChange = useCallback(
    (protocolId: string) => {
      window.linkdesk?.protocol?.setActiveProtocolId?.(protocolId);
      updateSession({ protocol: protocolId });
    },
    [updateSession],
  );

  // E5.8#30.8：开/关单动作合并进 toggleOpen（内部按口已开决策）——本组件只对齐 session 参数再委托。
  // connected 仍派生用于 UI（状态点/禁用/按钮文字），但开/关决策不再在此拆分支。
  const handleToggleOpen = useCallback(async () => {
    if (!activeSession) return;
    let targetPort = activeSession.port;
    const targetBaud = Number(activeSession.baudRate || 115200);
    if (!targetPort && ports.length > 0) {
      // 打开前：会话无端口时选第一个可用口并落 session（E5.8#29 多口共存 D1——不影响其他已开口）
      targetPort = ports[0].name;
      updateSession({ port: targetPort });
    }
    if (!targetPort) return;
    await toggleOpen(targetPort, targetBaud, activeSession.receiveCoding);
  }, [activeSession, toggleOpen, ports, updateSession]);

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
      {/* E5.8#29（S14）：disabled={connected} 而非 isOpen——isOpen 是共享投影口状态，另一标签页
          开口会禁用本标签页换口；本会话口已开才禁用（per-tab 精确） */}
      <SelectBox
        value={portName}
        options={ports.map((p) => ({ value: p.name, label: p.name }))}
        onChange={handlePortChange}
        onOpen={refreshPorts}
        disabled={connected}
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
        value={activeSession?.protocol ?? shellActiveProtocolId}
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
