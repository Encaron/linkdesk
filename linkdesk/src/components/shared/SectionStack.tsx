/**
 * SectionStack —— section 角色 view 的渲染容器。
 * E36#ROLE6：从 SidePanel 提取——同级 section header 共用 stickyTop，碰顶时替换而非叠加。
 *
 * 对标 VS Code：同级 view header 互相顶走，只有父子才层层叠加。
 */

import type { ViewDescriptor, ViewContainerDescriptor } from "../../core/ViewContainerService";
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

  return (
    <>
      {views.map((view) => {
        if (mergeHeader) {
          return (
            <SidebarSection
              key={view.id}
              title=""
              collapsible={false}
              defaultOpen
              headerHidden
            >
              <ErrorBoundary pluginId={pluginId}>
                <view.render />
              </ErrorBoundary>
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
            titleDescription={view.titleDescription}
            titleTooltip={view.titleTooltip}
            showActions={view.showActions ?? "default"}
            stickyTop={toolbarHeight}
          >
            <ErrorBoundary pluginId={pluginId}>
              <view.render />
            </ErrorBoundary>
          </SidebarSection>
        );
      })}
    </>
  );
}
