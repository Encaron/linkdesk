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
 * 通用默认动作 = 最大化（I8-9 池本地 toggle）+ 关闭——open-in（在主窗口中打开）是 #38 settings 语义
 * （settings 可开成标签页——面板↔标签页互转），不进通用默认。
 */

import { useEffect } from "react";
import { ViewContainerService } from "../core/services/layout/ViewContainerService";
import type { ViewDescriptor } from "../core/services/layout/ViewContainerService";
import { shellEvents } from "../core/react/events/ShellEvents";
import {
  pushPanel,
  closePanel,
  getCurrentFloatingPanelViewId,
} from "../core/services/ui/FloatingPanelService";
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
 *  null = 未注册 / 缺运行时附挂（声明未解析——#39.5 验收 no-op，防坏数据穿透）。 */
export function resolveFloatingPanelView(viewId: string): FloatingPanelResolveResult | null {
  const view = ViewContainerService.getView(viewId) as
    | (ViewDescriptor & { _pluginId?: string; _renderPath?: string })
    | undefined;
  if (!view || !view._pluginId || !view._renderPath) return null;
  return {
    viewId,
    pluginId: view._pluginId,
    renderPath: view._renderPath,
    // title 取视图声明 label——未声明时降级为 pluginId（壳产兜底，非池文本）
    title: view.title || view._pluginId,
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
): FloatingPanelRevealDecision {
  const resolved = resolveFloatingPanelView(viewId);
  if (!resolved) return { action: "noop" };
  if (currentViewId === viewId) return { action: "toggle-close" };
  return { action: "open", result: resolved };
}

/** 通用默认动作集——最大化（I8-9 池本地 toggle，两态图标/文案 DTO 携带）+ 关闭。文案壳侧 t()（显示文本铁律）。 */
export function buildDefaultFloatingPanelActions(): PoolFloatingPanelButton[] {
  return [
    {
      id: "maximize",
      label: i18n.t("最大化"),
      icon: "maximize",
      toggledIcon: "restore",
      toggledLabel: i18n.t("还原"),
    },
    { id: "close", label: i18n.t("关闭"), icon: "close" },
  ];
}

/** 订阅 panel:reveal-floating——声明寻址 + I8-2 toggle + pushPanel。注册一次（事件驱动，deps 恒空） */
export function useFloatingPanelReveal(): void {
  useEffect(() => {
    return shellEvents.on("panel:reveal-floating", ({ viewId }) => {
      // wire 兜底——非字符串 viewId 直接忽略（防坏值穿透）
      if (typeof viewId !== "string" || !viewId) return;
      const decision = decideFloatingPanelReveal(viewId, getCurrentFloatingPanelViewId());
      if (decision.action === "noop") return; // 未声明视图 → no-op 不崩
      if (decision.action === "toggle-close") {
        closePanel();
        return;
      }
      pushPanel({
        viewId: decision.result.viewId,
        title: decision.result.title,
        pluginId: decision.result.pluginId,
        renderPath: decision.result.renderPath,
        actions: buildDefaultFloatingPanelActions(),
      });
    });
  }, []);
}
