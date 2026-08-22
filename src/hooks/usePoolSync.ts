/**
 * usePoolSync——E5.6#9a。
 *
 * 替代 useWebViewSync。壳侧任何状态变化 → 全量推送 PoolLayout 到唯一 Pool。
 * Pool 被动渲染——不知道"世界为什么长这样"，只接收布局快照。
 *
 * 缓冲回放模式（E5.6#8b）保证 pushLayout 在池 React mount 之前到达不丢失。
 *
 * E5.8#0d.10-5c：聚合器（feature-folder 模式，壳目录规范 §4）——885 行拆 6 子模块 + 本聚合器：
 *   usePoolSync/sidebar-panel.ts      侧栏/面板/分屏 flex 序列化（5a）
 *   usePoolSync/titlebar.ts           菜单栏/汉堡/槽位序列化 + MENU_STYLE 两表（5a）
 *   usePoolSync/iconbar.ts            图标栏序列化（5a）
 *   usePoolSync/statusbar.ts          状态栏三源合并序列化（5a）
 *   usePoolSync/notif.ts              通知中心序列化 + _seenIds（5a）
 *   usePoolSync/useSubscriptions.ts   useSyncSubscriptions 订阅 effect 组（5b）
 *
 * 本聚合器职责：状态声明 + 调 useSyncSubscriptions（订阅→setLayoutVersion/state）+
 * 主推送 effect（序列化器组装 fullLayout → pushLayout）。外部消费方零变更（App.tsx 仍 `./hooks/usePoolSync`）。
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PoolLayout, SidebarLayout, PanelLayout } from "../core/types/pool/poolLayout";
import type { ShellTabAction } from "../core/types/ipc/tabActions"; // E5.7#96：池→壳 tab 动作 wire 契约（E5.8#44-B：壳侧收 ShellTabAction）
import type { LinkDeskAPI } from "../core/api/linkdesk-api"; // E5.7#98：poolApiRef 类型正源
import type { StatusBarEntry } from "../core/react/events/ShellEvents"; // E5.7#8：动态状态栏条目
import type { WindowShellState } from "../App/windows"; // E5.8#43-2：壳窗口注册表
import { ViewContainerService } from "../core/services/layout/ViewContainerService";
import { layoutEngine, narrowPanelEdge, narrowSidebarEdge } from "../core/services/layout/LayoutEngine"; // E5.6#11-fix7：池◀按钮→壳 setZoneWidth("sidebar", 28)；E5.8#36.9：edge 窄化守卫
import { getConfigurationValue } from "../core/services/configuration/ConfigurationService"; // E5.7#1：titleBar.menuBarVisible
import { ContextKeyService } from "../core/registry/commands/ContextKeyService"; // E5.8#37.6：sidebarPosition 当开关 context key
import { getAssetPath } from "../core/utils/path/assetPath"; // E5.7#5：logoUrl——池不 import core，壳解析推送
import { getTabCreatableViews } from "../pluginLoader/viewRegistry";
// ── E5.8#0d.10-5：6 子模块聚合——序列化器 + 订阅组；E5.8#43-2：+ windowLayout（按窗口组装）──
import { buildSidebarViewMetas, buildPanelViewMetas, buildPanelSwitcherGroups } from "./usePoolSync/sidebar-panel";
import { buildTitleBarMenuGroups, buildTitleBarSlots, MENU_STYLE_MENUBAR_VISIBLE } from "./usePoolSync/titlebar";
import { buildIconBar } from "./usePoolSync/iconbar";
import { buildStatusBarItems } from "./usePoolSync/statusbar";
import { buildNotif } from "./usePoolSync/notif";
import { useSyncSubscriptions } from "./usePoolSync/useSubscriptions";
import { assembleWindowLayout, type WindowLayoutContext } from "./usePoolSync/windowLayout";

export interface UsePoolSyncInput {
  /** E5.8#43-2：壳窗口注册表——每窗 tabState/mode/ready；本 hook 遍历就绪窗按模式策略组装布局并定向推送 */
  windows: WindowShellState[];
  /** 侧栏当前容器 ID——null = 无活动侧栏视图 */
  sidebarView: string | null;
  /** 侧栏是否展开（未折叠） */
  isSidebarVisible: boolean;
  /** E5.7#63.7：底部面板激活视图 ID——null = 尚未选择（回退 views[0]）。真相源在壳 App state */
  panelActiveViewId: string | null;
  /** E5.8#31：底部面板显隐——false = 不推 panel 字段（池 panel?.visible undefined → PanelZone 不渲染） */
  panelVisible: boolean;
  /** E5.6#16.5：MainPool tab 操作回调——池→壳→useTabManager（含分屏比例更新） */
  onTabAction?: (action: ShellTabAction) => void; // E5.7#96：wire 契约定型（E5.8#44-B：ShellTabAction 含 sourceWindowId）
}

/**
 * 构建 PoolLayout 并推送到唯一 Pool（E5.7#4 单 WCV 直推）。
 * 依赖 tabState / sidebarView / isSidebarVisible / panelActiveViewId——任一变化触发全量推送。
 * E5.7#9：侧栏宽度不再经 props——LayoutEngine getBounds 内部直读 + onDidChangeLayout 重推。
 * E5.7#63.7：面板高度同理——getBounds("panel") 内部直读，resizeZoneHeight → onDidChangeLayout 重推。
 */
export function usePoolSync({ windows, sidebarView, isSidebarVisible, panelActiveViewId, panelVisible, onTabAction }: UsePoolSyncInput): void {
  // E5.7#5：菜单栏/槽位/窗口控件文案在壳解析——t() 变化（切语言）会触发下方 effect 重推
  const { t } = useTranslation();

  // 缓存 pool API 引用——window.linkdesk.pool 在 preload 阶段就绪，mount 后不会变
  const poolApiRef = useRef<NonNullable<LinkDeskAPI["pool"]> | null>(null);
  if (!poolApiRef.current) {
    poolApiRef.current = window.linkdesk?.pool ?? null;
  }

  // E5.6#11-fix8：跟踪上次非空 sidebarView——图标栏点击坍塌时 emit null → sidebarView=null，
  // 但池仍需知道渲染哪个容器（collapsed 状态 ▶ 按钮需要 containerId 和 views）。
  // 宽≤48 时优先 collapsed 而非 hidden——确保图标点击和 ◀ 按钮两条坍塌路径行为一致。
  const lastSidebarViewRef = useRef<string | null>(null);

  // E5.6#11j fix：layoutVersion——ViewContainerService 写操作后触发重推。
  // reorderView/setVisible 会 fire onDidChangeActiveViews → bump version。
  // setCollapsed 不 fire 事件 → handler 内手动 bump。
  const [layoutVersion, setLayoutVersion] = useState(0);

  // E5.7#8：Chord 状态栏提示——壳 StatusBar.tsx:88-115 逻辑迁入（字符串壳侧构建，池哑渲染）
  const [chordLabel, setChordLabel] = useState<string | null>(null);
  const chordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // E5.7#8：ShellEvents 动态状态栏条目——壳 StatusBar eventEntries 迁入
  const [eventEntries, setEventEntries] = useState<StatusBarEntry[]>([]);

  // E5.8#0d.10-5b：订阅 effect 组整迁——registry 变化/池→壳回调/池事件往返 →
  // setLayoutVersion bump / state 写入（主推送 effect 经 deps 消费）
  useSyncSubscriptions({
    poolApiRef,
    onTabAction,
    setLayoutVersion,
    setChordLabel,
    setEventEntries,
    chordTimerRef,
  });

  useEffect(() => {
    // E5.8#37.6：侧栏边 context key——当开关（双 when 门控菜单项 + 菜单栏「查看」+ 命令面板共用）。
    // 真相源 = LayoutEngine dock.edge（narrowSidebarEdge 收窄）——随每次重推保持同步，
    // 壳侧 when 过滤（buildTitleBarMenuGroups / buildHamburgerMenuGroups / ui.ts getItems）即可命中。
    ContextKeyService.setValue("sidebarPosition", narrowSidebarEdge(layoutEngine.getZone("sidebar")?.dock?.edge));

    // E5.6#11-fix8：记住上次非空 sidebarView——图标栏坍塌时 emit null，但 collapsed ▶ 仍需知道容器
    if (sidebarView) {
      lastSidebarViewRef.current = sidebarView;
    }

    const poolApi = poolApiRef.current;
    if (!poolApi) return;

    // 侧栏布局——E5.6#11d：完整容器元数据 + SidebarViewMeta[]
    // E5.6#11-fix8：isSidebarVisible 只对壳 SidePanel DOM 有意义——池渲染不应依赖它。
    // 池只要知道是哪个容器（sidebarView 或 lastSidebarViewRef），就应该渲染侧栏。
    // 宽≤48 → collapsed（▶ 按钮），宽>48 → 展开。两条坍塌路径（图标点击/◀按钮）行为一致。
    const effectiveSidebarView = sidebarView || lastSidebarViewRef.current;
    // E5.7#9：侧栏宽度从 LayoutEngine 读（zone 几何真相源在壳；App 喂容器尺寸）
    const sidebarWidth = layoutEngine.getBounds("sidebar")?.width ?? 0;
    let sidebar: SidebarLayout;
    if (effectiveSidebarView) {
      const container = ViewContainerService.getViewContainer(effectiveSidebarView);
      const views = buildSidebarViewMetas(effectiveSidebarView, t);
      const collapsedSet = ViewContainerService.loadCollapsedState();
      const isCollapsed = sidebarWidth <= 48;
      // E5.7#84：keep-alive——全部侧栏容器序列化（非仅活动）。池按 containerId 常驻挂载、
      // display:none 切换——切容器不卸载视图（矩阵场景 1 ④：文件树折叠态保持）。
      // 真相源在壳：插件卸载 → 容器从清单消失 → 池自然卸载对应视图。
      // 🔥 E5.8#37.9：containerTitle 壳 t() 推送（此前原样推 c.title → 侧栏标题全中文）。
      const containers = ViewContainerService.getViewContainers("sidebar").map((c) => ({
        containerId: c.id,
        containerTitle: t(c.title),
        mergeHeaderWhenSingle: c.mergeHeaderWhenSingle,
        views: buildSidebarViewMetas(c.id, t),
      }));
      sidebar = {
        visible: true,
        width: sidebarWidth,
        // E5.8#36.9：侧栏所在边——#37.6 dockTo 消费方（换边后池 grid 落左/右槽 + 双槽互换联动）
        edge: narrowSidebarEdge(layoutEngine.getZone("sidebar")?.dock?.edge),
        containerId: effectiveSidebarView,
        containerTitle: container?.title ? t(container.title) : effectiveSidebarView,
        mergeHeaderWhenSingle: container?.mergeHeaderWhenSingle,
        views,
        containers,
        collapsedViews: [...collapsedSet],
        collapsed: isCollapsed,
        viewId: views[0]?.pluginId ?? null,  // 向后兼容
        // E5.7#10：侧栏 UI 文本壳侧 t() 推送（显示文本铁律——池渲染零自产文本）
        emptyText: t("此容器没有已注册的视图"),
        emptyHint: t("安装插件以添加视图"),
        expandTooltip: t("展开侧栏"),
        collapseTooltip: t("折叠侧栏"),
        // E5.7#13：拖拽钳制界——LayoutEngine dock 声明推池（池本地钳制对齐壳 resizeZone，零硬编码）
        minWidth: layoutEngine.getZone("sidebar")?.dock?.minWidth,
        maxWidth: layoutEngine.getZone("sidebar")?.dock?.maxWidth,
      };
    } else {
      sidebar = {
        visible: false,
        width: sidebarWidth,
        containerId: null,
        containerTitle: "",
        views: [],
      };
    }

    // E5.7#63.7：底部面板——location:"panel" 容器全部活跃视图展平为 views[]。
    // E5.8#34：推送条件改为「有 panel 容器贡献」——全不勾（全部隐藏）也推 panel +
    // 切换器 + 空态（验收：全不勾 → 空态占位，且保留切换器恢复勾回）。无面板容器 → 不推
    // panel 字段（池维持 Phase 5 骨架的无面板空态）。高度真相源 = LayoutEngine panel zone。
    const panelViews = buildPanelViewMetas(t);
    let panel: PanelLayout | undefined;
    // E5.8#31：显隐 = 不推 panel 字段——panelVisible false 时保持 undefined，
    // 池 `layout.panel?.visible && <PanelZone/>` → 不渲染（复用无 panel 贡献现网路径，零池改动）
    if (panelVisible && ViewContainerService.getViewContainers("panel").length > 0) {
      const panelZone = layoutEngine.getZone("panel");
      // E5.8#36.9：面板边 + 对齐——引擎配置推池（几何由池 grid #37.5 推导，引擎只存配置不推坐标）
      const panelEdge = narrowPanelEdge(panelZone?.dock?.edge);
      const isVerticalPanel = panelEdge === "left" || panelEdge === "right";
      const panelBounds = layoutEngine.getBounds("panel");
      const validActiveId = panelActiveViewId && panelViews.some((v) => v.id === panelActiveViewId)
        ? panelActiveViewId
        : panelViews[0]?.id ?? "";
      // E5.8#34：空态双形态——有注册视图但全隐藏 →「所有视图已隐藏」；无任何视图 →「暂无面板视图」
      const hasAnyViews = ViewContainerService.getViewContainers("panel").some(
        (c) => ViewContainerService.getViews(c.id).length > 0
      );
      panel = {
        visible: true,
        edge: panelEdge,
        align: panelZone?.dock?.align ?? "center",
        height: panelBounds?.height ?? panelZone?.dock?.height ?? 220,
        // E5.8#36.9：轴感知尺寸——左/右面板推 width（竖条宽，池 grid #37.5 消费）；顶/底仍 height
        ...(isVerticalPanel ? { width: panelBounds?.width ?? panelZone?.dock?.width ?? 300 } : {}),
        activeViewId: validActiveId,
        views: panelViews,
        // 激活标记以渲染真源 validActiveId 为准——激活视图被隐藏时高亮回退视图而非隐藏视图
        switcher: buildPanelSwitcherGroups(t, validActiveId),
        emptyText: t(hasAnyViews ? "所有视图已隐藏" : "暂无面板视图"),
        emptyHint: t(hasAnyViews ? "从切换器勾选视图恢复显示" : "插件声明 contributes.views location:\"panel\" 后自动出现在这里"),
        minHeight: panelZone?.dock?.minHeight,
        maxHeight: panelZone?.dock?.maxHeight,
        // E5.8#37.5：竖条面板（左/右）拖拽钳制界——dockTo 换左/右边时消费（#37.7 dockTo 后即生效）
        minWidth: panelZone?.dock?.minWidth,
        maxWidth: panelZone?.dock?.maxWidth,
        createTooltip: t("新建面板视图"),
      };
    }

    // E5.8#36.9：右侧栏真 zone——引擎常驻（LayoutEngine 模块级 addZone）但无容器内容生产者（Phase 12 填充）。
    // 推 visible:false → 池零 DOM（PoolZoneShell 按 layout.rightSidebar?.visible 条件渲染）；
    // 宽度/钳制界随引擎——#37.5 grid 真渲染消费。edge 不携带（swap 规则 = sidebar 对边，池反推）。
    const rsZone = layoutEngine.getZone("rightSidebar");
    // rsWidth 在三元条件（rsZone?.dock truthy 检查）外计算——安全链独立走，无收窄依赖
    const rsWidth = layoutEngine.getBounds("rightSidebar")?.width ?? rsZone?.dock?.width ?? 300;
    const rightSidebar: PoolLayout["rightSidebar"] = rsZone?.dock
      ? {
          visible: false,
          width: rsWidth,
          containerId: null,
          containerTitle: "",
          views: [],
          minWidth: rsZone.dock.minWidth,
          maxWidth: rsZone.dock.maxWidth,
          emptyText: t("此容器没有已注册的视图"),
          emptyHint: t("安装插件以添加视图"),
          // E5.8#37.5：右栏折叠态 + 折叠 tooltip——#37.5 RightSidebarZone 真渲染消费（▶/◀ 按钮）。
          // 壳无右栏容器生产者（Phase 12）——collapsed 派生自宽度（与左栏同判定）；安全 no-op 语义
          collapsed: rsWidth <= 48,
          expandTooltip: t("展开侧栏"),
          collapseTooltip: t("折叠侧栏"),
        }
      : undefined;

    // E5.8#43-2：主窗 zone 数据一次性组装（侧栏/面板/图标栏/状态栏全是壳主窗状态）——
    // 布局组装按窗口模式策略表 zones 决定每窗推哪些 zone（脱出窗只消费 titleBarBase + groups 侧）
    const ctx: WindowLayoutContext = {
      titleBarBase: {
        // 壳 getAssetPath 解析——Path B：池不 import core，logo 以同源相对 URL 推送
        logoUrl: getAssetPath("assets/logo.svg"),
        menuBarVisible: MENU_STYLE_MENUBAR_VISIBLE[getConfigurationValue<string>("app.menuStyle") ?? "titlebar"] ?? true,
        menuGroups: buildTitleBarMenuGroups(t),
        slots: { left: buildTitleBarSlots("left"), right: buildTitleBarSlots("right") },
        windowControls: { minimize: t("最小化"), maximize: t("最大化"), restore: t("还原"), close: t("关闭") },
      },
      iconBar: buildIconBar(t, sidebarView, isSidebarVisible),
      sidebar,
      rightSidebar,
      panel,
      statusBar: {
        items: buildStatusBarItems(t, eventEntries),
        ...(chordLabel ? { chordLabel } : {}),
        notif: buildNotif(t),
      },
      // E5.8#37.9.1：标签栏 [+] 创建菜单 label 同 manifest.name——t() 解析后推流（iconbar 同款）
      creatableViews: getTabCreatableViews().map((e) => ({ pluginId: e.pluginId, label: t(e.manifest.name) })),
      // E5.8#45 面板独占性：存在漂移面板窗（mode:"drift"）→ 面板已脱出——main 停推 panel，
      // 漂移窗按 zones 推 panel。真相源 = 壳窗口注册表（windows 是依赖，mode 变化即重推）。
      panelDetached: windows.some((w) => w.mode === "drift"),
      t,
    };

    // E5.8#43-2：按窗口注册表定向推送——每窗就绪即推（主窗恒就绪；脱出窗 onReady 到达后首推）。
    // 主池 = 全量布局（行为与 E5.7#4 单 WCV 直推一致）；脱出窗 = 策略表 zones 子集（titleBar+groups）
    for (const win of windows) {
      if (!win.ready) continue;
      poolApi.pushLayout(assembleWindowLayout(win, ctx), win.windowId);
    }
  }, [windows, sidebarView, isSidebarVisible, panelActiveViewId, panelVisible, layoutVersion, t, chordLabel, eventEntries]);
}
