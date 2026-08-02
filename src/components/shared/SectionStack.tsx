/**
 * SectionStack —— section 角色 view 的渲染容器。
 * E36#ROLE6：从 SidePanel 提取——同级 section header 共用 stickyTop，碰顶时替换而非叠加。
 * E4V#45：Pane resize——view 间可拖拽分隔线调高度。
 *
 * 对标 VS Code：同级 view header 互相顶走，只有父子才层层叠加。
 */

import { type ReactNode, useState, useRef, useCallback } from "react";
import type { ViewDescriptor, ViewContainerDescriptor } from "../../core/ViewContainerService";
import { ViewContainerService } from "../../core/ViewContainerService";
// E4V#44——ContextKeyService 用于空状态占位内容的 when 条件
import { ContextKeyService } from "../../core/ContextKeyService";
import ErrorBoundary from "./ErrorBoundary";
import SidebarSection from "./SidebarSection";

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

/** E4V#45——view wrapper：flex:1 默认均分，拖拽后固定高度 */
function ViewPane({ viewId, height, children }: { viewId: string; height?: number; children: ReactNode }) {
  return (
    <div
      data-view-id={viewId}
      className="sidebar-pane-view"
      style={height !== undefined
        ? { height, flexShrink: 0, overflow: "hidden" }
        : { flex: 1, minHeight: 0 }}
    >
      {children}
    </div>
  );
}

export default function SectionStack({ views, pluginId, toolbarHeight, mergeHeaderWhenSingle }: SectionStackProps) {
  // E4V#45——拖拽后固定的 view 高度（viewId → px）。undefined = flex:1 均分
  const [viewHeights, setViewHeights] = useState<Record<string, number>>({});
  // 拖拽时缓存初始高度——避免 setState 异步导致跳变
  const dragBaseRef = useRef<{ upperId: string; baseHeight: number; lowerId: string; lowerBaseHeight: number } | null>(null);

  /** E4V#45——sash 拖拽回调。deltaY > 0 = 向下拖 → 上方 view 增高 */
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
    const newUpper = Math.max(60, b.baseHeight + deltaY);
    const newLower = Math.max(60, b.lowerBaseHeight - deltaY);
    setViewHeights({ [upperId]: newUpper, [lowerId]: newLower });
  }, []);

  const handleSashEnd = useCallback(() => {
    dragBaseRef.current = null;
  }, []);

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

  const renderSection = (view: ViewDescriptor) => {
    const emptyContent = getEmptyContent(view.id);
    const body = emptyContent ?? (
      <ErrorBoundary pluginId={pluginId}>
        <view.render />
      </ErrorBoundary>
    );

    if (mergeHeader) {
      return (
        <SidebarSection key={view.id} title="" collapsible={false} defaultOpen headerHidden>
          {body}
        </SidebarSection>
      );
    }

    return (
      <SidebarSection
        key={view.id}
        title={view.title}
        collapsible
        defaultOpen={!view.collapsed}
        badge={view.badge}
        actions={view.actions}
        pinnedContent={view.pinnedContent}
        titleDescription={view.titleDescription}
        titleTooltip={view.titleTooltip}
        showActions={view.showActions ?? "default"}
        stickyTop={toolbarHeight}
      >
        {body}
      </SidebarSection>
    );
  };

  return (
    <>
      {views.map((view, i) => {
        const isLast = i === views.length - 1;
        const section = renderSection(view);

        // 多 view → 每个用 ViewPane 包起来 + sash 隔开
        if (!singleView) {
          return (
            <div key={view.id} style={{ display: "contents" }}>
              <ViewPane viewId={view.id} height={viewHeights[view.id]}>
                {section}
              </ViewPane>
              {!isLast && (
                <PaneSash
                  onDrag={(deltaY) => {
                    handleSashDrag(view.id, views[i + 1].id, deltaY);
                  }}
                  onEnd={handleSashEnd}
                  key={`sash-${view.id}`}
                />
              )}
            </div>
          );
        }

        // 单 view → 不用 sash
        return <div key={view.id} style={{ display: "contents" }}>{section}</div>;
      })}
    </>
  );
}
