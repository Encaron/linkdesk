/**
 * PanelZone——E5.7#21 骨架 + #63.7 数据生产者落地 + E5.8#34 容器切换器完形。
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
 *   - 顶部 4px resize handle——#13 同款模式（乐观本地高度 + mouseup commit，真相源在壳）
 *
 * 池→壳通道：window.linkdesk.events.emit（IconBarZone #6 同款）——
 *   "panel:viewSelected" / "panel:resize" 由 #63.7 壳侧消费（App.tsx 事件桥）；
 *   "panel:toggleViewVisibility" 由 #34 壳侧消费（→ ViewContainerService.setVisible 落盘 + 重推回执）；
 *   "panel:createView" 归 Phase 12 面板创建（现无监听者——安全 no-op）。
 * 钳制界 minHeight/maxHeight 壳推（#13 同款——池零硬编码）。
 */

import { useState, useEffect, useRef, useCallback, Fragment, type MouseEvent as ReactMouseEvent } from "react";
import type { PanelLayout, PanelSwitcherItem } from "../../../core/types/pool/poolLayout";
import { Z_INDEX } from "../../../constants"; // E5.7#26：浮层层级表——panelResizeHandle
import PluginComponent from "../../shared/plugin-component/PluginComponent"; // E5.7#63.7：面板视图动态加载（侧栏同款）
import ContextMenu from "../../../components/shared/context-menu/ContextMenu"; // E5.8#35.5：面板视图 tab 右键（壳驱动，menuId "panelViewContext" 字符串直传）
import ViewTitleActions from "../../shared/view-title-actions/ViewTitleActions"; // E5.8#36.5：标签栏右侧动作区（活动视图 titleActions 声明）
import "../../shared/dropdown-card/dropdown-card.css"; // E5.8#36.5 共享下拉卡片本体（.dropdown-card）
import "./PanelZone.css";

interface PanelZoneProps {
  panel: PanelLayout;
}

export default function PanelZone({ panel }: PanelZoneProps) {
  const { views, activeViewId, switcher = [], emptyText, emptyHint } = panel;

  /* ── E5.7#21：顶部 resize handle 拖拽——#13 同款模式（乐观本地高度 + mouseup commit） ── */

  const [localHeight, setLocalHeight] = useState<number | null>(null); // 拖拽期间/待回执的本地高度覆盖
  const draggingRef = useRef(false);                       // isDragging guard——拖拽期间忽略推送
  const didMoveRef = useRef(false);                        // 无位移点击不 commit（#13 同款 no-op 语义）
  const dragStartRef = useRef<{ y: number; height: number } | null>(null); // 拖拽几何
  const preDragHeightRef = useRef(0);                      // 拖前高度——回执期跳过迟到旧推送
  const dragHeightRef = useRef(0);                         // 最近一次本地高度（mouseup commit 用）
  const rafRef = useRef<number | null>(null);              // rAF 节流
  const commitPendingRef = useRef(false);                  // commit 已发待回执
  const bodyStylePrevRef = useRef<{ cursor: string; userSelect: string } | null>(null); // 光标/选择锁恢复

  // 显示高度——本地覆盖优先（拖拽期间/待回执），否则壳权威高
  const height = localHeight ?? panel.height;
  const heightRef = useRef(height);
  heightRef.current = height;

  // 钳制——界由壳推（#13 同款；#63.7 生产者已推送，缺省兜底 0..∞ 仅防旧布局）
  // E5.8#1d EXEMPT：池内 zone 孪生（PanelZone↔RightSidebarZone resize 骨架——clamp/finishDrag/onMove/onUp），结构性重复
  /* jscpd:ignore-start */
  const clampHeight = useCallback((h: number) => {
    const min = panel.minHeight ?? 0;
    const max = panel.maxHeight ?? Infinity;
    return Math.max(min, Math.min(max, Math.round(h)));
  }, [panel.minHeight, panel.maxHeight]);

  // mouseup / buttons===0 释放——一次性 commit（events 回环壳 → 钳制 → pushLayout 回执）
  const finishDrag = useCallback(() => {
    draggingRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (bodyStylePrevRef.current) {
      document.body.style.cursor = bodyStylePrevRef.current.cursor;
      document.body.style.userSelect = bodyStylePrevRef.current.userSelect;
      bodyStylePrevRef.current = null;
    }
    if (dragStartRef.current) {
      // 无位移点击（mousedown+mouseup 未动）不 commit——#13 同款 no-op
      if (didMoveRef.current) {
        commitPendingRef.current = true;
        // 真相源在壳——#63.7 App.tsx resizeZoneHeight 钳制 → pushLayout 回执
        window.linkdesk?.events?.emit("panel:resize", { height: dragHeightRef.current });
      }
      dragStartRef.current = null;
    }
  }, []);

  // 窗口级 mousemove/mouseup——#13 同款（buttons===0 视为窗口外释放）
  useEffect(() => {
    const onMove = (me: MouseEvent) => {
      if (!draggingRef.current) return;
      if (me.buttons === 0) { finishDrag(); return; }
      didMoveRef.current = true;
      const start = dragStartRef.current;
      if (!start) return;
      if (rafRef.current !== null) return; // rAF 节流——每帧最多一次 setState
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        // 顶部 handle 向上拖 = 增高：高度 = 拖前高 + (startY - clientY)
        const h = clampHeight(start.height + (start.y - me.clientY));
        dragHeightRef.current = h;
        setLocalHeight(h);
      });
    };
    const onUp = () => {
      if (draggingRef.current) finishDrag();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [finishDrag, clampHeight]);
  /* jscpd:ignore-end */

  // pushLayout 对齐（isDragging guard）——#13 同款：拖拽期间忽略旧高度防闪跳；
  // 回执 = commit 后第一条非拖前高度的推送（壳钳制后值可能 ≠ 本地高——以壳权威为准）
  useEffect(() => {
    if (draggingRef.current) return;
    if (!commitPendingRef.current) {
      setLocalHeight(null);
      return;
    }
    if (panel.height !== preDragHeightRef.current || panel.height === dragHeightRef.current) {
      commitPendingRef.current = false;
      setLocalHeight(null); // 回执对齐——本地覆盖释放
    }
  }, [panel.height]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    draggingRef.current = true;
    didMoveRef.current = false;
    const startHeight = heightRef.current;
    dragStartRef.current = { y: e.clientY, height: startHeight };
    preDragHeightRef.current = startHeight;
    dragHeightRef.current = startHeight;
    // 拖拽期间锁 body cursor + userSelect（快速拖拽脱离 handle 不跳回箭头）
    bodyStylePrevRef.current = { cursor: document.body.style.cursor, userSelect: document.body.style.userSelect };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

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

  /* ── E5.8#35.5：面板视图 tab 右键「移至主区标签页」——壳 ContextMenu（menuId "panelViewContext"）。
       池零菜单逻辑（同 GroupTabBar TabContext 模式）：ContextMenu 经 lk.menu.getItems 壳侧解析 +
       点击 executeCommand(core.movePanelViewToEditor, context) → 壳 movePanelViewToEditor。 */
  const [contextMenuAnchor, setContextMenuAnchor] = useState<{ viewId: string; x: number; y: number } | null>(null);
  const handleTabContextMenu = useCallback((viewId: string, e: ReactMouseEvent) => {
    e.preventDefault();
    setContextMenuAnchor({ viewId, x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div
      className={`panel-zone${localHeight !== null ? " resizing" : ""}`}
      style={{ height }}
    >
      {/* E5.7#21：顶部 4px resize handle（#13 同款模式——row-resize 垂直拖拽）。
          zIndex 走 Z_INDEX.panelResizeHandle（#26 常量表）——不写裸数字。 */}
      <div
        className="panel-resize-handle"
        style={{ zIndex: Z_INDEX.panelResizeHandle }}
        onMouseDown={handleResizeStart}
        aria-hidden="true"
      />

      {/* PanelTabBar 28px——切换器在行首，标签 80px 固定不 shrink，列表溢出滚动，[+] 在滚动区外始终最右 */}
      <div className="panel-tabbar">
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
              onContextMenu={(e) => handleTabContextMenu(v.id, e)}
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

      {/* E5.8#35.5：面板视图 tab 右键菜单——menuId "panelViewContext"（字符串直传不 import 壳 MenuRegistry，
          Path B——字符串即桥契约；壳 coreCommands.ts 注册「移至主区标签页」条目）。
          ContextMenu 自带 backdrop 吞第一击 + 视口自适应 + 键盘导航——池零菜单逻辑。 */}
      {contextMenuAnchor && (
        <ContextMenu
          menuId="panelViewContext"
          anchor={contextMenuAnchor}
          context={{ viewId: contextMenuAnchor.viewId }}
          onClose={() => setContextMenuAnchor(null)}
        />
      )}

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
  );
}
