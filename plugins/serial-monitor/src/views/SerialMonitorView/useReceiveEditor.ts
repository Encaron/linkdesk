/**
 * 接收区——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。本文件是**接线**：
 * 持有 ref / state，按序串起 mount（CM6 生命周期）/ lines（写行）/ snapshots（合屏快照）/
 * save（自动落盘）/ export（导出），对门面只暴露一个接收区句柄。
 *
 * 🔴 CM6 生命周期：两个 EditorView 的创建/销毁在 useReceiveEditorMount 内，本 hook 只持有 ref——
 *    全链路只有一个组件（SerialMonitorView）走这条 hook 链，实例与组件生命周期一致。
 *    EditorView 绝不上提到门面再往下传，Compartment 句柄也不外传。
 * 🔴 快照顺序：useReceiveEditorMount → useReceiveSnapshots（后者 cleanup 必须早于前者跑）。
 */

import { useRef, useState, useCallback } from "react";
import type { EditorView } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import { clearAllDecos } from "../../cm6/decorations";
import type { RingBuffer } from "../../utils/RingBuffer";
import type { ReceiveItem } from "../../types";
import { useReceiveEditorMount } from "./useReceiveEditorMount";
import { useReceiveLines } from "./useReceiveLines";
import { useReceiveSnapshots } from "./useReceiveSnapshots";
import { useReceiveSave } from "./useReceiveSave";
import { useReceiveExport } from "./useReceiveExport";

/** 渲染时读的开关——ref 桥接（渲染时写、事件/消费时读，对标 tsFormatRef 已验证模式） */
export interface ReceiveRenderFlags {
  receiveMode: string;
  escapeInvisibleChars: boolean;
  hexAsciiDualPane: boolean;
}

export interface ReceiveEditorOptions {
  sourceId?: string;
  sessionName: string | undefined;
  autoSaveReceive: boolean;
  showEcho: boolean;
  showLineNumbers: boolean;
  separateSystemLog: boolean;
  flags: ReceiveRenderFlags;
  ringBuffer: React.MutableRefObject<RingBuffer<ReceiveItem>>;
}

export function useReceiveEditor(opts: ReceiveEditorOptions) {
  const { sourceId, sessionName, autoSaveReceive, showEcho, showLineNumbers, separateSystemLog, flags, ringBuffer } = opts;

  const [systemLog, setSystemLog] = useState<string[]>([]);
  const [showBackToBottom, setShowBackToBottom] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  /* ---- CM6 ---- */
  const cmContainer = useRef<HTMLDivElement>(null);
  const cmView = useRef<EditorView | null>(null);
  const lineNumberCompartment = useRef(new Compartment());
  // E5.8#30.19a：HEX 栏 CM6——第二个 EditorView 常驻挂载（keep-alive，CSS 显隐），随主栏同步追加
  const hexContainer = useRef<HTMLDivElement>(null);
  const hexView = useRef<EditorView | null>(null);
  const hexLineNumberCompartment = useRef(new Compartment());

  // E4：per-instance ref——IPC event handler 读取当前实例的接收模式。
  const receiveModeRef = useRef(flags.receiveMode);
  receiveModeRef.current = flags.receiveMode;
  // E5.8#30.19a：双栏开关 ref——rAF 消费循环读取
  const dualPaneRef = useRef(flags.hexAsciiDualPane);
  dualPaneRef.current = flags.hexAsciiDualPane;
  // E5.8#30.19b：转义开关 ref——renderLine 渲染时读（渲染时转义，原始数据不动）
  const escapeRef = useRef(flags.escapeInvisibleChars);
  escapeRef.current = flags.escapeInvisibleChars;

  useReceiveEditorMount({
    sourceId, showLineNumbers, cmContainer, hexContainer, cmView, hexView,
    lineNumberCompartment, hexLineNumberCompartment, setCtxMenu, setShowBackToBottom,
  });

  const { appendToView, appendLine, renderLine } = useReceiveLines({
    cmView, hexView, showEcho, separateSystemLog, setSystemLog, receiveModeRef, escapeRef, dualPaneRef,
  });

  useReceiveSnapshots({ sourceId, cmView, hexView, dualPaneRef, ringBuffer, appendLine, appendToView });

  const { saveReceiveToFile } = useReceiveSave({ cmView, sessionName, autoSaveReceive });
  const { handleExport } = useReceiveExport({ cmView, appendLine });

  const handleClear = useCallback(() => {
    // E5.8#30.19a：主栏 + HEX 栏同步清空（双栏保持逐行对齐，任一边残留都会错位）
    for (const view of [cmView.current, hexView.current]) {
      if (!view) continue;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length },
        effects: clearAllDecos.of(undefined),
      });
    }
  }, [cmView, hexView]);

  /** Phase 3 keep-alive：从 display:none 变 flex 后修复 CM6 布局 */
  const requestMeasure = useCallback(() => {
    cmView.current?.requestMeasure();
  }, [cmView]);

  return {
    cmContainer, hexContainer, cmView, hexView,
    systemLog, showBackToBottom, setShowBackToBottom, ctxMenu, setCtxMenu,
    appendLine, renderLine, saveReceiveToFile, handleClear, handleExport, requestMeasure,
  };
}
