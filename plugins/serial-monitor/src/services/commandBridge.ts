/**
 * 命令桥——E2b #11：命令路由用 sourceId → Map 分发（E6#87b 从 src/index.tsx 搬出，只搬不改）。
 *
 * 每个 SerialMonitorView 挂载时注册自己的 ActiveCmd，命令 handler 通过活跃 session ID 查找。
 * 消灭了"最后一个 mount 的 SerialMonitorView 接收所有命令"的问题。
 *
 * 🔴 模块级 mutable 单一属主：`_cmdMap` 只在本文件声明，外部一律走 getActiveCmd() 读。
 */

import type { EditorView } from "@codemirror/view";
import { getActiveSessionId } from "../hooks/useSerialSessions";

export interface ActiveCmd {
  cmView: { current: EditorView | null };
  paused: boolean; quickSends: Record<string, string>;
  sendMode: string; showEcho: boolean; showLineNumbers: boolean; separateSystemLog: boolean; autoRepeat: boolean; autoClear: boolean;
  setPaused: (v: boolean | ((p: boolean) => boolean)) => void;
  setSendValue: (v: string) => void;
  setSendMode: (v: string) => void;
  setShowEcho: (v: boolean) => void;
  setShowLineNumbers: (v: boolean) => void;
  setSeparateSystemLog: (v: boolean) => void;
  setAutoRepeat: (v: boolean) => void;
  setAutoClear: (v: boolean) => void;
  setQsEditing: (v: string | null) => void; setQsName: (v: string) => void;
  setQsContent: (v: string) => void; setQsAdding: (v: boolean) => void;
  handleDeleteQuickSend: (key: string) => void;
}

export const _cmdMap = new Map<string, ActiveCmd>();

/** 按活跃会话 ID 取命令上下文——命令 handler（非 React 上下文）的唯一读入口 */
export function getActiveCmd(): ActiveCmd | null {
  const id = getActiveSessionId();
  return id ? (_cmdMap.get(id) ?? null) : null;
}
