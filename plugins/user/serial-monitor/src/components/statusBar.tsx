// 串口监视器状态栏组件——E2b #12a + #12b。
// TX/RX 实时计数 + 连接状态指示灯。
// loader.ts Vite glob plugins/* /statusBar.tsx 自动加载，
// StatusBar.tsx 优先用此组件渲染，替代 plugin.json 中静态文本。
// #12b：读 serial-monitor.statusBar.txrx / .connection 配置——Settings Editor 可显隐。
import { useTranslation } from "react-i18next";
import { useSerialContext } from "../services/SerialContext";
import { useConfigurationValue } from "@src/core/react/useConfiguration";

export default function SerialMonitorStatusBar() {
  const { t } = useTranslation();
  const { state: { txBytes, rxBytes, isOpen } } = useSerialContext();
  const showTxRx = useConfigurationValue<boolean>("serial-monitor.statusBar.txrx") ?? true;
  const showConnection = useConfigurationValue<boolean>("serial-monitor.statusBar.connection") ?? true;

  return (
    <>
      {showConnection && (
        <span
          title={isOpen ? t("已连接") : t("未连接")}
          style={{ color: isOpen ? "var(--serial-monitor-ok)" : "var(--text-muted)" }}
        >
          <span className="codicon codicon-circle-filled" />
        </span>
      )}
      {showConnection && showTxRx && (
        <span className="status-divider" />
      )}
      {showTxRx && (
        <span className="status-text">
          {isOpen ? "TX:" + txBytes + "  RX:" + rxBytes : "TX:--  RX:--"}
        </span>
      )}
    </>
  );
}
