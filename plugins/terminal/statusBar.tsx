/**
 * 终端状态栏组件——E2b #12a + #12b。
 *
 * TX/RX 实时计数 + 连接状态指示灯。
 * loader.ts Vite glob (`plugins/*/statusBar.tsx`) 自动加载，
 * StatusBar.tsx 优先用此组件渲染，替代 plugin.json 中静态文本。
 *
 * #12b：读 serial-monitor.statusBar.txrx / .connection 配置——Settings Editor 可显隐。
 */
import { useSerialContext } from "./SerialContext";
import { useConfigurationValue } from "@src/core/useConfiguration";

export default function TerminalStatusBar() {
  const { state: { txBytes, rxBytes, isOpen } } = useSerialContext();
  const showTxRx = useConfigurationValue<boolean>("serial-monitor.statusBar.txrx") ?? true;
  const showConnection = useConfigurationValue<boolean>("serial-monitor.statusBar.connection") ?? true;

  return (
    <>
      {showConnection && (
        <span title={isOpen ? "已连接" : "未连接"}>●</span>
      )}
      {showConnection && showTxRx && (
        <span className="status-divider">│</span>
      )}
      {showTxRx && (
        <span className="status-text">
          {isOpen ? `TX:${txBytes}  RX:${rxBytes}` : "TX:—  RX:—"}
        </span>
      )}
    </>
  );
}
