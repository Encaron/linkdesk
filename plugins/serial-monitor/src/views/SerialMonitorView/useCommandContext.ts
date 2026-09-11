/**
 * 命令上下文注册 + p2p 测试桥——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 *
 * E2b #11：命令路由用 sourceId → Map 分发。每个 SerialMonitorView 挂载时注册自己的 ActiveCmd，
 * 命令 handler 通过活跃 session ID 查找。消灭了"最后一个 mount 的 SerialMonitorView 接收所有命令"的问题。
 *
 * 🔴 模块级 mutable `_cmdMap` 的属主是 services/commandBridge.ts——本文件只读它 + 写自己的槽位。
 */

import { useRef, useEffect } from "react";
import type { EditorView } from "@codemirror/view";
import { _cmdMap } from "../../services/commandBridge";
import type { SerialSession } from "../../hooks/useSerialSessions";
import type { LineType } from "../../types";
import type { SerialSettings } from "./settings";

export interface CommandContextOptions {
  sourceId?: string;
  cmView: React.MutableRefObject<EditorView | null>;
  paused: boolean;
  settings: SerialSettings;
  setPaused: (v: boolean | ((p: boolean) => boolean)) => void;
  updateSendValue: (v: string) => void;
  updateSession: (patch: Partial<SerialSession>) => void;
  setQsEditing: (v: string | null) => void;
  setQsName: (v: string) => void;
  setQsContent: (v: string) => void;
  setQsAdding: (v: boolean) => void;
  handleDeleteQuickSend: (key: string) => void;
  appendLine: (text: string, color: LineType) => void;
}

export function useCommandContext(o: CommandContextOptions) {
  const { sourceId, cmView, paused, settings, setPaused, updateSendValue, updateSession } = o;
  const {
    setQsEditing, setQsName, setQsContent, setQsAdding, handleDeleteQuickSend, appendLine,
  } = o;
  const {
    quickSends, sendMode, showEcho, showLineNumbers, separateSystemLog, autoRepeat, autoClear,
  } = settings;

  // E2b #11：按 sourceId 注册到 _cmdMap——不依赖 isActive 竞态
  if (sourceId) {
    _cmdMap.set(sourceId, {
      cmView, paused, quickSends,
      sendMode, showEcho, showLineNumbers, separateSystemLog, autoRepeat, autoClear,
      setPaused, setSendValue: updateSendValue,
      setSendMode: (v: string) => { updateSession({ sendMode: v }); },
      setShowEcho: (v: boolean) => { updateSession({ showEcho: v }); },
      setShowLineNumbers: (v: boolean) => { updateSession({ showLineNumbers: v }); },
      setSeparateSystemLog: (v: boolean) => { updateSession({ separateSystemLog: v }); },
      setAutoRepeat: (v: boolean) => { updateSession({ autoRepeat: v }); },
      setAutoClear: (v: boolean) => { updateSession({ autoClear: v }); },
      setQsEditing, setQsName, setQsContent, setQsAdding,
      handleDeleteQuickSend,
    });
  }

  const appendLineRef = useRef(appendLine);
  appendLineRef.current = appendLine;

  // E5#64：handler 注册——不依赖 sourceId（portOpenRef 已随 #29 删除，闭包经 useIpcEvent 的 callbackRef 拿最新 activeSession）
  useEffect(() => {
    // E5#64 → E5.7#98：invokeBeforeClose 否决回路随 E5.7#43 停用（requestToPlugin 链已删，
    // preload-pool 不再暴露 pluginRequest）——原 api.handle 注册是死 no-op，摘除。
    // 恢复时走未来池侧 requests 命名空间任务（viewRegistry.ts:79 同注）。
    // E5#74e test: p2p 组件级测试——收到就写 CM6
    const p2p = window.linkdesk?.p2p;
    if (p2p) {
      p2p.on("test-p2p", (d) => {
        // E5.7#99：appendLineRef 桥——appendLine 入 deps 会重复注册 p2p.on（API 无 unsubscribe）
        appendLineRef.current(`[P2P-TEST] ${JSON.stringify(d)}`, "system");
      });
    }
  }, []);

  // E2b #11：卸载时从 _cmdMap 清理——防止 sourceId 复用时的残留
  useEffect(() => {
    return () => {
      if (sourceId) _cmdMap.delete(sourceId);
    };
  }, [sourceId]);
}
