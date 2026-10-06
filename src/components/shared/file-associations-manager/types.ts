/**
 * file-associations-manager/types——「默认打开方式」管理器（`uiHint: fileAssociationsManager`）的
 * **模型形状**，随件进 `@linkdesk/ui`。
 *
 * ── 为什么住共享层、⛔ 不进 contracts ──
 * 这是**渲染 props 契约**（聚合纯函数产出、呈现件消费），与 `PluginCard` 同款处置：契约面
 * （`SettingsUiHint` 词表）一个字不改，改的只是渲染体的住址。第三方设置渲染方两路任选——
 * 共享聚合＋共享件自组（零重推导）／只拿数据全画（数据面全是既有契约面，自己也能拉）。
 *
 * ── 三份输入从哪来（判定归壳，管理器只聚合）──
 *
 * | 输入 | 面 | 为什么是它 |
 * |:--|:--|:--|
 * | 谁声明了哪些类型 | 插件清单 `contributes.fileAssociations` | `extractDeclaredExtensions` 逐项收窄；声明序是「按默认排序」的唯一来源 |
 * | 每类的候选与**当前生效** | 宿主文件关联面 `listHandlersFor(ext)` | 「谁是默认」的判据在宿主（覆盖 → 声明序 → 角色兜底）——管理器**不自己算**，只消费 `isCurrent` |
 * | 覆盖表 | 配置项 `workbench.fileAssociations` | 覆盖表是配置项、写面唯一 ⇒ 与文件右键菜单的「打开方式」同一真源 |
 */

import type { ManifestIconShape } from "../plugin-icon/iconUtils";

/* ── 声明面解析 ── */

/** 一条挂牌声明——`contributes.fileAssociations[]` 的一项。 */
export interface DeclaredExtension {
  /** 归一化扩展名（无点小写）——行标签照抄它（声明 `MX` → 显示 `.mx`） */
  ext: string;
  /** 声明原文（未归一）——只在「与归一结果不同」时作悬停提示（说明这行为什么是这个样子） */
  raw: string;
  /** 声明里的**文件类型显示名**（`displayName`，如 `.rs → "Rust"`；缺省 ⇒ 不参与 C5 的显示名检索）。
   *  ⚠️ 这是**类型**名、⛔ 不是插件名——插件名走 `HandlerSnapshot.title`。 */
  typeLabel?: string;
}

/** 参与管理器的一位插件（＝声明了至少一类文件类型的**启用**插件）。 */
export interface DeclaredPlugin {
  pluginId: string;
  /** 显示名（`manifest.name ?? pluginId`）——**i18n 原文**，渲染前由视图 `t()` */
  name: string;
  version?: string;
  /** 图标裁决结果（`pickIdentityArt`）——透传 `PluginCard`，管理器不管图标链 */
  manifest?: ManifestIconShape;
  /** 声明序（插件自己的声明序，**不是字典序**——卡内行的顺序照它；C5「按默认排序」的唯一来源） */
  exts: DeclaredExtension[];
}

/**
 * 宿主只读面快照——`listHandlersFor(ext)` 的一项。
 *
 * 🔴 `title` 与 `typeLabel` 是**两个不同的东西**：`title` = **插件**显示名（「谁在处理」——
 * 下拉/行标签一律用它）；`typeLabel` = **文件类型**显示名（声明里的 `displayName`，如
 * `.rs → "Rust"`，即「叫它什么」——⛔ 不当插件名用）。
 */
export interface HandlerSnapshot {
  pluginId: string;
  /** **插件**显示名（`manifest.name`，缺则回退 pluginId）——行主标签/下拉选项文案 */
  title: string;
  /** **文件类型**显示名（声明里的 `displayName`；缺则回退 pluginId）——⛔ 不是插件名 */
  typeLabel: string;
  /** 宿主算出的「当前生效」（覆盖 → 声明序 → 角色兜底）——管理器**只信这个** */
  isCurrent: boolean;
}

/* ── 模型输出 ── */

/**
 * 卡内一行的状态——**六态**（四态 ＋ 单家可锁 ＋ 无人处理兜底）：
 *   `lock` 当前默认（用户锁定）／`override` 当前默认（用户指定）／`auto` 默认（自动）／
 *   `lost` 候选 · 默认：X／`sole` 唯一处理者（自动）／`orphan` 无人处理 · 角色兜底（X）。
 * 文案由视图给（i18n 归视图），模型只给枚举。失效覆盖**不在这六态里**——它是类的属性，走 `dangling`。
 */
export type RowState = "lock" | "override" | "auto" | "lost" | "sole" | "orphan";

/** 行内下拉的候选（**不含**「自动」项——那一项是视图拼的 i18n 标签）。 */
export interface RowOption {
  value: string;
  label: string;
}

/** 卡内一行（一类扩展名）。 */
export interface ExtRowModel {
  /** 归一化扩展名（无点） */
  ext: string;
  /** 覆盖表存储键（`.ext`） */
  key: string;
  state: RowState;
  /** 失效覆盖：覆盖键仍在、指向的插件却已不在册（惰性——重装即复活）。挂在该类**每一行**上 */
  dangling: boolean;
  /** `lost` 时「默认：X」的 X；其余态是当前生效者（悬停说明用） */
  currentName?: string;
  /** **类型**显示名（声明里的 `displayName`）——C5 仅显示名命中时标「类型名 X」用；缺省 ⇒ 检索不含它 */
  typeLabel?: string;
  /** 声明原文——仅在 `raw !== ext` 时给出（悬停提示「声明串 X → 归一键 Y」） */
  rawDeclaration?: string;
  /** 下拉选中值——**覆盖态**：仅当覆盖指向的就是宿主认可的那家才给它，否则 `""`（＝自动） */
  value: string;
  /** 候选（宿主激活序） */
  options: RowOption[];
}

/** 「按插件浏览」的一张卡。 */
export interface CardModel {
  pluginId: string;
  name: string;
  version?: string;
  manifest?: ManifestIconShape;
  /** 卡内行（**声明序**——C5「按默认排序」＝原样透传它，⛔ 聚合内部不得重排） */
  rows: ExtRowModel[];
  /** 摘要三数：声明 N 类 · 竞争 M 类 · 默认持有 K 类 */
  declaredCount: number;
  contestedCount: number;
  holdCount: number;
  /** 本插件声明范围内**有覆盖键**的类（声明序）——卡齿轮「清除相关默认覆盖（N 类）」的 N */
  overrideExts: string[];
  /** 本次是否因搜索才留下（命中卡自动展开） */
  matchedSearch: boolean;
}

/** 竞争区一行（聚合格）。 */
export interface ContestedRowModel {
  /** 格内成员（归一化扩展名，字典序） */
  exts: string[];
  /** 同候选集合签名的**全组**类数（本次搜索过滤后）——用来判断这一格是不是「拆出来的」 */
  groupExtsCount: number;
  /** 格的候选（同一签名 ⇒ 签名内所有类的候选一致） */
  handlers: RowOption[];
  /** 当前生效者显示名（「当前单击打开：X」） */
  effectiveName: string;
  /** 生效词法口径：自动 / 用户指定 / 含用户指定（＝格内是否有人键在生效） */
  source: "auto" | "user" | "partial";
  /** 下拉选中值——整格成员**统一**指向在册候选才是它，否则 `""`（＝自动） */
  value: string;
  /** 格内有覆盖键的类数（菜单「恢复自动」项出不出，看它） */
  overrideCount: number;
  /** 候选家数（「N 个候选」徽标） */
  handlerCount: number;
}

export interface ManagerModel {
  /** 「多候选类型」区 */
  contested: ContestedRowModel[];
  /** 「按插件浏览」区 */
  cards: CardModel[];
  /**
   * 导航计数徽标——口径：**竞争类型数 ＋ 卡片数**（⛔ 不是聚合行数：一格含 6 类就计 6
   * ——用户关心的是「多少类要我看」）。
   */
  navCount: number;
  /** 参与计数与聚合的竞争类型数（搜索过滤后）——空态判定用 */
  contestedExtCount: number;
}

export interface BuildInput {
  plugins: readonly DeclaredPlugin[];
  /** 归一化 ext → 候选快照（无声明者缺省） */
  handlersByExt: Readonly<Record<string, HandlerSnapshot[] | undefined>>;
  /** 覆盖表原文（键 `.ext`） */
  overrideTable?: Readonly<Record<string, unknown>>;
  /** 搜索词（空 = 不过滤） */
  search?: string;
}
