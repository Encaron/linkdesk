/**
 * usePoolSync——E5.6#9a。
 *
 * 替代 useWebViewSync。壳侧任何状态变化 → 全量推送 PoolLayout 到两个 Pool。
 * Pool 被动渲染——不知道"世界为什么长这样"，只接收布局快照。
 *
 * 缓冲回放模式（E5.6#8b）保证 pushLayout 在池 React mount 之前到达不丢失。
 */

import { useEffect, useRef, useState } from "react";
import type { TabState } from "./useTabManager";
import type { PoolLayout, SidebarLayout, SidebarViewMeta, PoolGroup } from "../core/types/poolLayout";
import { ViewContainerService } from "../core/services/ViewContainerService";

/**
 * E5.6#11d：从 ViewContainerService 构建完整 SidebarViewMeta[]。
 * containerId → getViewContainer（title/mergeHeaderWhenSingle）+ getActiveViews → 每条序列化。
 * renderPath 从 loader.ts 设置的 _renderPath 读——池 PluginComponent 按此 key O(1) 查找组件。
 */
function buildSidebarViewMetas(containerId: string): SidebarViewMeta[] {
  const views = ViewContainerService.getActiveViews(containerId);
  return views.map((v) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const desc = v as any;
    return {
      id: v.id,
      title: v.title,
      pluginId: desc._pluginId ?? "",
      renderPath: desc._renderPath ?? "",
      role: v.role,
      order: v.order,
      collapsed: v.collapsed,
      badge: v.badge,
      titleDescription: v.titleDescription,
      titleTooltip: v.titleTooltip,
      singleViewPaneContainerTitle: v.singleViewPaneContainerTitle,
      minHeight: v.minHeight,
    };
  });
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

  // E5.6#11j fix：layoutVersion——ViewContainerService 写操作后触发重推。
  // reorderView/setVisible 会 fire onDidChangeActiveViews → bump version。
  // setCollapsed 不 fire 事件 → handler 内手动 bump。
  const [layoutVersion, setLayoutVersion] = useState(0);

  // 订阅 ViewContainerService.onDidChangeActiveViews——reorder/setVisible 后触发重推
  useEffect(() => {
    const sub = ViewContainerService.onDidChangeActiveViews.event(() => {
      setLayoutVersion((v) => v + 1);
    });
    return () => sub();
  }, []);

  // E5.6#11j：注册池→壳侧栏操作回调。池组件调用 pool.sidebarAction() →
  // 主进程转发 → 壳 preload → 此 handler → ViewContainerService 写方法。
  useEffect(() => {
    const poolApi = poolApiRef.current;
    if (!poolApi) return;
    const unsub = poolApi.onSidebarAction?.((action: any) => {
      switch (action?.action) {
        case "reorder":
          ViewContainerService.reorderView(action.containerId, action.viewId, action.newIndex);
          break;
        case "setCollapsed":
          ViewContainerService.setCollapsed(action.viewId, action.collapsed);
          setLayoutVersion((v) => v + 1);  // setCollapsed 不 fire 事件——手动触发重推
          break;
        case "setVisible":
          ViewContainerService.setVisible(action.containerId, action.viewId, action.visible);
          break;
      }
    });
    return unsub;
  }, []);

  // E5.6#11-fix：接收池侧 marketplace badge 更新事件→写入壳 ViewContainerService。
  // 池内 ViewContainerService 是空实例——marketplaceShared 的 updateAllBadges 改走 events.emit，
  // 壳监听到后写入壳 ViewContainerService → onDidChangeActiveViews 触发 layoutVersion bump → 重推布局。
  useEffect(() => {
    const unsub = (window as any).linkdesk?.events?.on("marketplace:updateBadge", (data: any) => {
      const existing = ViewContainerService.getView(data.viewId);
      if (!existing) return;
      // 防重推循环——badge 值未变则跳过
      if (existing.badge === data.count) return;
      ViewContainerService.registerView("marketplace", "marketplace", {
        id: data.viewId,
        title: existing.title,
        render: existing.render,
        badge: data.count,
      });
    });
    return () => { unsub?.(); };
  }, []);

  useEffect(() => {
    const poolApi = poolApiRef.current;
    if (!poolApi) return;

    // 侧栏布局——E5.6#11d：完整容器元数据 + SidebarViewMeta[]
    let sidebar: SidebarLayout;
    if (isSidebarVisible && sidebarView) {
      const container = ViewContainerService.getViewContainer(sidebarView);
      const views = buildSidebarViewMetas(sidebarView);
      const collapsedSet = ViewContainerService.loadCollapsedState();
      sidebar = {
        visible: true,
        width: sidebarWidth,
        containerId: sidebarView,
        containerTitle: container?.title ?? sidebarView,
        mergeHeaderWhenSingle: container?.mergeHeaderWhenSingle,
        views,
        collapsedViews: [...collapsedSet],
        viewId: views[0]?.pluginId ?? null,  // 向后兼容
      };
    } else {
      sidebar = {
        visible: false,
        width: sidebarWidth,
        containerId: null,
        containerTitle: "",
        views: [],
      };
    }

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
  }, [tabState, sidebarView, isSidebarVisible, sidebarWidth, layoutVersion]);
}
