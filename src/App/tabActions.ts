/**
 * App 标签页动作 hook——useTabActions：图标直开 + TabActions 桥接 + 恢复。
 * E5.8#0d.10-3g：自 App.tsx 拆出——icon:selected tabOnly 插件直开标签页（E5#5b）+
 * TabActions 桥（tab:create/openOrFocus/focus/close/focusBySourceId——updateLabelBySourceId/closeBySourceId
 * 于 E5.8#46.2 移出（改走 windowHost 全窗广播，壳侧唯一订阅点））
 * + mount 时恢复上次保存的标签页/面板布局（ready 守卫）。
 * 依赖方向：tabActions → pluginLoader/viewRegistry + shellEvents + core/services/layout + useTabManager；
 * App 消费：useTabActions({ ready, createTab, openOrFocusTab, focusTab, closeTab, ...setPanelActiveViewId })。无反向依赖。
 */

import { useEffect } from "react";
import { getViewPlugin } from "../pluginLoader/viewRegistry";
import { shellEvents } from "../core/react/events/ShellEvents";
import { getTabLayout, getPanelLayout, getSidebarLayout } from "../core/services/layout/LayoutService";
import { layoutEngine } from "../core/services/layout/LayoutEngine";
import { syncCountersAfterRestore, type LayoutData } from "../hooks/useTabManager";
import type { CreateTabOptions } from "../core/api/types";

export interface TabActionsDeps {
  ready: boolean;
  createTab: (type: string, opts?: CreateTabOptions) => string;
  openOrFocusTab: (type: string, opts?: CreateTabOptions) => string | null;
  focusTab: (tabId: string) => void;
  closeTab: (tabId: string) => Promise<unknown>;
  /** E5.8#46.12：sourceWindowId = 信封来源窗章——脱出窗 focusBySourceId 落到该窗注册表，主窗/未注走主路径。
   *  E5.8#46.2：updateLabel/close 已移出（windowHost 全窗广播）——本 deps 仅 focus 单发路由。 */
  focusTabBySourceId: (sourceId: string, sourceWindowId?: string) => void;
  restoreLayout: (saved: LayoutData) => { pluginId: string; tabId: string } | null;
  setPanelActiveViewId: (v: string | null) => void;
}

/** 标签页动作订阅 + 启动恢复——四个独立 effect。setPanelActiveViewId 是 useState 稳定 setter（deps 恒不变） */
export function useTabActions({
  ready,
  createTab,
  openOrFocusTab,
  focusTab,
  closeTab,
  focusTabBySourceId,
  restoreLayout,
  setPanelActiveViewId,
}: TabActionsDeps): void {
  // E5#5b：订阅 icon:selected——tabOnly 插件直接开标签页（不再经 App 中转）
  useEffect(() => {
    const unsub = shellEvents.on("icon:selected", (pluginId) => {
      const plugin = getViewPlugin(pluginId);
      if (plugin?.manifest.appearsIn?.tabBar && !plugin?.manifest.appearsIn?.sidePanel) {
        const tabId = createTab(pluginId);
        // E5.6 fix：icon:selected 直开标签页也不会触发 tab:focused → activeEditor 不更新
        if (tabId) shellEvents.emit("tab:focused", { pluginId, tabId });
      }
    });
    return unsub;
  }, [createTab]);

  // E5#5e-ii-f：TabActions 桥接——ShellEvents → useTabManager
  useEffect(() => {
    // E5.6 fix：tab:create / tab:openOrFocus 后也 emit tab:focused。
    // 池自动激活的新标签页不会触发 pool→focusTab IPC（那是用户点击才发的），
    // 导致 activeEditor context key 永远不更新 → when:"activeEditor == 'xxx'" 过滤掉所有菜单项。
    const u1 = shellEvents.on("tab:create", ({ type, opts }) => {
      // E5.7#98：wire 载荷 opts 是 Record<string, unknown>——窄化为 CreateTabOptions 契约（全可选字段）
      const tabId = createTab(type, opts as CreateTabOptions | undefined);
      if (tabId) shellEvents.emit("tab:focused", { pluginId: type, tabId });
    });
    const u2 = shellEvents.on("tab:openOrFocus", ({ type, opts }) => {
      const tabId = openOrFocusTab(type, opts as CreateTabOptions | undefined);
      if (tabId) shellEvents.emit("tab:focused", { pluginId: type, tabId });
    });
    const u3 = shellEvents.on("tab:focus", ({ tabId }) => focusTab(tabId));
    const u4 = shellEvents.on("tab:close", ({ tabId }) => closeTab(tabId));
    // E5.8#46.12/46.2：sourceWindowId 透传——focusBySourceId 按窗单发路由（聚焦到具体某窗）；
    // updateLabel/close 已于 #46.2 改走 windowHost 全窗广播（壳侧唯一订阅点），此处不再订阅（防双处理）
    const u5 = shellEvents.on("tab:focusBySourceId", ({ sourceId, sourceWindowId }) => focusTabBySourceId(sourceId, sourceWindowId));
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, [createTab, openOrFocusTab, focusTab, closeTab, focusTabBySourceId]);

  // E5#7h3：mount 时恢复上次保存的标签页布局——ready 守卫：
  // 原 MainContent 在 ready 门控的 JSX 内 mount（initAll 完成后才挂载）；
  // 迁入 App 后此 effect 首轮 mount 就跑，必须等 LayoutService 初始化完成（ready=true）。
  useEffect(() => {
    if (!ready) return;
    try {
      const savedLayout = getTabLayout();
      if (savedLayout?.groups?.length > 0) {
        // E5.7 Bug D：恢复后 emit tab:focused——否则重启后 activeEditor 为 null，
        // when:"activeEditor == ..." 过滤会杀掉右键菜单 + 命令面板（关闭重开标签页才恢复）。
        // 直接用 restoreLayout 返回值（eager）——此刻 setTabState 未提交，不能读 tabState（Bug A 教训）。
        const focused = restoreLayout(savedLayout);
        if (focused) {
          shellEvents.emit("tab:focused", focused);
        }
        const all = savedLayout.groups.flatMap((g: { tabs: { id: string; type: string }[] }) => g.tabs);
        syncCountersAfterRestore(all);
      }
    } catch { /* 恢复失败不影响启动 */ }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // E5.7#63.7：mount 时恢复面板布局状态——高度直设 LayoutEngine（resizeZoneHeight 钳制，防坏值越界；
  // onDidChangeLayout → usePoolSync 重推恢复后的高度），激活视图设 App state（usePoolSync 校验存在性后回退 views[0]）。
  // E5.8#36.9：+ 恢复面板位置/对齐/轴尺寸（dockTo/setAlign/resizeZone）+ 侧栏边（dockTo swap 联动 rightSidebar）。
  // 旧状态仅 height → edge/align 缺省 bottom/center（向后兼容）。ready 守卫同标签页恢复。
  useEffect(() => {
    if (!ready) return;
    try {
      // E5.8#36.9：侧栏边恢复——dockTo 附 swap 规则同步 rightSidebar 对边；旧布局无 sidebar → 不动（保持 left）
      const savedSidebar = getSidebarLayout();
      if (savedSidebar?.edge) {
        layoutEngine.dockTo("sidebar", savedSidebar.edge);
      }

      const savedPanel = getPanelLayout();
      if (!savedPanel) return;
      // E5.8#36.9：位置/对齐——先 dockTo 再 setAlign（各自触发 recalc + onDidChangeLayout 重推）
      const edge = savedPanel.edge ?? "bottom";
      layoutEngine.dockTo("panel", edge);
      layoutEngine.setAlign("panel", savedPanel.align ?? "center");
      if (edge === "left" || edge === "right") {
        const w = savedPanel.width;
        if (typeof w === "number" && Number.isFinite(w)) {
          layoutEngine.resizeZone("panel", w);
        }
      } else {
        if (Number.isFinite(savedPanel.height)) {
          layoutEngine.resizeZoneHeight("panel", savedPanel.height);
        }
      }
      if (savedPanel.activeViewId) {
        setPanelActiveViewId(savedPanel.activeViewId);
      }
    } catch { /* 恢复失败不影响启动 */ }
  }, [ready, setPanelActiveViewId]);
}
