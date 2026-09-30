/**
 * 配方来源的**文案**（2026-09-30「app.theme 卡片指认不明」）——归属本身在数据里
 * （`RecipeMeta.source`，壳侧由 `ThemeEngine/source.ts` 解析），这里只管**怎么说**。
 *
 * 两个消费方共用这一份，免得同一件事两种说法：
 *   · 主题卡片 `ThemePicker`（设置页「主题 · 整体配方」，React `t`）
 *   · 命令面 `ThemeBrowser`（`theme.pick` 两段式 QuickPick 的第一段 detail，非 React `i18n.t`）
 *
 * 🔴 i18n key = 中文原文；译名住语言包（`lang-defaults` 插件）——壳核心文字归语言包（E6#161 归属判据）。
 * 🔴 插件名**不再包一层**：`source.name` 在壳侧已 `t(manifest.name)` 解析过（插件自己的字典），
 *   在这里再 t 一次会把译文当 key 二次查表（英文名恰好命中别的键就会串味）。
 */

import type { RecipeSource } from "@linkdesk/contracts";

/** `t` 的最小形状——React `useTranslation().t` 与非 React `i18n.t` 都满足（调用方各包一层窄化） */
export type TranslateLike = (key: string, options?: Record<string, unknown>) => string;

/** 来源行文案——宿主兜底 =「壳自带」；插件配方 =「来自 X」。
 *  ⚠️ `source` 缺席（旧载荷 / 单测桩）⇒ **返空串、不标注**——⛔ 不许退化成「壳自带」：那会把插件配方
 *  错标成宿主兜底，正是本件要治的「指认不明」反过来发作（defensive tripwire，不是可静默省略的分支）。 */
export function recipeSourceLabel(source: RecipeSource | undefined, t: TranslateLike): string {
  if (!source) return "";
  if (source.kind === "host") return t("壳自带");
  return t("来自 {{name}}", { name: source.name });
}
