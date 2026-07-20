/**
 * Phase 4 核心类型定义。
 * 插件元数据、标签页扩展字段、视图注册表条目。
 *
 * 设计依据：[[phase4-design-decisions]] + docs/插件开发/plugin.schema.json
 */

/* ── 插件类型枚举 ── */

export type PluginType = "view" | "card" | "theme" | "language" | "protocol" | "resource" | "datasource";

/* ── 标签页行为声明 ── */

export interface TabBehavior {
  /** 场上无标签页时自动创建此标签页，且不可关闭。只有欢迎页声明。 */
  isFallback?: boolean;
  /** 全局只允许一个实例，重复创建 → 聚焦已有。如设置页。 */
  singleton?: boolean;
  /** 关闭前弹确认框，值为提示文本。如终端。 */
  confirmOnClose?: string;
}

/* ── 状态栏贡献条目 ── */

export interface StatusBarItem {
  id: string;
  icon?: string;
  label: string;
  align?: "left" | "right";
  onClick?: string;
}

/* ── 插件元数据（plugin.json 的 TS 类型） ── */

export interface PluginManifest {
  $schema?: string;
  /** @deprecated 不再必需——贡献点由 manifest 的实际声明字段检测（对标 VS Code contributes） */
  type?: PluginType;
  core?: boolean;
  name: string;
  version: string;
  icon?: string;
  iconSource?: "codicon" | "svg" | "url";
  description?: string;
  author?: string;
  entry?: string;
  sidebar?: string;
  tabBehavior?: TabBehavior;
  statusBar?: StatusBarItem[];
  file?: string;
  themes?: { id: string; name: string; file: string }[];
  languages?: { code: string; name: string; file: string }[];
  mode?: "text" | "binary";
  resources?: string[];
  recommends?: { plugin: string; reason: string }[];
  suggests?: { plugin: string; reason: string }[];
  requires?: { plugin: string; version: string }[];
  changelog?: { version: string; date: string; changes?: string[] }[];
  screenshots?: string[];
  minAppVersion?: string;
  docs?: string;
  cardDocMap?: Record<string, string>;
  i18n?: Record<string, string>;
  cssVars?: Record<string, { dark: string; light: string }>;
  permissions?: ("serial" | "filesystem" | "network")[];
}

/* ── 视图插件注册条目 ── */

export interface ViewPluginEntry {
  pluginId: string;
  manifest: PluginManifest;
  /** React 组件（懒加载） */
  component: React.ComponentType<{ isActive: boolean; sourceId?: string }>;
  /** 可选侧栏组件 */
  sidebarComponent?: React.ComponentType;
  /** 可选状态栏组件——插件自己渲染动态状态项，对标 VS Code StatusBarItem */
  statusBarComponent?: React.ComponentType;
}

/* ── Tab 类型扩展（Phase 4） ── */

/**
 * createTab 的可选参数。
 * VS Code 对标：打开编辑器时的 options（viewColumn / preview / label 等）。
 * 注意：这不是 Partial<Tab>——只暴露有意外露的字段，防止调用方覆盖内部状态。
 */
export interface CreateTabOptions {
  /** 插件 ID（view 类型时指定哪个插件渲染） */
  pluginId?: string;
  /** plugin-detail 标签页的目标插件 ID */
  detailPluginId?: string;
  /** 工作台名称（workspace 类型时使用） */
  workspaceName?: string;
  /** 文件路径（editor 类型时使用） */
  filePath?: string;
  /** 自定义标签名 */
  label?: string;
  /** 是否固定（false=预览模式，对标 VS Code preview editor） */
  pinned?: boolean;
  /** 数据源 ID */
  sourceId?: string;
  /** 目标面板组 ID（分屏时指定落在哪个面板） */
  targetGroupId?: string;
}

/**
 * Tab.type 保留为逻辑角色（terminal / workspace / settings / welcome）。
 * 新增 pluginId 指定哪个插件实现该角色——渲染走 pluginId，规则走 type。
 * 旧布局恢复时的 type→pluginId 映射见 tabIdentity.ts 的 resolveLegacyPluginId。
 */
