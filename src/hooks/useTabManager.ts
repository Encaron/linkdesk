/**
 * useTabManager — 标签页状态管理 hook（聚合器门面）。
 * Phase 3 v4：VS Code 模型——每个面板独立标签栏，TabGroup 管理标签页归属。
 * E5.8#0d.10-2：拆 useTabManager/ 子模块后，本文件 = 聚合器——全量 re-export 子模块公共符号，
 * 外部消费方 import 路径零变更（"./useTabManager" 命中文件，"./useTabManager/types" 命中子模块）。
 * 分层依赖：types（模型+派生）→ defaults（工厂+计数器）→ reducers-tab/reducers-layout（纯 reducer）；
 * 本文件仅保留 React Hook 层（useState/useCallback + CoreEvents/shellEvents 副作用）。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §3]
 */

import { useState, useCallback, useRef, useEffect } from "react";
import i18n from "../i18n";
import { showConfirm } from "../core/services/ui/DialogService";
import { shellEvents } from "../core/react/events/ShellEvents";
import { normalizePath } from "../core/utils/path/pathUtils";
import type { CreateTabOptions } from "../core/api/types";
import { getTabBehavior } from "../pluginLoader/viewRegistry";
import { CoreEvents } from "../core/react/events/CoreEvents";

import { findGroup } from "./useTabManager/types";
import type { TabState, LayoutData, CloseTabResult } from "./useTabManager/types";
export { allTabs, findGroup } from "./useTabManager/types";
export type { TabType, Tab, TabGroup, TabState, LayoutData, CreateTabResult, CloseTabResult } from "./useTabManager/types";

import { createInitialTabState } from "./useTabManager/defaults";
export { createTabDefaults, createInitialTabState, resetPluginCounter, syncCountersAfterRestore, resetFallbackCounter } from "./useTabManager/defaults";

import {
  reduceCreateTab,
  reduceOpenOrFocus,
  reduceFocusTab,
  reduceFocusGroup,
  reduceCloseTab,
  reduceForceCloseTab,
  reduceDuplicateTab,
  reduceSetDirty,
  reduceUpdateTabLabel,
  reduceReorderTab,
  reducePinTab,
} from "./useTabManager/reducers-tab";
export {
  reduceCreateTab,
  reduceOpenOrFocus,
  reduceFocusTab,
  reduceFocusGroup,
  reduceCloseTab,
  reduceForceCloseTab,
  reduceDuplicateTab,
  reduceSetDirty,
  reduceUpdateTabLabel,
  reduceReorderTab,
  reducePinTab,
} from "./useTabManager/reducers-tab";

import {
  reduceMoveTab,
  reduceSplitTabAt,
  reduceSplitTab,
  reduceUnsplit,
  reduceUpdateSplitSizes,
  reduceRestoreLayout,
} from "./useTabManager/reducers-layout";
export {
  reduceMoveTab,
  reduceSplitTabAt,
  reduceSplitTab,
  reduceUnsplit,
  reduceUpdateSplitSizes,
  reduceRestoreLayout,
} from "./useTabManager/reducers-layout";

/* ── Hook ── */

/** E4V#32：标签页激活事件双发（CoreEvents + 插件 IPC）——聚焦/激活共用一处（归一性，E5.8#30.15 消重）。 */
function emitTabActivated(tabId: string, pluginId: string | undefined, filePath: string | undefined): void {
  CoreEvents.onDidChangeActiveTab.fire({ tabId, pluginId, filePath });
  try { window.linkdesk?.events?.emit("tab:activated", { tabId, pluginId, filePath }); } catch { /* 静默 */ }
}

export function useTabManager() {
  const [tabState, setTabState] = useState<TabState>(() => createInitialTabState());
  // G6：ref 桥接——替代 setState updater hack 读当前状态，Concurrent Mode 安全
  const tabStateRef = useRef(tabState);
  tabStateRef.current = tabState;

  const lastFocusedByType = useRef<Map<string, string>>(new Map());
  // E4 #87：关闭标签页栈——Ctrl+Shift+T 恢复最近关闭的标签页
  const closedTabStack = useRef<Array<{ type: string; opts?: CreateTabOptions }>>([]);
  // G5：ref 写入移出 render 函数体——Concurrent Mode 安全（render 期间禁止副作用）
  useEffect(() => {
    for (const tab of tabState.groups.flatMap((g) => g.tabs)) {
      const key = tab.pluginId ?? tab.type;
      if (!lastFocusedByType.current.has(key)) {
        lastFocusedByType.current.set(key, tab.id);
      }
    }
  }, [tabState]);

  const createTab = useCallback(
    (type: string, opts?: CreateTabOptions): string => {
      // 🔥 E5.7 Bug A 修复：返回值不能从 setTabState updater 里读——
      // React 18 仅在 fiber 无 pending lane 时才 eager 执行 updater，否则 createdId 恒为空串
      // （实测：池 tabs.create 首次调用返回 "" → u1 不发 tab:focused → activeEditor 不更新 →
      //  when:"activeEditor == 'xxx'" 过滤掉全部菜单项/命令）。
      // 返回值用 tabStateRef 同步预计算（G6 ref 桥接）；state 转换仍走函数式 updater（队列语义不变）。
      const eager = reduceCreateTab(tabStateRef.current, type, opts);
      setTabState((prev) => {
        const r = reduceCreateTab(prev, type, opts);
        if (r.createdId) {
          const tab = findGroup(r.state, r.createdId)?.tabs.find((t) => t.id === r.createdId);
          if (tab) lastFocusedByType.current.set(tab.pluginId ?? tab.type, r.createdId);
        }
        return r.state;
      });
      return eager.createdId;
    },
    []
  );

  const openOrFocusTab = useCallback(
    (type: string, opts?: CreateTabOptions): string | null => {
      // 🔥 E5.7 Bug A 修复：focusedId/filePath 同 createTab——不能从 updater 里读（eager state 不保证执行）。
      const eager = reduceOpenOrFocus(tabStateRef.current, type, lastFocusedByType.current.get(type), opts);
      setTabState((prev) => {
        const r = reduceOpenOrFocus(prev, type, lastFocusedByType.current.get(type), opts);
        if (r.focusedId) {
          lastFocusedByType.current.set(type, r.focusedId);
        }
        return r.state;
      });
      if (eager.focusedId) {
        const g = findGroup(eager.state, eager.focusedId);
        const t = g?.tabs.find((tab) => tab.id === eager.focusedId);
        const filePath = t?.filePath;
        emitTabActivated(eager.focusedId, type, filePath);
      }
      return eager.focusedId;
    },
    []
  );

  const focusTab = useCallback((tabId: string) => {
    // 🔥 E5.7 Bug A 修复：事件数据同 createTab——不能从 updater 里读。
    // reduceFocusTab 不改 tab 字段，事件数据直接取提交态里的 tab（与 updater 结果等价）。
    const tab = findGroup(tabStateRef.current, tabId)?.tabs.find((t) => t.id === tabId);
    setTabState((prev) => {
      const next = reduceFocusTab(prev, tabId);
      const group = findGroup(next, tabId);
      const focused = group?.tabs.find((t) => t.id === tabId);
      if (focused) {
        lastFocusedByType.current.set(focused.pluginId ?? focused.type, tabId);
      }
      return next;
    });
    // E4V#32: fire 后触发 autoReveal
    emitTabActivated(tabId, tab?.pluginId, tab?.filePath);
  }, []);

  // E5.8#30.15（P5）：聚焦面板（点空白）——只改 activeGroupId，不改 activeTabId。
  // 同组 no-op（幂等，省一次 pushLayout 回环）；聚焦面板的 active tab 即「当前编辑」——
  // 事件同 focusTab（tab:focused → activeEditor 跟随，tab:activated → 插件激活语义）。
  const focusGroup = useCallback((groupId: string) => {
    const prev = tabStateRef.current;
    if (prev.activeGroupId === groupId) return;
    const group = prev.groups.find((g) => g.id === groupId);
    if (!group) return;
    setTabState((p) => reduceFocusGroup(p, groupId));
    const tab = group.tabs.find((t) => t.id === group.activeTabId) ?? group.tabs[0];
    if (tab) {
      shellEvents.emit("tab:focused", { pluginId: tab.pluginId || tab.type, tabId: tab.id });
      emitTabActivated(tab.id, tab.pluginId, tab.filePath);
    }
  }, []);

  /** 按 sourceId 找标签页并聚焦——通用 API。
   *  插件（终端/file/sqlite 等）通过 sourceId 将自己的数据绑定到标签页。
   *  sourceId 是通用概念（CreateTabOptions.sourceId），不属任何特定插件。 */
  const focusTabBySourceId = useCallback((sourceId: string) => {
    // 🔥 E5.7 Bug A 修复：focusedId 守卫 + 事件数据同 createTab——不能从 updater 里读。
    // 预计算只做"提交态里找到 tab 与否"——聚焦不改 tab 字段，事件数据即找到的 tab 本身。
    const tab = tabStateRef.current.groups.flatMap((g) => g.tabs).find(
      (t) => t.sourceId === sourceId || t.id === sourceId,
    );
    setTabState((prev) => {
      const found = prev.groups.flatMap((g) => g.tabs).find(
        (t) => t.sourceId === sourceId || t.id === sourceId,
      );
      if (!found) return prev;
      const next = reduceFocusTab(prev, found.id);
      const group = findGroup(next, found.id);
      const focused = group?.tabs.find((t) => t.id === found.id);
      if (focused) {
        lastFocusedByType.current.set(focused.pluginId ?? focused.type, found.id);
      }
      return next;
    });
    if (tab) {
      emitTabActivated(tab.id, tab.pluginId, tab.filePath);
    }
  }, []);

  /** 按 sourceId 找标签页并关闭——和 focusTabBySourceId 对称的通用 API。
   *  插件删自己的数据模型时用此 API 关闭对应标签页。
   *  不依赖 tab.id === session.id 的假设——只用 sourceId 链接。 */
  const closeTabBySourceId = useCallback(
    (sourceId: string): CloseTabResult => {
      // 🔥 E5.7 Bug A 修复：返回值同 createTab——不能从 updater 里读。
      const prev = tabStateRef.current;
      const tab = prev.groups.flatMap((g) => g.tabs).find(
        (t) => t.sourceId === sourceId || t.id === sourceId,
      );
      const eager = tab ? reduceCloseTab(prev, tab.id) : null;
      setTabState((prev2) => {
        const found = prev2.groups.flatMap((g) => g.tabs).find(
          (t) => t.sourceId === sourceId || t.id === sourceId,
        );
        if (!found) return prev2;
        const r = reduceCloseTab(prev2, found.id);
        return r.state ?? prev2;
      });
      if (tab && eager) {
        return { closed: eager.closed, tabId: tab.id, reason: eager.reason, newActiveTabId: eager.newActiveTabId };
      }
      return { closed: false, tabId: sourceId };
    },
    []
  );

  // 🔥 E5.7 Bug A 修复：返回值不能从 updater 里读——提交态在 updater 外算，updater 内只应用。
  // E5.8#1c：closeTab dirty 路径与 forceCloseTab 共用此提交（去重）。
  const commitForceClose = (tabId: string): CloseTabResult => {
    const eager = reduceForceCloseTab(tabStateRef.current, tabId);
    setTabState((prev) => {
      const r = reduceForceCloseTab(prev, tabId);
      return r.state ?? prev;
    });
    return { closed: eager.closed, tabId, reason: eager.reason, newActiveTabId: eager.newActiveTabId };
  };

  // E5#51a：dirty 确认下沉到 closeTab——所有关闭路径统一行为
  const closeTab = useCallback(
    async (tabId: string): Promise<CloseTabResult> => {
      const tab = tabStateRef.current.groups.flatMap((g) => g.tabs).find((t) => t.id === tabId);
      // E5#52：dirty 可能在 tab.dirty 字段，也可能在 label 的 ● 前缀（EditorTab 只改 label 不改 dirty）
      const isDirty = tab?.dirty || (tab?.label?.startsWith("● ") ?? false);
      if (isDirty) {
        const displayLabel = tab!.label.startsWith("● ") ? tab!.label.slice(2) : tab!.label;
        const confirmed = await showConfirm(
          i18n.t("「{{label}}」有未保存的修改，确定关闭？", { label: i18n.t(displayLabel) })
        );
        if (!confirmed) return { closed: false, tabId, reason: "dirty" };
        // 确认弹窗 await 之后重新读提交态（期间状态可能已变）
        return commitForceClose(tabId);
      }
      // 🔥 E5.7 Bug A 修复：返回值同 createTab——不能从 updater 里读。
      const eager = reduceCloseTab(tabStateRef.current, tabId);
      setTabState((prev) => {
        const r = reduceCloseTab(prev, tabId);
        if (r.closed) {
          const closedTab = prev.groups.flatMap((g) => g.tabs).find((t) => t.id === tabId);
          if (closedTab && !getTabBehavior(closedTab.type).isFallback) {
            closedTabStack.current.push({
              type: closedTab.type,
              opts: { label: closedTab.label, workspaceName: closedTab.workspaceName, filePath: closedTab.filePath, sourceId: closedTab.sourceId, pinned: closedTab.pinned },
            });
            if (closedTabStack.current.length > 20) closedTabStack.current.shift();
          }
        }
        return r.state ?? prev;
      });
      return { closed: eager.closed, tabId, reason: eager.reason, newActiveTabId: eager.newActiveTabId };
    },
    []
  );

  const forceCloseTab = useCallback(
    (tabId: string): CloseTabResult => commitForceClose(tabId),
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

  const splitTabAt = useCallback(
    (tabId: string, direction: "horizontal" | "vertical", targetGroupId?: string, zone?: "left" | "right" | "up" | "down") => {
      setTabState((prev) => reduceSplitTabAt(prev, tabId, direction, targetGroupId, zone));
    },
    []
  );

  const duplicateTab = useCallback(
    (tabId: string): string | null => {
      let newId: string | null = null;
      setTabState((prev) => {
        const next = reduceDuplicateTab(prev, tabId);
        if (next) {
          // 找到刚创建的副本——最新的 tab
          const group = next.groups.find((g) => g.id === next.activeGroupId);
          newId = group?.tabs[group.tabs.length - 1]?.id ?? null;
        }
        return next ?? prev;
      });
      return newId;
    },
    []
  );

  const unsplit = useCallback((groupId?: string) => {
    setTabState((prev) => {
      // 如果未指定 groupId，用 activeGroupId
      const targetId = groupId ?? prev.activeGroupId;
      return reduceUnsplit(prev, targetId);
    });
  }, []);

  const updateSplitSizes = useCallback((anchorGroupId: string, sizes: [number, number], branchIndex?: number) => {
    setTabState((prev) => reduceUpdateSplitSizes(prev, anchorGroupId, sizes, branchIndex));
  }, []);

  const setDirty = useCallback((tabId: string, dirty: boolean) => {
    setTabState((prev) => reduceSetDirty(prev, tabId, dirty));
  }, []);

  const updateTabLabel = useCallback((tabId: string, label: string) => {
    setTabState((prev) => reduceUpdateTabLabel(prev, tabId, label));
  }, []);

  /** 按 sourceId 更新标签页标题——A2+N1：侧栏改会话名 → 标签栏标题同步。 */
  const updateTabLabelBySourceId = useCallback((sourceId: string, label: string) => {
    setTabState((prev) => {
      const tab = prev.groups.flatMap((g) => g.tabs).find(
        (t) => t.sourceId === sourceId || t.id === sourceId,
      );
      if (!tab) return prev;
      return reduceUpdateTabLabel(prev, tab.id, label);
    });
  }, []);

  const reorderTab = useCallback((tabId: string, toIndex: number) => {
    setTabState((prev) => reduceReorderTab(prev, tabId, toIndex));
  }, []);

  /** 对标 VS Code：双击标签页 → 固定/取消固定 */
  const pinTab = useCallback((tabId: string) => {
    setTabState((prev) => reducePinTab(prev, tabId));
  }, []);

  /**
   * 恢复布局并返回恢复后的聚焦标签——E5.7 Bug D：重启后 activeEditor 未设置，
   * App 恢复 effect 用返回值 emit tab:focused（eager 计算——不读 setState 结果，Bug A 教训）。
   */
  const restoreLayout = useCallback((saved: LayoutData): { pluginId: string; tabId: string } | null => {
    const next = reduceRestoreLayout(saved);
    for (const tab of next.groups.flatMap((g) => g.tabs)) {
      lastFocusedByType.current.set(tab.pluginId ?? tab.type, tab.id);
    }
    setTabState(() => next);
    const group = next.groups.find((g) => g.id === next.activeGroupId);
    const tab = group?.tabs.find((t) => t.id === group.activeTabId) ?? group?.tabs[0];
    return tab ? { pluginId: tab.pluginId ?? tab.type, tabId: tab.id } : null;
  }, []);

  /** E4 #87：恢复最近关闭的标签页——Ctrl+Shift+T */
  const restoreClosedTab = useCallback((): string | null => {
    const entry = closedTabStack.current.pop();
    if (!entry) return null;
    return createTab(entry.type, entry.opts);
  }, [createTab]);

  // G6：ref 读当前状态——替代 setState updater hack（Concurrent Mode 下 updater 可能异步调度）
  const toLayoutData = useCallback((): LayoutData => {
    const prev = tabStateRef.current;
    return {
      groups: prev.groups.map((g) => ({ ...g })),
      activeGroupId: prev.activeGroupId,
      root: prev.root,
    };
  }, []);

  // ── E5#54b：标签页生命周期——集中订阅外部事件，TabManager 唯一权威 ──
  useEffect(() => {
    const u1 = shellEvents.on("file:deleted", ({ filePath }) => {
      const tabs = tabStateRef.current.groups.flatMap((g) => g.tabs);
      for (const t of tabs) {
        if (t.sourceId === filePath || t.filePath === filePath) {
          forceCloseTab(t.id);
        }
      }
    });
    const u2 = shellEvents.on("file:renamed", ({ oldPath, newPath }) => {
      setTabState((prev) => {
        const newGroups = prev.groups.map((g) => ({
          ...g,
          tabs: g.tabs.map((t) => {
            if (t.sourceId === oldPath || t.filePath === oldPath) {
              const newLabel = normalizePath(newPath).split("/").pop() || newPath;
              return { ...t, label: newLabel, filePath: newPath, sourceId: newPath };
            }
            return t;
          }),
        }));
        return { ...prev, groups: newGroups };
      });
    });
    const u3 = shellEvents.on("plugin:removed", ({ pluginId }) => {
      const tabs = tabStateRef.current.groups.flatMap((g) => g.tabs);
      for (const t of tabs) {
        if (t.pluginId === pluginId || t.type === pluginId) {
          forceCloseTab(t.id);
        }
      }
    });
    const u4 = shellEvents.on("workspace:folderRemoved", ({ folderUri }) => {
      const normalized = normalizePath(folderUri);
      const tabs = tabStateRef.current.groups.flatMap((g) => g.tabs);
      for (const t of tabs) {
        const fp = t.filePath ?? t.sourceId ?? "";
        if (normalizePath(fp).startsWith(normalized)) {
          forceCloseTab(t.id);
        }
      }
    });
    return () => { u1(); u2(); u3(); u4(); };
  }, [forceCloseTab]);

  return {
    tabState,

    // ── 生命周期（创建/打开/聚焦/关闭）──
    createTab,
    openOrFocusTab,
    focusTab,
    focusGroup,
    focusTabBySourceId,
    closeTabBySourceId,
    closeTab,
    forceCloseTab,

    // ── 布局（分屏/合屏/拖拽/分割调整）──
    splitTab,
    splitTabAt,
    unsplit,
    updateSplitSizes,
    moveTab,
    duplicateTab,
    reorderTab,
    pinTab,

    // ── 状态（标记/标签）──
    setDirty,
    updateTabLabel,
    updateTabLabelBySourceId,

    // ── 持久化（恢复/导出）──
    restoreLayout,
    toLayoutData,
    restoreClosedTab,
  };
}
