/**
 * linkdesk-api appearance domain — split out of linkdesk-api.ts (E5.8#0d.10-9b).
 * The theme + language + appearance three namespace surfaces.
 * Dependency direction: appearance → ./types (LinkDeskTheme/LinkDeskLanguage); cross-composed by the aggregator.
 */

import type { LinkDeskTheme, LinkDeskLanguage, RecipeMeta } from "./types";

/** Theme + language + appearance asset namespace surfaces — modeled after the VS Code appearance surface */
export interface AppearanceAPI {
  theme: {
    /** Get the current theme ID */
    getCurrent(): Promise<string>;
    /** Get all available themes */
    getAvailable(): Promise<LinkDeskTheme[]>;
    /** Apply a theme */
    apply(themeId: string): Promise<void>;
    // ── E5.8#50.18: recipe/colorway 06 §2 six methods — listing goes through the API (data), selection goes through configuration (persisted app.*) ──
    /** All available recipes (including colorway variants + preview colors) — ThemePicker cards / data source for the colorway and mix-and-match dynamic SelectBox */
    listRecipes(): Promise<RecipeMeta[]>;
    /** Current active recipe/colorway — computed from merged configuration (getActiveRecipe + app.theme/app.themeColor fallback) */
    getActive(): Promise<{ recipeId: string; colorwayId: string } | null>;
    /** Currently effective token set (after merging) — seeds appearanceMode→custom, mix-and-match preview */
    getEffectiveTokens(): Promise<Record<string, string>>;
    /** Apply a recipe — persisted to app.theme (the colorway follows the recipe automatically) */
    setRecipe(recipeId: string): Promise<void>;
    /** Apply a colorway variant — persisted to app.themeColor */
    setColorway(colorwayId: string): Promise<void>;
    /** Reset appearance — aligned with the shell command: app.appearanceMode→followTheme (onApply cascades to clear 9 overrides + 6 domain origins + accent color back to the theme baseline, E5.8#90 merged) */
    resetAppearance(): Promise<void>;
    /** Reset mix-and-match — aligned with the shell command: batch resets the 3 origin keys back to follow theme (custom mode preserved; app.mixMode removed in E5.8#90, surface domain removed in #132) */
    resetMix(): Promise<void>;
    /** E5.8#88: appearance override keys → the full set of baseline seed values for theme/mix-and-match (baseline for the settings page "Modified" badge; no active recipe → null) */
    getBaselineSeeds(): Promise<Record<string, unknown> | null>;
  };

  language: {
    /** Get the current language ID */
    getCurrent(): Promise<string>;
    /** Get all available languages */
    getAvailable(): Promise<LinkDeskLanguage[]>;
    /** Switch the language */
    set(langId: string): Promise<void>;
    /** Get the initial language data (pushed by the shell when the WebView loads) */
    getInitial(): { lang: string; resources: Record<string, unknown> } | null;
    /** Subscribe to language changes — returns unsubscribe */
    onChange(cb: (data: { lang: string; resources: Record<string, unknown> }) => void): () => void;
  };

  /** E5.8#50.11: appearance assets — locally picked images are copied into managed storage (controlled source — user-chosen paths cannot be read directly via file://) */
  appearance: {
    /** Import an image into userData/appearance/ (deduplicated by name) — returns a controlled-protocol URL (linkdesk-userdata://…, E5.8#64),
     *  for app.backgroundImage persistence; the sandbox loads it via the privileged protocol (plain absolute paths are intercepted) */
    importImage(sourcePath: string): Promise<string>;
    /** E5.8#153: open the appearance storage directory (userData/appearance) — the main process resolves the path and uses shell.openPath to open the file explorer
     *  at the directory contents (not highlighting a single file); a missing directory is created too (opening reveals the storage location); an openPath failure throws fail-loud. */
    revealStorage(): Promise<void>;
  };
}
