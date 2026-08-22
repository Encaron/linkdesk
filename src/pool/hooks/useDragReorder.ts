/**
 * useDragReorder — 通用拖拽重排 hook。
 * 封装 window 级 mousemove/mouseup/keydown 事件处理，
 * 支持 reorder ↔ split 双向状态机，可复用于 Phase 5 卡片拖拽。
 *
 * 设计依据：[V3-Phase3-标签页分屏设计.md §9] + Phase 3 审计建议
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { DropZone } from "./tabDragTypes";

/* ── 类型 ── */

type DragPhase = "idle" | "reorder" | "split";

interface DragState {
  tabId: string;
  fromIndex: number;
  toIndex: number;
  startX: number;
  startY: number;
  phase: DragPhase;
  lifted: boolean;
}

export interface UseDragReorderOptions {
  /** 拖拽阈值（px），超过此值才"拎起"标签页。默认 5 */
  threshold?: number;
  /** 分屏切换阈值（px），垂直位移超过此值切到 split 模式。默认 15 */
  splitThreshold?: number;
  /** 可选：编辑器区域 ref，用于检测是否拖到编辑器上空 */
  editorAreaRef?: React.RefObject<HTMLDivElement | null>;
  /** 当前可拖拽的 items 数量（用于判断可否分屏） */
  itemCount: number;

  /* ── 回调 ── */

  /** 重排完成 */
  onReorder: (tabId: string, toIndex: number) => void;
  /** 移到另一个容器（如另一个标签栏）。可选 targetGroupId——中央放手时传目标面板 */
  onMoveToOther?: (tabId: string, targetGroupId?: string) => void;
  /** 拖拽状态变化通知（用于毛玻璃等） */
  onDraggingChange?: (v: boolean) => void;
  /** drop zone 变化通知（分屏模式）。targetGroupId 用于在目标面板内定位毛玻璃 */
  onDragDropZone?: (zone: DropZone, targetGroupId?: string) => void;

  /* ── 布局相关回调（由调用方提供，适应不同布局结构） ── */

  /** 计算重排插入位置。返回目标索引，或 null 表示不显示指示器 */
  computeInsertIndex?: (
    clientX: number,
    clientY: number,
    containerEl: HTMLElement,
    fromIndex: number,
    itemCount: number
  ) => number;
  /** 检测鼠标是否在"纯编辑器区域"（不在任何标签栏上方），用于触发 reorder→split */
  isInPureEditor?: (clientX: number, clientY: number) => boolean;
  /** 检测是否放在了另一个容器上。返回目标 groupId 或 null */
  findOtherContainer?: (clientX: number, clientY: number, ownContainerEl: HTMLElement) => string | null;
  /** 计算分屏 drop zone + 目标面板。返回 null 表示不在有效区域 */
  computeSplitZone?: (clientX: number, clientY: number) => { zone: DropZone; targetGroupId?: string } | null;
  /** 分屏 drop 回调——zone 是方向，targetGroupId 是鼠标落点面板 */
  onDropSplit?: (tabId: string, zone: Exclude<DropZone, null | "center">, targetGroupId?: string) => void;
  /** Shift+拖 = 复制标签页到新面板（对标 VS Code） */
  onDropCopySplit?: (tabId: string, zone: Exclude<DropZone, null | "center">, targetGroupId?: string) => void;
}

export interface UseDragReorderResult {
  draggingId: string | null;
  insertIndex: number | null;
  previewPos: { x: number; y: number } | null;
  /** 从 mousedown 事件启动拖拽 */
  startDrag: (tabId: string, fromIndex: number, e: React.MouseEvent) => void;
}

/* ── Hook ── */

export function useDragReorder(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseDragReorderOptions
): UseDragReorderResult {
  const {
    threshold = 5,
    splitThreshold = 15,
    editorAreaRef,
    itemCount,
    onReorder,
    onDropSplit,
    onDropCopySplit,
    onMoveToOther,
    onDraggingChange,
    onDragDropZone,
    computeInsertIndex,
    isInPureEditor,
    findOtherContainer,
    computeSplitZone,
  } = options;

  const dragState = useRef<DragState>({
    tabId: "", fromIndex: -1, toIndex: -1, startX: 0, startY: 0, phase: "idle", lifted: false,
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(null);

  const startDrag = useCallback(
    (tabId: string, fromIndex: number, e: React.MouseEvent) => {
      dragState.current = {
        tabId,
        fromIndex,
        toIndex: fromIndex,
        startX: e.clientX,
        startY: e.clientY,
        phase: "reorder",
        lifted: false,
      };
      setInsertIndex(fromIndex);
    },
    []
  );

  /* ── Window 级事件监听 ── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMouseMove = (e: MouseEvent) => {
      const ds = dragState.current;
      if (ds.phase === "idle") return;

      const dx = e.clientX - ds.startX;
      const dy = e.clientY - ds.startY;

      // 未超阈值的移动 → 不启动
      if (ds.phase === "reorder" && Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

      // 首次超阈值 → 拎起标签页
      if (ds.phase === "reorder" && !ds.lifted) {
        ds.lifted = true;
        setDraggingId(ds.tabId);
      }

      // 检测鼠标下是否有标签栏
      const elUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
      const overAnyTabBar = elUnderMouse?.closest(".tab-bar") != null;

      // 检测是否在纯编辑器区域
      const inEditor = isInPureEditor
        ? isInPureEditor(e.clientX, e.clientY)
        : !overAnyTabBar && editorAreaRef?.current
          ? (() => {
              const r = editorAreaRef.current!.getBoundingClientRect();
              return e.clientX >= r.left && e.clientX <= r.right &&
                     e.clientY >= r.top && e.clientY <= r.bottom;
            })()
          : false;

      // reorder → split 切换
      if (ds.phase === "reorder" && Math.abs(dy) > splitThreshold && inEditor) {
        ds.phase = "split";
        onDraggingChange?.(true);
        setInsertIndex(null);
      }

      // split → reorder 切换（鼠标回到标签栏——保留浮空克隆，只关毛玻璃）
      if (ds.phase === "split" && !inEditor) {
        ds.phase = "reorder";
        onDraggingChange?.(false);
        onDragDropZone?.(null);
      }

      // ── 分屏模式 ──
      if (ds.phase === "split") {
        setPreviewPos({ x: e.clientX, y: e.clientY });
        if (computeSplitZone) {
          const result = computeSplitZone(e.clientX, e.clientY);
          onDragDropZone?.(result?.zone ?? null, result?.targetGroupId);
        }
        return;
      }

      // ── 重排模式 ──
      setPreviewPos({ x: e.clientX, y: e.clientY });
      if (computeInsertIndex) {
        const idx = computeInsertIndex(e.clientX, e.clientY, container, ds.fromIndex, itemCount);
        if (ds.fromIndex !== -1 && idx !== null) {
          ds.toIndex = idx;
          setInsertIndex(idx);
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      const ds = dragState.current;
      if (ds.phase === "idle") return;

      if (ds.phase === "split") {
        // 检测是否放到另一个容器上
        let moved = false;
        if (onMoveToOther && findOtherContainer) {
          const targetId = findOtherContainer(e.clientX, e.clientY, container);
          if (targetId) {
            onMoveToOther(ds.tabId, targetId);
            moved = true;
          }
        }
        if (!moved && computeSplitZone) {
          const result = computeSplitZone(e.clientX, e.clientY);
          if (result?.zone && result.zone !== "center") {
            if (e.shiftKey && onDropCopySplit) {
              // Shift+拖 = 复制视图（对标 VS Code）
              onDropCopySplit(ds.tabId, result.zone as Exclude<DropZone, null | "center">, result.targetGroupId);
            } else if (onDropSplit) {
              // 边缘 = 分屏
              onDropSplit(ds.tabId, result.zone as Exclude<DropZone, null | "center">, result.targetGroupId);
            }
          } else if (result?.zone === "center" && result.targetGroupId && onMoveToOther) {
            onMoveToOther(ds.tabId, result.targetGroupId);
          }
        }
        onDragDropZone?.(null);
        onDraggingChange?.(false);
        setPreviewPos(null);
        ds.phase = "idle";
        setDraggingId(null);
        return;
      }

      // 重排模式——先检测是否放到了另一个容器上
      let moved = false;
      if (onMoveToOther && findOtherContainer) {
        const targetId = findOtherContainer(e.clientX, e.clientY, container);
        if (targetId) {
          onMoveToOther(ds.tabId, targetId);
          moved = true;
        }
      }
      if (!moved && ds.toIndex >= 0 && ds.toIndex !== ds.fromIndex) {
        onReorder(ds.tabId, ds.toIndex);
      }

      ds.phase = "idle";
      setInsertIndex(null);
      setDraggingId(null);
      setPreviewPos(null);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dragState.current.phase !== "idle") {
        dragState.current.phase = "idle";
        onDragDropZone?.(null);
        onDraggingChange?.(false);
        setPreviewPos(null);
        setDraggingId(null);
        setInsertIndex(null);
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
  }, [
    containerRef, threshold, splitThreshold, editorAreaRef, itemCount,
    onReorder, onDropSplit, onDropCopySplit, onMoveToOther, onDraggingChange, onDragDropZone,
    computeInsertIndex, isInPureEditor, findOtherContainer, computeSplitZone,
  ]);

  return { draggingId, insertIndex, previewPos, startDrag };
}
