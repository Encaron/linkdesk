/**
 * App 标签页动作 hook——useTabActions：图标直开 + TabActions 桥接 + 恢复。
 * E5.8#0d.10-3g：自 App.tsx 拆出——icon:selected tabOnly 插件直开标签页（E5#5b）+
 * TabActions 桥（tab:create/openOrFocus/focus/close/focusBySourceId/updateLabelBySourceId/closeBySourceId）
 * + mount 时恢复上次保存的标签页/面板布局（ready 守卫）。
 * 依赖方向：tabActions → pluginLoader/viewRegistry + shellEvents + core/services/layout + useTabManager；
 * App 消费：useTabActions({ ready, createTab, openOrFocusTab, focusTab, closeTab, ...setPanelActiveViewId })。无反向依赖。
 */

import { useEffect } from "react";
import { getViewPlugin } from "../pluginLoader/viewRegistry";
import { shellEvents } from "../core/react/events/ShellEvents";
import { getTabLayout, getPanelLayout } from "../core/services/layout/LayoutService";
import { layoutEngine } from "../core/services/layout/LayoutEngine";
import { syncCountersAfterRestore, type LayoutData } from "../hooks/useTabManager";
import type { CreateTabOptions } from "../core/api/types";

export interface TabActionsDeps {
  ready: boolean;
  createTab: (type: string, opts?: CreateTabOptions) => string;
  openOrFocusTab: (type: string, opts?: CreateTabOptions) => string | null;
  focusTab: (tabId: string) => void;
  closeTab: (tabId: string) => Promise<unknown>;
  focusTabBySourceId: (sourceId: string) => void;
  updateTabLabelBySourceId: (sourceId: string, label: string) => void;
  closeTabBySourceId: (sourceId: string) => void;
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
  updateTabLabelBySourceId,
  closeTabBySourceId,
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
    const u5 = shellEvents.on("tab:focusBySourceId", ({ sourceId }) => focusTabBySourceId(sourceId));
    const u6 = shellEvents.on("tab:updateLabelBySourceId", ({ sourceId, label }) => updateTabLabelBySourceId(sourceId, label));
    const u7 = shellEvents.on("tab:closeBySourceId", ({ sourceId }) => closeTabBySourceId(sourceId));
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); };
  }, [createTab, openOrFocusTab, focusTab, closeTab, focusTabBySourceId, updateTabLabelBySourceId, closeTabBySourceId]);

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
  // ready 守卫同标签页恢复（LayoutService 初始化完成后才能读）。
  useEffect(() => {
    if (!ready) return;
    try {
      const savedPanel = getPanelLayout();
      if (!savedPanel) return;
      if (Number.isFinite(savedPanel.height)) {
        layoutEngine.resizeZoneHeight("panel", savedPanel.height);
      }
      if (savedPanel.activeViewId) {
        setPanelActiveViewId(savedPanel.activeViewId);
      }
    } catch { /* 恢复失败不影响启动 */ }
  }, [ready, setPanelActiveViewId]);
}
