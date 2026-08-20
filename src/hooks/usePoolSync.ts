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
import type { TabState } from "./useTabManager";
import type { PoolLayout, SidebarLayout, PanelLayout, PoolGroup } from "../core/types/pool/poolLayout";
import type { PoolTabAction } from "../core/types/ipc/tabActions"; // E5.7#96：池→壳 tab 动作 wire 契约
import type { LinkDeskAPI } from "../core/api/linkdesk-api"; // E5.7#98：poolApiRef 类型正源
import type { StatusBarEntry } from "../core/react/events/ShellEvents"; // E5.7#8：动态状态栏条目
import { ViewContainerService } from "../core/services/layout/ViewContainerService";
import { layoutEngine } from "../core/services/layout/LayoutEngine"; // E5.6#11-fix7：池◀按钮→壳 setZoneWidth("sidebar", 28)
import { getConfigurationValue } from "../core/services/configuration/ConfigurationService"; // E5.7#1：titleBar.menuBarVisible
import { getAssetPath } from "../core/utils/path/assetPath"; // E5.7#5：logoUrl——池不 import core，壳解析推送
import { getViewPlugin, getTabBehavior, getTabCreatableViews } from "../pluginLoader/viewRegistry";
import { resolvePluginIcon } from "../core/utils/plugin/iconUtils";
import { isShellRenderedTab } from "../core/utils/tabIdentity";
// ── E5.8#0d.10-5：6 子模块聚合——序列化器 + 订阅组 ──
import { buildSidebarViewMetas, buildPanelViewMetas, computeGroupFlexes } from "./usePoolSync/sidebar-panel";
import { buildTitleBarMenuGroups, buildTitleBarSlots, MENU_STYLE_MENUBAR_VISIBLE } from "./usePoolSync/titlebar";
import { buildIconBar } from "./usePoolSync/iconbar";
import { buildStatusBarItems } from "./usePoolSync/statusbar";
import { buildNotif } from "./usePoolSync/notif";
import { useSyncSubscriptions } from "./usePoolSync/useSubscriptions";

export interface UsePoolSyncInput {
  tabState: TabState;
  /** 侧栏当前容器 ID——null = 无活动侧栏视图 */
  sidebarView: string | null;
  /** 侧栏是否展开（未折叠） */
  isSidebarVisible: boolean;
  /** E5.7#63.7：底部面板激活视图 ID——null = 尚未选择（回退 views[0]）。真相源在壳 App state */
  panelActiveViewId: string | null;
  /** E5.8#31：底部面板显隐——false = 不推 panel 字段（池 panel?.visible undefined → PanelZone 不渲染） */
  panelVisible: boolean;
  /** E5.6#16.5：MainPool tab 操作回调——池→壳→useTabManager（含分屏比例更新） */
  onTabAction?: (action: PoolTabAction) => void; // E5.7#96：wire 契约定型
}

/**
 * 构建 PoolLayout 并推送到唯一 Pool（E5.7#4 单 WCV 直推）。
 * 依赖 tabState / sidebarView / isSidebarVisible / panelActiveViewId——任一变化触发全量推送。
 * E5.7#9：侧栏宽度不再经 props——LayoutEngine getBounds 内部直读 + onDidChangeLayout 重推。
 * E5.7#63.7：面板高度同理——getBounds("panel") 内部直读，resizeZoneHeight → onDidChangeLayout 重推。
 */
export function usePoolSync({ tabState, sidebarView, isSidebarVisible, panelActiveViewId, panelVisible, onTabAction }: UsePoolSyncInput): void {
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
      const views = buildSidebarViewMetas(effectiveSidebarView);
      const collapsedSet = ViewContainerService.loadCollapsedState();
      const isCollapsed = sidebarWidth <= 48;
      // E5.7#84：keep-alive——全部侧栏容器序列化（非仅活动）。池按 containerId 常驻挂载、
      // display:none 切换——切容器不卸载视图（矩阵场景 1 ④：文件树折叠态保持）。
      // 真相源在壳：插件卸载 → 容器从清单消失 → 池自然卸载对应视图。
      const containers = ViewContainerService.getViewContainers("sidebar").map((c) => ({
        containerId: c.id,
        containerTitle: c.title,
        mergeHeaderWhenSingle: c.mergeHeaderWhenSingle,
        views: buildSidebarViewMetas(c.id),
      }));
      sidebar = {
        visible: true,
        width: sidebarWidth,
        containerId: effectiveSidebarView,
        containerTitle: container?.title ?? effectiveSidebarView,
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
    // 无面板贡献 → 不推 panel 字段（池维持 Phase 5 骨架的无面板空态）。高度真相源 =
    // LayoutEngine panel zone（resizeZoneHeight 钳制后经 onDidChangeLayout → 本 effect 重推回执）。
    const panelViews = buildPanelViewMetas();
    let panel: PanelLayout | undefined;
    // E5.8#31：显隐 = 不推 panel 字段——panelVisible false 时保持 undefined，
    // 池 `layout.panel?.visible && <PanelZone/>` → 不渲染（复用无 panel 贡献现网路径，零池改动）
    if (panelViews.length > 0 && panelVisible) {
      const panelZone = layoutEngine.getZone("panel");
      const validActiveId = panelActiveViewId && panelViews.some((v) => v.id === panelActiveViewId)
        ? panelActiveViewId
        : panelViews[0]?.id ?? "";
      panel = {
        visible: true,
        height: layoutEngine.getBounds("panel")?.height ?? panelZone?.dock?.height ?? 220,
        activeViewId: validActiveId,
        views: panelViews,
        minHeight: panelZone?.dock?.minHeight,
        maxHeight: panelZone?.dock?.maxHeight,
        createTooltip: t("新建面板视图"),
      };
    }

    // 主区分屏组——每个 group 映射为一个 flex 区域
    // E5.6#16：从 SplitNode 树计算实际 flex 比例（不再硬编码 1）
    const flexMap = computeGroupFlexes(tabState.root);
    const groups: PoolGroup[] = tabState.groups.map((g) => ({
      id: g.id,
      flex: flexMap.get(g.id) ?? 1,
      activeTabId: g.activeTabId,
      tabs: g.tabs.map((t) => {
        const pid = t.pluginId ?? t.type;
        const entry = getViewPlugin(pid);
        const resolved = entry?.manifest ? resolvePluginIcon(pid, entry.manifest) : null;
        const behavior = getTabBehavior(pid);
        return {
          id: t.id,
          pluginId: pid,
          title: t.label,
          sourceId: t.sourceId,
          dirty: t.dirty,
          // E5.6#16.5：TabBar 渲染元数据
          icon: resolved?.src ?? resolved?.emoji,
          pinned: t.pinned,
          // E5.6#16.7k-4：欢迎页 closeBehavior 从 blocked → normal——壳 reduceCloseTab 已有 fallback 自动重建
          closeBehavior: behavior.confirmOnClose ? "confirm" : "normal",
          singleton: behavior.singleton,
          shellRendered: isShellRenderedTab(t.type),
          shellType: isShellRenderedTab(t.type) ? t.type : undefined,
          detailPluginId: t.detailPluginId,
        };
      }),
    }));

    // E5.7#1/#4：PoolLayout v2 全量布局——唯一 Pool 单 WCV 直推完整快照。
    // Phase 2 填充：titleBar 已由 #5 序列化；iconBar 已由 #6 序列化；statusBar（#8 StatusBarZone）待对应任务。
    const fullLayout: PoolLayout = {
      version: 2,
      titleBar: {
        title: document.title,
        // 壳 getAssetPath 解析——Path B：池不 import core，logo 以同源相对 URL 推送
        logoUrl: getAssetPath("assets/logo.svg"),
        menuBarVisible: MENU_STYLE_MENUBAR_VISIBLE[getConfigurationValue<string>("app.menuStyle") ?? "titlebar"] ?? true,
        menuGroups: buildTitleBarMenuGroups(t),
        slots: { left: buildTitleBarSlots("left"), right: buildTitleBarSlots("right") },
        windowControls: { minimize: t("最小化"), maximize: t("最大化"), restore: t("还原"), close: t("关闭") },
      },
      iconBar: buildIconBar(t, sidebarView, isSidebarVisible),
      sidebar,
      groups,
      root: tabState.root,
      // E5.8#30.15（P5）：聚焦面板 id——池侧 accent 环 + isActive 单聚焦判定
      activeGroupId: tabState.activeGroupId,
      // E5.6#16.7k-3：推 creatableViews——GroupTabBar [+] 按钮动态创建菜单
      creatableViews: getTabCreatableViews().map((e) => ({ pluginId: e.pluginId, label: e.manifest.name })),
      // E5.7#63.7：底部面板——无贡献不推（undefined 字段不序列化进快照）
      ...(panel ? { panel } : {}),
      // E5.7#8：状态栏——条目（分隔线/component 标记壳侧算好）+ Chord 字符串 + 通知中心纯数据
      statusBar: {
        items: buildStatusBarItems(t, eventEntries),
        ...(chordLabel ? { chordLabel } : {}),
        notif: buildNotif(t),
      },
    };

    poolApi.pushLayout(fullLayout);
  }, [tabState, sidebarView, isSidebarVisible, panelActiveViewId, panelVisible, layoutVersion, t, chordLabel, eventEntries]);
}
