/**
 * useResizeDrag——E5.8#37.5。通用 resize 拖拽 hook（收敛结构性重复）。
 *
 * 吸收 SidebarZone / RightSidebarZone / PanelZone 三处 resize 骨架孪生（E5.8#1d EXEMPT 化——
 * 原本 jscpd:ignore-start 的结构性重复，抽 hook 后单一实现，jscpd 豁免可撤）。
 * 行为零差异迁移（SidebarZone #13 语义——乐观本地尺寸 + rAF 节流 + mouseup/buttons===0 一次性
 * commit + 无位移点击 no-op + pushLayout 回执对齐，真相源在壳）：
 *
 *   - axis: "row"（纵向尺寸——面板高）| "col"（横向尺寸——侧栏/面板宽）
 *   - growSign: +1 = 拖拽正向增（row 下增 / col 右增）；-1 = 拖拽正向减（row 上增 / col 左增）
 *   - 本地覆盖（size 显示值）在拖拽期间/待回执生效，否则壳权威 value
 *   - onCommit 在 mouseup 提交拖拽终值（已钳制）——壳钳制 → pushLayout 回执 → value-effect 释放本地覆盖
 *   - 拖拽期间锁 body cursor/userSelect（E5.6#22m ① 防护传承）+ buttons===0 窗口外释放（②）
 */

import { useState, useRef, useEffect, useCallback } from "react";

export interface UseResizeDragOptions {
  /** 尺寸轴——row = 纵向（面板高）；col = 横向（侧栏/面板宽） */
  axis: "row" | "col";
  /** +1 = 拖拽正向增（row 下增 / col 右增）；-1 = 反（row 上增 / col 左增） */
  growSign: 1 | -1;
  /** 钳制下界——壳 dock 的 minX 推送（池零硬编码） */
  min: number;
  max: number;
  /** 当前权威尺寸（壳推）——本地覆盖释放 / 回执对齐判定 */
  value: number;
  /** 拖拽期间 body 光标——col-resize（横向）/ row-resize（纵向） */
  cursor: "row-resize" | "col-resize";
  /** mouseup 提交——拖拽终值（已钳制）；壳侧 consume（resizeZone/resizeZoneHeight/events.emit） */
  onCommit: (size: number) => void;
}

export function useResizeDrag({ axis, growSign, min, max, value, cursor, onCommit }: UseResizeDragOptions): {
  /** 显示尺寸——本地覆盖优先（拖拽期间/待回执），否则壳权威值 */
  size: number;
  /** 是否处于拖拽/待回执——zone 用来切换 .resizing 类（关 transition 防橡皮筋） + 派生 collapsed */
  resizing: boolean;
  /** 绑到 resize handle 的 onMouseDown */
  onResizeStart: (e: React.MouseEvent) => void;
} {
  const [localSize, setLocalSize] = useState<number | null>(null); // 拖拽期间/待回执的本地尺寸覆盖
  const draggingRef = useRef(false);                       // isDragging guard——拖拽期间忽略推送
  const didMoveRef = useRef(false);                        // 无位移点击不 commit（#13 同款 no-op 语义）
  const dragStartRef = useRef<{ pos: number; size: number } | null>(null); // 拖拽几何
  const preDragSizeRef = useRef(0);                        // 拖前尺寸——回执期跳过迟到旧推送
  const dragSizeRef = useRef(0);                           // 最近一次本地尺寸（mouseup commit 用）
  const rafRef = useRef<number | null>(null);              // rAF 节流——每帧最多一次 setState
  const commitPendingRef = useRef(false);                  // commit 已发待回执
  const bodyStylePrevRef = useRef<{ cursor: string; userSelect: string } | null>(null); // E5.6#22m ① 恢复

  // 显示尺寸——本地覆盖优先，否则壳权威值
  const size = localSize ?? value;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // 钳制——界由壳推（LayoutEngine dock 声明），与壳 resizeZone 公式一致（无硬编码）
  const clamp = useCallback((s: number) => {
    return Math.max(min, Math.min(max, Math.round(s)));
  }, [min, max]);

  // onCommit 引用每次渲染可能变化（父组件箭头函数）——ref 保证 finishDrag 闭包读最新
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  // mouseup / buttons===0 释放——一次性 commit（events 回环壳 → 钳制 → pushLayout 回执）
  const finishDrag = useCallback(() => {
    draggingRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (bodyStylePrevRef.current) {
      document.body.style.cursor = bodyStylePrevRef.current.cursor;
      document.body.style.userSelect = bodyStylePrevRef.current.userSelect;
      bodyStylePrevRef.current = null;
    }
    if (dragStartRef.current) {
      // 无位移点击（mousedown+mouseup 未动）不 commit——#13 同款 no-op
      if (didMoveRef.current) {
        commitPendingRef.current = true;
        onCommitRef.current(dragSizeRef.current);
      }
      dragStartRef.current = null;
    }
  }, []);

  // 窗口级 mousemove/mouseup——#13 同款（buttons===0 视为窗口外释放）
  useEffect(() => {
    const onMove = (me: MouseEvent) => {
      if (!draggingRef.current) return;
      if (me.buttons === 0) { finishDrag(); return; }
      didMoveRef.current = true;
      const start = dragStartRef.current;
      if (!start) return;
      if (rafRef.current !== null) return; // rAF 节流——每帧最多一次 setState
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        // 增量公式：growSign +1 → 拖正方向增（row 下增 / col 右增）；-1 → 反方向增
        const delta = axis === "col" ? (me.clientX - start.pos) : (me.clientY - start.pos);
        const s = clamp(start.size + growSign * delta);
        dragSizeRef.current = s;
        setLocalSize(s);
      });
    };
    const onUp = () => {
      if (draggingRef.current) finishDrag();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [finishDrag, clamp, axis, growSign]);

  // pushLayout 对齐（isDragging guard）——#13 同款：拖拽期间忽略旧值防闪跳；
  // 回执 = commit 后第一条非拖前值推送（壳钳制后值可能 ≠ 本地值——以壳权威为准）
  useEffect(() => {
    if (draggingRef.current) return;
    if (!commitPendingRef.current) {
      setLocalSize(null);
      return;
    }
    if (value !== preDragSizeRef.current || value === dragSizeRef.current) {
      commitPendingRef.current = false;
      setLocalSize(null); // 回执对齐——本地覆盖释放
    }
  }, [value]);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    draggingRef.current = true;
    didMoveRef.current = false;
    const startSize = sizeRef.current;
    dragStartRef.current = { pos: axis === "col" ? e.clientX : e.clientY, size: startSize };
    preDragSizeRef.current = startSize;
    dragSizeRef.current = startSize;
    // 拖拽期间锁 body cursor + userSelect（快速拖拽脱离 handle 不跳回箭头）
    bodyStylePrevRef.current = { cursor: document.body.style.cursor, userSelect: document.body.style.userSelect };
    document.body.style.cursor = cursor;
    document.body.style.userSelect = "none";
  }, [axis, cursor]);

  return {
    size,
    resizing: localSize !== null,
    onResizeStart,
  };
}
