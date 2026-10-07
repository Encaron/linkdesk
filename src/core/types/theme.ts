/**
 * Pure types for the theme data model—the 05 schema (Recipe + Colorway) implementation.
 * Shell directory convention §1: types/ holds cross-module shared pure types (imported by all three of src / electron / contracts).
 *
 * Design basis: doc 05 of the appearance-theming series in the Chinese docs tree (theme data model dossier; decisions A-F frozen).
 * In one sentence: a theme file = one recipe Recipe = the style domain appearance (single-value, sparse) + colorway variants colorways[] (multi-value color domains);
 * sparse overriding; missing domains inherit the :root shell defaults. New themes always use colorways[] (decision F: single authoring form).
 */

/** Color token set—keys = variable-contract token names minus `--` (--bg-window → "bg-window") */
export interface ThemeColors {
  [key: string]: string;
}

/** E5.8#50.6: glass + floating panel texture fields—theme JSON `surface` (omitted = no glass, no floating).
 * Texture is orthogonal to glass (⑬ paper-texture zones work without glass via per-surface textures). */
export interface ThemeSurface {
  /** Glass recipe—omitted = no glass */
  type?: "glass";
  /** Backdrop blur px—0 = off */
  blur?: number;
  /** Saturation boost—1 = off */
  saturate?: number;
  /** Color layered over the glass surface */
  tint?: string;
  /** Glass surface opacity (the compositing-layer baseline)—1 = opaque / 0 = fully see-through to the background. Writes the --glass-opacity token (consumed by the tint overlay's
   *  opacity) + seeds a back-computed compositing alpha (#112: the recipe's surface baseline; takes priority when the user's app.glassOpacity overrides) */
  opacity?: number;
  /** Liquid-glass top highlight intensity—0 = off */
  specular?: number;
  /** E5.8#63: top highlight base color (the hairline-light edge color)—omitted = white; alpha still goes through specular */
  specularColor?: string;
  /** Morph transition ms—0 = off */
  morph?: number;
  /** Floating corner radius px—0 = square, flush to the edge */
  radius?: number;
  /** Lifted drop shadow—true = floating shadow (the engine maps --shadow-lift) */
  shadow?: boolean;
  /** E5.8#50.28: tileable texture image asset path (⑬ paper-texture zones)—applied to all 5 zone surfaces; independent of glass, takes effect on its own */
  texture?: string;
  /** Texture opacity—1 = opaque */
  textureOpacity?: number;
}

/** E5.8#50.6: image background texture fields—theme JSON `background` (omitted = no image) */
export interface ThemeBackground {
  /** Image path—the author provides a resolvable URL; the engine wraps it in url() when writing `--bg-image` */
  image?: string;
  /** Image layer opacity—1 = opaque. The engine writes `--bg-opacity` (the .background-layer crisp base image) + `--surface-bg-opacity`
   *  (the mirror/texture/slice ::after image layers); when the user's app.backgroundOpacity overrides, both tokens are written together (#115: the image and base fade out uniformly, avoiding a faded base image while the mirror stays fully visible) */
  opacity?: number;
  /** Image mask lightness/darkness (0-1 rgba alpha)—0 = no mask */
  mask?: number;
  /** E5.8#63: mask base color (the darkening layer's color)—omitted = black; alpha still goes through mask. Only effective in panorama (same as mask) */
  maskColor?: string;
  /** E5.8#50.29: slicing mode—"panorama" (default) = full-window semantics unchanged; "zones" = the same image sliced continuously across the 5 zone surfaces (⑭ imagery zones) */
  mode?: "panorama" | "zones";
}

/** Font domain—a system font family name string or an asset relative path (#50.17 two-step mechanism: asset → @font-face → family name) */
interface ThemeFont {
  /** UI font (--font-ui) */
  ui?: string;
  /** Monospace font (--font-mono) */
  mono?: string;
}

/** Single authority for the six-step relative radius scale names—the schema step names (xs..2xl) and the engine token keys (radius-xs..radius-2xl) are two expressions of the same concept;
 *  ThemeEngine/constants.ts RADIUS_SCALE_KEYS derives from this (`radius-${s}`), preventing the two lists from drifting (E5.8#122). */
export const RADIUS_SCALE_STEPS = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;

/** Six-step relative radius scale name union type—derived from RADIUS_SCALE_STEPS (single source) */
export type RadiusScaleStep = (typeof RADIUS_SCALE_STEPS)[number];

/** Radius domain—eight semantic token names (02 §2.2; off-beat values merge into the nearest step; the six derived steps plus the shape values pill/full) */
type RadiusTokenKey = RadiusScaleStep | "pill" | "full";

/**
 * The 05 schema appearance domain—style domain (single-value, sparse overriding; missing domains/keys inherit the :root shell defaults).
 * Keys = variable-contract token names minus `--`; values = bare values (the engine concatenates them back when writing :root).
 * glass reuses all ThemeSurface fields (material + floating shape + texture)—semantically consistent with the #50.6 engine surfaceVariables.
 */
export interface ThemeAppearance {
  /** Radius eight steps (keys = step names, values = px) */
  radius?: Partial<Record<RadiusTokenKey, number>>;
  /** Glass + floating panels + texture—05 §2 appearance.glass */
  glass?: ThemeSurface;
  /** Font domain */
  font?: ThemeFont;
  /** Background domain (panorama full-window / zones sliced) */
  background?: ThemeBackground;
}

/** The 05 schema colorway—one concrete set of values for the color domain (sparse; unwritten color tokens inherit :root) */
export interface ThemeColorway {
  /** Colorway id—globally unique (the app.themeColor dynamic enum stores this) */
  id: string;
  /** Colorway display name */
  name: string;
  /** Color token set (--bg-* / --text-* / --accent etc., keys minus the -- prefix) */
  colors?: ThemeColors;
}

/**
 * The 05 schema recipe = one theme file = shared style domain + colorway list.
 * id is globally unique (convention = the plugin's short name)—app.theme stores this; name = the theme picker title.
 * New themes always use colorways[] (decision F: single authoring form; the engine only reads the new format).
 */
export interface ThemeRecipe {
  id: string;
  name: string;
  type: "light" | "dark";
  /** Style domain (single-value, sparse)—missing domains inherit the :root shell defaults */
  appearance?: ThemeAppearance;
  /** Colorway list (at least 1 item; multi-value color domain) */
  colorways: ThemeColorway[];
}

/** Recipe contribution domains—shared by theme metadata domains (mix-and-match source filtering) and the theme:changed payload (domain-level fine-grained refresh) (06 §2/§6.2).
 *  Five domains: colors (colorways always contribute) + the four appearance style domains (radius/glass/font/background).
 *  E5.8#132: the surface domain removed—per-surface fine-tuning keys are dead (decision A removal); the glass surface shape tokens (--surface-*) belong to the glass domain. */
export type ThemeDomain = "colors" | "font" | "radius" | "glass" | "background";
