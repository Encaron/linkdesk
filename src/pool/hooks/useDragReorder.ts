/**
 * useDragReorder — 通用拖拽重排 hook。
 * 封装 window 级 mousemove/mouseup/keydown 事件处理，
 * 支持 reorder ↔ split 双向状态机，可复用于 Phase 5 卡片拖拽。
 *
 * 设计依据：[V3-Phase3-标签页分屏设计.md §9] + Phase 3 审计建议
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { DropZone } from "./tabDragTypes";
import type { TabDragPositionPayload } from "../../core/types/ipc/poolActions"; // E5.8#44-C：拖拽位置上报 wire 契约

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
  /** E5.8#46.3：窗口屏幕原点——startDrag 时由 screenX-clientX 推出（screen=屏幕绝对坐标，client=相对本窗视口，
   *  相减=窗口屏幕左/上缘，同在逻辑坐标 DPI 一致）。跨窗释放判定用屏幕坐标对照窗口屏幕 bounds——client 坐标
   *  跨窗口不可靠（tab 落在其他 OS 窗口上方时 clientX 恰落进本窗视口 → 判不出「窗外」→ 拖入主屏无动作根因）。 */
  winScreenX: number;
  winScreenY: number;
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
  /** E5.8#44-B：窗口外释放回调——拖出手势（标签页拖出窗口边界后释放）。screenX/Y = 屏幕坐标（壳转 screen 命中 TabBar/新窗）。仅拎起后触发。 */
  onReleaseOutside?: (tabId: string, screenX: number, screenY: number) => void;
  /** E5.8#44-C：拖拽位置上报回调——拎起后 mousemove 全程（含窗内——壳排除源窗命中，窗内自然清提示）。
   *  canceled = Esc 取消拖拽（keydown 无坐标，壳清吸附提示）。仅拎起后触发。 */
  onDragPosition?: (pos: TabDragPositionPayload) => void;
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
    onReleaseOutside,
    onDragPosition,
  } = options;

  const dragState = useRef<DragState>({
    tabId: "", fromIndex: -1, toIndex: -1, startX: 0, startY: 0, phase: "idle", lifted: false,
    winScreenX: 0, winScreenY: 0,
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(null);

  const startDrag = useCallback(
    (tabId: string, fromIndex: number, e: React.MouseEvent) => {
      // E5.8#44-B：指针捕获——鼠标拖出窗口边界后仍收 mouseup（Windows 隐式捕获之外的跨平台稳健）。
      // pointerId 在 PointerEvent 上（React.MouseEvent 泛型类型无）——nativeEvent 运行时取；测试合成事件
      // nativeEvent 缺（undefined）或非指针事件 → 跳过捕获（拖出手势在真实环境恒为指针事件）。
      const pointerId = (e.nativeEvent as PointerEvent | undefined)?.pointerId;
      if (typeof pointerId === "number") e.currentTarget.setPointerCapture?.(pointerId);
      dragState.current = {
        tabId,
        fromIndex,
        toIndex: fromIndex,
        startX: e.clientX,
        startY: e.clientY,
        phase: "reorder",
        lifted: false,
        // E5.8#46.3：窗口屏幕原点——mousedown 时指针必在本窗内（刚按下标签），client 坐标未钳制，
        // screenX-clientX = 窗口左缘精确。合成事件缺 screenX（undefined）→ ?? 0 兜底（测试桩，NaN 比较恒 false 安全）。
        winScreenX: (e.screenX ?? 0) - e.clientX,
        winScreenY: (e.screenY ?? 0) - e.clientY,
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

      // E5.8#44-C：拎起后全程上报拖拽位置（含窗内——壳排除源窗命中，窗内拖拽自然 null 清提示；窗外命中目标窗 TabBar 高亮）
      if (ds.lifted && onDragPosition) {
        onDragPosition({ tabId: ds.tabId, screenX: e.screenX, screenY: e.screenY });
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

      // E5.8#44-B：窗口外释放 = 拖出手势——仅拎起后触发（防普通点击误判）。screenX/Y = 屏幕坐标，
      // 壳转 screen 命中 TabBar（并窗）/空白（新窗）。先于 reorder/split 正常流程处理并复位拖拽态。
      // E5.8#46.3：判定用屏幕坐标对照窗口屏幕 bounds（winScreenX + innerWidth/Height）——client 坐标跨窗
      // 不可靠：tab 拖到其他 OS 窗口上方时 clientX 相对本窗视口可能仍落进 [0,innerWidth] → 判不出窗外
      // （拖入主屏无动作 bug 根因）。screenX/Y 是屏幕绝对坐标，不随窗口钳制，跨窗判定恒可靠；
      // 窗内死区松手 = 屏幕坐标在 bounds 内 → 判 false → 正常走窗内逻辑 no-op（不误触发）。
      if (
        ds.lifted &&
        onReleaseOutside &&
        (e.screenX < ds.winScreenX || e.screenX > ds.winScreenX + window.innerWidth ||
         e.screenY < ds.winScreenY || e.screenY > ds.winScreenY + window.innerHeight)
      ) {
        onReleaseOutside(ds.tabId, e.screenX, e.screenY);
        ds.phase = "idle";
        onDragDropZone?.(null);
        onDraggingChange?.(false);
        setPreviewPos(null);
        setInsertIndex(null);
        setDraggingId(null);
        return;
      }

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
        // E5.8#44-C：Esc 取消拖拽——上报 canceled 供壳清吸附提示（keydown 无坐标，screenX/Y 填 0）
        if (dragState.current.lifted && onDragPosition) {
          onDragPosition({ tabId: dragState.current.tabId, screenX: 0, screenY: 0, canceled: true });
        }
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
    computeInsertIndex, isInPureEditor, findOtherContainer, computeSplitZone, onReleaseOutside, onDragPosition,
  ]);

  return { draggingId, insertIndex, previewPos, startDrag };
}
