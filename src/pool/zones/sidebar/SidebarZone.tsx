/**
 * SidebarZone——E5.7#10。侧栏 React Zone——E5.6 SidebarRenderer（独立 SidebarPool WCV 渲染器）
 * 迁入同 DOM React 组件（Phase 3 目标）。行为零丢失——对照 SidebarRenderer 6 项验收。
 *
 * 数据全部来自 layout.sidebar（壳 ViewContainerService 序列化 + t() 翻译——显示文本铁律）。
 * 池 = 哑渲染器：写操作全走 window.linkdesk.pool.sidebarAction（E5.6#11j 通道——池→壳 wire 契约）。
 *
 * 职责（设计 Zone分解设计.md §2.3）：
 *   - visible=false → display:none（保持挂载——侧栏插件视图状态不丢）
 *   - collapsed → 整个 zone 消失（E5.8#147 折叠改版：真消失无窄条/▶；壳 layoutEngine zone 宽
 *     ≤48 时壳侧置 collapsed:true——折叠态 grid auto 列 0 宽，主区占满）
 *   - views 空 → 空状态文案（emptyText/emptyHint 壳侧 t() 推送）
 *   - header：containerTitle / mergeHeaderWhenSingle 单视图标题合并 + 右键菜单（无 ◀/▶ 折叠按钮——
 *     折叠/展开仅走图标栏 toggle + 界面勾选菜单，E5.8#159 收口）
 *     （壳 ContextMenu 聪慧组件——menuId "viewTitleContext" 字符串直传，不 import 壳 MenuRegistry（Path B——字符串即桥契约）；
 *     GroupTabBar 同款池内用法：菜单项 lk.menu.getItems 壳侧解析、命令壳侧执行）
 *   - toolbar 粘顶（role==="toolbar" 在滚动容器外）+ section stack（折叠/拖排/PaneSash）
 *   - section 内容 <PluginComponent>——与 MainZone 标签页同加载方式
 *   - E5.7#13 分隔线 + E5.8#37.5 useResizeDrag 迁移——右侧 4px 分隔线（mousedown 拖拽调宽，
 *     乐观本地 + mouseup commit，真相源在壳；分隔线活在可见性条件块内——visible=false 时随
 *     zone display:none 消失（审计不变量））。行为零差异：本地覆盖 + rAF 节流 + 无位移 no-op +
 *     pushLayout 回执对齐（#13 语义原样，实现收敛到 shared hook）。
 *
 * 与 E5.6 SidebarRenderer 差异（诚实注记）：
 *   ① visible=false 由 null 卸载改 display:none——保持插件视图组件挂载（状态不丢）；
 *      实际状态保留仍由 pool-main 的 lastVisibleLayout 顶替逻辑兜底（防闪烁）。
 *   ② 类名 .side-panel-header-title → .side-panel-title——E5.6 用了 CSS 不存在的类
 *     （标题无样式），按壳 SidePanel.css 真相修正。
 *   ③ 空状态两行文案（视图 + 提示）——壳 SidePanel 有两行，E5.6 渲染器只有一行硬编码中文；
 *     按壳语义补全 + 铁律化（emptyText/emptyHint 壳 t() 推送）。
 *   ④ E5.6 的 (window as any).linkdesk 显式 any → window.linkdesk 直用（global.d.ts 已声明）。
 *   ⑤ E5.7#13 拖拽：E5.6 跨 WCV setBounds 老路消失——池内本地宽 + mouseup 一次性 commit
 *     （sidebarAction "setSidebarWidth" → 壳 resizeZone 钳制 → pushLayout 回执）。
 *     钳制界 minWidth/maxWidth 壳推（LayoutEngine dock 声明）——池零硬编码。
 *     E5.6#22m 防护传承：body cursor/userSelect 锁 + buttons===0 窗口外释放。
 *   ⑥ 壳 SidePanel.tsx/.css 已随 E5.7#31 整删——下文"壳 SidePanel"均为 E5.6 历史对标注记。
 */

import { Fragment, useState, useCallback } from "react";
import type { ReactNode } from "react";
import PoolToolbarSlot from "../../shared/pool-toolbar-slot/PoolToolbarSlot"; // E5.7#11：随侧栏组件迁 shared/
import PoolSectionStack from "../../shared/pool-section-stack/PoolSectionStack"; // E5.7#11：随侧栏组件迁 shared/
import type { SidebarAction } from "../../../core/types/ipc/sidebarActions"; // E5.7#97：wire 契约归口
import type { SidebarLayout, SidebarViewMeta } from "../../../core/types/pool/poolLayout";
import { useResizeDrag } from "../../hooks/useResizeDrag"; // E5.8#37.5：通用 resize 拖拽 hook（收敛结构性重复）
import { handleEdgeForSlot } from "../../hooks/gridLayout"; // E5.8#146：handle 落点派生（左槽→右缘、右槽→左缘——恒朝向主区）
// E5.6#11-fix4：header 右键菜单——壳 ContextMenu 聪慧组件（池内用法同 GroupTabBar）
import ContextMenu from "../../../components/shared/context-menu/ContextMenu";
import ViewTitleActions from "../../shared/view-title-actions/ViewTitleActions"; // E5.8#36.6：mergeHeaderWhenSingle 单视图时容器 header 即视图 header——同声明消费
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

  /* ── E5.7#13 分隔线 + E5.8#37.5 useResizeDrag 迁移（行为零差异：#13 语义原样——
       乐观本地宽 + rAF 节流 + mouseup/buttons===0 一次性 commit + 无位移 no-op + pushLayout 回执对齐）。
       E5.8#146 归一化：分隔线落点 + 拖拽方向从 sidebar.edge 派生（PanelZone 先例同款）——
       左槽 handle 右缘（右拖增宽 +1）；右槽 handle 左缘（左拖增宽 -1）。 ── */

  const resize = useResizeDrag({
    axis: "col",
    growSign: sidebar.edge === "right" ? -1 : 1,
    min: sidebar.minWidth ?? 0,
    max: sidebar.maxWidth ?? Infinity,
    value: sidebar.width,
    cursor: "col-resize",
    onCommit: (width) => {
      // 真相源在壳——setSidebarWidth → resizeZone 钳制 → pushLayout 回执
      window.linkdesk?.pool?.sidebarAction?.({ action: "setSidebarWidth", width });
    },
  });

  const { views, containerId, containerTitle, mergeHeaderWhenSingle, collapsedViews } = sidebar;

  // 折叠态派生——拖拽期间本地宽实时判定（壳 collapsed 只在重推时更新，拖拽中途会滞后）
  const collapsed = resize.resizing ? resize.size <= 48 : sidebar.collapsed === true;

  // zone 包装——分隔线活在可见性条件块内（visible=false 或 collapsed → 整体 display:none，
  // grid auto 列 0 宽，主区占满；分隔线随之消失）。E5.8#147：折叠=真消失，无窄条残留。
  const renderZone = (inner: ReactNode) => {
    const zoneHidden = !sidebar.visible || collapsed;
    return (
      <>
        <div className="side-panel-zone" style={zoneHidden ? { display: "none" } : undefined}>
          {inner}
        </div>
        {/* E5.7#13 + 缝系统：4px 分隔线——共享 .zone-resize-handle（index.css 全局层：锚 cell 边界
            = 缝中心，偏移 -inset 缝居中 / 直角贴边）。hover --separator → --separator-hover（HandleLine 行为传承） */}
        <div
          className={`zone-resize-handle vertical ${handleEdgeForSlot(sidebar.edge ?? "left")}`}
          style={zoneHidden ? { display: "none" } : undefined}
          onMouseDown={resize.onResizeStart}
          aria-hidden="true"
        />
      </>
    );
  };

  // E5.7#84：keep-alive 容器清单——全部容器常驻挂载（display:none 切换视图，不卸载组件）。
  // 旧布局（无 containers 字段）回退单容器渲染。真相源在壳：插件卸载 → 容器从清单消失 → 池自然卸载。
  const containers = sidebar.containers
    ?? (containerId ? [{ containerId, containerTitle, mergeHeaderWhenSingle, views }] : []);
  const activeEntry = containers.find((c) => c.containerId === containerId);

  // 活动容器的 section 视图——header 右键菜单"视图"子菜单动态项（菜单只能从活动容器 header 打开）
  const activeSectionViews = (activeEntry?.views ?? []).filter((v) => v.role !== ROLE_TOOLBAR);

  // 空状态占位（文案壳侧 t() 推送——显示文本铁律）
  const renderPlaceholder = () => (
    <div className={`side-panel${resize.resizing ? " resizing" : ""}`} style={{ width: resize.size, height: "100%" }}>
      <div className="side-panel-placeholder">
        <p>{sidebar.emptyText}</p>
        {sidebar.emptyHint && <p className="side-panel-placeholder-hint">{sidebar.emptyHint}</p>}
      </div>
    </div>
  );

  return renderZone(
    /* visible=false → display:none（设计 §2.3——保持挂载，视图状态不丢）。实际推送路径上
       pool-main lastVisibleLayout 顶替已保证侧栏不闪，此守卫兜冷启动（从未显示过侧栏）。 */
    <>
      {/* E5.8#147 折叠改版：折叠=真消失（无窄条/▶）。容器视图 keep-alive 保留（display:none 不卸载——
          折叠态容器仍在 containers.map 内挂载，视图状态不丢）。 */}
      {containers.map((c) => {
        // 无视图容器：活动 → 空态占位；非活动 → 不渲染（无组件可保持）
        if (c.views.length === 0) {
          return c.containerId === containerId && !collapsed
            ? <Fragment key={c.containerId}>{renderPlaceholder()}</Fragment>
            : null;
        }
        const isActive = c.containerId === containerId;
        const toolbarViews: SidebarViewMeta[] = [];
        const sectionViews: SidebarViewMeta[] = [];
        for (const v of c.views) {
          if (v.role === ROLE_TOOLBAR) {
            toolbarViews.push(v);
          } else {
            sectionViews.push(v);
          }
        }
        // mergeHeaderWhenSingle：只有一个 section view 时，view 的 singleViewPaneContainerTitle 替代容器标题
        const effectiveTitle = (c.mergeHeaderWhenSingle && sectionViews.length === 1 && sectionViews[0].singleViewPaneContainerTitle)
          ? sectionViews[0].singleViewPaneContainerTitle
          : c.containerTitle;
        return (
          /* E5.7#84：keep-alive——display:none 切换（含折叠态），组件常驻不卸载。
             .side-panel CSS 已含 display:flex + flex-direction:column——活动态不覆盖。 */
          <div
            key={c.containerId}
            className={`side-panel${resize.resizing ? " resizing" : ""}`}
            style={{ width: resize.size, height: "100%", display: isActive && !collapsed ? undefined : "none" }}
          >
            {/* 容器 header——display:none 容器不可交互（仅活动容器可见） */}
            {effectiveTitle && (
              <div
                className="side-panel-header"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setHeaderMenu({ x: e.clientX, y: e.clientY });
                }}
              >
                <span className="side-panel-title" title={effectiveTitle}>{effectiveTitle}</span>
                {/* E5.8#36.6：mergeHeaderWhenSingle 单视图合并——容器 header 即视图 header，titleActions 同声明消费 */}
                {c.mergeHeaderWhenSingle === true && sectionViews.length === 1 && sectionViews[0].titleActions?.length
                  ? <ViewTitleActions actions={sectionViews[0].titleActions} />
                  : null}
                {/* E5.8#159 收口：无 ◀/▶ 折叠按钮——折叠/展开仅走图标栏 toggle + 界面勾选菜单 */}
              </div>
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
                  containerId={c.containerId}
                  toolbarHeight={0}
                  mergeHeaderWhenSingle={c.mergeHeaderWhenSingle}
                  collapsedViews={collapsedViews}
                  onSidebarAction={handleSidebarAction}
                />
              </div>
            </div>
          </div>
        );
      })}
      {/* 无任何侧栏容器——空态占位 */}
      {!collapsed && containers.length === 0 && renderPlaceholder()}

      {/* header 右键菜单——壳 ContextMenu（聪慧→哑数据流：lk.menu.getItems 壳侧解析，
          resolveChildren 填"视图"子菜单动态项——壳 SidePanel 同款） */}
      {headerMenu && (
        <ContextMenu
          menuId="viewTitleContext"
          anchor={headerMenu}
          context={{ containerId: containerId ?? undefined }}
          onClose={() => setHeaderMenu(null)}
          resolveChildren={(_parentId, ctx) => {
            const cid = ctx.containerId as string | undefined;
            if (!cid) return undefined;
            return activeSectionViews.map((v) => ({
              id: "workbench.action.toggleViewVisibility",
              label: v.title ?? v.id,
            }));
          }}
        />
      )}
    </>
  );
}
