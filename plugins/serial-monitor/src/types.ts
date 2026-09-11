/**
 * 跨层共享类型——E6#87b 从 src/index.tsx 搬出。
 * 接收区行的类型标签与数据形态：cm6 装饰、接收区渲染、合屏快照三处共同消费。
 */

export type LineType = "received" | "sent" | "system";

/** E5.8#30.19a：接收区行——received 双形态（text=ASCII 栏 / hex=HEX 栏），sent/system 仅 text */
export interface ReceiveItem {
  text: string;
  hex?: string;
  type: LineType;
}
