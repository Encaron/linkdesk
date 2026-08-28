/**
 * RightSidebarZone——E5.7#22 骨架 + E5.8#37.5 真渲染。右侧栏 Zone（greenfield——设计 Zone分解设计.md §2.7）。
 *
 * 和 SidebarZone（#10）同构——复用 pool/shared/ 的 PoolSectionStack / PoolToolbarSlot（#11 已迁入）。
 * 默认隐藏：PoolZoneShell 按 layout.rightSidebar?.visible 条件渲染（无数据 → 零 DOM）。
 *
 * 职责（#37.5 真渲染）：
 *   - header（containerTitle 壳 t() 推送——显示文本铁律）
 *   - toolbar 粘顶（PoolToolbarSlot）+ section stack（PoolSectionStack——折叠/拖排/PaneSash 自带）
 *   - 左侧 4px resize handle——useResizeDrag（#37.5 抽 hook 收敛，growSign -1 左拖增宽，#13 语义零差异迁移）
 *   - collapsed 态（宽度 ≤48 派生）——整个 zone 消失（E5.8#159 折叠同源改版：与 #147 左栏同款
 *     真消失无窄条/▶；壳 layoutEngine zone 宽 ≤48 时壳侧置 collapsed:true——grid auto 列 0 宽，主区占满）
 *   - 空态文案 emptyText/emptyHint 壳 t() 推送（SidebarLayout 既有字段）
 *
 * 🔴 壳侧暂无右栏容器生产者——当前真渲染「空容器」形态（宽度/折叠/handle 镜像全可用）。
 *   与 SidebarZone 的差异（诚实注记——壳无监听/无生产者 = 安全 no-op，非历史延期）：
 *   ① 无 ◀/▶ 折叠按钮（E5.8#159 收口：折叠=真消失 + 头部箭头按钮整删——折叠/展开仅走
 *      图标栏 toggle + 界面勾选菜单，与左栏同款）；
 *   ② 视图 reorder/setCollapsed → pool.sidebarAction（通道按 containerId 泛化——右栏容器
 *      注册后同一通道直达壳 ViewContainerService；当前无容器 = 安全 no-op）；
 *   ③ 宽度 commit → events.emit("rightSidebar:resize", { width })——不借 setSidebarWidth
 *      （该 action 壳 handler 是左栏专属语义，无 containerId 参数）——壳无监听 = 安全 no-op。
 */

import { useState, useCallback } from "react";
import type { ReactNode } from "react";
import PoolToolbarSlot from "../../shared/pool-toolbar-slot/PoolToolbarSlot";
import PoolSectionStack from "../../shared/pool-section-stack/PoolSectionStack";
import ViewTitleActions from "../../shared/view-title-actions/ViewTitleActions"; // E5.8#36.6：mergeHeaderWhenSingle 单视图时容器 header 即视图 header——同声明消费
import type { SidebarAction } from "../../../core/types/ipc/sidebarActions"; // E5.7#97：wire 契约归口
import type { RightSidebarLayout, SidebarViewMeta } from "../../../core/types/pool/poolLayout"; // E5.8#36.8：右栏真 zone 类型（消费字段同 SidebarLayout）
import { useResizeDrag } from "../../hooks/useResizeDrag"; // E5.8#37.5：通用 resize 拖拽 hook（收敛结构性重复）
import { handleEdgeForSlot } from "../../hooks/gridLayout"; // E5.8#146：handle 落点派生（左槽→右缘、右槽→左缘——恒朝向主区）
import "./RightSidebarZone.css";

/** role 判别字面量——eslint no-restricted-syntax 拦 `=== "小写字面量"`（SidebarZone #10 同款提大写常量） */
const ROLE_TOOLBAR = "toolbar" as const;

interface RightSidebarZoneProps {
  rightSidebar: RightSidebarLayout;
  /** E5.8#146：右栏所在槽边——PoolZoneShell 从 sidebar.edge 对边反推（RightSidebarLayout 不携带自身
   *  edge，防两处字面量——池布局 DTO 设计注）。handle 落点 + 拖拽方向全由此派生。 */
  edge: "left" | "right";
}

export default function RightSidebarZone({ rightSidebar, edge }: RightSidebarZoneProps) {
  // toolbar height tracked for PoolToolbarSlot（SidebarZone #10 同款）
  const setToolbarHeight = useState(0)[1];

  // 池→壳 IPC 回调（E5.6#11j 通道——按 containerId 泛化；右栏容器壳侧注册后同一通道直达）
  const handleSidebarAction = useCallback((action: SidebarAction) => {
    window.linkdesk?.pool?.sidebarAction?.(action);
  }, []);

  /* ── E5.7#22 + E5.8#37.5：resize handle——useResizeDrag（#13 语义零差异迁移：
       乐观本地宽 + rAF 节流 + mouseup/buttons===0 一次性 commit + 无位移 no-op + pushLayout 回执对齐）。
       E5.8#146 归一化：handle 落点 + 拖拽方向从 edge 派生（PanelZone 先例同款）——
       右槽 handle 左缘（左拖增宽 -1）；左槽 handle 右缘（右拖增宽 +1）。 ── */

  const resize = useResizeDrag({
    axis: "col",
    growSign: edge === "right" ? -1 : 1,
    min: rightSidebar.minWidth ?? 0,
    max: rightSidebar.maxWidth ?? Infinity,
    value: rightSidebar.width,
    cursor: "col-resize",
    onCommit: (width) => {
      // 真相源在壳——壳无监听 = 安全 no-op（钳制 → pushLayout 回执，右栏容器生产后壳接线即达）
      window.linkdesk?.events?.emit("rightSidebar:resize", { width });
    },
  });

  const { views, containerId, containerTitle, mergeHeaderWhenSingle, collapsedViews } = rightSidebar;

  // 折叠态派生——拖拽期间本地宽实时判定（与 SidebarZone #10 同款；壳 collapsed 只在重推时更新）
  const collapsed = resize.resizing ? resize.size <= 48 : rightSidebar.collapsed === true;

  // 分离 toolbar / section 角色（SidebarZone #10 同款）
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

  const renderContent = () => {
    // 无视图——空状态（文案壳侧 t() 推送——显示文本铁律）
    if (!views || views.length === 0) {
      return (
        <div className="side-panel-placeholder">
          <p>{rightSidebar.emptyText}</p>
          {rightSidebar.emptyHint && <p className="side-panel-placeholder-hint">{rightSidebar.emptyHint}</p>}
        </div>
      );
    }
    return (
      <div className="side-panel-content">
        {/* ToolbarSlot——粘顶，flex-shrink:0 保证永不滚动消失（SidebarZone #10 同款） */}
        <div style={{ flexShrink: 0 }}>
          <PoolToolbarSlot views={toolbarViews} onHeightChange={setToolbarHeight} />
        </div>

        {/* SectionStack——可折叠 / 可拖排 / PaneSash resize（shared/ 复用，#11 已迁入） */}
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
    );
  };

  // zone 包装——分隔线活在可见性条件块内（visible=false 或 collapsed → 整体 display:none，
  // grid auto 列 0 宽，主区占满；分隔线随之消失）。E5.8#159：右栏折叠同源改版——折叠=真消失，无窄条残留。
  const renderZone = (inner: ReactNode) => {
    const zoneHidden = !rightSidebar.visible || collapsed;
    return (
      <>
        <div className="right-sidebar-zone" style={zoneHidden ? { display: "none" } : undefined}>
          {inner}
        </div>
        {/* E5.7#22 + 缝系统：左侧 4px resize handle——共享 .zone-resize-handle（index.css 全局层：
            锚本格左边界 = 缝中心，偏移 -inset 缝居中 / 直角贴边）。#13 同款视觉（--separator → --separator-hover） */}
        <div
          className={`zone-resize-handle vertical ${handleEdgeForSlot(edge)}`}
          style={zoneHidden ? { display: "none" } : undefined}
          onMouseDown={resize.onResizeStart}
          aria-hidden="true"
        />
      </>
    );
  };

  return renderZone(
    <>
      <div className={`side-panel${resize.resizing ? " resizing" : ""}`} style={{ width: resize.size, height: "100%" }}>
        {/* 容器 header（无 ◀/▶ 折叠按钮——差异注记 ①：折叠/展开仅走图标栏 toggle + 界面勾选菜单） */}
        {effectiveTitle && (
          <div className="side-panel-header">
            <span className="side-panel-title" title={effectiveTitle}>{effectiveTitle}</span>
            {/* E5.8#36.6：mergeHeaderWhenSingle 单视图合并——容器 header 即视图 header，titleActions 同声明消费 */}
            {mergeHeaderWhenSingle === true && sectionViews.length === 1 && sectionViews[0].titleActions?.length
              ? <ViewTitleActions actions={sectionViews[0].titleActions} />
              : null}
          </div>
        )}
        {renderContent()}
      </div>
    </>
  );
}
