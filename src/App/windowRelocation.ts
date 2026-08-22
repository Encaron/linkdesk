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

import { useCallback, useEffect, useRef } from "react";
import { allTabs, createGroup, reduceRemoveTab, reduceInsertTab } from "../hooks/useTabManager";
import type { Tab, TabState } from "../hooks/useTabManager";
import type { WindowShellState, WindowMode } from "./windows";
import type { PoolWindowBoundsPayload, TabBarRectsPayload, TabBarViewportRect, ShellTabDragPosition, AdsorbHintPayload } from "../core/types/ipc/poolActions";

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
  /** E5.8#44-B：存 TabBar rects 到注册表——App 订阅 pool.onTabBarRects 直通（吸附/释放命中检测数据源） */
  handleTabBarRects(payload: TabBarRectsPayload): void;
  /** E5.8#44-B：窗口外释放决策——命中目标窗 TabBar → 吸附并窗；空白 → 新窗（释放点附近落窗）。
   *  sourceWindowId = 主进程注入的源窗（拖出手势源） */
  releaseOutside(tabId: string, screenX: number, screenY: number, sourceWindowId: string): void;
}

export function useWindowRelocation(deps: UseWindowRelocationDeps): UseWindowRelocationResult {
  const { windows, createWindow, closeWindow, updateTabState, removeTab, insertTab } = deps;
  // G6 ref 桥——拖拽期间壳注册表只读不 setState（#44 吸附命中检测走模块级，避免重渲 churn）
  const windowsRef = useRef(windows);
  windowsRef.current = windows;

  // E5.8#44-B：TabBar viewport rects 注册表——池上报（pool:tabbar-rects）→ 壳存这里；窗口 bounds 在
  // windowsRef（权威）。命中检测 = 读两 ref 转 screen（bounds.x + rect.left），零 setState 免拖拽重渲 churn。
  const tabBarRectsRef = useRef<Map<string, TabBarViewportRect[]>>(new Map());

  // E5.8#44-C：吸附目标注册表——sourceWindowId → { 目标窗, 目标组 } | null（多窗拖拽互不干扰）。
  // null = 源窗当前无吸附目标（拖回窗内/空白——壳下发 null 清目标窗高亮）。ref 承载——拖拽高频免重渲。
  const adsorbTargetsRef = useRef<Map<string, { windowId: string; groupId: string } | null>>(new Map());

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

  /** E5.8#44-B：存 TabBar rects 到注册表——pool.onTabBarRects 直通（windowId 主进程注入） */
  const handleTabBarRects = useCallback((payload: TabBarRectsPayload): void => {
    tabBarRectsRef.current.set(payload.windowId, payload.rects);
  }, []);

  // E5.8#44-B：订阅池 TabBar rects 上报——池→主进程（附 windowId）→壳 preload → 本 hook 注册表（吸附命中检测数据源）
  useEffect(() => {
    const poolApi = window.linkdesk?.pool;
    if (!poolApi) return;
    const unsub = poolApi.onTabBarRects?.(handleTabBarRects);
    return unsub;
  }, [handleTabBarRects]);

  /** E5.8#44-B：屏幕坐标命中目标窗 TabBar——bounds + viewport rect 转 screen（bounds.x + rect.left），返回 { 目标窗, 目标组 }。
   *  E5.8#44-C：excludeWindowId 排除源窗（live 吸附命中——窗内拖拽非跨窗吸附，自然返回 null 清提示）。释放命中（#44-B）不传排除——释放点恒在窗界外。 */
  const hitTestTabBar = useCallback((screenX: number, screenY: number, excludeWindowId?: string): { windowId: string; groupId: string } | null => {
    for (const w of windowsRef.current) {
      if (w.windowId === excludeWindowId) continue;
      const bounds = w.bounds;
      const rects = tabBarRectsRef.current.get(w.windowId);
      if (!bounds || !rects || rects.length === 0) continue; // bounds 未上报 / rects 未报 → 不可命中
      for (const r of rects) {
        const sx = bounds.x + r.left;
        const sy = bounds.y + r.top;
        if (screenX >= sx && screenX <= sx + r.width && screenY >= sy && screenY <= sy + r.height) {
          return { windowId: w.windowId, groupId: r.groupId };
        }
      }
    }
    return null;
  }, []);

  /** E5.8#44-C：重算某窗吸附提示——跨全部 source 汇聚（多窗拖拽同 target 可叠加），恰好一个 distinct groupId → 高亮，
   *  否则 null（多组歧义不误导——保守无光胜过错光）。下发目标窗池（pushAdsorbHint 按 windowId 定向）。 */
  const syncAdsorbHint = useCallback((windowId: string): void => {
    const groups = new Set<string>();
    for (const hit of adsorbTargetsRef.current.values()) {
      if (hit && hit.windowId === windowId) groups.add(hit.groupId);
    }
    const hint: AdsorbHintPayload = groups.size === 1 ? { groupId: [...groups][0] } : { groupId: null };
    window.linkdesk?.pool?.pushAdsorbHint?.(hint, windowId);
  }, []);

  /** E5.8#44-C：清源窗吸附提示（释放/Esc 取消）——删除注册 + 重算旧目标窗（无残留高亮） */
  const clearAdsorb = useCallback((sourceWindowId: string): void => {
    const prev = adsorbTargetsRef.current.get(sourceWindowId);
    if (!prev) return;
    adsorbTargetsRef.current.delete(sourceWindowId);
    syncAdsorbHint(prev.windowId);
  }, [syncAdsorbHint]);

  /** E5.8#44-C：拖拽位置上报——排除源窗命中检测 + 目标变化时下发吸附提示（目标未变免 IPC 抖动）。
   *  canceled（Esc 取消）→ 直接清源窗提示（keydown 无坐标）。 */
  const handleDragPosition = useCallback((pos: ShellTabDragPosition): void => {
    if (pos.canceled) {
      clearAdsorb(pos.sourceWindowId);
      return;
    }
    const prev = adsorbTargetsRef.current.get(pos.sourceWindowId);
    const hit = hitTestTabBar(pos.screenX, pos.screenY, pos.sourceWindowId);
    if (prev?.windowId === hit?.windowId && prev?.groupId === hit?.groupId) return;
    adsorbTargetsRef.current.set(pos.sourceWindowId, hit);
    const affected = new Set<string>();
    if (prev) affected.add(prev.windowId);
    if (hit) affected.add(hit.windowId);
    for (const wid of affected) syncAdsorbHint(wid);
  }, [hitTestTabBar, clearAdsorb, syncAdsorbHint]);

  // E5.8#44-C：订阅池拖拽位置上报——池→主进程（附 sourceWindowId）→壳 preload → 本 hook 吸附命中 + 提示下发
  useEffect(() => {
    const poolApi = window.linkdesk?.pool;
    if (!poolApi) return;
    const unsub = poolApi.onDragPosition?.(handleDragPosition);
    return unsub;
  }, [handleDragPosition]);

  // E5.8#44-C：窗口增删时清全部吸附提示——源窗拖拽中关闭/目标窗消失残留高亮防泄漏（live 拖拽下一拍 mousemove 自动恢复）
  useEffect(() => {
    if (adsorbTargetsRef.current.size === 0) return;
    const affected = new Set<string>();
    for (const hit of adsorbTargetsRef.current.values()) {
      if (hit) affected.add(hit.windowId);
    }
    adsorbTargetsRef.current.clear();
    for (const wid of affected) syncAdsorbHint(wid);
  }, [windows, syncAdsorbHint]);

  /** E5.8#44-B：窗口外释放决策——命中 TabBar → 吸附并窗（mergeTabToWindow 同窗不并守卫）；空白 → 新窗（释放点附近落窗）。
   *  E5.8#44-C：释放即清源窗吸附提示（吸附/新窗落定后残留高亮无意义）。 */
  const releaseOutside = useCallback((tabId: string, screenX: number, screenY: number, sourceWindowId: string): void => {
    clearAdsorb(sourceWindowId);
    const hit = hitTestTabBar(screenX, screenY);
    if (hit) {
      mergeTabToWindow(tabId, hit.windowId, hit.groupId);
      return;
    }
    // 空白 → 新窗——释放点附近落窗（TabBar 拖拽点偏窗口上缘，窗口中心落在释放点下方）
    detachTabToNewWindow(tabId, {
      sourceWindowId,
      bounds: { x: screenX - 100, y: screenY - 40, width: 900, height: 600 },
    });
  }, [hitTestTabBar, mergeTabToWindow, detachTabToNewWindow, clearAdsorb]);

  return { findTabWindow, detachTabToNewWindow, mergeTabToMain, mergeTabToWindow, handleTabBarRects, releaseOutside };
}
