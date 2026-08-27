/**
 * 主题引擎门面——零逻辑，re-export 全部公共符号。实现按领域拆在 ThemeEngine/ 子模块（11 模块，依赖 DAG 无环）。
 * JSON 是源，CSS 变量是渲染层。用户和 AI 都改 JSON。
 * 外部 import 路径不变：`./ThemeEngine` 命中本文件、`./ThemeEngine/<module>` 命中子模块（feature-folder 惯例，
 * 先例 IpcBridgeHandler/KeybindingRegistry/SettingsView）。
 */

export type { Theme, ThemeSurface, ThemeBackground } from "./ThemeEngine/registry";
// E5.8 Phase 11.15 3b：unregisterTheme/getThemesByPlugin 零生产消费（仅测试）——从门面撤出，测试直引 ./registry
export {
  registerTheme, getAvailableThemes, loadTheme,
  findTheme, registerFallbackThemes,
} from "./ThemeEngine/registry";

export {
  SURFACE_SEAM_INSET_PX, RADIUS_SCALE_KEYS, MIX_FOLLOW_THEME, MIX_SOURCE_KEYS,
  CONFIG_NONE_SENTINEL, SYSTEM_FONT_STACK, SYSTEM_MONO_FONT_STACK,
  FONT_TONE_LIGHT_TEXT, FONT_TONE_DARK_TEXT, FONT_TONE_TEXT_KEYS,
  SURFACE_COLOR_KEYS, GLASS_SURFACE_DEFAULT_ALPHA, RADIUS_MAX_PX,
} from "./ThemeEngine/constants";

// E5.8 Phase 11.15 3b：getThemeVariables/getBaseRadius/synthesizeGlassSurfaces 仅内部消费
// （apply.ts/migration.ts 直引 ./tokens）——从门面撤出不暴露；测试直引 ./tokens
// E5.8#117：gateMirrorVisibility 已删除（panorama 镜像机制整体废除，cp114 证据）
export { getEffectiveTokens, applyRadiusAbsolute, applyOverrides } from "./ThemeEngine/tokens";

export { recipeDomains, mergeDomains } from "./ThemeEngine/recipe";

export type { MixProfile } from "./ThemeEngine/mix";
export { getMixProfile, isMixSourceOwner, mergeMixDomains, syncThemeColorConfig, syncThemeColorEnum } from "./ThemeEngine/mix";

export {
  isAssetFontPath, ensureFontFace, resolveRecipeFonts, cleanupPluginFontFaces, ensurePluginFontFacesCleanup,
} from "./ThemeEngine/fonts";

export {
  normalizeThemeValue, deriveRadiusAbsoluteMigration, deriveGlassOpacityAbsoluteMigration, resolveMergedAppearanceMode,
} from "./ThemeEngine/migration";

export { getActiveRecipe, getCurrentTheme, getAppliedAccent } from "./ThemeEngine/state";

export { applyAccentColor, getEffectiveAccentColor } from "./ThemeEngine/accent";

export { applyTheme, applyRecipe } from "./ThemeEngine/apply";

export type { AppearanceSeedValues, GlassSurfaceSpec } from "./ThemeEngine/seeds";
// E5.8 Phase 11.15 3b：getGlassSurfaceSpec 仅内部消费（apply.ts 直引 ./seeds）——从门面撤出不暴露
export {
  APPEARANCE_OVERRIDE_KEYS, deriveAppearanceSeeds, deriveAppearanceSeedMap,
  deriveReseedPlan, getThemeBaseTokens, getAppearanceOverrides,
} from "./ThemeEngine/seeds";
