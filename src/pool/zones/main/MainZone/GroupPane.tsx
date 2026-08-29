/**
 * GroupPane——单个 group 的标签栏容器（纯 GroupTabBar）。
 * E5.8#0d.10-6c：自 MainZone.tsx renderGroupPane 拆出——纯展示组件：
 *   tabs 由父层 getEffectiveTabs 解析后传入（拖拽本地/回执覆盖序），dragInsertIndex 由父层
 *   按 group 解析（dragInsertGroupId === group.id ? dragInsertIndex : null），零业务逻辑。
 * E5.8#141：keep-alive 标签页内容区已提升到 MainZone/TabContentLayer（根级 key=tab.id 保活，
 *   跨组移动零 remount）——本组件只渲染标签栏；内容区 top:TAB_BAR_HEIGHT 对齐由 TabContentLayer 承担。
 * 依赖方向：GroupPane → shared（ErrorBoundary/GroupTabBar）+ core types；无反向。
 */

import type { MouseEvent as ReactMouseEvent } from "react";
import ErrorBoundary from "../../../shared/error-boundary/ErrorBoundary"; // E5.7#20：池侧版（不 import 壳 components 目录）
import GroupTabBar from "../../../shared/group-tab-bar/GroupTabBar";
import type { PoolGroup, PoolTab } from "../../../../core/types/pool/poolLayout";

interface GroupPaneProps {
  group: PoolGroup;
  /** getEffectiveTabs(group.id, group)——拖拽本地/回执覆盖序由父层解析 */
  tabs: PoolTab[];
  draggingId?: string;
  /** 已按 group 解析：dragInsertGroupId === group.id ? dragInsertIndex : null */
  dragInsertIndex: number | null;
  onTabDragStart: (tabId: string, index: number, e: ReactMouseEvent) => void;
  onTabBarMount: (groupId: string, el: HTMLDivElement | null) => void;
  creatableViews?: { pluginId: string; label: string }[];
  /** E5.8#46.10：吸附竖线缝隙（跨窗拖拽命中本组 TabBar）——父层已按组解析（非本组传 null），渲染插入指示竖线 */
  adsorbInsertIndex?: number | null;
}

export default function GroupPane({
  group,
  tabs,
  draggingId,
  dragInsertIndex,
  onTabDragStart,
  onTabBarMount,
  creatableViews,
  adsorbInsertIndex,
}: GroupPaneProps) {
  return (
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
        adsorbInsertIndex={adsorbInsertIndex}
      />
    </ErrorBoundary>
  );
}
