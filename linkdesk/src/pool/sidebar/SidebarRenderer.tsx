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
import type { SidebarLayout, SidebarViewMeta } from "../../core/types/poolLayout";
// E5.6#11l：复用壳侧栏 CSS
import "../../components/SidePanel.css";
// E5.6#11-fix4：header 右键菜单——对标壳 SidePanel.tsx
import ContextMenu from "../../components/shared/ContextMenu";
import { MenuId } from "../../core/registry/MenuRegistry";

interface SidebarRendererProps {
  sidebar?: SidebarLayout;
}

export default function SidebarRenderer({ sidebar }: SidebarRendererProps) {
  const setToolbarHeight = useState(0)[1]; // toolbar height tracked for PoolToolbarSlot, no longer passed to PoolSectionStack (toolbar outside scroll area)

  // E5.6#11-fix4：header 右键菜单状态——对标壳 SidePanel.tsx
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number } | null>(null);

  // 池→壳 IPC 回调
  const handleSidebarAction = useCallback((action: SidebarAction) => {
    (window as any).linkdesk?.pool?.sidebarAction?.(action);
  }, []);

  // 侧栏不可见——不渲染
  if (!sidebar?.visible) {
    return null;
  }

  const { views, containerId, containerTitle, mergeHeaderWhenSingle, collapsedViews, width, collapsed } = sidebar;

  // E5.6#11-fix7：折叠态——只渲染 ▶ 展开按钮（对标壳 SidePanel.tsx:211-218）
  if (collapsed) {
    return (
      <div className="side-panel collapsed" style={{ width, height: "100%", overflow: "hidden" }}>
        <button
          className="side-panel-expand"
          onClick={() => handleSidebarAction({ action: "toggleSidebarCollapse", containerId: containerId ?? "" })}
          title="展开侧栏"
        >
          ▶
        </button>
      </div>
    );
  }

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
    <div className="side-panel" style={{ width, height: "100%", overflow: "hidden" }}>
      {/* 容器 header */}
      {effectiveTitle && (
        <div
          className="side-panel-header"
          onContextMenu={(e) => {
            e.preventDefault();
            setHeaderMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          <span className="side-panel-header-title">{effectiveTitle}</span>
          {/* E5.6#11-fix7：◀ 折叠按钮——对标壳 SidePanel.tsx:229-236 */}
          <button
            className="side-panel-collapse"
            onClick={() => handleSidebarAction({ action: "toggleSidebarCollapse", containerId: containerId ?? "" })}
            title="折叠侧栏"
          >
            ◀
          </button>
        </div>
      )}
      {/* E5.6#11-fix4：header 右键菜单——对标壳 SidePanel.tsx */}
      {headerMenu && (
        <ContextMenu
          menuId={MenuId.ViewTitleContext}
          anchor={headerMenu}
          context={{ containerId: containerId ?? undefined }}
          onClose={() => setHeaderMenu(null)}
          resolveChildren={(_parentId, ctx) => {
            const cid = ctx.containerId as string | undefined;
            if (!cid) return undefined;
            return sectionViews.map((v) => ({
              id: "workbench.action.toggleViewVisibility",
              label: v.title ?? v.id,
            }));
          }}
        />
      )}

      <div className="side-panel-content" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* ToolbarSlot——粘顶，flex-shrink:0 保证永不滚动消失 */}
        <div style={{ flexShrink: 0 }}>
          <PoolToolbarSlot views={toolbarViews} onHeightChange={setToolbarHeight} />
        </div>

        {/* SectionStack——可折叠 / 可拖拽排序 / PaneSash resize。
            🔥 E5.6#16.7k 修复：toolbar 已挪到滚动容器外，stickyTop=0（不再需为 toolbar 留高度）。 */}
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
    </div>
  );
}
