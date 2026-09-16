/**
 * PoolSectionStack——E5.6#11g。
 *
 * 对标 SectionStack.tsx。section 角色 view 的渲染容器。
 * 池版差别：prop SidebarViewMeta[]（非 ViewDescriptor[]），
 * 渲染 PluginComponent（非 view.render()），组件通过 renderPath 加载。
 * 写操作（reorder/setCollapsed/setVisible）走 onSidebarAction IPC 回调→壳 ViewContainerService。
 *
 * 完整保留：SidebarSection + PaneSash + ViewPane + 拖拽排序 + 折叠持久化 + effectiveMinHeight。
 * 不保留：actions ReactNode / pinnedContent / ContextKey / emptyContent（硬限制——不可序列化）。
 */

import { type ReactNode, Fragment, useState, useRef, useCallback, useEffect } from "react";
import type { SidebarViewMeta } from "../../../core/types/pool/poolLayout";
import type { SidebarAction } from "../../../core/types/ipc/sidebarActions"; // E5.7#97：wire 契约归口（原本地定义移走）
import ErrorBoundary from "../error-boundary/ErrorBoundary"; // E5.7#20：池侧版（不 import 壳 components 目录）
import SidebarSection from "../../../components/shared/sidebar-section/SidebarSection";
import PluginComponent from "../plugin-component/PluginComponent";
import ViewTitleActions from "../view-title-actions/ViewTitleActions"; // E5.8#36.6：section header 动作区（与面板 #36.5 同一渲染器）
import { VIEW_DRAG_MIME } from "../../protocol/viewDragProtocol"; // E4V#48：跨容器拖放 MIME

// ── 类型 ──

interface PoolSectionStackProps {
  views: SidebarViewMeta[];
  containerId: string;
  toolbarHeight: number;
  mergeHeaderWhenSingle?: boolean;
  /** 持久化折叠的 view ID 集合——壳 loadCollapsedState() 输出 */
  collapsedViews?: string[];
  /** 池→壳 IPC 回调——对标 ViewContainerService 写方法 */
  onSidebarAction: (action: SidebarAction) => void;
}

// ── PaneSash（纯 DOM 事件——直接从 SectionStack 迁移）──

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
      className="ldk-sidebar-section-pane-sash"
      onMouseDown={handleMouseDown}
    />
  );
}

// ── ViewPane（flex + ResizeObserver + drop-before——直接从 SectionStack 迁移）──

function ViewPane({ viewId, height, collapsed, onContentHeight, showDropBefore, children }: {
  viewId: string;
  height?: number;
  collapsed?: boolean;
  onContentHeight?: (id: string, h: number) => void;
  showDropBefore?: boolean;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (!el || !onContentHeight) return;
    const ro = new ResizeObserver(() => {
      onContentHeight(viewId, el.scrollHeight);
    });
    ro.observe(el);
    onContentHeight(viewId, el.scrollHeight);
    return () => ro.disconnect();
  }, [viewId, onContentHeight]);

  return (
    <div
      data-view-id={viewId}
      className={`ldk-sidebar-section-pane-view${showDropBefore ? " drop-before" : ""}`}
      style={height !== undefined && !collapsed
        ? { height, overflowY: "auto" }
        : undefined}
    >
      <div ref={contentRef} style={height === undefined ? undefined : { display: "contents" }}>
        {children}
      </div>
    </div>
  );
}

// ── PoolSectionStack ──

export default function PoolSectionStack({
  views,
  containerId,
  toolbarHeight,
  mergeHeaderWhenSingle,
  collapsedViews,
  onSidebarAction,
}: PoolSectionStackProps) {
  // ── view 高度（拖拽后固定）──
  const [viewHeights, setViewHeights] = useState<Record<string, number>>({});
  // 🔥 跟踪每个 view 的折叠状态——折叠的 view 不占 flex 空间，只占 header 高度
  const [collapsedViewSet, setCollapsedViewSet] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const v of views) {
      const persisted = collapsedViews?.includes(v.id);
      if (persisted || v.collapsed) s.add(v.id);
    }
    return s;
  });
  const dragBaseRef = useRef<{ upperId: string; baseHeight: number; lowerId: string; lowerBaseHeight: number } | null>(null);

  // ── 实测内容高度 ──
  const [measuredContentHeights, setMeasuredContentHeights] = useState<Record<string, number>>({});

  // ── 容器总高度 ──
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

  // ── effectiveMinHeight：声明优先，否则自动测 ──
  const effectiveMinHeight = useCallback((viewId: string): number => {
    const meta = views.find((v) => v.id === viewId);
    if (meta?.minHeight !== undefined) return meta.minHeight;
    const otherDeclaredSum = views
      .filter((v) => v.id !== viewId)
      .reduce((sum, v) => sum + (v.minHeight ?? 0), 0);
    const cap = Math.max(100, containerHeight - otherDeclaredSum - toolbarHeight);
    const measured = measuredContentHeights[viewId];
    return measured !== undefined ? Math.min(measured, cap) : 100;
  }, [views, containerHeight, toolbarHeight, measuredContentHeights]);

  // ── sash 拖拽 ──
  const handleSashDrag = useCallback((upperId: string, lowerId: string, deltaY: number) => {
    const base = dragBaseRef.current;
    if (!base || base.upperId !== upperId) {
      const upperEl = document.querySelector(`[data-view-id="${upperId}"]`) as HTMLElement | null;
      const lowerEl = document.querySelector(`[data-view-id="${lowerId}"]`) as HTMLElement | null;
      const upperH = upperEl?.offsetHeight ?? 0;
      const lowerH = lowerEl?.offsetHeight ?? 0;
      // E5.6#11.5-PaneSash：无效高度拒绝使用——offsetHeight=0 时跳过更新，防止 1/4/1/2 跳变
      if (upperH <= 0 || lowerH <= 0) return;
      dragBaseRef.current = { upperId, baseHeight: upperH, lowerId, lowerBaseHeight: lowerH };
    }
    const b = dragBaseRef.current!;
    const upperMin = effectiveMinHeight(upperId);
    const lowerMin = effectiveMinHeight(lowerId);
    const newUpper = Math.max(upperMin, b.baseHeight + deltaY);
    const newLower = Math.max(lowerMin, b.lowerBaseHeight - deltaY);
    // E5.6#11.5-PaneSash：展开前值——不丢其他 view 的高度
    setViewHeights((prev) => ({ ...prev, [upperId]: newUpper, [lowerId]: newLower }));
  }, [effectiveMinHeight]);

  const handleSashEnd = useCallback(() => {
    dragBaseRef.current = null;
  }, []);

  // ── 拖拽排序 ──
  const [dragViewId, setDragViewId] = useState<string | null>(null);
  const dragViewIdRef = useRef<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, viewId: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", viewId);
    // E4V#48：跨容器拖放——dataTransfer 自定义 MIME 同步携带 {viewId, fromContainerId}
    // （壳版 getDraggingView/setDraggingView 共享状态在池内无意义——dataTransfer 是唯一同步通道）
    e.dataTransfer.setData(VIEW_DRAG_MIME, JSON.stringify({ viewId, fromContainerId: containerId }));
    dragViewIdRef.current = viewId;
    setDragViewId(viewId);
  }, [containerId]);

  const handleViewDragEnd = useCallback(() => {
    dragViewIdRef.current = null;
    setDragViewId(null);
    setDropIndex(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const id = dragViewIdRef.current;
    if (!id || dropIndex === null || !containerId) return;
    const draggedIdx = views.findIndex((v) => v.id === id);
    const target = dropIndex > draggedIdx ? dropIndex - 1 : dropIndex;
    // IPC → 壳 ViewContainerService.reorderView()
    onSidebarAction({ action: "reorder", containerId, viewId: id, newIndex: target });
    dragViewIdRef.current = null;
    setDragViewId(null);
    setDropIndex(null);
  }, [dropIndex, containerId, views, onSidebarAction]);

  if (views.length === 0) return null;

  const singleView = views.length === 1;
  const mergeHeader = singleView && mergeHeaderWhenSingle === true;
  const collapsedSet = new Set(collapsedViews ?? []);

  const renderSection = (view: SidebarViewMeta, draggable: boolean, onDragStart?: (e: React.DragEvent) => void, onDragEnd?: () => void) => {
    // E5.6#11g：空状态由插件内部自行判断——PluginComponent 始终挂载（防 E4V#44 死锁）
    const body = (
      <ErrorBoundary pluginId={view.pluginId}>
        <PluginComponent
          pluginId={view.pluginId}
          renderPath={view.renderPath}
          isActive={true}
        />
      </ErrorBoundary>
    );

    if (mergeHeader) {
      return (
        <SidebarSection key={view.id} title="" collapsible={false} defaultOpen headerHidden draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          {body}
        </SidebarSection>
      );
    }

    // 持久化折叠覆盖初始折叠态
    const isPersistedCollapsed = collapsedSet.has(view.id);
    const defaultOpen = isPersistedCollapsed ? false : !view.collapsed;

    return (
      <SidebarSection
        key={view.id}
        title={view.title}
        collapsible
        defaultOpen={defaultOpen}
        badge={view.badge}
        titleDescription={view.titleDescription}
        titleTooltip={view.titleTooltip}
        actions={view.titleActions?.length
          ? <ViewTitleActions actions={view.titleActions} />
          : undefined}
        stickyTop={toolbarHeight}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onToggleCollapse={(collapsed) => {
          // IPC → 壳 ViewContainerService.setCollapsed()（E5.8#41.9.2：带 pluginId——复合键持久化）
          onSidebarAction({ action: "setCollapsed", containerId, viewId: view.id, pluginId: view.pluginId, collapsed });
          setCollapsedViewSet((prev) => {
            const next = new Set(prev);
            if (collapsed) next.add(view.id); else next.delete(view.id);
            return next;
          });
          // 折叠时清除手动拖拽高度——回退到自然内容高度
          if (collapsed) {
            setViewHeights((prev) => {
              if (!(view.id in prev)) return prev;
              const next = { ...prev };
              delete next[view.id];
              return next;
            });
          }
        }}
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
    >
      {views.map((view, i) => {
        const isLast = i === views.length - 1;
        const section = renderSection(view, !singleView, (e) => handleDragStart(e, view.id), handleViewDragEnd);
        const showDropBefore = !!(dragViewId && dragViewId !== view.id && dropIndex === i);

        if (!singleView) {
          return (
            <Fragment key={view.id}>
              <ViewPane
                viewId={view.id}
                height={viewHeights[view.id]}
                collapsed={collapsedViewSet.has(view.id)}
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
            </Fragment>
          );
        }

        return <Fragment key={view.id}>{section}</Fragment>;
      })}
    </div>
  );
}
