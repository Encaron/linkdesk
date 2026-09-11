/**
 * 会话 → 视图设置读取——E6#87b 从 src/index.tsx 的 SerialMonitorView 内联默认值搬出（只搬不改）。
 *
 * 默认值语义与原文逐字一致（null-safe 兜底）：会话尚未创建 / 字段缺失时回落到同一组常量。
 * 这些默认值只服务本视图的渲染与发送管道，不回写会话（写入入口仍是侧栏「收发设置」）。
 */

import type { SerialSession } from "../../hooks/useSerialSessions";

export interface SerialSettings {
  /** 会话口——发送定向本标签页的口；空串 → 走 D2 缺省唯一口语义 */
  port: string;
  /** 会话名——接收区自动保存的默认文件名 */
  name: string | undefined;
  timestampFormat: string;
  showEcho: boolean;
  showLineNumbers: boolean;
  separateSystemLog: boolean;
  lineEnding: string;
  autoRepeat: boolean;
  repeatInterval: number;
  autoClear: boolean;
  receiveMode: string;
  receiveCoding: string;
  sendMode: string;
  sendCoding: string;
  hexAsciiDualPane: boolean;
  escapeInvisibleChars: boolean;
  autoSaveReceive: boolean;
  quickSends: Record<string, string>;
  sendInitOnOpen: boolean;
}

export function readSettings(activeSession: SerialSession | null): SerialSettings {
  return {
    port: activeSession?.port ?? "",
    name: activeSession?.name,
    timestampFormat: activeSession?.timestampFormat ?? "HH:mm:ss:fff",
    showEcho: activeSession?.showEcho ?? true,
    showLineNumbers: activeSession?.showLineNumbers ?? true,
    separateSystemLog: activeSession?.separateSystemLog ?? true,
    lineEnding: activeSession?.lineEnding ?? "\\r\\n",
    autoRepeat: activeSession?.autoRepeat ?? false,
    repeatInterval: activeSession?.repeatInterval ?? 1000,
    autoClear: activeSession?.autoClear ?? false,
    receiveMode: activeSession?.receiveMode ?? "text",
    receiveCoding: activeSession?.receiveCoding ?? "UTF-8",
    sendMode: activeSession?.sendMode ?? "text",
    sendCoding: activeSession?.sendCoding ?? "UTF-8",
    hexAsciiDualPane: activeSession?.hexAsciiDualPane ?? false,
    escapeInvisibleChars: activeSession?.escapeInvisibleChars ?? false,
    autoSaveReceive: activeSession?.autoSaveReceive ?? true,
    quickSends: activeSession?.quickSends ?? { AT: "AT\r\n" },
    sendInitOnOpen: activeSession?.sendInitOnOpen ?? false,
  };
}
