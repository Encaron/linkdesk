/**
 * 发送区 CM6 挂载——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 *
 * 🔴 CM6 生命周期：本 hook 是发送区 EditorView 的**唯一持有者**——创建/销毁在本文件的 mount
 *    effect 里，与组件生命周期一致；绝不上提到门面再往下传（off-by-one 帧 + StrictMode 双挂 = 双实例）。
 */

import { useEffect } from "react";
import { EditorView, keymap } from "@codemirror/view";
import type { EditorView as EditorViewType } from "@codemirror/view";
import { sendTheme } from "../../cm6/theme";
import { SEND_EDITOR_MAX_HEIGHT, SEND_EDITOR_MIN_HEIGHT, SEND_MODE_HEX } from "../../constants";
import type { LineType } from "../../types";

export interface SendEditorCmOptions {
  sendEditorContainer: React.MutableRefObject<HTMLDivElement | null>;
  sendEditorRef: React.MutableRefObject<EditorViewType | null>;
  /** 初始文档——mount 时取一次（原文 effect 空依赖，同样只读首帧值） */
  initialDoc: string;
  sendModeRef: React.MutableRefObject<string>;
  autoFormatHexRef: React.MutableRefObject<(raw: string) => { formatted: string; warning: string }>;
  appendLineRef: React.MutableRefObject<(text: string, color: LineType) => void>;
  prevHexWarningRef: React.MutableRefObject<string>;
  hexFormattingRef: React.MutableRefObject<boolean>;
  handleSendRef: React.MutableRefObject<() => void>;
  setSendValue: (v: string) => void;
  setHexWarning: (v: string) => void;
  setShowHistory: (v: boolean) => void;
}

export function useSendEditorCm(o: SendEditorCmOptions): void {
  const {
    sendEditorContainer, sendEditorRef, initialDoc, sendModeRef, autoFormatHexRef,
    appendLineRef, prevHexWarningRef, hexFormattingRef, handleSendRef,
    setSendValue, setHexWarning, setShowHistory,
  } = o;

  useEffect(() => {
    if (!sendEditorContainer.current) return;

    const sendKeymap = keymap.of([
      {
        key: "Enter",
        preventDefault: true,
        run: () => {
          // preventDefault 阻止插入换行 → handleSend 从 editor doc 读取文本发送
          handleSendRef.current();
          return true;
        },
      },
      {
        key: "ArrowUp",
        run: (view) => {
          const line = view.state.doc.line(1);
          if (!line.text.trim()) {
            setShowHistory(true);
            return true;
          }
          return false;
        },
      },
    ]);

    const sendUpdateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      if (hexFormattingRef.current) return; // 格式化事务→跳过

      const newValue = update.state.doc.toString();

      if (sendModeRef.current === SEND_MODE_HEX) {
        const { formatted, warning } = autoFormatHexRef.current(newValue);
        if (warning && warning !== prevHexWarningRef.current) {
          appendLineRef.current(warning, "system");
        }
        prevHexWarningRef.current = warning;
        setHexWarning(warning);

        if (formatted !== newValue) {
          hexFormattingRef.current = true;
          update.view.dispatch({
            changes: { from: 0, to: update.state.doc.length, insert: formatted },
          });
          hexFormattingRef.current = false;
          return;
        }
      } else {
        setHexWarning("");
        prevHexWarningRef.current = "";
      }
      setSendValue(newValue);
    });

    // 发送区专用主题（sendTheme）——与 darkTheme 对齐，不含 { dark: true } 避免内置暗色主题注入冲突。
    const view = new EditorView({
      doc: initialDoc,
      extensions: [
        sendTheme,
        sendKeymap,
        sendUpdateListener,
        EditorView.updateListener.of((update) => {
          // 自动调节高度
          if (update.docChanged || update.viewportChanged) {
            const ch = update.view.contentHeight;
            const h = Math.min(SEND_EDITOR_MAX_HEIGHT, Math.max(SEND_EDITOR_MIN_HEIGHT, ch));
            if (sendEditorContainer.current) {
              sendEditorContainer.current.style.height = `${h}px`;
            }
          }
        }),
      ],
      parent: sendEditorContainer.current,
    });

    sendEditorRef.current = view;

    // 自动调节初始高度
    requestAnimationFrame(() => {
      view.requestMeasure();
    });

    return () => {
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
