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
  type: PluginType;
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
}

/* ── Tab 类型扩展（Phase 4） ── */

/**
 * Tab.type 保留为逻辑角色（terminal / workspace / settings / welcome）。
 * 新增 pluginId 指定哪个插件实现该角色——渲染走 pluginId，规则走 type。
 * Phase 4 过渡期：旧布局恢复时自动补 pluginId。
 */
export const LEGACY_TYPE_TO_PLUGIN_ID: Record<string, string> = {
  terminal: "terminal",
  workspace: "workspace",
  settings: "settings",
  oled: "oled",
  editor: "editor",
};
