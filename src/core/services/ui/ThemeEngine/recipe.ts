/**
 * Recipe 合并算法——05 §4 继承链单配方路径：稀疏继承（appearance 风格域 + colorway 颜色域）。
 * 混搭路径在 mix.ts（mergeMixDomains 按域取来源）。依赖 tokens（surfaceVariables/backgroundVariables/applyOverrides）。
 */

import type { ThemeRecipe, ThemeAppearance, ThemeColorway, ThemeDomain } from "../../../types/theme";
import { surfaceVariables, backgroundVariables, applyOverrides, flattenRadiusTokens } from "./tokens";

/** 解析配色变体——colorwayId 缺省 = 配方首个配色（单配色配方 = 恒首项）。
 *  E5.8#58（审计#6）：空 colorways 防线——空配色回退空色透明配色（不崩；注册路径 parseThemeRecipe
 *  已拒空数组，此兜底覆盖程序化 registerRecipe({colorways:[]}) 等越界入口）。 */
export function resolveColorway(recipe: ThemeRecipe, colorwayId?: string): ThemeColorway {
  const found = recipe.colorways.find((c) => c.id === colorwayId);
  if (found) return found;
  if (recipe.colorways.length > 0) return recipe.colorways[0];
  return { id: "", name: "", colors: {} };
}

/**
 * 用户可选配色 = 非「高对比专用」的配色（2026-11-24 拍板）。
 * `traits.contrast="high"` 的 colorway 是**全局对比度开关的内部资源**（`app.contrastMode`），
 * 不是用户可挑的配色变体——旧实现把它同时摆进「Colors」列表 = 同一个概念两个入口（用户实机指出）。
 * 单写法：theme.listRecipes 元数据 / app.themeColor 可写 enum / 高对比选色 三处都走本函数。
 * 异常数据（整配方只有高对比配色）→ 原样返回，避免列表空掉。
 */
export function userSelectableColorways(recipe: ThemeRecipe): ThemeColorway[] {
  const normal = recipe.colorways.filter((c) => c.traits?.contrast !== "high");
  return normal.length > 0 ? normal : recipe.colorways;
}

/** 配方贡献域——colorways 恒贡献 colors；appearance 五风格域稀疏判定（缺的域不声明）。
 *  供 listRecipes 元数据（混搭来源过滤）+ applyRecipe 广播 domains（域级细粒度刷新）共用。 */
export function recipeDomains(recipe: ThemeRecipe): ThemeDomain[] {
  const domains: ThemeDomain[] = ["colors"];
  const a = recipe.appearance;
  if (a?.radius) domains.push("radius");
  if (a?.glass) domains.push("glass");
  if (a?.font) domains.push("font");
  if (a?.background) domains.push("background");
  return domains;
}

/** 风格域 appearance 稀疏 flatten → token map（键去 --，引擎写入时拼回）。
 *  域顺序：radius → glass（surfaceVariables 全机制，含 --surface-* 玻璃表面形态）→ font → background；
 *  同键碰撞后者覆盖。E5.8#132：surface 域删，玻璃表面形态 token 归 glass 域。 */
function flattenAppearance(appearance: ThemeAppearance, tokens: Record<string, string>): void {
  // E5.8#104：配方圆角 clamp 进系统标尺 [0,32]（radius-full 相对几何排除）——共用 flattenRadiusTokens（mix 同规）
  flattenRadiusTokens(appearance.radius, tokens);
  Object.assign(tokens, surfaceVariables(appearance.glass));
  if (appearance.font) {
    if (appearance.font.ui) tokens["font-ui"] = appearance.font.ui;
    if (appearance.font.mono) tokens["font-mono"] = appearance.font.mono;
  }
  Object.assign(tokens, backgroundVariables(appearance.background));
}

/**
 * E5.8#50.16：05 §4 合并链——稀疏继承，纯函数只算不改：
 *   :root 壳默认（缺的域/键不写 → CSS 继承）
 *   ⊕ recipe.appearance（风格域，稀疏 flatten）
 *   ⊕ 当前 colorway.colors（颜色域，稀疏覆盖）
 *   ⊕ overrides（radius scale 系数 JS 乘算 / 绝对 token 覆盖）
 * 返回生效 token 集（键不带 --）→ 写 :root + 广播共用。
 */
export function mergeDomains(
  recipe: ThemeRecipe,
  colorwayId?: string,
  overrides: Record<string, string | number> = {}
): Record<string, string> {
  const colorway = resolveColorway(recipe, colorwayId);
  const tokens: Record<string, string> = {};
  if (recipe.appearance) flattenAppearance(recipe.appearance, tokens);
  if (colorway?.colors) {
    for (const [key, value] of Object.entries(colorway.colors)) tokens[key] = value;
  }
  applyOverrides(tokens, overrides);
  return tokens;
}
