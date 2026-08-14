/**
 * SidebarZone——E5.7#10。侧栏 React Zone——E5.6 SidebarRenderer（独立 SidebarPool WCV 渲染器）
 * 迁入同 DOM React 组件（Phase 3 目标）。行为零丢失——对照 SidebarRenderer 6 项验收。
 *
 * 数据全部来自 layout.sidebar（壳 ViewContainerService 序列化 + t() 翻译——显示文本铁律）。
 * 池 = 哑渲染器：写操作全走 window.linkdesk.pool.sidebarAction（E5.6#11j 通道，Phase 12 归位命名）。
 *
 * 职责（设计 Zone分解设计.md §2.3）：
 *   - visible=false → display:none（保持挂载——侧栏插件视图状态不丢）
 *   - collapsed → 只渲染 ▶ 展开按钮（壳 layoutEngine zone 宽 ≤48 时壳侧置 collapsed:true）
 *   - views 空 → 空状态文案（emptyText/emptyHint 壳侧 t() 推送）
 *   - header：containerTitle / mergeHeaderWhenSingle 单视图标题合并 + ◀ 折叠按钮 + 右键菜单
 *     （壳 ContextMenu 聪慧组件——menuId "viewTitleContext" 字符串直传，不 import core MenuId（Path B）；
 *     GroupTabBar 同款池内用法：菜单项 lk.menu.getItems 壳侧解析、命令壳侧执行）
 *   - toolbar 粘顶（role==="toolbar" 在滚动容器外）+ section stack（折叠/拖排/PaneSash）
 *   - section 内容 <PluginComponent>——与 MainZone 标签页同加载方式
 *
 * 与 E5.6 SidebarRenderer 差异（诚实注记）：
 *   ① visible=false 由 null 卸载改 display:none——保持插件视图组件挂载（状态不丢）；
 *      实际状态保留仍由 pool-main 的 lastVisibleLayout 顶替逻辑兜底（防闪烁）。
 *   ② 类名 .side-panel-header-title → .side-panel-title——E5.6 用了 CSS 不存在的类
 *     （标题无样式），按壳 SidePanel.css 真相修正。
 *   ③ 空状态两行文案（视图 + 提示）——壳 SidePanel 有两行，E5.6 渲染器只有一行硬编码中文；
 *     按壳语义补全 + 铁律化（emptyText/emptyHint 壳 t() 推送）。
 *   ④ E5.6 的 (window as any).linkdesk 显式 any → window.linkdesk 直用（global.d.ts 已声明）。
 */

import { useState, useCallback } from "react";
import PoolToolbarSlot from "../shared/PoolToolbarSlot"; // E5.7#11：随侧栏组件迁 shared/
import PoolSectionStack from "../shared/PoolSectionStack"; // E5.7#11：随侧栏组件迁 shared/
import type { SidebarAction } from "../shared/PoolSectionStack";
import type { SidebarLayout, SidebarViewMeta } from "../../core/types/poolLayout";
// E5.6#11-fix4：header 右键菜单——壳 ContextMenu 聪慧组件（池内用法同 GroupTabBar）
import ContextMenu from "../../components/shared/ContextMenu";
import "./SidebarZone.css";

/** role 判别字面量——eslint no-restricted-syntax 拦 `=== "小写字面量"`（防 pluginId 硬编码，
 *  误伤 Union tag 判别）。role 是视图角色（非插件 ID），按规则提示提为大写常量。 */
const ROLE_TOOLBAR = "toolbar" as const;

interface SidebarZoneProps {
  sidebar: SidebarLayout;
}

export default function SidebarZone({ sidebar }: SidebarZoneProps) {
  // toolbar height tracked for PoolToolbarSlot（toolbar 在滚动容器外，不再传给 PoolSectionStack）
  const setToolbarHeight = useState(0)[1];
  // E5.6#11-fix4：header 右键菜单状态——对标壳 SidePanel.tsx
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number } | null>(null);

  // 池→壳 IPC 回调（E5.6#11j 通道——reorder/setCollapsed/setVisible/toggleSidebarCollapse）
  const handleSidebarAction = useCallback((action: SidebarAction) => {
    window.linkdesk?.pool?.sidebarAction?.(action);
  }, []);

  const { views, containerId, containerTitle, mergeHeaderWhenSingle, collapsedViews, width, collapsed } = sidebar;

  // 折叠态——只渲染 ▶ 展开按钮（壳 SidePanel.tsx:211-218 对标）
  if (collapsed) {
    return (
      <div className="side-panel collapsed" style={{ width, height: "100%" }}>
        <button
          className="side-panel-expand"
          onClick={() => handleSidebarAction({ action: "toggleSidebarCollapse", containerId: containerId ?? "" })}
          title={sidebar.expandTooltip}
        >
          ▶
        </button>
      </div>
    );
  }

  // 侧栏可见但无视图——空状态（文案壳侧 t() 推送——显示文本铁律）
  if (!views || views.length === 0) {
    return (
      <div className="side-panel" style={{ width, height: "100%" }}>
        <div className="side-panel-placeholder">
          <p>{sidebar.emptyText}</p>
          {sidebar.emptyHint && <p className="side-panel-placeholder-hint">{sidebar.emptyHint}</p>}
        </div>
      </div>
    );
  }

  // 分离 toolbar / section 角色
  const toolbarViews: SidebarViewMeta[] = [];
  const sectionViews: SidebarViewMeta[] = [];
  for (const v of views) {
    if (v.role === ROLE_TOOLBAR) {
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
    /* visible=false → display:none（设计 §2.3——保持挂载，视图状态不丢）。实际推送路径上
       pool-main lastVisibleLayout 顶替已保证侧栏不闪，此守卫兜冷启动（从未显示过侧栏）。 */
    <div className="side-panel-zone" style={sidebar.visible ? undefined : { display: "none" }}>
      <div className="side-panel" style={{ width, height: "100%" }}>
        {/* 容器 header */}
        {effectiveTitle && (
          <div
            className="side-panel-header"
            onContextMenu={(e) => {
              e.preventDefault();
              setHeaderMenu({ x: e.clientX, y: e.clientY });
            }}
          >
            <span className="side-panel-title" title={effectiveTitle}>{effectiveTitle}</span>
            {/* ◀ 折叠按钮——对标壳 SidePanel.tsx:229-236 */}
            <button
              className="side-panel-collapse"
              onClick={() => handleSidebarAction({ action: "toggleSidebarCollapse", containerId: containerId ?? "" })}
              title={sidebar.collapseTooltip}
            >
              ◀
            </button>
          </div>
        )}
        {/* header 右键菜单——壳 ContextMenu（聪慧→哑数据流：lk.menu.getItems 壳侧解析，
            resolveChildren 填"视图"子菜单动态项——壳 SidePanel.tsx:256-264 同款） */}
        {headerMenu && (
          <ContextMenu
            menuId="viewTitleContext"
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

        <div className="side-panel-content">
          {/* ToolbarSlot——粘顶，flex-shrink:0 保证永不滚动消失（E5.6#16.7k） */}
          <div style={{ flexShrink: 0 }}>
            <PoolToolbarSlot views={toolbarViews} onHeightChange={setToolbarHeight} />
          </div>

          {/* SectionStack——可折叠 / 可拖排 / PaneSash resize。
              toolbar 已挪到滚动容器外，stickyTop=0（不再需为 toolbar 留高度） */}
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
    </div>
  );
}
