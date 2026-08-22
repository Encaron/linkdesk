/**
 * App 标签页动作回调层——coreCallbacks / handleTabAction / handleFocusTab 纯工厂。
 * E5.8#0d.10-3a：自 App.tsx 拆出——不依赖 React 渲染环境，输入 deps 输出回调。
 * 依赖方向：tabCallbacks → core/commands（CoreCallbacks 类型）+ core 工具 + useTabManager 类型；无反向。
 * App 消费：useMemo/useCallback 包工厂调用——deps 数组不变，memo 语义与拆分前完全一致。
 */

import { shellEvents } from "../core/react/events/ShellEvents";
import { invokeBeforeCloseTab } from "../pluginLoader/viewRegistry";
import { getAllLeafGroupIds } from "../core/utils/splitTree";
import {
  allTabs,
  reduceCreateTab,
  reduceFocusTab,
  reduceFocusGroup,
  reduceRemoveTab,
  reduceReorderTab,
  reduceMoveTab,
  reduceSplitTabAt,
  reduceDuplicateTab,
  reducePinTab,
  reduceUpdateSplitSizes,
  reduceUpdateTabLabelBySourceId,
  findTabBySourceId,
  isTabDirty,
  confirmDirtyTabClose,
} from "../hooks/useTabManager"; // E5.8#46.4：脱出窗 tab 操作纯 reducer（聚合器 re-export）；#46.12：sourceId 族共用查找/更新；Step3：dirty 判定/确认共用
import { FALLBACK_PLUGIN_ID } from "../core/utils/plugin/fallbackPluginId";
import type { CoreCallbacks } from "../core/commands/shell/coreCommands";
import type { ShellTabAction } from "../core/types/ipc/tabActions"; // E5.8#44-B：壳侧收 ShellTabAction（含 sourceWindowId）
import type { CreateTabOptions } from "../core/api/types";
import type { CloseTabResult, TabState } from "../hooks/useTabManager";
import type { WindowMode, WindowShellState } from "./windows"; // E5.8#45：deps 类型同 relocation 返回值（WindowMode）——core 契约已宽化；#46.4：脱出窗路由查注册表

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
  /** E5.8#44：可拖出窗口——右键「在新窗口中打开」/「并回主窗口」/ tab 窗口判定 */
  detachTab: (tabId: string) => void;
  mergeTabToMain: (tabId: string) => void;
  findTabWindow: (tabId: string) => { windowId: string; mode: WindowMode } | null;
  /** E5.8#46.8：壳窗口注册表——Ctrl+W 按聚焦窗路由（脱出窗走 registry reduceRemoveTab + 空窗自灭） */
  windows: WindowShellState[];
  updateTabState: (windowId: string, tabState: TabState) => void;
  closeWindow: (windowId: string) => void;
}

/** E5#5e-ii-f：核心回调——注册到 coreCommands，壳快捷键（Ctrl+W/Ctrl+Tab 等）走这里 */
export function createCoreCallbacks(deps: CoreCallbacksDeps): CoreCallbacks {
  const { closeTab, splitTab, tabState, handleFocusTab, unsplit, openOrFocusTab, restoreClosedTab, duplicateTab, pinTab, detachTab, mergeTabToMain, findTabWindow, windows, updateTabState, closeWindow } = deps;
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
    // E5.8#46.8：Ctrl+W 按聚焦窗路由——脱出窗（sourceWindowId ≠ "main"）关该窗 registry active tab
    // （reduceRemoveTab + 空窗自灭 I9-8，复用 #46.4 applyDetachedTabAction）；主窗/未注走 useTabManager。
    closeActiveTab: async (sourceWindowId) => {
      if (sourceWindowId && sourceWindowId !== "main") {
        const win = windows.find((w) => w.windowId === sourceWindowId);
        if (!win) return;
        const group = win.tabState.groups.find((g) => g.id === win.tabState.activeGroupId);
        const tab = group?.tabs.find((t) => t.id === group.activeTabId);
        if (!tab) return;
        if (tab.pluginId && !await invokeBeforeCloseTab(tab.pluginId)) return;
        // E5.8#46.12 Step3：脱出窗 Ctrl+W 补 dirty 确认（镜像主窗 closeTab——此前静默关脏标签丢数据）
        if (!(await confirmDirtyTabClose(tab))) return;
        applyDetachedTabAction(win, { action: "closeTab", tabId: tab.id, sourceWindowId }, { updateTabState, closeWindow });
        return;
      }
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
    // E5.8#38（I8-3/IX-1）：聚焦已有插件标签页——跨 group 切换（reduceFocusTab 语义），无则 false
    focusTabByPluginId: (pluginId) => {
      for (const g of tabState.groups) {
        const tab = g.tabs.find((t) => t.pluginId === pluginId);
        if (tab) {
          handleFocusTab(tab.id);
          return true;
        }
      }
      return false;
    },
    // E5.8#44：可拖出窗口——壳侧 relocation（windowRelocation.ts）直通
    detachTab: (tabId) => detachTab(tabId),
    mergeTabToMain: (tabId) => mergeTabToMain(tabId),
    findTabWindow: (tabId) => findTabWindow(tabId),
  };
}

/* ── handleTabAction ── */

export interface TabActionHandlerDeps {
  handleFocusTab: (tabId: string) => void;
  /** E5.8#30.15（P5）：仅聚焦面板（activeGroupId）——事件已由 useTabManager.focusGroup 内部处理 */
  focusGroup: (groupId: string) => void;
  closeTab: (tabId: string) => Promise<CloseTabResult>;
  groups: TabState["groups"];
  reorderTab: (tabId: string, toIndex: number) => void;
  moveTab: (tabId: string, targetGroupId: string) => void;
  splitTabAt: (tabId: string, direction: "horizontal" | "vertical", targetGroupId?: string, zone?: "left" | "right" | "up" | "down") => void;
  duplicateTab: (tabId: string) => string | null;
  pinTab: (tabId: string) => void;
  createTab: (type: string, opts?: CreateTabOptions) => string;
  updateSplitSizes: (anchorGroupId: string, sizes: [number, number], branchIndex?: number) => void;
  /** E5.8#44-B：窗口外释放决策（拖出手势）——命中 TabBar→并窗 / 空白→新窗 */
  releaseOutside: (tabId: string, screenX: number, screenY: number, sourceWindowId: string) => void;
  /** E5.8#46.4：壳窗口注册表——脱出窗 tabAction 按 sourceWindowId 路由（查该窗 tabState + 空窗裁决） */
  windows: WindowShellState[];
  /** E5.8#46.4：写脱出窗 tabState（纯 reducer 结果）→ usePoolSync 按窗重推布局 */
  updateTabState: (windowId: string, tabState: TabState) => void;
  /** E5.8#46.4：空窗自灭（I9-8）——脱出窗无标签 → closeWindow（不 updateTabState） */
  closeWindow: (windowId: string) => void;
}

/**
 * E5.8#46.4：脱出窗 tab 操作——纯 reducer 应用到该窗注册表 tabState + updateTabState。
 * 与主窗差异：不发射事件（tab:focused/tab:activated——布局推流 activeTabId 驱动池渲染，插件 isActive
 * prop 已覆盖；KISS，实机暴露事件缺口再补）；closeTab 用 reduceRemoveTab（不查 dirty——池侧 × 已按
 * closeBehavior 确认过，与主窗 × 同语义）；空窗自灭（I9-8）由壳裁决（groups 全空 → closeWindow）。
 */
function applyDetachedTabAction(
  win: WindowShellState,
  action: ShellTabAction,
  deps: Pick<TabActionHandlerDeps, "updateTabState" | "closeWindow">,
): void {
  let next = win.tabState;
  let changed = true;
  switch (action.action) {
    case "focusTab":
      next = reduceFocusTab(next, action.tabId);
      break;
    case "focusGroup":
      next = reduceFocusGroup(next, action.groupId);
      break;
    case "closeTab":
      next = reduceRemoveTab(next, action.tabId).state;
      break;
    case "closeOtherTabs": {
      const g = next.groups.find((x) => x.id === action.groupId);
      if (g) for (const t of g.tabs) if (t.id !== action.tabId) next = reduceRemoveTab(next, t.id).state;
      break;
    }
    case "closeTabsToRight": {
      const g = next.groups.find((x) => x.id === action.groupId);
      if (g) {
        const idx = g.tabs.findIndex((t) => t.id === action.tabId);
        if (idx >= 0) for (let i = g.tabs.length - 1; i > idx; i--) next = reduceRemoveTab(next, g.tabs[i].id).state;
      }
      break;
    }
    case "closeAllTabs": {
      const g = next.groups.find((x) => x.id === action.groupId);
      if (g) for (const t of [...g.tabs]) next = reduceRemoveTab(next, t.id).state;
      break;
    }
    case "reorderTab":
      next = reduceReorderTab(next, action.tabId, action.newIndex);
      break;
    case "moveTab":
      next = reduceMoveTab(next, action.tabId, action.targetGroupId);
      break;
    case "splitTab":
      next = reduceSplitTabAt(
        next,
        action.tabId,
        action.direction,
        action.targetGroupId,
        action.zone && action.zone !== "center" ? action.zone : undefined,
      );
      break;
    case "duplicateTab": {
      const r = reduceDuplicateTab(next, action.tabId);
      if (!r) { changed = false; break; }
      next = r;
      break;
    }
    case "pinTab":
      next = reducePinTab(next, action.tabId);
      break;
    case "createTab":
      next = reduceCreateTab(next, action.pluginId ?? FALLBACK_PLUGIN_ID, { workspaceName: action.workspaceName }).state;
      break;
    case "updateSplitSizes":
      next = reduceUpdateSplitSizes(next, action.anchorGroupId, action.sizes, action.branchIndex);
      break;
    default:
      changed = false; // releaseOutsideWindow 已在路由前消费；未识别动作不写回
  }
  if (!changed) return;
  // 空窗自灭（I9-8）：脱出窗无标签 → closeWindow；否则写回注册表（usePoolSync 按窗重推布局）
  if (next.groups.length === 0 || next.groups.every((g) => g.tabs.length === 0)) {
    deps.closeWindow(win.windowId);
  } else {
    deps.updateTabState(win.windowId, next);
  }
}

/**
 * E5.6#16.5：MainPool tab 操作→壳 useTabManager。
 * 池 GroupTabBar 通过 pool.tabAction() → IPC → 此 handler → tabState 更新 → pushLayout 回环。
 * E5.7#96：action 载荷定型为 PoolTabAction wire 契约——枚举值/字段名壳池双端 tsc 对齐。
 * E5.8#46.4：按 sourceWindowId 路由——主窗走 useTabManager；脱出窗走注册表 tabState + 纯 reducer。
 */
export function createTabActionHandler(deps: TabActionHandlerDeps): (action: ShellTabAction) => Promise<void> {
  const { handleFocusTab, focusGroup, closeTab, groups, reorderTab, moveTab, splitTabAt, duplicateTab, pinTab, createTab, updateSplitSizes, releaseOutside, windows, updateTabState, closeWindow } = deps;
  return async (action) => {
    // E5.8#44-B：窗口外释放恒走全局 relocation（跨窗命中检测——sourceWindowId 内部路由），不随源窗分流
    if (action.action === "releaseOutsideWindow") {
      releaseOutside(action.tabId, action.screenX, action.screenY, action.sourceWindowId);
      return;
    }
    // E5.8#46.4：窗内标签操作按 sourceWindowId 路由——脱出窗走注册表 tabState + 纯 reducer +
    // updateTabState（此前全部无脑打主窗 useTabManager → 脱出窗 tabId 不在主窗 tabState → 静默 no-op，
    // 窗内分屏/关闭/重排/聚焦全失效根因）。窗已关的迟到动作 → 静默丢弃。
    const sourceWindowId = action.sourceWindowId;
    if (sourceWindowId && sourceWindowId !== "main") {
      const win = windows.find((w) => w.windowId === sourceWindowId);
      if (win) {
        // E5.8#46.12 Step3：脱出窗关闭补 dirty 确认（镜像主窗 closeTab——池侧 × 此前静默关脏标签丢数据）
        if (action.action === "closeTab") {
          const tab = win.tabState.groups.flatMap((g) => g.tabs).find((t) => t.id === action.tabId);
          if (tab && !(await confirmDirtyTabClose(tab))) return;
        }
        applyDetachedTabAction(win, action, { updateTabState, closeWindow });
      }
      return;
    }
    switch (action.action) {
      case "focusTab":
        handleFocusTab(action.tabId);
        break;
      // E5.8#30.15（P5）：点面板空白聚焦该面板——事件/activeEditor 由 useTabManager.focusGroup 统一处理
      case "focusGroup":
        focusGroup(action.groupId);
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
      // releaseOutsideWindow 已在路由前（handler 顶部）统一消费——跨窗手势不随源窗分流
    }
  };
}

/* ── E5.8#46.12：sourceId 族按窗路由（信封来源窗章）── */

export interface SourceIdRouterDeps {
  /** 壳窗口注册表——脱出窗 sourceId 操作落该窗 tabState（#46.4 同源） */
  windows: WindowShellState[];
  updateTabState: (windowId: string, tabState: TabState) => void;
  closeWindow: (windowId: string) => void;
  /** 主窗路径（useTabManager）——sourceWindowId 未注/为 main 时走原路 */
  focusTabBySourceId: (sourceId: string) => void;
  updateTabLabelBySourceId: (sourceId: string, label: string) => void;
  closeTabBySourceId: (sourceId: string) => void;
}

/**
 * E5.8#46.12：sourceId 族（改标签/关标签/聚焦）按来源窗路由——信封章（主进程 sender 反查）落脱出窗
 * 注册表纯 reducer + updateTabState；主窗/未注走 useTabManager。修窗口身份丢失类同根 bug（脱出窗
 * label/dirty 黑点不同步、close/focus 静默 no-op）——与 #46.4 脱出窗 tabAction 同构归一化。
 */
export function createSourceIdRouters(deps: SourceIdRouterDeps) {
  const { windows, updateTabState, closeWindow } = deps;
  /**
   * 信封来源窗章 → 三态路由：
   *  - main（未注/显式 "main"）→ 走 useTabManager 主路径
   *  - detached（章指注册表存在）→ 走该窗注册表纯 reducer
   *  - gone（章指非 main 且注册表无此窗）→ 静默丢弃——窗已关的迟到动作（#46.4 同语义，
   *    不误触主窗同名 tab；若 tab 已并回主窗，并入时对象自带 label，迟到更新无意义）
   */
  type SourceIdRoute =
    | { kind: "main" }
    | { kind: "detached"; win: WindowShellState }
    | { kind: "gone" };
  const route = (sourceWindowId?: string): SourceIdRoute => {
    if (!sourceWindowId || sourceWindowId === "main") return { kind: "main" };
    const win = windows.find((w) => w.windowId === sourceWindowId);
    return win ? { kind: "detached", win } : { kind: "gone" };
  };
  return {
    focusTabBySourceId: (sourceId: string, sourceWindowId?: string): void => {
      const r = route(sourceWindowId);
      if (r.kind === "main") { deps.focusTabBySourceId(sourceId); return; }
      if (r.kind === "gone") return; // 迟到/已迁走，静默
      const tab = findTabBySourceId(r.win.tabState, sourceId);
      if (!tab) return; // 脱出窗无此 tab → 静默（不误触主窗同名 tab）
      applyDetachedTabAction(r.win, { action: "focusTab", tabId: tab.id, sourceWindowId: r.win.windowId }, { updateTabState, closeWindow });
    },
    updateTabLabelBySourceId: (sourceId: string, label: string, sourceWindowId?: string): void => {
      const r = route(sourceWindowId);
      if (r.kind === "main") { deps.updateTabLabelBySourceId(sourceId, label); return; }
      if (r.kind === "gone") return;
      const next = reduceUpdateTabLabelBySourceId(r.win.tabState, sourceId, label);
      if (next === r.win.tabState) return; // 脱出窗无此 tab → 静默
      updateTabState(r.win.windowId, next);
    },
    closeTabBySourceId: (sourceId: string, sourceWindowId?: string): void => {
      const r = route(sourceWindowId);
      if (r.kind === "main") { deps.closeTabBySourceId(sourceId); return; }
      if (r.kind === "gone") return;
      const tab = findTabBySourceId(r.win.tabState, sourceId);
      if (!tab) return;
      // E5.8#46.12 Step3：脱出窗 sourceId 关脏 tab 静默阻断（镜像主窗 reduceCloseTab dirty 阻断语义，
      // 不弹窗——程序化关闭由插件自行确认）。比主窗多查 ● 前缀——与 isTabDirty 判定统一，不分叉。
      if (isTabDirty(tab)) return;
      applyDetachedTabAction(r.win, { action: "closeTab", tabId: tab.id, sourceWindowId: r.win.windowId }, { updateTabState, closeWindow });
    },
  };
}
