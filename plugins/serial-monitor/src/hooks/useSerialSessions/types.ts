/**
 * 会话数据模型——E6#87b 从 hooks/useSerialSessions.ts 搬出（只搬不改）。
 */

export interface SerialSession {
  id: string; name: string; port: string; baudRate: string;
  // E5.8#30.17：帧格式（数据位/停止位/校验）——命令条 8N1 + 校验选择器，openPort 时透传
  dataBits: number; stopBits: number; parity: string;
  // E5.8#30.18：握手信号 DTR/RTS 初始电平（per-COM，侧栏「握手信号」group）——打开时应用 + 运行中切换直发
  dtr: boolean; rts: boolean;
  // E5.8#30.19a：接收区 HEX+ASCII 双栏渲染开关（per-COM，侧栏「显示」group）——开 = 接收区并排 HEX/ASCII 两栏
  hexAsciiDualPane: boolean;
  // E5.8#30.19b：不可见字符转义开关（per-COM，侧栏「显示」group）——`\n`/`\r`/`\t` 等显示为可见符号
  escapeInvisibleChars: boolean;
  // E5.8#30.20：自动保存接收区开关（per-COM，侧栏「显示」group）——端口关闭 + 应用退出时落盘，防数据丢失
  autoSaveReceive: boolean;
  // E5.8#30.21：打开即发初始化序列开关（per-COM，侧栏「发送行为」group）——打开端口自动发送 quickSends 序列（归一化复用，不新建平行概念）
  sendInitOnOpen: boolean;
  connected: boolean; timestampFormat: string; showEcho: boolean;
  showLineNumbers: boolean; separateSystemLog: boolean; lineEnding: string;
  autoRepeat: boolean; repeatInterval: number; autoClear: boolean;
  receiveMode: string; receiveCoding: string; sendMode: string; sendCoding: string;
  quickSends: Record<string, string>; color: string;
}

export const DEFAULT_SESSION: Omit<SerialSession, "id" | "name" | "color"> = {
  port: "", baudRate: "115200", dataBits: 8, stopBits: 1, parity: "none",
  dtr: false, rts: false, hexAsciiDualPane: false, escapeInvisibleChars: false, autoSaveReceive: true, sendInitOnOpen: false, connected: false,
  timestampFormat: "HH:mm:ss:fff", showEcho: true, showLineNumbers: true,
  separateSystemLog: true, lineEnding: "\\r\\n", autoRepeat: false,
  repeatInterval: 1000, autoClear: false, receiveMode: "text",
  receiveCoding: "UTF-8", sendMode: "text", sendCoding: "UTF-8",
  quickSends: { "AT": "AT\\r\\n" },
};

// E5.8#6.6 hex 豁免：会话标签色板（颜色即数据——多会话轮换标签色）
// eslint-disable-next-line linkdesk/no-hardcoded-hex
export const SESSION_COLORS = ["#22C55E","#3B82F6","#F59E0B","#A855F7","#06B6D4","#EC4899"];

export function cloneDefaults(): typeof DEFAULT_SESSION { return { ...DEFAULT_SESSION, quickSends: { ...DEFAULT_SESSION.quickSends } }; }
