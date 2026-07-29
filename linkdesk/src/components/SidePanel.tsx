/**
 * SidePanel — 侧栏。E3.6：从"渲染单个 sidebarComponent"归一化为
 * "查 ViewContainerService 桌子 → 循环渲染 <SidebarSection>"。
 *
 * 对标 VS Code：SidePanel 不知道 FOLDERS 是什么、不知道"收发设置"是什么。
 * 它只做一件事——查表 + 循环渲染。谁注册了什么就渲染什么。
 */

import { useState, useEffect, forwardRef, useCallback, useRef } from "react";
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
  useEffect(() => {
    if (!effectiveContainerId) return;
    const sub = ViewContainerService.onDidChangeActiveViews.event(({ containerId }) => {
      if (containerId !== effectiveContainerId) return;
      setLastSidebar((prev) => prev); // force re-render
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

    return activeViews.map((view) => {
      // 🔥 E36#7.3b：title 为空串的 view = 工具栏/搜索栏——不包 SidebarSection，直接渲染
      const isToolbar = view.title === "";
      if (isToolbar) {
        return (
          <ErrorBoundary key={view.id} pluginId={effectiveContainerId}>
            <view.render />
          </ErrorBoundary>
        );
      }

      const headerHidden = mergeHeader;
      const sectionTitle = mergeHeader ? "" : view.title;

      return (
        <SidebarSection
          key={view.id}
          title={sectionTitle}
          collapsible={!mergeHeader}
          defaultOpen={!view.collapsed}
          badge={view.badge}
          actions={view.actions}
          titleDescription={view.titleDescription}
          titleTooltip={view.titleTooltip}
          showActions={view.showActions ?? "default"}
          headerHidden={headerHidden}
        >
          <ErrorBoundary pluginId={effectiveContainerId}>
            <view.render />
          </ErrorBoundary>
        </SidebarSection>
      );
    });
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
