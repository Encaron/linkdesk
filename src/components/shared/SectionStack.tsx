/**
 * SectionStack —— section 角色 view 的渲染容器。
 * E36#ROLE6：从 SidePanel 提取——同级 section header 共用 stickyTop，碰顶时替换而非叠加。
 *
 * 对标 VS Code：同级 view header 互相顶走，只有父子才层层叠加。
 */

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

export default function SectionStack({ views, pluginId, toolbarHeight, mergeHeaderWhenSingle }: SectionStackProps) {
  if (views.length === 0) return null;

  const singleView = views.length === 1;
  const mergeHeader = singleView && mergeHeaderWhenSingle === true;

  /** E4V#44——检查 view 是否有注册的欢迎内容且 when 条件匹配 */
  const getEmptyContent = (viewId: string): React.ReactNode | null => {
    const empty = ViewContainerService.getViewEmptyContent(viewId);
    if (!empty) return null;
    // when 为空 → 始终显示。非空 → ContextKey 求值。
    if (!empty.when) return empty.content;
    return ContextKeyService.matches(empty.when) ? empty.content : null;
  };

  return (
    <>
      {views.map((view) => {
        const emptyContent = getEmptyContent(view.id);
        const body = emptyContent ?? (
          <ErrorBoundary pluginId={pluginId}>
            <view.render />
          </ErrorBoundary>
        );

        if (mergeHeader) {
          return (
            <SidebarSection
              key={view.id}
              title=""
              collapsible={false}
              defaultOpen
              headerHidden
            >
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
      })}
    </>
  );
}
