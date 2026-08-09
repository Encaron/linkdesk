/**
 * usePoolSync——E5.6#9a。
 *
 * 替代 useWebViewSync。壳侧任何状态变化 → 全量推送 PoolLayout 到两个 Pool。
 * Pool 被动渲染——不知道"世界为什么长这样"，只接收布局快照。
 *
 * 缓冲回放模式（E5.6#8b）保证 pushLayout 在池 React mount 之前到达不丢失。
 */

import { useEffect, useRef } from "react";
import type { TabState } from "./useTabManager";
import type { PoolLayout, SidebarLayout, PoolGroup } from "../core/types/poolLayout";
import { ViewContainerService } from "../core/services/ViewContainerService";

/**
 * E5.6#11：containerId → pluginId 解析。
 * ViewContainerService 不直接暴露 container→plugin 映射，
 * 从容器已注册的第一个 view descriptor 的 _pluginId 反查。
 * 无 views → 返回 null（容器空——不应到达此处，但安全兜底）。
 */
function resolvePluginIdForContainer(containerId: string): string | null {
  const views = ViewContainerService.getViews(containerId);
  if (views.length === 0) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((views[0] as any)._pluginId as string) ?? null;
}

export interface UsePoolSyncInput {
  tabState: TabState;
  /** 侧栏当前容器 ID——null = 无活动侧栏视图 */
  sidebarView: string | null;
  /** 侧栏是否展开（未折叠） */
  isSidebarVisible: boolean;
  /** 侧栏当前宽度（px） */
  sidebarWidth: number;
}

/**
 * 构建 PoolLayout 并推送到 SidebarPool + MainPool。
 * 依赖 tabState / sidebarView / isSidebarVisible / sidebarWidth——任一变化触发全量推送。
 */
export function usePoolSync({ tabState, sidebarView, isSidebarVisible, sidebarWidth }: UsePoolSyncInput): void {
  // 缓存 pool API 引用——window.linkdesk.pool 在 preload 阶段就绪，mount 后不会变
  const poolApiRef = useRef<any>(null);
  if (!poolApiRef.current) {
    poolApiRef.current = (window as any).linkdesk?.pool;
  }

  useEffect(() => {
    const poolApi = poolApiRef.current;
    if (!poolApi) return;

    // 侧栏布局——E5.6#11：containerId → pluginId 解析，PluginComponent 只认 pluginId
    const sidebar: SidebarLayout = {
      visible: isSidebarVisible && sidebarView !== null,
      width: sidebarWidth,
      viewId: sidebarView ? resolvePluginIdForContainer(sidebarView) : null,
    };

    // 主区分屏组——每个 group 映射为一个 flex 区域
    const groups: PoolGroup[] = tabState.groups.map((g) => ({
      id: g.id,
      flex: 1,
      activeTabId: g.activeTabId,
      tabs: g.tabs.map((t) => ({
        id: t.id,
        pluginId: t.pluginId ?? t.type,
        title: t.label,
        sourceId: t.sourceId,
        dirty: t.dirty,
      })),
    }));

    poolApi.pushLayout("sidebar", { sidebar, groups: [] } satisfies PoolLayout);
    poolApi.pushLayout("main", { groups } satisfies PoolLayout);
  }, [tabState, sidebarView, isSidebarVisible, sidebarWidth]);
}
