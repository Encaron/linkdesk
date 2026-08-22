/**
 * GroupPane——单个 group 的内容（GroupTabBar + keep-alive 标签页内容区）。
 * E5.8#0d.10-6c：自 MainZone.tsx renderGroupPane 拆出——纯展示组件：
 *   tabs 由父层 getEffectiveTabs 解析后传入（拖拽本地/回执覆盖序），dragInsertIndex 由父层
 *   按 group 解析（dragInsertGroupId === group.id ? dragInsertIndex : null），零业务逻辑。
 * 依赖方向：GroupPane → shared（ErrorBoundary/GroupTabBar/ShellViewRenderer/PluginComponent）+ core types；无反向。
 */

import type { MouseEvent as ReactMouseEvent } from "react";
import ErrorBoundary from "../../../shared/error-boundary/ErrorBoundary"; // E5.7#20：池侧版（不 import 壳 components 目录）
import GroupTabBar from "../../../shared/group-tab-bar/GroupTabBar";
import ShellViewRenderer from "../../../views/shell-renderer/ShellViewRenderer";
import PluginComponent from "../../../shared/plugin-component/PluginComponent";
import type { PoolGroup, PoolTab } from "../../../../core/types/pool/poolLayout";

interface GroupPaneProps {
  group: PoolGroup;
  /** E5.8#30.15（P5）：本面板是否聚焦（group.id === activeGroupId）——isActive 单聚焦判定 */
  focused?: boolean;
  /** getEffectiveTabs(group.id, group)——拖拽本地/回执覆盖序由父层解析 */
  tabs: PoolTab[];
  draggingId?: string;
  /** 已按 group 解析：dragInsertGroupId === group.id ? dragInsertIndex : null */
  dragInsertIndex: number | null;
  onTabDragStart: (tabId: string, index: number, e: ReactMouseEvent) => void;
  onTabBarMount: (groupId: string, el: HTMLDivElement | null) => void;
  creatableViews?: { pluginId: string; label: string }[];
  /** E5.8#44-C：吸附目标组 id（跨窗拖拽命中）——本组 id 匹配则 TabBar 点亮吸附高亮 */
  adsorbGroupId?: string | null;
}

export default function GroupPane({
  group,
  focused = true,
  tabs,
  draggingId,
  dragInsertIndex,
  onTabDragStart,
  onTabBarMount,
  creatableViews,
  adsorbGroupId,
}: GroupPaneProps) {
  return (
    <>
      <ErrorBoundary pluginId={`pool-tabbar:${group.id}`}>
        <GroupTabBar
          groupId={group.id}
          tabs={tabs}
          activeTabId={group.activeTabId}
          draggingId={draggingId ?? undefined}
          dragInsertIndex={dragInsertIndex}
          onTabDragStart={onTabDragStart}
          onTabBarMount={(el) => onTabBarMount(group.id, el)}
          creatableViews={creatableViews}
          adsorbGroupId={adsorbGroupId}
        />
      </ErrorBoundary>
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {group.tabs.map((tab) => (
          <div
            key={tab.id}
            style={{
              display: tab.id === group.activeTabId ? "flex" : "none",
              flexDirection: "column",
              height: "100%",
            }}
          >
            {tab.shellRendered ? (
              <ErrorBoundary pluginId={tab.pluginId}>
                <ShellViewRenderer
                  tab={tab}
                  // E5.8#30.15（P5）：isActive 单聚焦——仅聚焦面板的活跃标签（对标 VS Code：
                  // 只有聚焦编辑组的活跃编辑器才是「活跃」；多面板下不再每面板各一个活跃标签）
                  isActive={focused && tab.id === group.activeTabId}
                  creatableViews={creatableViews}
                />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary pluginId={tab.pluginId}>
                <PluginComponent
                  pluginId={tab.pluginId}
                  tabId={tab.id}
                  sourceId={tab.sourceId}
                  isActive={focused && tab.id === group.activeTabId}
                />
              </ErrorBoundary>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
