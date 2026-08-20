/**
 * 串口 wire 契约——E5.7#97。
 *
 * OpenPortConfig 原定义在 electron/services/serial-service.ts（主进程内部），
 * 但经 preload 双端透传给插件 API（linkdesk.serial.openPort）——跨堆协议，归口本目录。
 * SerialStatus/SerialStats/SerialPortInfo 同为串口通道载荷。
 */

/** 打开串口配置——插件 API 入参 + 主进程 serial-service 消费 */
export interface OpenPortConfig {
  portName: string;
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: string;
  encoding?: string;
  /** E5.8#26 D8——资源归属声明：由插件 openPort 时自声明（pool WCV 多插件同 JS 上下文，
   *  主进程无法从 sender 识别插件），卸载时 closePortsByOwner 按此回收硬件资源。 */
  ownerPluginId?: string;
}

/** 串口状态快照——F5 刷新 / getStatus() 返回 */
export interface SerialStatus {
  isOpen: boolean;
  portName: string;
  baudRate: number;
}

/** 收发统计——serial.stats 推送载荷 */
export interface SerialStats {
  tx?: number;
  rx?: number;
}

/** 端口列表条目——listPorts() 返回 */
export interface SerialPortInfo {
  name: string;
  description: string;
}
