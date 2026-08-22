/**
 * useWindowRelocation——壳侧窗口间标签页搬迁（E5.8#44）。
 *
 * detach（拖出/右键「在新窗口中打开」）+ merge（吸附并窗/「并回主窗口」）。
 * 壳 = 窗口策略真相源（#43 三层架构）：读注册表（main tabState 活引用 + 脱出窗自持）判源窗，
 * 经 useTabManager（main）或 updateTabState（脱出窗）双路径落笔。
 *
 * 空源窗处理：main 源摘到空 → removeTab 内 ensureFallback 补欢迎页（主窗恒非空）；
 * detached 源摘到空 → 本模块 closeWindow 空窗自灭（I9-8）。
 *
 * 消费方：右键菜单 core.openInNewWindow/core.mergeBackToMain（CoreCallbacks 桥）+ 池拖出手势
 * releaseOutsideWindow（#44-B 接入）。
 */

import { useCallback, useRef } from "react";
import { allTabs, createGroup, reduceRemoveTab, reduceInsertTab } from "../hooks/useTabManager";
import type { Tab, TabState } from "../hooks/useTabManager";
import type { WindowShellState, WindowMode } from "./windows";
import type { PoolWindowBoundsPayload } from "../core/types/ipc/poolActions";

export interface UseWindowRelocationDeps {
  /** 壳窗口注册表（useWindowHost）——G6 ref 桥读最新，拖拽期间免重渲 */
  windows: WindowShellState[];
  createWindow: (windowId: string, tabState: TabState, bounds?: PoolWindowBoundsPayload["bounds"]) => void;
  closeWindow: (windowId: string) => void;
  updateTabState: (windowId: string, tabState: TabState) => void;
  /** main 窗专用（useTabManager）——源侧摘除（内建 ensureFallback）/ 目标侧插入 */
  removeTab: (tabId: string) => Tab | null;
  insertTab: (tab: Tab, targetGroupId?: string) => void;
}

interface WindowTabRef {
  windowId: string;
  mode: WindowMode;
  tab: Tab;
}

export interface UseWindowRelocationResult {
  /** 找 tab 所在窗口——右键「并回主窗口」可见性（findTabWindow）+ 各搬迁源判定 */
  findTabWindow(tabId: string): { windowId: string; mode: WindowMode } | null;
  /** 拖出到新窗（右键「在新窗口中打开」/ 拖出释放无命中）——opts.sourceWindowId = 拖出手势源窗（主进程注入）；bounds = 释放点附近 / 缺省级联 */
  detachTabToNewWindow(tabId: string, opts?: { sourceWindowId?: string; bounds?: PoolWindowBoundsPayload["bounds"] }): void;
  /** 并回主窗（右键「并回主窗口」——脱出窗专属命令） */
  mergeTabToMain(tabId: string): void;
  /** 吸附并窗（#44-B 拖出释放命中目标窗 TabBar）——targetGroupId = 命中组 */
  mergeTabToWindow(tabId: string, targetWindowId: string, targetGroupId?: string): void;
}

export function useWindowRelocation(deps: UseWindowRelocationDeps): UseWindowRelocationResult {
  const { windows, createWindow, closeWindow, updateTabState, removeTab, insertTab } = deps;
  // G6 ref 桥——拖拽期间壳注册表只读不 setState（#44 吸附命中检测走模块级，避免重渲 churn）
  const windowsRef = useRef(windows);
  windowsRef.current = windows;

  const findTab = useCallback((tabId: string): WindowTabRef | null => {
    for (const w of windowsRef.current) {
      const tab = allTabs(w.tabState).find((t) => t.id === tabId);
      if (tab) return { windowId: w.windowId, mode: w.mode, tab };
    }
    return null;
  }, []);

  const findTabWindow = useCallback((tabId: string): { windowId: string; mode: WindowMode } | null => {
    const found = findTab(tabId);
    return found ? { windowId: found.windowId, mode: found.mode } : null;
  }, [findTab]);

  /** 新窗默认 bounds——主窗级联偏移（右键脱出）；主窗无 bounds（未移过）→ 缺省（主进程兜底 200,120,900,600） */
  const cascadeBounds = useCallback((): PoolWindowBoundsPayload["bounds"] | undefined => {
    const main = windowsRef.current.find((w) => w.mode === "main");
    if (!main?.bounds) return undefined;
    return { x: main.bounds.x + 40, y: main.bounds.y + 40, width: main.bounds.width, height: main.bounds.height };
  }, []);

  /** 从任意窗口摘 tab——main 走 useTabManager（内建 ensureFallback）；detached 走 reduceRemoveTab + updateTabState（空窗自灭） */
  const removeFromWindow = useCallback((windowId: string, tabId: string): Tab | null => {
    const src = windowsRef.current.find((w) => w.windowId === windowId);
    if (!src) return null;
    if (src.mode === "main") return removeTab(tabId);
    const r = reduceRemoveTab(src.tabState, tabId);
    if (!r.removedTab) return null;
    // I9-8：脱出窗最后 tab 摘走 → 空窗自灭（非回归——tab 已随搬迁保留）
    if (r.state.groups.every((g) => g.tabs.length === 0)) {
      closeWindow(windowId);
    } else {
      updateTabState(windowId, r.state);
    }
    return r.removedTab;
  }, [removeTab, closeWindow, updateTabState]);

  /** 向任意窗口插入 tab——main 走 useTabManager；detached 走 reduceInsertTab + updateTabState */
  const insertIntoWindow = useCallback((windowId: string, tab: Tab, targetGroupId?: string): void => {
    const target = windowsRef.current.find((w) => w.windowId === windowId);
    if (!target) return;
    if (target.mode === "main") {
      insertTab(tab, targetGroupId);
      return;
    }
    updateTabState(windowId, reduceInsertTab(target.tabState, tab, targetGroupId));
  }, [insertTab, updateTabState]);

  const detachTabToNewWindow = useCallback((tabId: string, opts?: { sourceWindowId?: string; bounds?: PoolWindowBoundsPayload["bounds"] }): void => {
    const found = findTab(tabId);
    if (!found) return;
    const sourceWindowId = opts?.sourceWindowId ?? found.windowId;
    const removed = removeFromWindow(sourceWindowId, tabId);
    if (!removed) return;
    const windowId = crypto.randomUUID();
    const group = createGroup([removed]);
    const newState: TabState = { groups: [group], activeGroupId: group.id, root: { type: "leaf", groupId: group.id } };
    createWindow(windowId, newState, opts?.bounds ?? cascadeBounds());
  }, [findTab, removeFromWindow, createWindow, cascadeBounds]);

  const mergeTabToMain = useCallback((tabId: string): void => {
    const found = findTab(tabId);
    if (!found || found.mode === "main") return; // 已在主窗 → 无动作
    const removed = removeFromWindow(found.windowId, tabId);
    if (!removed) return;
    insertIntoWindow("main", removed);
  }, [findTab, removeFromWindow, insertIntoWindow]);

  const mergeTabToWindow = useCallback((tabId: string, targetWindowId: string, targetGroupId?: string): void => {
    const found = findTab(tabId);
    if (!found || found.windowId === targetWindowId) return; // 同窗不并
    const removed = removeFromWindow(found.windowId, tabId);
    if (!removed) return;
    insertIntoWindow(targetWindowId, removed, targetGroupId);
  }, [findTab, removeFromWindow, insertIntoWindow]);

  return { findTabWindow, detachTabToNewWindow, mergeTabToMain, mergeTabToWindow };
}
