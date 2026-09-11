/**
 * 控制面板常量——E6#87b 从 components/ControlPanel.tsx 搬出（只搬不改）。
 */

export const BAUD_RATES = [
  "9600", "19200", "38400", "57600", "115200",
  "230400", "460800", "921600",
];

// E5.8#30.17：8N1 = 数据位/停止位组合选择器（常见组合 8/7 数据位 × 1/2 停止位）
export const FRAME_FORMATS = ["8N1", "8N2", "7N1", "7N2"];
