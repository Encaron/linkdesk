/**
 * 终端状态栏组件——E2b #12a。
 *
 * TX/RX 实时计数 + 连接状态指示灯。
 * loader.ts Vite glob (`plugins/*/statusBar.tsx`) 自动加载，
 * StatusBar.tsx 优先用此组件渲染，替代 plugin.json 中静态文本。
 */
import { useSerialContext } from "./SerialContext";

export default function TerminalStatusBar() {
  const { state: { txBytes, rxBytes, isOpen } } = useSerialContext();

  return (
    <>
      <span title={isOpen ? "已连接" : "未连接"}>●</span>
      <span className="status-divider">│</span>
      <span className="status-text">
        {isOpen ? `TX:${txBytes}  RX:${rxBytes}` : "TX:—  RX:—"}
      </span>
    </>
  );
}
