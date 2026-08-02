/**
 * SectionStack —— section 角色 view 的渲染容器。
 * E36#ROLE6：从 SidePanel 提取——同级 section header 共用 stickyTop，碰顶时替换而非叠加。
 * E4V#45：Pane resize——view 间可拖拽分隔线调高度。
 *
 * 对标 VS Code：同级 view header 互相顶走，只有父子才层层叠加。
 */

import { type ReactNode, useState, useRef, useCallback, useEffect } from "react";
import type { ViewDescriptor, ViewContainerDescriptor } from "../../core/ViewContainerService";
import { ViewContainerService } from "../../core/ViewContainerService";
// E4V#44——ContextKeyService 用于空状态占位内容的 when 条件
import { ContextKeyService } from "../../core/ContextKeyService";
import ErrorBoundary from "./ErrorBoundary";
import SidebarSection from "./SidebarSection";
import { setDraggingView } from "./viewDragState";

interface SectionStackProps {
  views: ViewDescriptor[];
  pluginId: string;
  toolbarHeight: number;
  container?: ViewContainerDescriptor;
  mergeHeaderWhenSingle?: boolean;
}

/** E4V#45——可拖拽 view 分隔线 */
function PaneSash({ onDrag, onEnd }: { onDrag: (deltaY: number) => void; onEnd?: () => void }) {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const handleMouseMove = (ev: MouseEvent) => {
      onDrag(ev.clientY - startY);
    };
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onEnd?.();
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [onDrag, onEnd]);

  return (
    <div
      className="sidebar-pane-sash"
      onMouseDown={handleMouseDown}
    />
  );
}

/** E4V#45——view wrapper：flex:1 默认均分，拖拽后固定高度。
 *  E4V#45-fix：ResizeObserver 自动测内容高度，未声明 minHeight 时用实测值。 */
function ViewPane({ viewId, height, onContentHeight, showDropBefore, children }: {
  viewId: string;
  height?: number;
  onContentHeight?: (id: string, h: number) => void;
  showDropBefore?: boolean;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  // E4V#45-fix——ResizeObserver 测内容自然高度
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !onContentHeight) return;
    const ro = new ResizeObserver(() => {
      onContentHeight(viewId, el.scrollHeight);
    });
    ro.observe(el);
    // 首次立即报告
    onContentHeight(viewId, el.scrollHeight);
    return () => ro.disconnect();
  }, [viewId, onContentHeight]);

  return (
    <div
      data-view-id={viewId}
      className={`sidebar-pane-view${showDropBefore ? " drop-before" : ""}`}
      style={height !== undefined
        ? { height, flexShrink: 0, overflowY: "auto" }
        : { flex: 1, minHeight: 0 }}
    >
      <div ref={contentRef} style={height === undefined ? undefined : { display: "contents" }}>
        {children}
      </div>
    </div>
  );
}

export default function SectionStack({ views, pluginId, toolbarHeight, mergeHeaderWhenSingle }: SectionStackProps) {
  // E4V#45——拖拽后固定的 view 高度（viewId → px）。undefined = flex:1 均分
  const [viewHeights, setViewHeights] = useState<Record<string, number>>({});
  // 拖拽时缓存初始高度——避免 setState 异步导致跳变
  const dragBaseRef = useRef<{ upperId: string; baseHeight: number; lowerId: string; lowerBaseHeight: number } | null>(null);

  // E4V#45-fix——ResizeObserver 实测内容高度（未声明 minHeight 的 view）
  const [measuredContentHeights, setMeasuredContentHeights] = useState<Record<string, number>>({});
  // E4V#45-fix——容器总高度（窗口缩放时自动更新 cap）
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);
  useEffect(() => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => { setContainerHeight(el.clientHeight); });
    ro.observe(el);
    setContainerHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const handleContentHeight = useCallback((id: string, h: number) => {
    setMeasuredContentHeights((prev) => {
      if (prev[id] === h) return prev;
      return { ...prev, [id]: h };
    });
  }, []);

  /** E4V#45-fix——effective minHeight：声明优先，否则自动测（cap = 容器高 - 其他 view 声明值总和） */
  const effectiveMinHeight = useCallback((viewId: string): number => {
    const desc = ViewContainerService.getView(viewId);
    if (desc?.minHeight !== undefined) return desc.minHeight;
    // 自动测——上限由其他 view 声明的 minHeight 决定
    const otherDeclaredSum = views
      .filter((v) => v.id !== viewId)
      .reduce((sum, v) => sum + (v.minHeight ?? 0), 0);
    const cap = Math.max(100, containerHeight - otherDeclaredSum - toolbarHeight);
    const measured = measuredContentHeights[viewId];
    return measured !== undefined ? Math.min(measured, cap) : 100;
  }, [views, containerHeight, toolbarHeight, measuredContentHeights]);

  /** E4V#45——sash 拖拽回调。deltaY > 0 = 向下拖 → 上方 view 增高。 */
  const handleSashDrag = useCallback((upperId: string, lowerId: string, deltaY: number) => {
    const base = dragBaseRef.current;
    if (!base || base.upperId !== upperId) {
      const upperEl = document.querySelector(`[data-view-id="${upperId}"]`) as HTMLElement | null;
      const lowerEl = document.querySelector(`[data-view-id="${lowerId}"]`) as HTMLElement | null;
      const upperH = upperEl?.offsetHeight ?? 200;
      const lowerH = lowerEl?.offsetHeight ?? 200;
      dragBaseRef.current = { upperId, baseHeight: upperH, lowerId, lowerBaseHeight: lowerH };
    }
    const b = dragBaseRef.current!;
    const upperMin = effectiveMinHeight(upperId);
    const lowerMin = effectiveMinHeight(lowerId);
    const newUpper = Math.max(upperMin, b.baseHeight + deltaY);
    const newLower = Math.max(lowerMin, b.lowerBaseHeight - deltaY);
    setViewHeights({ [upperId]: newUpper, [lowerId]: newLower });
  }, [effectiveMinHeight]);

  const handleSashEnd = useCallback(() => {
    dragBaseRef.current = null;
  }, []);

  // E4V#47——拖拽排序
  const containerId = views[0] ? (ViewContainerService as any)._viewIndex?.get(views[0].id) : undefined;
  const [dragViewId, setDragViewId] = useState<string | null>(null);
  const dragViewIdRef = useRef<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, viewId: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", viewId);
    dragViewIdRef.current = viewId;
    setDragViewId(viewId);
    setDraggingView({ viewId, fromContainerId: containerId ?? "" });
  }, [containerId]);

  const handleViewDragEnd = useCallback(() => {
    dragViewIdRef.current = null;
    setDragViewId(null);
    setDropIndex(null);
    setDraggingView(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const id = dragViewIdRef.current;
    if (!id || dropIndex === null || !containerId) return;
    const draggedIdx = views.findIndex((v) => v.id === id);
    const target = dropIndex > draggedIdx ? dropIndex - 1 : dropIndex;
    ViewContainerService.reorderView(containerId, id, target);
    dragViewIdRef.current = null;
    setDragViewId(null);
    setDropIndex(null);
    setDraggingView(null);
  }, [dropIndex, containerId, views]);

  if (views.length === 0) return null;

  const singleView = views.length === 1;
  const mergeHeader = singleView && mergeHeaderWhenSingle === true;

  /** E4V#44——检查 view 是否有注册的空状态占位内容且 when 条件匹配 */
  const getEmptyContent = (viewId: string): ReactNode | null => {
    const empty = ViewContainerService.getViewEmptyContent(viewId);
    if (!empty) return null;
    if (!empty.when) return empty.content;
    return ContextKeyService.matches(empty.when) ? empty.content : null;
  };

  const renderSection = (view: ViewDescriptor, draggable: boolean, onDragStart?: (e: React.DragEvent) => void, onDragEnd?: () => void) => {
    const emptyContent = getEmptyContent(view.id);
    const body = emptyContent ?? (
      <ErrorBoundary pluginId={pluginId}>
        <view.render />
      </ErrorBoundary>
    );

    if (mergeHeader) {
      return (
        <SidebarSection key={view.id} title="" collapsible={false} defaultOpen headerHidden draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          {body}
        </SidebarSection>
      );
    }

    // E4V#46——持久化覆盖初始折叠态
    const isPersistedCollapsed = ViewContainerService.isCollapsed(view.id);
    const defaultOpen = isPersistedCollapsed ? false : !view.collapsed;

    return (
      <SidebarSection
        key={view.id}
        title={view.title}
        collapsible
        defaultOpen={defaultOpen}
        resetToken={ViewContainerService.resetToken}
        badge={view.badge}
        actions={view.actions}
        pinnedContent={view.pinnedContent}
        titleDescription={view.titleDescription}
        titleTooltip={view.titleTooltip}
        showActions={view.showActions ?? "default"}
        stickyTop={toolbarHeight}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onToggleCollapse={(collapsed) => ViewContainerService.setCollapsed(view.id, collapsed)}
      >
        {body}
      </SidebarSection>
    );
  };

  return (
    <div
      ref={containerRef}
      onDragOverCapture={(e) => {
        e.preventDefault();
        const id = dragViewIdRef.current;
        if (!id) return;
        const els = document.querySelectorAll('[data-view-id]');
        let found = false;
        els.forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
            const mid = rect.top + rect.height / 2;
            const idx = Array.from(els).indexOf(el);
            setDropIndex(e.clientY < mid ? idx : idx + 1);
            found = true;
          }
        });
        // 光标在最后一个 view 下方 → 允许拖到末尾
        if (!found) {
          const lastEl = els[els.length - 1];
          if (lastEl) {
            const lastRect = lastEl.getBoundingClientRect();
            if (e.clientY > lastRect.bottom) {
              setDropIndex(els.length);
              found = true;
            }
          }
        }
        if (!found) setDropIndex(null);
      }}
      onDropCapture={handleDrop}
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
    >
      {views.map((view, i) => {
        const isLast = i === views.length - 1;
        const section = renderSection(view, !singleView, (e) => handleDragStart(e, view.id), handleViewDragEnd);
        const showDropBefore = !!(dragViewId && dragViewId !== view.id && dropIndex === i);

        if (!singleView) {
          return (
            <div key={view.id} style={{ display: "contents" }}>
              <ViewPane
                viewId={view.id}
                height={viewHeights[view.id]}
                onContentHeight={handleContentHeight}
                showDropBefore={showDropBefore}
              >
                {section}
              </ViewPane>
              {!isLast && (
                <PaneSash
                  onDrag={(deltaY) => { handleSashDrag(view.id, views[i + 1].id, deltaY); }}
                  onEnd={handleSashEnd}
                  key={`sash-${view.id}`}
                />
              )}
            </div>
          );
        }

        return <div key={view.id} style={{ display: "contents" }}>{section}</div>;
      })}
    </div>
  );
}
