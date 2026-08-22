/**
 * resolveFloatingPanelView + decideFloatingPanelReveal + useFloatingPanelReveal + buildDefaultFloatingPanelActions
 * —— E5.8#39.5 悬浮面板声明制通用 API 壳侧宿主。
 *
 * 数据流：插件调 window.linkdesk.panel.revealFloating(viewId) → preload-pool ipcRenderer.invoke(panel:reveal-floating)
 * → 主进程 IpcBridge 代理 → 壳 IpcBridgeHandler/panel → shellEvents.emit("panel:reveal-floating", { viewId }) → 本模块。
 *
 * 声明寻址 = ViewContainerService.getView 全局视图索引（contributes.views 已注册任意视图，不限 panel 容器——#39.5）。
 * loader 运行时附挂 _pluginId/_renderPath——壳据此构造 DTO 推池 PluginComponent 渲染（壳不持渲染器）。
 * 无贡献视图 → no-op 不崩（#39.5 验收：卸载声明插件后 Ctrl+, 不崩）。
 *
 * I8-2 身份开关键：无面板 → 开 / 同视图 → 关（toggle）/ 他面板 → 替换。决策 = 纯函数 decideFloatingPanelReveal 可测。
 * 通用默认动作 = open-in「在主窗口中打开」（I8-4 面板↔标签页互转）+ 最大化（I8-9 池本地 toggle）+ 关闭。
 * open-in 按内容插件「可开成标签页」（appearsIn.tabBar + entry，getTabCreatableViews）门控出现——settings/demo
 * 有 tab 形态才有，entryless 声明者天然无此按钮（打开动作无 tab 可落）；open-in 点击 → 池回传壳 settle
 * 'open-in' → 本 hook openTab 落当前活动 group 尾部（文件树打开落点规则同款，I8-4）。
 */

import { useEffect } from "react";
import { ViewContainerService } from "../core/services/layout/ViewContainerService";
import type { ViewDescriptor } from "../core/services/layout/ViewContainerService";
import { shellEvents } from "../core/react/events/ShellEvents";
import {
  pushPanel,
  closePanel,
  getCurrentFloatingPanelViewId,
  getCurrentFloatingPanelPluginId,
  refreshPanelText,
} from "../core/services/ui/FloatingPanelService";
import { getCallbacks } from "../core/commands/infra/CoreCallbacks";
import { getTabCreatableViews } from "../pluginLoader/viewRegistry";
import type { PoolFloatingPanelButton } from "../core/types/pool/poolFloatingPanel";
import i18n from "../i18n";

/** 声明寻址结果——壳构造 FloatingPanelOptions 推池所需的全部字段 */
export interface FloatingPanelResolveResult {
  viewId: string;
  pluginId: string;
  renderPath: string;
  title: string;
}

/** 声明寻址共享基元——全局视图索引（contributes.views 任意容器；loader 运行时附挂 _pluginId/_renderPath）。
 *  E5.8#41.16 复合寻址：调用方已知插件（壳侧路径 core.openSettings/标签页右键带 pluginId）→
 *  ViewContainerService.getView(pluginId, viewId) 复合键 O(1) 精确命中（两插件同名 viewId 并存不歧义）；
 *  未知插件（插件公开 API panel.revealFloating 契约只有 viewId）→ 裸声明扫描 getViewByViewId
 *  （唯一命中用 / 多命中 fail-loud / 零命中 no-op——#41.8 §4.1 §4.2）。
 *  null = 未注册 / 缺运行时附挂（声明未解析——#39.5 验收 no-op，防坏数据穿透）。 */
export function resolveFloatingPanelView(
  viewId: string,
  pluginId?: string,
): FloatingPanelResolveResult | null {
  const view = (
    pluginId
      ? ViewContainerService.getView(pluginId, viewId)
      : ViewContainerService.getViewByViewId(viewId)
  ) as
    | (ViewDescriptor & { _pluginId?: string; _renderPath?: string })
    | undefined;
  if (!view || !view._pluginId || !view._renderPath) return null;
  return {
    viewId,
    pluginId: view._pluginId,
    renderPath: view._renderPath,
    // 显示文本铁律（池零自产文本）：title 取视图声明 label 且壳侧 t() 解析（声明 = i18n key，
    // 同 sidebar-panel/panelCreatePicker 惯例——ViewDescriptor 存裸声明，DTO 构建时解析）。
    // 未声明 label 时降级为 pluginId（lang-defaults 同带 pluginId 键——"terminal":"终端" 先例）。
    title: i18n.t(view.title || view._pluginId),
  };
}

/** I8-2 身份开关键决策（纯函数可测）——noop = 未声明视图 / toggle-close = 同视图再点关 / open = 开或替换 */
export type FloatingPanelRevealDecision =
  | { action: "noop" }
  | { action: "toggle-close" }
  | { action: "open"; result: FloatingPanelResolveResult };

export function decideFloatingPanelReveal(
  viewId: string,
  currentViewId: string | null,
  pluginId?: string,
  currentPluginId?: string,
): FloatingPanelRevealDecision {
  const resolved = resolveFloatingPanelView(viewId, pluginId);
  if (!resolved) return { action: "noop" };
  // E5.8#41.16 复合身份开关键：viewId 相同 且（任一方不知插件 或 插件相同）→ 同面板 toggle-close。
  // 两设置套同名 viewId="settings" 并存：当前面板 = 内置、请求 = demo（pluginId 不同）→ 不同面板 → open 替换
  //（裸 viewId 裁决会误判同视图 → 关掉用户想看的 demo）。任一侧无 pluginId（历史路径）→ 退化为裸 viewId 裁决。
  const sameView =
    currentViewId === viewId &&
    (pluginId === undefined || currentPluginId === undefined || pluginId === currentPluginId);
  if (sameView) return { action: "toggle-close" };
  return { action: "open", result: resolved };
}

/**
 * 通用默认动作集——open-in（I8-4 面板↔标签页互转）+ 最大化（I8-9 池本地 toggle，两态图标/文案 DTO 携带）+ 关闭。
 * open-in 仅当内容插件可开成标签页（appearsIn.tabBar + entry）时出现——settings/demo 有 tab 形态才有，
 * entryless 声明者传 openInPluginId 或传非 tab 型插件 → 按钮不出现（打开动作无 tab 可落）。
 * 文案壳侧 t()（显示文本铁律）。顺序 = DTO 渲染序：open-in / maximize / close。
 */
export function buildDefaultFloatingPanelActions(openInPluginId?: string): PoolFloatingPanelButton[] {
  const actions: PoolFloatingPanelButton[] = [];
  const canOpenInTab =
    typeof openInPluginId === "string" &&
    getTabCreatableViews().some((v) => v.pluginId === openInPluginId);
  if (canOpenInTab) {
    actions.push({
      id: "open-in",
      label: i18n.t("在主窗口中打开"),
      icon: "open-in",
      expandOnHover: true, // mockup 帧 1：纯图标 hover 展开全文（open-in 专属形态）
    });
  }
  actions.push(
    {
      id: "maximize",
      label: i18n.t("最大化"),
      icon: "maximize",
      toggledIcon: "restore",
      toggledLabel: i18n.t("还原"),
    },
    { id: "close", label: i18n.t("关闭"), icon: "close" },
  );
  return actions;
}

/** 订阅 panel:reveal-floating——声明寻址 + I8-2 toggle + pushPanel。注册一次（事件驱动，deps 恒空） */
export function useFloatingPanelReveal(): void {
  useEffect(() => {
    return shellEvents.on("panel:reveal-floating", ({ viewId, pluginId: payloadPluginId }) => {
      // wire 兜底——非字符串 viewId 直接忽略（防坏值穿透）
      if (typeof viewId !== "string" || !viewId) return;
      // E5.8#41.16：载荷 pluginId（壳侧路径带）+ 当前面板复合键 → 复合身份开关键
      const decision = decideFloatingPanelReveal(
        viewId,
        getCurrentFloatingPanelViewId(),
        payloadPluginId,
        getCurrentFloatingPanelPluginId() ?? undefined,
      );
      if (decision.action === "noop") return; // 未声明视图 → no-op 不崩
      if (decision.action === "toggle-close") {
        closePanel();
        return;
      }
      const pluginId = decision.result.pluginId;
      // I8-4：「在主窗口中打开」——池回传 open-in → 面板已关（handleFloatingPanelAction 先推 close）→ 开成标签页
      // 落当前活动 group 尾部（openOrFocusTab 文件树打开落点规则同款）；其他 settle 原因（close/replaced/programmatic）零动作
      pushPanel({
        viewId: decision.result.viewId,
        title: decision.result.title,
        pluginId,
        renderPath: decision.result.renderPath,
        actions: buildDefaultFloatingPanelActions(pluginId),
      }).then((reason) => {
        if (reason === "open-in") getCallbacks()?.openTab(pluginId);
      });
    });
  }, []);

  // 语言切换文案重推（2026-08-22 用户点修③）——标题/动作由壳 t() 解析后推入 DTO，切换语言后
  // 面板标题栏不会自刷新（内容区会——插件视图自带 useTranslation）；此处重新声明寻址 + 重建动作 → refreshPanelText。
  // 单一订阅覆盖全部打开路径（core.openSettings 等命令都 emit panel:reveal-floating 走本 hook）。
  useEffect(() => {
    const onLangChanged = () => {
      const viewId = getCurrentFloatingPanelViewId();
      if (!viewId) return; // 面板未开 → no-op
      // E5.8#41.16：复合键重推——当前面板插件已知时按 (pluginId, viewId) 精确寻址（同名 viewId 并存不歧义）
      const resolved = resolveFloatingPanelView(viewId, getCurrentFloatingPanelPluginId() ?? undefined);
      if (!resolved) return; // 声明视图已被卸载（#39.5 no-op 纪律）——不重推
      refreshPanelText(resolved.title, buildDefaultFloatingPanelActions(resolved.pluginId));
    };
    i18n.on("languageChanged", onLangChanged);
    return () => {
      i18n.off("languageChanged", onLangChanged);
    };
  }, []);
}
