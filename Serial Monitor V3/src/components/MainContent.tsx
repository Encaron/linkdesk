/**
 * MainContent — 主内容区。Phase 3 改造：CSS display keep-alive 替代条件渲染。
 * 所有标签页同时挂载，切换不丢 CM6/滚动/Monaco 状态。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §4]
 */

import type { TabState } from "../hooks/useTabManager";
import TerminalView from "./views/TerminalView";
import ErrorBoundary from "./shared/ErrorBoundary";
import WorkspaceView from "./views/WorkspaceView";
import SettingsView from "./views/SettingsView";
import "./MainContent.css";

interface MainContentProps {
  tabState: TabState;
}

/** 根据标签页类型渲染对应 View 组件 */
function renderTabContent(tab: { id: string; type: string; workspaceName?: string }, isActive: boolean) {
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
      // Phase 5
      return <div key={tab.id}>OLED 视图（Phase 5 实现）</div>;
    default:
      return null;
  }
}

function MainContent({ tabState }: MainContentProps) {
  const { tabs, activeTabId, split } = tabState;

  // 哪些标签页可见
  const visibleTabIds = split ? new Set(split.tabIds) : new Set([activeTabId]);

  return (
    <div className="main-content">
      <div className="tab-content-pool">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="tab-content-pane"
            style={{
              display: visibleTabIds.has(tab.id) ? "flex" : "none",
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
