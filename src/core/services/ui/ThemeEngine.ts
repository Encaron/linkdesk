/**
 * 主题引擎门面——零逻辑，re-export 全部公共符号。实现按领域拆在 ThemeEngine/ 子模块（11 模块，依赖 DAG 无环）。
 * JSON 是源，CSS 变量是渲染层。用户和 AI 都改 JSON。
 * 外部 import 路径不变：`./ThemeEngine` 命中本文件、`./ThemeEngine/<module>` 命中子模块（feature-folder 惯例，
 * 先例 IpcBridgeHandler/KeybindingRegistry/SettingsView）。
 */

export type { Theme, ThemeSurface, ThemeBackground } from "./ThemeEngine/registry";
export {
  registerTheme, unregisterTheme, getAvailableThemes, getThemesByPlugin, loadTheme,
  findTheme, registerFallbackThemes,
} from "./ThemeEngine/registry";

export {
  SURFACE_SEAM_INSET_PX, RADIUS_SCALE_KEYS, RADIUS_MAX_PX, MIX_FOLLOW_THEME, MIX_SOURCE_KEYS,
  CONFIG_NONE_SENTINEL, SYSTEM_FONT_STACK, SYSTEM_MONO_FONT_STACK,
  FONT_TONE_LIGHT_TEXT, FONT_TONE_DARK_TEXT, FONT_TONE_TEXT_KEYS,
} from "./ThemeEngine/constants";

export { getThemeVariables, getEffectiveTokens, getBaseRadius, applyRadiusAbsolute, applyOverrides } from "./ThemeEngine/tokens";

export { recipeDomains, mergeDomains } from "./ThemeEngine/recipe";

export type { MixProfile } from "./ThemeEngine/mix";
export { getMixProfile, isMixSourceOwner, mergeMixDomains, syncThemeColorConfig } from "./ThemeEngine/mix";

export {
  isAssetFontPath, ensureFontFace, resolveRecipeFonts, cleanupPluginFontFaces, ensurePluginFontFacesCleanup,
} from "./ThemeEngine/fonts";

export {
  normalizeThemeValue, deriveRadiusAbsoluteMigration, deriveGlassOpacityAbsoluteMigration, resolveMergedAppearanceMode,
} from "./ThemeEngine/migration";

export { getActiveRecipe, getCurrentTheme, getAppliedAccent } from "./ThemeEngine/state";

export { applyAccentColor, getEffectiveAccentColor } from "./ThemeEngine/accent";

export { applyTheme, applyRecipe } from "./ThemeEngine/apply";

export type { AppearanceSeedValues } from "./ThemeEngine/seeds";
export {
  APPEARANCE_OVERRIDE_KEYS, deriveAppearanceSeeds, deriveAppearanceSeedMap,
  deriveReseedPlan, getThemeBaseTokens, getAppearanceOverrides,
} from "./ThemeEngine/seeds";
