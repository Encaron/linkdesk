/**
 * RightSidebarZone——E5.7#22。右侧栏 Zone（greenfield 骨架——设计 Zone分解设计.md §2.7）。
 *
 * 和 SidebarZone（#10）同构——复用 pool/shared/ 的 PoolSectionStack / PoolToolbarSlot（#11 已迁入）。
 * 默认隐藏：PoolZoneShell 按 layout.rightSidebar?.visible 条件渲染（无数据 → 零 DOM）。
 *
 * 职责（骨架）：
 *   - header（containerTitle 壳 t() 推送——显示文本铁律）
 *   - toolbar 粘顶（PoolToolbarSlot）+ section stack（PoolSectionStack——折叠/拖排/PaneSash 自带）
 *   - 左侧 4px resize handle——#13 同款模式（乐观本地宽 + mouseup commit，真相源在壳）
 *
 * 🔴 骨架优先：无壳侧生产者（rightSidebar 数据填充归 Phase 12）——本任务只建骨架。
 * 与 SidebarZone 的差异（诚实注记）：
 *   ① 折叠按钮（◀）/ collapsed 态缺失——右栏无壳侧 ViewContainerService 容器，
 *      toggleSidebarCollapse 无消费方——Phase 12 接入；
 *   ② 视图 reorder/setCollapsed → pool.sidebarAction（通道按 containerId 泛化——
 *      右栏容器注册后同一通道直达壳 ViewContainerService；Phase 12 生效前安全 no-op）；
 *   ③ 宽度 commit → events.emit("rightSidebar:resize", { width })——不借 setSidebarWidth
 *      （该 action 壳 handler 是左栏专属语义，无 containerId 参数）——Phase 12 #63.7 消费；
 *   ④ 空态文案 emptyText/emptyHint 壳 t() 推送（SidebarLayout 既有字段）。
 */

import { useState, useEffect, useRef, useCallback } from "react";
import PoolToolbarSlot from "../../shared/pool-toolbar-slot/PoolToolbarSlot";
import PoolSectionStack from "../../shared/pool-section-stack/PoolSectionStack";
import ViewTitleActions from "../../shared/view-title-actions/ViewTitleActions"; // E5.8#36.6：mergeHeaderWhenSingle 单视图时容器 header 即视图 header——同声明消费
import type { SidebarAction } from "../../../core/types/ipc/sidebarActions"; // E5.7#97：wire 契约归口
import type { RightSidebarLayout, SidebarViewMeta } from "../../../core/types/pool/poolLayout"; // E5.8#36.8：右栏真 zone 类型（消费字段同 SidebarLayout）
import "./RightSidebarZone.css";

/** role 判别字面量——eslint no-restricted-syntax 拦 `=== "小写字面量"`（SidebarZone #10 同款提大写常量） */
const ROLE_TOOLBAR = "toolbar" as const;

interface RightSidebarZoneProps {
  rightSidebar: RightSidebarLayout;
}

export default function RightSidebarZone({ rightSidebar }: RightSidebarZoneProps) {
  // E5.8#1d EXEMPT：池内 zone 孪生（RightSidebarZone↔SidebarZone resize 骨架——handleSidebarAction/clamp/finishDrag/onMove/handleResizeStart），结构性重复
  /* jscpd:ignore-start */
  // toolbar height tracked for PoolToolbarSlot（SidebarZone #10 同款）
  const setToolbarHeight = useState(0)[1];

  // 池→壳 IPC 回调（E5.6#11j 通道——按 containerId 泛化，右栏容器 Phase 12 注册后直达）
  const handleSidebarAction = useCallback((action: SidebarAction) => {
    window.linkdesk?.pool?.sidebarAction?.(action);
  }, []);

  /* ── E5.7#22：左侧 resize handle 拖拽——#13 同款模式（乐观本地宽 + mouseup commit） ── */

  const [localWidth, setLocalWidth] = useState<number | null>(null);
  const draggingRef = useRef(false);
  const didMoveRef = useRef(false);
  const dragStartRef = useRef<{ x: number; width: number } | null>(null);
  const preDragWidthRef = useRef(0);
  const dragWidthRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const commitPendingRef = useRef(false);
  const bodyStylePrevRef = useRef<{ cursor: string; userSelect: string } | null>(null);

  const { views, containerId, containerTitle, mergeHeaderWhenSingle, collapsedViews } = rightSidebar;

  // 显示宽——本地覆盖优先（拖拽期间/待回执），否则壳权威宽
  const width = localWidth ?? rightSidebar.width;
  const widthRef = useRef(width);
  widthRef.current = width;

  // 钳制——界由壳推（SidebarLayout minWidth/maxWidth——#13 已扩字段）
  const clampWidth = useCallback((w: number) => {
    const min = rightSidebar.minWidth ?? 0;
    const max = rightSidebar.maxWidth ?? Infinity;
    return Math.max(min, Math.min(max, Math.round(w)));
  }, [rightSidebar.minWidth, rightSidebar.maxWidth]);

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
      // 无位移点击不 commit（#13 同款 no-op）
      if (didMoveRef.current) {
        commitPendingRef.current = true;
        // 真相源在壳——Phase 12 #63.7 消费（钳制 → pushLayout 回执）
        window.linkdesk?.events?.emit("rightSidebar:resize", { width: dragWidthRef.current });
      }
      dragStartRef.current = null;
    }
  }, []);

  // 窗口级 mousemove/mouseup——#13 同款（buttons===0 窗口外释放）
  useEffect(() => {
    const onMove = (me: MouseEvent) => {
      if (!draggingRef.current) return;
      if (me.buttons === 0) { finishDrag(); return; }
      didMoveRef.current = true;
      const start = dragStartRef.current;
      if (!start) return;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        // 左侧 handle 向左拖 = 变宽：宽度 = 拖前宽 + (startX - clientX)
        const w = clampWidth(start.width + (start.x - me.clientX));
        dragWidthRef.current = w;
        setLocalWidth(w);
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
  }, [finishDrag, clampWidth]);

  // pushLayout 对齐（isDragging guard）——#13 同款
  useEffect(() => {
    if (draggingRef.current) return;
    if (!commitPendingRef.current) {
      setLocalWidth(null);
      return;
    }
    if (rightSidebar.width !== preDragWidthRef.current || rightSidebar.width === dragWidthRef.current) {
      commitPendingRef.current = false;
      setLocalWidth(null);
    }
  }, [rightSidebar.width]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    draggingRef.current = true;
    didMoveRef.current = false;
    const startWidth = widthRef.current;
    dragStartRef.current = { x: e.clientX, width: startWidth };
    preDragWidthRef.current = startWidth;
    dragWidthRef.current = startWidth;
    bodyStylePrevRef.current = { cursor: document.body.style.cursor, userSelect: document.body.style.userSelect };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);
  /* jscpd:ignore-end */

  // 分离 toolbar / section 角色（SidebarZone #10 同款）
  const toolbarViews: SidebarViewMeta[] = [];
  const sectionViews: SidebarViewMeta[] = [];
  for (const v of views) {
    if (v.role === ROLE_TOOLBAR) {
      toolbarViews.push(v);
    } else {
      sectionViews.push(v);
    }
  }

  // mergeHeaderWhenSingle：只有一个 section view 时，view 的 singleViewPaneContainerTitle 替代容器标题
  const effectiveTitle = (mergeHeaderWhenSingle && sectionViews.length === 1 && sectionViews[0].singleViewPaneContainerTitle)
    ? sectionViews[0].singleViewPaneContainerTitle
    : containerTitle;

  const renderContent = () => {
    // 无视图——空状态（文案壳侧 t() 推送——显示文本铁律）
    if (!views || views.length === 0) {
      return (
        <div className="side-panel-placeholder">
          <p>{rightSidebar.emptyText}</p>
          {rightSidebar.emptyHint && <p className="side-panel-placeholder-hint">{rightSidebar.emptyHint}</p>}
        </div>
      );
    }
    return (
      <div className="side-panel-content">
        {/* ToolbarSlot——粘顶，flex-shrink:0 保证永不滚动消失（SidebarZone #10 同款） */}
        <div style={{ flexShrink: 0 }}>
          <PoolToolbarSlot views={toolbarViews} onHeightChange={setToolbarHeight} />
        </div>

        {/* SectionStack——可折叠 / 可拖排 / PaneSash resize（shared/ 复用，#11 已迁入） */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          <PoolSectionStack
            views={sectionViews}
            containerId={containerId ?? ""}
            toolbarHeight={0}
            mergeHeaderWhenSingle={mergeHeaderWhenSingle}
            collapsedViews={collapsedViews}
            onSidebarAction={handleSidebarAction}
          />
        </div>
      </div>
    );
  };

  return (
    <div
      className="right-sidebar-zone"
      style={rightSidebar.visible ? undefined : { display: "none" }}
    >
      {/* E5.7#22：左侧 4px resize handle（#13 同款视觉——--separator → --separator-hover） */}
      <div
        className="right-sidebar-resize-handle"
        onMouseDown={handleResizeStart}
        aria-hidden="true"
      />

      <div className={`side-panel${localWidth !== null ? " resizing" : ""}`} style={{ width, height: "100%" }}>
        {/* 容器 header——无折叠按钮（差异注记 ①：Phase 12 接入） */}
        {effectiveTitle && (
          <div className="side-panel-header">
            <span className="side-panel-title" title={effectiveTitle}>{effectiveTitle}</span>
            {/* E5.8#36.6：mergeHeaderWhenSingle 单视图合并——容器 header 即视图 header，titleActions 同声明消费 */}
            {mergeHeaderWhenSingle === true && sectionViews.length === 1 && sectionViews[0].titleActions?.length
              ? <ViewTitleActions actions={sectionViews[0].titleActions} />
              : null}
          </div>
        )}
        {renderContent()}
      </div>
    </div>
  );
}
