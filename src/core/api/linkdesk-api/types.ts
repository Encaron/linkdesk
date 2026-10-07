/**
 * linkdesk-api type domain — split out of linkdesk-api.ts (E5.8#0d.10-9a).
 * Standalone type interfaces (not LinkDeskAPI members): LinkDeskCommand/LinkDeskCommandParam/LinkDeskTheme/LinkDeskLanguage/
 * LinkDeskConfigSchema/PluginListEntry/PluginInstallResult/PluginInfoEntry/PluginListSubset/EnvInfo/
 * FileDecoration/FileDecorationProvider/MenuItemDescriptor/NotificationHandle/PluginToastAction — 15 interfaces verbatim.
 * DialogOpenOptions stays as a path re-export in the aggregator (../../types/ipc/dialogs).
 * Dependency direction: types → ../types (PluginManifest); imported by 10 namespace domain files (they depend on this base, never the reverse).
 */

import type { PluginManifest } from "../types";
import type { ThemeSurface, ThemeBackground } from "../../services/ui/ThemeEngine";
import type { ThemeDomain } from "../../types/theme";

/**
 * Command parameter descriptor — M1 `AI#7`: commands **carry their own parameter descriptions**, returned together with `commands.getCommands()`.
 * Positional semantics: `params[i]` maps **one-to-one by position** to handler arguments (`name` follows the handler's argument name, ⛔ do not invent another) —
 * consumers (menus/plugins/automation) can assemble `executeCommand(id, ...params)` from it without reading source code.
 */
export interface LinkDeskCommandParam {
  /** Parameter name — follows the handler argument name (e.g. `tabId` / `settingKey` / `groupId`) */
  name: string;
  /** Parameter type — converged to four values (object = structured payload; field details go in description) */
  type: "string" | "number" | "boolean" | "object";
  /** Whether required — defaults to `false` (optional) */
  required?: boolean;
  /** One-sentence description of what this parameter is (omitted = the name is self-explanatory) */
  description?: string;
}

export interface LinkDeskCommand {
  id: string;
  title: string;
  category?: string;
  /**
   * M1 `AI#7`: what this command **does** — the intent from the user/AI perspective (i18n key = original Chinese text, same convention as title),
   * ⛔ do not restate the command id (the id is already given by the field itself). Optional, purely additive — existing commands may omit it.
   */
  description?: string;
  /** M1 `AI#7`: parameter structure (positionally mapped to handler arguments). Optional, purely additive; omit for commands without parameters. */
  params?: LinkDeskCommandParam[];
}

export interface LinkDeskTheme {
  name: string;
  type: "dark" | "light";
  /** E5.8#50.6: glass/floating texture — theme JSON `surface` (omitted = no glass, no floating) */
  surface?: ThemeSurface;
  /** E5.8#50.6: image background — theme JSON `background` (omitted = no image) */
  background?: ThemeBackground;
  pluginId?: string;
}

export interface LinkDeskLanguage {
  id: string;
  label: string;
  pluginId: string;
}

/** E5.8#50.18: colorway metadata — returned by theme.listRecipes() (elements of colorways[], spec 06 §2).
 *  Preview colors feed the ThemePicker cards; a single-colorway recipe = 1 entry. */
export interface ColorwayMeta {
  /** Colorway id — globally unique (input to theme.setColorway; the app.themeColor dynamic enum stores this) */
  id: string;
  /** Colorway display name */
  name: string;
  /** Preview colors — accent + window background (used to color card badges; the default colorway lacks this token → empty string) */
  preview: { accent: string; bgWindow: string };
}

/** E5.8#50.18: recipe metadata — returned by theme.listRecipes() (all available recipes + colorways + preview colors, spec 06 §2).
 *  domains = which domains the recipe contributes (basis for mash-up source filtering, spec 10 §2); type = light/dark category. */
export interface RecipeMeta {
  id: string;
  name: string;
  type: "light" | "dark";
  colorways: ColorwayMeta[];
  domains: ThemeDomain[];
}

/**
 * 🔥 Canonical vocabulary for settings control hints (`uiHint`) — the single vocabulary between host declarations and the rendering layer (criterion B).
 *
 * The 14 values = the full set of control shapes the settings page dispatcher can render (same source, case by case, as the switch in the settings plugin's `renderControl.tsx`).
 * ⚠️ `fileAssociationsManager` (added in wave 4) is **not a single control** — it is the mount point for an **entire group of custom views**:
 *   the group owning the key that declares it is rendered by the settings plugin as a "default open-with" manager (competing types / browse-by-plugin sections),
 *   unlike the "inline control" shape of the other hints (see the settings repo's `file-associations-manager/`).
 * Consumers: ① the host's `ConfigurationRegistry.ConfigProperty` (compile-time narrowing ⇒ a wrong declaration turns red on the spot)
 * ② the settings plugin dispatch table ③ the description in the author-facing `plugin.schema.json` (the canonical table shown to third-party authors).
 * ⚠️ **The declaring field itself stays an open `string`** (both `LinkDeskConfigProperty.uiHint` in this file and the author-facing schema)
 *   — third-party custom hints are legitimate (E5.7#74 promise, not withdrawn); a hint the renderer does not know ⇒ degrade to **read-only display + title explanation**,
 *   ⛔ no longer falling into an editable fallback (prevents bare strings from punching through the value domain).
 * The runtime list and type guards live in `@linkdesk/ui` (`SETTINGS_UI_HINTS` / `isSettingsUiHint`) —
 * this contract package is a **pure type-generation artifact with zero runtime** and can only carry types.
 */
export type SettingsUiHint =
  | "themePicker"
  | "select"
  | "accentSource"
  | "slider"
  | "image"
  | "fontTone"
  | "fontFamily"
  | "color"
  | "file"
  | "directory"
  | "fontSize"
  | "segmented"
  | "stringList"
  | "fileAssociationsManager";

/**
 * Canonical render hint for settings rows (`renderHint`) — three values.
 * `readonly` read-only status row (value comes from the `statusCommand` runtime data source, not from config storage);
 * `action` action button (label = `description`, click runs `actionCommand`); `color` color swatch preview
 * (used by the shell's `app.accentColor` / `app.glassTint`). Same as uiHint: the declaring side stays an open `string`; unknown values degrade.
 * 🆕 Settings row case 2.1 (2026-10-04 · companion-declaration orthogonalization): `readonly`/`action` are shorthands for "the primary control is itself";
 * `statusCommand`/`actionCommand` can coexist with **any** primary control (rendering `[primary control][companion button][companion read-only]`).
 */
export type SettingsRenderHint = "readonly" | "action" | "color";

/** A single property definition in a config schema — E5.8#41.14 🛤 completes uiHint/minimum/maximum/renderHint/dependsOn
 * (the shell's SettingsView renderControl/SettingRow official control switching + dependency show/hide fields, aligned with SettingsView/types ConfigProperty) */
export interface LinkDeskConfigProperty {
  type: string;
  default?: unknown;
  description?: string;
  /** 🆕 Config item short name (D1/D2, 2026-10-04): row-level display name — the settings page row name and the marketplace feature page row render from it (optional).
   *  Value convention same as description: original Chinese text = i18n key; the en translation is supplied by the declarer (plugin repo i18n/en.json / shell-side lang-defaults);
   *  undeclared = render falls back to showing the config key (D2/E1 — zero impact on existing third-party plugins; the export surface only grows). */
  title?: string;
  enum?: string[];
  enumDescriptions?: string[];
  /** Control hint — uiHint takes priority: the declarative control choice in plugin.json (renderControl reads it to switch controls).
   *  For the list of known values see `SettingsUiHint` (canonical); **open string** — third parties may declare custom hints. */
  uiHint?: string;
  /** Numeric lower bound — min validation for numeric uiHint controls */
  minimum?: number;
  /** Numeric upper bound — max validation for numeric uiHint controls */
  maximum?: number;
  /** Render hint — renderControl's second criterion (known values see `SettingsRenderHint`: action action button / readonly read-only status row
   *  / color swatch preview). **Open string** — unknown values degrade to read-only display. */
  renderHint?: string;
  /** Monospace restriction — only meaningful for uiHint "fontFamily". true/omitted = list monospace families only (editor fonts); false = all font families (UI fonts). E5.8#50.20 */
  monoOnly?: boolean;
  /** Dependency condition — this item shows only when the config value of dependsOn.key === value (SettingRow reads it to show/hide the whole row) */
  dependsOn?: { key: string; value: unknown };
  /** Dynamic dropdown data source — read when uiHint is "select" (calls theme.listRecipes() at render time, E5.8#50.23).
   *  "theme.colorways" = colorways of the active recipe (app.theme) (options carry preview swatches);
   *  "theme.sources" = mash-up sources (filtered by optionsFromDomain over RecipeMeta.domains). */
  optionsFrom?: string;
  /** Mash-up source domain filter — when optionsFrom is "theme.sources", filters RecipeMeta.domains by this domain (the six domains of spec 10 §2) */
  optionsFromDomain?: ThemeDomain;
  /** Button action — runs this shell command on click (triggered by third-party settings UIs via commands.executeCommand).
   *  Settings row case 2.1: **companion declaration** — coexists with any primary control ⇒ the companion button to the right of the primary control (label = `description`). E5.8#50.26 */
  actionCommand?: string;
  /** M4 AI#38.12 (P-2 decision A): runtime data source for read-only status — runs this shell command at render time to fetch the value
   *  (returns a string; the display wording is assembled on the command side). The value comes from the command, not from config storage — a general capability any plugin can use.
   *  Settings row case 2.1: **companion declaration** — coexists with any primary control ⇒ the companion read-only to the right of the primary control (reuses the read-only base's polling). */
  statusCommand?: string;
  /** E5.8#50.26: disable condition for renderHint "action" buttons — disabled when all {key,value} pairs match the current config values */
  actionDisabledAll?: Array<{ key: string; value: unknown }>;
  /** E5.8#78: secondary heading within a group — SettingsView groups keys with the same group under a subheading; without group it stays flat (zero intrusion) */
  group?: string;
  /** E5.8#77: numeric unit — value-label unit for uiHint "slider" ("×" / "px"; empty = bare number) */
  unit?: string;
}

/** Config schema — key → property definition (index signature kept for existing consumers) */
export interface LinkDeskConfigSchema {
  [key: string]: LinkDeskConfigProperty;
}

/** Configuration contribution entry — the shape returned by configuration.getConfigurationContributions() (E5.8#41.14 🛤 naming).
 * Aligned with the [pluginId, { title, subtitle?, groupDescriptions?, properties }] assembled by the shell's ConfigurationRegistry — third-party settings UIs no longer need casts */
export type LinkDeskConfigurationContribution = [
  string,
  {
    title: string;
    /** M4 AI#38.12 (P-3 decision A): one-line subtitle under the section's main title (optional; undeclared = not rendered, zero intrusion) */
    subtitle?: string;
    /** M4 AI#38.12 (P-3 decision A): one-line small text under each group heading — key = the group's original text (optional, zero intrusion) */
    groupDescriptions?: Record<string, string>;
    properties: Record<string, unknown>;
  }
];

/** Discovery entry — returned by plugins.listAll() (E6#9a: the main process scans all subdirectories of plugins/ directly, replacing the renderer's import.meta.glob).
 *  Plugins installed via bundling/marketplace are not in the source tree — glob cannot discover them; listAll treats the disk as the single source of truth, same surface for dev/prod.
 *  The full manifest is plain JSON data (IPC-serializable); statusBar/contributes etc. travel with the manifest
 *  (#9b: the statusBar entry is derived by the consumer from manifest.statusBar, no separate channel needed). */
export interface PluginDiscoveryEntry {
  pluginId: string;
  /** manifest.entry — the plugin's JS entry (absent = pure-contribution plugin, manifest only, no components) */
  entry?: string;
  /** Full plugin.json */
  manifest: PluginManifest;
  /** E6#7 (1.2-4): the directory contains index.bundle.js = an unpacked SDK-packaged .linkdesk-plugin artifact.
   *  A disk-format fact (not plugin identity — hard constraint 11); a bundle plugin's JS entry is always index.bundle.js (basis for the runtime branch). */
  bundle?: boolean;
  /** E6#7 (1.2-4): disk-location fact — home = code root (app = read-only app plugin root / userData = {userData}/plugins, the user-installed home).
   *  subdir = always null after the 2026-09-05 flattening to a single root (the flat tree's root-direct scan produces no subdirectories; the type keeps null for downstream null-safety). */
  origin?: { home: "app" | "userData"; subdir: string | null };
}

/** E6#7 (1.2-4): returned by plugins.resolveEntry() — sibling of resolvePath (discovery family, not the install handler).
 *  The pool/runtime assembles both dev /@fs and prod linkdesk:// URLs from { root, entry }. */
export interface PluginEntryInfo {
  /** Absolute path of the plugin directory (forward slashes); null = plugin does not exist */
  root: string | null;
  /** Entry file name — bundle → "index.bundle.js"; source → manifest.entry (default "src/index.tsx"); none = null */
  entry: string | null;
  /** Whether the directory contains index.bundle.js (bundle-format fact) */
  bundle: boolean;
}

/** Plugin list entry — returned by pluginManager.list() (manifest subset serialized by the main process).
 *  E5.7#98: Partial<PluginManifest> was too wide (component and other fields unreachable over IPC) — narrowed to the
 *  7 fields actually serialized by the IpcBridgeHandler.handlePluginsCall "list" branch, consumed by the marketplace.
 *  E5.8#15.5: pendingReason — the reason a plugin is parked for missing dependencies ("waiting for dependency: xxx"); undefined = not parked.
 *  A value = the plugin is installed but its dependencies are not ready (PENDING); list/detail show a waiting state. */
export interface PluginListEntry {
  pluginId: string;
  manifest: PluginListSubset;
  /** Parked reason for missing dependencies — the marketplace shows a PENDING badge + a detail hint bar (E5.8#15.5) */
  pendingReason?: string;
  /** E6#73j (G6): where this plugin **lives** — `true` = in the user-installed home (`{userData}/plugins`), replaceable by a downloaded package.
   *  `false` = the read-only app root (bundled ship-with-package plugins / plugins installed from a directory source) — the update flow necessarily throws "not in the user install area" for it,
   *  and the marketplace **must not** render "update to vX" (a dead button that fails on click; including the 8 official bundled plugins).
   *  The single source of the criterion = `isPluginUpdatable` (a disk-residence fact, not plugin identity — hard constraint 11). */
  updatable?: boolean;
}

/** E5.7#81: install result — on success:false, error is the failure reason (in Chinese; validation / version conflict / copy failure).
 *  Install progress events: events.on("plugin:installProgress", ({ stage, pluginId, message }) => ...)
 *  stage: validating | copying | loading | done | error
 *  E5.7#83: load/unload broadcast (shell loader → the single Pool):
 *  events.on("plugin:installed", ({ pluginId, version, reason }) => ...) reason: install | reinstall
 *  events.on("plugin:uninstalled", ({ pluginId, reason }) => ...) reason: uninstall */
export interface PluginInstallResult {
  success: boolean;
  pluginId?: string;
  version?: string;
  needRestart?: boolean;
  error?: string;
  /** E6#73q (archive 18 §V I.6-7): the third terminal state — **installed but missing dependencies** (it is installed, shows in the list, but is unusable).
   *  When true, success is also true (the files really did land on disk), but consumers **must not render it as "✓ installed"** — that would be lying.
   *  The job row shows "installed but missing dependencies: {name}". */
  parked?: boolean;
  /** E6#73d: the user clicked "Cancel install" on the panel — **not a failure** (`success` being false just means "the install did not happen").
   *  Consumers **must not** take the failure branch off this (no error toast, no [Retry] push, no red row) — the user actively stopped it, intent already expressed;
   *  reporting the error again would weaponize the user's own decision against them. The job row is **removed entirely** by the queue side (no ✗ rendered). */
  cancelled?: boolean;
}

/** E6#73q: install request-side identity — the job table dedupes by pluginId and job rows need display names, but only the pool side knows both
 *  (the display name today exists only in the pool-side catalog store; the shell cannot get it).
 *  jobId is **not here**: it is a product of the shell-side job table (single producer); the pool side claims it from the `plugin:installJobs` broadcast. */
export interface PluginInstallRequestOpts {
  /** Ledger source (the source of add); defaults to user */
  ledgerSource?: "user" | "marketplace";
  /** Plugin id — the job table's dedup key + the pluginId in the broadcast payload; pass it if the pool-side catalog entry is known */
  pluginId?: string;
  /** Display name — job row text; falls back to pluginId when omitted */
  displayName?: string;
  /** Job origin — row = one user action (user, default); dependencies dragged in by a plugin (dependency) hide inside that row */
  origin?: "user" | "dependency";
  /**
   * E6#73o: dependency resolution catalog — when passed, **missing** dependencies in this plugin's `requires` are
   * auto-installed first by the shell **within the same install job** (inline recursion, no second slot — dependency resolution reuses updateCheck against this catalog for the latest direct link).
   * Omit = behavior identical to today (parked on missing dependency). Resolution radius = this catalog (the shell has no built-in catalog URL).
   * Design decision: see the repo-internal design dossier on dependency-chain auto-install for the plugin marketplace (Chinese docs tree, ledger anchor preserved above).
   */
  catalogUrl?: string;
}

/** E6#73c: job identity for install progress — travels with the shell-side `installPlugin` call into the main process's fs/net segment (download/extract);
 *  the main-process segment uses it to write `plugin:installProgress` events back to the **specific job/plugin** (the "event-side backfill" of archive 18 §V I.6-3).
 *  Previously the download/extract events carried **no identity at all**; with parallel installs the percentages poured into the same row; at N=1 correctness was accidental via "assign to the active session".
 *  `jobId` is a product of the shell-side job table (single producer, see install-queue.ts) — the main process only forwards it; it neither generates nor persists it. */
export interface PluginInstallJobRef {
  jobId: string;
  /** Carried along when the pool-side request already has an id — the download segment uses it to attribute progress to the specific plugin (a package stream that only yields an id after extraction carries only jobId) */
  pluginId?: string;
}

/** E6#11c/#13b (segment B): update result — the update extension of PluginInstallResult.
 *  upToDate = the catalog answered directly that it is already the latest (success:true but not "an update happened" — the UI shows "already up to date", not a red error);
 *  currentVersion travels along for toast/log display of vOld→vNew. needRestart is always true (the bundle module cache needs a restart to activate). */
export interface PluginUpdateResult extends PluginInstallResult {
  /** On-disk version before the update */
  currentVersion?: string;
  /** Already the latest after checking the catalog (no replacement happened this time) */
  upToDate?: boolean;
}

/** E6#13b (segment B): returned by pluginManager.checkUpdates — the main process fetches the catalog + compares semver (the shell passes current; the shell is the ledger/disk owner) */
export interface PluginUpdateCheckResult {
  current: string;
  latestVersion: string;
  downloadUrl?: string;
  update: boolean;
}

/** Disabled/uninstalled list entry — the serialized shape of loader getDisabledPluginInfo/getUninstalledPluginInfo (a further subset of PluginListSubset)
 *  E6#30.5b: the core flag passes through — list() EXCLUDES disabled plugins; the disabled-state detail page's uninstall button honors E6#18 "no uninstall button on the detail page for core:true"
 *  and core can only be obtained here (read from the cached manifest; a purely additive optional field, zero regression).
 *  E6#106: + four icon fields (icon/iconSource/marketIcon/marketIconSource) — the **same precedent as #65a adding an icon channel to list()**.
 *  Disabled rows previously had to fall back to the catalog entry for art, but the catalog entry's icon had changed to an absolute URL (the not-installed shape) ⇒ a disabled row
 *  (even though the plugin is still on disk) would silently start pulling remote art, breaking offline. After the channel was added the resolution order is unified with the other positions: installed first → catalog → default block.
 *  The not-installed list (getUninstalledPluginInfo) is **not** extended: the plugin is no longer on disk, there is no local art to read, and the catalog entry is already the sole source. */
export interface PluginInfoEntry {
  pluginId: string;
  name: string;
  description?: string;
  version?: string;
  core?: boolean;
  /** E6#73j (G6): the same residence criterion as `PluginListEntry.updatable` — being disabled **does not change residence** (disable only records a list entry,
   *  the catalog stays in place) ⇒ a disabled plugin in the userData home can still be updated, one in the app tree cannot. */
  updatable?: boolean;
  /** E6#106: small UI icon (Type-1 silhouette for icon-bar plugins / Type-2 identity art for the rest) */
  icon?: string;
  iconSource?: "codicon" | "svg" | "url" | "lucide";
  /** E6#106: plugin identity color art (Type-2) — first candidate for row/detail display positions */
  marketIcon?: string;
  marketIconSource?: "codicon" | "svg" | "url" | "lucide";
}

/** Manifest serialization subset of list() — aligned with the projection fields of handlePluginsCall "list"
 *  E6#30.5e/30.6c3: the declared dependency id list (manifest.requires passed through) — the data source for the marketplace's missing-dependency check and the depends-on/depended-on rows
 *  (the dependencies.ts engine runs only inside the shell; consumption goes through the list() projection). No requires = undefined.
 *  E6#65a (archive batch 1 of 14): + icon/iconSource — the data channel for marketplace row/detail icons (the previously self-acknowledged "7-field alignment" trade-off
 *  now needs icons for the marketplace, an expansion of the same channel; see the IpcBridgeHandler/pluginManager.ts list projection sync). */
export interface PluginListSubset {
  name?: string;
  description?: string;
  version?: string;
  core?: boolean;
  author?: string;
  statusBar?: PluginManifest["statusBar"];
  contributes?: PluginManifest["contributes"];
  requires?: string[];
  // E6#65a (data channel of archive batch 1 of 14): icon/iconSource pass-through — the marketplace gets the plugin icon
  // (the sole manifest data source for row/detail PluginIcon rendering; no icon = undefined → the consumer's default art as fallback).
  // Isomorphic with E5.8#37.9.1: the list() subset keeps picking only UI-consumed fields, never shipping the whole manifest over IPC.
  icon?: PluginManifest["icon"];
  iconSource?: PluginManifest["iconSource"];
  // E6#67 (archive batch 2 of 14, item 5): marketIcon/marketIconSource pass-through — the data channel for the marketplace's display art (cover art).
  // The marketplace consumes "marketIcon ?? icon", picked at the marketplace layer (the shell UI reads only icon, hence list passes through both pairs);
  // no marketIcon = undefined → the marketplace falls back to icon, and if still empty → the default cover.
  marketIcon?: PluginManifest["marketIcon"];
  marketIconSource?: PluginManifest["marketIconSource"];
}

/** E6#78: plugin disk locations — the data source for the marketplace detail page's "open install location / data location" rows.
 *  Resolved in the main process (the pool holds **zero** knowledge of install paths — the renderer gets only results, never assembles paths). */
export interface PluginDiskLocation {
  /** Absolute path of the plugin directory (forward slashes — same convention as `plugins.resolvePath`; consumers use it as a link tooltip and do not splice it themselves) */
  installDir: string;
  /** Plugin data directory — **non-empty only when the plugin actually has data** (directory missing or empty → null).
   *  Same criterion as the VS Code detail page's "cache" row (after `computeSize`, `if (!cacheSize) return` — the whole row is hidden when empty):
   *  a pure-UI plugin is always null; **not everyone has one**, so no empty row is invented. */
  dataDir: string | null;
}

/** E6#78: the two targets of `shell.openPluginFolder` — install directory / data directory */
export type PluginFolderKind = "install" | "data";

/** Environment info — returned by env.get() (assembled by the main process env-handlers) */
export interface EnvInfo {
  appDataDir: string;
  pluginsRootDir: string;
  appPluginsDir: string;
  /** E6#7 (1.2-4): the user-installed package code root {userData}/plugins — the unpack home of .linkdesk-plugin (kept separate from the read-only appPluginsDir root) */
  userPluginsDir: string;
  pluginDataDir?: string;
  pluginCacheDir?: string;
  pluginExportsDir?: string;
}

/** File decoration — E5.7#60 in-pool local registry. Shape modeled after the plugin API contract §3.24 */
export interface FileDecoration {
  badge?: string;
  tooltip?: string;
  color?: string;
  propagate?: boolean;
}

/** File decoration provider — registered by plugins (registerProvider). Sync-query contract: provideDecoration implementations returning Promise are skipped */
export interface FileDecorationProvider {
  provideDecoration(uri: string): FileDecoration | null | undefined;
  onDidChangeFileDecorations?(cb: (uris: string[]) => void): () => void;
}

/** Menu item descriptor — returned by menu.getItems() (after shell-side when filtering + t() translation + shortcut resolution) */
export interface MenuItemDescriptor {
  command: string;
  label?: string;
  group?: string;
  order?: number;
  when?: string;
  /** The command title resolved by the shell (E5.7#14 display-text iron rule) */
  title?: string;
  /** Display string — the form after formatKeyLabel (e.g. "Ctrl+K Ctrl+T"); ⛔ not the registry's raw string (normalization wedge of case 01, display-text iron rule) */
  shortcut?: string;
  /** E5.8#37.7: the current item's √ mark (single-selection semantics — resolved dynamically by the shell's getItems, same as VS Code's menu current item).
   *  Shared by the position/alignment submenu (the current item of edge/align) and the #37.7.1 view visibility list (visible view items). */
  checked?: boolean;
  /**
   * E5.8#37.7.1: per-item command payload — dynamic menu items (e.g. the panel view visibility list) carry data to the command handler.
   * ContextMenu's context is shared by the whole menu (not per-item); per-item identity (e.g. containerId+viewId)
   * must go through the command payload: executeCommand(id, undefined, ...commandArgs, context) → the shell handler receives args
   * = [...commandArgs, context]. The pool dumb-renders verbatim without interpreting content.
   *
   * 🔴 Menu payload law: `context` is **shared by the whole menu**; an item's identity can **only** travel through this field. Shared components (e.g. `PluginCard`)
   * will always send **their own** `context` ⇒ handlers consuming a shared-component menu must tolerate "`args[0]` is your own payload and
   * **the end** is the shared component's context"; ⛔ do not assume `args[0]` is necessarily your data (unless that slot has no shared context).
   */
  commandArgs?: unknown[];
  children?: Array<string | MenuItemDescriptor>;
}

/** Progress notification handle — returned by show() when progress=true */
export interface NotificationHandle {
  /** Update the progress message + optional progress percent (E6#71i: 0-100 determinate bar; omitted = indeterminate animation keeps pushing messages) */
  update(message: string, percent?: number): Promise<void>;
  /** Finish — closes the progress notification, optionally shows a completion toast */
  finish(message?: string): Promise<void>;
  /** Cancel — closes directly, no completion toast */
  cancel(): Promise<void>;
}

/** Notification primary-action button descriptor (E6#13.5 gap K1) — plugins pass actions to notifications.show,
 *  serialized over IPC to the shell; on click the shell executeCommand(command, args) actually runs.
 *  Modeled after VS Code `INotificationAction` (command surface). The button label = the final display text; the shell does not translate again. */
export interface PluginToastAction {
  /** Action id — the plugin-side identifier (unique within one notification); click receipts are by position index; id is for debugging/logs only */
  id?: string;
  /** Button label (final display text) */
  label: string;
  /** true → primary button (accent color); false/unset → secondary text button */
  isPrimary?: boolean;
  /** Command id to run on click — the shell's executeCommand(command, args). The command handler is registered by the plugin itself
   *  (window.linkdesk.commands.registerCommand). No command → clicking the button only closes the toast (no side effects) */
  command?: string;
  /** ...args passed through to the command handler */
  args?: unknown[];
}

/** Compatibility reading request (E6#117) — input to plugins.getCompatibility: plugin identity + catalog-side facts (for uninstalled plugins the caller
 *  supplies them from the catalog entry; for installed plugins the on-disk manifest is the effective value and the main process overrides) */
export interface PluginCompatibilityRequest {
  pluginId: string;
  /** The minimum shell version the plugin requires (carried by the catalog entry; the only source for uninstalled plugins) */
  minAppVersion?: string | null;
  /** The plugin's last release date (catalog `publishedAt`, ISO) */
  publishedAt?: string | null;
}

/** Compatibility reading (E6#117) — the state algorithm lives in one place, the shell's `src/core/compat/compatibility.ts`; this surface provides machine state only,
 *  ⛔ it carries no user-visible sentences (user-facing copy belongs to the marketplace plugin's i18n; the user-facing vocabulary lives in archive 00 §0d) */
export interface PluginCompatibilityReading {
  pluginId: string;
  /** Five states (fixed mapping to the five user-facing words; the mapping table lives in the compatibility.ts header comment) */
  state: "current" | "compatible" | "drifted" | "incompatible" | "unknown";
  /** Dangling reading; null = unavailable (not installed / catalog unreadable) — missing data ≠ a problem */
  dangling: { count: number; names: string[] } | null;
  /** The effective minimum shell version (installed = on-disk manifest; not installed = supplied by the caller); absent ⇒ null */
  minAppVersion: string | null;
  shellVersion: string;
  /** minAppVersion missing/invalid ⇒ null (nothing to compare); false ⇒ state = "incompatible" */
  minAppSatisfied: boolean | null;
  /** The plugin's last release date (YYYY-MM-DD); null if the catalog cannot provide it */
  lastUpdate: string | null;
  /** The current shell build date (YYYY-MM-DD); null for the dev placeholder */
  shellBuiltAt: string | null;
  /** Which inputs are missing (diagnostic surface; non-empty when state = "unknown") */
  unknown: string[];
}

// ── "Open with" command surface (shell command workbench.action.openWith — types reachable by both shell and plugins, hence living in the contract) ──

/**
 * "Open with" request — the sole input shape of the shell command `SHELL_COMMANDS.openWith`.
 * Give at least one of `uri` and `ext`: the context-menu/editor entry provides `uri` (the shell computes `ext`); the settings page's "open by type" entry provides only `ext`.
 */
export interface OpenWithRequest {
  /** File path (provided by the context-menu/editor entry) */
  uri?: string;
  /** Display name (used for the panel title) */
  name?: string;
  /** Normalized extension (no dot, lowercase — computed uniformly by the shell's normalizeExt; callers need not pre-process) */
  ext?: string;
  /**
   * @deprecated The panel is **always centered** as of 2026-10-05 (case 03 §3.0′, the user's revised verdict: visual focus / shape uniformity /
   * no fighting with surrounding elements / no cluttered look) — the anchored state is abolished; the shell no longer normalizes this field, ⛔ no consumers remain.
   * Kept only for compatibility with the already-released contract surface (⛔ must not be deleted, see `check-api-surface-additive`); new callers ⛔ must not pass it.
   */
  anchor?: { x: number; y: number };
}

/**
 * Handler entry (the data shape of one panel row) — **assembled by the shell; ⛔ plugins must not construct it themselves**.
 * `title` = the **handler name** (the plugin's display name, taken as `manifest.name ?? pluginId` from a `pluginManager.list()` row);
 * `typeLabel` = the **type name** (the `displayName` in the declaration, e.g. "Rust"). ⛔ The two must not be swapped:
 * the semantics of `contributes.fileAssociations[].displayName` is the **file type's display name**, not the plugin/handler name.
 */
export interface OpenWithHandler {
  pluginId: string;
  /** Handler name (the plugin's display name) */
  title: string;
  /** Type name (declared displayName — to name the plugin use the manifest's top-level name) */
  typeLabel?: string;
  /** Icon manifest subset — produced by the shell with the shared helper `pickIdentityArt()` (same source as the settings page/tab bar) */
  manifest?: { icon?: string; iconSource?: "codicon" | "svg" | "url" | "lucide" };
  /** Whether this handler is the current default */
  isDefault: boolean;
  /** Whether this handler was chosen by automatic adjudication (when no explicit override exists) */
  isAuto: boolean;
}
