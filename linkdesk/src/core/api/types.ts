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

/** contributes.iconThemes 条目——对标 VS Code productIconThemes extension point */
export interface IconThemeContribution {
  id: string;
  label: string;
  path: string;
}

/** 图标主题映射表——fileExtensions/fileNames/folderNames → CSS 类名 */
export interface IconThemeMappings {
  files?: Record<string, string>;
  extensions?: Record<string, string>;
  folders?: Record<string, string>;
  /** 文件夹打开态——可选，未指定则复用 folders */
  foldersExpanded?: Record<string, string>;
}

/** contributes.icons 条目——对标 VS Code icon extension point。插件贡献共享图标供其他插件引用。 */
export interface IconContribution {
  description: string;
  default: {
    fontPath?: string;
    fontCharacter?: string;
  };
}

/** contributes.languages 条目——对标 VS Code language extension point */
export interface LanguageContribution {
  id: string;
  label: string;
  path: string;
}

/** contributes.langDefs 条目——编程语言定义（对标 VS Code contributes.languages） */
export interface LangDefContribution {
  id: string;
  extensions: string[];
  aliases?: string[];
  /** 🔒 内部——registerLangDef 运行时注入。插件 author 不应在 plugin.json 中声明此字段。 */
  _pluginId?: string;
  monarch?: {
    tokenizer: Record<string, unknown>;
  };
  lsp?: {
    command: string;
    args?: string[];
  };
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
  /** 插件角色——只管加载策略。view=有 UI 组件，data=纯数据。不填自动推导 */
  pluginRole?: "view" | "data";
  name: string;
  version: string;
  icon?: string;
  iconSource?: "codicon" | "svg" | "url" | "lucide";
  description?: string;
  author?: string;
  entry?: string;
  sidebar?: string;
  tabBehavior?: TabBehavior;
  /** 系统插槽角色——声明此插件填充哪个系统级功能。settings=设置页，marketplace=插件市场。
   *  多个插件声明同一 role → 第一个 core: true 的胜出。
   *  E5.7#65：开放 string——第三方可声明新角色名，壳零改动（FactorySlots 按字符串查表）。 */
  factoryRole?: string;
  statusBar?: StatusBarItem[];
  /** @deprecated E5#12——已迁移到 contributes.themes。仅 normalizeManifest 向后兼容用。 */
  file?: string;
  /** @deprecated E5#12——已迁移到 contributes.themes。仅 normalizeManifest 向后兼容用。 */
  themes?: { id: string; name: string; file: string }[];
  /** @deprecated E5#12——已迁移到 contributes.languages。仅 normalizeManifest 向后兼容用。 */
  languages?: { code: string; name: string; file: string }[];
  mode?: "text" | "binary";
  resources?: string[];
  recommends?: { plugin: string; reason: string }[];
  suggests?: { plugin: string; reason: string }[];
  /** 插件级激活顺序依赖（E5.8#13）——按 pluginId 声明，loader 先加载依赖再加载本插件。
   *  纯声明：无版本约束（版本语义属 E6 市场范畴，激活顺序不承载）；缺依赖 → loader 状态机挂 PENDING。
   *  与 ConfigurationRegistry 的配置项级 dependsOn（同一 manifest 内某配置项依赖另一配置项）不同域。 */
  requires?: string[];
  changelog?: { version: string; date: string; changes?: string[] }[];
  screenshots?: string[];
  minAppVersion?: string;
  /** 激活事件——对标 VS Code activationEvents。空或含 "*" = 启动时立即加载。
   *  具体事件：onCommand:id / onFileOpen:.ext / onPortOpen / onLanguage:id / onView:id */
  activationEvents?: string[];
  /** @deprecated E5.8#14——归并到 requires（插件级激活依赖统一由 requires 声明）。
   *  零插件使用；loader 兼容读取直到 #14 落地迁移。 */
  extensionDependencies?: string[];
  docs?: string;
  cardDocMap?: Record<string, string>;
  /** @deprecated E5#109——使用 contributes.i18n 代替。每插件 `i18n/{lang}.json`，key=中文原文。见 [[i18n-round2-leftovers]] */
  i18n?: Record<string, string>;
  cssVars?: Record<string, { dark: string; light: string }>;
  permissions?: ("serial" | "filesystem" | "network")[];

  /**
   * Phase 5g：视图元数据——声明视图和壳的交互方式。
   * 这些字段替代 Phase 3/4 的硬编码特殊判断（isSidebarOnlyView / BOTTOM_ICONS 等）。
   */

  /** 插件 UI 出现位置——声明式。替代 iconLocation + viewRole + keepSidebarOnFocus。
   *  对标 VS Code：viewsContainers + views 的组合推导出 Activity Bar / Sidebar / Panel */
  appearsIn?: {
    iconBar?: "top" | "bottom";
    sidePanel?: boolean;
    tabBar?: boolean;
    statusBar?: boolean;
  };
  /** @deprecated E5#14——用 appearsIn.iconBar 替代。仅 viewRegistry.ts 向后兼容兜底。 */
  iconLocation?: "top" | "bottom";
  /** @deprecated E5#14——用 appearsIn.tabBar / appearsIn.sidePanel 替代。 */
  viewRole?: "sidebarPrimary" | "tabOnly";
  /** @deprecated E2c #19d 后已无 shellRendered 概念——壳级视图直接写 App.tsx，不走 plugin.json 声明。保留仅用于向后兼容。 */
  shellRendered?: boolean;
  /** @deprecated E5#14——appearsIn 归一化后不再需要。 */
  keepSidebarOnFocus?: boolean;

  /**
   * Phase 5：对标 VS Code package.json contributes。
   * 使用 Record<string, unknown> 兼容未知 key——parseContributions 按 key 逐项检测。
   * 已知 key 的类型见下方 ContributesViewsContainers / ContributesViews。
   */
  contributes?: Record<string, unknown>;
}

/* ── E5.8#36.5：视图动作区声明——contributes.views[].titleActions（随视图走，面板/侧栏两处消费） ── */

/** 动作区下拉条目——label 显示文本（i18n key），command 执行，args 作为单个位置参数透传 */
export interface TitleActionItem {
  /** 显示文本——i18n key（中文原文；池 t() 解析——显示文本铁律） */
  label: string;
  /** 点击执行的命令 ID */
  command: string;
  /** 命令参数——executeCommand(command, args) 单个位置参数透传（JSON 可序列化，无则省略） */
  args?: unknown;
}

/** 动作区 widget——三形态：icon 按钮 / 下拉菜单 / 主按钮+下拉复合（VS Code 终端 [+] + [▾] 同款）。
 *  widget 是通用件不是给终端造的——谁声明谁用（通用 API 壳先行建设不等消费方，插件独立铁律）。 */
export type TitleActionWidget =
  /** 单图标按钮——点击执行 command */
  | {
      type: "icon";
      id: string;
      command: string;
      /** codicon 类名（如 "codicon-add"）——池渲染 `<span className={`codicon ${icon}`} />` */
      icon: string;
      /** tooltip / aria-label——i18n key */
      title: string;
      args?: unknown;
    }
  /** 纯下拉——chevron 按钮展开 items 列表 */
  | {
      type: "dropdown";
      id: string;
      items: TitleActionItem[];
      /** chevron tooltip——i18n key */
      title?: string;
    }
  /** 主按钮+下拉复合——主按钮执行 command（默认动作），右侧 chevron 展开 items 备选 */
  | {
      type: "split";
      id: string;
      command: string;
      /** 主按钮图标——无 icon 时用 title（t() 后）作文本按钮 */
      icon?: string;
      /** 主按钮 tooltip / aria-label / 无 icon 时的文本——i18n key */
      title: string;
      items: TitleActionItem[];
      args?: unknown;
    };

/* ── E3.6：contributes 已知 key 类型——用于 as 类型断言，消费端安全访问 ── */

/** contributes.viewsContainers 的形状 */
export interface ContributesViewsContainers {
  [containerId: string]: {
    title: string;
    icon?: string;
    location?: "sidebar" | "panel" | "auxiliarybar";
    hideIfEmpty?: boolean;
    order?: number;
    mergeHeaderWhenSingle?: boolean;
  };
}

/** contributes.views 的形状 */
export interface ContributesViews {
  [containerId: string]: Array<{
    id: string;
    title?: string;
    render: string;
    role?: "toolbar" | "section";
    when?: string;
    order?: number;
    collapsed?: boolean;
    canToggleVisibility?: boolean;
    canMoveView?: boolean;
    hideByDefault?: boolean;
    singleViewPaneContainerTitle?: string;
    titleDescription?: string;
    showActions?: "always" | "whenExpanded" | "default";
    titleTooltip?: string;
    /** 面板区 dock 最小高度（E5.7#63.7：ViewContainerService 消费）——E5.8#1c 补录 schema */
    minHeight?: number;
    /** 视图动作区声明（E5.8#36.5）——面板标签栏/侧栏 header 右侧 widget 列表。随视图走随视图迁移 */
    titleActions?: TitleActionWidget[];
  }>;
}

/* ── 视图插件注册条目 ── */

export interface ViewPluginEntry {
  pluginId: string;
  manifest: PluginManifest;
  /** React 组件（懒加载） */
  component: React.ComponentType<{ isActive: boolean; sourceId?: string }>;
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
