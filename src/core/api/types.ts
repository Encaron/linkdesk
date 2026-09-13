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

/** 图标映射条目——字体 glyph 形态（单色/带色字体，seti 类每图标一色；codicon 即保底单色） */
export interface IconThemeGlyph {
  /** CSS 类名（codicon 保底 / 自定义图标字体资产） */
  class: string;
  /** 可选每图标颜色（seti 类彩色字体） */
  color?: string;
}

/** 图标映射条目——图像资产形态（任意多色/拟物化/贴图） */
export interface IconThemeImage {
  /** 图像资产相对路径——壳加载时解析为 linkdesk:// 绝对 URL（getPluginAssetPath），消费方零解析负担 */
  imagePath: string;
}

/** 图标映射条目——双形态（E5.8#133 ④ 拍板：字体 glyph 或图像资产，同一主题可混用，壳零审查） */
export type IconThemeMapping = IconThemeGlyph | IconThemeImage;

/** 图标主题映射表——fileExtensions/fileNames/folderNames → 双形态条目 */
export interface IconThemeMappings {
  files?: Record<string, IconThemeMapping>;
  extensions?: Record<string, IconThemeMapping>;
  folders?: Record<string, IconThemeMapping>;
  /** 文件夹打开态——可选，未指定则复用 folders */
  foldersExpanded?: Record<string, IconThemeMapping>;
  /* ── 默认图标（E5.8#133.6：对齐 VS Code iconTheme 顶层默认键——未命中匹配表时用主题默认而非 codicon 保底） ── */
  /** 默认文件图标——未命中 files/extensions 时使用（缺省 = 壳 codicon 保底） */
  file?: IconThemeMapping;
  /** 默认文件夹图标——未命中 folders 时使用（缺省 = 壳 codicon 保底） */
  folder?: IconThemeMapping;
  /** 默认文件夹展开图标——未命中 foldersExpanded 时使用（缺省 = 壳 codicon 保底） */
  folderExpanded?: IconThemeMapping;
  /** 根文件夹图标（缺省 = 壳 codicon 保底） */
  rootFolder?: IconThemeMapping;
  /** 根文件夹展开图标（缺省 = 壳 codicon 保底） */
  rootFolderExpanded?: IconThemeMapping;
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
  /**
   * 插件身份——**发布后永不可变**（对标 VS Code 的 `publisher.name`）。安装目录
   * `{userData}/plugins/<pluginId>/`、分发件名 `<pluginId>.linkdesk-plugin`、市场目录去重键、
   * 卸载墓碑键、更新对账全部以它为准。
   *
   * L7（E6#98g）起**要求显式声明**：不声明时退回「项目目录名」兜底（`derivePluginId`），而仓库名
   * 与本地目录名是自由的——目录名一改身份就跟着改，且五条后果（安装目录并存两份 / 墓碑对不上 /
   * 市场出现两条 / 更新链静默断 / 插件数据看似丢失）没有一条会报错。兜底路径保留仅为向后兼容
   * 仓外的存量第三方插件。
   * 形状约束 `^[A-Za-z0-9][A-Za-z0-9._-]*$`（`SAFE_PLUGIN_ID`，防路径穿越直通文件系统）。
   */
  pluginId?: string;
  /** @deprecated 使用 contributes + tabBehavior 等声明字段代替——贡献点由 manifest 的实际声明字段检测（对标 VS Code contributes） */
  type?: PluginType;
  core?: boolean;
  /** 插件角色——只管加载策略。view=有 UI 组件，data=纯数据。不填自动推导 */
  pluginRole?: "view" | "data";
  name: string;
  version: string;
  icon?: string;
  iconSource?: "codicon" | "svg" | "url" | "lucide";
  /** 市场展示图（cover art，14 档案双图标模型 E6#67）——svg 资产相对路径，可画得讲究复杂
   *  （与 icon 的「界面单色小图标」语义分开：壳图标栏/标签栏只读 icon）。缺省 → 市场回退用 icon。
   *  惯例：值 = 包内资源相对路径（如 "resources/cover.svg"）、iconSource 省略 → linkdesk:// 路径推断。 */
  marketIcon?: string;
  marketIconSource?: "codicon" | "svg" | "url" | "lucide";
  description?: string;
  author?: string;
  entry?: string;
  sidebar?: string;
  tabBehavior?: TabBehavior;
  /** 系统插槽角色——声明此插件填充哪个系统级功能。settings=设置页，marketplace=插件市场。
   *  同一 role 多插件合法并存（一对多，全收进槽位候选）；默认 = 首注册稳定序
   *  （E6#18b：core:true 无行为特权，不抢默认），用户切换的活动套持久化保持。
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
  screenshots?: string[];
  minAppVersion?: string;
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
    /** 自绘（代码）状态栏组件文件路径（相对插件根，.tsx）——存在 + 文件二合一声明（对标视图 render）。
     *  有值 = 插件自绘状态栏组件取代其静态 statusBar 贡献项；loader 注册时 resolveRuntimePluginRoot
     *  归一 → ViewPluginEntry.statusBarRenderPath（dev /@fs 源码 / prod linkdesk:// dist，SDK 打包后
     *  此字段改写为 statusBar.bundle.js 编译表面），壳发 component marker → 池直动态 import（E6#62d）。
     *  缺省 = 无自绘组件（静态贡献项照常）。 */
    statusBar?: string;
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
    location?: "sidebar" | "panel" | "auxiliarybar" | "main";
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

/** contributes.floatingPanel 的形状——声明某视图可在壳内悬浮面板显示（E5.8#39.5 类型 B）。
 *  viewId 必须引用 contributes.views 中已注册的视图——声明寻址解析出 pluginId/renderPath/title。
 *  首批声明者 = settings（#38 Ctrl+, 弹面板）；第二声明者验证载体 = floating-panel-demo 测试插件。 */
export interface ContributesFloatingPanel {
  /** 视图 ID——contributes.views 已注册视图（声明 floatingPanel 视图才有「在悬浮面板中打开」右键 I8-3） */
  viewId: string;
}

/* ── 视图插件注册条目 ── */

export interface ViewPluginEntry {
  pluginId: string;
  manifest: PluginManifest;
  /** E6#62d：插件自绘状态栏组件（manifest.appearsIn.statusBar 声明）的归一化 URL——loader 注册时
   *  resolveRuntimePluginRoot 拼：dev /@fs 源码 .tsx、prod linkdesk:// dist（SDK 打包后 manifest
   *  appearsIn.statusBar 改写为 statusBar.bundle.js → URL 直指编译表面）。壳 statusbar.ts 读此发
   *  component marker（componentRenderPath）→ 池直动态 import。未声明/根解析失败 = 无。 */
  statusBarRenderPath?: string;
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
