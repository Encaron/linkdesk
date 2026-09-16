/**
 * 主题值归一化 + 配置迁移公式——纯函数只算不改（测试直测）。
 * #50.21 旧 flat 名归一 / #85 圆角倍数→绝对 px / #86 glassOpacity wash→绝对 / #90 三枚举→单轴。
 */

import { THEME_VALUE_MIGRATIONS, RECIPE_ID_MIGRATIONS, COLORWAY_ID_MIGRATIONS, clampRadiusPx } from "./constants";
import { getBaseRadius } from "./tokens";

/**
 * E6#111f／1.36：外观族 id 归属改名的**读时归一**——两张表 ＋ 两个函数（[1.35 §14.3]）。
 *
 * 🔴 **顺序无关（本格新增的裁决，必须写在代码里）**：官方 9 仓的 25 条改名**不在本格执行**
 *   （归 1.42–1.48 清账格）⇒ 若这里**无条件**把旧 id 映成新名，**今天**盘上的 `app.theme = "mint-soda"`
 *   会指向一个还不存在的配方 ⇒ **正在用的主题当场坏掉**。所以映射**解析器门控**（判据见 `normalizeViaTable`）：
 *
 *   解析器（`AppearanceIdResolver`）= 「这个 id 此刻解析得出来吗」（问的是**注册本**，不是配置）。
 *   判据两问：**新名解析得出 ＋ 旧名解析不出** ⇒ 映；其余（含**没有解析器**）⇒ **恒等**。
 *   fail-safe 方向是**恒等**：宁可少迁一次（旧值留着，1.46 那些格的迁移下一轮还会再来），
 *   不可把活主题映死。
 *
 *   解析器由 App 层 `appearanceApplier` 装配（那里同时够得着 ThemeEngine 与 ThemeRegistry，
 *   不会让本模块反向依赖登记本 —— 本模块**保持纯函数 + 一个模块级槽位**，测试可直接注桩）。
 *   改名轮（1.47）落地后，解析器自然翻成「新名在、旧名不在」⇒ 旧值读到即映新名；盘上旧值的**改写落盘**
 *   归版本 6 迁移（见 `appearanceApplier` 尾部），届时若版本已越 6，则由 1.47 那格补一个新版本号。
 */
export type AppearanceIdResolver = (id: string) => boolean;

let _recipeResolver: AppearanceIdResolver | null = null;
let _colorwayResolver: AppearanceIdResolver | null = null;

/** 装配解析器（幂等：重复装配覆盖）。App 层启动时调一次——测试里注桩用同一入口。 */
export function setAppearanceIdResolvers(resolvers: {
  recipe?: AppearanceIdResolver;
  colorway?: AppearanceIdResolver;
}): void {
  if (resolvers.recipe) _recipeResolver = resolvers.recipe;
  if (resolvers.colorway) _colorwayResolver = resolvers.colorway;
}

/** 清空解析器（测试用）——清后**恒等**（没有解析器 = 不敢判，一律不动）。 */
export function clearAppearanceIdResolvers(): void {
  _recipeResolver = null;
  _colorwayResolver = null;
}

/** 两个空间共用的同一条规则——见下方「判据」注释（两条函数只差表与解析器）。 */
function normalizeViaTable(
  table: Record<string, string>,
  resolver: AppearanceIdResolver | null,
  value: string | undefined
): string | undefined {
  if (!value) return value;
  const mapped = table[value];
  if (!mapped) return value; // 不在表里 ⇒ 恒等（含 flat 显示名 / 图标主题 id / 保底 id / 哨兵）
  if (!resolver) return value; // 🔴 没有解析器 ⇒ **恒等**（fail-safe，不是 fail-open）
  return resolver(mapped) && !resolver(value) ? mapped : value;
}

/**
 * 归属改名判据（**两问**，缺一不映）：
 *   ① **新名解析得出来**吗（`mapped` 已注册）——证明仓**已改名**；
 *   ② **旧名解析不出来**吧（原值已不在）——证明改名**已完成**（不是新旧并存的过渡态）。
 * 两问都成立才映；其余全部恒等。⛔ 别退回单问「旧名没了就映」——插件**没装/加载失败**时旧名当然也解析不出来，
 *   那时映过去只会把「等插件加载好还能用」的值提前打死（本格首版就是这个坑，registry.test 当场红了）。
 *   两问形状使 mapping 在**任何加载顺序**下都安全：改名前后各只有一种解释成立，剩下三种（新在旧不在之外）
 *   一律恒等 = 与 1.36 之前的行为逐字节一致。
 */
export function normalizeRecipeId(value: string | undefined): string | undefined {
  return normalizeViaTable(RECIPE_ID_MIGRATIONS, _recipeResolver, value);
}

/** 归属改名：配色变体 id 空间。⚠️ 与 `normalizeRecipeId` **同表规则但非同表**（`mint-soda` 两表都有——
 *  `app.themeColor` 双语义下先走这张、再走配方那张，两段串联是刻意的，见 `appearanceApplier` 消费点）。 */
export function normalizeColorwayId(value: string | undefined): string | undefined {
  return normalizeViaTable(COLORWAY_ID_MIGRATIONS, _colorwayResolver, value);
}

/**
 * E5.8#50.21：app.theme 旧值归一化（08 §4 迁移表）——旧 flat 主题名 → 壳内置配方 id。
 * "Dark"→"dark" / "Light"→"light"；其余（配方 id / 未迁移 json 名）恒等。
 * 读时归一化——所有消费 app.theme 的路径都过这里（resolveActiveRecipe / onApply / getActive / revert…）；
 * 启动时另做持久化写回（旧值落盘转新，映射表不弹窗不重置）。
 * #50.25 主题插件迁移 colorways 后，json 名 → 配方 id 的映射在此扩展（08 §4 行 2）。
 * E6#111f／1.36：**第二段串联** —— flat 名表之后再过 `normalizeRecipeId`（归属改名）。
 *   签名不变（仍是 `string|undefined → string|undefined`）⇒ 既有 15 处调用点零改动，
 *   它们天然全部获得归属归一（[1.35 §12.4] 说的「扩展点被明文指定」就是这里）。
 *   ⚠️ 顺序有意义：先 flat 名（"Dark"→"dark"）、再归属表（`dark` 不在表里 ⇒ 保底 id 恒等）。
 */
export function normalizeThemeValue(value: string | undefined): string | undefined {
  if (!value) return value;
  const flat = THEME_VALUE_MIGRATIONS[value] ?? value;
  return normalizeRecipeId(flat);
}

/**
 * `app.themeColor` 的**双语义**归一（E5.8#82：recipe 模式 = 配方内配色变体 id；mix 模式 = colors 域来源 = 配方 id / 哨兵）。
 * 规则（[1.35 §14.3] 应用规则第 2 条）：**先配色表、再配方表**——两段串联天然覆盖双语义：
 *   · 配色语义：`"kraft"` → `theme-zones.kraft`（命中配色表即出）；
 *   · 配方语义：`"paper-zones"` → `theme-zones.paper-zones`（不在配色表 ⇒ 落到配方表）；
 *   · 哨兵 `"followTheme"` 两表都不在 ⇒ **原样放行**（它是值约定不是 id，负控 2）。
 * ⚠️ 不是「两次机会就够」的偷懒：两张表**键可重名**（`mint-soda`）⇒ 顺序换一下就会映错空间，
 *   本函数是**唯一**被允许按这个顺序串联的地方。
 */
export function normalizeThemeColorValue(value: string | undefined): string | undefined {
  return normalizeRecipeId(normalizeColorwayId(value));
}

/**
 * E5.8#85 补课：旧圆角倍数 → 绝对 px 迁移公式（纯函数只算不改，测试直测）。
 * 原理（CDP 实测纠偏）：不能读 getEffectiveTokens() 冻结——post-init 时 #85 代码已把旧倍数当绝对值
 * 误读应用（1.15 → 1px），effective token 是被污染的视觉。正确基准 = **主题基准 token × 原始倍数**：
 * 旧 applyRadiusScale 语义正是「theme radius-md（缺省壳默认）× scale」、旧 ①b 语义「theme surface-radius × zoneScale」。
 * baseTokens = mergeDomains(recipe) 无 overrides 输出（主题原生 radius 域），缺 radius → getBaseRadius() 壳默认
 * （与旧代码 source = tokens[key] || base[key] 完全同基准）。
 * 非幂等：重跑 = 基准 × 新绝对值二次乘算（7×6=42）——正确性依赖 schemaMigrations 版本标志（写入即不再重跑；
 *   标志被手动删除 = 值被二次乘算，属手动篡改边界，见 schemaMigrations.ts 模块头）。这正是一开始需要版本号而非
 *   值检测的原因——新旧域重叠且本公式不可靠检测。
 * presence 门控：旧值不存在（全新安装 / 用户从未设过）→ 不产出该键（零变更零写）。
 * 调用方：schemaMigrations.registerConfigMigration 登记（version 2），startup post-init 跑。
 */
export function deriveRadiusAbsoluteMigration(
  userValues: { surfaceRadius?: number; zoneRadiusScale?: number },
  baseTokens: Record<string, string>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const baseMd = parseFloat(baseTokens["radius-md"] ?? getBaseRadius()["radius-md"] ?? "0");
  const baseSurfaceRadius = parseFloat(baseTokens["surface-radius"] ?? "0");
  if (userValues.surfaceRadius !== undefined) {
    out["app.surfaceRadius"] = clampRadiusPx(baseMd * userValues.surfaceRadius);
  }
  if (userValues.zoneRadiusScale !== undefined) {
    out["app.zoneRadiusScale"] = clampRadiusPx(baseSurfaceRadius * userValues.zoneRadiusScale);
  }
  return out;
}

/**
 * E5.8#86：旧 glassOpacity wash 语义 → 绝对透明度迁移公式（纯函数只算不改，测试直测）。
 * 旧语义（#66）：tint 层 opacity = glassOpacity × 0.5（index.css:453 wash 隐藏乘数）——label「1 不透明」
 * 实为半透明（bug 6）。新语义（#86 定案）：glassOpacity = 玻璃面绝对不透明度 0→1，tint 层 opacity 直用值。
 * 迁移公式 = 旧值 × 0.5（旧视觉 1×0.5=0.5 → 新值 0.5；视觉零变化）。
 * presence 门控：旧值不存在（全新安装 / 用户从未写过）→ 零变更零写（跟随新 schema 默认 0.5——旧默认 1 的
 *   wash 视觉恰好同值，未写用户视觉零变化）。
 * 幂等：与 #85 不同（#85 读基准 token × 倍数不可靠自检），本公式纯值换算，正确性依赖 schemaMigrations
 *   版本标志（v3 写入即不再重跑；原子失败零落盘 → 下次重试读旧值再换算，幂等成立）。
 * 调用方：schemaMigrations.registerConfigMigration 登记（version 3），startup post-init 跑。
 */
export function deriveGlassOpacityAbsoluteMigration(userOpacity?: number): Record<string, unknown> {
  if (userOpacity === undefined) return {};
  return { "app.glassOpacity": Math.min(Math.max(userOpacity * 0.5, 0), 1) };
}

/**
 * E5.8#90：旧三枚举（appearanceMode/mixMode/accentMode）→ 单一外观模式轴迁移公式（纯函数只算不改，测试直测）。
 * 合并规则：任一旧枚举表达「自定义意图」（appearanceMode=custom / mixMode=mix / accentMode=custom）
 *   → 新外观模式 "custom"；否则 "followTheme"（14-档案 §四 归一5）。
 * 调用方：startup.ts schemaMigrations 登记（version 4）migrate 内使用。
 */
export function resolveMergedAppearanceMode(legacy: {
  appearanceMode?: string;
  mixMode?: string;
  accentMode?: string;
}): "custom" | "followTheme" {
  return legacy.appearanceMode === "custom" || legacy.mixMode === "mix" || legacy.accentMode === "custom"
    ? "custom"
    : "followTheme";
}
