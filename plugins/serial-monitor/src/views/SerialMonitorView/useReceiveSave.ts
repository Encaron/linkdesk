/**
 * 接收区自动落盘——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 *
 * E5.8#30.20：接收区内容落盘——<pluginDataDir>/receive-saves/<会话名>.txt（接收区原始文本）。
 * 触发点：端口关闭（useReceiveStream 的系统消息 handler）+ 应用退出（pagehide）。
 */

import { useRef, useEffect, useCallback } from "react";
import type { EditorView } from "@codemirror/view";
import { sanitizeFileName } from "../../utils/text";

export interface ReceiveSaveOptions {
  cmView: React.MutableRefObject<EditorView | null>;
  sessionName: string | undefined;
  autoSaveReceive: boolean;
}

export function useReceiveSave(o: ReceiveSaveOptions) {
  const { cmView, sessionName, autoSaveReceive } = o;

  // E5.8#30.20：自动保存开关 ref——serial-system handler / pagehide（React 闭包外路径）读取
  const autoSaveReceiveRef = useRef(autoSaveReceive);
  autoSaveReceiveRef.current = autoSaveReceive;

  /** E5.8#30.20：接收区内容落盘——<pluginDataDir>/receive-saves/<会话名>.txt（接收区原始文本）。
   *  writeTextFile 走主进程 fs.mkdir recursive 自动建父目录（零壳 API 面改动）；
   *  空接收区 / 关开关跳过（无 junk 文件）。 */
  const saveReceiveToFile = useCallback(async () => {
    if (!autoSaveReceiveRef.current) return;
    const view = cmView.current;
    if (!view) return;
    const text = view.state.doc.toString();
    if (!text.trim()) return;
    try {
      const env = await window.linkdesk?.env?.get?.("serial-monitor");
      const dir = env?.pluginDataDir;
      if (!dir) return;
      const name = sanitizeFileName(sessionName ?? "serial");
      await window.linkdesk?.filesystem?.writeTextFile?.(`${dir}/receive-saves/${name}.txt`, text);
    } catch (e) {
      console.error("[serial-monitor] 自动保存接收区失败:", e);
    }
  }, [sessionName, cmView]);

  // E5.8#30.20：应用退出 → 落盘一次（pagehide 浏览器事件，best available——壳无应用退出广播；端口关闭保存是主路径）。
  // 非键盘处理器，不涉「window 级 addEventListener = 全局劫持」反模式（该约束仅限键盘路由）。
  useEffect(() => {
    const onPageHide = () => { void saveReceiveToFile(); };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [saveReceiveToFile]);

  return { saveReceiveToFile };
}
