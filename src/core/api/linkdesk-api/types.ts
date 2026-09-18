/**
 * linkdesk-api 类型域——自 linkdesk-api.ts 拆出（E5.8#0d.10-9a）。
 * 独立类型接口（非 LinkDeskAPI 成员）：LinkDeskCommand/LinkDeskTheme/LinkDeskLanguage/LinkDeskConfigSchema/
 * PluginListEntry/PluginInstallResult/PluginInfoEntry/PluginListSubset/EnvInfo/FileDecoration/
 * FileDecorationProvider/MenuItemDescriptor/NotificationHandle/PluginToastAction 14 接口 verbatim。
 * DialogOpenOptions 保路径 re-export 留在聚合器（../../types/ipc/dialogs）。
 * 依赖方向：types → ../types（PluginManifest）；被 10 个命名空间域文件 import（依赖基座，无反向）。
 */

import type { PluginManifest } from "../types";
import type { ThemeSurface, ThemeBackground } from "../../services/ui/ThemeEngine";
import type { ThemeDomain } from "../../types/theme";

export interface LinkDeskCommand {
  id: string;
  title: string;
  category?: string;
}

export interface LinkDeskTheme {
  name: string;
  type: "dark" | "light";
  /** E5.8#50.6：玻璃/悬浮质感——主题 JSON `surface`（缺省 = 无玻璃无悬浮） */
  surface?: ThemeSurface;
  /** E5.8#50.6：图片背景——主题 JSON `background`（缺省 = 无图） */
  background?: ThemeBackground;
  pluginId?: string;
}

export interface LinkDeskLanguage {
  id: string;
  label: string;
  pluginId: string;
}

/** E5.8#50.18：配色变体元数据——theme.listRecipes() 返回（colorways[] 元素，06 §2）。
 *  预览色供 ThemePicker 卡片取色；单配色配方 = 1 项。 */
export interface ColorwayMeta {
  /** 配色变体 id——全局唯一（theme.setColorway 入参；app.themeColor 动态 enum 存此） */
  id: string;
  /** 配色显示名 */
  name: string;
  /** 预览色——强调色 + 窗口背景（卡片徽标取色用；缺省配色无该 token → 空串） */
  preview: { accent: string; bgWindow: string };
}

/** E5.8#50.18：配方元数据——theme.listRecipes() 返回（全部可用配方 + 配色变体 + 预览色，06 §2）。
 *  domains = 该配方贡献哪些域（混搭来源过滤依据，10 §2）；type = 明暗类别。 */
export interface RecipeMeta {
  id: string;
  name: string;
  type: "light" | "dark";
  colorways: ColorwayMeta[];
  domains: ThemeDomain[];
}

/** 配置 schema 中的单个属性定义——E5.8#41.14 🛤 补全 uiHint/minimum/maximum/renderHint/dependsOn
 * （壳 SettingsView renderControl/SettingRow 官方控件切换 + 依赖显隐字段，与 SettingsView/types ConfigProperty 对齐） */
export interface LinkDeskConfigProperty {
  type: string;
  default?: unknown;
  description?: string;
  enum?: string[];
  enumDescriptions?: string[];
  /** 控件提示——uiHint 优先：plugin.json 声明式控件选择（renderControl 读它切 combobox/textarea/color 等） */
  uiHint?: string;
  /** 数值下限——uiHint 数值控件 min 校验 */
  minimum?: number;
  /** 数值上限——uiHint 数值控件 max 校验 */
  maximum?: number;
  /** 渲染提示——renderControl 第二判据（"action" 渲染操作按钮 / "color" 渲染色块预览） */
  renderHint?: string;
  /** 等宽限定——仅 uiHint "fontFamily" 有意义。true/缺省 = 只列等宽族（编辑器字体）；false = 全字族（UI 字体）。E5.8#50.20 */
  monoOnly?: boolean;
  /** 依赖条件——本项仅在 dependsOn.key 配置值 === value 时显示（SettingRow 读它显隐整行） */
  dependsOn?: { key: string; value: unknown };
  /** 动态下拉数据源——uiHint "select" 时读取（渲染时调 theme.listRecipes() 动态取，E5.8#50.23）。
   *  "theme.colorways" = 活动配方（app.theme）配色变体（选项带预览色块）；
   *  "theme.sources" = 混搭来源（按 optionsFromDomain 过滤 RecipeMeta.domains）。 */
  optionsFrom?: string;
  /** 混搭来源域过滤——optionsFrom "theme.sources" 时按此域过滤 RecipeMeta.domains（10 §2 六域） */
  optionsFromDomain?: ThemeDomain;
  /** E5.8#50.26：renderHint "action" 按钮动作——点击执行此壳命令（第三方设置 UI 经 commands.executeCommand 触发） */
  actionCommand?: string;
  /** E5.8#50.26：renderHint "action" 按钮禁用条件——全部 {key,value} 匹配当前配置值时禁用 */
  actionDisabledAll?: Array<{ key: string; value: unknown }>;
  /** E5.8#78：组内二级标题——SettingsView 把同 group 的 key 归到子标题下渲染；无 group 保持平铺（零侵入） */
  group?: string;
  /** E5.8#77：数值单位——uiHint "slider" 值标签单位（"×" / "px"；空 = 裸数值） */
  unit?: string;
}

/** 配置 schema——key → 属性定义（index signature 保持现有消费方） */
export interface LinkDeskConfigSchema {
  [key: string]: LinkDeskConfigProperty;
}

/** 配置贡献条目——configuration.getConfigurationContributions() 返回形状（E5.8#41.14 🛤 命名）。
 * 与壳 ConfigurationRegistry 组装的 [pluginId, { title, properties }] 对齐——第三方设置 UI 不再 need cast */
export type LinkDeskConfigurationContribution = [string, { title: string; properties: Record<string, unknown> }];

/** 发现条目——plugins.listAll() 返回（E6#9a：主进程直扫 plugins/ 全子目录，替代渲染进程 import.meta.glob）。
 *  打包/市场安装的插件不在源码树——glob 发现不了；listAll 以磁盘为唯一真源，dev/prod 同一面。
 *  完整 manifest 为纯 JSON 数据（IPC 可序列化），statusBar/contributes 等随 manifest 携带
 *  （#9b：statusBar 入口由消费方从 manifest.statusBar 派生，无需单独通道）。 */
export interface PluginDiscoveryEntry {
  pluginId: string;
  /** manifest.entry——插件 JS 入口（无 = 纯贡献插件，只有 manifest 无组件） */
  entry?: string;
  /** 完整 plugin.json */
  manifest: PluginManifest;
  /** E6#7（1.2-4）：目录含 index.bundle.js = SDK 打包的 .linkdesk-plugin 解压产物。
   *  磁盘格式事实（非插件身份——硬约束 11）；bundle 插件 JS 入口恒 index.bundle.js（runtime 分支依据）。 */
  bundle?: boolean;
  /** E6#7（1.2-4）：磁盘位置事实——home = 代码根（app = 只读 app 插件根 / userData = {userData}/plugins 用户安装家）。
   *  subdir = 2026-09-05 塌平单根后恒 null（平铺树 root-direct 扫描不产出子目录；类型保留 null 供下游空安全）。 */
  origin?: { home: "app" | "userData"; subdir: string | null };
}

/** E6#7（1.2-4）：plugins.resolveEntry() 返回——resolvePath 的兄弟（discovery 族，非安装 handler）。
 *  pool/运行时按 { root, entry } 拼 dev /@fs 与 prod linkdesk:// 两种 URL。 */
export interface PluginEntryInfo {
  /** 插件目录绝对路径（正斜杠）；插件不存在 = null */
  root: string | null;
  /** 入口文件名——bundle → "index.bundle.js"；源码 → manifest.entry（缺省 "src/index.tsx"）；无 = null */
  entry: string | null;
  /** 目录是否含 index.bundle.js（bundle 格式事实） */
  bundle: boolean;
}

/** 插件列表条目——pluginManager.list() 返回（主进程序列化后的 manifest 子集）。
 *  E5.7#98：Partial<PluginManifest> 过宽（component 等字段 IPC 不可达）——收窄为
 *  IpcBridgeHandler.handlePluginsCall "list" 分支实际序列化的 7 字段，marketplace 消费。
 *  E5.8#15.5：pendingReason——缺依赖挂起原因（"等待依赖: xxx"）；无挂起 = undefined。
 *  有值 = 插件已安装但依赖未就绪（PENDING），列表/详情显示等待状态。 */
export interface PluginListEntry {
  pluginId: string;
  manifest: PluginListSubset;
  /** 缺依赖挂起原因——marketplace 显示 PENDING 徽标 + 详情提示条（E5.8#15.5） */
  pendingReason?: string;
  /** E6#73j（G6）：该插件**住哪**——`true` = 在用户安装家（`{userData}/plugins`），可被下载来的新包替换。
   *  `false` = 只读 app 根（随包发货件 / 目录源安装的插件）——更新流对它必然抛「不在用户安装区」，
   *  市场**不得**渲染「更新到 vX」（那是点下去必失败的死钮，含 8 只官方随包插件在内）。
   *  判据唯一源 = `isPluginUpdatable`（磁盘住所事实，非插件身份——硬约束 11）。 */
  updatable?: boolean;
}

/** E5.7#81：安装结果——success:false 时 error 为中文失败原因（校验 / 版本冲突 / 复制失败）。
 *  安装进度事件：events.on("plugin:installProgress", ({ stage, pluginId, message }) => ...)
 *  stage: validating | copying | loading | done | error
 *  E5.7#83：装卸广播（壳 loader → 唯一 Pool）：
 *  events.on("plugin:installed", ({ pluginId, version, reason }) => ...) reason: install | reinstall
 *  events.on("plugin:uninstalled", ({ pluginId, reason }) => ...) reason: uninstall */
export interface PluginInstallResult {
  success: boolean;
  pluginId?: string;
  version?: string;
  needRestart?: boolean;
  error?: string;
  /** E6#73q（18 档 §五 I.6⑦）：第三类终态——**已安装但缺依赖**（装上去了，插件在列表里，但不可用）。
   *  为真时 success 也是 true（文件真落盘了），但消费方**不得渲染成「✓ 已安装」**——那是撒谎。
   *  job 行显示「已安装但缺依赖：{名}」。 */
  parked?: boolean;
  /** E6#73d：用户在面板上点了「取消安装」——**不是失败**（`success` 为 false 只是「没装成」）。
   *  消费方据此**不得**走失败分支（不弹错误 toast、不推 [重试]、不打红行）——用户主动叫停已表明意图，
   *  再报一次错等于拿用户自己的决定去吓他。job 行由队列侧**整条撤掉**（不渲染 ✗）。 */
  cancelled?: boolean;
}

/** E6#73q：安装请求侧身份——job 表按 pluginId 去重、job 行要显示名，而两者都只有池侧知道
 *  （显示名今天只存在于池侧目录 store，壳拿不到）。
 *  jobId **不在这里**：它是壳侧 job 表的产物（单一生产者），池侧从 `plugin:installJobs` 广播里认领。 */
export interface PluginInstallRequestOpts {
  /** 账本来源（add 的 source）；缺省 user */
  ledgerSource?: "user" | "marketplace";
  /** 插件 id——job 表去重键 + 广播载荷的 pluginId；池侧目录条目已知者传入 */
  pluginId?: string;
  /** 显示名——job 行文案；不传则退化为 pluginId */
  displayName?: string;
  /** job 出身——行 = 一次用户动作（user，缺省）；插件拖来的依赖（dependency）藏在那一行里 */
  origin?: "user" | "dependency";
}

/** E6#73c：安装进度的 job 身份——壳侧 `installPlugin` 调主进程 fs/net 段（download/extract）时随行，
 *  主进程段据此把 `plugin:installProgress` 事件回填到**具体的 job/插件**（18 档 §五 I.6③ 的「事件侧回填」）。
 *  此前下载/解压段的事件**不带任何身份**，多单并行时百分比互相灌进同一行；N=1 时靠「归活跃会话」侥幸正确。
 *  `jobId` 是壳侧 job 表的产物（单一生产者，见 install-queue.ts）——主进程只透传，不生成、不持久化。 */
export interface PluginInstallJobRef {
  jobId: string;
  /** 池侧请求已带 id 时同带——下载段靠它把进度归到具体插件（待解压才知 id 的包流只有 jobId） */
  pluginId?: string;
}

/** E6#11c/#13b（段 B）：更新结果——PluginInstallResult 的更新扩展。
 *  upToDate = catalog 直答已是最新（success:true 但非"更新发生"——UI 显示"已是最新"非红错误）；
 *  currentVersion 随行供 toast/日志显示 v旧→v新。needRestart 恒 true（bundle 模块缓存需重启激活）。 */
export interface PluginUpdateResult extends PluginInstallResult {
  /** 更新前磁盘版本 */
  currentVersion?: string;
  /** 查目录后已是最新（本次无替换发生） */
  upToDate?: boolean;
}

/** E6#13b（段 B）：pluginManager.checkUpdates 返回——主进程 fetch catalog + semver 对比（壳传 current，壳是账本/磁盘 owner） */
export interface PluginUpdateCheckResult {
  current: string;
  latestVersion: string;
  downloadUrl?: string;
  update: boolean;
}

/** 禁用/卸载列表条目——loader getDisabledPluginInfo/getUninstalledPluginInfo 序列化形状（PluginListSubset 的再子集）
 *  E6#30.5b：core 旗标透传——list() EXCLUDES 禁用插件，禁用态详情页卸载钮守 E6#18「core:true 详情页不画」
 *  只能经此拿到 core（缓存 manifest 内取值，纯新增可选字段零回归）。
 *  E6#106：+ 图标四字段（icon/iconSource/marketIcon/marketIconSource）——**同 #65a 给 list() 补图标通道的
 *  同一先例**。禁用行此前只能退到目录条目取图，而目录条目的图标已改绝对 URL（未装态形态）⇒ 禁用行
 *  （明明插件还在盘上）会静默改拉远程图，断网即裂。补通道后裁决序与其它位统一：已装优先 → 目录 → 默认块。
 *  未安装列表（getUninstalledPluginInfo）**不补**：插件已不在盘上，本地无图可读，目录条目本就是唯一来源。 */
export interface PluginInfoEntry {
  pluginId: string;
  name: string;
  description?: string;
  version?: string;
  core?: boolean;
  /** E6#73j（G6）：同 `PluginListEntry.updatable` 的住所判据——禁用**不改住所**（disable 只记名单，
   *  目录原地不动）⇒ userData 家的禁用插件照样可更新，app 树的则否。 */
  updatable?: boolean;
  /** E6#106：界面小图标（Type-1 剪影 for 图标栏插件 / Type-2 身份图 for 其余） */
  icon?: string;
  iconSource?: "codicon" | "svg" | "url" | "lucide";
  /** E6#106：插件身份彩色图（Type-2）——行/详情展示位的第一候选 */
  marketIcon?: string;
  marketIconSource?: "codicon" | "svg" | "url" | "lucide";
}

/** list() 的 manifest 序列化子集——与 handlePluginsCall "list" 投影字段对齐
 *  E6#30.5e/30.6c3：声明依赖 id 列表（manifest.requires 透传）——marketplace 判缺依赖 + 依赖/被依赖行
 *  数据源（dependencies.ts 引擎只壳内；消费经 list() 投影）。无 requires = undefined。
 *  E6#65a（14 档案批次一）：+ icon/iconSource——市场行/详情图标的数据通道（注释自认的"7 字段对齐"
 *  原取舍现在市场要图标，属同通道需扩，见 IpcBridgeHandler/pluginManager.ts list 投影同步）。 */
export interface PluginListSubset {
  name?: string;
  description?: string;
  version?: string;
  core?: boolean;
  author?: string;
  statusBar?: PluginManifest["statusBar"];
  contributes?: PluginManifest["contributes"];
  requires?: string[];
  // E6#65a（14 档案批次一数据通道）：icon/iconSource 透传——市场拿到插件图标
  // （行/详情 PluginIcon 渲染的唯一 manifest 数据源；无图标 = undefined → 消费端默认图兜底）。
  // 与 E5.8#37.9.1 同构：list() 子集继续只挑 UI 消费字段，不整 manifest 过 IPC。
  icon?: PluginManifest["icon"];
  iconSource?: PluginManifest["iconSource"];
  // E6#67（14 档案批次二·五）：marketIcon/marketIconSource 透传——市场展示图（cover art）数据通道。
  // 市场消费「marketIcon ?? icon」在 marketplace 层 pick（壳界面只读 icon，故 list 一并透传两对）；
  // 无 marketIcon = undefined → 市场回退 icon，再空 → 默认封面。
  marketIcon?: PluginManifest["marketIcon"];
  marketIconSource?: PluginManifest["marketIconSource"];
}

/** E6#78：插件磁盘位置——市场详情页「打开所在位置 / 数据位置」两行的数据源。
 *  主进程解析（池内**零**安装路径知识——渲染侧只拿结果，不拼路径）。 */
export interface PluginDiskLocation {
  /** 插件目录绝对路径（正斜杠——与 `plugins.resolvePath` 同规；消费端用作链接 tooltip，不自行拼接） */
  installDir: string;
  /** 插件数据目录——**只有该插件真有数据时才非空**（目录不存在或空 → null）。
   *  与 VS Code 详情页「缓存」行同判据（`computeSize` 后 `if (!cacheSize) return`——空则整行不显示）：
   *  纯 UI 插件恒 null，**不是人人都有**，故不造空行。 */
  dataDir: string | null;
}

/** E6#78：`shell.openPluginFolder` 的两枚落点——安装目录 / 数据目录 */
export type PluginFolderKind = "install" | "data";

/** 环境信息——env.get() 返回（主进程 env-handlers 组装） */
export interface EnvInfo {
  appDataDir: string;
  pluginsRootDir: string;
  appPluginsDir: string;
  /** E6#7（1.2-4）：用户安装包代码根 {userData}/plugins——.linkdesk-plugin 解压家（与 appPluginsDir 只读根分开） */
  userPluginsDir: string;
  pluginDataDir?: string;
  pluginCacheDir?: string;
  pluginExportsDir?: string;
}

/** 文件装饰——E5.7#60 池内本地注册表。形状对标插件 API 契约 §3.24 */
export interface FileDecoration {
  badge?: string;
  tooltip?: string;
  color?: string;
  propagate?: boolean;
}

/** 文件装饰提供方——插件注册（registerProvider）。同步查询契约：跳过返回 Promise 的 provideDecoration */
export interface FileDecorationProvider {
  provideDecoration(uri: string): FileDecoration | null | undefined;
  onDidChangeFileDecorations?(cb: (uris: string[]) => void): () => void;
}

/** 菜单项描述——menu.getItems() 返回（壳侧 when 过滤 + t() 翻译 + 快捷键解析后） */
export interface MenuItemDescriptor {
  command: string;
  label?: string;
  group?: string;
  order?: number;
  when?: string;
  /** 壳侧解析后的命令标题（E5.7#14 显示文本铁律） */
  title?: string;
  /** 已解析快捷键 "ctrl+shift+p" 形式 */
  shortcut?: string;
  /** E5.8#37.7：当前项 √ 标记（单选语义——壳侧 getItems 动态解析，VS Code 菜单当前项同款）。
   *  位置/对齐子菜单（当前 edge/align 命中项）+ #37.7.1 视图显隐列表（visible 视图项）共用。 */
  checked?: boolean;
  /**
   * E5.8#37.7.1：每项命令载荷——动态菜单项（如面板视图显隐清单）携带数据传给命令 handler。
   * ContextMenu 的 context 是整菜单共享的（非 per-item），per-item 身份（如 containerId+viewId）
   * 必须走命令载荷：executeCommand(id, undefined, ...commandArgs, context) → 壳 handler 收 args
   * = [...commandArgs, context]。池哑渲染原文透传，不解释内容。
   */
  commandArgs?: unknown[];
  children?: Array<string | MenuItemDescriptor>;
}

/** 进度通知句柄——progress=true 时 show() 返回 */
export interface NotificationHandle {
  /** 更新进度消息 + 可选进度百分比（E6#71i：0-100 确定条；不传 = 不定态动画照常推消息） */
  update(message: string, percent?: number): Promise<void>;
  /** 完成——关闭进度通知，可选弹完成 toast */
  finish(message?: string): Promise<void>;
  /** 取消——直接关闭，不弹完成 toast */
  cancel(): Promise<void>;
}

/** 通知主动作按钮描述（E6#13.5 缝隙 K1）——插件 notifications.show 传 actions，
 *  经 IPC 序列化到壳；点击时壳 executeCommand(command, args) 真执行。
 *  对标 VS Code `INotificationAction`（命令面）。按钮文案 = 最终显示文本，壳不二次翻译。 */
export interface PluginToastAction {
  /** 动作 id——插件侧标识（同一通知内唯一）；点击回执按位置序号，id 仅供调试/日志 */
  id?: string;
  /** 按钮文案（最终显示文本） */
  label: string;
  /** true → 主按钮（accent 色）；false/未设 → 次级文本按钮 */
  isPrimary?: boolean;
  /** 点击执行的命令 id——壳 executeCommand(command, args)。命令 handler 由插件自注册
   *  （window.linkdesk.commands.registerCommand）。无 command → 按钮点击仅关闭 toast（无副作用） */
  command?: string;
  /** 透传给命令 handler 的 ...args */
  args?: unknown[];
}

/** 兼容读数请求（E6#117）——plugins.getCompatibility 入参：插件身份 ＋ 目录侧事实（未装插件由
 *  调用方从 catalog 条目供给；已装插件以磁盘 manifest 为生效值，主进程覆盖） */
export interface PluginCompatibilityRequest {
  pluginId: string;
  /** 插件要求的最低壳版本（catalog 条目携带；未装插件的唯一来源） */
  minAppVersion?: string | null;
  /** 插件最后发版日（catalog `publishedAt`，ISO） */
  publishedAt?: string | null;
}

/** 兼容读数（E6#117）——状态算法单点在壳 `src/core/compat/compatibility.ts`；本面只给机器态，
 *  ⛔ 不携带任何用户可见句子（用户面文案归市场插件 i18n，用户面词表见 00 号档 §〇d） */
export interface PluginCompatibilityReading {
  pluginId: string;
  /** 五态（与用户面五词固定对应，对应表住在 compatibility.ts 头注） */
  state: "current" | "compatible" | "drifted" | "incompatible" | "unknown";
  /** 悬空读数；null = 拿不到（未装 / 目录读不了）——缺数据 ≠ 有问题 */
  dangling: { count: number; names: string[] } | null;
  /** 生效的最低壳版本（已装 = 磁盘 manifest；未装 = 调用方供给）；没有 ⇒ null */
  minAppVersion: string | null;
  shellVersion: string;
  /** minAppVersion 缺失/非法 ⇒ null（没得比）；false ⇒ state = "incompatible" */
  minAppSatisfied: boolean | null;
  /** 插件最后发版日（YYYY-MM-DD）；catalog 拿不到 ⇒ null */
  lastUpdate: string | null;
  /** 当前壳构建日（YYYY-MM-DD）；dev 占位 ⇒ null */
  shellBuiltAt: string | null;
  /** 哪些输入缺失（诊断面；state = "unknown" 时非空） */
  unknown: string[];
}
