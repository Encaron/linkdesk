/**
 * 主视图接线——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 *
 * 把各域 hook 按既定顺序串起来，交给 views/SerialMonitorView.tsx 只做布局。
 * 🔴 顺序有意义：接收区 CM6 先于「设置变更日志」（后者读 cmView）；发送管道先于接收流
 *    （打开即发初始化序列要用 performSend）；命令上下文晚于所有状态（它把状态快照进 _cmdMap）。
 */

import { useEffect, useRef } from "react";
import { useSession, setActiveSessionId } from "../../hooks/useSerialSessions";
import { usePortStats } from "../../services/SerialContext";
import { RingBuffer } from "../../utils/RingBuffer";
import { RING_BUFFER_CAPACITY } from "../../constants";
import type { ReceiveItem } from "../../types";
import { readSettings } from "./settings";
import { useReceiveEditor } from "./useReceiveEditor";
import { useReceiveStream } from "./useReceiveStream";
import { useSendEditor } from "./useSendEditor";
import { useSearch } from "./useSearch";
import { useQuickSends } from "./useQuickSends";
import { useSettingsLog } from "./useSettingsLog";
import { useCommandContext } from "./useCommandContext";
import { useViewCommands } from "./useViewCommands";
import { useToggleCommands } from "./useToggleCommands";

export function useSerialMonitorView(sourceId: string | undefined, isActive: boolean) {
  // C1 修复：用 sourceId 绑定 per-tab session，而非读全局 activeSession。
  // sourceId = tab.id = session.id（MainContent 传入）。
  // session/update 响应式——底层 _sessions 变更 → listener 通知 → tick 重渲染。
  const { session: activeSession, update: updateSession } = useSession(sourceId);

  // 标签页获得焦点 → 侧栏活跃会话跟随切换
  // 对标 sidebar.tsx handleSelectSession 的反向链路：sidebar 点会话 → focusTab，
  // 这里是 tab 激活 → setActiveSessionId。两条链路对称。
  useEffect(() => {
    if (isActive && sourceId) {
      setActiveSessionId(sourceId);
    }
  }, [isActive, sourceId]);

  // 12 项收发设置——从活跃会话读取，null-safe 默认值（readSettings）
  const settings = readSettings(activeSession);
  // E5.8#30.12（P6）：per-tab TX/RX——接收区工具栏计数（本会话口，非活动口也实时）
  const stats = usePortStats(activeSession?.port ?? null);

  // ⚠️ 独立 RingBuffer 多消费者（E5.8#30.19a：ReceiveItem 携带 hex 形态，双栏消费）
  // 由本 hook 持有、按引用下传——接收流（消费）与接收区（合屏快照）共用同一实例。
  const ringBuffer = useRef(new RingBuffer<ReceiveItem>(RING_BUFFER_CAPACITY));

  const receive = useReceiveEditor({
    sourceId,
    sessionName: settings.name,
    autoSaveReceive: settings.autoSaveReceive,
    showEcho: settings.showEcho,
    showLineNumbers: settings.showLineNumbers,
    separateSystemLog: settings.separateSystemLog,
    flags: {
      receiveMode: settings.receiveMode,
      escapeInvisibleChars: settings.escapeInvisibleChars,
      hexAsciiDualPane: settings.hexAsciiDualPane,
    },
    ringBuffer,
  });

  useSettingsLog({ cmView: receive.cmView, appendLine: receive.appendLine, settings });

  const send = useSendEditor({ settings, appendLine: receive.appendLine });

  const stream = useReceiveStream({
    sourceId,
    settings,
    renderLine: receive.renderLine,
    appendLine: receive.appendLine,
    ringBuffer,
    performSend: send.performSend,
    saveReceiveToFile: receive.saveReceiveToFile,
  });

  const search = useSearch({ cmView: receive.cmView });

  const qs = useQuickSends({ quickSends: settings.quickSends, updateSession, appendLine: receive.appendLine });

  useCommandContext({
    sourceId,
    cmView: receive.cmView,
    paused: stream.paused,
    settings,
    setPaused: stream.setPaused,
    updateSendValue: send.updateSendValue,
    updateSession,
    setQsEditing: qs.setQsEditing,
    setQsName: qs.setQsName,
    setQsContent: qs.setQsContent,
    setQsAdding: qs.setQsAdding,
    handleDeleteQuickSend: qs.handleDeleteQuickSend,
    appendLine: receive.appendLine,
  });
  useViewCommands();
  useToggleCommands({ settings, paused: stream.paused });

  return { activeSession, settings, stats, receive, send, stream, search, qs };
}
