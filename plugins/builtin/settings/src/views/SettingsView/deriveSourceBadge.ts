/**
 * E5.8#87：来源徽标派生——设置页每槽显示当前值来源（主题 🎨 / 用户覆盖 ✏️ / 域来源 🔀）。
 * 设计依据：14-档案 §六 #87——「徽标状态由配置存在性派生（无 override = 🎨，有 = ✏️，mix 来源生效 = 🔀）」。
 * 纯函数零副作用（测试直测）；UI 集成在 SettingRow。本文件不 import @src/core（插件独立铁律）——
 * mix 来源哨兵 "followTheme" 为跨插件/壳字符串契约（与 startup.ts/ThemeEngine 同字面量）。
 *
 * 派生规则：
 * 1. 无 sourceKey（非来源徽标槽）→ null（第三方配置键零侵入）。
 * 2. 有用户覆盖（配置存在）：
 *    - 值空 "" = 用户「清除」= 跟随主题 → 🎨（A6 痛点核心：清除后一眼可见回主题）；
 *    - 值非空（含 __none__ 显式无） = 真实用户值 → ✏️。
 * 3. 无用户覆盖：mixMode=mix 且 本键所属域来源 ≠ "followTheme"（混搭来源生效）→ 🔀；否则 🎨 主题。
 */

export type SourceBadge = "theme" | "user" | "mix";

/** 混搭来源「跟随主题」哨兵——startup.ts 播种值/缺省值，跨插件字符串契约（对标 __none__）。 */
export const MIX_FOLLOW_THEME_SENTINEL = "followTheme";

/** 徽标展示元数据——glyph 装饰符号 + i18n key（label 走 t() 硬约束 2） */
export const SOURCE_BADGE_UI: Record<SourceBadge, { glyph: string; labelKey: string }> = {
  theme: { glyph: "🎨", labelKey: "来源：主题" },
  user: { glyph: "✏️", labelKey: "来源：用户覆盖" },
  mix: { glyph: "🔀", labelKey: "来源：混搭域" },
};

export function deriveSourceBadge(input: {
  /** 配置项 sourceKey 声明（startup.ts schema）——无 = 非徽标槽 */
  sourceKey?: string;
  /** 用户覆盖值（getUserSettings 存在性）——undefined = 无覆盖 */
  userValue?: unknown;
  /** app.mixMode 当前值（"recipe" / "mix"） */
  mixMode?: unknown;
  /** sourceKey 指向的混搭来源键当前值（如 app.mixRadius） */
  sourceValue?: unknown;
}): SourceBadge | null {
  const { sourceKey, userValue, mixMode, sourceValue } = input;
  if (!sourceKey) return null;

  if (userValue !== undefined) {
    return String(userValue) === "" ? "theme" : "user";
  }

  if (mixMode === "mix" && sourceValue !== undefined && sourceValue !== MIX_FOLLOW_THEME_SENTINEL) {
    return "mix";
  }
  return "theme";
}
