/**
 * 主题引擎会话状态——当前主题/配方/配色 + 最近提交键集 + 最近应用强调色（叶子模块，仅类型依赖）。
 *
 * 打破 seeds⇄apply 循环（11 模块依赖 DAG 无环的关键）：
 *   getThemeBaseTokens（seeds）读 getActiveRecipe（本模块）；
 *   applyRecipe/applyTheme（apply）写 setActiveRecipe/setCurrentTheme（本模块）。
 * 两向都经过 state——seeds 与 apply 不再直接互引。
 */

import type { Theme } from "./registry";

let currentTheme: Theme | null = null;

/* ── E5.8#50.16：Recipe 应用态（applyRecipe 更新；flat applyTheme 清空） ── */
let currentRecipeId: string | null = null;
let currentColorwayId: string | null = null;
/** 最近一次 commit 写过的键集——下一次 commit 清陈旧 token（换配方无残留） */
let _lastCommittedKeys: string[] | null = null;

/** E5.8#88 C4：最近一次实际应用的强调色——applyAccentColor 写入时追踪（权威在引擎，非 DOM 读）。
 *  accentMode 切 custom 播种取此值（此前 followTheme 显示的主题 accent），与 appearance 播种 token 反推同哲学。 */
let _lastAppliedAccent = "";

/** 当前活动配方/配色——无活动配方（flat apply 态）返回 null */
export function getActiveRecipe(): { recipeId: string; colorwayId: string } | null {
  if (currentRecipeId == null) return null;
  return { recipeId: currentRecipeId, colorwayId: currentColorwayId ?? "" };
}

/** 获取当前主题 */
export function getCurrentTheme(): Theme | null {
  return currentTheme;
}

/** E5.8#88 C4：最近一次实际应用的强调色——applyAccentColor 写入时追踪 */
export function getAppliedAccent(): string {
  return _lastAppliedAccent;
}

/* ── 内部写入口（apply/accent/tokens 模块经此写会话态；门面不导出） ── */

export function setActiveRecipe(recipeId: string | null, colorwayId: string | null): void {
  currentRecipeId = recipeId;
  currentColorwayId = colorwayId;
}

export function setCurrentTheme(theme: Theme | null): void {
  currentTheme = theme;
}

export function getLastCommittedKeys(): string[] | null {
  return _lastCommittedKeys;
}

export function setLastCommittedKeys(keys: string[] | null): void {
  _lastCommittedKeys = keys;
}

export function setAppliedAccent(hex: string): void {
  _lastAppliedAccent = hex;
}
