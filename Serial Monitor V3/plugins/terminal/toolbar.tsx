/**
 * 终端串口工具栏。
 * Phase 4：TopBar 移除后，串口控制（COM口/波特率/打开关闭）移入终端内部。
 * Phase 5e：新增协议下拉框——ProtocolRegistry.list() 动态生成。
 * 对标 VS Code 终端下拉框。
 */

import { useTranslation } from "react-i18next";
import { useState, useMemo } from "react";
import { useSerialContext } from "../../src/core/SerialContext";
import {
  listProtocols,
  getActiveProtocolId,
  setActiveProtocol,
} from "../../src/core/ProtocolRegistry";
import "./toolbar.css";

const BAUD_RATES = ["9600", "19200", "38400", "57600", "115200", "230400", "460800", "921600"];

function TerminalToolbar() {
  const { t } = useTranslation();
  const { state, actions } = useSerialContext();
  const { ports, portName, baudRate, isOpen } = state;
  const { toggleOpen, setPortName, setBaudRate } = actions;

  // Phase 5e：协议列表当前是静态的（仅内置 bracket），Phase 7 多协议时加 CoreEvent 通知
  const protocols = useMemo(() => listProtocols(), []);
  const [activeProtocolId, setActiveProtocolId] = useState(getActiveProtocolId);

  const handleProtocolChange = (protocolId: string) => {
    setActiveProtocol(protocolId);
    setActiveProtocolId(protocolId);
  };

  return (
    <div className="terminal-toolbar-bar">
      <select
        className="terminal-toolbar-select"
        value={portName}
        onChange={(e) => setPortName(e.target.value)}
        disabled={isOpen}
      >
        {ports.length > 0
          ? ports.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))
          : <option value={portName}>{portName}</option>}
      </select>

      <select
        className="terminal-toolbar-select"
        value={baudRate}
        onChange={(e) => setBaudRate(e.target.value)}
      >
        {BAUD_RATES.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>

      <select
        className="terminal-toolbar-select"
        value={activeProtocolId}
        onChange={(e) => handleProtocolChange(e.target.value)}
        title={t("协议解析器")}
      >
        {protocols.length > 0
          ? protocols.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))
          : <option value="bracket">{t("方括号协议")}</option>}
      </select>

      <button
        className={`terminal-toolbar-open-btn${isOpen ? " connected" : ""}`}
        onClick={toggleOpen}
      >
        <span className={`terminal-toolbar-dot${isOpen ? " on" : ""}`} />
        {isOpen ? t("已连接") : t("打开串口")}
      </button>
    </div>
  );
}

export default TerminalToolbar;
