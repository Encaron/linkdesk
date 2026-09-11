/**
 * 串口监视器控制面板门面——E6#87b：原 components/ControlPanel.tsx（210 行）拆为同名夹。
 * Phase 5.5c Step C3：toolbar.tsx → ControlPanel.tsx（COM/波特率/帧格式 + 连接操作）。
 *
 * 对标 VS Code 串口监视器面板的 shell 选择器——每标签页自包含。
 *
 * E5.8#30.17（mockup 终态命令条 = 状态点 + COM + 波特率✎ + 8N1 + 校验 + spacer + 断开）：
 *   协议下拉已删；波特率改壳通用 Combobox（候选快捷 + 手输任意非标值）；
 *   8N1（数据位/停止位组合）+ 校验独立选择器——openPort 时透传 dataBits/stopBits/parity。
 *
 * 子模块：useControlPanel（接线）/ PortSelect / BaudInput / FrameSelects（三段控件）。
 */

import { useControlPanel } from "./useControlPanel";
import { PortSelect } from "./PortSelect";
import { BaudInput } from "./BaudInput";
import { FrameSelects } from "./FrameSelects";
import "../../styles/ControlPanel.css";

function ControlPanel({ sourceId }: { sourceId?: string }) {
  const p = useControlPanel(sourceId);

  return (
    <div className="control-bar">
      {/* 连接状态点 */}
      <span className={`control-dot${p.connected ? " on" : ""}`} />

      {/* COM 口下拉框——打开时自动刷新端口列表（USB 热插拔即时更新） */}
      <PortSelect
        value={p.portName}
        ports={p.ports}
        disabled={p.connected}
        onChange={p.handlePortChange}
        onOpen={p.refreshPorts}
      />

      <span className="control-sep" />

      <BaudInput value={p.baudRate} onChange={p.handleBaudChange} />

      <span className="control-sep" />

      <FrameSelects
        frameFormat={p.frameFormat}
        parity={p.frame.parity}
        parityOptions={p.parityOptions}
        onFrameChange={p.handleFrameChange}
        onParityChange={p.handleParityChange}
      />

      <span className="control-spacer" />

      {/* 连接/断开按钮 */}
      <button
        className={`control-connect-btn${p.connected ? " connected" : ""}`}
        onClick={p.handleToggleOpen}
        disabled={!p.hasSession}
      >
        {p.connected ? p.t("断开") : p.t("打开")}
      </button>
    </div>
  );
}

export default ControlPanel;
