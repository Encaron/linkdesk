/**
 * 接收区写行——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 *
 * 主栏 / HEX 栏的追加路由：sent 受回显开关管、system 受独立日志开关管、
 * received 按 receiveMode 选形态 + 双栏镜像。CM6 实例由 ref 传入（持有者在 useReceiveEditorMount）。
 */

import { useCallback } from "react";
import type { EditorView } from "@codemirror/view";
import { appendLineToView } from "../../cm6/appendLine";
import { escapeInvisible } from "../../utils/text";
import { SEND_MODE_HEX, SYSTEM_LOG_MAX_LINES } from "../../constants";
import type { LineType, ReceiveItem } from "../../types";

export interface ReceiveLinesOptions {
  cmView: React.MutableRefObject<EditorView | null>;
  hexView: React.MutableRefObject<EditorView | null>;
  showEcho: boolean;
  separateSystemLog: boolean;
  setSystemLog: React.Dispatch<React.SetStateAction<string[]>>;
  receiveModeRef: React.MutableRefObject<string>;
  escapeRef: React.MutableRefObject<boolean>;
  dualPaneRef: React.MutableRefObject<boolean>;
}

export function useReceiveLines(o: ReceiveLinesOptions) {
  const { cmView, hexView, showEcho, separateSystemLog, setSystemLog, receiveModeRef, escapeRef, dualPaneRef } = o;

  /* ---- 追加一行（带颜色）——核心 CM6 写入，主栏 / HEX 栏共用（E5.8#30.19a 抽取） ---- */
  const appendToView = useCallback((view: EditorView | null, text: string, color: LineType) => {
    appendLineToView(view, text, color);
  }, []);

  /* ---- 主栏追加（带颜色）——路由：sent 回显开关 / system 独立日志 ---- */
  const appendLine = useCallback((text: string, color: LineType) => {
    if (color === "sent" && !showEcho) return;

    if (color === "system" && separateSystemLog) {
      setSystemLog((prev) => {
        const next = [...prev, text];
        if (next.length > SYSTEM_LOG_MAX_LINES) next.shift();
        return next;
      });
      return;
    }

    appendToView(cmView.current, text, color);
  }, [showEcho, separateSystemLog, appendToView, cmView, setSystemLog]);

  /* ---- HEX 栏追加——路由与主栏一致：received 用 hex 形态，sent/system 镜像原文本（双栏逐行对齐） ---- */
  const appendHexLine = useCallback((item: ReceiveItem) => {
    if (item.type === "sent" && !showEcho) return;
    if (item.type === "system" && separateSystemLog) return; // system 行已进 React 独立日志，HEX 栏不镜像
    appendToView(hexView.current, item.hex ?? item.text, item.type);
  }, [showEcho, separateSystemLog, appendToView, hexView]);

  /* ---- 渲染一行（单栏/双栏合一）——received 按 receiveMode 选形态；双栏时同步 HEX 栏 ---- */
  /* E5.8#30.19b：转义只在渲染时应用（received 文本形态）——原始数据不动，导出/过滤/快照不受影响 */
  const renderLine = useCallback((item: ReceiveItem) => {
    if (item.type === "received" && receiveModeRef.current === SEND_MODE_HEX && item.hex != null) {
      appendLine(item.hex, item.type);
    } else {
      const text = item.type === "received" && escapeRef.current ? escapeInvisible(item.text) : item.text;
      appendLine(text, item.type);
    }
    if (dualPaneRef.current) appendHexLine(item);
  }, [appendLine, appendHexLine, receiveModeRef, escapeRef, dualPaneRef]);

  return { appendToView, appendLine, appendHexLine, renderLine };
}
