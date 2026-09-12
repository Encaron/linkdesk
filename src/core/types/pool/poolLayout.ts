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
  pluginId: string;                       // _pluginId——PluginComponent 用它定位插件根（resolvePath IPC）
  renderPath: string;                     // _renderPath 归一化 URL（dev /@fs | prod linkdesk://）——池直动态 import（E6#62b）
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
  /** E5.6#11-fix7：壳通知池侧栏是否折叠——折叠=真消失（#147/#159 无窄条/▶，grid auto 列 0 宽） */
  collapsed?: boolean;
  // ── E5.7#10：侧栏 UI 文本壳侧 t() 推送（显示文本铁律——池渲染零自产文本） ──
  emptyText?: string;      // 空状态主文案——"此容器没有已注册的视图"
  emptyHint?: string;      // 空状态提示——"安装插件以添加视图"
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
 *  E5.8#37.5 RightSidebarZone 真渲染：文案壳 t() 推送（显示文本铁律）。#159 无 ◀/▶ 折叠按钮——与左栏同款。 */
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
  /** 🆕 E5.8#36.8 + #37.5 + #159：右栏折叠态——宽度 ≤48 派生（池），折叠=整个 zone 消失（与左栏 #147 同源，
   *  无窄条/▶——折叠/展开仅走图标栏 toggle + 界面勾选菜单） */
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
  /** 标签图标——IconBarIcon 判别联合（E6#69f/#69g：视图标签 = Type-2 身份图 img；文件标签 = 文件类型图标
   *  codicon/img。壳 serializeGroups 现场解析，池哑渲染——此前仅 emoji/img string，codicon/lucide 标签落空） */
  icon?: IconBarIcon;
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
  /** E6#30.10b：plugin-detail 主区贡献视图的宿主插件 ID（factorySlots 活跃 marketplace 插件——贡献
   *  渲染面的是它，≠ detailPluginId）。壳 serializeGroups 现场解析盖章，池宿主加载贡献模块用（resolvePath
   *  要贡献插件根）；无活跃市场插件 → undefined = 无贡献。 */
  detailContributorId?: string;
  /** E6#30.10b：plugin-detail 主区贡献视图 renderPath——活跃 marketplace 插件 contributes.views.main[]
   *  "plugin-detail" 声明的 _renderPath。壳 serializeGroups 现场解析盖章；池 ShellViewRenderer 消费：
   *  有 → 动态 import 市场 DetailView，缺/加载失败 → 壳 PluginDetailPoolView 保底。 */
  detailViewRenderPath?: string;
  /** E6#57.13：发行说明标签页的壳→池数据（**壳想、池画**——壳取好挂在这里推下来，池只画）。
   *  ⚠️ 与 `detailPluginId`/`detailViewRenderPath` 同型（壳视图的 per-tab 载荷）——**不是新范式**。
   *  只有 `shellType === "release-notes"` 那一个标签页携带（全窗最多一份）。 */
  releaseNotes?: PoolReleaseNotesData;
  /** E6#57.14：关于标签页的壳→池数据——与 `releaseNotes` **同一条规矩的第二个实例**
   *  （壳视图的 per-tab 载荷，**不是新范式**）。只有 `shellType === "about"` 那个标签页携带。 */
  about?: PoolAboutData;
}

// ── E6#57.13：发行说明标签页的壳→池载荷 ──

/** 左窄栏版本历史的一条——**显示文本已由壳格式化**（显示文本铁律：池拿到什么画什么） */
export interface PoolReleaseNotesHistoryItem {
  /** 版本号（无 v 前缀；显示时的 "v" 是格式不是文案，由池加） */
  version: string;
  /** 短日期 `MM-DD`（壳按 ISO 切出，**不走 locale**——mockup 03 就是这么画的，切换语言不该改它） */
  dateLabel: string;
}

/**
 * 发行说明标签页的壳→池数据——**三态判别联合**（05 §2.4：态由拉取结果唯一决定，没有第四种）。
 *
 * 🔴 **池不做任何判定**：`state` 是什么就画什么分支。连「加载中还是已就绪」这种判断也不许池自己做
 * （那是壳的结论）——`#57.11` 的 context key 推送是同一条规矩的另一处落点。
 *
 * 🔴 **缓存命中不经过加载态**（05 §2.4）：壳在渲染进程持有内存缓存（`useReleaseNotes` 的模块单例），
 * 所以「本次会话第二次打开」与「切换历史版本」都**直接落 `content`**，池的第一帧就有内容——不需要
 * 骨架闪一下。骨架只在**真的一次冷拉取**（本会话第一次，且主进程缓存也没命中）时出现。
 *
 * ⚠️ **三帧对照** = `06-主软件更新/mockups/03-发行说明标签页.html` 的 Frame 3（loading）/
 * Frame 1（content）/ Frame 2（empty）。
 */
export type PoolReleaseNotesData =
  | { state: "loading" }
  | {
      state: "content";
      /** 选中版本（无 v 前缀）——与请求值不一致即「请求的那版不在列表里，已回落最近一版」 */
      version: string;
      /** 头部小标题（壳 `t()` 完）——如「2026 年 8 月 30 日 · 稳定通道」 */
      subtitle: string;
      /** 通道徽标文字（壳 `t()` 完）——「稳定版」。
       *  ⚠️ 数据源是 `/releases/latest`，该端点**按 GitHub 定义不含预发布** ⇒ 恒稳定通道；
       *  将来真加预览通道（改端点）时**这里必须跟着变**，否则徽标开始撒谎。 */
      channelLabel: string;
      /** Release body（GFM 原文）——池过 `MarkdownView`（与插件详情页同一条路） */
      body: string;
      /**
       * 「在 GitHub 查看全部」/「所有版本」的目标——**发行版列表页**（`github.com/O/R/releases`），
       * 不是本次那一版的页面。
       *
       * 🔴 为什么不是 `htmlUrl`（主进程 `ReleaseNotes.htmlUrl` 是单版页）：mockup 03 的**三处**链接
       * （Frame 1 头部 `.rn-actions`「在 GitHub 查看全部 →」、`.rn-all`「所有版本 → GitHub ↗」、
       * Frame 2 `.rn-empty-link`「在 GitHub 上查看 →」）**指的都是列表页**——单版 URL 一个都用不上。
       * 故壳侧改从 `product.updateUrl` 推列表页（`useReleaseNotes.ts` 的 `listPageUrl`），
       * 不往下推 `htmlUrl`。
       *
       * **可选**：拿不到 `updateUrl`（dev 无 `product.json`）⇒ 字段缺席 ⇒ 池**不画**这些链接
       * （空链接比没有链接更糟）。
       */
      listUrl?: string;
      /** 左窄栏历史（倒序，含选中那版） */
      historical: PoolReleaseNotesHistoryItem[];
      /**
       * 首启自动弹横幅的**整句文案**（壳 `t()` 完，含版本号）——`undefined` = 不画横幅。
       *
       * 为什么是「一句话」而不是 `banner: boolean` + 池自己 `t("检测到新版本 {{version}}…")`：
       * 池自产文本这条线在壳视图这里是**不画**的（对标欢迎页——`WelcomePoolView` 的 `t()` 只用于
       * 自己那几张写死的标签）。横幅句子里有版本号 = 有数据，数据文本归壳（同 `subtitle` /
       * `channelLabel`）。顺带：这句话只有壳知道该不该出现（「首启自动弹那一次」是壳的账）。
       */
      banner?: string;
    }
  | {
      state: "empty";
      /**
       * 🔴 **本态只有一个字段**——不是漏写，是**空态无话可传**。
       *
       * mockup 03 Frame 2 上所有的字（副标题「无法连接 GitHub」、左窄栏占位「无本地缓存 /
       * 联网后自动拉取」、正文「无法加载发行说明」＋描述、「重试」）都是**纯静态文案**——
       * 不含任何数据、不随版本/日期/语言之外的东西变，所以按硬约束 2「所有 UI 文字走 `t()`」
       * 归**池侧自己的 `t()`**（池有自己的 i18n 上下文，`WelcomePoolView` 同款）。
       * 壳往下推一份静态中文串，等于把「翻译发生在壳还是池」这件事变成两处。
       *
       * ⚠️ 为什么连「原因」也没有：`ReleaseNotes` 的失败**只有一条**——主进程把错误换成
       * `Error(message)` 上抛，`UpdateLegError.detail.code`（`network` / `rate-limited` /
       * `not-found`）**跨不过 IPC**（`invoke-log.ts` 的 `loggedHandle` 原样 rethrow，Electron 只
       * 序列化 `message`）。所以要分「网络断了」和「GitHub 限流」得先让错误**结构化过 IPC**，
       * 那是主进程/契约侧的事，**不是渲染侧能补的**。本格按 mockup 保留唯一那句通用文案。
       * （同类一条：不画「离线」标注，理由见本文件末尾的 🔴 段。）
       */
      listUrl?: string;
    };

/**
 * 🔴 **本格放弃的一件事，记在这里免得后人来「补」**（E6#57.13 实证）：
 * `ReleaseNotes.source`（`'network' | 'cache'`，`#57.8e` 加的）**分不出**「离线兜底」与
 * 「24h 内的正常命中」——两条路都报 `cache`。所以**不能**据此渲染「离线数据」标注：那会把**最常见**
 * 的情形（24h 内第二次打开）误标成离线。要真做这个标注，得让主进程多回一个「本次是否出过网」的
 * 字段（`ReleaseNotes` 加一维），**不是渲染侧能推出来的**。05 §2.4 的三态表里本来也没有这一态。
 */

// ── E6#57.14：关于标签页的壳→池载荷 ──

/**
 * 关于页字段表的一行。
 *
 * 🔴 **`label` 也归壳 `t()`**——这是本格与 `PoolReleaseNotesData` 唯一的形制差别，理由不是「一致好看」：
 * 关于页的八个标签（版本/提交/日期/Electron/Chromium/Node.js/V8/OS）**没有一个是不依赖数据的框架文字**
 * ——每一行都是「这条数据的名字」，与 `channelLabel`（「稳定版」＝数据所在通道的名字）同类。
 * 而池的界线是**「含数据的文本壳推，纯框架文字池写」**（`ReleaseNotesPoolView` 头注）：
 * 池自产的应当是 `t("复制")`/`t("检查更新…")` 这种**不含任何字段名**的 chrome。
 *
 * 附带收益（06 §4.2 承诺的「字段可扩展 = 零架构改动」由此成真）：加一个字段 = 壳侧数组加一项，
 * **池侧一个字都不用改**——池只知道「给我几行就画几行」，不知道也不需知道「版本」是什么意思。
 * 反之若池自持标签表，加字段就得壳池两处同改，且两处的顺序随时可能漂移。
 */
export interface PoolAboutField {
  /** 字段名（壳 `t()` 完）——如「版本」「Electron」 */
  label: string;
  /** 字段值——原样展示，壳不加工（`app.getVersion()` 的**纯**版本号，不带 VS Code 那种 `(user setup)` 后缀） */
  value: string;
}

/**
 * 关于标签页的壳→池数据——**两态判别联合**（06 §4.2 的布局无第三态）。
 *
 * 🔴 **池不做任何判定**（同 `PoolReleaseNotesData`）：`state` 是什么就画什么分支。
 *
 * ⚠️ **为什么没有 `empty`/`error` 态**：关于页的数据来自**本机主进程**（`app:getProductInfo` 读
 * `product.json` + `process.versions`），不是网络——`electron/product.ts` 的 `loadProduct()` 缺失即
 * 兜底、**永不抛**（commit/date 落 `—`，06 §4.4）。所以「取不到」这一态在主进程侧已被消化成
 * 「值为 `—` 的 content」，渲染侧不需要第二个降级面。壳侧只在 `getShellExposed()` 拿不到
 * （非 Electron 环境，池视图本就不会被渲染）时兜底成同一形状的 `content`，**不让池停在骨架**。
 *
 * ⚠️ **两帧对照** = `06-主软件更新/mockups/02-更新通知与关于.html` 的 Frame 6（content）；
 * `loading` 无 mockup 帧——它是**一帧的过渡**（数据来自本机 IPC，非网络），骨架形状照 content 画
 * 以免跳位（`ReleaseNotesPoolView.LoadingFrame` 同款取舍）。
 */
export type PoolAboutData =
  | { state: "loading" }
  | {
      state: "content";
      /** 品牌名——`product.nameLong`（唯一真相源在 `electron/product.json`，不写死在视图里） */
      name: string;
      /**
       * 品牌标 URL——壳 `getAssetPath("assets/logo.svg")` 解析后推下来（**与 `titleBar.logoUrl`
       * 同一个资产、同一条规矩**：池不 import core，资产路径一律壳解析）。
       *
       * 🔴 **本字段是「照验收图实现」时的一处有据偏离**：mockup Frame 6 的 `.about-logo` 手画了一个
       * 圆角蓝方块 + 白方块（纯示意）。真资产 `public/assets/logo.svg` 是圆角蓝方块 + 「LD」，
       * 且该文件自己的头注写着「**替换此文件即可更换 logo，无需改代码**」——
       * 若此处手画一个方块，那句注释对本页就是假话，且同一个软件里会出现两个互相矛盾的「LinkDesk 标志」
       * （标题栏一个、关于页一个）。故改用真资产：**品牌标全仓只有一个文件、一处规则**。
       */
      logoUrl: string;
      /** 字段表——顺序即渲染顺序，壳定 */
      fields: PoolAboutField[];
    };

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
  /**
   * E6#57.10：菜单内二级分组名——渲染层按它切分隔线（ContextMenu 语义：相邻不同 group 之间出一条线）。
   * 有值才序列化（无分组 = 兜底 `__default` 一组，不画线）。显示文本铁律：池只比字符串，不解释语义。
   * ⚠️ 子菜单 children 上的 group 会被 ContextMenu 换成父项 group（mapChildren 语义）——
   * 分组只在**顶层菜单项**上生效。
   */
  group?: string;
  /** 快捷键显示文本——formatKeyLabel 后。仅汉堡（showKeybindings）；titlebar 下拉无快捷键（同壳行为） */
  shortcut?: string;
  /** E5.8#148：当前项 √（显隐勾选菜单）——壳 buildTitleBarMenuGroups/汉堡经 resolveVisibilityChecked
   *  序列化（zone 可见 = ✓）。显示文本铁律：池哑渲染原文，壳只推布尔。 */
  checked?: boolean;
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
  /** codicon 类名或图片路径——**与 `label` 互斥**：有 label 时池渲染文字按钮，本字段被忽略 */
  icon?: string;
  /** tooltip——壳侧已 t()（命令自报 title，回退 command id） */
  title: string;
  /**
   * E6#57.11：按钮文字——**壳侧已解析完的最终字符串**（`$` context key 引用已取值、
   * 静态字面量已过 `t()`）。池是哑渲染：拿到什么画什么，不评估、不翻译、不认 `$`。
   * 有这个字段 ⇒ 渲染全文字按钮；没有 ⇒ 走 icon 那支。
   */
  label?: string;
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
  /** 窗口控件 tooltip——显示文本铁律：壳 t() 解析后推送（E5.8#46.18：pin/unpin 置顶两态） */
  windowControls: { minimize: string; maximize: string; restore: string; close: string; pin: string; unpin: string };
}

/** 池侧图标——壳序列化（池不 import pluginLoader，Lucide 名由池映射组件渲染）。
 *  图标栏 + 标签栏共用（E6#69f 标签栏视图标签 / #69g 文件标签走同一联合） */
export type IconBarIcon =
  | { kind: "lucide"; name: string }              // E5#100 Lucide 优先
  | { kind: "codicon"; name: string; color?: string } // codicon CSS 类（可选每图标色——文件图标主题数据，E6#69g）
  | { kind: "img"; src: string }                  // linkdesk:// 协议 URL / data URI
  | { kind: "emoji"; text: string };              // 回退 emoji

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
  // ── E5.7#21 + #37.5：拖拽钳制界——#13 同款（壳 LayoutEngine dock 声明推送，池零硬编码）。
  //   轴感知：横带（edge∈{bottom,top}）用 minHeight/maxHeight；竖条（edge∈{left,right}）用 minWidth/maxWidth。 ──
  minHeight?: number;
  maxHeight?: number;
  /** 🆕 E5.8#37.5：竖条面板（左/右）拖拽最小/最大宽——壳 dock.minWidth/maxWidth 推送 */
  minWidth?: number;
  maxWidth?: number;
  /** E5.7#63.7：[+] 按钮 tooltip——壳 t("新建面板视图") 推送（显示文本铁律；壳无 panel:createView 监听 = 安全 no-op） */
  createTooltip?: string;
  /** E5.8#34：容器切换器下拉 DTO——按容器分组列全部视图（含隐藏），mockup 帧 2 */
  switcher?: PanelSwitcherGroup[];
  /** E5.8#34：空态占位主文本——全隐藏 / 无贡献视图时壳 t() 推送 */
  emptyText?: string;
  /** E5.8#34：空态占位指路——同 emptyText 壳 t() 推送 */
  emptyHint?: string;
  /** 🆕 E5.8#45：面板可脱出（PanelZone ⤢ 按钮显隐）——true 时渲染脱出按钮，点击 emit "panel:detach"（壳 detachPanel 接）
   *  ——脱出后漂移面板窗独占渲染本面板（主区空占位 I9-13），drift 窗内置 false（面板已在外，无需再脱出） */
  detachable?: boolean;
  /** 🆕 E5.8#45：⤢ 按钮 tooltip——壳 t("面板独立窗口") 推送（显示文本铁律） */
  detachTooltip?: string;
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
  /** 自绘状态栏组件 marker——插件声明 appearsIn.statusBar 的归一化 URL（E6#62d：loader 注册时
   *  算 ViewPluginEntry.statusBarRenderPath，壳读此发 marker）→ 池按 URL 直动态 import（serial-monitor 连接灯）。
   *  有值 = 自绘组件取代该插件全部静态项；无 = 普通条目。 */
  componentRenderPath?: string;
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
  /** E6#72c：进度类通知——池据此画 3px 进度行（缺省 = 非进度通知，不画）。
   *  progress 由壳 toast 存储直通（pushToast/updateToast 的 progress 旗标）。 */
  progress?: boolean;
  /** E6#72c：确定态百分比 0-100——有值画定宽填充，无值画不定态扫动（对标 E3e 原版语义）。
   *  池侧渲染时自行钳位（壳不作保证——契约宽容，畸形值不撑破布局）。 */
  percent?: number;
}

/** 通知分组——壳 NotificationCenter buildSourceGroups（source 第一段归类 + 未读排序） */
interface NotifGroup {
  key: string;
  /** source 第一段或 t("其他") */
  label: string;
  unread: number;
  items: NotifItem[];
  /** E6#73f（S3/A6）：本组因超过「每来源 5 条」上限被淘汰折叠掉的**说明文案**（壳侧 t() 已解析，
   *  池哑渲染——同 timeLabel/sourceLabel/clearLabel 的「显示文本铁律」）。
   *  缺省 = 没折叠过（契约宽容——旧快照/测试替身不填此字段时行为不变，不渲染该行）。 */
  foldedLabel?: string;
}

/**
 * E6#73d：安装 job 的行——面板「进行中 / 等待安装中」两段的**唯一**行形状（18 档 §五 I.4）。
 *
 * **为什么结果区不在这里**：安装终态（成功 / 失败 / 已安装但缺依赖）由既有的 toast 发声
 * （成功 = lifecycle 消费端唯一口，失败 = settle 失败 toast 带 [重试]，见 73h/73e），
 * 结果区仍按来源分组（`NotifGroup`）。job 行只在「还没有结果」的两段里出现——
 * 一条安装永远只在一处可见，不会「装了两遍」。
 */
interface NotifJobRow {
  /** 行 key——jobId（**不是**显示名：同名不同插件要能区分，18 档 §七 73d 行）。 */
  id: string;
  pluginId: string;
  /** 显示名（壳侧解析：调用方带入，或解压后从包内 manifest 回填） */
  name: string;
  /** 状态字形 codicon 类串（⟳ 进行中 / ○ 等待中） */
  iconClass: string;
  /** 右端状态短语（壳 t() 已解析，如「下载中 62%」「等待安装中」）——池哑渲染 */
  statusLabel: string;
  /** 下载段有真值才有 → 池画 3px 确定态进度条；缺省不画（同 NotifItem.percent 语义）。 */
  percent?: number;
  /** 本行能不能取消——true 时池渲染 [取消安装] 按钮 */
  cancellable?: boolean;
  /** [取消安装] 按钮文案（壳 t()） */
  cancelLabel?: string;
}

/** E6#73d：安装 job 段——面板固定三段里前两段的容器（顺序永不重排，§五 I.4） */
export interface NotifSection {
  /** "running" | "queued"——段身份（池不做判别，只当 key 用） */
  key: string;
  /** 段标题（壳 t()，如「3 项进行中」「另有 4 项等待安装中」） */
  label: string;
  items: NotifJobRow[];
  /** 段内超出「每段 5 条」被折叠的说明（壳 t()）——缺省 = 没折叠过 */
  foldedLabel?: string;
}

/** 通知中心数据——壳侧序列化（未读计数/文案/分组全壳侧完成） */
export interface NotifLayout {
  unread: number;
  /** 铃铛 tooltip——t("{{count}} 条通知") / t("通知") */
  bellTitle: string;
  panelTitle: string;
  /** E6#73a：头部「清除已完成」按钮文案——只清**已出结果且已读**的旧消息，面板不关、进行中的一条不碰。 */
  clearLabel: string;
  /** E6#73a：头部「最小化」按钮文案——关闭面板的**唯一**动作（语义 = 收起，什么都不丢）。 */
  minimizeLabel: string;
  emptyLabel: string;
  dismissTitle: string;
  /** E6#73d：头部摘要（「3 项进行中 · 另有 4 项等待安装中」）——**没有安装 job 时缺省不渲染**。
   *  ⚠️ 只报**进行中 / 等待中**两个数：不写「已完成 N/M」——装了没有不由进度条消失来判定
   *  （18 档 §七 73d 行明令）。 */
  summaryLabel?: string;
  /** E6#73d：安装 job 两段（进行中 → 等待安装中），固定序排在结果区之前。
   *  缺省 = 没有在途安装（契约宽容——旧快照/测试替身不填此字段时行为不变，不渲染这两段）。 */
  sections?: NotifSection[];
  /** E6#73d：第三段固定标题「已有结果」（§五 I.4 三段永不重排）。
   *  结果**行**不在这里——它们是既有的按来源分组的 toast（见 NotifJobRow 注释）；
   *  本字段只提供那一区上方的固定标题。缺省 = 没有安装活动（不渲染该标题，避免纯通知场景凭空多一行）。 */
  resultLabel?: string;
  /** 第三段标题右端的计数（「1 项失败 · 3 项已完成」）——数**安装 job 的终态**，不是数面板上的行：
   *  行会被 TTL 收走/被来源折叠，用它计数会让摘要随无关动作跳变（18 档 §五 I.4 的样例即此计数）。 */
  resultSummary?: string;
  groups: NotifGroup[];
  /** E6#72d：自动展开请求——壳判定「存在重要且未读的通知，且面板当前是关着的」时为 true。
   *  池侧只做 **false→true 边沿触发**（置面板为开），true 持续期间不反复动作；
   *  缺省 = 不自动展开（契约宽容——旧快照/测试替身不填此字段时行为不变）。 */
  autoOpen?: boolean;
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
 * titleBar 必有（窗口 chrome——池恒渲染）；iconBar/sidebar/statusBar/panel/rightSidebar 可选——
 * 主池恒推全量，脱出窗（E5.8#43-2 窗口模式策略表）只推 titleBar+groups 子集（池按字段条件渲染，无空列/空条）。
 */
export interface PoolLayout {
  version: 2;
  titleBar: TitleBarLayout;
  /** 图标栏——缺省 = 池不渲染该 zone（脱出窗子集；主池恒推） */
  iconBar?: IconBarLayout;
  /** 侧栏——缺省 = 池不渲染该 zone（脱出窗子集；主池恒推） */
  sidebar?: SidebarLayout;
  /** E5.8#36.8：右侧栏真 zone 布局——RightSidebarLayout（edge 反推 = sidebar 对边，不携带自身 edge） */
  rightSidebar?: RightSidebarLayout;
  groups: PoolGroup[];
  /** E5.8#30.15（P5）：聚焦面板 id——点面板空白/点标签设置（壳 reduceFocusGroup/FocusTab）。
   *  池侧消费：accent 聚焦环 + isActive 单聚焦判定（tab.id === activeTabId && group.id === activeGroupId）。 */
  activeGroupId?: string;
  /** E5.6#16.7：递归分屏树——MainRenderer 递归渲染，替代平铺 groups.map。
   *  leaf = 单 GroupPane，branch = 水平/垂直 flex 容器。 */
  root?: SplitNode;
  /** E5.6#16.7k-3：可创建为标签页的视图列表——池 GroupTabBar [+] 按钮动态菜单。
   *  空数组 = [+] 不提供创建菜单（脱出窗 I9-6）；缺省 = 池兜底欢迎页 */
  creatableViews?: CreatableViewMeta[];
  panel?: PanelLayout;
  /** 状态栏——缺省 = 池不渲染该 zone（脱出窗子集；主池恒推） */
  statusBar?: StatusBarLayout;
}
