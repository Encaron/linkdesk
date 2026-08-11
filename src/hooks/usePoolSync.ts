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
import { layoutEngine } from "../core/services/LayoutEngine"; // E5.6#11-fix7：池◀按钮→壳 setZoneWidth("sidebar", 28)
import type { SplitNode } from "./splitTree"; // E5.6#16：从分屏树计算 flex 比例

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

/**
 * E5.6#16：从 SplitNode 树计算每个 group 的 flex 比例。
 * 叶子节点：递归累乘父 branch 的 sizes 比例。
 * 单 group（root 为 leaf）：flex = 1。
 */
function computeGroupFlexes(root: SplitNode): Map<string, number> {
  if (root.type === "leaf") {
    return new Map([[root.groupId, 1]]);
  }
  const result = new Map<string, number>();
  function walk(node: SplitNode, parentFlex: number): void {
    if (node.type === "leaf") {
      result.set(node.groupId, parentFlex);
      return;
    }
    const total = node.sizes[0] + node.sizes[1];
    if (total <= 0) {
      // 防御：sizes 归零 → 均分
      walk(node.children[0], parentFlex / 2);
      walk(node.children[1], parentFlex / 2);
      return;
    }
    walk(node.children[0], parentFlex * (node.sizes[0] / total));
    walk(node.children[1], parentFlex * (node.sizes[1] / total));
  }
  walk(root, 1);
  return result;
}

export interface UsePoolSyncInput {
  tabState: TabState;
  /** 侧栏当前容器 ID——null = 无活动侧栏视图 */
  sidebarView: string | null;
  /** 侧栏是否展开（未折叠） */
  isSidebarVisible: boolean;
  /** 侧栏当前宽度（px） */
  sidebarWidth: number;
  /** E5.6#16：MainPool 分隔线拖拽结束 → 壳更新分屏比例 */
  onSplitSizesChange?: (anchorGroupId: string, sizes: [number, number], branchIndex?: number) => void;
}

/**
 * 构建 PoolLayout 并推送到 SidebarPool + MainPool。
 * 依赖 tabState / sidebarView / isSidebarVisible / sidebarWidth——任一变化触发全量推送。
 */
export function usePoolSync({ tabState, sidebarView, isSidebarVisible, sidebarWidth, onSplitSizesChange }: UsePoolSyncInput): void {
  // 缓存 pool API 引用——window.linkdesk.pool 在 preload 阶段就绪，mount 后不会变
  const poolApiRef = useRef<any>(null);
  if (!poolApiRef.current) {
    poolApiRef.current = (window as any).linkdesk?.pool;
  }

  // E5.6#11-fix8：跟踪上次非空 sidebarView——图标栏点击坍塌时 emit null → sidebarView=null，
  // 但池仍需知道渲染哪个容器（collapsed 状态 ▶ 按钮需要 containerId 和 views）。
  // 宽≤48 时优先 collapsed 而非 hidden——确保图标点击和 ◀ 按钮两条坍塌路径行为一致。
  const lastSidebarViewRef = useRef<string | null>(null);

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
        // E5.6#11-fix7：池◀/▶按钮→布局引擎→WebContentsView bounds→重推 layout
        case "toggleSidebarCollapse": {
          const zone = layoutEngine.getBounds("sidebar");
          if (zone) {
            const targetWidth = zone.width <= 48 ? 280 : 28;
            layoutEngine.setZoneWidth("sidebar", targetWidth);
          }
          break;
        }
        // E5.6#16：MainPool 分隔线拖拽结束 → 壳更新分屏比例
        case "updateSplitSizes": {
          const { anchorGroupId, sizes, branchIndex } = action as { anchorGroupId: string; sizes: [number, number]; branchIndex?: number };
          onSplitSizesChange?.(anchorGroupId, sizes, branchIndex);
          break;
        }
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
    // E5.6#11-fix8：记住上次非空 sidebarView——图标栏坍塌时 emit null，但 collapsed ▶ 仍需知道容器
    if (sidebarView) {
      lastSidebarViewRef.current = sidebarView;
    }

    const poolApi = poolApiRef.current;
    if (!poolApi) return;

    // 侧栏布局——E5.6#11d：完整容器元数据 + SidebarViewMeta[]
    // E5.6#11-fix8：isSidebarVisible 只对壳 SidePanel DOM 有意义——池渲染不应依赖它。
    // 池只要知道是哪个容器（sidebarView 或 lastSidebarViewRef），就应该渲染侧栏。
    // 宽≤48 → collapsed（▶ 按钮），宽>48 → 展开。两条坍塌路径（图标点击/◀按钮）行为一致。
    const effectiveSidebarView = sidebarView || lastSidebarViewRef.current;
    let sidebar: SidebarLayout;
    if (effectiveSidebarView) {
      const container = ViewContainerService.getViewContainer(effectiveSidebarView);
      const views = buildSidebarViewMetas(effectiveSidebarView);
      const collapsedSet = ViewContainerService.loadCollapsedState();
      const isCollapsed = sidebarWidth <= 48;
      sidebar = {
        visible: true,
        width: sidebarWidth,
        containerId: effectiveSidebarView,
        containerTitle: container?.title ?? effectiveSidebarView,
        mergeHeaderWhenSingle: container?.mergeHeaderWhenSingle,
        views,
        collapsedViews: [...collapsedSet],
        collapsed: isCollapsed,
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
    // E5.6#16：从 SplitNode 树计算实际 flex 比例（不再硬编码 1）
    const flexMap = computeGroupFlexes(tabState.root);
    const groups: PoolGroup[] = tabState.groups.map((g) => ({
      id: g.id,
      flex: flexMap.get(g.id) ?? 1,
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
