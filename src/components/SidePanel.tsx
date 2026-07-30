/**
 * SidePanel — 侧栏。E3.6：从"渲染单个 sidebarComponent"归一化为
 * "查 ViewContainerService 桌子 → 循环渲染 <SidebarSection>"。
 *
 * 对标 VS Code：SidePanel 不知道 FOLDERS 是什么、不知道"收发设置"是什么。
 * 它只做一件事——查表 + 循环渲染。谁注册了什么就渲染什么。
 */

import { useState, useEffect, useLayoutEffect, forwardRef, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ViewContainerService } from "../core/ViewContainerService";
import type { ViewDescriptor } from "../core/ViewContainerService";
import ErrorBoundary from "./shared/ErrorBoundary";
import SidebarSection from "./shared/SidebarSection";
import "./SidePanel.css";

interface SidePanelProps {
  activeTabType: string;
  activePluginId?: string;
  sidebarView?: string | null;
  width: number;
}

const SidePanel = forwardRef<HTMLElement, SidePanelProps>(
  function SidePanel({ activePluginId: _activePluginId, sidebarView, width }, ref) {
  const [collapsed, setCollapsed] = useState(false);
  const [animating, setAnimating] = useState(false);
  const { t } = useTranslation();
  const asideRef = useRef<HTMLElement | null>(null);

  // 🔥 UX03：onTransitionEnd 替代 setTimeout(220)
  const handleTransitionEnd = useCallback(() => {
    setAnimating(false);
  }, []);

  const toggleCollapse = useCallback((collapse: boolean) => {
    setAnimating(true);
    setCollapsed(collapse);
  }, []);

  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    el.addEventListener("transitionend", handleTransitionEnd);
    return () => el.removeEventListener("transitionend", handleTransitionEnd);
  }, [handleTransitionEnd]);

  const cls = ["side-panel"];
  if (collapsed) cls.push("collapsed");
  if (animating) cls.push("animating");

  // lastSidebar 记住上次有效 containerId——切换标签页不关闭侧栏
  const [lastSidebar, setLastSidebar] = useState<string | null>(null);
  const effectiveContainerId = sidebarView ?? lastSidebar;

  useEffect(() => {
    if (effectiveContainerId) setLastSidebar(effectiveContainerId);
  }, [effectiveContainerId]);

  // 🔥 Bug 3/4 防线——StrictMode remount 旧订阅清理 + 不活跃时不处理事件
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!effectiveContainerId) return;
    const sub = ViewContainerService.onDidChangeActiveViews.event(({ containerId }) => {
      if (containerId !== effectiveContainerId) return;
      setVersion((v) => v + 1); // force re-render——setState(prev=>prev) 不触发重渲染
    });
    return () => sub();
  }, [effectiveContainerId]);

  // 容器描述符 + 活跃 views
  const container = effectiveContainerId
    ? ViewContainerService.getViewContainer(effectiveContainerId)
    : undefined;
  const activeViews: ViewDescriptor[] = effectiveContainerId
    ? ViewContainerService.getActiveViews(effectiveContainerId)
    : [];

  // 🆕 E3.6 ST2b：ResizeObserver 监听 toolbar 动态高度——无需 React re-render 即可响应尺寸变化
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);

  useLayoutEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        setToolbarHeight((prev) => (prev !== h ? h : prev));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  });

  // mergeHeaderWhenSingle——单 view 时隐藏 view header
  const singleView = activeViews.length === 1;
  const mergeHeader = singleView && container?.mergeHeaderWhenSingle === true;

  const renderSidebarContent = () => {
    if (!effectiveContainerId) return null;

    if (activeViews.length === 0) {
      return (
        <div className="side-panel-placeholder">
          <p>{t("此容器没有已注册的视图")}</p>
          <p className="side-panel-placeholder-hint">{t("安装插件以添加视图")}</p>
        </div>
      );
    }

    // mergeHeaderWhenSingle——单 view 容器不拆分 toolbar/section、不走 sticky
    if (mergeHeader) {
      return activeViews.map((view) => {
        const noHeader = view.title === "";

        if (mergeHeader && !noHeader) {
          return (
            <SidebarSection
              key={view.id}
              title=""
              collapsible={false}
              defaultOpen
              headerHidden
            >
              <ErrorBoundary pluginId={effectiveContainerId}>
                <view.render />
              </ErrorBoundary>
            </SidebarSection>
          );
        }

        return (
          <SidebarSection
            key={view.id}
            title={view.title}
            collapsible={!noHeader}
            defaultOpen={!view.collapsed}
            badge={view.badge}
            actions={view.actions}
            titleDescription={view.titleDescription}
            titleTooltip={view.titleTooltip}
            showActions={view.showActions ?? "default"}
            headerHidden={noHeader}
          >
            <ErrorBoundary pluginId={effectiveContainerId}>
              <view.render />
            </ErrorBoundary>
          </SidebarSection>
        );
      });
    }

    // 🆕 E3.6 ST2：多 view 容器——拆分 toolbar（title=""）和 section，section header sticky 层层叠加
    const toolbarViews = activeViews.filter((v) => v.title === "");
    const sectionViews = activeViews.filter((v) => v.title !== "");

    return (
      <>
        {toolbarViews.length > 0 && (
          <div ref={toolbarRef} className="side-panel-toolbar">
            {toolbarViews.map((view) => (
              <ErrorBoundary key={view.id} pluginId={effectiveContainerId}>
                <view.render />
              </ErrorBoundary>
            ))}
          </div>
        )}
        {/* 🆕 ST2：同级 section header 共用一个 sticky top——碰顶时替换而非叠加。
             对标 VS Code：同级 view header 互相顶走，只有父子才层层叠加。 */}
        {sectionViews.map((view) => (
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
            <ErrorBoundary pluginId={effectiveContainerId}>
              <view.render />
            </ErrorBoundary>
          </SidebarSection>
        ))}
      </>
    );
  };

  // 标题：容器 title，mergeHeader 时用 view.singleViewPaneContainerTitle
  let title = container?.title ?? "";
  if (mergeHeader && activeViews[0]) {
    title = activeViews[0].singleViewPaneContainerTitle ?? activeViews[0].title ?? title;
  }

  return (
    <aside
      ref={(node) => {
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = node;
        asideRef.current = node;
      }}
      className={cls.join(" ")}
      style={{ width: collapsed ? 28 : width }}
    >
      {collapsed ? (
        <button
          className="side-panel-expand"
          onClick={() => toggleCollapse(false)}
          title={t("展开侧栏")}
        >
          ▶
        </button>
      ) : (
        <>
          <div className="side-panel-header">
            <span className="side-panel-title" title={title}>{title}</span>
            <button
              className="side-panel-collapse"
              onClick={() => toggleCollapse(true)}
              title={t("折叠侧栏")}
            >
              ◀
            </button>
          </div>
          <div className="side-panel-content">
            {renderSidebarContent()}
          </div>
        </>
      )}
    </aside>
  );
});

export default SidePanel;
