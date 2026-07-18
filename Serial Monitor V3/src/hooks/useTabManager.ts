/**
 * useTabManager — 标签页状态管理 hook。
 * Phase 3 Step 1：纯逻辑，不依赖 UI。可独立单测。
 *
 * 架构：所有状态转换为纯函数（导出），hook 只做薄封装。
 * 测试直接调纯函数，不需要 React 渲染。
 *
 * 设计依据：[V3-Phase3-标签页分屏设计.md §3]
 */

import { useState, useCallback, useRef } from "react";

/* ── 类型 ── */

export type TabType = "terminal" | "workspace" | "oled" | "settings";

export interface Tab {
  id: string;
  type: TabType;
  label: string;
  workspaceName?: string;
  dirty: boolean;
  closable: boolean;
}

export interface SplitLayout {
  direction: "horizontal" | "vertical";
  tabIds: [string, string];
  sizes: [number, number];
}

export interface TabState {
  tabs: Tab[];
  activeTabId: string;
  split: SplitLayout | null;
}

export interface CloseResult {
  closed: boolean;
  tabId: string;
  reason?: "blocked" | "dirty" | "unsplit";
  replacedActiveTabId?: string;
}

/* ── 默认值工厂 ── */

let _terminalCounter = 0;

/** 重置终端计数器——仅测试用 */
export function resetTerminalCounter(n = 0): void {
  _terminalCounter = n;
}

export function createTabDefaults(
  type: TabType,
  overrides?: Partial<Tab>
): Tab {
  const base: Tab = {
    id: "",
    type,
    label: getDefaultLabel(type, overrides?.workspaceName),
    workspaceName: overrides?.workspaceName,
    dirty: false,
    closable: true,
  };

  if (type === "terminal") {
    _terminalCounter++;
    base.id = `terminal-${_terminalCounter}`;
  } else if (type === "workspace" && base.workspaceName) {
    base.id = `workspace-${base.workspaceName}`;
  } else {
    base.id = type;
  }

  return { ...base, ...overrides, id: base.id };
}

export function getDefaultLabel(type: TabType, workspaceName?: string): string {
  switch (type) {
    case "terminal":   return "终端";
    case "workspace":  return workspaceName || "工作台";
    case "settings":   return "设置";
    case "oled":       return "OLED";
  }
}

/* ── 导出辅助纯函数（可单测） ── */

/** 重新计算所有标签页的 closable 字段 */
export function recomputeClosable(tabs: Tab[]): Tab[] {
  if (tabs.length === 1 && tabs[0].type === "terminal") {
    return tabs.map((t) => (t.id === tabs[0].id ? { ...t, closable: false } : t));
  }
  return tabs.map((t) => (t.closable === false ? { ...t, closable: true } : t));
}

/** 确保至少有一个终端标签页 */
export function ensureTerminal(tabs: Tab[]): { tabs: Tab[]; createdId: string | null } {
  if (tabs.length === 0 || !tabs.some((t) => t.type === "terminal")) {
    const terminal = createTabDefaults("terminal");
    return { tabs: [terminal, ...tabs], createdId: terminal.id };
  }
  return { tabs, createdId: null };
}

/** 关闭标签页后选新的 activeTabId */
export function pickNextActive(
  tabs: Tab[],
  closedId: string,
  replacedActiveTabId?: string
): string {
  if (replacedActiveTabId) return replacedActiveTabId;
  const closedIdx = tabs.findIndex((t) => t.id === closedId);
  if (closedIdx === -1) return tabs[0]?.id ?? "";
  const next = tabs[closedIdx + 1] || tabs[closedIdx - 1];
  return next?.id ?? "";
}

/* ── 初始状态工厂 ── */

export function createInitialTabState(overrides?: Partial<TabState>): TabState {
  const terminal = createTabDefaults("terminal");
  const tabs = recomputeClosable([terminal]);
  return { tabs, activeTabId: terminal.id, split: null, ...overrides };
}

/* ── 状态转换纯函数（导出供单测） ── */

export interface CreateTabResult {
  state: TabState;
  createdId: string;
}

/** 创建标签页——纯状态转换 */
export function reduceCreateTab(
  prev: TabState,
  type: TabType,
  workspaceName?: string
): CreateTabResult {
  // workspace 去重
  if (type === "workspace" && workspaceName) {
    const existing = prev.tabs.find(
      (t) => t.type === "workspace" && t.workspaceName === workspaceName
    );
    if (existing) {
      return { state: { ...prev, activeTabId: existing.id }, createdId: existing.id };
    }
  }

  // settings/oled 单例去重
  if ((type === "settings" || type === "oled") && prev.tabs.some((t) => t.type === type)) {
    const existing = prev.tabs.find((t) => t.type === type)!;
    return { state: { ...prev, activeTabId: existing.id }, createdId: existing.id };
  }

  const newTab = createTabDefaults(type, { workspaceName });

  if (prev.split) {
    const paneIdx = prev.split.tabIds.indexOf(prev.activeTabId);
    if (paneIdx === -1) {
      const newTabs = recomputeClosable([...prev.tabs, newTab]);
      return { state: { ...prev, tabs: newTabs, activeTabId: newTab.id }, createdId: newTab.id };
    }
    const newTabIds = [...prev.split.tabIds] as [string, string];
    newTabIds[paneIdx] = newTab.id;
    const newTabs = recomputeClosable([...prev.tabs, newTab]);
    return {
      state: { ...prev, tabs: newTabs, activeTabId: newTab.id, split: { ...prev.split, tabIds: newTabIds } },
      createdId: newTab.id,
    };
  }

  const newTabs = recomputeClosable([...prev.tabs, newTab]);
  return { state: { ...prev, tabs: newTabs, activeTabId: newTab.id }, createdId: newTab.id };
}

/** 聚焦最近活跃的某类标签页，或隐式创建。返回 null 表示不操作（如 workspace 无标签页时） */
export function reduceOpenOrFocus(
  prev: TabState,
  type: TabType,
  lastFocusedId?: string | null
): { state: TabState; focusedId: string | null } {
  const existing = prev.tabs.filter((t) => t.type === type);

  if (existing.length > 0) {
    const target = existing.find((t) => t.id === lastFocusedId) ?? existing[existing.length - 1];
    return { state: { ...prev, activeTabId: target.id }, focusedId: target.id };
  }

  // 隐式创建：terminal / settings
  if (type === "terminal" || type === "settings") {
    const newTab = createTabDefaults(type);
    const newTabs = recomputeClosable([...prev.tabs, newTab]);
    return {
      state: { ...prev, tabs: newTabs, activeTabId: newTab.id },
      focusedId: newTab.id,
    };
  }

  // workspace / oled：不创建
  return { state: prev, focusedId: null };
}

/** 聚焦指定标签页 */
export function reduceFocusTab(prev: TabState, tabId: string): TabState {
  if (!prev.tabs.some((t) => t.id === tabId)) return prev;
  return { ...prev, activeTabId: tabId };
}

export interface CloseTabResult {
  state: TabState;
  result: CloseResult;
}

/** 关闭标签页——纯状态转换。dirty 检查由调用方处理 */
export function reduceCloseTab(prev: TabState, tabId: string): CloseTabResult {
  const tab = prev.tabs.find((t) => t.id === tabId);
  if (!tab) {
    return { state: prev, result: { closed: false, tabId, reason: "blocked" } };
  }

  // 终端保底
  if (prev.tabs.length === 1 && tab.type === "terminal") {
    return { state: prev, result: { closed: false, tabId, reason: "blocked" } };
  }

  // dirty 阻断
  if (tab.dirty) {
    return { state: prev, result: { closed: false, tabId, reason: "dirty" } };
  }

  // 分屏面板中的标签页 → unsplit
  let newSplit = prev.split;
  let replacedActiveTabId: string | undefined;
  if (prev.split) {
    const paneIdx = prev.split.tabIds.indexOf(tabId);
    if (paneIdx !== -1) {
      replacedActiveTabId = prev.split.tabIds[1 - paneIdx];
      newSplit = null;
    }
  }

  const remaining = prev.tabs.filter((t) => t.id !== tabId);
  const { tabs: finalTabs, createdId } = ensureTerminal(remaining);
  const newActiveId = replacedActiveTabId ?? createdId ?? pickNextActive(finalTabs, tabId);
  const newTabs = recomputeClosable(finalTabs);
  const finalActiveId = newTabs.some((t) => t.id === newActiveId)
    ? newActiveId
    : newTabs[0]?.id ?? "";

  return {
    state: { tabs: newTabs, activeTabId: finalActiveId, split: newSplit },
    result: {
      closed: true,
      tabId,
      reason: replacedActiveTabId ? "unsplit" : undefined,
      replacedActiveTabId: finalActiveId,
    },
  };
}

/** 强制关闭（跳过 dirty 检查） */
export function reduceForceCloseTab(prev: TabState, tabId: string): CloseTabResult {
  const tab = prev.tabs.find((t) => t.id === tabId);
  if (!tab) {
    return { state: prev, result: { closed: false, tabId, reason: "blocked" } };
  }
  if (prev.tabs.length === 1 && tab.type === "terminal") {
    return { state: prev, result: { closed: false, tabId, reason: "blocked" } };
  }

  let newSplit = prev.split;
  let replacedActiveTabId: string | undefined;
  if (prev.split) {
    const paneIdx = prev.split.tabIds.indexOf(tabId);
    if (paneIdx !== -1) {
      replacedActiveTabId = prev.split.tabIds[1 - paneIdx];
      newSplit = null;
    }
  }

  const remaining = prev.tabs.filter((t) => t.id !== tabId);
  const { tabs: finalTabs, createdId } = ensureTerminal(remaining);
  const newActiveId = replacedActiveTabId ?? createdId ?? pickNextActive(finalTabs, tabId);
  const newTabs = recomputeClosable(finalTabs);
  const finalActiveId = newTabs.some((t) => t.id === newActiveId)
    ? newActiveId
    : newTabs[0]?.id ?? "";

  return {
    state: { tabs: newTabs, activeTabId: finalActiveId, split: newSplit },
    result: { closed: true, tabId, replacedActiveTabId: finalActiveId },
  };
}

/** 分屏 */
/** 拖拽分屏——指定标签页放在左/上(side=0)还是右/下(side=1) */
export function reduceDropSplit(
  prev: TabState,
  tabId: string,
  direction: "horizontal" | "vertical",
  side: 0 | 1
): TabState {
  if (!prev.tabs.some((t) => t.id === tabId)) return prev;
  if (prev.tabs.length < 2) return prev;

  // 如果拖拽的是活跃标签页，找下一个标签页配对
  let draggedId = tabId;
  let otherId = prev.activeTabId;
  if (draggedId === otherId) {
    const idx = prev.tabs.findIndex((t) => t.id === prev.activeTabId);
    otherId = prev.tabs[(idx + 1) % prev.tabs.length].id;
  }

  const tabIds: [string, string] =
    side === 0 ? [draggedId, otherId] : [otherId, draggedId];

  if (!prev.split) {
    return { ...prev, split: { direction, tabIds, sizes: [50, 50] } };
  }

  // 已分屏 → 替换 activeTabId 所在面板
  const paneIdx = prev.split.tabIds.indexOf(prev.activeTabId);
  if (paneIdx === -1) return prev;
  const newTabIds = [...prev.split.tabIds] as [string, string];
  newTabIds[paneIdx] = draggedId;
  return {
    ...prev,
    activeTabId: draggedId,
    split: { ...prev.split, tabIds: newTabIds },
  };
}

export function reduceSplitTab(
  prev: TabState,
  tabId: string,
  direction: "horizontal" | "vertical" = "horizontal"
): TabState {
  if (!prev.tabs.some((t) => t.id === tabId)) return prev;

  if (!prev.split) {
    // 没有其他标签页 → 无法分屏
    if (prev.tabs.length < 2) return prev;

    // 右键活跃标签页 → 自动找下一个标签页作为分屏目标
    let partnerId = tabId;
    if (tabId === prev.activeTabId) {
      const idx = prev.tabs.findIndex((t) => t.id === prev.activeTabId);
      partnerId = prev.tabs[(idx + 1) % prev.tabs.length].id;
    }

    return {
      ...prev,
      split: { direction, tabIds: [prev.activeTabId, partnerId], sizes: [50, 50] },
    };
  }

  // 已分屏 → 替换 activeTabId 所在面板
  const paneIdx = prev.split.tabIds.indexOf(prev.activeTabId);
  if (paneIdx === -1) return prev;
  const newTabIds = [...prev.split.tabIds] as [string, string];
  newTabIds[paneIdx] = tabId;
  return {
    ...prev,
    activeTabId: tabId,
    split: { ...prev.split, tabIds: newTabIds },
  };
}

/** 取消分屏 */
export function reduceUnsplit(prev: TabState): TabState {
  if (!prev.split) return prev;
  if (!prev.split.tabIds.includes(prev.activeTabId)) {
    return { ...prev, split: null, activeTabId: prev.split.tabIds[0] };
  }
  return { ...prev, split: null };
}

/** 设置 dirty 标记 */
export function reduceSetDirty(prev: TabState, tabId: string, dirty: boolean): TabState {
  return {
    ...prev,
    tabs: prev.tabs.map((t) => (t.id === tabId ? { ...t, dirty } : t)),
  };
}

/** 更新分屏尺寸 */
export function reduceUpdateSplitSizes(prev: TabState, sizes: [number, number]): TabState {
  if (!prev.split) return prev;
  return { ...prev, split: { ...prev.split, sizes } };
}

/** 标签栏内拖拽重排 */
export function reduceReorderTab(prev: TabState, tabId: string, toIndex: number): TabState {
  const fromIndex = prev.tabs.findIndex((t) => t.id === tabId);
  if (fromIndex === -1) return prev;
  const newTabs = [...prev.tabs];
  const [moved] = newTabs.splice(fromIndex, 1);
  newTabs.splice(toIndex, 0, moved);
  return { ...prev, tabs: newTabs };
}

/** 恢复布局 */
export function reduceRestoreLayout(saved: TabState): TabState {
  const validTabs = saved.tabs.filter((t) => t.id && t.type && t.label);
  const activeTabId = validTabs.some((t) => t.id === saved.activeTabId)
    ? saved.activeTabId
    : validTabs[0]?.id;

  let split: SplitLayout | null = null;
  if (saved.split) {
    const [id1, id2] = saved.split.tabIds;
    if (validTabs.some((t) => t.id === id1) && validTabs.some((t) => t.id === id2)) {
      split = saved.split;
    }
  }

  const { tabs: finalTabs } = ensureTerminal(validTabs);
  const finalActiveId = finalTabs.some((t) => t.id === activeTabId)
    ? activeTabId
    : finalTabs[0]?.id ?? "";
  const newTabs = recomputeClosable(finalTabs);

  return { tabs: newTabs, activeTabId: finalActiveId, split };
}

/* ── Hook（薄封装——调度纯函数 + 管理 ref） ── */

export function useTabManager(initial?: Partial<TabState>) {
  const [tabState, setTabState] = useState<TabState>(() =>
    createInitialTabState(initial)
  );

  const lastFocusedByType = useRef<Map<TabType, string>>(new Map());
  if (!lastFocusedByType.current.has("terminal")) {
    lastFocusedByType.current.set("terminal", tabState.tabs[0]?.id ?? "");
  }

  const createTab = useCallback(
    (type: TabType, workspaceName?: string): string => {
      let createdId = "";
      setTabState((prev) => {
        const r = reduceCreateTab(prev, type, workspaceName);
        createdId = r.createdId;
        const tab = r.state.tabs.find((t) => t.id === createdId);
        if (tab) lastFocusedByType.current.set(tab.type, createdId);
        return r.state;
      });
      return createdId;
    },
    []
  );

  const openOrFocusTab = useCallback(
    (type: TabType): string | null => {
      let focusedId: string | null = null;
      setTabState((prev) => {
        const r = reduceOpenOrFocus(prev, type, lastFocusedByType.current.get(type));
        focusedId = r.focusedId;
        if (focusedId) lastFocusedByType.current.set(type, focusedId);
        return r.state;
      });
      return focusedId;
    },
    []
  );

  const focusTab = useCallback((tabId: string) => {
    setTabState((prev) => {
      const next = reduceFocusTab(prev, tabId);
      const tab = next.tabs.find((t) => t.id === tabId);
      if (tab) lastFocusedByType.current.set(tab.type, tabId);
      return next;
    });
  }, []);

  const closeTab = useCallback(
    (tabId: string): CloseResult => {
      let result: CloseResult = { closed: false, tabId };
      setTabState((prev) => {
        const r = reduceCloseTab(prev, tabId);
        result = r.result;
        if (r.result.closed) {
          const activeTab = r.state.tabs.find((t) => t.id === r.state.activeTabId);
          if (activeTab) lastFocusedByType.current.set(activeTab.type, r.state.activeTabId);
        }
        return r.state;
      });
      return result;
    },
    []
  );

  const forceCloseTab = useCallback(
    (tabId: string): CloseResult => {
      let result: CloseResult = { closed: false, tabId };
      setTabState((prev) => {
        const r = reduceForceCloseTab(prev, tabId);
        result = r.result;
        if (r.result.closed) {
          const activeTab = r.state.tabs.find((t) => t.id === r.state.activeTabId);
          if (activeTab) lastFocusedByType.current.set(activeTab.type, r.state.activeTabId);
        }
        return r.state;
      });
      return result;
    },
    []
  );

  const splitTab = useCallback(
    (tabId: string, direction: "horizontal" | "vertical" = "horizontal") => {
      setTabState((prev) => {
        const next = reduceSplitTab(prev, tabId, direction);
        const tab = next.tabs.find((t) => t.id === tabId);
        if (tab) lastFocusedByType.current.set(tab.type, tabId);
        return next;
      });
    },
    []
  );

  /** 拖拽分屏——指定侧边 */
  const dropSplitTab = useCallback(
    (tabId: string, direction: "horizontal" | "vertical", side: 0 | 1) => {
      setTabState((prev) => {
        const next = reduceDropSplit(prev, tabId, direction, side);
        const tab = next.tabs.find((t) => t.id === tabId);
        if (tab) lastFocusedByType.current.set(tab.type, tabId);
        return next;
      });
    },
    []
  );

  const unsplit = useCallback(() => {
    setTabState((prev) => {
      const next = reduceUnsplit(prev);
      const activeTab = next.tabs.find((t) => t.id === next.activeTabId);
      if (activeTab) lastFocusedByType.current.set(activeTab.type, next.activeTabId);
      return next;
    });
  }, []);

  const setDirty = useCallback((tabId: string, dirty: boolean) => {
    setTabState((prev) => reduceSetDirty(prev, tabId, dirty));
  }, []);

  const updateSplitSizes = useCallback((sizes: [number, number]) => {
    setTabState((prev) => reduceUpdateSplitSizes(prev, sizes));
  }, []);

  const reorderTab = useCallback((tabId: string, toIndex: number) => {
    setTabState((prev) => reduceReorderTab(prev, tabId, toIndex));
  }, []);

  const restoreLayout = useCallback((saved: TabState) => {
    setTabState(() => {
      const next = reduceRestoreLayout(saved);
      for (const tab of next.tabs) {
        lastFocusedByType.current.set(tab.type, tab.id);
      }
      return next;
    });
  }, []);

  return {
    tabState,
    createTab,
    openOrFocusTab,
    focusTab,
    closeTab,
    forceCloseTab,
    splitTab,
    dropSplitTab,
    unsplit,
    setDirty,
    updateSplitSizes,
    reorderTab,
    restoreLayout,
  };
}
