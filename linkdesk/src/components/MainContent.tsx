/**
 * MainContent — 主内容区。
 * Phase 3.x：递归分屏——树状 SplitPane 渲染 + 面板内毛玻璃（无越界）。
 * Phase 4 B33：tab pane 绝对定位平铺——所有标签页内容区平级渲染，
 *   跨组移动只改 CSS 位置，React 树永不变（对标 B22 面板平铺方案）。
 * E3a #29：新增 WebContentsView placeholder 管理——插件标签页切换时
 *   同步控制对应 WebView 的显隐和位置。
 */

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import type { TabState, TabGroup, Tab } from "../hooks/useTabManager";
import type { DropZone } from "../hooks/tabDragTypes";
import { getAllLeafGroupIds } from "../hooks/splitTree";
import SplitPane from "./SplitPane";
import TabBar from "./TabBar";
import ErrorBoundary from "./shared/ErrorBoundary";
import WelcomeView from "./views/WelcomeView";
import PluginDetailView from "./views/PluginDetailView";
import OutputPanel from "./views/OutputPanel"; // E3f #54
import { getViewPlugin } from "../pluginLoader/viewRegistry";
import { FALLBACK_PLUGIN_ID } from "../utils/fallbackPluginId";
import { isShellRenderedTab } from "../hooks/tabIdentity";
// E5#5a：壳内通信——订阅/emit 事件，逐步替代 App.tsx props
import { shellEvents } from "../core/ShellEvents";
// E5#5f：壳内视图注册表——替代硬编码 switch，加新壳视图只加一行
import TabPanePositioner from "./TabPanePositioner";
import "./MainContent.css";

interface MainContentProps {
  tabState: TabState;
  onFocusTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (type: string, opts?: import("../core/types").CreateTabOptions) => string;
  onSplitTab: (tabId: string, direction?: "horizontal" | "vertical") => void;
  onMoveTab: (tabId: string, targetGroupId: string) => void;
  onReorderTab: (tabId: string, toIndex: number) => void;
  onPinTab?: (tabId: string) => void;
  onDropSplit: (tabId: string, zone: Exclude<DropZone, null | "center">, targetGroupId?: string) => void;
  onDropCopySplit?: (tabId: string, zone: Exclude<DropZone, null | "center">, targetGroupId?: string) => void;
  onSplitResize?: (anchorGroupId: string, sizes: [number, number], branchIndex?: number) => void;
  dropZone?: DropZone | null;
  dragDropTargetGroupId?: string | null;
  editorAreaRef?: React.RefObject<HTMLDivElement | null>;
  onDragDropZone?: (zone: DropZone | null, targetGroupId?: string) => void;
  isDragging?: boolean;
  onDraggingChange?: (v: boolean) => void;
}

// E5#5f：壳内视图注册表——加新壳视图只加一行，不 switch
const SHELL_VIEWS: Record<string, ComponentType<any>> = {
  "plugin-detail": PluginDetailView,
  "output": OutputPanel,
};
// FALLBACK_PLUGIN_ID 是运行时值，不能放 Record key 字面量
SHELL_VIEWS[FALLBACK_PLUGIN_ID] = WelcomeView;

function renderTabContent(
  tab: { id: string; type: string; pluginId?: string; detailPluginId?: string; workspaceName?: string; filePath?: string; sourceId?: string },
  isActive: boolean,
  onCreateTab?: (type: string, opts?: import("../core/types").CreateTabOptions) => string,
  readyWebViewIds?: Set<string>,
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
            onCreateTab,
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
    if (readyWebViewIds?.has(tab.pluginId)) {
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
  tabState,
  onFocusTab,
  onCloseTab,
  onCreateTab,
  onSplitTab,
  onMoveTab,
  onReorderTab,
  onPinTab,
  onDropSplit,
  onDropCopySplit,
  onSplitResize,
  dropZone,
  dragDropTargetGroupId,
  editorAreaRef,
  onDragDropZone,
  isDragging,
  onDraggingChange,
}: MainContentProps) {

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

  const pluginViewsRef = useRef<Map<string, { groupId: string; isFocused: boolean }>>(new Map());

  // 追踪有 WebView 注册的插件——避免无谓的 setVisible/setBounds IPC 调用
  const registeredViewIdsRef = useRef<Set<string>>(new Set());

  // E5#5b：订阅 icon:selected——tabOnly 插件直接开标签页（不再经 App 中转）
  useEffect(() => {
    const unsub = shellEvents.on("icon:selected", (pluginId) => {
      const plugin = getViewPlugin(pluginId);
      if (plugin?.manifest.viewRole === "tabOnly") {
        onCreateTab(pluginId);
      }
    });
    return unsub;
  }, [onCreateTab]);

  // E5#5e-ii-c：插件卸载时关闭其所有标签页。使用 onCloseTab prop——等 useTabManager 搬家后换 forceCloseTab
  useEffect(() => {
    const unsub = shellEvents.on("plugin:removed", ({ pluginId }) => {
      for (const g of tabState.groups) {
        for (const tab of g.tabs) {
          if (tab.pluginId === pluginId || tab.detailPluginId === pluginId) {
            onCloseTab(tab.id);
          }
        }
      }
    });
    return unsub;
  }, [tabState.groups, onCloseTab]);

  // E5#5c：包装 focusTab——emit tab:focused 通知 StatusBar
  const handleFocusTab = useCallback((tabId: string) => {
    onFocusTab(tabId);
    // 查找 tab 信息用于 emit
    for (const g of tabState.groups) {
      const tab = g.tabs.find((t) => t.id === tabId);
      if (tab) {
        shellEvents.emit("tab:focused", { pluginId: tab.pluginId || tab.type, tabId });
        break;
      }
    }
  }, [onFocusTab, tabState.groups]);

  // #58e 修复：只有 WebView 渲染完成（发 ready 信号）的插件才跳 React fallback
  const [readyWebViewIds, setReadyWebViewIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const pv = (window as any).linkdesk?.pluginViews;
    if (!pv?.onReady) return;
    return pv.onReady((pluginId: string) => {
      setReadyWebViewIds((prev) => {
        if (prev.has(pluginId)) return prev; // 幂等
        const next = new Set(prev);
        next.add(pluginId);
        return next;
      });
    });
  }, []);

  useEffect(() => {
    const pv = (window as any).linkdesk?.pluginViews;
    if (!pv) return;

    // 收集所有插件标签页的状态
    const currentStates = new Map<string, { groupId: string; isFocused: boolean }>();
    for (const g of tabState.groups) {
      for (const tab of g.tabs) {
        if (tab.pluginId && !isShellRenderedTab(tab.type)) {
          const isActiveInGroup = tab.id === g.activeTabId;
          currentStates.set(tab.pluginId, {
            groupId: g.id,
            isFocused: isActiveInGroup && g.id === tabState.activeGroupId,
          });
        }
      }
    }

    // 异步获取已注册的 WebView 列表，只对已注册的插件做 setVisible/setBounds
    pv.getAllIds?.()?.then((ids: string[]) => {
      const registeredSet = new Set(ids);
      registeredViewIdsRef.current = registeredSet;

      const prev = pluginViewsRef.current;
      for (const [pluginId, state] of currentStates) {
        if (!registeredSet.has(pluginId)) continue;
        const prevState = prev.get(pluginId);
        if (prevState?.isFocused !== state.isFocused) {
          pv.setVisible(pluginId, state.isFocused);
        }
      }

      for (const pluginId of prev.keys()) {
        if (!currentStates.has(pluginId) && registeredSet.has(pluginId)) {
          pv.setVisible(pluginId, false);
        }
      }

      // 只在有已注册 WebView 时才更新 bounds（避免无谓的 getBoundingClientRect 回流）
      if (ids.length > 0) {
        requestAnimationFrame(() => {
          for (const [pluginId, state] of currentStates) {
            if (state.isFocused && registeredSet.has(pluginId)) {
              const pool = document.querySelector(`[data-group-id="${state.groupId}"]`) as HTMLElement | null;
              if (pool) {
                const rect = pool.getBoundingClientRect();
                pv.setBounds(pluginId, {
                  x: Math.round(rect.x),
                  y: Math.round(rect.y),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                });
              }
            }
          }
        });
      }
    }).catch((err: unknown) => {
      console.warn('[MainContent] WebView 同步失败:', err);
    });

    pluginViewsRef.current = currentStates;
  }, [tabState.groups, tabState.activeGroupId]);

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
            onCloseTab={onCloseTab}
            onCreateTab={onCreateTab}
            onMoveTab={(tabId, targetGroupId?) => {
              if (targetGroupId && targetGroupId !== group.id) {
                onMoveTab(tabId, targetGroupId);
              } else if (!targetGroupId) {
                const allLeafIds = getAllLeafGroupIds(tabState.root);
                const otherGroupId = allLeafIds.find((id) => id !== group.id);
                if (otherGroupId) onMoveTab(tabId, otherGroupId);
              }
            }}
            onReorderTab={onReorderTab}
            onPinTab={onPinTab}
            onDropSplit={onDropSplit}
            onDropCopySplit={onDropCopySplit}
            editorAreaRef={editorAreaRef}
            dragDropZone={dropZone}
            onDragDropZone={onDragDropZone}
            isDragging={isDragging}
            onDraggingChange={onDraggingChange}
          />
          {/* 内容占位区——tab pane 通过绝对定位填充，不做子元素渲染 */}
          <div
            className="tab-content-pool"
            data-group-id={group.id}
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
     handleFocusTab, onCloseTab, onCreateTab, onSplitTab, onMoveTab, onReorderTab, onPinTab,
     onDropSplit, onDropCopySplit, editorAreaRef, onDragDropZone, isDragging, onDraggingChange]
  );

  return (
    <div className="main-content">
      <SplitPane
        node={tabState.root}
        groups={tabState.groups}
        renderGroup={renderGroup}
        onResize={onSplitResize}
      />
      {/* B33：所有 tab pane 平级渲染，绝对定位填入对应组的 tab-content-pool。
          移动标签页 → groupId 变 → 绝对定位更新 → React 树不变 → 零 unmount。 */}
      {flatPanes.map(({ tab, groupId, isVisible, isFocused }) => (
        <TabPanePositioner
          key={tab.id}
          groupId={groupId}
          isVisible={isVisible}
        >
          {renderTabContent(tab, isFocused, onCreateTab, readyWebViewIds)}
        </TabPanePositioner>
      ))}
    </div>
  );
}

export default MainContent;
