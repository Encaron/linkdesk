/**
 * 混搭合并——10 §1/§3 模型「每域各自取来源」：getMixProfile / resolveDomainSource / mergeMixDomains /
 * isMixSourceOwner / syncThemeColorConfig（#82 colors 域来源并入 app.themeColor）。
 * 依赖：constants（域表/顺序/哨兵）+ recipe（recipeDomains）+ tokens（domain 零值 + applyOverrides）+ state（getActiveRecipe）。
 */

import type { ThemeRecipe, ThemeAppearance, ThemeColorway, ThemeDomain } from "../../../types/theme";
import { ThemeRegistry } from "../../../registry/appearance/ThemeRegistry";
import { getConfigurationValue, setConfigurationValue } from "../../configuration/ConfigurationService";
import { updateConfigurationEnum } from "../../../registry/ConfigurationRegistry";
import { MIX_DOMAIN_KEYS, MIX_FOLLOW_THEME, GLASS_TOKEN_KEYS, MIX_DOMAIN_ORDER } from "./constants";
// E6#111f／1.36：域来源 id 的读时归一（本模块是 app.themeColor/app.mixFont/app.mixBackground 的唯一读入口）
import { normalizeRecipeId, normalizeThemeColorValue } from "./migration";
import { surfaceVariables, backgroundVariables, applyOverrides, flattenRadiusTokens } from "./tokens";
import { recipeDomains } from "./recipe";
import { getActiveRecipe } from "./state";

/** 混搭档案——来源域映射。colors = 配方 id/配色 id/followTheme（决策 B：配方+配色粒度）；
 *  其余域 = 配方 id/followTheme（配方粒度）。Partial：radius/glass 域无来源键（E5.8#97 数值域来源删键），
 *  缺省域 = 基础配方回退（resolveDomainSource）。 */
export type MixProfile = Partial<Record<ThemeDomain, string>>;

/** 读当前混搭来源配置 → 档案（mixMode=mix 时引擎消费；缺省 = 全跟随主题）
 *  E6#111f／1.36：域来源值是**外观 id**（colors = 配色 id／配方 id 双语义；font/background = 配方 id）
 *   —— 这三条键（app.themeColor / app.mixFont / app.mixBackground）**原本没有任何读时归一**，
 *   本函数是它们唯一的读入口（constants.ts 的 MIX_DOMAIN_KEYS 持的是**键名**不是 id 值，无需挂归一）。
 *   哨兵 `followTheme` 两张表都不在 ⇒ 原样放行（负控 2：哨兵不是 id）。 */
export function getMixProfile(): MixProfile {
  const profile = {} as MixProfile;
  for (const [domain, key] of Object.entries(MIX_DOMAIN_KEYS)) {
    const raw = String(getConfigurationValue<string>(key) ?? MIX_FOLLOW_THEME);
    const normalized = domain === "colors"
      ? normalizeThemeColorValue(raw) // 双语义：先配色表、再配方表（[1.35 §14.3] 应用规则 2）
      : normalizeRecipeId(raw);
    profile[domain as ThemeDomain] = normalized ?? raw;
  }
  return profile;
}

/**
 * E5.8#61 审计#1：指定插件是否为当前混搭来源——任一 mix 域配置引用其配方/配色（颜色域 = 配方+配色粒度）。
 * 卸载/禁用混搭来源后需重应用当前主题——源配方已摘（含 @font-face 清理）但 :root 残留其颜色/字体变量，
 * 重应用走 #58 缺域回退兜底回主题基线（resolveDomainSource 来源缺失 → 基础配方）。
 */
export function isMixSourceOwner(pluginId: string): boolean {
  // E5.8#82：colors 域来源并入 app.themeColor——recipe 模式下 themeColor 是真配色 id（非混搭来源），
  // 不加门控会误判「当前主题的配色归属插件」为混搭来源（卸载重应用误触发）。混搭来源只存在于自定义模式。
  // E5.8#90：外观模型合并——app.mixMode 删，改读外观主开关 appearanceMode=custom。
  if (getConfigurationValue<string>("app.appearanceMode") !== "custom") return false;
  const profile = getMixProfile();
  for (const [domain, raw] of Object.entries(profile)) {
    const value = raw == null ? "" : String(raw);
    if (!value || value === MIX_FOLLOW_THEME) continue;
    let recipeId: string | undefined;
    if (domain === "colors") {
      const owner = findColorwayOwner(value);
      recipeId = owner ? owner.recipe.id : ThemeRegistry.getRecipe(value)?.id;
    } else {
      recipeId = ThemeRegistry.getRecipe(value)?.id;
    }
    if (recipeId && ThemeRegistry.getRecipeOwner(recipeId) === pluginId) return true;
  }
  return false;
}

/** 按配色 id 找归属配方——颜色域来源 = 配方+配色粒度（决策 B：可选任一配方的任一配色变体） */
function findColorwayOwner(colorwayId: string): { recipe: ThemeRecipe; colorway: ThemeColorway } | undefined {
  for (const recipe of ThemeRegistry.getRecipes()) {
    const colorway = recipe.colorways.find((c) => c.id === colorwayId);
    if (colorway) return { recipe, colorway };
  }
  return undefined;
}

/** 解析某域来源——followTheme → 当前配方；颜色域 = 配方+配色粒度，其余域 = 配方粒度。
 *  来源找不到（配方未注册/已卸载）→ 回退当前配方（followTheme 行为，域不空窗）。
 *  export：apply.ts currentTheme 快照取混搭 colors 域生效配色（同 mergeMixDomains 解析）。 */
export function resolveDomainSource(
  domain: ThemeDomain,
  profile: MixProfile,
  baseRecipe: ThemeRecipe,
  baseColorway: ThemeColorway
): { recipe: ThemeRecipe; colorway?: ThemeColorway } {
  const value = profile[domain];
  if (!value || value === MIX_FOLLOW_THEME) {
    return { recipe: baseRecipe, colorway: domain === "colors" ? baseColorway : undefined };
  }
  if (domain === "colors") {
    const owner = findColorwayOwner(value);
    if (owner) return owner;
    const recipe = ThemeRegistry.getRecipe(value);
    if (recipe) return { recipe, colorway: recipe.colorways[0] };
    return { recipe: baseRecipe, colorway: baseColorway };
  }
  const recipe = ThemeRegistry.getRecipe(value);
  return recipe ? { recipe } : { recipe: baseRecipe };
}

/**
 * E5.8#59（审计#7 附注）：混搭域生效来源配方——currentTheme 快照 surface/background 取混搭各域来源。
 * 解析与 mergeMixDomains 完全一致（含 #58 缺域回退：来源配方存在但缺该域 → 基础配方该域不空窗）。
 * 原快照取基础配方 appearance.glass/background，mix 下与生效玻璃/背景来源不符——消费
 * getCurrentTheme().surface 下游（ThemeBrowser 等）拿到错数据。
 * export：apply.ts currentTheme 快照取混搭生效玻璃/背景来源（同 mergeMixDomains 解析）。
 */
export function resolveMixDomainRecipe(
  domain: "glass" | "background",
  profile: MixProfile,
  baseRecipe: ThemeRecipe,
  baseColorway: ThemeColorway
): ThemeRecipe {
  const source = resolveDomainSource(domain, profile, baseRecipe, baseColorway);
  if (source.recipe !== baseRecipe && !recipeDomains(source.recipe).includes(domain)) {
    return baseRecipe;
  }
  return source.recipe;
}

/** 单域 flatten——混搭按域取来源（10 §1）；缺省域/键 = 零值（surfaceVariables/backgroundVariables 内置）。
 *  域 token 归属（03 §1 表）：colors = 配色 token；font = --font-*；radius = --radius-*；
 *  glass = --glass-* + 玻璃表面形态 --surface-*（E5.8#132 surface 域删后并入）；background = --bg-*（+ zones 切片挂 surface-bg-*）。 */
function domainTokens(
  appearance: ThemeAppearance | undefined,
  domain: ThemeDomain,
  colorway?: ThemeColorway
): Record<string, string> {
  const tokens: Record<string, string> = {};
  switch (domain) {
    case "colors":
      if (colorway?.colors) {
        for (const [key, value] of Object.entries(colorway.colors)) tokens[key] = value;
      }
      return tokens;
    case "radius":
      // E5.8#104：配方圆角 clamp 进标尺 [0,32]（radius-full 相对几何排除）——共用 flattenRadiusTokens（单配方同规）
      flattenRadiusTokens(appearance?.radius, tokens);
      return tokens;
    case "glass": {
      const sv = surfaceVariables(appearance?.glass);
      for (const key of GLASS_TOKEN_KEYS) tokens[key] = sv[key];
      // E5.8#132：surface 域删——玻璃表面形态 token（--surface-*）并入 glass 域（原 mix case "surface" 职责）；
      // surface-bg-* 零值不写（E5.8#58 审计#1）：zones 切片归 background 域（⑭ 影像分区）、纹理归 glass.texture
      // 显式声明（⑬ 纸纹）——SURFACE_ZERO 的 surface-bg-* 只是兜底，整面写会吞 background 域 zones 切片。
      // 顺序玻璃→背景 = 单配方路径 flattenAppearance 同序（#132 一并归一，zones 存活，两路径一致）。
      const hasTexture = appearance?.glass?.texture != null && appearance.glass.texture !== "";
      for (const [key, value] of Object.entries(sv)) {
        if (!key.startsWith("surface-")) continue;
        if (key.startsWith("surface-bg-") && !hasTexture) continue;
        tokens[key] = value;
      }
      return tokens;
    }
    case "font":
      if (appearance?.font?.ui) tokens["font-ui"] = appearance.font.ui;
      if (appearance?.font?.mono) tokens["font-mono"] = appearance.font.mono;
      return tokens;
    case "background":
      // backgroundVariables 全量——bg-* + zones 模式切片（surface-bg-*，⑭ 影像分区）
      return backgroundVariables(appearance?.background);
  }
}

/** 混搭字体域来源——resolveRecipeFonts 解析后的字体域来源配方（资产族名） */
interface MixFontSource {
  recipeId: string;
  appearance: ThemeAppearance | undefined;
}

/**
 * E5.8#50.26：混搭合并——10 §1/§3 模型：
 *   :root 壳默认（缺的域/键不写 → CSS 继承）
 *   ⊕ 每域各自取来源 flatten（followTheme → 当前配方；颜色域 = 配方+配色）
 *   ⊕ overrides（设置层 scale/绝对覆盖，最上层）
 * 返回生效 token 集（键不带 --）——applyRecipe mix 分支专用；单配方路径仍走 mergeDomains（零回归）。
 */
export function mergeMixDomains(
  baseRecipe: ThemeRecipe,
  baseColorway: ThemeColorway,
  profile: MixProfile,
  overrides: Record<string, string | number>,
  fontSource?: MixFontSource
): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const domain of MIX_DOMAIN_ORDER) {
    let source = resolveDomainSource(domain, profile, baseRecipe, baseColorway);
    // E5.8#58（审计#5）：来源配方存在但缺该域（appearance 稀疏，recipeDomains 不含）→ 回退基础配方该域
    // ——与来源配方缺失同语义（域不空窗整域落 :root）。colors 域恒有 colorways 不触发。
    if (source.recipe !== baseRecipe && !recipeDomains(source.recipe).includes(domain)) {
      source = { recipe: baseRecipe, colorway: domain === "colors" ? baseColorway : undefined };
    }
    // 字体域——源配方资产字体须用已解析 appearance（resolveRecipeFonts 换族名）；其余域用源配方原 appearance
    const appearance =
      domain === "font" && fontSource && source.recipe.id === fontSource.recipeId
        ? fontSource.appearance
        : source.recipe.appearance;
    Object.assign(tokens, domainTokens(appearance, domain, source.colorway));
  }
  applyOverrides(tokens, overrides);
  return tokens;
}

/** 混搭字体域来源配方——followTheme → 当前配方；否则按 app.mixFont 来源（找不到回退当前配方）。
 *  export：apply.ts mix 分支取字体域来源配方（资产字体两步解析在源配方上）。 */
export function resolveFontSource(recipe: ThemeRecipe, profile: MixProfile): ThemeRecipe {
  if (!profile.font || profile.font === MIX_FOLLOW_THEME) return recipe;
  return ThemeRegistry.getRecipe(profile.font) ?? recipe;
}

/**
 * E5.8#70：回写 app.themeColor = 生效配色 id（bug 7 复制为空 + #60 F1.2 下拉谎报同源修复）。
 * applyRecipe 已 resolve 缺省/失效值（followTheme→配方首配色 / custom 空或失效→兜底），本函数把引擎
 * 真实生效配色同步回配置——复制/展示/下拉高亮路径读 app.themeColor 而非空/旧配置值。
 * 仅配置提交路径（startup applyRecipeForConfig）调用——预览（applyRecipe 直调）不落配置。
 * 值已一致不写（防 onApply 重入死循环：写入→onApply→重应用→值已一致→停）。返回是否发生回写（测试断言）。
 */
export function syncThemeColorConfig(recipe: ThemeRecipe): boolean {
  // E5.8#82：自定义模式下 app.themeColor 是 colors 域来源（配方 id / "followTheme"），回写配色 id 会踩掉来源选择
  // E5.8#90：外观模型合并——app.mixMode 删，改读外观主开关 appearanceMode=custom。
  if (getConfigurationValue<string>("app.appearanceMode") === "custom") return false;
  const effective = getActiveRecipe()?.colorwayId ?? recipe.colorways[0]?.id ?? "";
  if (!effective) return false;
  // E6#111f／1.36：**刻意**拿「盘上原值」跟「生效值」比——生效值已经过读时归一，两者不等即回写归属名
  //   （旧值自愈成新名）。⛔ 别把左边也归一：那样相等的旧值会被判「已一致」而永不回写，盘面停在旧名。
  if (getConfigurationValue<string>("app.themeColor") === effective) return false;
  void setConfigurationValue("app.themeColor", effective, "user").catch(() => {});
  return true;
}

/**
 * E5.8 Phase 11.14：app.themeColor 动态 enum 同步——按外观模式决定可选配色集，与 UI 宣传全集对齐。
 * custom 模式：colors 域可跨主题选配——["followTheme", ...全配方全部配色 id]（DynamicSelect custom
 *   分支同构）。修复「UI 列出全部配色但 setConfigurationValue 只接受当前配方配色」不一致——
 *   旧逻辑 applyRecipeForConfig 恒把 enum 同步为活动配方配色，跨主题配色选择被 enum 校验拒绝。
 * followTheme 模式：仅当前活动配方配色（配方内变体，applyRecipe 双语义同构）。
 * 空集（无活动配方）→ 跳过更新（保留上次 enum——应用前 themeColor 无可选配色，置空会把下拉变输入框）。
 * export：appearanceApplier.applyRecipeForConfig（替换原 inline updateConfigurationEnum）+
 *   config/appearance appearanceMode onApply + contributions.syncAppThemeEnum（生命周期四站点折叠）。
 */
export function syncThemeColorEnum(): void {
  // E5.8#90：外观主开关分派——custom = colors 域来源全集；followTheme = 配方内变体
  if (getConfigurationValue<string>("app.appearanceMode") === "custom") {
    const ids = ThemeRegistry.getRecipes().flatMap((r) => r.colorways.map((c) => c.id));
    updateConfigurationEnum("app.themeColor", [MIX_FOLLOW_THEME, ...ids]);
    return;
  }
  const active = getActiveRecipe();
  const recipe = active ? ThemeRegistry.getRecipe(active.recipeId) : undefined;
  if (!recipe) return; // 无活动配方——保留上次 enum
  updateConfigurationEnum("app.themeColor", recipe.colorways.map((c) => c.id));
}
