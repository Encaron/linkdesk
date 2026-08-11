/**
 * MainRenderer——E5.6#7c, #16, #16.5, #16.7。
 *
 * MainPool 的 React 渲染器。接收壳推送的 PoolGroup[] + 可选 SplitNode root。
 *
 * E5.6#16.7：从平铺 groups.map → SplitNode 树驱动的绝对定位平铺渲染。
 *   🔴 B22 防护：所有面板绝对定位平级渲染（key=groupId 永远同级），
 *   树只用来算 x/y/w/h 百分比。分屏/合屏时面板 DOM 深度不变 → React 不 unmount。
 *   不要改回递归 flex 嵌套——DOM 深度变化会丢 Monaco/CM6 状态（B22 教训）。
 *
 * E5.6#16.5：TabBar 迁入 MainPool——每个 group 自包含。
 * 壳不再渲染 TabBar/SplitPane/TabPanePositioner。
 *
 * MainRenderer 成为全局拖拽协调者——同 group 重排 + 跨 group 移动 + 拖到编辑区分屏。
 */

import { useState, useRef, useCallback, useEffect, useMemo, useReducer, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import ErrorBoundary from "../components/shared/ErrorBoundary";
import PluginComponent from "./PluginComponent";
import GroupTabBar from "./GroupTabBar";
import type { PoolGroup, PoolTab } from "../core/types/poolLayout";
import type { SplitNode } from "../hooks/splitTree";
import { getAllLeafGroupIds } from "../hooks/splitTree";
import type { DropZone } from "../hooks/tabDragTypes";
import { detectDropZone } from "../hooks/tabDragTypes";

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

interface MainRendererProps {
  groups: PoolGroup[];
  root?: SplitNode;
}

// ═══════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════

export default function MainRenderer({ groups, root }: MainRendererProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Pool API ──
  const poolApiRef = useRef<any>(null);
  if (!poolApiRef.current) {
    poolApiRef.current = (window as any).linkdesk?.pool;
  }
  const tabAction = useCallback((action: any) => {
    poolApiRef.current?.tabAction?.(action);
  }, []);

  // ── Group map ──
  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  // ── Branch indices (pre-order, matches updateBranchSizesByIndex) ──
  const branchIndices = useMemo(() => {
    const map = new Map<string, number>();
    let counter = 1;
    function walk(node: SplitNode): void {
      if (node.type === "branch") {
        map.set(getBranchKey(node), counter++);
        walk(node.children[0]);
        walk(node.children[1]);
      }
    }
    if (root) walk(root);
    return map;
  }, [root]);

  // ── Tab bar DOM refs (MainRenderer reads bounding rects during drag) ──
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

  const onDividerMouseDown = useCallback(
    (
      branchIdx: number,
      direction: "horizontal" | "vertical",
      e: ReactMouseEvent,
      sizes: [number, number],
      containerSize: number,
    ) => {
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

        // Clear local size so next pushLayout takes effect
        localSizesRef.current.delete(ds.branchIndex);
        forceUpdate();

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

  // ═════════════════════════════════════════════════════════
  // Tab Drag Coordinator（lifted from GroupTabBar → global）
  // ═════════════════════════════════════════════════════════

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPhase, setDragPhase] = useState<"reorder" | "split" | null>(null);
  const [dragInsertIndex, setDragInsertIndex] = useState<number | null>(null);
  const [dragInsertGroupId, setDragInsertGroupId] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<DropZone>(null);
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(null);
  const [dragLocalTabs, setDragLocalTabs] = useState<Record<string, PoolTab[]>>({});

  const dragRef = useRef<{
    tabId: string;
    sourceGroupId: string;
    sourceIndex: number;
    startX: number;
    startY: number;
    currentIndex: number;
    currentGroupId: string;
    phase: "reorder" | "split";
    dropped: boolean;
  } | null>(null);

  // Stable groups ref——avoid useCallback deps on groups
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const onTabDragStart = useCallback((tabId: string, index: number, e: ReactMouseEvent) => {
    e.preventDefault();
    const gs = groupsRef.current;
    const group = gs.find((grp) => grp.tabs.some((tb) => tb.id === tabId));
    if (!group) return;

    dragRef.current = {
      tabId,
      sourceGroupId: group.id,
      sourceIndex: index,
      startX: e.clientX,
      startY: e.clientY,
      currentIndex: index,
      currentGroupId: group.id,
      phase: "reorder",
      dropped: false,
    };

    setDragLocalTabs({ [group.id]: [...group.tabs] });
    setDraggingId(tabId);
    setDragInsertIndex(index);
    setDragInsertGroupId(group.id);
    setDragPhase("reorder");
    setPreviewPos({ x: e.clientX - 60, y: TAB_BAR_HEIGHT + 5 });
  }, []);

  // Global mousemove / mouseup / Escape for tab drag
  useEffect(() => {
    if (!draggingId) return;

    const onMouseMove = (e: MouseEvent) => {
      const ds = dragRef.current;
      if (!ds || ds.dropped) return;

      setPreviewPos({ x: e.clientX - 60, y: TAB_BAR_HEIGHT + 5 });

      // Detect which tab bar (if any) the mouse is over
      let overGroupId: string | null = null;
      for (const [gid, el] of tabBarRefs.current) {
        const rect = el.getBoundingClientRect();
        if (
          e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom
        ) {
          overGroupId = gid;
          break;
        }
      }

      // Detect if in editor area（not over any tab bar, within container）
      const containerRect = containerRef.current?.getBoundingClientRect();
      const inEditorArea =
        !overGroupId &&
        containerRect &&
        e.clientX >= containerRect.left &&
        e.clientX <= containerRect.right &&
        e.clientY >= containerRect.top + TAB_BAR_HEIGHT &&
        e.clientY <= containerRect.bottom;

      if (inEditorArea) {
        // ── Split phase ──
        ds.phase = "split";
        setDragPhase("split");
        setDragInsertIndex(null);
        setDragInsertGroupId(null);
        if (containerRect) {
          setDropZone(detectDropZone(e.clientX, e.clientY, containerRect));
        }
        return;
      }

      // ── Reorder phase ──
      ds.phase = "reorder";
      setDragPhase("reorder");
      setDropZone(null);

      if (overGroupId) {
        ds.currentGroupId = overGroupId;
      }

      const barEl = tabBarRefs.current.get(ds.currentGroupId);
      if (!barEl) return;

      const barRect = barEl.getBoundingClientRect();
      const mouseX = e.clientX - barRect.left;

      // Compute insert index from current DOM
      const tabEls = barEl.querySelectorAll<HTMLElement>(".group-tab-item");
      const gs = groupsRef.current;
      const targetGroup = gs.find((grp) => grp.id === ds.currentGroupId);
      let insertIdx = targetGroup?.tabs.length ?? 0;
      for (let i = 0; i < tabEls.length; i++) {
        const rect = tabEls[i].getBoundingClientRect();
        const midX = rect.left - barRect.left + rect.width / 2;
        if (mouseX < midX) {
          insertIdx = i;
          break;
        }
      }
      // When reordering within source group: adjust for dragged tab removal
      if (ds.currentGroupId === ds.sourceGroupId && insertIdx > ds.sourceIndex) {
        insertIdx--;
      }

      ds.currentIndex = insertIdx;
      setDragInsertIndex(insertIdx);
      setDragInsertGroupId(ds.currentGroupId);

      // Build optimistic local tabs
      const sourceGroup = gs.find((grp) => grp.id === ds.sourceGroupId);
      const destGroup = gs.find((grp) => grp.id === ds.currentGroupId);
      if (!sourceGroup) return;

      const newLocal: Record<string, PoolTab[]> = {};
      if (ds.currentGroupId === ds.sourceGroupId) {
        // Same-group reorder
        const tabs = [...sourceGroup.tabs];
        const [moved] = tabs.splice(ds.sourceIndex, 1);
        tabs.splice(insertIdx, 0, moved);
        newLocal[ds.sourceGroupId] = tabs;
      } else if (destGroup) {
        // Cross-group move
        const draggedTab = sourceGroup.tabs[ds.sourceIndex];
        newLocal[ds.sourceGroupId] = sourceGroup.tabs.filter((tb) => tb.id !== ds.tabId);
        if (draggedTab) {
          const targetTabs = [...destGroup.tabs];
          targetTabs.splice(insertIdx, 0, draggedTab);
          newLocal[ds.currentGroupId] = targetTabs;
        }
      }
      setDragLocalTabs(newLocal);
    };

    const onMouseUp = (e: MouseEvent) => {
      const ds = dragRef.current;
      if (!ds || ds.dropped) return;
      ds.dropped = true;

      if (ds.phase === "split") {
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (containerRect) {
          const zone = detectDropZone(e.clientX, e.clientY, containerRect);
          if (zone && zone !== "center") {
            const direction = zone === "left" || zone === "right" ? "right" : "down";
            tabAction({ action: "splitTab", tabId: ds.tabId, direction });
          }
        }
      } else if (ds.currentGroupId === ds.sourceGroupId) {
        // Same-group reorder
        if (ds.currentIndex >= 0 && ds.currentIndex !== ds.sourceIndex) {
          tabAction({
            action: "reorderTab",
            groupId: ds.sourceGroupId,
            tabId: ds.tabId,
            newIndex: ds.currentIndex,
            oldIndex: ds.sourceIndex,
          });
        }
      } else {
        // Cross-group move
        tabAction({
          action: "moveTab",
          tabId: ds.tabId,
          targetGroupId: ds.currentGroupId,
          newIndex: ds.currentIndex,
        });
      }

      // Reset all drag state
      dragRef.current = null;
      setDraggingId(null);
      setDragInsertIndex(null);
      setDragInsertGroupId(null);
      setPreviewPos(null);
      setDragPhase(null);
      setDropZone(null);
      setDragLocalTabs({});
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dragRef.current && !dragRef.current.dropped) {
        dragRef.current.dropped = true;
        dragRef.current = null;
        setDraggingId(null);
        setDragInsertIndex(null);
        setDragInsertGroupId(null);
        setPreviewPos(null);
        setDragPhase(null);
        setDropZone(null);
        setDragLocalTabs({});
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [draggingId, tabAction]);

  // ── Get effective tabs for a group（drag-local or original）──
  const getEffectiveTabs = useCallback(
    (groupId: string, group: PoolGroup): PoolTab[] => {
      if (draggingId && dragLocalTabs[groupId]) {
        return dragLocalTabs[groupId];
      }
      return group.tabs;
    },
    [draggingId, dragLocalTabs],
  );

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
            onTabDragStart={onTabDragStart}
            onTabBarMount={(el) => registerTabBar(group.id, el)}
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    color: "var(--text-muted, #888)",
                    fontSize: 12,
                    userSelect: "none",
                  }}
                />
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
                  zIndex: 10,
                  background: "transparent",
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
                    (ev.target as HTMLElement).style.background = "var(--border-normal, #474747)";
                  }
                }}
                onMouseLeave={(ev) => {
                  if (!dividerDragRef.current) {
                    (ev.target as HTMLElement).style.background = "transparent";
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

      {/* ═══ Glass drop zone overlay ═══ */}
      {dragPhase === "split" && dropZone && dropZone !== "center" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 9999,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              background: "rgba(var(--accent-rgb, 0, 120, 212), 0.08)",
            }}
          />
          <div
            style={{
              position: "absolute",
              ...(dropZone === "left"
                ? { top: 0, left: 0, width: "50%", height: "100%" }
                : dropZone === "right"
                ? { top: 0, right: 0, width: "50%", height: "100%" }
                : dropZone === "up"
                ? { top: 0, left: 0, width: "100%", height: "50%" }
                : { bottom: 0, left: 0, width: "100%", height: "50%" }),
              background: "rgba(var(--accent-rgb, 0, 120, 212), 0.15)",
            }}
          />
        </div>
      )}

      {/* ═══ Drag preview float ═══ */}
      {draggingId &&
        previewPos &&
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
                zIndex: 99999,
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
        })()}
    </div>
  );
}
