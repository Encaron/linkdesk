/**
 * MainZone——E5.7#20。主区渲染。
 *
 * 从 src/pool/main/MainRenderer.tsx 693 行行为零丢失提取（吸收 E5.7#7 TabBarZone——
 * tab bar 不独立成 zone，收在 panel 内 per-panel GroupTabBar）。
 * 接收 PoolLayout v2 的 groups / root / creatableViews 切片。
 * 提取原则：内联逻辑原样提取——useDragReorder（275 行 15+ 轮 bug 验证）不重写；
 * useSplitResize / useTabDropPreview 拆分是可选重构，非本任务。
 * 验收 13 项见 E5.7-执行清单 #20。🔴 源文件 MainRenderer.tsx 由 #24 删除（本任务只提取+挂载）。
 *
 * E5.6#16.7：从平铺 groups.map → SplitNode 树驱动的绝对定位平铺渲染。
 *   🔴 B22 防护：所有面板绝对定位平级渲染（key=groupId 永远同级），
 *   树只用来算 x/y/w/h 百分比。分屏/合屏时面板 DOM 深度不变 → React 不 unmount。
 *   不要改回递归 flex 嵌套——DOM 深度变化会丢 Monaco/CM6 状态（B22 教训）。
 *
 * E5.6#16.5：TabBar 迁入——每个 group 自包含。
 * 壳不再渲染 TabBar/SplitPane/TabPanePositioner。
 *
 * 全局拖拽协调者——同 group 重排 + 跨 group 移动 + 拖到编辑区分屏。
 * 拖出窗口检测（useDragDetach）：~~Phase 8 #33~~ 已推迟 v1.3（脱出窗口设计.md）——接入点注记保留（原 #7 TabBarZone 占位迁此）。
 *
 * 🔴 Path B：不 import @src/core/* 运行时模块（import type 除外）——
 *   动作回传走 window.linkdesk.pool.tabAction（聪慧→哑：壳是唯一真相源）。
 */

import { useState, useRef, useCallback, useMemo, useReducer, useEffect, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import ErrorBoundary from "../../shared/error-boundary/ErrorBoundary"; // E5.7#20：池侧版（不 import 壳 components 目录）
import PluginComponent from "../../shared/plugin-component/PluginComponent";
import GroupTabBar from "../../shared/group-tab-bar/GroupTabBar";
import ShellViewRenderer from "../../views/shell-renderer/ShellViewRenderer";
import type { PoolGroup, PoolTab } from "../../../core/types/pool/poolLayout";
import type { SplitNode } from "../../../core/utils/splitTree";
import { getAllLeafGroupIds } from "../../../core/utils/splitTree";
import type { DropZone } from "../../hooks/tabDragTypes";
import type { PoolTabAction } from "../../../core/types/ipc/tabActions"; // E5.7#96：池→壳 tab 动作 wire 契约
import type { LinkDeskAPI } from "../../../core/api/linkdesk-api"; // E5.7#98：pool 命名空间契约类型
import { detectDropZone } from "../../hooks/tabDragTypes";
import { Z_INDEX } from "../../../constants"; // E5.7#26：浮层层级常量表（替代 9999/99999 裸数字）
import { useDragReorder } from "../../hooks/useDragReorder";

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

const TAB_BAR_HEIGHT = 35;

// ═══════════════════════════════════════════════════════════
// Branch key helpers
// ═══════════════════════════════════════════════════════════

function firstLeafId(node: SplitNode): string {
  if (node.type === "leaf") return node.groupId;
  return firstLeafId(node.children[0]);
}

function getBranchKey(node: SplitNode & { type: "branch" }): string {
  return `${firstLeafId(node.children[0])}|${firstLeafId(node.children[1])}`;
}

// ═══════════════════════════════════════════════════════════
// Absolute Layout Computation（B22 防护——平级渲染，key=groupId 永远同级）
// ═══════════════════════════════════════════════════════════

interface PanelRect {
  groupId: string;
  x: number; y: number; w: number; h: number;
}

interface HandleRect {
  branchIndex: number;
  direction: "horizontal" | "vertical";
  x: number; y: number; w: number; h: number;
  /** 当前有效 sizes（含 localSizesRef 覆盖）——onMouseDown 时作为起始值 */
  sizes: [number, number];
}

/** Handle 宽度/高度占容器的百分比——对标旧 SplitPane 的 0.4 */
const HANDLE_PCT = 0.4;

/**
 * 从 SplitNode 树递归计算所有面板 + 分割条的百分比 rect。
 * 面板全部平级——key=groupId 永远同级，树变化只改 x/y/w/h，不触发 unmount。
 *
 * 🔴 不要改回递归 flex 嵌套——B22 教训：DOM 深度变化 → React unmount → 编辑器状态丢失。
 */
function computeLayout(
  node: SplitNode,
  x: number, y: number, w: number, h: number,
  branchIndices: Map<string, number>,
  localSizes: Map<number, [number, number]>,
): { panels: PanelRect[]; handles: HandleRect[] } {
  if (node.type === "leaf") {
    return { panels: [{ groupId: node.groupId, x, y, w, h }], handles: [] };
  }

  const branchIdx = branchIndices.get(getBranchKey(node));
  const effective = branchIdx != null ? (localSizes.get(branchIdx) ?? node.sizes) : node.sizes;
  const total = effective[0] + effective[1];
  const s0 = total > 0 ? effective[0] / total : 0.5;
  const s1 = total > 0 ? effective[1] / total : 0.5;

  if (node.direction === "horizontal") {
    const w0 = w * s0;
    const w1 = w * s1;
    const left = computeLayout(node.children[0], x, y, w0, h, branchIndices, localSizes);
    const right = computeLayout(node.children[1], x + w0 + HANDLE_PCT, y, w1, h, branchIndices, localSizes);
    const handle: HandleRect = {
      branchIndex: branchIdx ?? 0,
      direction: "horizontal",
      x: x + w0, y,
      w: HANDLE_PCT, h,
      sizes: [effective[0], effective[1]],
    };
    return { panels: [...left.panels, ...right.panels], handles: [...left.handles, handle, ...right.handles] };
  } else {
    const h0 = h * s0;
    const h1 = h * s1;
    const top = computeLayout(node.children[0], x, y, w, h0, branchIndices, localSizes);
    const bottom = computeLayout(node.children[1], x, y + h0 + HANDLE_PCT, w, h1, branchIndices, localSizes);
    const handle: HandleRect = {
      branchIndex: branchIdx ?? 0,
      direction: "vertical",
      x, y: y + h0,
      w, h: HANDLE_PCT,
      sizes: [effective[0], effective[1]],
    };
    return { panels: [...top.panels, ...bottom.panels], handles: [...top.handles, handle, ...bottom.handles] };
  }
}

// ═══════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════

interface MainZoneProps {
  groups: PoolGroup[];
  root?: SplitNode;
  /** E5.6#16.7k-3：可创建为标签页的视图——GroupTabBar [+] 按钮动态菜单 */
  creatableViews?: { pluginId: string; label: string }[];
}

// ═══════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════

export default function MainZone({ groups, root, creatableViews }: MainZoneProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Pool API（E5.7#98：LinkDeskAPI["pool"] 契约类型替代 any）──
  const poolApiRef = useRef<NonNullable<LinkDeskAPI["pool"]> | null>(null);
  if (!poolApiRef.current) {
    poolApiRef.current = window.linkdesk?.pool ?? null;
  }
  const tabAction = useCallback((action: PoolTabAction) => {
    poolApiRef.current?.tabAction?.(action);
  }, []);

  // ── Group map ──
  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  // ── Branch indices (pre-order, matches updateBranchSizesByIndex) ──
  // E5.7#86：同时建 index→branch 反查表——回执对齐 effect 用（读推送分支的当前 sizes）
  const { branchIndices, branchNodesByIndex } = useMemo(() => {
    const keyMap = new Map<string, number>();
    const nodeMap = new Map<number, SplitNode & { type: "branch" }>();
    let counter = 1;
    function walk(node: SplitNode): void {
      if (node.type === "branch") {
        keyMap.set(getBranchKey(node), counter);
        nodeMap.set(counter, node);
        counter++;
        walk(node.children[0]);
        walk(node.children[1]);
      }
    }
    if (root) walk(root);
    return { branchIndices: keyMap, branchNodesByIndex: nodeMap };
  }, [root]);

  // ── Tab bar DOM refs (MainZone reads bounding rects during drag) ──
  const tabBarRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const registerTabBar = useCallback((groupId: string, el: HTMLDivElement | null) => {
    if (el) tabBarRefs.current.set(groupId, el);
    else tabBarRefs.current.delete(groupId);
  }, []);

  // ═════════════════════════════════════════════════════════
  // Divider Drag（per-branch local sizes）
  // ═════════════════════════════════════════════════════════

  const localSizesRef = useRef<Map<number, [number, number]>>(new Map());
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  const dividerDragRef = useRef<{
    branchIndex: number;
    direction: "horizontal" | "vertical";
    startPos: number;
    startSizes: [number, number];
    containerSize: number;
  } | null>(null);
  // E5.7#86：松手后待回执的分支——本地覆盖保留到壳 pushLayout 回执携带已提交尺寸为止。
  // SidebarZone E5.7#13 同款回执对齐：过早释放 = 下一帧渲染壳侧旧尺寸 → 分隔线回闪
  //（实机验证发现：拖完松手瞬间闪回拖前位置再跳回）。
  const pendingSplitsRef = useRef<Map<number, { preDrag: [number, number]; committed: [number, number] }>>(new Map());
  // E5.7#86：同组标签排序的待回执记录——乐观提交序保留到壳 pushLayout 回执（分隔线同款回执对齐）
  const pendingReordersRef = useRef<Map<string, { preDragIds: string[]; committedIds: string[]; tabs: PoolTab[] }>>(new Map());

  const onDividerMouseDown = useCallback(
    (
      branchIdx: number,
      direction: "horizontal" | "vertical",
      e: ReactMouseEvent,
      sizes: [number, number],
      containerSize: number,
    ) => {
      // 仅左键拖拽——右键/中键不触发 resize（SidebarZone handleResizeStart 同款守卫）
      if (e.button !== 0) return;
      e.preventDefault();
      const startPos = direction === "horizontal" ? e.clientX : e.clientY;
      dividerDragRef.current = {
        branchIndex: branchIdx,
        direction,
        startPos,
        startSizes: sizes,
        containerSize,
      };

      const onMouseMove = (ev: MouseEvent) => {
        const ds = dividerDragRef.current;
        if (!ds || ds.containerSize <= 0) return;
        const currentPos = ds.direction === "horizontal" ? ev.clientX : ev.clientY;
        const delta = currentPos - ds.startPos;
        const deltaPct = (delta / ds.containerSize) * 100;
        const combined = ds.startSizes[0] + ds.startSizes[1];
        const newLeft = Math.max(5, Math.min(combined - 5, ds.startSizes[0] + deltaPct));
        const newRight = combined - newLeft;
        localSizesRef.current.set(ds.branchIndex, [newLeft, newRight]);
        forceUpdate();
      };

      const onMouseUp = () => {
        const ds = dividerDragRef.current;
        dividerDragRef.current = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        if (!ds) return;

        const local = localSizesRef.current.get(ds.branchIndex);
        if (!local) return;
        const combined = local[0] + local[1];
        if (combined <= 0) return;
        const leftPct = Math.round((local[0] / combined) * 100);
        const rightPct = 100 - leftPct;

        // E5.7#86：保留本地覆盖直到回执（不立刻删）——立刻删会让下一帧回退渲染壳侧
        // 旧尺寸（松手回闪）。壳提交 → pushLayout 回执到达后由回执对齐 effect 释放。
        pendingSplitsRef.current.set(ds.branchIndex, {
          preDrag: ds.startSizes,
          committed: [leftPct, rightPct],
        });

        tabAction({
          action: "updateSplitSizes",
          anchorGroupId: "",
          sizes: [leftPct, rightPct] as [number, number],
          branchIndex: ds.branchIndex,
        });
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [tabAction],
  );

  // E5.7#86：回执对齐——壳 pushLayout 到达后，对每个待回执分支：
  //   推送尺寸 ≠ 拖前尺寸（壳已采纳新值）或 == 提交值（壳原样回存）→ 释放本地覆盖。
  // 仍带拖前尺寸的推送 = 迟到的旧推送（拖拽期间无关 tabState 变化触发）→ 保留覆盖。
  useEffect(() => {
    if (pendingSplitsRef.current.size === 0 || !root) return;
    for (const [branchIdx, pending] of pendingSplitsRef.current) {
      const branch = branchNodesByIndex.get(branchIdx);
      // 分支已从树中消失（等待期间被合屏）→ 覆盖无意义，直接释放
      if (!branch) {
        localSizesRef.current.delete(branchIdx);
        pendingSplitsRef.current.delete(branchIdx);
        forceUpdate();
        continue;
      }
      const pushed = branch.sizes;
      const released =
        pushed[0] !== pending.preDrag[0] || pushed[1] !== pending.preDrag[1] ||
        (pushed[0] === pending.committed[0] && pushed[1] === pending.committed[1]);
      if (released) {
        localSizesRef.current.delete(branchIdx);
        pendingSplitsRef.current.delete(branchIdx);
        forceUpdate();
      }
    }
  }, [root, branchNodesByIndex]);

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

  // ═════════════════════════════════════════════════════════
  // Tab Drag Coordinator——useDragReorder（275 行，15+ 轮 bug 修复验证）
  // 🔴 拖出窗口检测接入点：useDragDetach（#33）已推迟 v1.3（脱出窗口设计.md）——届时在此接入。
  // ═════════════════════════════════════════════════════════

  // Stable groups ref——avoid useCallback deps on groups
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const totalTabCount = groups.reduce((sum, g) => sum + g.tabs.length, 0);
  const sourceGroupRef = useRef<string | null>(null);
  const targetGroupRef = useRef<string | null>(null);
  const [dragInsertGroupId, setDragInsertGroupId] = useState<string | null>(null);
  const [dropZoneState, setDropZoneState] = useState<{ zone: DropZone; targetGroupId: string | null } | null>(null);

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

  // ═════════════════════════════════════════════════════════
  // renderGroupPane——单个 group 的内容（TabBar + keep-alive 标签页内容区）
  // ═════════════════════════════════════════════════════════

  function renderGroupPane(group: PoolGroup): React.ReactNode {
    return (
      <>
        <ErrorBoundary pluginId={`pool-tabbar:${group.id}`}>
          <GroupTabBar
            groupId={group.id}
            tabs={getEffectiveTabs(group.id, group)}
            activeTabId={group.activeTabId}
            draggingId={draggingId ?? undefined}
            dragInsertIndex={dragInsertGroupId === group.id ? dragInsertIndex : null}
            onTabDragStart={handleTabDragStart}
            onTabBarMount={(el) => registerTabBar(group.id, el)}
            creatableViews={creatableViews}
          />
        </ErrorBoundary>
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {group.tabs.map((tab) => (
            <div
              key={tab.id}
              style={{
                display: tab.id === group.activeTabId ? "flex" : "none",
                flexDirection: "column",
                height: "100%",
              }}
            >
              {tab.shellRendered ? (
                <ErrorBoundary pluginId={tab.pluginId}>
                  <ShellViewRenderer
                    tab={tab}
                    isActive={tab.id === group.activeTabId}
                    creatableViews={creatableViews}
                  />
                </ErrorBoundary>
              ) : (
                <ErrorBoundary pluginId={tab.pluginId}>
                  <PluginComponent
                    pluginId={tab.pluginId}
                    tabId={tab.id}
                    sourceId={tab.sourceId}
                    isActive={tab.id === group.activeTabId}
                  />
                </ErrorBoundary>
              )}
            </div>
          ))}
        </div>
      </>
    );
  }

  // ═════════════════════════════════════════════════════════
  // Render
  // ═════════════════════════════════════════════════════════

  if (groups.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--text-muted, #888)",
          fontSize: 13,
          userSelect: "none",
        }}
      >
        {t("没有打开的标签页")}
      </div>
    );
  }

  // 🔴 B22 防护：多面板 → 绝对定位平级渲染。单面板 → flex fallback。
  const useAbsolute = root && getAllLeafGroupIds(root).length > 1;

  // computeLayout 在 render 期间调用（非 memo——O(n) 极轻，始终读最新 localSizesRef）
  const layout = useAbsolute
    ? computeLayout(root!, 0, 0, 100, 100, branchIndices, localSizesRef.current)
    : null;

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flex: 1,
        height: "100%",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {useAbsolute && layout ? (
        // ── 绝对定位模式：所有面板平级兄弟（key=groupId 永远同级）──
        <>
          {layout.panels.map((p) => {
            const group = groupMap.get(p.groupId);
            if (!group) return null;
            return (
              <div
                key={p.groupId}
                data-group-id={p.groupId}
                style={{
                  position: "absolute",
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: `${p.w}%`,
                  height: `${p.h}%`,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                {renderGroupPane(group)}
              </div>
            );
          })}
          {layout.handles.map((h) => {
            const isH = h.direction === "horizontal";
            return (
              <div
                key={`handle-${h.branchIndex}`}
                style={{
                  position: "absolute",
                  left: `${h.x}%`,
                  top: `${h.y}%`,
                  width: `${h.w}%`,
                  height: `${h.h}%`,
                  cursor: isH ? "col-resize" : "row-resize",
                  zIndex: Z_INDEX.splitHandle,
                  // 分隔线始终可见——对标 VS Code sash，默认 subtle，hover accent
                  background: "var(--separator)",
                  transition: "background 150ms ease",
                }}
                onMouseDown={(e) => {
                  const cr = containerRef.current?.getBoundingClientRect();
                  const containerSize = cr ? (isH ? cr.width : cr.height) : 0;
                  onDividerMouseDown(h.branchIndex, h.direction, e, h.sizes, containerSize);
                }}
                onDoubleClick={() => {
                  // 双击重置为 50/50
                  tabAction({
                    action: "updateSplitSizes",
                    anchorGroupId: "",
                    sizes: [50, 50] as [number, number],
                    branchIndex: h.branchIndex,
                  });
                }}
                onMouseEnter={(ev) => {
                  if (!dividerDragRef.current) {
                    (ev.target as HTMLElement).style.background = "var(--accent)";
                  }
                }}
                onMouseLeave={(ev) => {
                  if (!dividerDragRef.current) {
                    (ev.target as HTMLElement).style.background = "var(--separator)";
                  }
                }}
              />
            );
          })}
        </>
      ) : (
        // ── 单面板 fallback：flex 填充 ──
        groups.map((group) => (
          <div
            key={group.id}
            data-group-id={group.id}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              minWidth: 0,
            }}
          >
            {renderGroupPane(group)}
          </div>
        ))
      )}

      {/* ═══ 分屏预览 overlay——Glassmorphism 对标 VS Code editorDropTarget ═══
           🔥 E5.6#16.7：毛玻璃半区叠加层。
           设计决策（ui-ux-pro-max Glassmorphism）：
           - 拒绝 dashed 虚线边框 → 改用内发光 box-shadow 定义区域边界
           - backdrop-filter: blur(6px) 毛玻璃散射面（不是全屏模糊，只作用于半区）
           - 固态 hairline 边框（1px solid，低透明度）——轻微可见但不抢眼
           - pointer-events: none 不拦截拖拽事件 */}
      {dropZoneState && dropZoneState.zone !== "center" && (() => {
        // 精确到目标 panel 的位置（百分比），单面板/fallback 用 inset:0
        let bounds: React.CSSProperties = { left: 0, top: 0, width: "100%", height: "100%" };
        if (useAbsolute && layout && dropZoneState.targetGroupId) {
          const p = layout.panels.find((pp) => pp.groupId === dropZoneState.targetGroupId);
          if (p) {
            bounds = { left: `${p.x}%`, top: `${p.y}%`, width: `${p.w}%`, height: `${p.h}%` };
          }
        }

        const zone = dropZoneState.zone;
        const zoneStyle =
          zone === "left"   ? { top: 0, left: 0, width: "50%", height: "100%" }
        : zone === "right"  ? { top: 0, right: 0, width: "50%", height: "100%" }
        : zone === "up"     ? { top: 0, left: 0, width: "100%", height: "50%" }
                             : { bottom: 0, left: 0, width: "100%", height: "50%" };

        return (
          <div style={{
            position: "absolute",
            ...bounds,
            zIndex: Z_INDEX.dropZone,
            pointerEvents: "none",
          }}>
            <div
              className="drop-glass-zone"
              style={zoneStyle}
            />
          </div>
        );
      })()}

      {/* ═══ Drag preview portal（document.body 避免 B34 裁剪）═══ */}
      {draggingId &&
        previewPos &&
        createPortal(
          (() => {
            const gs = groupsRef.current;
            const tab = gs.flatMap((grp) => grp.tabs).find((tb) => tb.id === draggingId);
            if (!tab) return null;
            return (
              <div
                style={{
                  position: "fixed",
                  left: previewPos.x,
                  top: previewPos.y,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 12px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-normal)",
                  borderRadius: 4,
                  color: "var(--text-primary)",
                  fontSize: 13,
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
                  pointerEvents: "none",
                  zIndex: Z_INDEX.dragPreview,
                }}
              >
                {tab.icon &&
                  (tab.icon.length <= 2 && /[\p{Emoji}]/u.test(tab.icon) ? (
                    <span>{tab.icon}</span>
                  ) : (
                    <img
                      style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.8 }}
                      src={tab.icon}
                      alt=""
                    />
                  ))}
                <span>{tab.title}</span>
              </div>
            );
          })(),
          document.body,
        )}
    </div>
  );
}
