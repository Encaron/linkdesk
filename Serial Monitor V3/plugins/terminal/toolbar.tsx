/**
 * 终端串口工具栏。
 * Phase 4：TopBar 移除后，串口控制（COM口/波特率/打开关闭）移入终端内部。
 * 对标 VS Code 终端下拉框。
 */

import { useTranslation } from "react-i18next";
import { useSerialContext } from "../../src/core/SerialContext";
import "./toolbar.css";

const BAUD_RATES = ["9600", "19200", "38400", "57600", "115200", "230400", "460800", "921600"];

function TerminalToolbar() {
  const { t } = useTranslation();
  const { state, actions } = useSerialContext();
  const { ports, portName, baudRate, isOpen } = state;
  const { toggleOpen, setPortName, setBaudRate } = actions;

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
