/**
 * Shell→pool event relay payload contract—E5.7#97.
 *
 * All payloads below travel the same relay pipeline (shell emit → main-process IpcBridge.broadcast → plugin:push dispatch
 * → pool events.on); previously each end wrote bare literals + `as any` unwrapping on its own. The union literal is defined in one place,
 * and the shell emit side / pool preload subscription side import type—renaming a field makes tsc fail on both ends.
 */

import type { ThemeDomain } from "../theme";

/** Config change—config:changed / plugin:push(config.changed) payload */
export interface ConfigurationChangedPayload {
  key: string;
  value: unknown;
}

/** @font-face spec (E5.8#50.17 asset fonts)—the shell registers it and broadcasts to pools for replication (a pool is a separate document; @font-face does not inherit across documents) */
export interface FontFaceSpec {
  /** Registered family name (engine-derived `__ld_{pluginId}_{stem}`)—font-family references this; the first link of the two-step mechanism */
  family: string;
  /** Font asset URL (linkdesk://{pluginId}/{path} or an absolute URL written by the author) */
  url: string;
  /** src format hint (woff2/woff/ttf/otf inferred from the extension) */
  format?: string;
}

/** Theme change—the theme:changed payload (themeType + CSS variables table + asset font-family replication table).
 *  E5.8#50.18: recipeId/colorwayId/domains appended—only present when applyRecipe commits;
 *  flat applyTheme (legacy-format bridge) omits them—existing consumers (pool events.ts reads themeType/variables/fontFaces) need zero changes. */
export interface ThemeChangedPayload {
  themeType: string;
  variables: Record<string, string>;
  /** All @font-face involved in the current recipe—replicated and injected pool-side; a recipe without asset fonts → omitted (the pool clears the previous injection) */
  fontFaces?: FontFaceSpec[];
  /** Currently active recipe id—present when applyRecipe commits; omitted in flat applyTheme state */
  recipeId?: string;
  /** Currently active colorway id—present when applyRecipe commits; omitted in flat applyTheme state */
  colorwayId?: string;
  /** List of currently effective domains—fine-grained consumption (mix-and-match preview refreshes per domain, 06 §6.2); in flat applyTheme state = all six domains */
  domains?: ThemeDomain[];
}

/** Accent color change—the accent:changed payload (CSS variables table only) */
export interface AccentChangedPayload {
  variables: Record<string, string>;
}

/** Plugin state change—the plugin-state:changed payload (cross-WebView state sync primitive) */
export interface PluginStateChangedPayload {
  pluginId: string;
  key: string;
  value: unknown;
}

/** Tab activated—the tab:activated payload */
export interface TabActivatedPayload {
  tabId: string;
  pluginId: string;
  filePath?: string;
}

/** Active workspace change—the workspace:activeChanged payload */
export interface WorkspaceActiveChangedPayload {
  uri: string;
}

/** Settings navigation—the settings:requestGroup payload */
export interface SettingsRequestGroupPayload {
  pluginId: string;
}

/** Settings scroll positioning—the settings:scrollTo payload */
export interface SettingsScrollToPayload {
  key: string;
}

/** Settings switch to the keybindings tab—the settings:requestOpenKeybindings payload (E5.8#41.14 contract channel replacing the mismatched dead route via window events) */
export interface SettingsOpenKeybindingsPayload {
  /** Pre-fills the search box with a command name (the "Open Keyboard Shortcuts" command's opts.query) */
  query?: string;
}

/** plugin:push relay envelope—the main process's broadcast wrapper (channel + payload).
 *  Originally the local PluginPushData in electron/event-system.ts—consolidated here in E5.7#97. */
export interface PluginPushEnvelope {
  channel: string;
  payload: unknown;
  source?: string;
}
