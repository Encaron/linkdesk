import { useTranslation } from "react-i18next";
import "./StatusBar.css";

interface StatusBarProps {
  isOpen: boolean;
  txBytes: number;
  rxBytes: number;
  error?: string | null;
}

function StatusBar({ isOpen, txBytes, rxBytes, error }: StatusBarProps) {
  const { t } = useTranslation();

  return (
    <div className="status-bar">
      <span className={`status-dot${isOpen ? " connected" : ""}`} />
      <span className="status-text">
        {isOpen ? t("已连接") : t("未连接")}
      </span>
      {error && (
        <>
          <span className="status-divider">│</span>
          <span className="status-error" title={error}>{error}</span>
        </>
      )}
      <span className="status-divider">│</span>
      <span className="status-traffic">TX:{formatBytes(txBytes)} ↑</span>
      <span className="status-divider">│</span>
      <span className="status-traffic">RX:{formatBytes(rxBytes)} ↓</span>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

export default StatusBar;
