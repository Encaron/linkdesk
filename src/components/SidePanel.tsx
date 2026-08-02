/**
 * SidePanel — 侧栏。E3.6：从"渲染单个 sidebarComponent"归一化为
 * "查 ViewContainerService 桌子 → 分组 → 委托 Slot 组件"。
 *
 * 🆕 E36#ROLE7：ToolbarSlot + SectionStack 替代 title="" hack + inline 分支。
 * SidePanel 不再做分支判断——只读表、分组、委托。
 *
 * 对标 VS Code：SidePanel 不知道 FOLDERS 是什么、不知道"收发设置"是什么。
 * 它只做一件事——查表 + 循环渲染。谁注册了什么就渲染什么。
 */

import { useState, useEffect, forwardRef, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ViewContainerService } from "../core/ViewContainerService";
import ToolbarSlot from "./shared/ToolbarSlot";
import SectionStack from "./shared/SectionStack";
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
    const sub = ViewContainerService.onDidChangeActiveViews.event(({ containerId, added, removed }) => {
      console.log("[SidePanel] onDidChangeActiveViews fired, containerId:", containerId, "effective:", effectiveContainerId, "added:", added?.length, "removed:", removed?.length, "subCount:", ViewContainerService._activeViewsSubCount);
      if (containerId !== effectiveContainerId) { console.log("[SidePanel] — skipped (different container)"); return; }
      console.log("[SidePanel] — setVersion trigger re-render");
      setVersion((v) => v + 1);
    });
    return () => sub();
  }, [effectiveContainerId]);

  // 容器描述符 + 活跃 views
  const container = effectiveContainerId
    ? ViewContainerService.getViewContainer(effectiveContainerId)
    : undefined;
  const activeViews = effectiveContainerId
    ? ViewContainerService.getActiveViews(effectiveContainerId)
    : [];

  // 🆕 E36#ROLE：按 role 分组——替代 title="" hack。
  // toolbar 角色粘顶，section 角色（默认）有折叠头同级替换。
  const toolbarViews = activeViews.filter((v) => v.role === "toolbar");
  const sectionViews = activeViews.filter((v) => v.role !== "toolbar");

  // toolbarHeight 从 ToolbarSlot 回调接收——状态归 ToolbarSlot 管，SidePanel 只是转交
  const [toolbarHeight, setToolbarHeight] = useState(0);

  // mergeHeaderWhenSingle——容器 header 标题逻辑
  const singleView = activeViews.length === 1;
  const mergeHeader = singleView && container?.mergeHeaderWhenSingle === true;

  let title = container?.title ?? "";
  if (mergeHeader && activeViews[0]) {
    title = activeViews[0].singleViewPaneContainerTitle ?? activeViews[0].title ?? title;
  }

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

    return (
      <>
        <ToolbarSlot
          views={toolbarViews}
          pluginId={effectiveContainerId}
          onHeightChange={setToolbarHeight}
        />
        <SectionStack
          views={sectionViews}
          pluginId={effectiveContainerId}
          toolbarHeight={toolbarHeight}
          mergeHeaderWhenSingle={container?.mergeHeaderWhenSingle}
        />
      </>
    );
  };

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
