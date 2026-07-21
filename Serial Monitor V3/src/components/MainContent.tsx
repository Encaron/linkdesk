/**
 * MainContent — 主内容区。
 * Phase 3.x：递归分屏——树状 SplitPane 渲染 + 面板内毛玻璃（无越界）。
 * Phase 4 B33：tab pane 绝对定位平铺——所有标签页内容区平级渲染，
 *   跨组移动只改 CSS 位置，React 树永不变（对标 B22 面板平铺方案）。
 */

import { useCallback, useMemo } from "react";
import type { TabState, TabGroup, Tab } from "../hooks/useTabManager";
import type { DropZone } from "../hooks/tabDragTypes";
import { getAllLeafGroupIds } from "../hooks/splitTree";
import SplitPane from "./SplitPane";
import TabBar from "./TabBar";
import ErrorBoundary from "./shared/ErrorBoundary";
import WelcomeView from "./views/WelcomeView";
import PluginDetailView from "./views/PluginDetailView";
import { getViewPlugin, FALLBACK_PLUGIN_ID } from "../pluginLoader/viewRegistry";
import { isShellRenderedTab } from "../hooks/tabIdentity";
import TabPanePositioner from "./TabPanePositioner";
import "./MainContent.css";

interface MainContentProps {
  tabState: TabState;
  activeGroupId: string;
  onFocusTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (type: string, opts?: import("../core/types").CreateTabOptions) => string;
  onSplitTab: (tabId: string, direction?: "horizontal" | "vertical") => void;
  onMoveTab: (tabId: string, targetGroupId: string) => void;
  onReorderTab: (tabId: string, toIndex: number) => void;
  onPinTab?: (tabId: string) => void;
  onDropSplit: (tabId: string, zone: Exclude<DropZone, null | "center">, targetGroupId?: string) => void;
  onDropCopySplit?: (tabId: string, zone: Exclude<DropZone, null | "center">, targetGroupId?: string) => void;
  onSplitResize?: (anchorGroupId: string, sizes: [number, number], branchIndex?: number) => void;
  dropZone?: DropZone | null;
  dragDropTargetGroupId?: string | null;
  editorAreaRef?: React.RefObject<HTMLDivElement | null>;
  onDragDropZone?: (zone: DropZone | null, targetGroupId?: string) => void;
  isDragging?: boolean;
  onDraggingChange?: (v: boolean) => void;
}

function renderTabContent(
  tab: { id: string; type: string; pluginId?: string; detailPluginId?: string; workspaceName?: string; filePath?: string; sourceId?: string },
  isActive: boolean,
  onCreateTab?: (type: string, opts?: import("../core/types").CreateTabOptions) => string,
) {
  // 壳自身的视图——不走插件路由
  if (isShellRenderedTab(tab.type)) {
    if (tab.type === "plugin-detail") {
      return <PluginDetailView key={tab.id} isActive={isActive} pluginId={tab.detailPluginId} />;
    }
    if (tab.type === FALLBACK_PLUGIN_ID) {
      return <WelcomeView key={tab.id} isActive={isActive} onCreateTab={onCreateTab} />;
    }
  }

  // Phase 4.4：视图插件路由——唯一的正常路径
  if (tab.pluginId) {
    const plugin = getViewPlugin(tab.pluginId);
    if (plugin) {
      return (
        <ErrorBoundary>
          <plugin.component key={tab.id} isActive={isActive} sourceId={tab.sourceId} />
        </ErrorBoundary>
      );
    }
  }

  // 通用不可用占位——插件未安装/已卸载/已禁用
  return (
    <div key={tab.id} className="plugin-missing-view">
      <p>{tab.pluginId ? `插件 "${tab.pluginId}" 不可用` : "未知视图类型"}</p>
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
  onPinTab,
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

  // B33：所有 tab pane 平级收集。React 树中顺序永不变，跨组移动只改 groupId。
  const flatPanes = useMemo(() => {
    const panes: Array<{ tab: Tab; groupId: string; isVisible: boolean; isFocused: boolean }> = [];
    for (const g of tabState.groups) {
      for (const tab of g.tabs) {
        const isActiveInGroup = tab.id === g.activeTabId;
        panes.push({
          tab,
          groupId: g.id,
          isVisible: isActiveInGroup,
          isFocused: isActiveInGroup && g.id === activeGroupId,
        });
      }
    }
    return panes;
  }, [tabState.groups, activeGroupId]);

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
            onPinTab={onPinTab}
            onDropSplit={onDropSplit}
            onDropCopySplit={onDropCopySplit}
            editorAreaRef={editorAreaRef}
            dragDropZone={dropZone}
            onDragDropZone={onDragDropZone}
            isDragging={isDragging}
            onDraggingChange={onDraggingChange}
          />
          {/* 内容占位区——tab pane 通过绝对定位填充，不做子元素渲染 */}
          <div
            className="tab-content-pool"
            data-group-id={group.id}
            style={{ flex: 1, position: "relative", overflow: "hidden" }}
          />
          {isTarget && (
            <div
              className={`drop-zone-overlay drop-zone-${dropZone}`}
              style={{ pointerEvents: "none" }}
            />
          )}
        </div>
      );
    },
    [tabState.root, activeGroupId, dropZone, dragDropTargetGroupId,
     onFocusTab, onCloseTab, onCreateTab, onSplitTab, onMoveTab, onReorderTab, onPinTab,
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
      {/* B33：所有 tab pane 平级渲染，绝对定位填入对应组的 tab-content-pool。
          移动标签页 → groupId 变 → 绝对定位更新 → React 树不变 → 零 unmount。 */}
      {flatPanes.map(({ tab, groupId, isVisible, isFocused }) => (
        <TabPanePositioner
          key={tab.id}
          groupId={groupId}
          isVisible={isVisible}
        >
          {renderTabContent(tab, isFocused, onCreateTab)}
        </TabPanePositioner>
      ))}
    </div>
  );
}

export default MainContent;
