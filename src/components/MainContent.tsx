/**
 * MainContent — 主内容区。
 * Phase 3.x：递归分屏——树状 SplitPane 渲染 + 面板内毛玻璃（无越界）。
 * Phase 4 B33：tab pane 绝对定位平铺——所有标签页内容区平级渲染，
 *   跨组移动只改 CSS 位置，React 树永不变（对标 B22 面板平铺方案）。
 * E3a #29：新增 WebContentsView placeholder 管理——插件标签页切换时
 *   同步控制对应 WebView 的显隐和位置。
 */

import { createElement, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import type { ComponentType } from "react";
import { getAllLeafGroupIds } from "../hooks/splitTree";
import { useTabManager, allTabs } from "../hooks/useTabManager";
import { invokeBeforeCloseTab } from "../pluginLoader/viewRegistry";
import { updateCoreCallbacks, type CoreCallbacks } from "../core/commands/coreCommands";
import ErrorBoundary from "./shared/ErrorBoundary";
import WelcomeView from "./views/WelcomeView";
import PluginDetailView from "./views/PluginDetailView";
import OutputPanel from "./views/OutputPanel"; // E3f #54
import { getViewPlugin } from "../pluginLoader/viewRegistry";
import { FALLBACK_PLUGIN_ID } from "../utils/fallbackPluginId";
import { isShellRenderedTab } from "../hooks/tabIdentity";
// E5.6#9a：Pool 布局同步——替代 useWebViewSync
import { usePoolSync } from "../hooks/usePoolSync";
// E5#5a：壳内通信——订阅/emit 事件，逐步替代 App.tsx props
import { shellEvents } from "../core/react/ShellEvents";
// E5#5e-ii-d：布局持久化——MainContent 拥有 tabState，自己负责保存和恢复
import { getTabLayout, saveTabLayout, syncWriteLayout, type WorkspaceLayout } from "../core/services/LayoutService";
import { syncWriteWorkspaceFolders } from "../core/services/WorkspaceService"; // E5.5#0e
import { syncCountersAfterRestore } from "../hooks/useTabManager";
import "./MainContent.css";

interface MainContentProps {
  editorAreaRef?: React.RefObject<HTMLDivElement | null>;
  /** E5.6#9d：侧栏当前容器 ID——null = 无活动侧栏视图 */
  sidebarView?: string | null;
  /** E5.6#9d：侧栏是否展开（未折叠） */
  isSidebarVisible?: boolean;
  /** E5.6#9d：侧栏当前宽度（px） */
  sidebarWidth?: number;
}

// E5#5f：壳内视图注册表——加新壳视图只加一行，不 switch
const SHELL_VIEWS: Record<string, ComponentType<any>> = {
  "plugin-detail": PluginDetailView,
  "output": OutputPanel,
};
// FALLBACK_PLUGIN_ID 是运行时值，不能放 Record key 字面量
SHELL_VIEWS[FALLBACK_PLUGIN_ID] = WelcomeView;

// E5#10：WebView 就绪插件白名单——只有确认 WebView 可独立工作的插件才关停 React fallback。
//
// 🔥 新 AI 必读：这个白名单是过渡方案，不是硬编码终点。
//   每个插件的 WebView 独立改造完成后，把 pluginId 加入此 Set。
//   全部加入后可删除白名单，关停逻辑退化为双条件。
//
// 判断标准：插件在 WebView 中能否接收壳指令（打开文件/切换会话等），不依赖 React props。
// 改造模式：插件 index.tsx 注册 linkdesk.events.on(...) → 壳通过 ShellEvents emit →
//   bridge:pushToPlugin IPC → 插件 WebView 接收。
//
// 详见 docs/02-Electron架构/E5_核心归一化与壳重构_待执行/
//   01-壳通信骨架/React-Fallback退役.md §六
//   05-执行清单.md E5#11f–#11l
// E5#11l：白名单已删——所有视图插件 WebView 独立就绪
// const WEBVIEW_READY_PLUGINS = new Set([...]);

function renderTabContent(
  tab: { id: string; type: string; pluginId?: string; detailPluginId?: string; workspaceName?: string; filePath?: string; sourceId?: string },
  isActive: boolean,
  createTab?: (type: string, opts?: import("../core/api/types").CreateTabOptions) => string,
  // E5.6#2：Pool 模型——readyWebViewIds/webViewBoundsReady 不再需要，插件走 ShellPluginComponent 渲染
) {
  // 壳自身的视图——不走插件路由
  // E2a #2：壳视图也包 ErrorBoundary——欢迎页/插件详情崩了有兜底
  if (isShellRenderedTab(tab.type)) {
    // E5#5f：查表替代 switch——加新壳视图只加 SHELL_VIEWS 一行
    const View = SHELL_VIEWS[tab.type];
    if (View) {
      return (
        <ErrorBoundary pluginId={tab.detailPluginId ?? tab.type}>
          {createElement(View, {
            key: tab.id,
            isActive,
            pluginId: tab.detailPluginId,
            createTab,
            initialChannelId: tab.sourceId,
          })}
        </ErrorBoundary>
      );
    }
  }

  // E5.6#14a：MainPool 迁移——插件由 MainPool WebContentsView 独立渲染，壳 DOM 不渲染内容
  if (tab.pluginId) {
    return null;
  }

  // 通用不可用占位——插件未安装/已卸载/已禁用
  return (
    <div key={tab.id} className="plugin-missing-view">
      <p>{tab.pluginId ? i18n.t('插件 "{{id}}" 不可用', { id: tab.pluginId }) : i18n.t("未知视图类型")}</p>
    </div>
  );
}

function MainContent({
  editorAreaRef: _editorAreaRef,
  sidebarView = null,
  isSidebarVisible = false,
  sidebarWidth = 0,
}: MainContentProps) {
  // E5#5e-ii-e：useTabManager 搬到 MainContent——不再通过 App props 中转
  // E5.6#16.5：dropZone/拖拽分屏由 MainPool GroupTabBar + MainRenderer 内部处理——壳不再需要
  const {
    tabState,
    focusTab,
    closeTab,
    forceCloseTab,
    createTab,
    moveTab,
    splitTab,
    splitTabAt,
    duplicateTab: _duplicateTab,
    unsplit,
    updateSplitSizes,
    reorderTab,
    pinTab,
    openOrFocusTab,
    restoreLayout,
    focusTabBySourceId,
    closeTabBySourceId,
    updateTabLabelBySourceId,
    restoreClosedTab,
  } = useTabManager();

  // E5.6#16.5：拖拽分屏/分屏 drop zone 由 MainPool 内部处理——壳不再需要。

  // ═══════════════════════════════════════════════════════
  // E5.6#16.5：壳特殊视图 overlay——检测当前活跃标签页是否为壳渲染类型
  // ═══════════════════════════════════════════════════════

  // 从 tabState 推导当前活跃的 tab（用于判断是否显示壳视图 overlay）
  const activeTab = useMemo(() => {
    const activeGroup = tabState.groups.find((g) => g.id === tabState.activeGroupId);
    return activeGroup?.tabs.find((t) => t.id === activeGroup.activeTabId) ?? null;
  }, [tabState.groups, tabState.activeGroupId]);

  // E5.6#16.5：当前活跃 tab 是否为壳渲染类型——需要壳 overlay 渲染内容
  const showShellOverlay = activeTab != null && isShellRenderedTab(activeTab.type);

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
      const tabId = createTab(type, opts as any);
      if (tabId) shellEvents.emit("tab:focused", { pluginId: type, tabId });
    });
    const u2 = shellEvents.on("tab:openOrFocus", ({ type, opts }) => {
      const tabId = openOrFocusTab(type, opts as any);
      if (tabId) shellEvents.emit("tab:focused", { pluginId: type, tabId });
    });
    const u3 = shellEvents.on("tab:focus", ({ tabId }) => focusTab(tabId));
    const u4 = shellEvents.on("tab:close", ({ tabId }) => closeTab(tabId));
    const u5 = shellEvents.on("tab:focusBySourceId", ({ sourceId }) => focusTabBySourceId(sourceId));
    const u6 = shellEvents.on("tab:updateLabelBySourceId", ({ sourceId, label }) => updateTabLabelBySourceId(sourceId, label));
    const u7 = shellEvents.on("tab:closeBySourceId", ({ sourceId }) => closeTabBySourceId(sourceId));
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); };
  }, [createTab, openOrFocusTab, focusTab, closeTab, focusTabBySourceId, updateTabLabelBySourceId, closeTabBySourceId]);

  // E5#7h3：mount 时恢复上次保存的标签页布局
  useEffect(() => {
    try {
      const savedLayout = getTabLayout();
      if (savedLayout?.groups?.length > 0) {
        restoreLayout(savedLayout);
        const all = savedLayout.groups.flatMap((g: { tabs: { id: string; type: string }[] }) => g.tabs);
        syncCountersAfterRestore(all);
      }
    } catch { /* 恢复失败不影响启动 */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // E5#5c：包装 focusTab——emit tab:focused 通知 StatusBar
  const handleFocusTab = useCallback((tabId: string) => {
    focusTab(tabId);
    for (const g of tabState.groups) {
      const tab = g.tabs.find((t) => t.id === tabId);
      if (tab) {
        shellEvents.emit("tab:focused", { pluginId: tab.pluginId || tab.type, tabId });
        break;
      }
    }
  }, [focusTab, tabState.groups]);

  // E5#5e-ii-f：核心回调——注册到 coreCommands，壳快捷键（Ctrl+W/Ctrl+Tab 等）走这里
  const { t } = useTranslation();
  const coreCallbacks: CoreCallbacks = useMemo(() => ({
    closeTab,
    closeOtherTabs: (groupId, exceptTabId) => {
      const g = tabState.groups.find((g) => g.id === groupId);
      if (g) g.tabs.filter((t) => t.id !== exceptTabId).forEach((t) => closeTab(t.id));
    },
    closeRightTabs: (groupId, tabIndex) => {
      const g = tabState.groups.find((g) => g.id === groupId);
      if (g) g.tabs.slice(tabIndex + 1).forEach((t) => closeTab(t.id));
    },
    splitTab,
    findGroupByTabId: (tabId) => {
      for (const g of tabState.groups) {
        const found = g.tabs.find((t) => t.id === tabId);
        if (found) return { groupId: g.id, tabs: g.tabs.map((t) => ({ id: t.id })) };
      }
      return null;
    },
    openTab: (pluginId) => openOrFocusTab(pluginId, { pinned: true })!,
    closeActiveTab: async () => {
      const group = tabState.groups.find((g) => g.id === tabState.activeGroupId);
      const tab = group?.tabs.find((t) => t.id === group.activeTabId);
      if (!tab) return;
      if (tab.pluginId && !await invokeBeforeCloseTab(tab.pluginId)) return;
      await closeTab(tab.id);
    },
    focusNextTab: (shift) => {
      const activeGroup = tabState.groups.find((g) => g.id === tabState.activeGroupId);
      if (!activeGroup) return;
      const { tabs } = activeGroup;
      const idx = tabs.findIndex((t) => t.id === activeGroup.activeTabId);
      if (idx === -1) return;
      const next = shift ? idx - 1 : idx + 1;
      handleFocusTab(tabs[(next + tabs.length) % tabs.length].id);
    },
    toggleSplit: () => {
      const isSplit = tabState.root.type === "branch" || getAllLeafGroupIds(tabState.root).length > 1;
      if (isSplit) {
        unsplit(tabState.activeGroupId);
      } else {
        const activeGroup = tabState.groups.find((g) => g.id === tabState.activeGroupId);
        if (activeGroup && activeGroup.tabs.length > 1) {
          const idx = activeGroup.tabs.findIndex((t) => t.id === activeGroup.activeTabId);
          splitTab(activeGroup.tabs[(idx + 1) % activeGroup.tabs.length].id, "horizontal");
        }
      }
    },
    focusNthTab: (n) => {
      const all = allTabs(tabState);
      if (n >= 1 && n <= all.length) handleFocusTab(all[n - 1].id);
    },
    closeAllEditors: () => {
      for (const g of tabState.groups) {
        for (const t of g.tabs) {
          if (t.filePath) closeTab(t.id);
        }
      }
    },
    reopenClosedTab: () => restoreClosedTab(),
    // E5.6#16.7k：池 GroupTabBar ContextMenu 归一化——补三个 CoreCallback
    closeAllTabs: (groupId) => {
      const g = tabState.groups.find((x) => x.id === groupId);
      if (g) for (const t of [...g.tabs]) closeTab(t.id);
    },
    duplicateTab: (tabId) => _duplicateTab(tabId),
    pinTab: (tabId) => pinTab(tabId),
  }), [closeTab, forceCloseTab, splitTab, tabState, handleFocusTab, unsplit, openOrFocusTab, restoreClosedTab, t, _duplicateTab, pinTab]);
  updateCoreCallbacks(coreCallbacks);

  // E5.6#16.5：MainPool tab 操作→壳 useTabManager。
  // 池 GroupTabBar 通过 pool.tabAction() → IPC → 此 handler → tabState 更新 → pushLayout 回环。
  const handleTabAction = useCallback((action: any) => {
    switch (action?.action) {
      case "focusTab":
        handleFocusTab(action.tabId);
        break;
      case "closeTab":
        closeTab(action.tabId);
        break;
      case "closeOtherTabs": {
        // 关闭同 group 内除指定 tab 外的所有 tab
        const g = tabState.groups.find((x) => x.id === action.groupId);
        if (g) {
          for (const t of g.tabs) {
            if (t.id !== action.tabId) closeTab(t.id);
          }
        }
        break;
      }
      case "closeTabsToRight": {
        // 关闭同 group 内指定 tab 右侧的所有 tab
        const g = tabState.groups.find((x) => x.id === action.groupId);
        if (g) {
          const idx = g.tabs.findIndex((t) => t.id === action.tabId);
          if (idx >= 0) {
            for (let i = g.tabs.length - 1; i > idx; i--) {
              closeTab(g.tabs[i].id);
            }
          }
        }
        break;
      }
      case "closeAllTabs": {
        // 关闭指定 group 的所有 tab
        const g = tabState.groups.find((x) => x.id === action.groupId);
        if (g) {
          for (const t of [...g.tabs]) {
            closeTab(t.id);
          }
        }
        break;
      }
      case "reorderTab":
        reorderTab(action.tabId, action.newIndex);
        break;
      case "moveTab":
        moveTab(action.tabId, action.targetGroupId);
        break;
      case "splitTab":
        // E5.6#16.7j-3：splitTabAt 无 solo guard + 支持 zone 精确定位——修复分屏后无法改方向 (d)
        // E5.6#16.7k-2：direction 归一化——右键菜单传 "right"/"down"，拖拽传 zone/horizontal/vertical
        splitTabAt(
          action.tabId,
          action.direction === "vertical" || action.direction === "down" || action.direction === "up"
            ? "vertical"
            : "horizontal",
          action.targetGroupId,
          action.zone ?? (action.direction === "left" || action.direction === "right" || action.direction === "up" || action.direction === "down" ? action.direction : undefined),
        );
        break;
      case "duplicateTab":
        _duplicateTab(action.tabId);
        break;
      case "pinTab":
        pinTab(action.tabId);
        break;
      case "createTab":
        createTab(action.pluginId ?? FALLBACK_PLUGIN_ID, { groupId: action.groupId } as any);
        break;
      // E5.6#16：分隔线拖拽结束（#16.5 后从 pool.sidebarAction 迁到 pool.tabAction）
      case "updateSplitSizes":
        updateSplitSizes(action.anchorGroupId, action.sizes as [number, number], action.branchIndex);
        break;
    }
  }, [focusTab, closeTab, tabState.groups, reorderTab, moveTab, splitTab, splitTabAt, _duplicateTab, pinTab, createTab, updateSplitSizes, handleFocusTab]);

  // E5.6#9a：Pool 布局同步——tabState/sidebarView 变化 → 全量推送到双 Pool
  usePoolSync({ tabState, sidebarView: sidebarView ?? null, isSidebarVisible: isSidebarVisible ?? false, sidebarWidth: sidebarWidth ?? 0, onTabAction: handleTabAction });

  // E5.6#16.5：per-tab WebView 已废弃——多 WebView 同步/editor IPC/serial-monitor IPC/DialogService WebView 显隐
  // 均由 Pool 模型替代。壳不再管理 WebView 生命周期。

  // E5#5e-ii-d：布局持久化——MainContent 拥有 tabState，自己负责保存
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutInitialized = useRef(false);
  const tabStateRef = useRef(tabState);
  tabStateRef.current = tabState;

  // beforeunload——F5 刷新/关闭窗口时同步写入
  useEffect(() => {
    const onBeforeUnload = () => {
      try {
        const s = tabStateRef.current;
        const layout: WorkspaceLayout = {
          tabs: {
            groups: s.groups.map((g) => ({
              id: g.id,
              tabs: g.tabs.map((t) => ({
                id: t.id, type: t.type, label: t.label, dirty: t.dirty,
                workspaceName: t.workspaceName, filePath: t.filePath,
                pluginId: t.pluginId, detailPluginId: t.detailPluginId,
                sourceId: t.sourceId, pinned: t.pinned,
              })),
              activeTabId: g.activeTabId,
            })),
            activeGroupId: s.activeGroupId,
            root: s.root,
          },
          cards: [],
        };
        syncWriteLayout(layout);
        syncWriteWorkspaceFolders(); // E5.5#0e：退出/刷新时同步保存工作区文件夹列表
      } catch { /* 静默 */ }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // 100ms 防抖保存——标签页/分屏变更后自动持久化
  useEffect(() => {
    if (!layoutInitialized.current) {
      layoutInitialized.current = true;
      return;
    }
    const doSave = () => {
      saveTabLayout({
        groups: tabState.groups.map((g) => ({
          id: g.id,
          tabs: g.tabs.map((t) => ({
            id: t.id, type: t.type, label: t.label, dirty: t.dirty,
            workspaceName: t.workspaceName, filePath: t.filePath,
            pluginId: t.pluginId,
            detailPluginId: t.detailPluginId,
            sourceId: t.sourceId,
            pinned: t.pinned,
          })),
          activeTabId: g.activeTabId,
        })),
        activeGroupId: tabState.activeGroupId,
        root: tabState.root,
      }).catch((e) => { console.error("[MainContent] 保存标签页布局失败:", e); });
    };
    if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    layoutSaveTimer.current = setTimeout(doSave, 100);
    return () => {
      if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    };
  }, [tabState.groups, tabState.activeGroupId, tabState.root]);

  // E5.6#16.5：壳主区现在只做两件事——
  // 1. 提供 main-content div 作为 MainPool WebContentsView bounds 的锚点
  // 2. 渲染壳特殊视图 overlay（欢迎页/插件详情/输出面板）在 MainPool 上方
  return (
    <div className="main-content" style={{ position: "relative" }}>
      {/* MainPool WebContentsView 覆盖整个主区——壳不渲染任何 Path B DOM */}
      <div
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      />

      {/* E5.6#16.5 §11 策略B：壳特殊视图 overlay——当活跃 tab 是欢迎页/插件详情/输出面板时，
          壳渲染对应内容到 overlay 层，覆盖在 MainPool 上方。top: 35px 给 MainPool GroupTabBar 留空间。 */}
      {showShellOverlay && activeTab && (
        <div
          className="shell-view-overlay"
          style={{
            position: "absolute",
            top: 0, // E5.6#16.7：TabBar 迁入 MainPool，不再需要避让
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10,
            overflow: "hidden",
          }}
        >
          {renderTabContent(activeTab, true, createTab)}
        </div>
      )}
    </div>
  );
}

export default MainContent;
