import { useTranslation } from "react-i18next";
import "./TopBar.css";

interface TopBarProps {
  portName: string;
  baudRate: string;
  isOpen: boolean;
  onToggleOpen: () => void;
}

const baudRates = ["9600", "19200", "38400", "57600", "115200", "230400", "460800", "921600"];

function TopBar({ portName, baudRate, isOpen, onToggleOpen }: TopBarProps) {
  const { t } = useTranslation();

  return (
    <div className="top-bar">
      {/* 左侧：串口控制 */}
      <div className="top-bar-left">
        <select className="input top-select" value={portName}>
          <option>{portName || "COM3"}</option>
        </select>
        <select className="input top-select" value={baudRate}>
          {baudRates.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <button
          className={`top-btn-open${isOpen ? " connected" : ""}`}
          onClick={onToggleOpen}
        >
          <span className={`top-btn-dot${isOpen ? " on" : ""}`} />
          {isOpen ? t("已连接") : t("打开串口")}
        </button>
      </div>

      {/* 分隔线 */}
      <div className="top-bar-divider" />

      {/* 右侧：工具 */}
      <div className="top-bar-right">
        <button className="top-btn-icon" title="切换语言（Phase 4）">
          中/EN
        </button>
        <button className="top-btn-icon" title="切换主题（Phase 4）">
          ☀
        </button>
        <button className="top-btn-icon" title="帮助">
          ?
        </button>
      </div>
    </div>
  );
}

export default TopBar;
