/**
 * movePanelViewToEditor + usePanelMoveToEditor——E5.8#35.5 linkdesk.panel.moveToEditor 通用 API 壳侧宿主。
 * E5.8#0d.10-3 系列：App 副作用逻辑拆 src/App/ 子模块（聚合器门面模式）。本模块 = 面板视图升级主区标签页。
 *
 * 数据流（插件 API 链）：插件调 window.linkdesk.panel.moveToEditor(viewId) → preload-pool
 * ipcRenderer.invoke(panel:moveToEditor) → 主进程 IpcBridge 代理 → 壳 IpcBridgeHandler/panel →
 * shellEvents.emit("panel:moveToEditor", { viewId }) → 本 hook → 纯函数。
 * 数据流（池右键菜单链）：PanelZone 面板视图 tab 右键「移至主区标签页」→ 池 ContextMenu 点击 →
 * lk().commands.executeCommand(core.movePanelViewToEditor, context) → 壳 CommandRegistry handler →
 * getCallbacks().movePanelViewToEditor(viewId) → 本纯函数。两链收敛同一 movePanelViewToEditor。
 *
 * 语义（I7-9）：面板视图升级为主区标签页——openTab 同路径（createTab + 面板内移除）。
 * 落点 = 当前活动 group 尾部（reduceCreateTab 默认行为，文件树规则同款）；
 * 与 #38「在主窗口中打开」（openTab + close）同一底层不重造。
 * 声明寻址 = resolvePanelView（#34.5 共享基元，零新注册面）。无贡献插件时 no-op 不崩。
 * 面板内移除 = ViewContainerService.setVisible(false)——落盘 hiddenViews（与 reveal 恢复可见对称）。
 */

import { useEffect } from "react";
import { ViewContainerService } from "../core/services/layout/ViewContainerService";
import { shellEvents } from "../core/react/events/ShellEvents";
import type { CreateTabOptions } from "../core/api/types";
import { resolvePanelView } from "./panelReveal";

/** 纯函数——面板视图升级主区标签页（createTab 活动 group 尾部 + 面板内移除）。
 *  可独立测试（panelMoveToEditor.test.ts）。viewId 无贡献 / 视图无归属插件 / 创建失败 → no-op 不崩。 */
export function movePanelViewToEditor(
  viewId: string,
  createTab: (type: string, opts?: CreateTabOptions) => string,
): void {
  // 声明寻址——不在任何 panel 容器 → 无贡献插件 no-op
  const found = resolvePanelView(viewId);
  if (!found) return;
  const { containerId, view } = found;
  // 视图无归属插件（loader 未附挂 _pluginId）→ 无法建标签页，no-op 不崩
  const pluginId = view._pluginId;
  if (!pluginId) return;
  // 升级 = createTab 活动 group 尾部（openTab 同路径；reduceCreateTab 默认落点）
  const tabId = createTab(pluginId, { sourceId: viewId, label: view.title });
  // 创建失败（理论不达）→ 保留面板视图，no-op
  if (!tabId) return;
  // 标签页已建 → 同步 activeEditor（pool createTab 同款 Bug A 教训——tab:focused 驱动 when 过滤）
  shellEvents.emit("tab:focused", { pluginId, tabId });
  // 面板内移除——setVisible(false) 落盘 hiddenViews（与 reveal 恢复可见对称）
  ViewContainerService.setVisible(containerId, viewId, false);
}

/** 订阅 panel:moveToEditor——插件 API 链入口。注册一次（createTab 引用稳定） */
export function usePanelMoveToEditor(deps: { createTab: (type: string, opts?: CreateTabOptions) => string }): void {
  useEffect(() => {
    return shellEvents.on("panel:moveToEditor", ({ viewId }) => {
      // wire 兜底——非字符串 viewId 直接忽略（防坏值穿透）
      if (typeof viewId !== "string" || !viewId) return;
      movePanelViewToEditor(viewId, deps.createTab);
    });
  }, [deps.createTab]);
}
