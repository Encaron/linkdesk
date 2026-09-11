/**
 * SerialContext 公共类型——E6#87b 从 services/SerialContext.tsx 搬出（只搬不改）。
 */

export interface PortInfo { name: string; description: string; }

/** E5.8#30.17：帧格式——openPort 时透传 dataBits/stopBits/parity（wire OpenPortConfig 已支持）。 */
export interface SerialFrame {
  dataBits: number;
  stopBits: number;
  parity: string;
}

/** E5.8#30.18：握手信号初始电平——openPort 打开时应用（setDtr/setRts 带端口）。 */
export interface HandshakeState {
  dtr: boolean;
  rts: boolean;
}

/** E5.8#27（S8/S10）——每打开口的独立状态（权威多口态）。单口投影 _sharedState 是"当前活动口"兼容视图。 */
export interface OpenPortEntry {
  baudRate: number;
  txBytes: number;
  rxBytes: number;
}

export interface SerialState {
  ports: PortInfo[];
  sourceName: string;
  baudRate: string;
  isOpen: boolean;
  lastError: string | null;
}

/** wire getStatus() 返回面（portName/baudRate/isOpen）+ 历史 DTO 防御性字段（E5.6 前曾带 lastError）。
 *  E5.8#30.12（P6）：txBytes/rxBytes 已删——投影 _sharedState 不再持有全局 TX/RX（per-port 计数归 _openPorts）。 */
export interface SerialStatusDto {
  portName?: string;
  baudRate?: number;
  isOpen?: boolean;
  lastError?: string | null;
}

export interface SerialActions {
  /** E5.8#30.8：开/关单动作——显式传口 + 按口已开决策（per-tab 精确） */
  toggleOpen: (port: string, baudRate?: number, encoding?: string, frame?: SerialFrame, handshake?: HandshakeState) => Promise<void>;
  /** 明确打开指定端口——多标签页场景：ControlPanel 按 per-tab connected 决策，不盲翻转 */
  openPort: (portName: string, baudRate: number, encoding?: string, frame?: SerialFrame, handshake?: HandshakeState) => Promise<void>;
  /** E5.8#30.8：明确关闭指定端口——显式传口（不再读投影口 _sharedState.sourceName） */
  closePort: (port: string) => Promise<void>;
  /** E5.8#30.10（P7）：换口——显式传旧口 + per-tab 精确触发（旧口 ∈ openPorts 才关旧开新；否则只记配置） */
  setSourceName: (name: string, oldPort: string, encoding?: string, frame?: SerialFrame, handshake?: HandshakeState) => Promise<void>;
  /** E5.8#30.8：改波特率——显式传口 + per-tab 精确判断（该口真开着才关旧重开） */
  setBaudRate: (baud: string, port: string, encoding?: string, frame?: SerialFrame, handshake?: HandshakeState) => Promise<void>;
  /** E5.8#30.17：改帧格式（8N1/校验）——显式传口 + per-tab 精确判断（该口真开着才关旧重开，同 setBaudRate 语义） */
  setFrame: (frame: SerialFrame, port: string, baudRate: number, encoding?: string, handshake?: HandshakeState) => Promise<void>;
  /** E5.8#30.18：运行中切握手信号——显式传口（per-tab 精确） */
  setDtr: (port: string, enable: boolean) => Promise<void>;
  setRts: (port: string, enable: boolean) => Promise<void>;
  /** 刷新可用串口列表——USB 热插拔后下拉框即时更新 */
  refreshPorts: () => Promise<void>;
}
