/**
 * 主题值归一化 + 配置迁移公式——纯函数只算不改（测试直测）。
 * #50.21 旧 flat 名归一 / #85 圆角倍数→绝对 px / #86 glassOpacity wash→绝对 / #90 三枚举→单轴。
 */

import { THEME_VALUE_MIGRATIONS, clampRadiusPx } from "./constants";
import { getBaseRadius } from "./tokens";

/**
 * E5.8#50.21：app.theme 旧值归一化（08 §4 迁移表）——旧 flat 主题名 → 壳内置配方 id。
 * "Dark"→"dark" / "Light"→"light"；其余（配方 id / 未迁移 json 名）恒等。
 * 读时归一化——所有消费 app.theme 的路径都过这里（resolveActiveRecipe / onApply / getActive / revert…）；
 * 启动时另做持久化写回（旧值落盘转新，映射表不弹窗不重置）。
 * #50.25 主题插件迁移 colorways 后，json 名 → 配方 id 的映射在此扩展（08 §4 行 2）。
 */
export function normalizeThemeValue(value: string | undefined): string | undefined {
  if (!value) return value;
  return THEME_VALUE_MIGRATIONS[value] ?? value;
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
