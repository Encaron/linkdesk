/**
 * useTabDrag——MainZone 全局标签拖拽协调者（useDragReorder 接线，275 行 15+ 轮 bug 修复验证不重写）。
 * E5.8#0d.10-6b：自 MainZone.tsx 拆出——groupsRef / totalTabCount / sourceGroupRef / targetGroupRef /
 *   dragInsertGroupId / dropZoneState + useDragReorder 8 回调（computeInsertIndex / findOtherContainer /
 *   computeSplitZone / isInPureEditor / onReorder / onMoveToOther / onDropSplit / onDragDropZone）+
 *   getEffectiveTabs / handleTabDragStart + 标签排序回执 effect + pendingReordersRef +
 *   tabBarRefs / registerTabBar。
 * 依赖方向：useTabDrag → useDragReorder + ./layout（TAB_BAR_HEIGHT）+ core types；无反向。
 * 🔴 拖出窗口检测接入点：useDragDetach（#33）已推迟 v1.3（脱出窗口设计.md）——届时在此接入。
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type * as React from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { PoolGroup, PoolTab } from "../../../../core/types/pool/poolLayout";
import type { DropZone } from "../../../hooks/tabDragTypes";
import { detectDropZone, computeTabInsertIndex } from "../../../hooks/tabDragTypes";
import type { PoolTabAction } from "../../../../core/types/ipc/tabActions"; // E5.7#96：池→壳 tab 动作 wire 契约
import type { TabBarViewportRect, TabDragPositionPayload, AdsorbHintPayload } from "../../../../core/types/ipc/poolActions"; // E5.8#44-B/#44-C：TabBar rect + 拖拽位置上报契约
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
  /** E5.8#44-C：吸附提示订阅（壳→池——跨窗拖拽命中本窗 TabBar 时下发目标组插入指示）。返回退订。MainZone 传 pool.onAdsorbHint 包装 */
  onAdsorbHint?: (cb: (hint: AdsorbHintPayload) => void) => () => void;
  /** E5.8#46.10：吸附插入缝隙上报（池→壳——目标池算竖线落点后上报，壳存注册表供释放并窗精确落位）。MainZone 传 pool.adsorbIndex 包装 */
  adsorbIndex?: (payload: { groupId: string; insertIndex: number }) => void;
}

export function useTabDrag({ containerRef, tabAction, groups, tabBarRects, dragPosition, onAdsorbHint, adsorbIndex }: UseTabDragInput) {
  // Stable groups ref——avoid useCallback deps on groups
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  // E5.8#46.19 进化：幽灵外观主题色缓存——拖拽启动时 getComputedStyle 读一次（preload-pool theme:changed 把变量
  // setProperty 到 documentElement，读得当前主题纯 hex）。拖拽期间不重读（mousemove 高频）；下次拖拽启动重读
  // （主题可能已切换）。取值可能为空串（dev 预览无 preload 注入）——透传后主进程 applyContent 空串守卫跳过，
  // 幽灵保持默认中灰（设计的降级路径，非硬编码 hex）。
  const ghostAppearanceRef = useRef<{ bg: string; border: string; text: string } | null>(null);
  const readGhostAppearance = (): { bg: string; border: string; text: string } => {
    const cs = getComputedStyle(document.documentElement);
    return {
      bg: cs.getPropertyValue("--bg-card").trim(),
      border: cs.getPropertyValue("--border").trim(),
      text: cs.getPropertyValue("--text-primary").trim(),
    };
  };

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

  // E5.8#44-C：吸附提示订阅——壳→池（windowRelocation handleDragPosition 按 target windowId 定向下发）。
  // 提示自带生命周期（命中发 groupId+viewport / 拖回·取消·释放·窗口增删发 null）→ 直写 state，零本地兜底清逻辑
  //（被动目标窗可能同时自己也在拖——本地按 draggingId 清会误清别人的吸附指示）。
  // E5.8#46.10：groupId 命中时用 viewportX 算插入缝隙（复用 computeTabInsertIndex——本地拖拽同一算法，归一化）→
  // 渲染竖线 + 上报缝隙（壳存注册表，释放并窗落位 = 竖线）。viewport 缺失（旧壳/异常载荷）→ 保守清指示。
  useEffect(() => {
    if (!onAdsorbHint) return;
    const unsub = onAdsorbHint((hint) => {
      if (!hint.groupId || hint.viewportX === undefined) {
        setAdsorbInsert(null);
        return;
      }
      const el = tabBarRefs.current.get(hint.groupId);
      if (!el) {
        setAdsorbInsert(null);
        return;
      }
      const idx = computeTabInsertIndex(el, hint.viewportX);
      setAdsorbInsert({ groupId: hint.groupId, index: idx });
      adsorbIndex?.({ groupId: hint.groupId, insertIndex: idx });
    });
    return unsub;
  }, [onAdsorbHint, adsorbIndex]);

  const totalTabCount = groups.reduce((sum, g) => sum + g.tabs.length, 0);
  const sourceGroupRef = useRef<string | null>(null);
  const targetGroupRef = useRef<string | null>(null);
  const [dragInsertGroupId, setDragInsertGroupId] = useState<string | null>(null);
  const [dropZoneState, setDropZoneState] = useState<{ zone: DropZone; targetGroupId: string | null } | null>(null);
  // E5.8#46.10：吸附插入指示——壳下发 viewport 后算出（{ 目标组, 竖线缝隙 }）。null = 无指示（拖回/取消/释放壳必发 null 清）。
  // 替代原整条高亮（adsorbGroupId）——竖线语义明确（插入到哪根缝），叠窗归属自然清晰（现象二）
  const [adsorbInsert, setAdsorbInsert] = useState<{ groupId: string; index: number } | null>(null);

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
    computeInsertIndex: (clientX, clientY, _container, _fromIndex, _count) => {
      for (const [gid, el] of tabBarRefs.current) {
        const rect = el.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom) {
          targetGroupRef.current = gid;
          setDragInsertGroupId(gid);
          // E5.8#46.10：缝隙计算提取到共享 computeTabInsertIndex——本地拖拽 + 跨窗吸附竖线同一算法（scrollLeft 补偿一处写）
          // E5.8#51：不再实时重排 tab（dragLocalTabs 已删，对标 VS Code 竖线落点模型）——DOM 里 tab 恒原序，
          // computeTabInsertIndex 直接在完整数组上算缝（含被拖 tab），无需「同组 idx > fromIndex 补偿」
          return computeTabInsertIndex(el, clientX);
        }
      }
      return _fromIndex;
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
      // E5.7#86：回执对齐——记录拖前序 + 提交序。松手后 draggingId 置空、dragging 半透明解除，
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

    onMoveToOther: (tabId, targetGroupId, insertIndex) => {
      // E5.7#96：契约 targetGroupId: string——ref 可为 null（any 时代 null 会透传，
      // 壳 find 不到组静默 no-op），提前空守卫
      const gid = targetGroupId ?? targetGroupRef.current;
      if (!gid) return;
      // E5.8#51：跨组拖拽落点带 newIndex（目标组内插入缝 = 竖杠缝隙）——「竖杠落哪插哪」，
      // 不再只显示竖线却 append 末尾。undefined = 未知落点（非拖拽路径）→ 缺省 append。
      tabAction({
        action: "moveTab",
        tabId,
        targetGroupId: gid,
        newIndex: insertIndex ?? undefined,
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
    // E5.8#46.19：附带被拖标签标题——主进程幽灵窗渲染文字（主进程不持 tabState，标题由池上报）
    // E5.8#46.19 进化：附带幽灵外观——主题三色（拖拽启动缓存）+ 图标（E6#69g 判别联合 → 幽灵窗 emoji/img）。
    onDragPosition: (pos) => {
      const srcGroup = groupsRef.current.find((g) => g.tabs.some((t) => t.id === pos.tabId));
      const tab = srcGroup?.tabs.find((t) => t.id === pos.tabId);
      // E6#69g：tab.icon 已扩 IconBarIcon 判别联合——幽灵窗（主进程独立小窗）只能渲 emoji 文本/img URL，
      // 无 codicon/lucide 字形字体：codicon/lucide 拖出 = 无图标（对标旧行为——codicon 标签 tab.icon 恒 undefined）。
      const srcIcon = tab?.icon;
      const icon = srcIcon && srcIcon.kind === "img" ? srcIcon.src : srcIcon && srcIcon.kind === "emoji" ? srcIcon.text : null;
      const iconKind: "img" | "emoji" | null = srcIcon && srcIcon.kind === "img" ? "img" : srcIcon && srcIcon.kind === "emoji" ? "emoji" : null;
      const theme = ghostAppearanceRef.current ?? readGhostAppearance();
      dragPosition?.({
        ...pos,
        title: tab?.title,
        ghost: { theme, icon, iconKind },
      });
    },
  });

  // ── Get effective tabs for a group ──
  // E5.8#51：dragLocalTabs（同组拖动中每帧 re-splice 乐观重排）已删——对标 VS Code 竖线落点模型：
  // 拖动中 tab 恒原序（被拖 tab .dragging 半透明原位 + DragOverlays 浮层跟手 + 竖线指示落点），
  // 松手才提交落位。不再每帧让位「交替跳动」（用户实机打回：第一个和第三个交替别扭）。
  // 落点唯一指示 = 竖线（computeInsertIndex 缝），落位 = onReorder 提交序 → 壳回执覆盖。
  const getEffectiveTabs = useCallback(
    (groupId: string, group: PoolGroup): PoolTab[] => {
      // E5.7#86：回执对齐——pending 覆盖优先于壳推送（松手后、回执前保持提交序不闪）
      const pending = pendingReordersRef.current.get(groupId);
      if (pending) return pending.tabs;
      return group.tabs;
    },
    [],
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
    // E5.8#46.19 进化：拖拽启动读一次主题色缓存——本次拖拽幽灵外观固定（拖拽期间主题不会切，mousemove 高频不重读）
    ghostAppearanceRef.current = readGhostAppearance();
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
    // E5.8#46.10：吸附插入指示（{ 目标组, 竖线缝隙 }）——MainZone 按组解析传给 GroupPane → GroupTabBar 渲染竖线（替代整条高亮）
    adsorbInsert,
  };
}
