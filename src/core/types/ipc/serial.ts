/**
 * 串口 wire 契约——E5.7#97。
 *
 * OpenPortConfig 原定义在 electron/services/serial-service.ts（主进程内部），
 * 但经 preload 双端透传给插件 API（linkdesk.serial.openPort）——跨堆协议，归口本目录。
 * 请求面载荷 = SerialStatus/SerialPortInfo；推流面载荷 = SerialDataPayload/SerialStatsPayload/
 * SerialSystemPayload（E5.8#28——三通道载荷对象化，portName = 路由键）。
 *
 * 🔀 路由键通用模式（#28 契约注释 = 能力可见性）：三通道载荷的 portName 字段是"数据源路由键"——
 * 消费方按键收数据（多口并存各口各收各的）。未来 MQTT/TCP 信息源照抄此模式（topic / host:port 同构），
 * 不建通用包络层（D6——已有 API 优先原则）。
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

/** 串口数据载荷——serial.data 推送（E5.8#28：由原无口名 string 演化——D6 载荷对象化）。 */
export interface SerialDataPayload {
  /** 数据源端口 = 路由键——消费方按 portName 收自己的口的数据（多口并存各口各收） */
  portName: string;
  /** 解码后的行文本 */
  text: string;
}

/** 串口统计载荷——serial.stats 推送（E5.8#28：由原无口名 SerialStats 演化——S10 每口计数器的数据源）。
 *  tx/rx 为推送增量（非累计值）——消费方自行累加。 */
export interface SerialStatsPayload {
  /** 统计归属端口 = 路由键——各口计数器独立累加 */
  portName: string;
  tx?: number;
  rx?: number;
}

/** 串口系统消息载荷——serial.system 推送（E5.8#28：由原无口名 string 演化——S12 正则挖口名 hack 的修根）。
 *  message 保留 V2 消息格式（如 `---- 已打开串行端口 COM3 ----`），portName 结构化免解析。
 *  E5.8#30.11（P1）——type 分类标签（审视 ①：来源端分类，一个概念一处写，不做消费端文案关键词判断）：
 *  status = 正常成功流程（开/关/波特率切换）；error = 非正常流程（同口二开拒绝 D8 / 驱动错误 / 拔线）。
 *  消费端按键路由：status 按口过滤（他口操作不显示）、error 全局可见（非活动标签页也显示）。 */
export interface SerialSystemPayload {
  /** 消息归属端口 = 路由键——本端口会话专属消费（开/关状态切换）；不匹配的会话仍可显示文本但不触发状态切换 */
  portName: string;
  message: string;
  /** 消息分类——status 成功流程 / error 失败异常（D8 拒绝、驱动错误、拔线） */
  type: "status" | "error";
}

/** 端口列表条目——listPorts() 返回 */
export interface SerialPortInfo {
  name: string;
  description: string;
}
