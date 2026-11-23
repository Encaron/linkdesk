/**
 * 主题应用入口——applyTheme（flat 桥接）/ applyRecipe（配方）。合并 token → commitTokens（tokens.ts）写 :root + 广播。
 * 依赖：recipe（mergeDomains/recipeDomains/resolveColorway）+ mix（mergeMixDomains/getMixProfile/resolveFontSource/
 * resolveMixDomainRecipe/resolveDomainSource）+ tokens（getThemeVariables/commitTokens/applyOverrides/
 * synthesizeGlassSurfaces）+ fonts（resolveRecipeFonts）+ seeds（getAppearanceOverrides/getGlassSurfaceSpec）+
 * state（setActiveRecipe/setCurrentTheme）。
 */

import { getConfigurationValue } from "../../configuration/ConfigurationService";
import type { ThemeRecipe, ThemeDomain } from "../../../types/theme";
import type { FontFaceSpec } from "../../../types/ipc/events";
import { MIX_DOMAIN_ORDER } from "./constants";
import type { Theme } from "./registry";
import { resolveColorway, recipeDomains, mergeDomains } from "./recipe";
import {
  getMixProfile, mergeMixDomains, resolveFontSource, resolveMixDomainRecipe, resolveDomainSource,
} from "./mix";
import { getThemeVariables, commitTokens, applyOverrides, synthesizeGlassSurfaces, synthesizeIconGlow } from "./tokens";
import { resolveRecipeFonts } from "./fonts";
import { resolvePolarity } from "./color";
import { applyHighContrast, highContrastEnabled } from "./contrast";
import { getAppearanceOverrides, getThemeGlassSurfaceSpec, getIconGlowSpec } from "./seeds";
import { setActiveRecipe, setCurrentTheme } from "./state";

/** 应用主题（flat 桥接）：colors + 玻璃/背景/悬浮 + 用户覆盖 + 玻璃表面合成 → 写 :root + 广播。 */
export function applyTheme(theme: Theme): void {
  // E5.8#50.6：全量写入 colors + 玻璃/背景/悬浮——玻璃变量每次都写（缺省零值），
  // 玻璃主题切回普通主题自动清零不残留；重复应用幂等。
  const variables = getThemeVariables(theme);
  // E5.8#50.10：用户外观配置覆盖主题基线（radius scale 系数 / 玻璃绝对）——
  // applyOverrides 内 JS 乘算（对主题现值/壳默认），一次写 :root + 一次广播，无双广播竞态。
  applyOverrides(variables, getAppearanceOverrides());
  // E5.8 Phase 11.16：玻璃系统标尺化——合成放覆盖后、提交前（玻璃激活 → 表面配色键半透明；
  // 未激活 → 零变化。绝不放 mergeDomains 内部——getThemeBaseTokens 纯基线语义）。
  // 2026-11-23：玻璃激活 = 用户配置 ∨ **主题声明**（跟随主题也合成）——表面 alpha 来自
  // 用户 glassOpacity（custom）或主题 glass.opacity（followTheme），不再依赖 rgba 写法。
  synthesizeGlassSurfaces(variables, getThemeGlassSurfaceSpec(theme.surface));
  // 2026-11-24 极性归一化：渲染真相 = 生效 token 派生（type 只作 hint）。图标晕/提交/广播/快照共用。
  let polarity = resolvePolarity(variables, theme.type);
  // 2026-11-24 高对比（用户级 · 正交）：没有作者 HC colorway 时派生安全 token；accent 身份保留。
  if (highContrastEnabled()) {
    applyHighContrast(variables, polarity); // 派生值与极性同向，无需重算（named 色不在 luminance 解析面）
  }
  // 主题前景可读性 · 第 1 刀：图标反向光晕——挂底图时按墨色极性发 filter 串（同位置：覆盖后、提交前）
  synthesizeIconGlow(variables, getIconGlowSpec(polarity));
  commitTokens(variables, polarity, { recipeId: theme.name });
  setCurrentTheme(theme);
  // flat apply 清 recipe 态——两路径互斥（#50.18 IPC 接线后 flat 桥退役）
  setActiveRecipe(null, null);
}

/**
 * 应用配方——mergeDomains → 写 :root + 广播 theme:changed。
 * colorwayId 缺省 = 配方首配色；overrides 缺省 = 读用户外观配置（app.*，getAppearanceOverrides）。
 * 同步 flat 快照到 currentTheme——getCurrentTheme/强调色广播（ThemeBrowser 等 bridge 消费方）兼容。
 */
export function applyRecipe(
  recipe: ThemeRecipe,
  colorwayId?: string,
  overrides?: Record<string, string | number>
): void {
  const colorway = resolveColorway(recipe, colorwayId);
  // E5.8#50.26：自定义模式 → 混搭合并（每域各自取来源）；否则单配方路径（零回归）。
  // E5.8#90：外观模型合并——app.mixMode 删，外观主开关 appearanceMode=custom 即「按域混搭」。
  const isMix = getConfigurationValue<string>("app.appearanceMode") === "custom";
  let effective: Record<string, string>;
  let fontFaces: FontFaceSpec[];
  let domains: ThemeDomain[];
  let effectiveColors: Record<string, string> = {};

  if (isMix) {
    const profile = getMixProfile();
    // 字体域来源配方（followTheme → 当前配方）——资产字体两步解析在源配方上（#50.17）
    const fontSource = resolveFontSource(recipe, profile);
    const { appearance: fontAppearance, fontFaces: faces } = resolveRecipeFonts(fontSource);
    effective = mergeMixDomains(recipe, colorway, profile, overrides ?? getAppearanceOverrides(), {
      recipeId: fontSource.id,
      appearance: fontAppearance,
    });
    fontFaces = faces;
    // 混搭下生效集可触及全部域——广播全域（池侧按 variables 全量写入，domains 为细粒度刷新信号）
    domains = MIX_DOMAIN_ORDER;
    // currentTheme 快照用生效配色（accent 跟随主题取混搭颜色域来源的 accent，非整体配方默认）
    effectiveColors = resolveDomainSource("colors", profile, recipe, colorway).colorway?.colors ?? colorway.colors ?? {};
  } else {
    // E5.8#50.17：资产字体两步解析——appearance.font 资产相对路径 → @font-face 注册 + 换族名
    // （副作用在注册；纯合并用解析后的 appearance；fontFaces 广播给池复刻）
    const { appearance, fontFaces: faces } = resolveRecipeFonts(recipe);
    effective = mergeDomains({ ...recipe, appearance }, colorway.id, overrides ?? getAppearanceOverrides());
    fontFaces = faces;
    domains = recipeDomains(recipe);
    effectiveColors = colorway.colors ?? {};
  }

  // E5.8 Phase 11.16：玻璃系统标尺化——合成放覆盖（mergeDomains/mergeMixDomains 内已 applyOverrides）后、
  // 提交前（玻璃激活 → 表面配色键半透明；未激活 → 零变化。绝不放 merge 内部——纯基线语义）。
  // 2026-11-23：玻璃激活 = 用户配置 ∨ **主题声明**（跟随主题也合成）；surface 只在末尾算一次，两处复用。
  const glassSurface = isMix
    ? resolveMixDomainRecipe("glass", getMixProfile(), recipe, colorway).appearance?.glass
    : recipe.appearance?.glass;
  // 2026-11-24 高对比 = 正交轴：作者的 `traits.contrast="high"` 配色是**开关的内部资源**
  // （不再作为用户可选配色出现在 Colors 列表）。选了高对比且有同极性作者配色 → 用它的色彩覆盖生效集
  // （稀疏合并，缺键保留基色），之后不再派生；没有作者配色 → 走 applyHighContrast 安全派生。
  let authorHigh = colorway.traits?.contrast === "high";
  if (!authorHigh && !isMix && highContrastEnabled()) {
    const wantPolarity = resolvePolarity(effective, recipe.type);
    const high = recipe.colorways.find(
      (c) => c.traits?.contrast === "high" && resolvePolarity(c.colors ?? {}, recipe.type) === wantPolarity
    );
    if (high) {
      Object.assign(effective, high.colors ?? {});
      authorHigh = true;
    }
  }
  synthesizeGlassSurfaces(effective, getThemeGlassSurfaceSpec(glassSurface));
  // 2026-11-24 极性归一化：派生值 = 渲染真相；声明 type 只作 token 解析失败的 hint。
  let polarity = resolvePolarity(effective, recipe.type);
  if (highContrastEnabled() && !authorHigh) {
    applyHighContrast(effective, polarity);
  }
  // 主题前景可读性 · 第 1 刀：图标反向光晕（同位置；未显式 fontTone 时回落派生极性）
  synthesizeIconGlow(effective, getIconGlowSpec(polarity));
  commitTokens(
    effective,
    polarity,
    { recipeId: recipe.id, colorwayId: colorway.id, domains },
    fontFaces
  );
  setActiveRecipe(recipe.id, colorway.id);
  setCurrentTheme({
    name: recipe.name,
    type: recipe.type,
    colors: effectiveColors,
    // E5.8#59（审计#7 附注）：mix 下 surface/background 取混搭各域生效来源配方——原取基础配方
    // appearance.glass/background 与生效玻璃/背景来源不符（resolveMixDomainRecipe 同 mergeMixDomains 含缺域回退）
    surface: glassSurface,
    background: isMix
      ? resolveMixDomainRecipe("background", getMixProfile(), recipe, colorway).appearance?.background
      : recipe.appearance?.background,
  });
}
