/**
 * SidebarRenderer——E5.6#7b + E5.6#11h。
 *
 * SidebarPool 的 React 渲染器。接收壳推送的 SidebarLayout，
 * 渲染完整容器结构：header + PoolToolbarSlot + PoolSectionStack。
 *
 * E5.6#11h 重写：从简单 PluginComponent 升级为全功能容器。
 */

import { useState, useCallback } from "react";
import PoolToolbarSlot from "./PoolToolbarSlot";
import PoolSectionStack from "./PoolSectionStack";
import type { SidebarAction } from "./PoolSectionStack";
import type { SidebarLayout, SidebarViewMeta } from "../core/types/poolLayout";
// E5.6#11l：复用壳侧栏 CSS
import "../components/SidePanel.css";

interface SidebarRendererProps {
  sidebar?: SidebarLayout;
}

export default function SidebarRenderer({ sidebar }: SidebarRendererProps) {
  const [toolbarHeight, setToolbarHeight] = useState(0);

  // 池→壳 IPC 回调
  const handleSidebarAction = useCallback((action: SidebarAction) => {
    (window as any).linkdesk?.pool?.sidebarAction?.(action);
  }, []);

  // 侧栏不可见——不渲染
  if (!sidebar?.visible) {
    return null;
  }

  const { views, containerId, containerTitle, mergeHeaderWhenSingle, collapsedViews, width } = sidebar;

  // 侧栏可见但无视图——空状态
  if (!views || views.length === 0) {
    return (
      <div style={{ width, height: "100%", overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "var(--text-muted, #888)",
            fontSize: 13,
            userSelect: "none",
          }}
        >
          此容器没有已注册的视图
        </div>
      </div>
    );
  }

  // 分离 toolbar / section 角色
  const toolbarViews: SidebarViewMeta[] = [];
  const sectionViews: SidebarViewMeta[] = [];
  for (const v of views) {
    if (v.role === "toolbar") {
      toolbarViews.push(v);
    } else {
      sectionViews.push(v);
    }
  }

  // mergeHeaderWhenSingle：只有一个 section view 时，view 的 singleViewPaneContainerTitle 替代容器标题
  const effectiveTitle = (mergeHeaderWhenSingle && sectionViews.length === 1 && sectionViews[0].singleViewPaneContainerTitle)
    ? sectionViews[0].singleViewPaneContainerTitle
    : containerTitle;

  return (
    <div style={{ width, height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* 容器 header */}
      {effectiveTitle && (
        <div className="side-panel-header">
          <span className="side-panel-header-title">{effectiveTitle}</span>
        </div>
      )}

      <div className="side-panel-content" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {/* ToolbarSlot——粘顶 */}
        <PoolToolbarSlot views={toolbarViews} onHeightChange={setToolbarHeight} />

        {/* SectionStack——可折叠 / 可拖拽排序 / PaneSash resize */}
        <PoolSectionStack
          views={sectionViews}
          containerId={containerId ?? ""}
          toolbarHeight={toolbarHeight}
          mergeHeaderWhenSingle={mergeHeaderWhenSingle}
          collapsedViews={collapsedViews}
          onSidebarAction={handleSidebarAction}
        />
      </div>
    </div>
  );
}
