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
import { layoutEngine, narrowPanelEdge, narrowSidebarEdge, DEFAULT_ZONE_SIZE } from "../core/services/layout/LayoutEngine"; // E5.6#11-fix7：池◀按钮→壳 setZoneWidth("sidebar", 28)；E5.8#36.9：edge 窄化守卫
import { getConfigurationValue } from "../core/services/configuration/ConfigurationService"; // E5.7#1：titleBar.menuBarVisible
import { ContextKeyService } from "../core/registry/commands/ContextKeyService"; // E5.8#37.6：sidebarPosition 当开关 context key
import { factorySlots } from "../core/services/bootstrap/FactorySlots"; // 2026-09-30 齿轮归壳·件 3：设置槽是否已填充 → settingsSlotFilled
import { useUpdateState } from "./useUpdateState"; // E6#57.11：更新态 → TitleBar 按钮显隐/文字（九态映射在 updateCommands.ts）
import { useReleaseNotes } from "./useReleaseNotes"; // E6#57.13：发行说明标签页载荷（壳想、池画）
import { useAbout } from "./useAbout"; // E6#57.14：关于标签页载荷（同款）
import { useAiManual } from "./useAiManual"; // M3 AI#16：AI 操作手册标签页载荷（同款第三例）
import { UPDATE_ACTIONABLE_KEY, UPDATE_BUTTON_LABEL_KEY, isUpdateActionable, updateButtonKeyFor } from "../core/commands/shell/updateCommands"; // E6#57.11
import { getAssetPath } from "../core/utils/path/assetPath"; // E5.7#5：logoUrl——池不 import core，壳解析推送
import { getTabCreatableViews } from "../pluginLoader/contributions/viewRegistry";
import { pickIdentityArt } from "../components/shared/plugin-icon/iconUtils"; // W1 图标链：壳侧预解析身份图
// ── E5.8#0d.10-5：6 子模块聚合——序列化器 + 订阅组；E5.8#43-2：+ windowLayout（按窗口组装）──
import { buildSidebarViewMetas, buildPanelViewMetas, buildPanelSwitcherGroups, buildEffectiveCollapsedViewIds } from "./usePoolSync/sidebar-panel";
import { buildTitleBarMenuGroups, buildTitleBarSlots, MENU_STYLE_MENUBAR_VISIBLE } from "./usePoolSync/titlebar";
import { buildIconBar } from "./usePoolSync/iconbar";
import { buildStatusBarItems } from "./usePoolSync/statusbar";
import { buildNotif } from "./usePoolSync/notif";
import { buildCommandHints } from "./usePoolSync/hints"; // 04「悬停提示系统」件 1：命令表（提示条自动补文案/快捷键）
import { useSyncSubscriptions } from "./usePoolSync/useSubscriptions";
import { assembleWindowLayout, serializeGroups, type WindowLayoutContext } from "./usePoolSync/windowLayout";
// M1 读取面（AI#1 通知 / AI#3 标签）——core 侧读面槽：壳在这里把「答案」注册进去
import { notifSnapshot, tabsSnapshot, layoutSnapshot } from "../core/services/plugins/readSnapshots";

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
  /** 04「启动过场」④B：首推门槛（= App ready）——false 时不推布局，池停在品牌过场 */
  bootReady: boolean;
  /** E5.6#16.5：MainPool tab 操作回调——池→壳→useTabManager（含分屏比例更新） */
  onTabAction?: (action: ShellTabAction) => void; // E5.7#96：wire 契约定型（E5.8#44-B：ShellTabAction 含 sourceWindowId）
}

/**
 * 构建 PoolLayout 并推送到唯一 Pool（E5.7#4 单 WCV 直推）。
 * 依赖 tabState / sidebarView / isSidebarVisible / panelActiveViewId——任一变化触发全量推送。
 * E5.7#9：侧栏宽度不再经 props——LayoutEngine getBounds 内部直读 + onDidChangeLayout 重推。
 * E5.7#63.7：面板高度同理——getBounds("panel") 内部直读，resizeZoneHeight → onDidChangeLayout 重推。
 */
export function usePoolSync({ windows, sidebarView, isSidebarVisible, panelActiveViewId, panelVisible, bootReady, onTabAction }: UsePoolSyncInput): void {
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

  // E6#57.11：更新态——TitleBar 右槽按钮的显隐与文字源。
  // 走 useUpdateState 的引用计数订阅（本处是壳内第二个消费者，第一个是 useUpdateScheduler；
  // 各自 mount/unmount 时加减计数，最后一个走时拆 IPC 订阅）。
  // 🔴 **不自己 bump layoutVersion**——updateState 直接进主推送 effect 的 deps，迁移本身即触发重推；
  // 且进度**不是迁移**（实测 update-service.ts:267 `reportProgress` 走 onProgress 通道、
  // 不碰 onStateChanged）⇒ 不存在高频重推。
  const updateState = useUpdateState();

  // E6#57.13：发行说明态——壳视图数据源（**壳想、池画**：本处订阅，组装时挂到 tab 上推给池）。
  // 为什么挂在这里：`useSyncExternalStore` 的快照在态未变时**引用恒等**（useReleaseNotes.ts 的
  // `_getSnapshot` 直接返回 `_phase.data`），所以它进 deps 只在**真变化时**触发重推——
  // 与 updateState 同一条理由（见上），不构成重推风暴。
  const releaseNotes = useReleaseNotes();

  // E6#57.14：关于态——同一条规矩的第二个实例，理由逐条同上。
  // ⚠️ 与 `releaseNotes` 唯一不同：`useAbout` 的快照是 `useMemo([snap, t])` 的产物，**每次 `t` 换引用
  // 都出新对象**（语言切换时标签要跟着变）——但那正是它该重推的时刻，稳态下 `useMemo` 命中缓存、
  // 引用恒等，所以进 deps 不会引起重推风暴。
  const about = useAbout();

  // M3 AI#16：AI 操作手册态——同一条规矩的第三个实例，理由逐条同上。
  // ⚠️ 本 hook 的快照就是 **DTO 本身**（稳态引用恒等，态真变才整体换新）——与 `useAbout` 的
  // `useMemo([snap, t])` 形态不同但同样稳定，所以进 deps **不会**引起重推风暴。
  const aiManual = useAiManual();

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
    // 04「启动过场」④B：首推门槛——bootReady（= setReady）为假时整段跳过（含首推）。
    // 「逐个蹦」的消灭手段：串行插件加载的过程被藏进池首帧过场（BootMark），ready 后整帧一次到达。
    // 池侧本就有缓冲回放，晚推不丢；ready 翻真后本 effect 随 deps 重跑自然补推。
    if (!bootReady) return;

    // E5.8#37.6：侧栏边 context key——当开关（双 when 门控菜单项 + 菜单栏「查看」+ 命令面板共用）。
    // 真相源 = LayoutEngine dock.edge（narrowSidebarEdge 收窄）——随每次重推保持同步，
    // 壳侧 when 过滤（buildTitleBarMenuGroups / buildHamburgerMenuGroups / ui.ts getItems）即可命中。
    ContextKeyService.setValue("sidebarPosition", narrowSidebarEdge(layoutEngine.getZone("sidebar")?.dock?.edge));

    // 件 3（2026-09-30「齿轮归壳」）：设置槽是否已填充——齿轮菜单第 1 项（core.openSettings）的 when 门控。
    // 槽空（没装任何 factoryRole:"settings" 的套）时该项不显示：齿轮已恒可见（壳自带 owned 按钮），
    // 不留「点了没反应」的空壳项（本仓「不放空壳菜单项」纪律）。与上一行同一个顺序契约——必须在下方
    // 组装 slots 之前 set，否则壳侧 getItems 读到的是上一轮的值。
    const activeSettingsId = factorySlots.getActive("settings");
    ContextKeyService.setValue("settingsSlotFilled", !!activeSettingsId);

    // 本案 4.3（逃生舱 · 设置控件案 [01 §五]）：激活套**是不是内置套**（内置 = 注册序首声明 ＋ 无 core 偏袒，
    // E6#18b）——齿轮兜底项「回退内置设置页」的 when = `settingsSlotFilled && !settingsActiveIsBuiltin`：
    // 只有「有激活套、且它不是内置」时才给这枚逃生舱（第三方设置页崩了也能一键回退，不必重启）。
    // 同一个顺序契约：在组装 slots 之前 set。槽空 ⇒ false（无套可回退）。
    ContextKeyService.setValue(
      "settingsActiveIsBuiltin",
      !!activeSettingsId && activeSettingsId === factorySlots.getDefaultPluginId("settings"),
    );

    // E6#57.11：TitleBar 更新按钮的两个 context key——**必须在下方组装 slots 之前 set**，
    // 否则 buildTitleBarSlots 读到的是上一轮的值（与上一行 sidebarPosition 同一个顺序契约）。
    // 值 = **中文 i18n key 原文**（不是译文）——翻译只在下游 buildTitleBarSlots 里发生一次；
    // 池拿到的永远是成品字符串（「显示文本铁律」）。
    ContextKeyService.setValue(UPDATE_ACTIONABLE_KEY, isUpdateActionable(updateState));
    ContextKeyService.setValue(UPDATE_BUTTON_LABEL_KEY, updateButtonKeyFor(updateState) ?? "");

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
      // 04：折叠态推**有效折叠集**（显式展开 > 显式折叠 > 插件声明）——池不持第二套真相，
      // section 展开态与 header 右键「视图」子菜单勾选态同读这一份（此前推裸持久化列，
      // 声明 collapsed 的视图勾选态印反、点击方向算反 → 子菜单点了没反应）。
      const effectiveCollapsedViewIds = buildEffectiveCollapsedViewIds();
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
        collapsedViews: effectiveCollapsedViewIds,
        collapsed: isCollapsed,
        viewId: views[0]?.pluginId ?? null,  // 向后兼容
        // E5.7#10：侧栏 UI 文本壳侧 t() 推送（显示文本铁律——池渲染零自产文本）
        emptyText: t("此容器没有已注册的视图"),
        emptyHint: t("安装插件以添加视图"),
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
    // E5.8#45：面板已脱出（存在 drift 窗）——true 时 main 停推 panel（独占，assembleWindowLayout 按
    // ctx.panelDetached 裁决）+ main 面板不渲染 ⤢ 按钮（detachable=false）。drift 窗面板仍带
    // detachable=false——面板已在外无需再脱出。真相源 = windows 注册表（mode 变化即重推）。
    const panelDetached = windows.some((w) => w.mode === "drift");
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
        height: panelBounds?.height ?? panelZone?.dock?.height ?? DEFAULT_ZONE_SIZE.panelHeight,
        // E5.8#36.9：轴感知尺寸——左/右面板推 width（竖条宽，池 grid #37.5 消费）；顶/底仍 height
        ...(isVerticalPanel ? { width: panelBounds?.width ?? panelZone?.dock?.width ?? DEFAULT_ZONE_SIZE.panelWidth } : {}),
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
        // E5.8#45：⤢ 脱出按钮——main 面板可脱出；面板已脱出（panelDetached）或本窗非 main 恒 false
        // （漂移窗内置面板已在独立窗口，无再次脱出语义）。drift 窗布局经 assembleWindowLayout 组装，
        // 其 panel 对象同来自本 ctx——detachable 统一 false 保证任何情况不出现多余 ⤢。
        detachable: !panelDetached,
        detachTooltip: t("面板独立窗口"),
      };
    }

    // E5.8#36.9：右侧栏真 zone——引擎常驻（LayoutEngine 模块级 addZone）但壳侧暂无容器内容生产者。
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
          // E5.8#37.5 + #159：右栏折叠态——RightSidebarZone 真渲染消费。
          // 壳无右栏容器生产者——collapsed 派生自宽度（与左栏同判定）；折叠=真消失（#159 与左栏同源）
          collapsed: rsWidth <= 48,
        }
      : undefined;

    // E5.8#43-2：主窗 zone 数据一次性组装（侧栏/面板/图标栏/状态栏全是壳主窗状态）——
    // 布局组装按窗口模式策略表 zones 决定每窗推哪些 zone（脱出窗只消费 titleBarBase + groups 侧）
    const ctx: WindowLayoutContext = {
      titleBarBase: {
        // 壳 getAssetPath 解析——Path B：池不 import core，logo 以同源相对 URL 推送
        logoUrl: getAssetPath("assets/logo.svg"),
        menuBarVisible: MENU_STYLE_MENUBAR_VISIBLE[getConfigurationValue<string>("app.menuStyle") ?? "titlebar"] ?? true,
        // E5.8#148：zone 可见性上下文——查看→界面→主侧栏/面板 勾选态（panelVisible/isSidebarVisible 均入 effect deps → 变化即重推 ✓）
        menuGroups: buildTitleBarMenuGroups(t, { panelVisible, sidebarVisible: isSidebarVisible }),
        slots: { left: buildTitleBarSlots(t, "left"), right: buildTitleBarSlots(t, "right") },
        // E5.8#46.18：pin/unpin tooltip 两态（TitleBarZone 置顶按钮按置顶态切换显示）
        windowControls: { minimize: t("最小化"), maximize: t("最大化"), restore: t("还原"), close: t("关闭"), pin: t("置顶"), unpin: t("取消置顶") },
      },
      iconBar: buildIconBar(t, sidebarView, isSidebarVisible, panelVisible),
      sidebar,
      rightSidebar,
      panel,
      statusBar: {
        items: buildStatusBarItems(t, eventEntries),
        ...(chordLabel ? { chordLabel } : {}),
        notif: buildNotif(t),
      },
      // E5.8#37.9.1：标签栏 [+] 创建菜单 label 同 manifest.name——t() 解析后推流（iconbar 同款）。
      // W1 图标链：icon/iconSource 由壳侧 pickIdentityArt() 预解析（恒返有效 descriptor）——
      // 解析在壳、池零逻辑（与标签栏 windowLayout 同源同函数，防漂移重演）。
      creatableViews: getTabCreatableViews().map((e) => {
        const art = pickIdentityArt(e.manifest);
        return { pluginId: e.pluginId, label: t(e.manifest.name), icon: art.icon, iconSource: art.iconSource };
      }),
      // E5.8#45 面板独占性：存在漂移面板窗（mode:"drift"）→ 面板已脱出——main 停推 panel，
      // 漂移窗按 zones 推 panel。真相源 = 壳窗口注册表（windows 是依赖，mode 变化即重推）。
      // 与上方 panelDetached 同源（面板对象 detachable + 独占裁决共用同一判定）。
      panelDetached,
      // E6#57.13：发行说明载荷——serializeGroups 盖章到那一个壳视图 tab 上（池只画）
      releaseNotes,
      // E6#57.14：关于载荷——同款（serializeGroups 盖章到那一个壳视图 tab 上）
      about,
      // M3 AI#16：手册载荷——同款（只盖章到 ai-manual 那一个壳视图 tab 上）
      aiManual,
      // 04「悬停提示系统」件 1：提示条总开关 + 命令表（窗口无关，恒推——assembleWindowLayout 不吃 zones）。
      // 缺省开：读不到配置（未初始化/键没注册）时不该变成"全软件没提示"。
      hintEnabled: getConfigurationValue<boolean>("app.hint.enabled") ?? true,
      // 命令表一次算好（buildCommandHints——与菜单序列化**同源同尺**，见该文件头注释）
      commands: buildCommandHints(t),
      t,
    };

    // E5.8#43-2：按窗口注册表定向推送——每窗就绪即推（主窗恒就绪；脱出窗 onReady 到达后首推）。
    // 主池 = 全量布局（行为与 E5.7#4 单 WCV 直推一致）；脱出窗 = 策略表 zones 子集（titleBar+groups）
    for (const win of windows) {
      if (!win.ready) continue;
      poolApi.pushLayout(assembleWindowLayout(win, ctx), win.windowId);
    }
  }, [windows, sidebarView, isSidebarVisible, panelActiveViewId, panelVisible, layoutVersion, t, chordLabel, eventEntries, updateState, releaseNotes, about, aiManual, bootReady]);

  // ── M1 读取面（`AI#1` 通知 / `AI#3` 标签）：把「答案」注册给 core 的读面槽 ──
  // 🔴 为什么注册**闭包**而不是算完存 state：读面要的是**提问那一刻**的答案（AI 按需拉），
  // 而 state 是渲染帧的快照——两者会错开。闭包每次 read() 现算，且用的仍是同一批序列化器
  // （buildNotif / serializeGroups）⇒ **读到 = 画到**（⛔ 不 fork 第二把尺）。
  // 🔴 为什么必须由壳 React 层注册：core（IpcBridgeHandler）不能 import hooks（依赖方向 core → 无）。
  //    见 src/core/services/plugins/readSnapshots.ts 头注释。
  useEffect(() => {
    const offNotif = notifSnapshot.register(() => buildNotif(t));
    const offTabs = tabsSnapshot.register(() => ({
      windows: windows.map((win) => ({
        windowId: win.windowId,
        mode: win.mode,
        ready: win.ready,
        activeGroupId: win.tabState.activeGroupId,
        // 分屏树同源（与 assembleWindowLayout 推给池的那份是同一个 tabState.root）
        ...(win.tabState.root ? { root: win.tabState.root } : {}),
        // groups 走**同一个** serializeGroups ⇒ 与布局树的 groups[].tabs[] 逐条对得上（AI#3 判据）
        groups: serializeGroups(win.tabState, t, releaseNotes, about, aiManual),
      })),
    }));
    // M2 AI#62：布局**显隐**那一半（尺寸那一半由命令直读 layoutEngine，core 自持）
    const offLayout = layoutSnapshot.register(() => ({
      sidebarVisible: isSidebarVisible,
      panelVisible,
      panelActiveViewId,
      sidebarView,
    }));
    return () => { offNotif(); offTabs(); offLayout(); };
  }, [windows, sidebarView, isSidebarVisible, panelActiveViewId, panelVisible, t, releaseNotes, about, aiManual]);
}
