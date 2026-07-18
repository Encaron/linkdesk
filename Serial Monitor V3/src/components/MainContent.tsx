/**
 * MainContent — 主内容区。
 * Phase 3 改造：单面板 keep-alive pool + 分屏 allotment。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §4, §5]
 *
 * 单面板：所有标签页同时挂载，CSS display 切换——切换不丢 CM6/滚动/Monaco 状态。
 * 分屏：只渲染面板中的 2 个标签页。unsplit 时全部重挂载（可接受——分屏是低频操作）。
 */

import { useCallback } from "react";
import type { TabState } from "../hooks/useTabManager";
import SplitPane from "./SplitPane";
import TerminalView from "./views/TerminalView";
import ErrorBoundary from "./shared/ErrorBoundary";
import WorkspaceView from "./views/WorkspaceView";
import SettingsView from "./views/SettingsView";
import "./MainContent.css";

interface MainContentProps {
  tabState: TabState;
  onSplitResize?: (sizes: [number, number]) => void;
}

/** 根据标签页类型渲染对应 View 组件 */
function renderTabContent(
  tab: { id: string; type: string; workspaceName?: string },
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
    default:
      return null;
  }
}

function MainContent({ tabState, onSplitResize }: MainContentProps) {
  const { tabs, activeTabId, split } = tabState;

  const handleAllotmentChange = useCallback(
    (sizes: number[]) => {
      if (sizes.length === 2) {
        onSplitResize?.(sizes as [number, number]);
      }
    },
    [onSplitResize]
  );

  // ── 分屏模式 ──
  if (split) {
    const [id1, id2] = split.tabIds;
    const tab1 = tabs.find((t) => t.id === id1);
    const tab2 = tabs.find((t) => t.id === id2);

    return (
      <div className="main-content">
        <SplitPane
          direction={split.direction}
          sizes={split.sizes}
          onResize={handleAllotmentChange}
        >
          <div className="tab-content-pane" style={{ display: "flex" }}>
            {tab1 && renderTabContent(tab1, tab1.id === activeTabId)}
          </div>
          <div className="tab-content-pane" style={{ display: "flex" }}>
            {tab2 && renderTabContent(tab2, tab2.id === activeTabId)}
          </div>
        </SplitPane>
      </div>
    );
  }

  // ── 单面板模式：keep-alive pool ──
  return (
    <div className="main-content">
      <div className="tab-content-pool">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="tab-content-pane"
            style={{
              display: tab.id === activeTabId ? "flex" : "none",
            }}
          >
            {renderTabContent(tab, tab.id === activeTabId)}
          </div>
        ))}
      </div>
    </div>
  );
}

export { renderTabContent };
export default MainContent;
