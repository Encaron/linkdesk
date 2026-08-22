/**
 * useTabDrag——MainZone 全局标签拖拽协调者（useDragReorder 接线，275 行 15+ 轮 bug 修复验证不重写）。
 * E5.8#0d.10-6b：自 MainZone.tsx 拆出——groupsRef / totalTabCount / sourceGroupRef / targetGroupRef /
 *   dragInsertGroupId / dropZoneState + useDragReorder 8 回调（computeInsertIndex / findOtherContainer /
 *   computeSplitZone / isInPureEditor / onReorder / onMoveToOther / onDropSplit / onDragDropZone）+
 *   dragLocalTabs / getEffectiveTabs / handleTabDragStart + 标签排序回执 effect + pendingReordersRef +
 *   tabBarRefs / registerTabBar。
 * 依赖方向：useTabDrag → useDragReorder + ./layout（TAB_BAR_HEIGHT）+ core types；无反向。
 * 🔴 拖出窗口检测接入点：useDragDetach（#33）已推迟 v1.3（脱出窗口设计.md）——届时在此接入。
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type * as React from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { PoolGroup, PoolTab } from "../../../../core/types/pool/poolLayout";
import type { DropZone } from "../../../hooks/tabDragTypes";
import { detectDropZone } from "../../../hooks/tabDragTypes";
import type { PoolTabAction } from "../../../../core/types/ipc/tabActions"; // E5.7#96：池→壳 tab 动作 wire 契约
import type { TabBarViewportRect, TabDragPositionPayload } from "../../../../core/types/ipc/poolActions"; // E5.8#44-B/#44-C：TabBar rect + 拖拽位置上报契约
import { useDragReorder } from "../../../hooks/useDragReorder";
import { TAB_BAR_HEIGHT } from "./layout";

interface UseTabDragInput {
  containerRef: React.RefObject<HTMLDivElement | null>;
  tabAction: (action: PoolTabAction) => void;
  groups: PoolGroup[];
  /** E5.8#44-B：TabBar viewport rects 上报（吸附/释放并窗命中检测数据源）——MainZone 传 pool.tabBarRects 包装 */
  tabBarRects?: (rects: TabBarViewportRect[]) => void;
  /** E5.8#44-C：拖拽位置上报（拎起后 mousemove 全程——壳排除源窗命中检测）——MainZone 传 pool.dragPosition 包装 */
  dragPosition?: (pos: TabDragPositionPayload) => void;
}

export function useTabDrag({ containerRef, tabAction, groups, tabBarRects, dragPosition }: UseTabDragInput) {
  // Stable groups ref——avoid useCallback deps on groups
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  // ── Tab bar DOM refs (MainZone reads bounding rects during drag) ──
  const tabBarRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const registerTabBar = useCallback((groupId: string, el: HTMLDivElement | null) => {
    if (el) tabBarRefs.current.set(groupId, el);
    else tabBarRefs.current.delete(groupId);
  }, []);

  // E5.8#44-B：TabBar viewport rects 上报——组/注册变化时读 tabBarRefs getBoundingClientRect 报告壳
  //（吸附/释放并窗命中检测数据源：窗口 bounds 壳已掌，视口 rect 转 screen 壳做）。窗口 resize 也重报
  //（视口变化 rects 失效）。registerTabBar 在 commit 阶段已更新 refs，本 effect 其后跑 → 恒最新。
  useEffect(() => {
    if (!tabBarRects) return;
    const report = () => {
      const rects: TabBarViewportRect[] = [];
      for (const [gid, el] of tabBarRefs.current) {
        const r = el.getBoundingClientRect();
        rects.push({ groupId: gid, left: r.left, top: r.top, width: r.width, height: r.height });
      }
      tabBarRects(rects);
    };
    report();
    window.addEventListener("resize", report);
    return () => window.removeEventListener("resize", report);
  }, [groups, tabBarRects]);

  const totalTabCount = groups.reduce((sum, g) => sum + g.tabs.length, 0);
  const sourceGroupRef = useRef<string | null>(null);
  const targetGroupRef = useRef<string | null>(null);
  const [dragInsertGroupId, setDragInsertGroupId] = useState<string | null>(null);
  const [dropZoneState, setDropZoneState] = useState<{ zone: DropZone; targetGroupId: string | null } | null>(null);

  // E5.7#86：同组标签排序的待回执记录——乐观提交序保留到壳 pushLayout 回执（分隔线同款回执对齐）
  const pendingReordersRef = useRef<Map<string, { preDragIds: string[]; committedIds: string[]; tabs: PoolTab[] }>>(new Map());
  // forceUpdate 本 hook 自持——与 useDividerDrag 各自 dispatch 均触发 MainZone 整体重渲，语义等价
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // E5.7#86：标签排序回执对齐——推送序 == 提交序（壳原样回存）或 ≠ 拖前序（壳已变）→ 释放覆盖。
  // 仍带拖前序的推送 = 迟到的旧推送（拖拽期间无关 tabState 变化触发）→ 保留覆盖。
  useEffect(() => {
    if (pendingReordersRef.current.size === 0) return;
    for (const [gid, pending] of pendingReordersRef.current) {
      const pushed = groups.find((g) => g.id === gid);
      // 组已消失（等待期间被合屏/关闭）→ 覆盖无意义，直接释放
      if (!pushed) {
        pendingReordersRef.current.delete(gid);
        forceUpdate();
        continue;
      }
      const pushedIds = pushed.tabs.map((t) => t.id);
      const sameAsPreDrag = pushedIds.length === pending.preDragIds.length
        && pushedIds.every((id, i) => id === pending.preDragIds[i]);
      const sameAsCommitted = pushedIds.length === pending.committedIds.length
        && pushedIds.every((id, i) => id === pending.committedIds[i]);
      if (!sameAsPreDrag || sameAsCommitted) {
        pendingReordersRef.current.delete(gid);
        forceUpdate();
      }
    }
  }, [groups]);

  const {
    draggingId,
    insertIndex: dragInsertIndex,
    previewPos,
    startDrag,
  } = useDragReorder(containerRef as React.RefObject<HTMLDivElement | null>, {
    itemCount: totalTabCount,

    // ── computeInsertIndex：找鼠标落在哪个 GroupTabBar → 计算插入位置（含 scrollLeft 补偿）──
    computeInsertIndex: (clientX, clientY, _container, fromIndex, _count) => {
      for (const [gid, el] of tabBarRefs.current) {
        const rect = el.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom) {
          targetGroupRef.current = gid;
          setDragInsertGroupId(gid);
          const scrollLeft = el.scrollLeft;
          const mouseX = clientX - rect.left + scrollLeft;
          const tabEls = el.querySelectorAll<HTMLElement>(".group-tab-item");
          let idx = 0;
          for (let i = 0; i < tabEls.length; i++) {
            const tr = tabEls[i].getBoundingClientRect();
            const midX = tr.left - rect.left + tr.width / 2 + scrollLeft;
            if (mouseX < midX) break;
            idx = i + 1;
          }
          // 同组内拖拽：插入位置需补偿被拖走标签页的偏移
          if (gid === sourceGroupRef.current && idx > fromIndex) idx--;
          return idx;
        }
      }
      return fromIndex;
    },

    // ── findOtherContainer：检测鼠标是否在另一个 TabBar 上（跨 group 移动）──
    findOtherContainer: (clientX, clientY, ownContainer) => {
      for (const [gid, el] of tabBarRefs.current) {
        if (el === ownContainer) continue;
        // E5.7#86：排除源组——本组标签栏不算"其他容器"，松手在本组 = 重排（onReorder 提交）。
        // 原 el===ownContainer 是死判断（ownContainer 是区根元素非标签栏）——同组松手被误判为
        // "移到本组" → moveTab 同组 no-op → 排序从未提交（探针日志证实 onReorder 零触发）。
        if (gid === sourceGroupRef.current) continue;
        const rect = el.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom) {
          return gid;
        }
      }
      return null;
    },

    // ── computeSplitZone：per-panel 检测（遍历每个绝对定位 panel div 的 rect）──
    computeSplitZone: (clientX, clientY) => {
      if (!containerRef.current) return null;
      const panelEls = containerRef.current.querySelectorAll<HTMLElement>("[data-group-id]");
      for (const panelEl of panelEls) {
        const rect = panelEl.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom) {
          const zone = detectDropZone(clientX, clientY, rect);
          return { zone, targetGroupId: panelEl.dataset.groupId };
        }
      }
      // Fallback：容器级 rect（鼠标不在任何面板内——如分隔条上）
      const cr = containerRef.current.getBoundingClientRect();
      return { zone: detectDropZone(clientX, clientY, cr), targetGroupId: undefined };
    },

    // ── isInPureEditor：鼠标不在任何 TabBar 上 + 在容器编辑器区域 ──
    isInPureEditor: (clientX, clientY) => {
      for (const [, el] of tabBarRefs.current) {
        const rect = el.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom) {
          return false;
        }
      }
      if (!containerRef.current) return false;
      const cr = containerRef.current.getBoundingClientRect();
      return clientX >= cr.left && clientX <= cr.right &&
             clientY >= cr.top + TAB_BAR_HEIGHT && clientY <= cr.bottom;
    },

    // ── 回调 ──

    onReorder: (tabId, toIndex) => {
      const gid = targetGroupRef.current;
      if (!gid) return;
      const sourceGroup = groupsRef.current.find((g) => g.tabs.some((t) => t.id === tabId));
      if (!sourceGroup) return;
      const fromIdx = sourceGroup.tabs.findIndex((t) => t.id === tabId);
      if (fromIdx < 0) return;
      // E5.7#86：回执对齐——记录拖前序 + 提交序。松手后 draggingId 置空、dragLocalTabs 释放，
      // 无覆盖则回执前渲染壳侧旧序一帧（回闪——分隔线同款提前释放）。pendingReordersRef.tabs
      // 在 getEffectiveTabs 顶替壳推送，回执 effect 对齐壳推流后才释放。
      const committedTabs = [...sourceGroup.tabs];
      const [movedTab] = committedTabs.splice(fromIdx, 1);
      committedTabs.splice(Math.min(toIndex, committedTabs.length), 0, movedTab);
      pendingReordersRef.current.set(gid, {
        preDragIds: sourceGroup.tabs.map((t) => t.id),
        committedIds: committedTabs.map((t) => t.id),
        tabs: committedTabs,
      });
      tabAction({
        action: "reorderTab",
        groupId: gid,
        tabId,
        newIndex: toIndex,
        oldIndex: fromIdx,
      });
    },

    onMoveToOther: (tabId, targetGroupId) => {
      // E5.7#96：契约 targetGroupId: string——ref 可为 null（any 时代 null 会透传，
      // 壳 find 不到组静默 no-op），提前空守卫
      const gid = targetGroupId ?? targetGroupRef.current;
      if (!gid) return;
      tabAction({
        action: "moveTab",
        tabId,
        targetGroupId: gid,
      });
    },

    onDropSplit: (tabId, zone, targetGroupId) => {
      const direction = zone === "left" || zone === "right" ? "horizontal" : "vertical";
      tabAction({
        action: "splitTab",
        tabId,
        direction,
        zone,
        targetGroupId,
      });
    },

    onDragDropZone: (zone, targetGroupId) => {
      setDropZoneState(zone ? { zone, targetGroupId: targetGroupId ?? null } : null);
    },
    // E5.8#44-B：窗口外释放 → tabAction（壳侧命中检测：TabBar→并窗 / 空白→新窗）——恒启用（拖出即手势）
    onReleaseOutside: (tabId, screenX, screenY) => tabAction({ action: "releaseOutsideWindow", tabId, screenX, screenY }),
    // E5.8#44-C：拎起后全程上报拖拽位置（壳排除源窗命中——窗内自然清提示，窗外命中目标窗 TabBar 高亮）
    onDragPosition: (pos) => dragPosition?.(pos),
  });

  // ── dragLocalTabs：同组拖拽时乐观重排标签页（视觉反馈）──
  const dragLocalTabs = useMemo(() => {
    if (!draggingId || dragInsertIndex == null) return null;
    const gs = groups; // E5.7#99：memo 直接读 groups（270 行同 render 已同步 ref）——render 期读 ref 有并发撕裂隐患
    for (const g of gs) {
      const srcIdx = g.tabs.findIndex((t) => t.id === draggingId);
      if (srcIdx >= 0) {
        const tabs = [...g.tabs];
        const [moved] = tabs.splice(srcIdx, 1);
        tabs.splice(Math.min(dragInsertIndex, tabs.length), 0, moved);
        return { [g.id]: tabs };
      }
    }
    return null;
  }, [draggingId, dragInsertIndex, groups]);

  // ── Get effective tabs for a group（drag-local or original）──
  const getEffectiveTabs = useCallback(
    (groupId: string, group: PoolGroup): PoolTab[] => {
      if (dragLocalTabs?.[groupId]) return dragLocalTabs[groupId];
      // E5.7#86：回执对齐——pending 覆盖优先于壳推送（松手后、回执前保持提交序不闪）
      const pending = pendingReordersRef.current.get(groupId);
      if (pending) return pending.tabs;
      return group.tabs;
    },
    [dragLocalTabs],
  );

  // ── startDrag wrapper：捕获源 group ──
  const handleTabDragStart = useCallback((tabId: string, index: number, e: ReactMouseEvent) => {
    const gs = groupsRef.current;
    const sourceGroup = gs.find((grp) => grp.tabs.some((t) => t.id === tabId));
    if (sourceGroup) {
      sourceGroupRef.current = sourceGroup.id;
      targetGroupRef.current = sourceGroup.id;
      setDragInsertGroupId(sourceGroup.id);
    }
    startDrag(tabId, index, e);
  }, [startDrag]);

  return {
    draggingId,
    dragInsertIndex,
    dragInsertGroupId,
    dropZoneState,
    previewPos,
    registerTabBar,
    getEffectiveTabs,
    handleTabDragStart,
  };
}
