/**
 * 串口监视器主视图——E6#87b 从 src/index.tsx（1642 行）搬出，入口瘦成薄门面。
 * Phase 4 Step B3+B5：从 src/components/views/TerminalView.tsx 迁移 + 串口工具栏。
 *
 * 设计依据：[V3-Phase4-串口监视器插件化设计.md]
 *
 * 结构契约（E6#87b）：本文件只做**布局**，接线在同名夹的 useSerialMonitorView——
 *   useReceiveEditor（接收区 CM6，唯一持有 EditorView）/ useSendEditor（发送栏）/
 *   useReceiveStream（RingBuffer + IPC + rAF）/ useSearch / useQuickSends /
 *   useCommandContext + useViewCommands + useToggleCommands（命令注册）/
 *   Toolbar / ReceiveArea / QuickSendBar / SenderArea（布局块）。
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { EditorView } from "@codemirror/view";
import ControlPanel from "../components/ControlPanel";
import SearchBar from "../components/SearchBar";
import { useSerialMonitorView } from "./SerialMonitorView/useSerialMonitorView";
import Toolbar from "./SerialMonitorView/Toolbar";
import ReceiveArea from "./SerialMonitorView/ReceiveArea";
import QuickSendBar from "./SerialMonitorView/QuickSendBar";
import SenderArea from "./SerialMonitorView/SenderArea";

export interface SerialMonitorViewProps {
  isActive: boolean;
  sourceId?: string;
}

export default function SerialMonitorView({ isActive, sourceId: propSourceId }: SerialMonitorViewProps) {
  const { t } = useTranslation();

  // E5#84 → E5.7#98：sourceId 单通道——pool 经 props 传入（PluginComponent sourceId）。
  // 原 IPC 优先通道（pluginRequest.handle("openSession")）随 E5.7#43 整删（preload-pool
  // 不再暴露 pluginRequest），死 no-op 代码摘除。
  const sourceId = propSourceId;

  const { activeSession, settings, stats, receive, send, stream, search, qs } =
    useSerialMonitorView(sourceId, isActive);

  const handleBackToBottom = () => {
    const view = receive.cmView.current;
    if (view) view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.length) });
    receive.setShowBackToBottom(false);
  };

  // Phase 3 keep-alive: 从 display:none 变为 flex 后修复 CM6 布局
  useEffect(() => {
    if (!isActive) return;
    const raf = requestAnimationFrame(() => {
      receive.cmView.current?.requestMeasure();
      send.sendEditorRef.current?.requestMeasure();
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive, receive.cmView, send.sendEditorRef]);

  // C4b Bug 7：无活跃会话时，串口监视器内容 CSS 隐藏 + 占位 overlay。
  // 注意：不能 return 早期退出——CM6 的 useEffect 在 mount 时运行，如果 cmContainer
  // div 不在 DOM 中，cmView.current 永远是 null，之后创建会话也无法初始化。
  return (
    <div className="serial-monitor-view">
      <ControlPanel sourceId={sourceId} />

      {!activeSession && (
        <div className="serial-monitor-placeholder">
          <span className="codicon codicon-info serial-monitor-placeholder-icon" />
          <p className="serial-monitor-placeholder-title">{t("会话已失效")}</p>
          <p className="serial-monitor-placeholder-hint">{t("请在侧栏选择一个串口监视器会话，或新建一个以开始使用")}</p>
        </div>
      )}

      <div className={`serial-monitor-body${activeSession ? "" : " hidden"}`}>
        <Toolbar
          paused={stream.paused}
          onPause={stream.handlePause}
          onExport={receive.handleExport}
          onClear={receive.handleClear}
          filterMode={stream.filterMode}
          onFilterModeChange={stream.setFilterMode}
          filterKeyword={stream.filterKeyword}
          onFilterKeywordChange={stream.setFilterKeyword}
          searchVisible={search.searchVisible}
          onToggleSearch={() => (search.searchVisible ? search.closeSearch() : search.openSearch())}
          portIsOpen={stats.isOpen}
          txBytes={stats.txBytes}
          rxBytes={stats.rxBytes}
        />

        <SearchBar
          visible={search.searchVisible}
          text={search.searchText}
          caseSensitive={search.searchCase}
          matchCount={search.searchCount}
          matchIndex={search.searchIdx}
          onTextChange={(v) => { search.setSearchText(v); search.runSearch(v, search.searchCase); }}
          onCaseToggle={(cs) => { search.setSearchCase(cs); search.runSearch(search.searchText, cs); }}
          onNavigate={search.navigateSearch}
          onClose={search.closeSearch}
          onOpen={search.openSearch}
        />

        <ReceiveArea
          separateSystemLog={settings.separateSystemLog}
          systemLog={receive.systemLog}
          hexAsciiDualPane={settings.hexAsciiDualPane}
          cmContainer={receive.cmContainer}
          hexContainer={receive.hexContainer}
          paused={stream.paused}
          pausedCount={stream.pausedCount}
          showBackToBottom={receive.showBackToBottom}
          onBackToBottom={handleBackToBottom}
          ctxMenu={receive.ctxMenu}
          onCloseCtxMenu={() => receive.setCtxMenu(null)}
        />

        <QuickSendBar
          quickSends={settings.quickSends}
          onQuickSend={send.handleQuickSend}
          onCtxMenu={qs.handleQuickSendCtxMenu}
          qsAdding={qs.qsAdding}
          setQsAdding={qs.setQsAdding}
          qsEditing={qs.qsEditing}
          setQsEditing={qs.setQsEditing}
          qsName={qs.qsName}
          setQsName={qs.setQsName}
          qsContent={qs.qsContent}
          setQsContent={qs.setQsContent}
          onSave={qs.handleSaveQuickSend}
          qsCtxMenu={qs.qsCtxMenu}
          onCloseQsCtxMenu={() => qs.setQsCtxMenu(null)}
        />

        <SenderArea
          hexWarning={send.hexWarning}
          sendEditorContainer={send.sendEditorContainer}
          showHistory={send.showHistory}
          setShowHistory={send.setShowHistory}
          sendHistory={send.sendHistory}
          onHistorySelect={send.handleHistorySelect}
          onClearSend={() => send.updateSendValue("")}
          onSend={send.handleSend}
        />
      </div>
    </div>
  );
}
