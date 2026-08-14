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
 */

import type { SplitNode } from "../../hooks/splitTree";

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
}

/** 侧栏布局——仅 SidebarPool 接收 */
export interface SidebarLayout {
  visible: boolean;
  width: number;
  // ── E5.6#11a：容器元数据 ──
  containerId: string | null;              // "file-explorer" / "marketplace" / "serial-monitor"
  containerTitle: string;                  // "资源管理器" / "插件市场" / "串口监视器"
  mergeHeaderWhenSingle?: boolean;
  views: SidebarViewMeta[];
  collapsedViews?: string[];              // 持久化折叠的 view ID 集合——壳 loadCollapsedState()
  /** E5.6#11-fix7：壳通知池侧栏是否折叠——width ≤ 48 时池渲染 ▶ 展开按钮而非裁剪内容 */
  collapsed?: boolean;
  // ── 向后兼容 ──
  /** @deprecated 被 views[] 取代——保留给未迁移的代码 */
  viewId?: string | null;
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

/** 标题栏菜单项——壳侧已解析（显示文本铁律：label 已 t()，池哑渲染） */
export interface TitleBarMenuItem {
  /** 显示标签——壳 t(label ?? command.title ?? command) */
  label: string;
  /** 点击执行的命令 ID */
  command: string;
  /** 子菜单——仅 command+children 父项携带（无 command 父项由壳展平） */
  children?: TitleBarMenuItem[];
}

/** 标题栏菜单组——每个 group = 顶栏一个按钮（如"文件""查看"） */
export interface TitleBarMenuGroup {
  /** group 名——排序/定位键 */
  group: string;
  /** 按钮显示标签——壳 t(首项 label ?? group) */
  label: string;
  items: TitleBarMenuItem[];
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
  menuGroups: TitleBarMenuGroup[];
  /** 插件贡献槽位按钮（left/right） */
  slots: { left: TitleBarSlotButton[]; right: TitleBarSlotButton[] };
  /** 窗口控件 tooltip——显示文本铁律：壳 t() 解析后推送 */
  windowControls: { minimize: string; maximize: string; restore: string; close: string };
}

/** 图标栏条目——序列化自壳 viewRegistry（pluginId + 图标 + 名称 + 位置） */
export interface IconBarItem {
  pluginId: string;
  /** 图标——resolvePluginIcon 的 src 或 emoji，二选一 */
  icon?: string;
  label: string;
  /** 图标位置——getIconLocation：顶部活动图标 / 底部齿轮 */
  location: "top" | "bottom";
}

/** 图标栏布局——Phase 2 #6 IconBarZone 消费 */
export interface IconBarLayout {
  icons: IconBarItem[];
  /** 激活图标——当前侧栏容器所属插件 */
  activePluginId?: string;
}

/** 底部面板 view 元数据——面板视图注册序列化 */
export interface PanelViewMeta {
  id: string;
  title: string;
  pluginId: string;
}

/** 底部面板布局——Phase 6 PanelZone 消费 */
export interface PanelLayout {
  visible: boolean;
  height: number;
  activeViewId: string;
  views: PanelViewMeta[];
}

/** 状态栏条目——序列化自壳 StatusBar 三源（贡献/动态/事件） */
export interface StatusBarItem {
  id: string;
  pluginId: string;
  /** codicon 图标名 */
  icon?: string;
  label: string;
  title?: string;
  align: "left" | "right";
  /** 点击执行的命令 ID */
  onClick?: string;
}

/** 状态栏布局——Phase 2 #8 StatusBarZone 消费 */
export interface StatusBarLayout {
  items: StatusBarItem[];
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
  rightSidebar?: SidebarLayout;
  groups: PoolGroup[];
  /** E5.6#16.7：递归分屏树——MainRenderer 递归渲染，替代平铺 groups.map。
   *  leaf = 单 GroupPane，branch = 水平/垂直 flex 容器。 */
  root?: SplitNode;
  /** E5.6#16.7k-3：可创建为标签页的视图列表——池 GroupTabBar [+] 按钮动态菜单 */
  creatableViews?: CreatableViewMeta[];
  panel?: PanelLayout;
  statusBar: StatusBarLayout;
}
