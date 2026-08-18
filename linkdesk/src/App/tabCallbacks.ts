/**
 * App 标签页动作回调层——coreCallbacks / handleTabAction / handleFocusTab 纯工厂。
 * E5.8#0d.10-3a：自 App.tsx 拆出——不依赖 React 渲染环境，输入 deps 输出回调。
 * 依赖方向：tabCallbacks → core/commands（CoreCallbacks 类型）+ core 工具 + useTabManager 类型；无反向。
 * App 消费：useMemo/useCallback 包工厂调用——deps 数组不变，memo 语义与拆分前完全一致。
 */

import { shellEvents } from "../core/react/events/ShellEvents";
import { invokeBeforeCloseTab } from "../pluginLoader/viewRegistry";
import { getAllLeafGroupIds } from "../core/utils/splitTree";
import { allTabs } from "../hooks/useTabManager";
import { FALLBACK_PLUGIN_ID } from "../core/utils/plugin/fallbackPluginId";
import type { CoreCallbacks } from "../core/commands/shell/coreCommands";
import type { PoolTabAction } from "../core/types/ipc/tabActions";
import type { CreateTabOptions } from "../core/api/types";
import type { CloseTabResult, TabState } from "../hooks/useTabManager";

/* ── handleFocusTab ── */

export interface FocusTabHandlerDeps {
  focusTab: (tabId: string) => void;
  groups: TabState["groups"];
}

/** E5#5c：包装 focusTab——emit tab:focused 通知状态栏 */
export function createFocusTabHandler(deps: FocusTabHandlerDeps): (tabId: string) => void {
  return (tabId: string) => {
    deps.focusTab(tabId);
    for (const g of deps.groups) {
      const tab = g.tabs.find((t) => t.id === tabId);
      if (tab) {
        shellEvents.emit("tab:focused", { pluginId: tab.pluginId || tab.type, tabId });
        break;
      }
    }
  };
}

/* ── coreCallbacks ── */

export interface CoreCallbacksDeps {
  closeTab: (tabId: string) => Promise<CloseTabResult>;
  splitTab: (tabId: string, direction: "horizontal" | "vertical") => void;
  tabState: TabState;
  handleFocusTab: (tabId: string) => void;
  unsplit: (groupId?: string) => void;
  openOrFocusTab: (type: string, opts?: CreateTabOptions) => string | null;
  restoreClosedTab: () => string | null;
  duplicateTab: (tabId: string) => string | null;
  pinTab: (tabId: string) => void;
}

/** E5#5e-ii-f：核心回调——注册到 coreCommands，壳快捷键（Ctrl+W/Ctrl+Tab 等）走这里 */
export function createCoreCallbacks(deps: CoreCallbacksDeps): CoreCallbacks {
  const { closeTab, splitTab, tabState, handleFocusTab, unsplit, openOrFocusTab, restoreClosedTab, duplicateTab, pinTab } = deps;
  return {
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
    duplicateTab: (tabId) => duplicateTab(tabId),
    pinTab: (tabId) => pinTab(tabId),
  };
}

/* ── handleTabAction ── */

export interface TabActionHandlerDeps {
  handleFocusTab: (tabId: string) => void;
  closeTab: (tabId: string) => Promise<CloseTabResult>;
  groups: TabState["groups"];
  reorderTab: (tabId: string, toIndex: number) => void;
  moveTab: (tabId: string, targetGroupId: string) => void;
  splitTabAt: (tabId: string, direction: "horizontal" | "vertical", targetGroupId?: string, zone?: "left" | "right" | "up" | "down") => void;
  duplicateTab: (tabId: string) => string | null;
  pinTab: (tabId: string) => void;
  createTab: (type: string, opts?: CreateTabOptions) => string;
  updateSplitSizes: (anchorGroupId: string, sizes: [number, number], branchIndex?: number) => void;
}

/**
 * E5.6#16.5：MainPool tab 操作→壳 useTabManager。
 * 池 GroupTabBar 通过 pool.tabAction() → IPC → 此 handler → tabState 更新 → pushLayout 回环。
 * E5.7#96：action 载荷定型为 PoolTabAction wire 契约——枚举值/字段名壳池双端 tsc 对齐。
 */
export function createTabActionHandler(deps: TabActionHandlerDeps): (action: PoolTabAction) => void {
  const { handleFocusTab, closeTab, groups, reorderTab, moveTab, splitTabAt, duplicateTab, pinTab, createTab, updateSplitSizes } = deps;
  return (action) => {
    switch (action.action) {
      case "focusTab":
        handleFocusTab(action.tabId);
        break;
      case "closeTab":
        closeTab(action.tabId);
        break;
      case "closeOtherTabs": {
        // 关闭同 group 内除指定 tab 外的所有 tab
        const g = groups.find((x) => x.id === action.groupId);
        if (g) {
          for (const t of g.tabs) {
            if (t.id !== action.tabId) closeTab(t.id);
          }
        }
        break;
      }
      case "closeTabsToRight": {
        // 关闭同 group 内指定 tab 右侧的所有 tab
        const g = groups.find((x) => x.id === action.groupId);
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
        const g = groups.find((x) => x.id === action.groupId);
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
        // E5.7#96：direction 归一化已在池侧完成（onDropSplit 传 horizontal/vertical 两值）——
        // 旧 "right"/"down" 六值分支是 E5.6 遗留（右键菜单现走壳命令 core.splitRight 不经过本通道），
        // 契约类型收窄后死分支随 tsc 移除。zone 过滤 center/null（拖拽状态值，非分屏语义）。
        splitTabAt(
          action.tabId,
          action.direction,
          action.targetGroupId,
          action.zone && action.zone !== "center" ? action.zone : undefined,
        );
        break;
      case "duplicateTab":
        duplicateTab(action.tabId);
        break;
      case "pinTab":
        pinTab(action.tabId);
        break;
      case "createTab": {
        // E5.7 Bug A 修复：同 u1/u2——池发起的开标签页也要 emit tab:focused，
        // 否则 activeEditor 不更新 → when:"activeEditor == 'xxx'" 过滤掉菜单项/命令。
        // E5.7#96：workspaceName 透传——旧 { groupId } as any 是死字段（CreateTabOptions 无 groupId），
        // 欢迎页最近视图发的 workspaceName 被静默丢弃（wire 缝，契约定型时 tsc 逼出）。
        const pluginId = action.pluginId ?? FALLBACK_PLUGIN_ID;
        const tabId = createTab(pluginId, { workspaceName: action.workspaceName });
        if (tabId) shellEvents.emit("tab:focused", { pluginId, tabId });
        break;
      }
      // E5.6#16：分隔线拖拽结束（#16.5 后从 pool.sidebarAction 迁到 pool.tabAction）
      case "updateSplitSizes":
        updateSplitSizes(action.anchorGroupId, action.sizes, action.branchIndex);
        break;
    }
  };
}
