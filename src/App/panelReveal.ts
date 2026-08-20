/**
 * resolvePanelReveal + usePanelReveal——E5.8#34.5 linkdesk.panel.reveal 通用 API 壳侧宿主。
 * E5.8#0d.10-3 系列：App 副作用逻辑拆 src/App/ 子模块（聚合器门面模式）。本模块 = 面板视图聚焦。
 *
 * 数据流：插件调 window.linkdesk.panel.reveal(viewId) → preload-pool ipcRenderer.invoke(panel:reveal) →
 * 主进程 IpcBridge 代理 → 壳 IpcBridgeHandler/panel → shellEvents.emit("panel:reveal", { viewId }) → 本模块。
 *
 * 语义（I7-8）：面板隐藏 → 展开并切到该视图（Ctrl+J 同机制）；已显示 → 切换聚焦到该视图。
 * 声明寻址 = contributes.views location:"panel"（#63.7 同源，零新注册面）。无贡献插件时 no-op 不崩。
 * 隐藏视图自动恢复可见（#32 QuickPick 同款决策——选中隐藏视图恢复可见，落盘 hiddenViews）。
 * 持久化：setPanelVisible(true) + setPanelActiveViewId(viewId) 后由 useLayoutPersistence
 * （100ms 防抖 + beforeunload 同步含 visible）自动落盘——reveal 不自管持久化（同 Ctrl+J 最终一致）。
 */

import { useEffect } from "react";
import { ViewContainerService } from "../core/services/layout/ViewContainerService";
import { shellEvents } from "../core/react/events/ShellEvents";

export interface PanelRevealDeps {
  /** 面板展开——useState setter 稳定（来自 usePanelHost 暴露） */
  setPanelVisible: (v: boolean) => void;
  /** 面板激活视图切换——useState setter 稳定（App state） */
  setPanelActiveViewId: (v: string | null) => void;
}

/** 纯函数——声明寻址 + 隐藏视图恢复可见。返回 viewId 所在容器（null = 不在任何 panel 容器，无贡献 no-op）。
 *  可独立测试（panelReveal.test.ts）。 */
export function resolvePanelReveal(viewId: string): { containerId: string } | null {
  const containerId = ViewContainerService.getViewContainers("panel")
    .map((c) => c.id)
    .find((cid) => ViewContainerService.getViews(cid).some((v) => v.id === viewId));
  if (!containerId) return null;
  // 隐藏视图 → 自动恢复可见（setVisible 落盘 hiddenViews → onDidChangeActiveViews → usePoolSync 重推）
  if (!ViewContainerService.isVisible(containerId, viewId)) {
    ViewContainerService.setVisible(containerId, viewId, true);
  }
  return { containerId };
}

/** 订阅 panel:reveal——面板展开 + 切到该视图。注册一次（setters 均 useState 稳定，deps 恒不变） */
export function usePanelReveal({ setPanelVisible, setPanelActiveViewId }: PanelRevealDeps): void {
  useEffect(() => {
    return shellEvents.on("panel:reveal", ({ viewId }) => {
      // wire 兜底——非字符串 viewId 直接忽略（防坏值穿透）
      if (typeof viewId !== "string" || !viewId) return;
      // 无贡献插件（viewId 不在任何 panel 容器）→ no-op 不崩
      if (!resolvePanelReveal(viewId)) return;
      // 面板隐藏 → 展开；已显示 → 切换聚焦到该视图（usePoolSync 重推 activeViewId）
      setPanelVisible(true);
      setPanelActiveViewId(viewId);
    });
  }, [setPanelVisible, setPanelActiveViewId]);
}
