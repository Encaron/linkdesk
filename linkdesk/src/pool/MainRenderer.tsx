/**
 * MainRenderer——E5.6#7c。
 *
 * MainPool 的 React 渲染器。接收壳推送的 PoolGroup[]，
 * 每个 group = flex div，每个 tab = keep-alive（display: none/block）。
 * 所有插件组件用 ErrorBoundary 包裹——一个插件崩溃不影响其他标签页。
 */

import ErrorBoundary from "../components/shared/ErrorBoundary";
import PluginComponent from "./PluginComponent";
import type { PoolGroup } from "../core/types/poolLayout";

interface MainRendererProps {
  groups: PoolGroup[];
}

export default function MainRenderer({ groups }: MainRendererProps) {
  // 无标签页——主区空白
  if (groups.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--text-muted, #888)",
          fontSize: 13,
          userSelect: "none",
        }}
      >
        没有打开的标签页
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flex: 1, height: "100%", overflow: "hidden" }}>
      {groups.map((group) => (
        <div
          key={group.id}
          style={{
            flex: group.flex,
            height: "100%",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {group.tabs.map((tab) => (
            <div
              key={tab.id}
              style={{
                display: tab.id === group.activeTabId ? "block" : "none",
                height: "100%",
              }}
            >
              <ErrorBoundary pluginId={tab.pluginId}>
                <PluginComponent
                  pluginId={tab.pluginId}
                  tabId={tab.id}
                  sourceId={tab.sourceId}
                  isActive={tab.id === group.activeTabId}
                />
              </ErrorBoundary>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
