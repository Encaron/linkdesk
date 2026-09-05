/**
 * E5.8#87+#88：来源徽标派生——设置页每槽显示当前值来源（主题 / 用户覆盖 / 域来源）。
 * 设计依据：14-档案 §六 #87（presence 派生）+ #88 策略 A 精化（value-vs-baseline——播种态 = 主题）。
 * 纯函数零副作用（测试直测）；UI 集成在 SettingRow。本文件不 import @src/core（插件独立铁律）——
 * mix 来源哨兵 "followTheme" 为跨插件/壳字符串契约（与 startup.ts/ThemeEngine 同字面量）。
 * E5.8#99（#6 降噪）：徽标只显非默认态——派生仍返回 "theme"（纯逻辑保持完整，A6 测试语义不变），
 * 但 SettingRow 只对 user/mix 渲染徽标；无徽标 = 主题来源。UI 元数据（图标/label）也随迁 SettingRow。
 *
 * 派生规则：
 * 1. 无 sourceKey（非来源徽标槽）→ null（第三方配置键零侵入）。
 * 2. 真实用户覆盖——非空且偏离基准（含 __none__ 显式无）→ 用户。
 *    覆盖值在 mergeMixDomains 之上 applyOverrides 胜出（ThemeEngine）——偏离基准 = 用户盖过域来源。
 * 3. 中性槽（未写 / 清除空 "" / 播种=基准——E5.8#88：进 custom 播种写 9 键 ≠ 用户改过）：
 *    appearanceMode=custom 且 本键所属域来源 ≠ "followTheme"（域来源生效）→ 混搭（实际值来自混搭域）；
 *    否则 → 主题（A6 痛点核心：清除后徽标消失 = 一眼可见回主题）。
 *    E5.8#90：app.mixMode 删——域来源生效门控改读外观主开关 appearanceMode=custom。
 *    E5.8#90 修正：旧规则「值空一律 theme」短路了 rule 3——mix 来源生效 + 中性槽应显 mix 而非 theme
 *    （fontFamily 空 + mixFont=songti → 实际字体来自宋体，14-档案 #87「mix 来源生效 = mix」）。
 */

export type SourceBadge = "theme" | "user" | "mix";

/** 混搭来源「跟随主题」哨兵——startup.ts 播种值/缺省值，跨插件字符串契约（对标 __none__）。 */
export const MIX_FOLLOW_THEME_SENTINEL = "followTheme";

export function deriveSourceBadge(input: {
  /** 配置项 sourceKey 声明（startup.ts schema）——无 = 非徽标槽 */
  sourceKey?: string;
  /** 用户覆盖值（getUserSettings 存在性）——undefined = 无覆盖 */
  userValue?: unknown;
  /** E5.8#88：本键主题/混搭基准种子值（theme.getBaselineSeeds）——播种值/恰与主题同值判「未修改」 */
  baseline?: unknown;
  /** E5.8#90：app.appearanceMode 当前值（"followTheme" / "custom"）——域来源生效门控 */
  mode?: unknown;
  /** sourceKey 指向的混搭来源键当前值（如 app.mixFont） */
  sourceValue?: unknown;
}): SourceBadge | null {
  const { sourceKey, userValue, baseline, mode, sourceValue } = input;
  if (!sourceKey) return null;

  // 真实用户覆盖——非空且偏离基准（含 __none__）→ ✏️（覆盖值盖过域来源，applyOverrides 在域合并之上）
  if (
    userValue !== undefined &&
    String(userValue) !== "" &&
    (baseline === undefined || userValue !== baseline)
  ) {
    return "user";
  }

  // 中性槽（未写 / 清除空 / 播种=基准）——实际值由域来源决定：混搭生效 → 🔀，否则跟随主题 🎨
  if (mode === "custom" && sourceValue !== undefined && sourceValue !== MIX_FOLLOW_THEME_SENTINEL) {
    return "mix";
  }
  return "theme";
}
