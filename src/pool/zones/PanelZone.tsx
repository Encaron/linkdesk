/**
 * PanelZone——E5.7#21。底部面板 Zone（greenfield 骨架——设计 Zone分解设计.md §2.6）。
 *
 * 职责：
 *   - PanelTabBar 28px 矮标签栏（views 来自 layout.panel.views——PanelViewMeta[]，标题壳 t() 推送）
 *   - keep-alive 内容区——所有 views 平级渲染 display 切换（MainZone TabContent 同模式）
 *   - 顶部 4px resize handle——#13 同款模式（乐观本地高度 + mouseup commit，真相源在壳）
 *
 * 🔴 骨架优先（设计 §2.6）：数据生产者归 Phase 12 #63.7——
 *   contributes.views bottom-panel 路由 / 高度持久化 / 动态注册三件套。
 *   生产者建成前 layout.panel 无数据 → 条件渲染永假，本任务验证 = 骨架渲染零报错。
 *   面板视图动态加载（PluginComponent 同款）也归 #63.7——禁止建 PANEL_VIEWS 静态表
 *   （写死 pluginId 违反插件独立铁律 + 硬约束 10）。
 *
 * 池→壳通道：window.linkdesk.events.emit（IconBarZone #6 同款）——
 *   "panel:viewSelected" / "panel:createView" / "panel:resize" 由 Phase 12 #63.7
 *   壳侧消费（现无监听者——安全 no-op，骨架期点击/拖拽无副作用）。
 * 钳制界 minHeight/maxHeight 壳推（#13 同款——池零硬编码）；Phase 12 推送前默认无界。
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { PanelLayout } from "../../core/types/poolLayout";
import { Z_INDEX } from "../../constants"; // E5.7#26：浮层层级表——panelResizeHandle
import "./PanelZone.css";

interface PanelZoneProps {
  panel: PanelLayout;
}

export default function PanelZone({ panel }: PanelZoneProps) {
  const { views, activeViewId } = panel;

  /* ── E5.7#21：顶部 resize handle 拖拽——#13 同款模式（乐观本地高度 + mouseup commit） ── */

  const [localHeight, setLocalHeight] = useState<number | null>(null); // 拖拽期间/待回执的本地高度覆盖
  const draggingRef = useRef(false);                       // isDragging guard——拖拽期间忽略推送
  const didMoveRef = useRef(false);                        // 无位移点击不 commit（#13 同款 no-op 语义）
  const dragStartRef = useRef<{ y: number; height: number } | null>(null); // 拖拽几何
  const preDragHeightRef = useRef(0);                      // 拖前高度——回执期跳过迟到旧推送
  const dragHeightRef = useRef(0);                         // 最近一次本地高度（mouseup commit 用）
  const rafRef = useRef<number | null>(null);              // rAF 节流
  const commitPendingRef = useRef(false);                  // commit 已发待回执
  const bodyStylePrevRef = useRef<{ cursor: string; userSelect: string } | null>(null); // 光标/选择锁恢复

  // 显示高度——本地覆盖优先（拖拽期间/待回执），否则壳权威高
  const height = localHeight ?? panel.height;
  const heightRef = useRef(height);
  heightRef.current = height;

  // 钳制——界由壳推（#13 同款；Phase 12 #63.7 推送前默认无界）
  const clampHeight = useCallback((h: number) => {
    const min = panel.minHeight ?? 0;
    const max = panel.maxHeight ?? Infinity;
    return Math.max(min, Math.min(max, Math.round(h)));
  }, [panel.minHeight, panel.maxHeight]);

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
        // 真相源在壳——Phase 12 #63.7 壳侧消费（resizeZone 钳制 → pushLayout 回执）
        window.linkdesk?.events?.emit("panel:resize", { height: dragHeightRef.current });
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
        // 顶部 handle 向上拖 = 增高：高度 = 拖前高 + (startY - clientY)
        const h = clampHeight(start.height + (start.y - me.clientY));
        dragHeightRef.current = h;
        setLocalHeight(h);
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
  }, [finishDrag, clampHeight]);

  // pushLayout 对齐（isDragging guard）——#13 同款：拖拽期间忽略旧高度防闪跳；
  // 回执 = commit 后第一条非拖前高度的推送（壳钳制后值可能 ≠ 本地高——以壳权威为准）
  useEffect(() => {
    if (draggingRef.current) return;
    if (!commitPendingRef.current) {
      setLocalHeight(null);
      return;
    }
    if (panel.height !== preDragHeightRef.current || panel.height === dragHeightRef.current) {
      commitPendingRef.current = false;
      setLocalHeight(null); // 回执对齐——本地覆盖释放
    }
  }, [panel.height]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    draggingRef.current = true;
    didMoveRef.current = false;
    const startHeight = heightRef.current;
    dragStartRef.current = { y: e.clientY, height: startHeight };
    preDragHeightRef.current = startHeight;
    dragHeightRef.current = startHeight;
    // 拖拽期间锁 body cursor + userSelect（快速拖拽脱离 handle 不跳回箭头）
    bodyStylePrevRef.current = { cursor: document.body.style.cursor, userSelect: document.body.style.userSelect };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  return (
    <div
      className={`panel-zone${localHeight !== null ? " resizing" : ""}`}
      style={{ height }}
    >
      {/* E5.7#21：顶部 4px resize handle（#13 同款模式——row-resize 垂直拖拽）。
          zIndex 走 Z_INDEX.panelResizeHandle（#26 常量表）——不写裸数字。 */}
      <div
        className="panel-resize-handle"
        style={{ zIndex: Z_INDEX.panelResizeHandle }}
        onMouseDown={handleResizeStart}
        aria-hidden="true"
      />

      {/* PanelTabBar 28px——标签 80px 固定不 shrink，列表溢出滚动，[+] 在滚动区外始终最右 */}
      <div className="panel-tabbar">
        <div className="panel-tabbar-list">
          {views.map((v) => (
            <div
              key={v.id}
              className={`panel-tab${v.id === activeViewId ? " active" : ""}`}
              title={v.title}
              onClick={() => {
                // 壳侧消费方：Phase 12 #63.7（现无监听者——安全 no-op）
                window.linkdesk?.events?.emit("panel:viewSelected", v.id);
              }}
            >
              <span className="panel-tab-label">{v.title}</span>
            </div>
          ))}
        </div>
        {/* [+] 新建面板视图——Phase 12 #63.7 壳侧消费（tooltip 亦由壳推——显示文本铁律，池零自产文本） */}
        <button
          className="panel-tab-create"
          onClick={() => {
            window.linkdesk?.events?.emit("panel:createView");
          }}
        >
          +
        </button>
      </div>

      {/* keep-alive——所有 views 平级渲染，display 切换（MainZone TabContent 同模式）。
          🔴 视图动态加载归 Phase 12 #63.7（PluginComponent 同款）——此处空壳占位。 */}
      <div className="panel-content">
        {views.map((v) => (
          <div
            key={v.id}
            className="panel-view"
            style={{ display: v.id === activeViewId ? "flex" : "none" }}
          />
        ))}
      </div>
    </div>
  );
}
