/**
 * 发送栏——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 *
 * 覆盖：发送管道接线（useSendData）+ 发送历史 + HEX 自动格式化 + 清空/外部回填 +
 *      定时发送 + 发送区 CM6（挂载交给 useSendEditorCm，CM6 持有者仍是本 hook 的 useRef）。
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { EditorView } from "@codemirror/view";
import { useSendData, type SendContext, type SendCallbacks } from "../../utils/useSendData";
import { SEND_HISTORY_MAX } from "../../constants";
import { useSendEditorCm } from "./useSendEditorCm";
import { makeAutoFormatHex } from "./autoFormatHex";
import type { SerialSettings } from "./settings";
import type { LineType } from "../../types";

export interface SendEditorOptions {
  settings: SerialSettings;
  appendLine: (text: string, color: LineType) => void;
}

export function useSendEditor({ settings, appendLine }: SendEditorOptions) {
  const { t } = useTranslation();
  const { sendMode, sendCoding, lineEnding, timestampFormat, port, autoClear, autoRepeat, repeatInterval } = settings;

  const [sendValue, setSendValue] = useState("");
  const [sendHistory, setSendHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [hexWarning, setHexWarning] = useState("");
  const sendEditorRef = useRef<EditorView | null>(null);
  const sendEditorContainer = useRef<HTMLDivElement>(null);

  const sendCtxRef = useRef<SendContext>({
    sendMode: sendMode,
    sendCoding: sendCoding,
    lineEnding: lineEnding,
    timestampFormat: timestampFormat,
    port: port,
  });
  // 保持 ctx ref 同步
  sendCtxRef.current = {
    sendMode: sendMode,
    sendCoding: sendCoding,
    lineEnding: lineEnding,
    timestampFormat: timestampFormat,
    // E5.8#29：会话口——发送定向本标签页的口（多口下各会话各发各的）
    port: port,
  };

  const recordHistory = useCallback((text: string) => {
    setSendHistory((prev) => {
      const filtered = prev.filter((h) => h !== text);
      return [text, ...filtered].slice(0, SEND_HISTORY_MAX);
    });
  }, []);

  const sendCallbacksRef = useRef<SendCallbacks>({
    onEcho: (text: string) => appendLine(text, "sent"),
    onHistory: recordHistory,
    onError: (msg: string) => appendLine(msg, "system"),
  });
  sendCallbacksRef.current = {
    onEcho: (text: string) => appendLine(text, "sent"),
    onHistory: recordHistory,
    onError: (msg: string) => appendLine(msg, "system"),
  };

  const { performSend } = useSendData(sendCtxRef, sendCallbacksRef);

  /* ---- HEX 自动格式化 ---- */
  const autoFormatHex = useMemo(() => makeAutoFormatHex(t), [t]);

  /* ---- 发送区 CM6 ref 桥接——避免 updateListener 闭包过期 ---- */
  const sendModeRef = useRef(sendMode);
  sendModeRef.current = sendMode;
  const appendLineRef = useRef(appendLine);
  appendLineRef.current = appendLine;
  const autoFormatHexRef = useRef(autoFormatHex);
  autoFormatHexRef.current = autoFormatHex;
  const prevHexWarningRef = useRef("");
  const hexFormattingRef = useRef(false);

  // G7 改进：从 CM6 editor 直接读取，避免 state 延迟导致读到旧值
  const handleSend = useCallback(async () => {
    const text = (sendEditorRef.current?.state.doc.toString() ?? "").trim();
    if (!text) return;
    await performSend(text, { showHexPreview: true });
    if (autoClear) {
      sendEditorRef.current?.dispatch({
        changes: { from: 0, to: sendEditorRef.current.state.doc.length, insert: "" },
      });
    }
  }, [performSend, autoClear]);

  /** 外部更新发送区文本（清空按钮、历史选择、命令系统）——同步 state + CM6 */
  const updateSendValue = useCallback((text: string) => {
    setSendValue(text);
    const editor = sendEditorRef.current;
    if (editor) {
      const cur = editor.state.doc.toString();
      if (cur !== text) {
        hexFormattingRef.current = true; // 跳过 updateListener 重复处理
        editor.dispatch({ changes: { from: 0, to: cur.length, insert: text } });
        hexFormattingRef.current = false;
      }
    }
  }, []);

  const handleQuickSend = async (text: string) => {
    await performSend(text, { ending: "\r\n", prefix: "> " });
  };

  const handleHistorySelect = (text: string) => {
    updateSendValue(text);
    setShowHistory(false);
    sendEditorRef.current?.focus();
  };

  /* ---- 定时发送 ---- */
  const sendValueRef = useRef(sendValue);
  sendValueRef.current = sendValue;

  useEffect(() => {
    if (!autoRepeat || repeatInterval <= 0) return;
    const timer = setInterval(async () => {
      const text = sendValueRef.current.trim();
      if (!text) return;
      await performSend(text, { silent: true, noHistory: true });
    }, repeatInterval);
    return () => clearInterval(timer);
  }, [autoRepeat, repeatInterval, performSend]);

  /* ---- 发送区 CM6 ---- */
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  useSendEditorCm({
    sendEditorContainer, sendEditorRef, initialDoc: sendValue,
    sendModeRef, autoFormatHexRef, appendLineRef, prevHexWarningRef, hexFormattingRef,
    handleSendRef, setSendValue, setHexWarning, setShowHistory,
  });

  return {
    sendValue, sendEditorRef, sendEditorContainer,
    hexWarning, sendHistory, showHistory, setShowHistory,
    handleSend, updateSendValue, handleQuickSend, handleHistorySelect, performSend,
  };
}
