/**
 * usePoolSync 侧栏/面板/分屏序列化——buildSidebarViewMetas / buildPanelViewMetas / computeGroupFlexes。
 * E5.8#0d.10-5a：自 usePoolSync.ts 拆出——纯函数：ViewContainerService 活跃视图 → DTO；
 * SplitNode 树 → group flex 比例。零 hook 依赖。
 * 依赖方向：sidebar-panel → core/services/layout + core/utils/splitTree（type）；无反向。
 */

import type { SidebarViewMeta, PanelViewMeta, PanelSwitcherGroup } from "../../core/types/pool/poolLayout";
import { ViewContainerService } from "../../core/services/layout/ViewContainerService";
import type { ViewDescriptor } from "../../core/services/layout/ViewContainerService"; // E5.7#98：_pluginId/_renderPath 窄接口基型
import type { SplitNode } from "../../core/utils/splitTree"; // E5.6#16：从分屏树计算 flex 比例

/**
 * E5.6#11d：从 ViewContainerService 构建完整 SidebarViewMeta[]。
 * containerId → getViewContainer（title/mergeHeaderWhenSingle）+ getActiveViews → 每条序列化。
 * renderPath 从 loader.ts 设置的 _renderPath 读——池 PluginComponent 按此 key O(1) 查找组件。
 * 🔥 E5.8#37.9：title 壳 t() 解析后推送（显示文本铁律——池零自产文本）。此前原样推 v.title
 * → 侧栏标题/视图子菜单全中文（key 存在也没走 t()）。t 必传（身份函数仅测试桩用）。
 */
export function buildSidebarViewMetas(containerId: string, t: (key: string) => string): SidebarViewMeta[] {
  const views = ViewContainerService.getActiveViews(containerId);
  return views.map((v) => {
    // E5.7#98：loader.ts 运行时附挂 _pluginId/_renderPath（registerView 契约外字段）——窄接口取型
    const desc = v as ViewDescriptor & { _pluginId?: string; _renderPath?: string };
    return {
      id: v.id,
      title: t(v.title),
      pluginId: desc._pluginId ?? "",
      renderPath: desc._renderPath ?? "",
      role: v.role,
      order: v.order,
      collapsed: v.collapsed,
      badge: v.badge,
      titleDescription: v.titleDescription ? t(v.titleDescription) : undefined,
      titleTooltip: v.titleTooltip ? t(v.titleTooltip) : undefined,
      singleViewPaneContainerTitle: v.singleViewPaneContainerTitle ? t(v.singleViewPaneContainerTitle) : undefined,
      minHeight: v.minHeight,
      // E5.8#36.6：titleActions 声明透传——侧栏 header 右侧动作区（#36.5 同声明，两处消费）
      titleActions: v.titleActions,
    };
  });
}

/**
 * E5.7#63.7：从 ViewContainerService 构建底部面板 PanelViewMeta[]。
 * location:"panel" 的全部容器 → getActiveViews 展平（getViewContainers 已按容器 order 排序，
 * getActiveViews 按 view order 排序——两级排序对齐 VS Code panel 语义）。
 * renderPath 与侧栏同源（loader _renderPath）——池 PluginComponent 按此 key 动态 import。
 * 🔥 E5.8#37.9：title 壳 t() 解析后推送（显示文本铁律，同 buildSidebarViewMetas）。
 */
export function buildPanelViewMetas(t: (key: string) => string): PanelViewMeta[] {
  const metas: PanelViewMeta[] = [];
  for (const container of ViewContainerService.getViewContainers("panel")) {
    for (const v of ViewContainerService.getActiveViews(container.id)) {
      // E5.7#98：同 buildSidebarViewMetas——loader 附挂字段窄接口取型
      const desc = v as ViewDescriptor & { _pluginId?: string; _renderPath?: string };
      metas.push({
        id: v.id,
        title: t(v.title),
        pluginId: desc._pluginId ?? "",
        renderPath: desc._renderPath ?? "",
        // E5.8#36.5：titleActions 声明透传——PanelZone 标签栏右侧动作区（无声明 → 右侧空白）
        titleActions: v.titleActions,
      });
    }
  }
  return metas;
}

/**
 * E5.8#34：构建容器切换器下拉 DTO——按容器分组列**全部**视图（含隐藏，mockup 帧 2）。
 * 数据源 = ViewContainerService（#63.7 同源，零新注册面）：getViews 含隐藏 + isVisible 标记勾选 +
 * activeViewId 标记激活。显示文本铁律：title/containerTitle 壳 t() 解析后推送，池零自产文本。
 * 空容器（无注册视图）跳过——下拉只列有内容的容器。
 */
export function buildPanelSwitcherGroups(
  t: (key: string) => string,
  activeViewId: string
): PanelSwitcherGroup[] {
  const groups: PanelSwitcherGroup[] = [];
  for (const container of ViewContainerService.getViewContainers("panel")) {
    const views = ViewContainerService.getViews(container.id);
    if (views.length === 0) continue;
    const desc = (v: ViewDescriptor) => v as ViewDescriptor & { _pluginId?: string };
    groups.push({
      containerId: container.id,
      containerTitle: t(container.title),
      items: views.map((v) => ({
        viewId: v.id,
        title: t(v.title),
        pluginId: desc(v)._pluginId ?? "",
        visible: ViewContainerService.isVisible(container.id, v.id),
        active: v.id === activeViewId,
      })),
    });
  }
  return groups;
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
