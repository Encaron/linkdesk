/**
 * 配方/配色**显示名**的唯一权威（2026-09-30 用户实机立案「app.theme 卡片指认不明」）。
 *
 * ── 要治的病 ──
 * 设置页「主题 · 整体配方」的卡片只打印配方的**显示名**，而显示名是自由文本：壳的内置兜底配方叫
 * `Dark`、官方主题插件的配方叫 `Light` —— 两张卡看起来像同一套的深浅搭子，实际一个来自壳、一个来自
 * 插件（而且那个插件本身同时提供深浅两色）。用户只能靠名字猜。
 *
 * ── 用户拍板的治本方式 = **名字本身就把两者分开**（2026-09-30）──
 *   · 壳内置兜底 ⇒ **「内置」**（浅色那张兜底 = 「内置浅色」）
 *   · 官方主题插件的配方 ⇒ **「官方主题」**
 *   ⛔ **不做来源行**（曾试过在卡片上加「壳自带／来自 X」并进契约 `RecipeMeta.source`，用户明确否掉：
 *     「我不需要」）⇒ 只留**一条命名规则**，不引入任何归属字段/UI。
 *
 * ── 命名规则（谁的名字谁负责，E6#161「谁的仓谁译文」同一道理）──
 *   · **宿主兜底配方的名字 = 壳核心文字** ⇒ 显示期 `i18n.t()`（译名住语言包 `lang-defaults`）；
 *   · **插件贡献的配方名 = 作者声明数据** ⇒ 原样显示（中文原文即 key，缺译文静默回退 = 设计意图）。
 *
 * 🔴 **为什么不 import pluginLoader**：`pluginLoader/**` 反向 import `ThemeEngine` ⇒ 环依赖。本模块
 *   根本不需要插件清单（只判「是不是宿主兜底」＋ 对宿主名字过一遍 t()），故无装配槽、无解析器。
 */

import i18n from "../../../../i18n";
import { ThemeRegistry } from "../../../registry/appearance/ThemeRegistry";
import type { ThemeRecipe } from "../../../types/theme";

/** 该配方是不是宿主内置兜底（无提供方插件）——归属判定的**唯一口径**（`getRecipeOwner` 为空即宿主） */
export function isHostRecipe(recipeId: string): boolean {
  return ThemeRegistry.getRecipeOwner(recipeId) === undefined;
}

/**
 * 配方**显示名**——宿主兜底走 t()（壳核心文字），插件配方原样（作者声明数据）。
 * @param recipe 只需 id + name（调用方手里通常就是 ThemeRecipe / RecipeMeta 的形状）
 */
export function recipeDisplayName(recipe: Pick<ThemeRecipe, "id" | "name">): string {
  return isHostRecipe(recipe.id) ? i18n.t(recipe.name) : recipe.name;
}

/**
 * 配色变体**显示名**——同一条规则（宿主兜底的配色名也是壳核心文字）。
 * 宿主两张兜底配方各只有一个配色（「深色」/「浅色」），插件配色名原样。
 */
export function colorwayDisplayName(recipeId: string, colorwayName: string): string {
  return isHostRecipe(recipeId) ? i18n.t(colorwayName) : colorwayName;
}
