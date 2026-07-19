/**
 * MainContent — 主内容区。
 * Phase 3.x：递归分屏——树状 SplitPane 渲染 + 面板内毛玻璃（无越界）。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §4] + [V3-Phase3-补充-递归分屏.md]
 */

import { useCallback } from "react";
import type { TabState, TabGroup, TabType } from "../hooks/useTabManager";
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
  onCreateTab: (type: TabType, opts?: { workspaceName?: string; filePath?: string }) => string;
  onSplitTab: (tabId: string, direction?: "horizontal" | "vertical") => void;
  onMoveTab: (tabId: string, targetGroupId: string) => void;
  onReorderTab: (tabId: string, toIndex: number) => void;
  onDropSplit: (tabId: string, zone: Exclude<DropZone, null | "center">, targetGroupId?: string) => void;
  /** Shift+拖 = 复制标签页到新面板 */
  onDropCopySplit?: (tabId: string, zone: Exclude<DropZone, null | "center">, targetGroupId?: string) => void;
  onSplitResize?: (anchorGroupId: string, sizes: [number, number]) => void;
  dropZone?: DropZone | null;
  /** 当前被拖拽悬停的目标面板 groupId——用于在该面板内渲染毛玻璃 */
  dragDropTargetGroupId?: string | null;
  editorAreaRef?: React.RefObject<HTMLDivElement | null>;
  onDragDropZone?: (zone: DropZone | null, targetGroupId?: string) => void;
  isDragging?: boolean;
  onDraggingChange?: (v: boolean) => void;
}

/** 根据标签页 pluginId（优先）或 type（fallback）渲染对应 View 组件 */
export function renderTabContent(
  tab: { id: string; type: string; pluginId?: string; workspaceName?: string; filePath?: string; sourceId?: string },
  isActive: boolean,
  onCreateTab?: (type: string, opts?: any) => string,
) {
  // Phase 4：优先走 viewRegistry（插件系统）
  if (tab.pluginId) {
    const plugin = getViewPlugin(tab.pluginId);
    if (plugin) {
      return (
        <ErrorBoundary>
          <plugin.component key={tab.id} isActive={isActive} sourceId={tab.sourceId} />
        </ErrorBoundary>
      );
    }
    // pluginId 在注册表中不存在（插件被卸载/禁用）→ 占位 UI
    return (
      <div key={tab.id} className="plugin-missing-view">
        <p>插件 "{tab.pluginId}" 未安装或已禁用</p>
      </div>
    );
  }

  // Phase 4 过渡期 fallback：旧版 tab（无 pluginId）走硬编码 switch
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

/** 旧版终端占位——终端已变为插件，不应走 fallback 路径 */
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

  /** 渲染一个面板组——标签栏 + 内容区 + 面板内毛玻璃 */
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
                // 中央放手：移到指定目标面板
                onMoveTab(tabId, targetGroupId);
              } else if (!targetGroupId) {
                // 拖到另一个标签栏：移到任意其他面板
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
            {/* ⚠️ keep-alive: 用 CSS display 切换而非条件渲染。
                不要改成 {isActive && <View />}——会丢失 CM6/Monaco 状态（B22 教训）。 */}
            {group.tabs.map((tab) => (
              <div
                key={tab.id}
                className="tab-content-pane"
                style={{
                  display: tab.id === group.activeTabId ? "flex" : "none",
                }}
              >
                {renderTabContent(tab, tab.id === group.activeTabId && group.id === activeGroupId, onCreateTab as any)}
              </div>
            ))}
          </div>
          {/* 面板内毛玻璃——CSS 控制半边尺寸（50%），严格裁剪在 .tab-group-pane 内 */}
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

  // ── 递归渲染分裂树 ──
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
