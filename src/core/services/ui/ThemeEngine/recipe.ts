/**
 * Recipe 合并算法——05 §4 继承链单配方路径：稀疏继承（appearance 风格域 + colorway 颜色域）。
 * 混搭路径在 mix.ts（mergeMixDomains 按域取来源）。依赖 tokens（surfaceVariables/backgroundVariables/applyOverrides）。
 */

import type { ThemeRecipe, ThemeAppearance, ThemeColorway, ThemeDomain } from "../../../types/theme";
import { surfaceVariables, backgroundVariables, applyOverrides, flattenRadiusTokens } from "./tokens";
import { clampRadiusPx } from "./constants";

/** 解析配色变体——colorwayId 缺省 = 配方首个配色（单配色配方 = 恒首项）。
 *  E5.8#58（审计#6）：空 colorways 防线——空配色回退空色透明配色（不崩；注册路径 parseThemeRecipe
 *  已拒空数组，此兜底覆盖程序化 registerRecipe({colorways:[]}) 等越界入口）。 */
export function resolveColorway(recipe: ThemeRecipe, colorwayId?: string): ThemeColorway {
  const found = recipe.colorways.find((c) => c.id === colorwayId);
  if (found) return found;
  if (recipe.colorways.length > 0) return recipe.colorways[0];
  return { id: "", name: "", colors: {} };
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
  if (a?.surface) domains.push("surface");
  return domains;
}

/** 风格域 appearance 稀疏 flatten → token map（键去 --，引擎写入时拼回）。
 *  域顺序：radius → glass（surfaceVariables 全机制）→ font → background → surface（per-surface pass-through）；
 *  同键碰撞后者覆盖（surface 最具体排最后）。 */
function flattenAppearance(appearance: ThemeAppearance, tokens: Record<string, string>): void {
  // E5.8#104：配方圆角 clamp 进系统标尺 [0,32]（radius-full 相对几何排除）——共用 flattenRadiusTokens（mix 同规）
  flattenRadiusTokens(appearance.radius, tokens);
  Object.assign(tokens, surfaceVariables(appearance.glass));
  if (appearance.font) {
    if (appearance.font.ui) tokens["font-ui"] = appearance.font.ui;
    if (appearance.font.mono) tokens["font-mono"] = appearance.font.mono;
  }
  Object.assign(tokens, backgroundVariables(appearance.background));
  if (appearance.surface) {
    for (const [key, value] of Object.entries(appearance.surface)) {
      if (value != null) {
        // E5.8#104：surface.radius 绝对 px 同 clamp 进标尺（与 surfaceVariables glass.radius 同规）
        tokens[`surface-${key}`] = key === "radius" ? `${clampRadiusPx(Number(value))}px` : String(value);
      }
    }
  }
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
