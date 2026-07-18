/**
 * useTabManager — 标签页状态管理 hook。
 * Phase 3 v4：VS Code 模型——每个面板独立标签栏，TabGroup 管理标签页归属。
 *
 * 设计依据：[V3-Phase3-标签页分屏设计.md §3]
 */

import { useState, useCallback, useRef } from "react";

/* ── 类型 ── */

export type TabType = "terminal" | "workspace" | "oled" | "settings" | "editor";

export interface Tab {
  id: string;
  type: TabType;
  label: string;
  workspaceName?: string;   // workspace 类型才有
  filePath?: string;         // editor 类型才有
  dirty: boolean;
}

export interface TabGroup {
  id: string;
  tabs: Tab[];
  activeTabId: string;
}

export interface SplitLayout {
  direction: "horizontal" | "vertical";
  groupIds: [string, string];
  sizes: [number, number];
}

export interface LayoutData {
  groups: { id: string; tabs: Tab[]; activeTabId: string }[];
  activeGroupId: string;
  split: SplitLayout | null;
}

export interface TabState {
  groups: TabGroup[];
  activeGroupId: string;
  split: SplitLayout | null;
}

/** 派生：平板化所有组中的标签页 */
export function allTabs(state: TabState): Tab[] {
  return state.groups.flatMap((g) => g.tabs);
}

/** 派生：如何找到 tab 所属的组 */
export function findGroup(state: TabState, tabId: string): TabGroup | undefined {
  return state.groups.find((g) => g.tabs.some((t) => t.id === tabId));
}

/* ── 默认值工厂 ── */

let _terminalCounter = 0;

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
    label: getDefaultLabel(type, overrides?.workspaceName, overrides?.filePath),
    workspaceName: overrides?.workspaceName,
    filePath: overrides?.filePath,
    dirty: false,
  };

  if (type === "terminal") {
    _terminalCounter++;
    base.id = `terminal-${_terminalCounter}`;
  } else if (type === "workspace" && base.workspaceName) {
    base.id = `workspace-${base.workspaceName}`;
  } else if (type === "editor" && base.filePath) {
    base.id = `editor-${base.filePath.replace(/[^a-zA-Z0-9]/g, "_")}`;
  } else {
    base.id = type;
  }

  return { ...base, ...overrides, id: base.id };
}

export function getDefaultLabel(
  type: TabType,
  workspaceName?: string,
  filePath?: string
): string {
  switch (type) {
    case "terminal":  return "终端";
    case "workspace": return workspaceName || "工作台";
    case "settings":  return "设置";
    case "oled":      return "OLED";
    case "editor":    return filePath || "编辑器";
  }
}

/* ── 辅助 ── */

let _groupCounter = 0;

function createGroup(tabs: Tab[] = []): TabGroup {
  _groupCounter++;
  return {
    id: `group-${_groupCounter}`,
    tabs,
    activeTabId: tabs[0]?.id ?? "",
  };
}

/** 确保 state 中至少有一个终端标签页 */
function ensureTerminal(state: TabState): TabState {
  if (!allTabs(state).some((t) => t.type === "terminal")) {
    const terminal = createTabDefaults("terminal");
    const mainGroup = state.groups.find((g) => g.id === state.activeGroupId) ?? state.groups[0];
    if (mainGroup) {
      mainGroup.tabs = [terminal, ...mainGroup.tabs];
      if (!mainGroup.activeTabId) mainGroup.activeTabId = terminal.id;
    }
  }
  return state;
}

/** 选焦点标签页——关掉后选相邻的 */
function pickNextActive(tabs: Tab[], closedId: string): string {
  const idx = tabs.findIndex((t) => t.id === closedId);
  if (idx === -1) return tabs[0]?.id ?? "";
  const next = tabs[idx + 1] || tabs[idx - 1];
  return next?.id ?? "";
}

/* ── 初始状态 ── */

export function createInitialTabState(): TabState {
  const terminal = createTabDefaults("terminal");
  return {
    groups: [{ id: "main", tabs: [terminal], activeTabId: terminal.id }],
    activeGroupId: "main",
    split: null,
  };
}

/* ── 纯状态转换函数 ── */

export interface CreateTabResult {
  state: TabState;
  createdId: string;
}

export function reduceCreateTab(
  prev: TabState,
  type: TabType,
  opts?: { workspaceName?: string; filePath?: string; label?: string; targetGroupId?: string }
): CreateTabResult {
  const all = allTabs(prev);

  // 去重
  if (type === "workspace" && opts?.workspaceName) {
    const existing = all.find(
      (t) => t.type === "workspace" && t.workspaceName === opts.workspaceName
    );
    if (existing) {
      const group = findGroup(prev, existing.id)!;
      return {
        state: { ...prev, activeGroupId: group.id, groups: prev.groups.map((g) => (g.id === group.id ? { ...g, activeTabId: existing.id } : g)) },
        createdId: existing.id,
      };
    }
  }
  if ((type === "settings" || type === "oled") && all.some((t) => t.type === type)) {
    const existing = all.find((t) => t.type === type)!;
    const group = findGroup(prev, existing.id)!;
    return {
      state: { ...prev, activeGroupId: group.id, groups: prev.groups.map((g) => (g.id === group.id ? { ...g, activeTabId: existing.id } : g)) },
      createdId: existing.id,
    };
  }

  const newTab = createTabDefaults(type, {
    workspaceName: opts?.workspaceName,
    filePath: opts?.filePath,
    label: opts?.label,
  });

  const targetGroupId = opts?.targetGroupId ?? prev.activeGroupId;
  const targetGroup = prev.groups.find((g) => g.id === targetGroupId);
  if (!targetGroup) return { state: prev, createdId: "" };

  const newGroups = prev.groups.map((g) => {
    if (g.id !== targetGroupId) return g;
    return { ...g, tabs: [...g.tabs, newTab], activeTabId: newTab.id };
  });

  return {
    state: { ...prev, groups: newGroups, activeGroupId: targetGroupId },
    createdId: newTab.id,
  };
}

export function reduceOpenOrFocus(
  prev: TabState,
  type: TabType,
  lastFocusedId?: string | null
): { state: TabState; focusedId: string | null } {
  const all = allTabs(prev);
  const existing = all.filter((t) => t.type === type);

  if (existing.length > 0) {
    const target = existing.find((t) => t.id === lastFocusedId) ?? existing[existing.length - 1];
    const group = findGroup(prev, target.id)!;
    return {
      state: {
        ...prev,
        activeGroupId: group.id,
        groups: prev.groups.map((g) => (g.id === group.id ? { ...g, activeTabId: target.id } : g)),
      },
      focusedId: target.id,
    };
  }

  // 隐式创建：terminal / settings
  if (type === "terminal" || type === "settings") {
    const r = reduceCreateTab(prev, type);
    return { state: r.state, focusedId: r.createdId };
  }

  return { state: prev, focusedId: null };
}

export function reduceFocusTab(prev: TabState, tabId: string): TabState {
  const group = findGroup(prev, tabId);
  if (!group) return prev;
  return {
    ...prev,
    activeGroupId: group.id,
    groups: prev.groups.map((g) =>
      g.id === group.id ? { ...g, activeTabId: tabId } : g
    ),
  };
}

export interface CloseTabResult {
  closed: boolean;
  tabId: string;
  reason?: "blocked" | "dirty" | "unsplit";
  state?: TabState;
  newActiveTabId?: string;
}

export function reduceCloseTab(prev: TabState, tabId: string): CloseTabResult {
  const group = findGroup(prev, tabId);
  if (!group) return { closed: false, tabId, reason: "blocked" };

  const tab = group.tabs.find((t) => t.id === tabId)!;

  // 终端保底：全局唯一标签页且是终端 → 不允许关
  if (allTabs(prev).length === 1 && tab.type === "terminal") {
    return { closed: false, tabId, reason: "blocked" };
  }

  // dirty 阻断
  if (tab.dirty) {
    return { closed: false, tabId, reason: "dirty" };
  }

  // 从组中移除
  const remaining = group.tabs.filter((t) => t.id !== tabId);
  let newSplit = prev.split;

  // 该组变空 → unsplit 或切换活跃组
  if (remaining.length === 0) {
    if (prev.split) {
      // 分屏中 → 关掉一个组 → unsplit
      const otherGroupId = prev.split.groupIds.find((id) => id !== group.id)!;
      const otherGroup = prev.groups.find((g) => g.id === otherGroupId)!;
      const newState = ensureTerminal({ groups: prev.groups.filter((g) => g.id !== group.id), activeGroupId: otherGroupId, split: null });
      return { closed: true, tabId, reason: "unsplit", state: newState, newActiveTabId: otherGroup.activeTabId };
    }
    // 单面板 + 最后一个标签页已关 → 不应该到这里（终端保底已拦截）
    return { closed: false, tabId, reason: "blocked" };
  }

  const newActiveId = pickNextActive(remaining, tabId);
  const newGroups = prev.groups.map((g) =>
    g.id === group.id ? { ...g, tabs: remaining, activeTabId: newActiveId } : g
  );

  const result = ensureTerminal({
    groups: newGroups,
    activeGroupId: prev.activeGroupId,
    split: newSplit,
  });

  return {
    closed: true, tabId, state: result, newActiveTabId: newActiveId,
  };
}

export function reduceForceCloseTab(prev: TabState, tabId: string): CloseTabResult {
  const group = findGroup(prev, tabId);
  if (!group) return { closed: false, tabId, reason: "blocked" };
  const tab = group.tabs.find((t) => t.id === tabId)!;
  if (allTabs(prev).length === 1 && tab.type === "terminal") {
    return { closed: false, tabId, reason: "blocked" };
  }
  return reduceCloseTab({ ...prev }, tabId); // 复制后走正常关闭（dirty 已由调用方清除）
}

/** 移动标签页到另一个组 */
export function reduceMoveTab(prev: TabState, tabId: string, targetGroupId: string): TabState {
  const sourceGroup = findGroup(prev, tabId);
  if (!sourceGroup || sourceGroup.id === targetGroupId) return prev;

  const tab = sourceGroup.tabs.find((t) => t.id === tabId)!;
  const targetGroup = prev.groups.find((g) => g.id === targetGroupId);
  if (!targetGroup) return prev;

  // 从源组移除
  const sourceRemaining = sourceGroup.tabs.filter((t) => t.id !== tabId);
  const sourceActiveId = sourceGroup.activeTabId === tabId
    ? (sourceRemaining[0]?.id ?? "")
    : sourceGroup.activeTabId;

  // 如果源组变空
  if (sourceRemaining.length === 0) {
    const newGroups = prev.groups
      .filter((g) => g.id !== sourceGroup.id)
      .map((g) =>
        g.id === targetGroupId
          ? { ...g, tabs: [...g.tabs, tab], activeTabId: tab.id }
          : g
      );
    return {
      ...prev,
      groups: newGroups,
      activeGroupId: targetGroupId,
      split: null, // 一个组空了 → unsplit
    };
  }

  return {
    ...prev,
    activeGroupId: targetGroupId,
    groups: prev.groups.map((g) => {
      if (g.id === sourceGroup.id) return { ...g, tabs: sourceRemaining, activeTabId: sourceActiveId };
      if (g.id === targetGroup.id) return { ...g, tabs: [...g.tabs, tab], activeTabId: tab.id };
      return g;
    }),
  };
}

/** 分屏 */
export function reduceSplitTab(
  prev: TabState,
  tabId: string,
  direction: "horizontal" | "vertical"
): TabState {
  if (prev.split) return prev; // 已分屏 → 忽略（2-pane 限制）

  const sourceGroup = findGroup(prev, tabId);
  if (!sourceGroup) return prev;
  if (sourceGroup.tabs.length < 2 && allTabs(prev).length < 2) return prev;

  const tab = sourceGroup.tabs.find((t) => t.id === tabId)!;
  const sourceRemaining = sourceGroup.tabs.filter((t) => t.id !== tabId);
  const sourceActiveId = sourceGroup.activeTabId === tabId
    ? (sourceRemaining[0]?.id ?? "")
    : sourceGroup.activeTabId;

  const newGroup = createGroup([tab]);

  const side = direction === "horizontal"
    ? ([sourceGroup.id, newGroup.id] as [string, string])
    : ([newGroup.id, sourceGroup.id] as [string, string]);

  return {
    activeGroupId: newGroup.id,
    split: { direction, groupIds: side, sizes: [50, 50] },
    groups: prev.groups.map((g) =>
      g.id === sourceGroup.id
        ? { ...g, tabs: sourceRemaining, activeTabId: sourceActiveId }
        : g
    ).concat(newGroup),
  };
}

export function reduceUnsplit(prev: TabState): TabState {
  if (!prev.split) return prev;

  const [g1Id, g2Id] = prev.split.groupIds;
  const g1 = prev.groups.find((g) => g.id === g1Id);
  const g2 = prev.groups.find((g) => g.id === g2Id);
  if (!g1 || !g2) return { ...prev, split: null };

  // 合所有标签页到 main 组
  const merged = [...g1.tabs, ...g2.tabs];
  const newMain: TabGroup = {
    id: "main",
    tabs: merged,
    activeTabId: prev.groups.find((g) => g.id === prev.activeGroupId)?.activeTabId ?? merged[0]?.id ?? "",
  };

  return {
    groups: [newMain],
    activeGroupId: "main",
    split: null,
  };
}

export function reduceUpdateSplitSizes(prev: TabState, sizes: [number, number]): TabState {
  if (!prev.split) return prev;
  return { ...prev, split: { ...prev.split, sizes } };
}

export function reduceSetDirty(prev: TabState, tabId: string, dirty: boolean): TabState {
  return {
    ...prev,
    groups: prev.groups.map((g) => ({
      ...g,
      tabs: g.tabs.map((t) => (t.id === tabId ? { ...t, dirty } : t)),
    })),
  };
}

export function reduceUpdateTabLabel(prev: TabState, tabId: string, label: string): TabState {
  return {
    ...prev,
    groups: prev.groups.map((g) => ({
      ...g,
      tabs: g.tabs.map((t) => (t.id === tabId ? { ...t, label } : t)),
    })),
  };
}

/** 标签栏内拖拽重排——在组内交换位置 */
export function reduceReorderTab(prev: TabState, tabId: string, toIndex: number): TabState {
  const group = findGroup(prev, tabId);
  if (!group) return prev;
  const fromIndex = group.tabs.findIndex((t) => t.id === tabId);
  if (fromIndex === -1) return prev;
  const newTabs = [...group.tabs];
  const [moved] = newTabs.splice(fromIndex, 1);
  newTabs.splice(toIndex, 0, moved);
  return {
    ...prev,
    groups: prev.groups.map((g) =>
      g.id === group.id ? { ...g, tabs: newTabs } : g
    ),
  };
}

/** 恢复布局 */
export function reduceRestoreLayout(saved: LayoutData): TabState {
  const validGroups = saved.groups
    .map((g) => ({
      ...g,
      tabs: g.tabs.filter((t) => t.id && t.type && t.label),
    }))
    .filter((g) => g.tabs.length > 0);

  if (validGroups.length === 0) return createInitialTabState();

  const activeGroupId = validGroups.some((g) => g.id === saved.activeGroupId)
    ? saved.activeGroupId
    : validGroups[0].id;

  let split: SplitLayout | null = null;
  if (saved.split) {
    const [id1, id2] = saved.split.groupIds;
    if (validGroups.some((g) => g.id === id1) && validGroups.some((g) => g.id === id2)) {
      split = saved.split;
    }
  }

  // 确保至少一个终端
  const all = validGroups.flatMap((g) => g.tabs);
  if (!all.some((t) => t.type === "terminal")) {
    const terminal = createTabDefaults("terminal");
    const mainGroup = validGroups.find((g) => g.id === activeGroupId) ?? validGroups[0];
    mainGroup.tabs = [terminal, ...mainGroup.tabs];
    if (!mainGroup.activeTabId) mainGroup.activeTabId = terminal.id;
  }

  return {
    groups: validGroups,
    activeGroupId,
    split,
  };
}

/* ── Hook ── */

export function useTabManager() {
  const [tabState, setTabState] = useState<TabState>(() => createInitialTabState());

  const lastFocusedByType = useRef<Map<TabType, string>>(new Map());
  // init from initial state
  for (const tab of tabState.groups.flatMap((g) => g.tabs)) {
    if (!lastFocusedByType.current.has(tab.type)) {
      lastFocusedByType.current.set(tab.type, tab.id);
    }
  }

  const createTab = useCallback(
    (type: TabType, opts?: { workspaceName?: string; filePath?: string; label?: string; targetGroupId?: string }): string => {
      let createdId = "";
      setTabState((prev) => {
        const r = reduceCreateTab(prev, type, opts);
        createdId = r.createdId;
        if (createdId) {
          const tab = findGroup(r.state, createdId)?.tabs.find((t) => t.id === createdId);
          if (tab) lastFocusedByType.current.set(tab.type, createdId);
        }
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
      const group = findGroup(next, tabId);
      const tab = group?.tabs.find((t) => t.id === tabId);
      if (tab) lastFocusedByType.current.set(tab.type, tabId);
      return next;
    });
  }, []);

  const closeTab = useCallback(
    (tabId: string): CloseTabResult => {
      let result: CloseTabResult = { closed: false, tabId };
      setTabState((prev) => {
        const r = reduceCloseTab(prev, tabId);
        result = { closed: r.closed, tabId, reason: r.reason, newActiveTabId: r.newActiveTabId };
        return r.state ?? prev;
      });
      return result;
    },
    []
  );

  const forceCloseTab = useCallback(
    (tabId: string): CloseTabResult => {
      let result: CloseTabResult = { closed: false, tabId };
      setTabState((prev) => {
        const r = reduceForceCloseTab(prev, tabId);
        result = { closed: r.closed, tabId, reason: r.reason, newActiveTabId: r.newActiveTabId };
        return r.state ?? prev;
      });
      return result;
    },
    []
  );

  const moveTab = useCallback((tabId: string, targetGroupId: string) => {
    setTabState((prev) => reduceMoveTab(prev, tabId, targetGroupId));
  }, []);

  const splitTab = useCallback(
    (tabId: string, direction: "horizontal" | "vertical" = "horizontal") => {
      setTabState((prev) => reduceSplitTab(prev, tabId, direction));
    },
    []
  );

  const unsplit = useCallback(() => {
    setTabState((prev) => reduceUnsplit(prev));
  }, []);

  const updateSplitSizes = useCallback((sizes: [number, number]) => {
    setTabState((prev) => reduceUpdateSplitSizes(prev, sizes));
  }, []);

  const setDirty = useCallback((tabId: string, dirty: boolean) => {
    setTabState((prev) => reduceSetDirty(prev, tabId, dirty));
  }, []);

  const updateTabLabel = useCallback((tabId: string, label: string) => {
    setTabState((prev) => reduceUpdateTabLabel(prev, tabId, label));
  }, []);

  const reorderTab = useCallback((tabId: string, toIndex: number) => {
    setTabState((prev) => reduceReorderTab(prev, tabId, toIndex));
  }, []);

  const restoreLayout = useCallback((saved: LayoutData) => {
    setTabState(() => {
      const next = reduceRestoreLayout(saved);
      for (const tab of next.groups.flatMap((g) => g.tabs)) {
        lastFocusedByType.current.set(tab.type, tab.id);
      }
      return next;
    });
  }, []);

  const toLayoutData = useCallback((): LayoutData => {
    let data!: LayoutData;
    setTabState((prev) => {
      data = {
        groups: prev.groups.map((g) => ({ ...g })),
        activeGroupId: prev.activeGroupId,
        split: prev.split ? { ...prev.split } : null,
      };
      return prev;
    });
    return data!;
  }, []);

  return {
    tabState,
    createTab,
    openOrFocusTab,
    focusTab,
    closeTab,
    forceCloseTab,
    moveTab,
    splitTab,
    unsplit,
    setDirty,
    updateTabLabel,
    updateSplitSizes,
    reorderTab,
    restoreLayout,
    toLayoutData,
  };
}
