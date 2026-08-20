/**
 * showPanelCreatePicker——底部面板 [+] 新建视图选择器（E5.8#32）。
 * 生产方：池 PanelZone 头 [+] 按钮 emit panel:createView → 主进程 plugin:emit → 壳 plugin:push →
 * bridges.ts useUiBridges 桥接收 → 本函数 QuickPickService.show 推视图选择器。
 *
 * 数据源 = ViewContainerService 容器序 × 全量视图（getViews 含隐藏——非 getActiveViews）两级展平（#63.7 同源）。
 * 已激活项勾选标记（checked）；隐藏视图选中自动恢复可见（setVisible(true) → onDidChangeActiveViews → usePoolSync 重推）。
 * 仅 1 个贡献视图时列表长度 1 正常（无特判）。否决两级子页面（拍板 15）——显隐管理归 B 下拉。
 */

import type { ViewDescriptor } from "../core/services/layout/ViewContainerService";
import { ViewContainerService } from "../core/services/layout/ViewContainerService";
import { QuickPickService } from "../core/services/ui/QuickPickService";
import i18n from "../i18n";

interface PanelPickItem {
  viewId: string;
  containerId: string;
  title: string;
  pluginId: string;
  containerTitle: string;
  visible: boolean;
}

/** 面板 [+] 视图选择器——含已隐藏视图；选中隐藏视图自动恢复可见；已激活项勾选标记 */
export function showPanelCreatePicker(
  setPanelActiveViewId: (v: string | null) => void,
  activeViewIdRef: { current: string | null },
): void {
  const items: PanelPickItem[] = [];
  for (const container of ViewContainerService.getViewContainers("panel")) {
    for (const v of ViewContainerService.getViews(container.id)) {
      // E5.7#98：loader 附挂 _pluginId（registerView 契约外字段）——窄接口取型
      const desc = v as ViewDescriptor & { _pluginId?: string };
      items.push({
        viewId: v.id,
        containerId: container.id,
        title: v.title,
        pluginId: desc._pluginId ?? "",
        containerTitle: container.title,
        visible: ViewContainerService.isVisible(container.id, v.id),
      });
    }
  }

  QuickPickService.show<PanelPickItem>({
    mode: "custom",
    items,
    placeholder: i18n.t("选择要在面板显示的视图"),
    prefix: ">",
    getSearchText: (it) => `${it.title} ${it.pluginId}`,
    getKey: (it) => it.viewId,
    onSelect: (it) => {
      // 隐藏视图选中 → 自动恢复可见（setVisible → onDidChangeActiveViews → usePoolSync 重推面板 views）
      if (!it.visible) ViewContainerService.setVisible(it.containerId, it.viewId, true);
      setPanelActiveViewId(it.viewId);
    },
    onClose: () => QuickPickService.hide(),
    // 显示文本铁律——label/category 壳侧 t() 解析后推送（category = 插件 · 容器 / 已隐藏标注）
    serialize: (it) => ({
      key: it.viewId,
      searchText: `${it.title} ${it.pluginId}`,
      label: i18n.t(it.title),
      category: it.visible
        ? `${it.pluginId} · ${i18n.t(it.containerTitle)}`
        : i18n.t("已隐藏"),
      // 已激活项勾选标记——activeViewId 经 ref 读活值（QuickPick modal 打开期间激活视图不变，show 时快照即准）
      checked: it.viewId === activeViewIdRef.current,
    }),
  });
}
