/**
 * MainContent — 主内容区。
 * Phase 3 v4：每面板独立标签栏（TabBar + content pool）。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §4]
 */

import { useCallback } from "react";
import type { TabState, TabGroup } from "../hooks/useTabManager";
import { getAllLeafGroupIds } from "../hooks/splitTree";
import SplitPane from "./SplitPane";
import TabBar from "./TabBar";
import TerminalView from "./views/TerminalView";
import ErrorBoundary from "./shared/ErrorBoundary";
import WorkspaceView from "./views/WorkspaceView";
import SettingsView from "./views/SettingsView";
import "./MainContent.css";

interface MainContentProps {
  tabState: TabState;
  activeGroupId: string;
  onFocusTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (type: any, opts?: any) => any;
  onSplitTab: (tabId: string, direction?: any) => any;
  onMoveTab: (tabId: string, targetGroupId: string) => void;
  onReorderTab: (tabId: string, toIndex: number) => void;
  onDropSplit: (tabId: string, zone: any) => void;
  onSplitResize?: (anchorGroupId: string, sizes: [number, number]) => void;
  dropZone?: any;
  editorAreaRef?: any;
  dragDropZone?: any;
  onDragDropZone?: (zone: any) => void;
  isDragging?: boolean;
  onDraggingChange?: (v: boolean) => void;
}

/** 根据标签页类型渲染对应 View 组件 */
export function renderTabContent(
  tab: { id: string; type: string; workspaceName?: string; filePath?: string },
  isActive: boolean
) {
  switch (tab.type) {
    case "terminal":
      return (
        <ErrorBoundary>
          <TerminalView key={tab.id} isActive={isActive} />
        </ErrorBoundary>
      );
    case "workspace":
      return <WorkspaceView key={tab.id} isActive={isActive} workspaceName={tab.workspaceName} />;
    case "settings":
      return <SettingsView key={tab.id} isActive={isActive} />;
    case "oled":
      return <div key={tab.id}>OLED 视图（Phase 5 实现）</div>;
    case "editor":
      return <div key={tab.id}>{tab.filePath}（JSON 编辑器 Phase 6 实现）</div>;
    default:
      return null;
  }
}

function MainContent({
  tabState,
  activeGroupId,
  onFocusTab,
  onCloseTab,
  onCreateTab,
  onSplitTab,
  onMoveTab,
  onReorderTab,
  onDropSplit,
  onSplitResize,
  dropZone,
  editorAreaRef,
  dragDropZone,
  onDragDropZone,
  isDragging,
  onDraggingChange,
}: MainContentProps) {

  const handleAllotmentChange = useCallback(
    (sizes: number[], anchorGroupId: string) => {
      if (sizes.length === 2) onSplitResize?.(anchorGroupId, sizes as [number, number]);
    },
    [onSplitResize]
  );

  // Drop zone 高亮覆盖层
  const dropOverlay = dropZone && dropZone !== "center" && (
    <div className={`drop-zone-overlay drop-zone-${dropZone}`} />
  );

  /** 渲染一个面板组——标签栏 + 内容区 */
  const renderGroup = (group: TabGroup) => (
    <div className="tab-group-pane" key={group.id} data-group-id={group.id} style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, minHeight: 0 }}>
      <TabBar
        group={group}
        isActiveGroup={group.id === activeGroupId}
        onFocusTab={onFocusTab}
        onCloseTab={onCloseTab}
        onCreateTab={onCreateTab}
        onSplitTab={onSplitTab}
        onMoveTab={(tabId) => {
          // move to any other group in the tree
          const allLeafIds = getAllLeafGroupIds(tabState.root);
          const otherGroupId = allLeafIds.find((id) => id !== group.id);
          if (otherGroupId) onMoveTab(tabId, otherGroupId);
        }}
        onReorderTab={onReorderTab}
        onDropSplit={onDropSplit}
        editorAreaRef={editorAreaRef}
        dragDropZone={dragDropZone}
        onDragDropZone={onDragDropZone}
        isDragging={isDragging}
        onDraggingChange={onDraggingChange}
      />
      <div className="tab-content-pool" style={{ flex: 1, position: "relative" }}>
        {group.tabs.map((tab) => (
          <div
            key={tab.id}
            className="tab-content-pane"
            style={{
              display: tab.id === group.activeTabId ? "flex" : "none",
            }}
          >
            {renderTabContent(tab, tab.id === group.activeTabId && group.id === activeGroupId)}
          </div>
        ))}
      </div>
    </div>
  );

  // ── 分屏模式（2-pane）──
  if (tabState.root.type === "branch") {
    const [child0, child1] = tabState.root.children;
    const g1Id = child0.type === "leaf" ? child0.groupId : getAllLeafGroupIds(child0)[0];
    const g2Id = child1.type === "leaf" ? child1.groupId : getAllLeafGroupIds(child1)[0];
    const g1 = tabState.groups.find((g) => g.id === g1Id);
    const g2 = tabState.groups.find((g) => g.id === g2Id);
    if (!g1 || !g2) return null;

    return (
      <div className="main-content">
        {dropOverlay}
        <SplitPane
          direction={tabState.root.direction}
          sizes={tabState.root.sizes}
          onResize={(sizes) => handleAllotmentChange(sizes, g1Id)}
        >
          {renderGroup(g1)}
          {renderGroup(g2)}
        </SplitPane>
      </div>
    );
  }

  // ── 单面板模式 ──
  const mainGroupId = tabState.root.type === "leaf" ? tabState.root.groupId : null;
  const mainGroup = mainGroupId ? tabState.groups.find((g) => g.id === mainGroupId) : tabState.groups[0];
  if (!mainGroup) return null;

  return (
    <div className="main-content">
      {dropOverlay}
      {renderGroup(mainGroup)}
    </div>
  );
}

export default MainContent;
