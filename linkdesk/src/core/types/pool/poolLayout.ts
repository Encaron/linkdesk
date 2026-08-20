/**
 * PoolLayout 类型定义——E5.6#8a + E5.7#1（version 2 全量唯一布局）。
 *
 * 壳与池共享的布局协议。E5.7 极简Pool：唯一 Pool 收到全量布局快照，
 * PoolZoneShell 按 zone 字段条件渲染（Phase 1 为占位骨架）。
 *
 * 🔴 E5.6 设计草案的 version: 1 / poolId 从未在代码中实现——
 *   2026-08-13 审计核实：全仓零 poolId，本文件无 version 字段。
 *   故 E5.7#1 为"新增 version: 2 + zone 字段"，无"删 poolId"可执行。
 *
 * 兼容性：池忽略不认识的字段，壳加字段不破坏旧池。
 *
 * 🔥 E5.8#5 pushLayout 两条协议铁律（壳→池唯一布局通道，违规即跨进程状态撕裂）：
 *   1. whole-value checkpoint——每次推送必须带完整 post-change 布局快照，禁止裸 delta；
 *      池不缓存旧值做增量合并（合并错位 = 布局与真相源分叉，无法自愈）。
 *   2. delta（若未来确有增量需求）必须带稳定 id + 升序重放确定性——不得依赖 live-only
 *      内存；池崩溃重建后只能拿到主进程重放的最后快照，live-only 增量会静默丢更新。
 */

import type { SplitNode } from "../../../core/utils/splitTree";
import type { TitleActionWidget } from "../../api/types"; // E5.8#36.5：titleActions DTO——声明面直传（JSON 可序列化）

// ── E5.6#11a ──

/** 侧栏 view 元数据——从 ViewContainerService 序列化，经 PoolLayout 推送到 SidebarPool */
export interface SidebarViewMeta {
  id: string;                             // view ID（"folders" / "search" / "installed"）
  title: string;                          // 显示标题
  pluginId: string;                       // _pluginId——PluginComponent 用它找 import.meta.glob
  renderPath: string;                     // loader.ts 构建的 glob key——池 O(1) 查找 view 组件
  role?: "toolbar" | "section";           // 默认 "section"
  order?: number;
  collapsed?: boolean;                    // 插件声明的初始折叠态（collapsed: true）
  badge?: string | number;
  titleDescription?: string;
  titleTooltip?: string;
  singleViewPaneContainerTitle?: string;  // mergeHeaderWhenSingle 时替代 containerTitle
  minHeight?: number;                     // 声明最小高度——PaneSash effectiveMinHeight
  /** E5.8#36.6：视图动作区声明透传——侧栏 section header 右侧（#36.5 同一声明，两处消费） */
  titleActions?: TitleActionWidget[];
}

/** E5.7#84：单个侧栏容器的池渲染数据——SidebarLayout.containers[] 元素（keep-alive 容器清单） */
interface SidebarContainerLayout {
  containerId: string;
  containerTitle: string;
  mergeHeaderWhenSingle?: boolean;
  views: SidebarViewMeta[];
}

/** 侧栏布局——仅 SidebarPool 接收 */
export interface SidebarLayout {
  visible: boolean;
  width: number;
  /** 🆕 E5.8#36.8：侧栏所在边——#37.6 dockTo("sidebar", ...) 消费方（swap 规则：与 rightSidebar 恒占对边）。
   *  池 grid（#37.5）据此决定 sidebar 落左槽还是右槽。缺省 "left"。 */
  edge?: "left" | "right";
  // ── E5.6#11a：容器元数据 ──
  containerId: string | null;              // "file-explorer" / "marketplace" / "serial-monitor"
  containerTitle: string;                  // "资源管理器" / "插件市场" / "串口监视器"
  mergeHeaderWhenSingle?: boolean;
  views: SidebarViewMeta[];
  /** E5.7#84：keep-alive 容器清单——全部侧栏容器（非仅活动）序列化。
   *  池按 containerId 常驻挂载、display:none 切换——切容器不卸载视图，插件组件状态不丢。
   *  容器随插件卸载从清单消失 → 池自然卸载（真相源在壳，池零缓存）。旧布局（无此字段）回退单容器渲染。 */
  containers?: SidebarContainerLayout[];
  collapsedViews?: string[];              // 持久化折叠的 view ID 集合——壳 loadCollapsedState()
  /** E5.6#11-fix7：壳通知池侧栏是否折叠——width ≤ 48 时池渲染 ▶ 展开按钮而非裁剪内容 */
  collapsed?: boolean;
  // ── E5.7#10：侧栏 UI 文本壳侧 t() 推送（显示文本铁律——池渲染零自产文本） ──
  emptyText?: string;      // 空状态主文案——"此容器没有已注册的视图"
  emptyHint?: string;      // 空状态提示——"安装插件以添加视图"
  expandTooltip?: string;  // ▶ 展开按钮 tooltip
  collapseTooltip?: string;// ◀ 折叠按钮 tooltip
  // ── E5.7#13：拖拽钳制界——壳 LayoutEngine dock 声明推送（池本地钳制对齐壳 resizeZone，零硬编码） ──
  minWidth?: number;       // 拖拽最小宽——壳 dock.minWidth（170）
  maxWidth?: number;       // 拖拽最大宽——壳 dock.maxWidth（600）
  // ── 向后兼容 ──
  /** @deprecated 被 views[] 取代——保留给未迁移的代码 */
  viewId?: string | null;
}

/** 🆕 E5.8#36.8：右侧栏布局——右侧栏真 zone（决策 6，E5.8#36.7 addZone("rightSidebar") 消费方）。
 *  与 SidebarLayout 对齐（消费字段同集），但**不携带自身 edge**——swap 规则保证 sidebar ↔ rightSidebar
 *  恒占对边，右栏 edge = sidebar 对边（池 grid #37.5 推导，防两处字面量）。
 *  无折叠按钮/工具提示字段（RightSidebarZone 差异注记 ①：折叠态归 Phase 12 侧栏完形再补）。 */
export interface RightSidebarLayout {
  visible: boolean;
  width: number;
  // ── 容器元数据（与 SidebarLayout 同语义）──
  containerId: string | null;
  containerTitle: string;
  mergeHeaderWhenSingle?: boolean;
  views: SidebarViewMeta[];
  containers?: SidebarContainerLayout[];
  collapsedViews?: string[];
  /** 🆕 E5.8#36.8：右栏折叠态——#37.5 RightSidebarZone 真渲染（handle 镜像）预留；当前无壳侧生产者 */
  collapsed?: boolean;
  // ── 拖拽钳制界 + 空态文案（与 SidebarLayout 同语义）──
  minWidth?: number;
  maxWidth?: number;
  emptyText?: string;
  emptyHint?: string;
}

/** 标签页在池中的表示——壳 pushLayout 时序列化 */
export interface PoolTab {
  id: string;
  pluginId: string;
  title: string;
  sourceId?: string;
  dirty?: boolean;
  // 🆕 E5.6#16.5：TabBar 渲染所需元数据
  /** 插件图标 URL——getAssetPath() 解析后的路径 */
  icon?: string;
  /** 固定标签页（对标 VS Code pinned tabs） */
  pinned?: boolean;
  /** 标签页关闭行为——from plugin.json tabBehavior.closeBehavior */
  closeBehavior?: "normal" | "confirm" | "blocked";
  /** 单例插件（settings/marketplace 等）——TabBar 不显示 [×] 关闭按钮 */
  singleton?: boolean;
  /** 壳内部视图（欢迎页/插件详情/输出面板）——MainPool 内容区不渲染 PluginComponent */
  shellRendered?: boolean;
  /** 壳内部视图类型——"welcome" | "plugin-detail" | "output"，池侧路由到对应组件 */
  shellType?: string;
  /** plugin-detail 视图的目标插件 ID（哪个插件的详情页） */
  detailPluginId?: string;
}

/** 分屏组——每个 group 占一个 flex 区域，内含 N 个 keep-alive 标签页 */
export interface PoolGroup {
  id: string;
  flex: number;
  activeTabId: string;
  tabs: PoolTab[];
}

/** [+] 按钮可创建的视图类型——壳 pushLayout 时从 getTabCreatableViews() 动态计算 */
export interface CreatableViewMeta {
  pluginId: string;
  label: string;
}

// ── E5.7#1：布局 zone 字段 ──

/** 菜单项——壳侧已解析（显示文本铁律：label 已 t()，池哑渲染）。titlebar 下拉与 ☰ 汉堡共用。 */
export interface PoolMenuItem {
  /** 显示标签——壳 t(label ?? command.title ?? command) */
  label: string;
  /** 点击执行的命令 ID——无 command 父项为 ""（汉堡不展平父项，点击 no-op） */
  command: string;
  /** 快捷键显示文本——formatKeyLabel 后。仅汉堡（showKeybindings）；titlebar 下拉无快捷键（同壳行为） */
  shortcut?: string;
  /** when 不满足灰显——仅汉堡（checkWhen）。壳已判定，池哑渲染 */
  disabled?: boolean;
  /** 子菜单——titlebar 仅 command+children 父项携带（无 command 父项由壳展平）；汉堡不展平 */
  children?: PoolMenuItem[];
}

/** 菜单组——titlebar 每个 group = 顶栏一个按钮（如"文件""查看"）；汉堡 = 分组区块 */
export interface PoolMenuGroup {
  /** group 名——排序/定位键 */
  group: string;
  /** 组显示标签——壳 t(首项 label ?? group) */
  label: string;
  items: PoolMenuItem[];
}

/** 标题栏槽位按钮——插件 contributes.titleBar 声明（when 已由壳过滤） */
export interface TitleBarSlotButton {
  command: string;
  /** codicon 类名或图片路径 */
  icon?: string;
  /** tooltip——与壳 TitleBar title={item.command} 行为一致 */
  title: string;
}

/** 标题栏布局——Phase 2 #5 TitleBarZone 消费 */
export interface TitleBarLayout {
  title: string;
  /** Logo 资源 URL——壳 getAssetPath 解析（Path B：池不 import core） */
  logoUrl: string;
  menuBarVisible: boolean;
  /** 菜单栏数据——壳分组/展平/翻译后推送 */
  menuGroups: PoolMenuGroup[];
  /** 插件贡献槽位按钮（left/right） */
  slots: { left: TitleBarSlotButton[]; right: TitleBarSlotButton[] };
  /** 窗口控件 tooltip——显示文本铁律：壳 t() 解析后推送 */
  windowControls: { minimize: string; maximize: string; restore: string; close: string };
}

/** 图标栏图标——壳 resolvePluginIcon 序列化（池不 import pluginLoader，Lucide 名由池映射组件渲染） */
export type IconBarIcon =
  | { kind: "lucide"; name: string }   // E5#100 Lucide 优先
  | { kind: "codicon"; name: string }  // codicon CSS 类
  | { kind: "img"; src: string }       // linkdesk:// 协议 URL
  | { kind: "emoji"; text: string };   // 回退 emoji

/** 图标栏条目——序列化自壳 viewRegistry（pluginId + 图标 + 名称 + 位置） */
export interface IconBarItem {
  pluginId: string;
  icon: IconBarIcon;
  /** tooltip / aria-label——壳 t(manifest.name) */
  label: string;
  /** 图标位置——getIconLocation：顶部活动图标 / 底部齿轮 */
  location: "top" | "bottom";
}

/** 图标栏布局——Phase 2 #6 IconBarZone 消费 */
export interface IconBarLayout {
  icons: IconBarItem[];
  /** 激活图标——当前侧栏容器所属插件（侧栏折叠/无容器时不亮，壳 isActive 同款双重守卫） */
  activePluginId?: string;
  /** E3f #52h：☰ 汉堡可见——menuStyle hamburger/both */
  hamburgerVisible: boolean;
  /** 导航 aria-label——壳 t("导航")（显示文本铁律） */
  navLabel: string;
  /** ☰ 下拉——壳 MenuRenderer showGroups+showKeybindings+checkWhen 语义（不展平父项），仅 hamburgerVisible 时推 */
  hamburger?: {
    /** ☰ tooltip——壳 t("菜单") */
    title: string;
    groups: PoolMenuGroup[];
  };
}

/** 底部面板 view 元数据——面板视图注册序列化 */
export interface PanelViewMeta {
  id: string;
  title: string;
  pluginId: string;
  /** E5.7#63.7：视图渲染入口路径——loader 解析（_renderPath），池 PluginComponent 动态 import。
   *  ShellViewMeta 同款（sidebar 贡献），面板视图零特殊通道。 */
  renderPath: string;
  /** E5.8#36.5：视图动作区声明透传——PanelZone 标签栏右侧按活动视图渲染（无声明 → 右侧空白） */
  titleActions?: TitleActionWidget[];
}

/** E5.8#34：容器切换器下拉 item——含隐藏视图 + 显隐/激活标记（mockup 帧 2 拍板） */
export interface PanelSwitcherItem {
  viewId: string;
  /** 视图名——壳 t() 已解析（显示文本铁律） */
  title: string;
  /** 所属插件 ID——sub 标签（如 "panel-demo"） */
  pluginId: string;
  /** 当前可见性——✓ 勾选 = 可见 */
  visible: boolean;
  /** 是否激活视图 */
  active: boolean;
}

/** E5.8#34：容器切换器下拉分组——dd-group 容器标题 + dd-item 列表 */
export interface PanelSwitcherGroup {
  containerId: string;
  /** 容器标题——壳 t() 已解析 */
  containerTitle: string;
  items: PanelSwitcherItem[];
}

/** 底部面板布局——Phase 5 #21 PanelZone 消费 */
export interface PanelLayout {
  visible: boolean;
  height: number;
  /** 🆕 E5.8#36.8：面板 dock 边——#37.7 dockTo 消费方（面板位置）。顶/底=横带（align 控列跨度）；
   *  左/右=主区与对应侧栏间竖条（5 带排布）。缺省 "bottom"。 */
  edge?: "bottom" | "top" | "left" | "right";
  /** 🆕 E5.8#36.8：面板横向对齐——#37.7 setAlign 消费方。几何由池 grid 推导（#37.5），壳只推配置。
   *  center=主栏宽 / left=延伸到左侧栏之下 / right=延伸到右侧栏之下 / justify=全宽。缺省 "center"。 */
  align?: "left" | "center" | "right" | "justify";
  /** 🆕 E5.8#36.8：面板宽——edge∈{left,right} 时使用（竖条宽）；顶/底仍用 height。缺省 300。 */
  width?: number;
  activeViewId: string;
  views: PanelViewMeta[];
  // ── E5.7#21：拖拽钳制界——#13 同款（壳 LayoutEngine dock 声明推送，池零硬编码）。 ──
  minHeight?: number;
  maxHeight?: number;
  /** E5.7#63.7：[+] 按钮 tooltip——壳 t("新建面板视图") 推送（显示文本铁律；面板创建归 Phase 12，目前壳侧 no-op） */
  createTooltip?: string;
  /** E5.8#34：容器切换器下拉 DTO——按容器分组列全部视图（含隐藏），mockup 帧 2 */
  switcher?: PanelSwitcherGroup[];
  /** E5.8#34：空态占位主文本——全隐藏 / 无贡献视图时壳 t() 推送 */
  emptyText?: string;
  /** E5.8#34：空态占位指路——同 emptyText 壳 t() 推送 */
  emptyHint?: string;
}

/** 状态栏条目——序列化自壳 StatusBar 三源（贡献/动态/事件）+ 壳固定项（显示文本铁律：壳 t() 已解析）。
 *  E5.8#20-c：改名 PoolStatusBarItem——与 api/types.ts StatusBarItem（manifest 贡献型）同名，
 *  契约平铺进单文件会声明合并成幽灵复合型（pluginId 变必选）；池线用 Pool 前缀消歧。 */
export interface PoolStatusBarItem {
  id: string;
  pluginId: string;
  /** codicon 图标名（不带 codicon- 前缀——池补） */
  icon?: string;
  label: string;
  title?: string;
  align: "left" | "right";
  /** 点击执行的命令 ID */
  onClick?: string;
  /** 插件有 statusBarComponent——池侧懒加载渲染（serial-monitor TX/RX 实时计数） */
  component?: boolean;
  /** 前导分隔线——壳 StatusBar 渲染语义（左区每项除首个；右区组内除首个） */
  dividerBefore?: boolean;
}

/** 通知动作——壳 ToastAction 序列化（onClick 是壳侧闭包——池点击回传壳执行） */
interface NotifAction {
  label: string;
  isPrimary?: boolean;
}

/** 通知条目——壳侧已解析（icon 类/时间/来源标签/动作全部壳侧完成） */
interface NotifItem {
  id: string;
  /** 完整 codicon 类串（如 "codicon codicon-error notif-severity-error"） */
  iconClass: string;
  message: string;
  /** 壳 formatTimeAgo（i18n t()） */
  timeLabel: string;
  /** 壳 t("来源: {{source}}")——无 source 则缺省 */
  sourceLabel?: string;
  actions: NotifAction[];
}

/** 通知分组——壳 NotificationCenter buildSourceGroups（source 第一段归类 + 未读排序） */
interface NotifGroup {
  key: string;
  /** source 第一段或 t("其他") */
  label: string;
  unread: number;
  items: NotifItem[];
}

/** 通知中心数据——壳侧序列化（未读计数/文案/分组全壳侧完成） */
export interface NotifLayout {
  unread: number;
  /** 铃铛 tooltip——t("{{count}} 条通知") / t("通知") */
  bellTitle: string;
  panelTitle: string;
  clearLabel: string;
  emptyLabel: string;
  dismissTitle: string;
  groups: NotifGroup[];
}

/** 状态栏布局——Phase 2 #8 StatusBarZone 消费 */
export interface StatusBarLayout {
  items: PoolStatusBarItem[];
  /** Chord 提示——壳 CHORD_CHANGED 构建的完整字符串（按键名是技术标识符，不走 i18n） */
  chordLabel?: string;
  /** 通知中心——壳 toast 存储序列化（面板开闭/清除/动作回传壳执行） */
  notif: NotifLayout;
}

/**
 * PoolLayout v2——E5.7 唯一的 Pool 收到全量布局快照。
 * titleBar/iconBar/sidebar/statusBar 必有；rightSidebar/panel 可选（未启用时不推）。
 */
export interface PoolLayout {
  version: 2;
  titleBar: TitleBarLayout;
  iconBar: IconBarLayout;
  sidebar: SidebarLayout;
  /** E5.8#36.8：右侧栏真 zone 布局——RightSidebarLayout（edge 反推 = sidebar 对边，不携带自身 edge） */
  rightSidebar?: RightSidebarLayout;
  groups: PoolGroup[];
  /** E5.8#30.15（P5）：聚焦面板 id——点面板空白/点标签设置（壳 reduceFocusGroup/FocusTab）。
   *  池侧消费：accent 聚焦环 + isActive 单聚焦判定（tab.id === activeTabId && group.id === activeGroupId）。 */
  activeGroupId?: string;
  /** E5.6#16.7：递归分屏树——MainRenderer 递归渲染，替代平铺 groups.map。
   *  leaf = 单 GroupPane，branch = 水平/垂直 flex 容器。 */
  root?: SplitNode;
  /** E5.6#16.7k-3：可创建为标签页的视图列表——池 GroupTabBar [+] 按钮动态菜单 */
  creatableViews?: CreatableViewMeta[];
  panel?: PanelLayout;
  statusBar: StatusBarLayout;
}
