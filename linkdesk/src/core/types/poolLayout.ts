/**
 * PoolLayout 类型定义——E5.6#8a。
 *
 * 壳与池共享的布局协议。壳推送 PoolLayout JSON 到池，
 * 池解析后渲染 SidebarRenderer / MainRenderer。
 *
 * 兼容性：池忽略不认识的字段，壳加字段不破坏旧池。
 */

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
}

/** 分屏组——每个 group 占一个 flex 区域，内含 N 个 keep-alive 标签页 */
export interface PoolGroup {
  id: string;
  flex: number;
  activeTabId: string;
  tabs: PoolTab[];
}

/** PoolLayout——壳推给池的完整布局快照 */
export interface PoolLayout {
  sidebar?: SidebarLayout;
  groups: PoolGroup[];
}
