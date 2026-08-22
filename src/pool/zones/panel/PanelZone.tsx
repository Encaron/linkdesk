/**
 * PanelZone——E5.7#21 骨架 + #63.7 数据生产者落地 + E5.8#34 容器切换器完形 + #37.5 四向换轴。
 *
 * 职责：
 *   - 容器切换器（#34）——标签行首 switcher 按钮（容器名 + ⌄），点击展开按容器分组下拉
 *     （dd-group 容器标题 + dd-item：✓勾选/视图名/插件 sub——mockup 帧 2 拍板形态）。
 *     点视图名 = 切换激活（panel:viewSelected 现成）；勾选 = 显隐（panel:toggleViewVisibility 新桥）；
 *     隐藏视图点击名字自动恢复可见 + 激活（对齐 [+] 决策：含已隐藏视图选中自动恢复可见）。
 *   - PanelTabBar 28px 矮标签栏（views 来自 layout.panel.views——PanelViewMeta[]，标题壳 t() 推送）
 *   - keep-alive 内容区——所有 views 平级渲染 display 切换（MainZone TabContent 同模式）；
 *     E5.7#63.7：每 view 经 PluginComponent 按 renderPath 动态加载（侧栏同款 O(1) glob 查找，
 *     零静态表——写死 pluginId 违反插件独立铁律 + 硬约束 10）
 *   - E5.8#34 空态——全不勾（全部隐藏）/ 无贡献视图时 .panel-empty 占位（emptyText/emptyHint 壳 t() 推送）
 *   - E5.8#37.5 resize handle 四向换轴（S4）——面板 edge 决定 handle 落哪条边 + 拖拽轴：
 *       底面板 → handle 顶缘（row，向上拖增高）   顶面板 → handle 底缘（row，向下拖增高）
 *       左面板 → handle 右缘（col，向右拖增宽）   右面板 → handle 左缘（col，向左拖增宽）
 *     高度/宽度双态 style（edge∈{bottom,top} → height；edge∈{left,right} → width，竖条列）
 *     ——共用 useResizeDrag（#37.5 抽 hook 收敛 SidebarZone↔RightSidebarZone 孪生，行为零差异迁移）。
 *     钳制界轴感知：横带 minHeight/maxHeight、竖条 minWidth/maxWidth（壳推，池零硬编码）。
 *
 * 池→壳通道：window.linkdesk.events.emit（IconBarZone #6 同款）——
 *   "panel:viewSelected" / "panel:resize" 由 #63.7 壳侧消费（App.tsx 事件桥）；
 *   "panel:resize" 载荷轴感知（#36.9 桥锁步）：竖条 { width } / 横带 { height }；
 *   "panel:toggleViewVisibility" 由 #34 壳侧消费（→ ViewContainerService.setVisible 落盘 + 重推回执）；
 *   "panel:createView" 归 Phase 12 面板创建（现无监听者——安全 no-op）。
 */

import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import type { PanelLayout, PanelSwitcherItem } from "../../../core/types/pool/poolLayout";
import { Z_INDEX } from "../../../constants"; // E5.7#26：浮层层级表——panelResizeHandle
import { useResizeDrag } from "../../hooks/useResizeDrag"; // E5.8#37.5：通用 resize 拖拽 hook（收敛结构性重复）
import PluginComponent from "../../shared/plugin-component/PluginComponent"; // E5.7#63.7：面板视图动态加载（侧栏同款）
import ViewTitleActions from "../../shared/view-title-actions/ViewTitleActions"; // E5.8#36.5：标签栏右侧动作区（活动视图 titleActions 声明）
import ContextMenu from "../../../components/shared/context-menu/ContextMenu"; // E5.8#37.7：标签栏右键——位置/对齐子菜单 + 视图显隐（#37.7.1）
import "../../shared/dropdown-card/dropdown-card.css"; // E5.8#36.5 共享下拉卡片本体（.dropdown-card）
import "./PanelZone.css";

interface PanelZoneProps {
  panel: PanelLayout;
}

export default function PanelZone({ panel }: PanelZoneProps) {
  const { views, activeViewId, switcher = [], emptyText, emptyHint } = panel;

  /* ── E5.8#37.5：resize handle 四向换轴——面板 edge 决定 handle 位置/拖拽轴/钳制界（S4）。
       共用 useResizeDrag（#37.5 抽 hook——乐观本地 + rAF 节流 + mouseup 一次性 commit + 无位移 no-op +
       pushLayout 回执对齐，SidebarZone #13 语义零差异迁移）。
       growSign：底=-1（顶缘向上拖增高）/ 顶=+1（底缘向下拖增高）/ 左=+1（右缘向右拖增宽）/ 右=-1（左缘向左拖增宽）。
       载荷轴感知：#36.9 桥锁步——竖条 { width } / 横带 { height }。 ── */

  const edge = panel.edge ?? "bottom";
  const isVertical = edge === "left" || edge === "right";
  // handle 落点（面板自身坐标）：底面板→顶缘 / 顶面板→底缘 / 左面板→右缘 / 右面板→左缘
  const handlePosition = edge === "bottom" ? "top" : edge === "top" ? "bottom" : edge === "left" ? "right" : "left";
  // handle 位于 flex 主向首/末：顶缘/右缘在 column/row 流首（底/右面板）；底缘/左缘在流末
  const handleFirst = handlePosition === "top" || handlePosition === "left";

  const resize = useResizeDrag({
    axis: isVertical ? "col" : "row",
    growSign: edge === "bottom" || edge === "right" ? -1 : 1,
    min: isVertical ? (panel.minWidth ?? 0) : (panel.minHeight ?? 0),
    max: isVertical ? (panel.maxWidth ?? Infinity) : (panel.maxHeight ?? Infinity),
    value: isVertical ? (panel.width ?? 300) : panel.height,
    cursor: isVertical ? "col-resize" : "row-resize",
    onCommit: (size) => {
      // 真相源在壳——#36.9 App.tsx 桥按 edge 轴路由（resizeZone/resizeZoneHeight 钳制 → pushLayout 回执）
      window.linkdesk?.events?.emit("panel:resize", isVertical ? { width: size } : { height: size });
    },
  });

  const handleEl = (
    <div
      className={`panel-resize-handle ${handlePosition}`}
      style={{ zIndex: Z_INDEX.panelResizeHandle }}
      onMouseDown={resize.onResizeStart}
      aria-hidden="true"
    />
  );

  /* ── E5.8#34：容器切换器——switcher 按钮 + 分组下拉（mockup 帧 2 拍板） ── */

  // 按钮 label = 激活视图所属容器（壳 t() 已推送），无激活回退首组；全空（无贡献视图）不渲染按钮
  const switcherLabel = switcher.find((g) => g.items.some((i) => i.active))?.containerTitle
    ?? switcher[0]?.containerTitle
    ?? "";
  const showSwitcher = switcher.length > 0;

  /* ── E5.8#36.5：活动视图的 titleActions 声明——标签栏右侧动作区（无声明 → 右侧空白） ── */
  const activeView = views.find((v) => v.id === activeViewId) ?? views[0];
  const activeActions = activeView?.titleActions ?? [];

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherBtnRef = useRef<HTMLButtonElement>(null);
  const switcherDropdownRef = useRef<HTMLDivElement>(null);
  // 下拉锚点——fixed 定位在按钮正下方（TitleBarZone 下拉同款），打开时按当前按钮几何计算
  const [switcherPos, setSwitcherPos] = useState<{ top: number; left: number } | null>(null);

  const toggleSwitcher = useCallback(() => {
    if (!switcherOpen) {
      const rect = switcherBtnRef.current?.getBoundingClientRect();
      if (rect) setSwitcherPos({ top: rect.bottom, left: rect.left });
    }
    setSwitcherOpen((o) => !o);
  }, [switcherOpen]);

  // 外部点击 + Escape 关闭——TitleBarZone 下拉同款（document 级；池 DOM 焦点天然分区）
  useEffect(() => {
    if (!switcherOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (switcherBtnRef.current?.contains(target) || switcherDropdownRef.current?.contains(target)) return;
      setSwitcherOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSwitcherOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [switcherOpen]);

  /** 下拉 item 动作——切换器按 mockup 分离两交互：点视图名 = 切激活；勾选 = 显隐 */
  const handleItemSelect = useCallback((item: PanelSwitcherItem, containerId: string) => {
    // 点视图名 = 切换激活——隐藏视图点击自动恢复可见 + 激活（对齐 [+] 决策：含已隐藏视图选中自动恢复可见）
    if (!item.visible) {
      window.linkdesk?.events?.emit("panel:toggleViewVisibility", { containerId, viewId: item.viewId });
    }
    window.linkdesk?.events?.emit("panel:viewSelected", item.viewId);
    setSwitcherOpen(false);
  }, []);

  const handleItemToggleVisible = useCallback((item: PanelSwitcherItem, containerId: string) => {
    // 勾选 = 显隐——stopPropagation 不触发激活；下拉保持打开（可连续勾）
    window.linkdesk?.events?.emit("panel:toggleViewVisibility", { containerId, viewId: item.viewId });
  }, []);

  /* ── E5.8#37.7：标签栏右键菜单（用户拍板 ① 对整个标签栏右键，非单个 tab——#36.10 已去单 tab 右键，
       容器级右键无单 tab 归属）。menuId "panelViewContext"——壳侧静态两子菜单（位置/对齐）+ 当前项 √
       （resolvePanelChecked）+ #37.7.1 视图显隐列表动态注入。context 弃单 tab viewId（容器级，Path B 池只读）。 ── */
  const [tabbarMenu, setTabbarMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <div
      className={`panel-zone${isVertical ? " vertical" : ""} edge-${edge}${resize.resizing ? " resizing" : ""}`}
      style={isVertical ? { width: resize.size, height: "100%" } : { height: resize.size, width: "100%" }}
    >
      {/* E5.8#37.5：四向 resize handle——底面板在顶缘（row-resize）/ 顶面板在底缘 / 左面板在右缘 /
          右面板在左缘（col-resize）。zIndex 走 Z_INDEX.panelResizeHandle（#26 常量表）——不写裸数字。
          位置随 handleFirst 落 flex 主向首/末：横带（column）顶/底、竖条（row）右/左。 */}
      {handleFirst && handleEl}

      {/* 面板内容体——tabbar + keep-alive 内容区恒 column 排布（竖条时根 row + 本 wrapper column） */}
      <div className="panel-zone-body">
        {/* PanelTabBar 28px——切换器在行首，标签 80px 固定不 shrink，列表溢出滚动，[+] 在滚动区外始终最右 */}
        {/* E5.8#37.7：对整个标签栏右键 → 壳 ContextMenu（menuId panelViewContext——位置/对齐子菜单 + 视图显隐 #37.7.1） */}
        <div
          className="panel-tabbar"
          onContextMenu={(e) => {
            e.preventDefault();
            setTabbarMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          {/* E5.8#34：容器切换器按钮——容器名 + ⌄；全空（无贡献视图）不渲染（无内容可切） */}
          {showSwitcher && (
            <button
              className={`panel-switcher${switcherOpen ? " open" : ""}`}
              ref={switcherBtnRef}
              onClick={toggleSwitcher}
              aria-expanded={switcherOpen}
              aria-haspopup="menu"
              title={switcherLabel}
            >
              <span className="panel-switcher-label">{switcherLabel}</span>
              <span className="panel-switcher-chev" aria-hidden="true">⌄</span>
            </button>
          )}

          <div className="panel-tabbar-list">
            {views.map((v) => (
              <div
                key={v.id}
                className={`panel-tab${v.id === activeViewId ? " active" : ""}`}
                title={v.title}
                onClick={() => {
                  // #63.7 App.tsx 消费——setPanelActiveViewId → usePoolSync 重推
                  window.linkdesk?.events?.emit("panel:viewSelected", v.id);
                }}
              >
                <span className="panel-tab-label">{v.title}</span>
              </div>
            ))}
          </div>
          {/* E5.8#36.5：标签栏右侧动作区——按活动视图 titleActions 声明渲染（widget 全壳提供，
              视觉一致 + 插件独立铁律：第三方声明即用零壳改动）。无声明 → ViewTitleActions 渲染 null。 */}
          <ViewTitleActions actions={activeActions} />
          {/* [+] 新建面板视图——panel:createView 归 Phase 12（现无监听者 no-op）；
              tooltip 由壳推（panel.createTooltip——显示文本铁律，池零自产文本） */}
          <button
            className="panel-tab-create"
            title={panel.createTooltip}
            aria-label={panel.createTooltip}
            onClick={() => {
              // E5.7#97：events.emit 载荷参数 required——无载荷信号显式传 undefined（wire 契约对齐）
              window.linkdesk?.events?.emit("panel:createView", undefined);
            }}
          >
            +
          </button>
        </div>

        {/* E5.8#34：切换器下拉——按容器分组列全部视图（含隐藏）。fixed 定位在按钮下方，
            fixed 逃逸 .panel-zone overflow:hidden——不裁剪（TitleBarZone 下拉同款） */}
        {switcherOpen && switcherPos && (
          <div className="panel-switcher-dropdown" style={switcherPos} ref={switcherDropdownRef} role="menu">
            {switcher.map((g) => (
              <Fragment key={g.containerId}>
                <div className="panel-switcher-group">{g.containerTitle}</div>
                {g.items.map((item) => (
                  <div
                    key={item.viewId}
                    className={`panel-switcher-item${item.active ? " active" : ""}${item.visible ? "" : " hidden-view"}`}
                    role="menuitem"
                    onClick={() => handleItemSelect(item, g.containerId)}
                  >
                    {/* 勾选 = 显隐——stopPropagation 不触发激活；下拉保持打开（可连续勾） */}
                    <span
                      className={`panel-switcher-check${item.visible ? "" : " unchecked"}`}
                      aria-hidden="true"
                      onClick={(e) => { e.stopPropagation(); handleItemToggleVisible(item, g.containerId); }}
                    >
                      {item.visible ? "✓" : ""}
                    </span>
                    <span className="panel-switcher-name">{item.title}</span>
                    <span className="panel-switcher-sub">{item.pluginId}</span>
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        )}

        {/* keep-alive——所有 views 平级渲染，display 切换（MainZone TabContent 同模式）。
            E5.7#63.7：每 view 经 PluginComponent 按 renderPath 动态加载（侧栏 PoolSectionStack 同款；
            PluginComponent 自带 ErrorBoundary + Suspense 兜底）。
            E5.8#34 空态：views 全空（全不勾 / 无贡献视图）→ .panel-empty 占位（文案壳 t() 推送） */}
        <div className="panel-content">
          {views.length === 0 ? (
            <div className="panel-empty">
              <div className="panel-empty-big">{emptyText}</div>
              {emptyHint && <div className="panel-empty-hint">{emptyHint}</div>}
            </div>
          ) : (
            views.map((v) => (
              <div
                key={v.id}
                className="panel-view"
                style={{ display: v.id === activeViewId ? "flex" : "none" }}
              >
                <PluginComponent
                  pluginId={v.pluginId}
                  renderPath={v.renderPath}
                  isActive={v.id === activeViewId}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {!handleFirst && handleEl}

      {/* E5.8#37.7：标签栏右键菜单——壳 ContextMenu（聪慧→哑数据流：lk.menu.getItems 壳侧解析）。
          context 只带容器标识（面板自身）——位置/对齐/视图清单上下文全走壳侧（Path B 池只读）。 */}
      {tabbarMenu && (
        <ContextMenu
          menuId="panelViewContext"
          anchor={tabbarMenu}
          context={{ panelId: "panel" }}
          onClose={() => setTabbarMenu(null)}
        />
      )}
    </div>
  );
}
