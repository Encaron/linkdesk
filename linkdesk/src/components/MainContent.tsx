/**
 * MainContent — 主内容区。
 * Phase 3.x：递归分屏——树状 SplitPane 渲染 + 面板内毛玻璃（无越界）。
 * Phase 4 B33：tab pane 绝对定位平铺——所有标签页内容区平级渲染，
 *   跨组移动只改 CSS 位置，React 树永不变（对标 B22 面板平铺方案）。
 * E3a #29：新增 WebContentsView placeholder 管理——插件标签页切换时
 *   同步控制对应 WebView 的显隐和位置。
 */

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ComponentType } from "react";
import type { TabGroup, Tab } from "../hooks/useTabManager";
import { useTabManager, allTabs } from "../hooks/useTabManager";
import type { DropZone } from "../hooks/tabDragTypes";
import { getAllLeafGroupIds } from "../hooks/splitTree";
import { invokeBeforeCloseTab } from "../pluginLoader/viewRegistry";
import { updateCoreCallbacks, type CoreCallbacks } from "../core/builtin/coreCommands";
import SplitPane from "./SplitPane";
import TabBar from "./TabBar";
import ErrorBoundary from "./shared/ErrorBoundary";
import WelcomeView from "./views/WelcomeView";
import PluginDetailView from "./views/PluginDetailView";
import OutputPanel from "./views/OutputPanel"; // E3f #54
import { getViewPlugin } from "../pluginLoader/viewRegistry";
import { FALLBACK_PLUGIN_ID } from "../utils/fallbackPluginId";
import { isShellRenderedTab } from "../hooks/tabIdentity";
import { useWebViewSync } from "../hooks/useWebViewSync";
// E5#5a：壳内通信——订阅/emit 事件，逐步替代 App.tsx props
import { shellEvents } from "../core/react/ShellEvents";
// E5#5f：壳内视图注册表——替代硬编码 switch，加新壳视图只加一行
import TabPanePositioner from "./TabPanePositioner";
// E5#5e-ii-d：布局持久化——MainContent 拥有 tabState，自己负责保存和恢复
import { getTabLayout, saveTabLayout, syncWriteLayout, type WorkspaceLayout } from "../core/services/LayoutService";
import { syncCountersAfterRestore } from "../hooks/useTabManager";
import "./MainContent.css";

interface MainContentProps {
  editorAreaRef?: React.RefObject<HTMLDivElement | null>;
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
  readyWebViewIds?: Set<string>,
  webViewBoundsReady?: Set<string>,
  webViewTimeout?: Set<string>,
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

  // Phase 4.4：视图插件路由
  // E2a #3：pluginId 传入 ErrorBoundary——崩溃显示 "「终端」已崩溃 [重试]"
  // #58e 修复：WebView 渲染完成（发 ready 信号）后才跳 React 副本——
  // 空 <div> 占位 + WebView 覆盖。未 ready 时 React 继续渲染作安全网。
  if (tab.pluginId) {
    // E5#10c：超时兜底——已超时的插件永久回退 React，不再等 WebView
    if (webViewTimeout?.has(tab.pluginId)) {
      const plugin = getViewPlugin(tab.pluginId);
      if (plugin) {
        return (
          <ErrorBoundary pluginId={tab.pluginId}>
            <plugin.component key={tab.id} isActive={isActive} sourceId={tab.sourceId} />
          </ErrorBoundary>
        );
      }
    }
    // E5#11l：双条件——WebView JS ready + bounds IPC 确认 → 关 React fallback
    if (readyWebViewIds?.has(tab.pluginId) && webViewBoundsReady?.has(tab.pluginId)) {
      return <div key={tab.id} className="plugin-webview-placeholder" />;
    }
    const plugin = getViewPlugin(tab.pluginId);
    if (plugin) {
      return (
        <ErrorBoundary pluginId={tab.pluginId}>
          <plugin.component key={tab.id} isActive={isActive} sourceId={tab.sourceId} />
        </ErrorBoundary>
      );
    }
  }

  // 通用不可用占位——插件未安装/已卸载/已禁用
  return (
    <div key={tab.id} className="plugin-missing-view">
      <p>{tab.pluginId ? `插件 "${tab.pluginId}" 不可用` : "未知视图类型"}</p>
    </div>
  );
}

function MainContent({
  editorAreaRef,
}: MainContentProps) {
  // E5#5e-ii-f：拖拽分屏状态——从 App.tsx 搬进 MainContent
  const [dropZone, setDropZone] = useState<DropZone | null>(null);
  const [dragDropTargetGroupId, setDragDropTargetGroupId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // E5#5e-ii-e：useTabManager 搬到 MainContent——不再通过 App props 中转
  const {
    tabState,
    focusTab,
    closeTab,
    forceCloseTab,
    createTab,
    moveTab,
    splitTab,
    splitTabAt: _splitTabAt,
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

  // E5#5e-ii-f 恢复：拖拽分屏回调
  const handleDropSplit = useCallback(
    (tabId: string, zone: Exclude<DropZone, null | "center">, targetGroupId?: string) => {
      const direction = zone === "left" || zone === "right" ? "horizontal" : "vertical";
      _splitTabAt(tabId, direction, targetGroupId, zone);
      setDropZone(null);
      setDragDropTargetGroupId(null);
      setIsDragging(false);
    },
    [_splitTabAt],
  );

  const handleDropCopySplit = useCallback(
    (tabId: string, zone: Exclude<DropZone, null | "center">, targetGroupId?: string) => {
      const newId = _duplicateTab(tabId);
      if (newId) {
        const direction = zone === "left" || zone === "right" ? "horizontal" : "vertical";
        _splitTabAt(newId, direction, targetGroupId, zone);
      }
      setDropZone(null);
      setDragDropTargetGroupId(null);
      setIsDragging(false);
    },
    [_duplicateTab, _splitTabAt],
  );

  const handleDragDropZone = useCallback((zone: DropZone | null, targetGroupId?: string) => {
    setDropZone(zone);
    setDragDropTargetGroupId(targetGroupId ?? null);
  }, []);
  // B33：所有 tab pane 平级收集。React 树中顺序永不变，跨组移动只改 groupId。
  const flatPanes = useMemo(() => {
    const panes: Array<{ tab: Tab; groupId: string; isVisible: boolean; isFocused: boolean }> = [];
    for (const g of tabState.groups) {
      for (const tab of g.tabs) {
        const isActiveInGroup = tab.id === g.activeTabId;
        panes.push({
          tab,
          groupId: g.id,
          isVisible: isActiveInGroup,
          isFocused: isActiveInGroup && g.id === tabState.activeGroupId,
        });
      }
    }
    return panes;
  }, [tabState.groups, tabState.activeGroupId]);

  // ═══════════════════════════════════════════════════════
  // E3a #29：WebContentsView 显隐同步
  // 插件标签页切换 → 壳侧 sync → main process → WindowManager → WebView 显隐/位置
  // ═══════════════════════════════════════════════════════

  // E5#5b：订阅 icon:selected——tabOnly 插件直接开标签页（不再经 App 中转）
  useEffect(() => {
    const unsub = shellEvents.on("icon:selected", (pluginId) => {
      const plugin = getViewPlugin(pluginId);
      if (plugin?.manifest.appearsIn?.tabBar && !plugin?.manifest.appearsIn?.sidePanel) {
        createTab(pluginId);
      }
    });
    return unsub;
  }, [createTab]);


  // E5#5e-ii-f：TabActions 桥接——ShellEvents → useTabManager
  useEffect(() => {
    const u1 = shellEvents.on("tab:create", ({ type, opts }) => createTab(type, opts as any));
    const u2 = shellEvents.on("tab:openOrFocus", ({ type, opts }) => openOrFocusTab(type, opts as any));
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
  }), [closeTab, forceCloseTab, splitTab, tabState, handleFocusTab, unsplit, openOrFocusTab, restoreClosedTab, t]);
  updateCoreCallbacks(coreCallbacks);

  // E5#81：多 WebView 生命周期归一化——useWebViewSync hook 管理 ready/bounds/visible/timeout
  const pv = (window as any).linkdesk?.pluginViews as import("../hooks/useWebViewSync").PluginViewsAPI | undefined;
  const {
    readyWebViewIds,
    webViewBoundsReady,
    webViewTimeout,
    registerPoolRef,
    resetWebViewState,
  } = useWebViewSync(tabState, isShellRenderedTab, pv);

  // E5#5e-ii-c：插件卸载时清除 WebView 状态（标签页关闭由 useTabManager 集中处理 E5#54）
  useEffect(() => {
    const unsub = shellEvents.on("plugin:removed", ({ pluginId }) => {
      resetWebViewState(pluginId);
    });
    return unsub;
  }, [resetWebViewState]);

  // editor openFile IPC——编辑器独立 WebView 后，壳通过 IPC 告知文件路径（不依赖 React props）
  useEffect(() => {
    const bridge = (window as any).linkdesk?.bridge;
    if (!bridge) return;
    for (const g of tabState.groups) for (const t of g.tabs) {
      if (t.pluginId === "editor" && t.sourceId) {
        bridge.requestToPlugin?.("editor", "openFile", { filePath: t.sourceId }).catch(() => {});
      }
    }
  }, [tabState.groups, readyWebViewIds, webViewBoundsReady]);

  // E5#84e：serial-monitor openSession——只发当前聚焦 tab（共享 WebView，防覆盖）
  useEffect(() => {
    const bridge = (window as any).linkdesk?.bridge;
    if (!bridge) return;
    const activeGroup = tabState.groups.find(g => g.id === tabState.activeGroupId);
    const activeTab = activeGroup?.tabs.find(t => t.id === activeGroup.activeTabId);
    if (activeTab?.pluginId === "serial-monitor" && activeTab.sourceId) {
      bridge.requestToPlugin?.("serial-monitor", "openSession", { sourceId: activeTab.sourceId }).catch(() => {});
    }
  }, [tabState.groups, tabState.activeGroupId, tabState.groups.find(g => g.id === tabState.activeGroupId)?.activeTabId, readyWebViewIds, webViewBoundsReady]);

  // E5#84g：弹窗关闭后恢复 WebView 可见性——DialogService 弹窗前 hide 所有 WebView，
  //        弹窗后 emit dialog:visibility 通知此处恢复正确的可见性
  const dialogTabRef = useRef(tabState);
  dialogTabRef.current = tabState;
  useEffect(() => {
    const u1 = shellEvents.on("dialog:visibility", ({ open }) => {
      if (open || !pv) return; // 只处理 close——hide 已在 DialogService 直接做
      const ts = dialogTabRef.current;
      for (const g of ts.groups) {
        const activeTab = g.tabs.find((t) => t.id === g.activeTabId);
        if (activeTab?.pluginId && !isShellRenderedTab(activeTab.type)) {
          // 只恢复有活跃标签页且该组被聚焦的插件 WebView
          const isFocused = g.id === ts.activeGroupId;
          pv.setVisible(activeTab.pluginId, isFocused);
        }
      }
    });
    return () => { u1(); };
  }, [pv]);

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
      }).catch(() => {});
    };
    if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    layoutSaveTimer.current = setTimeout(doSave, 100);
    return () => {
      if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    };
  }, [tabState.groups, tabState.activeGroupId, tabState.root]);

  const renderGroup = useCallback(
    (group: TabGroup) => {
      const isTarget = dragDropTargetGroupId === group.id && dropZone;
      return (
        <div
          className={`tab-group-pane${group.id === tabState.activeGroupId ? " active" : ""}`}
          key={group.id}
          data-group-id={group.id}
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            position: "relative",
          }}
        >
          <TabBar
            group={group}
            isActiveGroup={group.id === tabState.activeGroupId}
            onFocusTab={handleFocusTab}
            onCloseTab={closeTab}
            onCreateTab={createTab}
            onMoveTab={(tabId, targetGroupId?) => {
              if (targetGroupId && targetGroupId !== group.id) {
                moveTab(tabId, targetGroupId);
              } else if (!targetGroupId) {
                const allLeafIds = getAllLeafGroupIds(tabState.root);
                const otherGroupId = allLeafIds.find((id) => id !== group.id);
                if (otherGroupId) moveTab(tabId, otherGroupId);
              }
            }}
            onReorderTab={reorderTab}
            onPinTab={pinTab}
            onDropSplit={handleDropSplit}
            onDropCopySplit={handleDropCopySplit}
            editorAreaRef={editorAreaRef}
            dragDropZone={dropZone}
            onDragDropZone={handleDragDropZone}
            isDragging={isDragging}
            onDraggingChange={setIsDragging}
          />
          {/* 内容占位区——tab pane 通过绝对定位填充，不做子元素渲染 */}
          <div
            className="tab-content-pool"
            data-group-id={group.id}
            ref={registerPoolRef(group.id)}
            style={{ flex: 1, position: "relative", overflow: "hidden" }}
          />
          {isTarget && (
            <div
              className={`drop-zone-overlay drop-zone-${dropZone}`}
              style={{ pointerEvents: "none" }}
            />
          )}
        </div>
      );
    },
    [tabState.root, tabState.activeGroupId, dropZone, dragDropTargetGroupId,
     handleFocusTab, closeTab, createTab, moveTab, reorderTab, pinTab,
     splitTab, editorAreaRef, isDragging, setIsDragging]
  );

  return (
    <div className="main-content">
      <SplitPane
        node={tabState.root}
        groups={tabState.groups}
        renderGroup={renderGroup}
        onResize={updateSplitSizes}
      />
      {/* B33：所有 tab pane 平级渲染，绝对定位填入对应组的 tab-content-pool。
          移动标签页 → groupId 变 → 绝对定位更新 → React 树不变 → 零 unmount。 */}
      {flatPanes.map(({ tab, groupId, isVisible, isFocused }) => (
        <TabPanePositioner
          key={tab.id}
          groupId={groupId}
          isVisible={isVisible}
        >
          {renderTabContent(tab, isFocused, createTab, readyWebViewIds, webViewBoundsReady, webViewTimeout)}
        </TabPanePositioner>
      ))}
    </div>
  );
}

export default MainContent;
