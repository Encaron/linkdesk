/**
 * 配方**来源**与**显示名**的唯一权威（2026-09-30 用户实机立案「app.theme 卡片指认不明」）。
 *
 * ── 要治的病 ──
 * 设置页「主题 · 整体配方」的卡片只打印配方的**显示名**，而显示名是自由文本：壳的内置兜底配方叫
 * `Dark`、官方主题插件的配方叫 `Light` —— 两张卡看起来像同一套的深浅搭子，实际一个来自壳、一个来自
 * 插件（而且那个插件本身同时提供深浅两色）。用户只能靠名字猜，**而名字恰好是唯一会撞车的东西**。
 *
 * ── 两条规则（本模块就是这两条的落点，别在别处再写一份）──
 *   ① **归属进数据**：`recipeSourceOf(recipeId)` ⇒ `{kind:"host"}` / `{kind:"plugin",pluginId,name}`。
 *      「是不是宿主」的运行时真相 = `ThemeRegistry.getRecipeOwner()` 为 `undefined`（宿主兜底注册时
 *      `pluginId` 就是 `undefined`）——不另建身份表（同 1.36 归属仲裁的立论）。
 *   ② **谁的名字谁负责**（E6#161「谁的仓谁译文」同一道理）：
 *      · **宿主兜底配方的名字 = 壳核心文字** ⇒ 显示期 `i18n.t()`（译名住语言包 `lang-defaults`）；
 *      · **插件贡献的配方名 = 作者声明数据** ⇒ 原样显示（中文原文即 key，缺译文静默回退 = 设计意图）。
 *
 * 🔴 **为什么不 import pluginLoader**：`pluginLoader/**` 反向 import `ThemeEngine`（`contributions.ts` /
 *   `runtime.ts` / `revert.ts`）⇒ 这里再 import 回去就是**环依赖**。故插件显示名走**解析器装配槽**
 *   （`setPluginNameResolver`，与 `setAppearanceIdResolvers` 同一个既有范式），装配点 = App 层
 *   `src/App/config/appearanceApplier.ts`。槽未装配 ⇒ 退化为 `pluginId` 本身（不裸崩）。
 */

import i18n from "../../../../i18n";
import { ThemeRegistry } from "../../../registry/appearance/ThemeRegistry";
import type { RecipeSource } from "../../../api/linkdesk-api/types";
import type { ThemeRecipe } from "../../../types/theme";

/** 插件 id → 插件显示名（壳侧 t() 解析后）；未命中返回 undefined ⇒ 调用方退化为 pluginId */
let _pluginNameOf: ((pluginId: string) => string | undefined) | null = null;

/** 装配插件显示名解析器（App 层启动时调；照 `setAppearanceIdResolvers` 范式） */
export function setPluginNameResolver(fn: (pluginId: string) => string | undefined): void {
  _pluginNameOf = fn;
}

/** 卸下解析器——测试隔离用（生产不调） */
export function clearPluginNameResolver(): void {
  _pluginNameOf = null;
}

/** 该配方是不是宿主内置兜底（无提供方插件）——归属判定的**唯一口径** */
export function isHostRecipe(recipeId: string): boolean {
  return ThemeRegistry.getRecipeOwner(recipeId) === undefined;
}

/** 配方来源——宿主兜底 / 插件（插件显示名走装配槽，槽缺席退化为 pluginId） */
export function recipeSourceOf(recipeId: string): RecipeSource {
  const owner = ThemeRegistry.getRecipeOwner(recipeId);
  if (!owner) return { kind: "host" };
  return { kind: "plugin", pluginId: owner, name: _pluginNameOf?.(owner) ?? owner };
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
 * 宿主两张兜底配方的配色各只有一个，「深色／浅色」用的是与配方名同一个 key。
 */
export function colorwayDisplayName(recipeId: string, colorwayName: string): string {
  return isHostRecipe(recipeId) ? i18n.t(colorwayName) : colorwayName;
}
