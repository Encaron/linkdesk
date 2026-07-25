/**
 * Phase 4 核心类型定义。
 * 插件元数据、标签页扩展字段、视图注册表条目。
 *
 * 设计依据：[[phase4-design-decisions]] + public/schemas/plugin.schema.json
 */

/* ── 插件类型枚举 ── */

export type PluginType = "view" | "card" | "theme" | "language" | "protocol" | "resource" | "datasource";

/** contributes.themes 条目——对标 VS Code theme extension point */
export interface ThemeContribution {
  id: string;
  label: string;
  uiTheme: "dark" | "light" | "highContrast";
  path: string;
}

/* ── 标签页行为声明 ── */

export interface TabBehavior {
  /** 场上无标签页时自动创建此标签页，且不可关闭。只有欢迎页声明。 */
  isFallback?: boolean;
  /** 全局只允许一个实例，重复创建 → 聚焦已有。如设置页。 */
  singleton?: boolean;
  /** 关闭前弹确认框，值为提示文本。如终端。 */
  confirmOnClose?: string;
  /** 关闭前调用的 Tauri invoke 命令（在 confirmOnClose 确认之后，closeTab 之前）。如终端声明 "close_port"。 */
  invokeBeforeClose?: string;
  /** CreateTabOptions 中用于判断标签页身份的唯一字段。null=允许多实例不去重（默认）。
   *  如 workspace 声明 "workspaceName"——同名工作台只允许一个标签页。 */
  identityField?: string;
}

/* ── 状态栏贡献条目 ── */

export interface StatusBarItem {
  id: string;
  icon?: string;
  label: string;
  align?: "left" | "right";
  onClick?: string;
  /** 声明 true → 壳自动注册配置项（<pluginId>.statusBar.<id>）+ 注入 visible prop。
   *  插件作者只写一行 JSON，用户可在 Settings Editor 开关。 */
  configurable?: boolean;
}

/* ── 插件元数据（plugin.json 的 TS 类型） ── */

export interface PluginManifest {
  $schema?: string;
  /** @deprecated 使用 contributes + tabBehavior 等声明字段代替——贡献点由 manifest 的实际声明字段检测（对标 VS Code contributes） */
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
  /** 系统插槽角色——声明此插件填充哪个系统级功能。settings=设置页，marketplace=插件市场。
   *  多个插件声明同一 role → 第一个 core: true 的胜出。 */
  factoryRole?: "settings" | "marketplace";
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
  /** @deprecated 使用 languages + file 字段代替——i18n 资源走统一的 languages 体系 */
  i18n?: Record<string, string>;
  cssVars?: Record<string, { dark: string; light: string }>;
  permissions?: ("serial" | "filesystem" | "network")[];

  /**
   * Phase 5g：视图元数据——声明视图和壳的交互方式。
   * 这些字段替代 Phase 3/4 的硬编码特殊判断（isSidebarOnlyView / BOTTOM_ICONS 等）。
   */

  /** 图标在图标栏的位置。top（默认，上部可拖拽区）或 bottom（底部固定区，对标 VS Code Activity Bar 齿轮）。 */
  iconLocation?: "top" | "bottom";
  /** 视图角色——声明此视图在壳中的交互模式。5g 定义字段，5.5 消费。
   *  - sidebarPrimary（默认）：侧栏为主——点击图标 toggle 侧栏，不自动打开标签页（对标 VS Code Activity Bar）
   *  - tabOnly：纯标签页视图——点击图标直接打开/聚焦标签页（如设置） */
  viewRole?: "sidebarPrimary" | "tabOnly";
  /** @deprecated E2c #19d 后已无 shellRendered 概念——壳级视图直接写 App.tsx，不走 plugin.json 声明。保留仅用于向后兼容。 */
  shellRendered?: boolean;
  /** 聚焦此视图时保留当前侧栏不清除。如插件详情页——用户浏览插件时侧栏不变。 */
  keepSidebarOnFocus?: boolean;

  /**
   * Phase 5：对标 VS Code package.json contributes。
   * 使用宽松索引签名——Phase 6 加 contributes.themes / languages / fileAssociations 时
   * Phase 5 的 loader 不崩（parseContributions 按 key 逐项检测，不认识的跳过）。
   */
  contributes?: Record<string, unknown>;
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
