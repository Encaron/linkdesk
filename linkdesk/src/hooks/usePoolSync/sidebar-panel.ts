/**
 * usePoolSync 侧栏/面板/分屏序列化——buildSidebarViewMetas / buildPanelViewMetas / computeGroupFlexes。
 * E5.8#0d.10-5a：自 usePoolSync.ts 拆出——纯函数：ViewContainerService 活跃视图 → DTO；
 * SplitNode 树 → group flex 比例。零 hook 依赖。
 * 依赖方向：sidebar-panel → core/services/layout + core/utils/splitTree（type）；无反向。
 */

import type { SidebarViewMeta, PanelViewMeta } from "../../core/types/pool/poolLayout";
import { ViewContainerService } from "../../core/services/layout/ViewContainerService";
import type { ViewDescriptor } from "../../core/services/layout/ViewContainerService"; // E5.7#98：_pluginId/_renderPath 窄接口基型
import type { SplitNode } from "../../core/utils/splitTree"; // E5.6#16：从分屏树计算 flex 比例

/**
 * E5.6#11d：从 ViewContainerService 构建完整 SidebarViewMeta[]。
 * containerId → getViewContainer（title/mergeHeaderWhenSingle）+ getActiveViews → 每条序列化。
 * renderPath 从 loader.ts 设置的 _renderPath 读——池 PluginComponent 按此 key O(1) 查找组件。
 */
export function buildSidebarViewMetas(containerId: string): SidebarViewMeta[] {
  const views = ViewContainerService.getActiveViews(containerId);
  return views.map((v) => {
    // E5.7#98：loader.ts 运行时附挂 _pluginId/_renderPath（registerView 契约外字段）——窄接口取型
    const desc = v as ViewDescriptor & { _pluginId?: string; _renderPath?: string };
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
 * E5.7#63.7：从 ViewContainerService 构建底部面板 PanelViewMeta[]。
 * location:"panel" 的全部容器 → getActiveViews 展平（getViewContainers 已按容器 order 排序，
 * getActiveViews 按 view order 排序——两级排序对齐 VS Code panel 语义）。
 * renderPath 与侧栏同源（loader _renderPath）——池 PluginComponent 按此 key 动态 import。
 */
export function buildPanelViewMetas(): PanelViewMeta[] {
  const metas: PanelViewMeta[] = [];
  for (const container of ViewContainerService.getViewContainers("panel")) {
    for (const v of ViewContainerService.getActiveViews(container.id)) {
      // E5.7#98：同 buildSidebarViewMetas——loader 附挂字段窄接口取型
      const desc = v as ViewDescriptor & { _pluginId?: string; _renderPath?: string };
      metas.push({
        id: v.id,
        title: v.title,
        pluginId: desc._pluginId ?? "",
        renderPath: desc._renderPath ?? "",
      });
    }
  }
  return metas;
}

/**
 * E5.6#16：从 SplitNode 树计算每个 group 的 flex 比例。
 * 叶子节点：递归累乘父 branch 的 sizes 比例。
 * 单 group（root 为 leaf）：flex = 1。
 */
export function computeGroupFlexes(root: SplitNode): Map<string, number> {
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
