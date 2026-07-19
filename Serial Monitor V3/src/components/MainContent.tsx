/**
 * MainContent — 主内容区。
 * Phase 3.x：递归分屏——树状 SplitPane 渲染 + 面板内毛玻璃（无越界）。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §4] + [V3-Phase3-补充-递归分屏.md]
 */

import { useCallback } from "react";
import type { TabState, TabGroup } from "../hooks/useTabManager";
import type { DropZone } from "../hooks/tabDragTypes";
import { getAllLeafGroupIds } from "../hooks/splitTree";
import SplitPane from "./SplitPane";
import TabBar from "./TabBar";
import ErrorBoundary from "./shared/ErrorBoundary";
import WorkspaceView from "./views/WorkspaceView";
import SettingsView from "./views/SettingsView";
import WelcomeView from "./views/WelcomeView";
import PluginDetailView from "./views/PluginDetailView";
import { getViewPlugin } from "../pluginLoader/viewRegistry";
import "./MainContent.css";

interface MainContentProps {
  tabState: TabState;
  activeGroupId: string;
  onFocusTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (type: string, opts?: { workspaceName?: string; filePath?: string; label?: string }) => string;
  onSplitTab: (tabId: string, direction?: "horizontal" | "vertical") => void;
  onMoveTab: (tabId: string, targetGroupId: string) => void;
  onReorderTab: (tabId: string, toIndex: number) => void;
  onDropSplit: (tabId: string, zone: Exclude<DropZone, null | "center">, targetGroupId?: string) => void;
  onDropCopySplit?: (tabId: string, zone: Exclude<DropZone, null | "center">, targetGroupId?: string) => void;
  onSplitResize?: (anchorGroupId: string, sizes: [number, number]) => void;
  dropZone?: DropZone | null;
  dragDropTargetGroupId?: string | null;
  editorAreaRef?: React.RefObject<HTMLDivElement | null>;
  onDragDropZone?: (zone: DropZone | null, targetGroupId?: string) => void;
  isDragging?: boolean;
  onDraggingChange?: (v: boolean) => void;
}

function renderTabContent(
  tab: { id: string; type: string; pluginId?: string; workspaceName?: string; filePath?: string; sourceId?: string },
  isActive: boolean,
  onCreateTab?: (type: string, opts?: { workspaceName?: string; filePath?: string; label?: string }) => string,
) {
  if (tab.pluginId) {
    const plugin = getViewPlugin(tab.pluginId);
    if (plugin) {
      return (
        <ErrorBoundary>
          <plugin.component key={tab.id} isActive={isActive} sourceId={tab.sourceId} />
        </ErrorBoundary>
      );
    }
    if (!["terminal", "workspace", "settings", "welcome", "oled", "editor", "plugin-detail", "marketplace"].includes(tab.type)) {
      return (
        <div key={tab.id} className="plugin-missing-view">
          <p>插件 "{tab.pluginId}" 未安装或已禁用</p>
        </div>
      );
    }
  }

  switch (tab.type) {
    case "terminal":
      return (
        <ErrorBoundary>
          <MissingTerminalFallback key={tab.id} />
        </ErrorBoundary>
      );
    case "workspace":
      return <WorkspaceView key={tab.id} isActive={isActive} workspaceName={tab.workspaceName} />;
    case "settings":
      return <SettingsView key={tab.id} isActive={isActive} />;
    case "oled":
      return <div key={tab.id}>OLED 视图（Phase 6 实现）</div>;
    case "editor":
      return <div key={tab.id}>{tab.filePath}（JSON 编辑器 Phase 7 实现）</div>;
    case "welcome":
      return <WelcomeView key={tab.id} isActive={isActive} onCreateTab={onCreateTab} />;
    case "plugin-detail":
      return <PluginDetailView key={tab.id} isActive={isActive} pluginId={tab.pluginId} />;
    case "marketplace":
      return <div key={tab.id} className="plugin-detail-empty">插件管理 — Phase 5</div>;
    default:
      return null;
  }
}

function MissingTerminalFallback() {
  return (
    <div className="plugin-missing-view">
      <p>终端插件未加载——请检查 plugins/terminal/ 目录</p>
    </div>
  );
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
  onDropCopySplit,
  onSplitResize,
  dropZone,
  dragDropTargetGroupId,
  editorAreaRef,
  onDragDropZone,
  isDragging,
  onDraggingChange,
}: MainContentProps) {

  const renderGroup = useCallback(
    (group: TabGroup) => {
      const isTarget = dragDropTargetGroupId === group.id && dropZone;
      return (
        <div
          className={`tab-group-pane${group.id === activeGroupId ? " active" : ""}`}
          key={group.id}
          data-group-id={group.id}
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            position: "relative",
          }}
        >
          <TabBar
            group={group}
            isActiveGroup={group.id === activeGroupId}
            onFocusTab={onFocusTab}
            onCloseTab={onCloseTab}
            onCreateTab={onCreateTab}
            onSplitTab={onSplitTab}
            onMoveTab={(tabId, targetGroupId?) => {
              if (targetGroupId && targetGroupId !== group.id) {
                onMoveTab(tabId, targetGroupId);
              } else if (!targetGroupId) {
                const allLeafIds = getAllLeafGroupIds(tabState.root);
                const otherGroupId = allLeafIds.find((id) => id !== group.id);
                if (otherGroupId) onMoveTab(tabId, otherGroupId);
              }
            }}
            onReorderTab={onReorderTab}
            onDropSplit={onDropSplit}
            onDropCopySplit={onDropCopySplit}
            editorAreaRef={editorAreaRef}
            dragDropZone={dropZone}
            onDragDropZone={onDragDropZone}
            isDragging={isDragging}
            onDraggingChange={onDraggingChange}
          />
          <div className="tab-content-pool" style={{ flex: 1, position: "relative" }}>
            {/* B33: 跨组移动时 React 跨父节点 unmount/remount。
                有状态组件通过模块级缓存自救（见 TerminalView 的 _cm6SavedViews）。 */}
            {group.tabs.map((tab) => (
              <div
                key={tab.id}
                className="tab-content-pane"
                style={{
                  display: tab.id === group.activeTabId ? "flex" : "none",
                }}
              >
                {renderTabContent(tab, tab.id === group.activeTabId && group.id === activeGroupId, onCreateTab)}
              </div>
            ))}
          </div>
          {isTarget && (
            <div
              className={`drop-zone-overlay drop-zone-${dropZone}`}
              style={{ pointerEvents: "none" }}
            />
          )}
        </div>
      );
    },
    [tabState.root, tabState.groups, activeGroupId, dropZone, dragDropTargetGroupId,
     onFocusTab, onCloseTab, onCreateTab, onSplitTab, onMoveTab, onReorderTab,
     onDropSplit, onDropCopySplit, editorAreaRef, onDragDropZone, isDragging, onDraggingChange]
  );

  return (
    <div className="main-content">
      <SplitPane
        node={tabState.root}
        groups={tabState.groups}
        renderGroup={renderGroup}
        onResize={onSplitResize}
      />
    </div>
  );
}

export default MainContent;
