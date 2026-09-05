/**
 * 串口监视器控制面板——一行命令条。
 * Phase 5.5c Step C3：toolbar.tsx → ControlPanel.tsx（COM/波特率/帧格式 + 连接操作）。
 *
 * 对标 VS Code 串口监视器面板的 shell 选择器——每标签页自包含。
 *
 * E5.8#30.17（mockup 终态命令条 = 状态点 + COM + 波特率✎ + 8N1 + 校验 + spacer + 断开）：
 *   协议下拉已删；波特率改壳通用 Combobox（候选快捷 + 手输任意非标值）；
 *   8N1（数据位/停止位组合）+ 校验独立选择器——openPort 时透传 dataBits/stopBits/parity。
 *
 * 硬规则（§3.12）：
 *   port/baudRate/帧格式（8N1/校验） → 本文件
 *   connected → SerialContext 派生（不独立 set）
 *   ❌ 不碰编码/时间戳/回显等 12 项设置——那些的唯一入口在 sidebar.tsx
 */

import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo } from "react";
import { useSerialContext, getOpenPorts, type SerialFrame, type HandshakeState } from "../services/SerialContext";
// E6#54c：共享控件走 @linkdesk/ui（SelectBox 下拉 + Combobox 可输入下拉 E5.8#30.17 候选快捷 + 手输非标波特率）
import { Combobox, SelectBox } from "@linkdesk/ui";
import { useSession } from "../hooks/useSerialSessions";
import "../styles/ControlPanel.css";

const BAUD_RATES = [
  "9600", "19200", "38400", "57600", "115200",
  "230400", "460800", "921600",
];

// E5.8#30.17：8N1 = 数据位/停止位组合选择器（常见组合 8/7 数据位 × 1/2 停止位）
const FRAME_FORMATS = ["8N1", "8N2", "7N1", "7N2"];

function ControlPanel({ sourceId }: { sourceId?: string }) {
  const { t } = useTranslation();
  const { state, actions } = useSerialContext();
  const { ports } = state;
  // E5.8#30.8：openPort/closePort 合并为 toggleOpen 单动作（本组件不再拆分支；openPort/closePort 保留为 SerialActions 公共原子动作）
  const { setSourceName: setPortName, setBaudRate, setFrame, refreshPorts, toggleOpen } = actions;

  // C1：用 sourceId 绑定 per-tab session，而非读全局 activeSession
  const { session: activeSession, update: updateSession } = useSession(sourceId);

  // ── session.connected 派生规则（Bug 3 防御） ──
  // 不是独立 set——从 SerialContext 派生。
  // E5.8#29（S14）：多口下从「会话口 ∈ openPorts 集合」派生——state.sourceName 是共享投影口，
  // 另一标签页开口会污染本标签页的 isOpen/sourceName 判断；按本会话口判才 per-tab 精确。
  const connected = activeSession !== null && getOpenPorts().has(activeSession.port);

  // mount 时立即刷新端口列表——_initOnce() 是异步的，首帧 ports=[] 会显示"无可用串口"
  useEffect(() => {
    refreshPorts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── E5.8#30.17：帧格式派生——会话 dataBits/stopBits/parity ↔ openPort 透传 SerialFrame ──
  const frame = useMemo<SerialFrame>(() => ({
    dataBits: activeSession?.dataBits ?? 8,
    stopBits: activeSession?.stopBits ?? 1,
    parity: activeSession?.parity ?? "none",
  }), [activeSession?.dataBits, activeSession?.stopBits, activeSession?.parity]);
  const frameFormat = `${frame.dataBits}N${frame.stopBits}`;

  // E5.8#30.18：握手信号初始电平——会话 dtr/rts，openPort 时应用（per-COM 随会话联动）
  const handshake = useMemo<HandshakeState>(() => ({
    dtr: Boolean(activeSession?.dtr),
    rts: Boolean(activeSession?.rts),
  }), [activeSession?.dtr, activeSession?.rts]);

  // 校验选项——新增文字全走 t() + i18n/en.json（硬约束 #2）
  const parityOptions = useMemo(() => [
    { value: "none", label: t("校验 无") },
    { value: "odd", label: t("校验 奇") },
    { value: "even", label: t("校验 偶") },
  ], [t]);

  // ── 操作 ──

  const handlePortChange = useCallback(
    (port: string) => {
      if (!sourceId) return;
      // E5.8#30.10（P7）：换口前存旧口（updateSession 前的 activeSession.port）——显式传旧口给 setSourceName，
      // per-tab 精确触发（本标签页旧口真开着才关旧开新；他标签页开着不误触）
      const oldPort = activeSession?.port ?? "";
      updateSession({ port });
      // E8：receiveCoding 从 session 传入——不再读旧配置系统
      setPortName(port, oldPort, activeSession?.receiveCoding, frame, handshake);
      // E2c #19f：串口监视器自己持久化 lastPort——壳不再知道 serial-monitor 插件
      window.linkdesk?.pluginState?.set("serial-monitor", "lastPort", port).catch((e) => { console.error("[serial-monitor] 保存最后端口失败:", e); });
    },
    [sourceId, updateSession, setPortName, activeSession?.port, activeSession?.receiveCoding, frame, handshake],
  );

  const handleBaudChange = useCallback(
    (baud: string) => {
      if (!sourceId) return;
      updateSession({ baudRate: baud });
      // E5.8#30.8：显式传会话口——setBaudRate 内部按该口真开着才关旧重开（per-tab 精确）
      setBaudRate(baud, activeSession?.port ?? "", activeSession?.receiveCoding, frame, handshake);
    },
    [sourceId, updateSession, setBaudRate, activeSession?.port, activeSession?.receiveCoding, frame, handshake],
  );

  // E5.8#30.17：改帧格式——8N1 拆 dataBits/stopBits 写 session + 口开着用新帧重开（setFrame 内部按口判断）
  const handleFrameChange = useCallback(
    (v: string) => {
      if (!sourceId) return;
      const dataBits = Number(v[0]);
      const stopBits = Number(v[2]);
      const next: SerialFrame = { ...frame, dataBits, stopBits };
      updateSession({ dataBits, stopBits });
      if (activeSession) setFrame(next, activeSession.port, Number(activeSession.baudRate || 115200), activeSession.receiveCoding, handshake);
    },
    [sourceId, frame, activeSession, updateSession, setFrame, handshake],
  );

  // E5.8#30.17：改校验位——独立选择器（无/奇/偶 → parity none/odd/even）
  const handleParityChange = useCallback(
    (v: string) => {
      if (!sourceId) return;
      const next: SerialFrame = { ...frame, parity: v };
      updateSession({ parity: v });
      if (activeSession) setFrame(next, activeSession.port, Number(activeSession.baudRate || 115200), activeSession.receiveCoding, handshake);
    },
    [sourceId, frame, activeSession, updateSession, setFrame, handshake],
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
    await toggleOpen(targetPort, targetBaud, activeSession.receiveCoding, frame, handshake);
  }, [activeSession, toggleOpen, ports, updateSession, frame, handshake]);

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

      {/* 波特率——E5.8#30.17（审视 ④）壳通用 Combobox：候选快捷 + 手输任意非标值 */}
      <Combobox
        value={baudRate}
        options={BAUD_RATES}
        onChange={handleBaudChange}
        title={t("波特率")}
        inputMode="numeric"
      />

      <span className="control-sep" />

      {/* 8N1——数据位/停止位组合选择器（E5.8#30.17） */}
      <SelectBox
        value={frameFormat}
        options={FRAME_FORMATS}
        onChange={handleFrameChange}
        title={`${t("数据位")}/${t("停止位")}`}
        className="control-select-narrow"
      />

      {/* 校验位——独立选择器（E5.8#30.17）：无/奇/偶 */}
      <SelectBox
        value={frame.parity}
        options={parityOptions}
        onChange={handleParityChange}
        title={t("校验")}
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
