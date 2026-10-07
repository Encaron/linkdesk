/**
 * 🔥 linkdesk.d.ts—the window.linkdesk plugin API contract (auto-generated, do not edit by hand)
 *
 * Generated from: src/core/api/linkdesk-api.ts + linkdesk-api/ (15 domain interfaces + types.ts)
 *                 + src/core/types/ipc/* + src/core/types/pool/* (wire payload types)
 * Generator: scripts/generate-contract.mjs (Route C—contract type files are the source, pure-type bundling)
 * After changing a contract source, run `node scripts/generate-contract.mjs` (enforced by check-contracts in npm run check)
 *
 * Usage (third-party plugin authors):
 * Copy this file into your project + reference it from tsconfig, or `npm i -D @linkdesk/contracts` ()
 *   import type { PluginListEntry } from "linkdesk";
 *   window.linkdesk.filesystem.readFile(...)   // ambient types work directly
 */

// ── Contract types ──
/**
 * Command parameter descriptor —  commands **carry their own parameter descriptions**, returned together with `commands.getCommands()`.
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
     * what this command **does** — the intent from the user/AI perspective (i18n key = original Chinese text, same convention as title),
     * ⛔ do not restate the command id (the id is already given by the field itself). Optional, purely additive — existing commands may omit it.
     */
    description?: string;
    /** parameter structure (positionally mapped to handler arguments). Optional, purely additive; omit for commands without parameters. */
    params?: LinkDeskCommandParam[];
}
/** Recipe contribution domains—shared by theme metadata domains (mix-and-match source filtering) and the theme:changed payload (domain-level fine-grained refresh) (06 §2/§6.2).
 *  Five domains: colors (colorways always contribute) + the four appearance style domains (radius/glass/font/background).
 * the surface domain removed—per-surface fine-tuning keys are dead (decision A removal); the glass surface shape tokens (--surface-*) belong to the glass domain. */
export type ThemeDomain = "colors" | "font" | "radius" | "glass" | "background";
/** A single property definition in a config schema —  🛤 completes uiHint/minimum/maximum/renderHint/dependsOn
 * (the shell's SettingsView renderControl/SettingRow official control switching + dependency show/hide fields, aligned with SettingsView/types ConfigProperty) */
export interface LinkDeskConfigProperty {
    type: string;
    default?: unknown;
    description?: string;
    /** 🆕 Config item short name (D1/D2, 2026-10-04): row-level display name — the settings page row name and the marketplace feature page row render from it (optional).
     *  Value convention same as description: original Chinese text = i18n key; the en translation is supplied by the declarer (plugin repo i18n/en.json / shell-side lang-defaults);
     * undeclared = render falls back to showing the config key (D2/— zero impact on existing third-party plugins; the export surface only grows). */
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
    /** Monospace restriction — only meaningful for uiHint "fontFamily". true/omitted = list monospace families only (editor fonts); false = all font families (UI fonts).  */
    monoOnly?: boolean;
    /** Dependency condition — this item shows only when the config value of dependsOn.key === value (SettingRow reads it to show/hide the whole row) */
    dependsOn?: {
        key: string;
        value: unknown;
    };
    /** Dynamic dropdown data source — read when uiHint is "select" (calls theme.listRecipes() at render time, ).
     *  "theme.colorways" = colorways of the active recipe (app.theme) (options carry preview swatches);
     *  "theme.sources" = mash-up sources (filtered by optionsFromDomain over RecipeMeta.domains). */
    optionsFrom?: string;
    /** Mash-up source domain filter — when optionsFrom is "theme.sources", filters RecipeMeta.domains by this domain (the six domains of spec 10 §2) */
    optionsFromDomain?: ThemeDomain;
    /** Button action — runs this shell command on click (triggered by third-party settings UIs via commands.executeCommand).
     * Settings row case 2.1: **companion declaration** — coexists with any primary control ⇒ the companion button to the right of the primary control (label = `description`).  */
    actionCommand?: string;
    /** (P-2 decision A): runtime data source for read-only status — runs this shell command at render time to fetch the value
     *  (returns a string; the display wording is assembled on the command side). The value comes from the command, not from config storage — a general capability any plugin can use.
     *  Settings row case 2.1: **companion declaration** — coexists with any primary control ⇒ the companion read-only to the right of the primary control (reuses the read-only base's polling). */
    statusCommand?: string;
    /** disable condition for renderHint "action" buttons — disabled when all {key,value} pairs match the current config values */
    actionDisabledAll?: Array<{
        key: string;
        value: unknown;
    }>;
    /** secondary heading within a group — SettingsView groups keys with the same group under a subheading; without group it stays flat (zero intrusion) */
    group?: string;
    /** numeric unit — value-label unit for uiHint "slider" ("×" / "px"; empty = bare number) */
    unit?: string;
}
/** Config schema — key → property definition (index signature kept for existing consumers) */
export interface LinkDeskConfigSchema {
    [key: string]: LinkDeskConfigProperty;
}
/** Configuration contribution entry — the shape returned by configuration.getConfigurationContributions() (🛤 naming).
 * Aligned with the [pluginId, { title, subtitle?, groupDescriptions?, properties }] assembled by the shell's ConfigurationRegistry — third-party settings UIs no longer need casts */
export type LinkDeskConfigurationContribution = [
    string,
    {
        title: string;
        /** (P-3 decision A): one-line subtitle under the section's main title (optional; undeclared = not rendered, zero intrusion) */
        subtitle?: string;
        /** (P-3 decision A): one-line small text under each group heading — key = the group's original text (optional, zero intrusion) */
        groupDescriptions?: Record<string, string>;
        properties: Record<string, unknown>;
    }
];
/** Commands + configuration namespace surfaces — modeled after VS Code vscode.commands + workspace.getConfiguration */
export interface CommandsAPI {
    /** Commands — modeled after VS Code vscode.commands */
    commands: {
        /** @deprecated  — backward-compatibility alias; use executeCommand in new code */
        execute<T = void>(commandId: string, ...args: any[]): Promise<T>;
        /** Execute a shell-side command */
        executeCommand<T = void>(commandId: string, ...args: any[]): Promise<T>;
        /**
         * Register a pool-resident command — the handler exists only in the pool renderer (registered when the view mounts).
         * meta is synced to the shell registry: title display name (command palette / context menu; re-registering updates it
         * dynamically — a toggle command's title flips with state), category command-palette grouping, when context key filtering
         * (pass "false" = a purely programmatic command, not shown in the command palette, only callable via the plugin API).
         * Commands not declared in plugin.json contributes.commands become visible/executable once registered via meta.
         * Source-of-truth division: the shell CommandRegistry = display source of truth (title/category/when are the only authority),
         * the pool = execution source of truth (the handler is the only authority and never crosses processes) — meta syncs only the display surface.
         * 🔴 ** `meta.pluginId` = the true identity explicitly declared by the registrant** (optional, additive only).
         *   Command ownership resolution priority = ① the plugin.json declaration → ② this field → ③ inferred from the first segment of the name.
         *   Declared commands **need not fill it** (① is already authoritative); only commands that are "absent from the declaration
         *   and whose name does not carry their own prefix" need it — otherwise the command gets attributed to the owner of the
         *   name's first segment (borrowing someone else's prefix ⇒ wrong ownership, and cross-ownership takeover cannot be blocked).
         *   Following the `notifications.source` precedent (`ui.ts:26-32`): the pool is a single-process shared realm,
         *   all plugins share the same `window.linkdesk` ⇒ **there is no way to inject it automatically; the author must declare it**.
         * `meta.description` / `meta.params` = command description and parameter structure (optional, additive only) —
         *   synced the same way as `title`/`category` into the shell registry, and surfaced in the contract via `getCommands()`
         *   (`LinkDeskCommand.description` / `LinkDeskCommand.params`).
         *   `params[i]` corresponds **positionally** to handler arguments (`name` follows the handler argument name).
         */
        registerCommand(commandId: string,
        handler: (...args: any[]) => Promise<unknown> | unknown, meta?: {
            title?: string;
            category?: string;
            when?: string;
            pluginId?: string;
            description?: string;
            params?: LinkDeskCommandParam[];
        }): void;
        /** Unregister a plugin's pool-resident commands (convention: command ID format "pluginId.commandName") — called on view unmount */
        unregisterCommands(pluginId: string): void;
        /** Get the list of all registered commands */
        getCommands(): Promise<LinkDeskCommand[]>;
        /** Shell-side plugin entry module-level registration (the shell-side half, executed across both processes) — shell preload only */
        _executeShellLocal?(id: string, ...args: unknown[]): Promise<unknown>;
        /** pool-preload-only internal hook — the pool renderer registers the on-command activation callback (command miss → import the owning plugin entry).
         *  Underscore internal surface (modeled after _executeShellLocal), not a plugin-author API — the wiring point for on-demand activation of pure command plugins. */
        _setCommandMissHandler?(handler: (pluginId: string) => Promise<boolean>): void;
    };
    /** Configuration — the new name — modeled after VS Code vscode.workspace.getConfiguration */
    configuration: {
        /** Read a configuration value — a runtime dynamic value; defaults to unknown without a type parameter; callers narrow via explicit get<number>("k") or their own narrowing */
        get<T = unknown>(key: string): Promise<T>;
        /** Write a configuration value */
        set(key: string, value: unknown): Promise<void>;
        /** Get the configuration schema */
        getSchema(key?: string): Promise<LinkDeskConfigSchema>;
        /** Subscribe to configuration changes — returns an unsubscribe function. The value is dynamic at runtime; T is inferred from the subscriber's cb (same generic as events.on, to avoid contravariance errors) */
        onChange<T = unknown>(key: string, cb: (value: T) => void): () => void;
        // ══  the following 9 methods are settings-page only (SettingsView rendering / live refresh / navigation).
        // Injected by the pool preload (SettingsView renders in the pool) — required; the shell preload has no such surface.
        // General plugins should use get/set/getSchema/onChange above. ══
        getConfigurationContributions(): Promise<LinkDeskConfigurationContribution[]>;
        inspectConfiguration(key: string): Promise<unknown>;
        getUserSettings(): Promise<Record<string, unknown>>;
        onDidChangeConfiguration(cb: (key: string, value: unknown) => void): () => void;
        onPluginLifecycleChange(cb: () => void): () => void;
        consumeSettingsGroup(): Promise<string | null>;
        onRequestSettingsGroup(cb: (pluginId: string) => void): () => void;
        consumeScrollToSetting(): Promise<string | null>;
        onRequestScrollToSetting(cb: (key: string) => void): () => void;
        /** 🔴 fix: switch to the keybindings tab — the same dual channel as  (replaces the mismatched window-event dead route).
         *  On mount, consumes the pending request (the "open keybindings settings" command issued while not open); returns null when there is no request */
        consumeOpenKeybindings(): Promise<{
            query?: string;
        } | null>;
        /** live subscription — when the settings page is already open, the "open keybindings settings" command switches the tab immediately */
        onRequestOpenKeybindings(cb: (payload: {
            query?: string;
        }) => void): () => void;
    };
    /** @deprecated  — backward-compatibility alias; use configuration in new code */
    config: CommandsAPI["configuration"];
}
/** glass + floating panel texture fields—theme JSON `surface` (omitted = no glass, no floating).
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
     * opacity) + seeds a back-computed compositing alpha ( the recipe's surface baseline; takes priority when the user's app.glassOpacity overrides) */
    opacity?: number;
    /** Liquid-glass top highlight intensity—0 = off */
    specular?: number;
    /** top highlight base color (the hairline-light edge color)—omitted = white; alpha still goes through specular */
    specularColor?: string;
    /** Morph transition ms—0 = off */
    morph?: number;
    /** Floating corner radius px—0 = square, flush to the edge */
    radius?: number;
    /** Lifted drop shadow—true = floating shadow (the engine maps --shadow-lift) */
    shadow?: boolean;
    /** tileable texture image asset path (⑬ paper-texture zones)—applied to all 5 zone surfaces; independent of glass, takes effect on its own */
    texture?: string;
    /** Texture opacity—1 = opaque */
    textureOpacity?: number;
}
/** image background texture fields—theme JSON `background` (omitted = no image) */
export interface ThemeBackground {
    /** Image path—the author provides a resolvable URL; the engine wraps it in url() when writing `--bg-image` */
    image?: string;
    /** Image layer opacity—1 = opaque. The engine writes `--bg-opacity` (the .background-layer crisp base image) + `--surface-bg-opacity`
     * (the mirror/texture/slice ::after image layers); when the user's app.backgroundOpacity overrides, both tokens are written together ( the image and base fade out uniformly, avoiding a faded base image while the mirror stays fully visible) */
    opacity?: number;
    /** Image mask lightness/darkness (0-1 rgba alpha)—0 = no mask */
    mask?: number;
    /** mask base color (the darkening layer's color)—omitted = black; alpha still goes through mask. Only effective in panorama (same as mask) */
    maskColor?: string;
    /** slicing mode—"panorama" (default) = full-window semantics unchanged; "zones" = the same image sliced continuously across the 5 zone surfaces (⑭ imagery zones) */
    mode?: "panorama" | "zones";
}
export interface LinkDeskTheme {
    name: string;
    type: "dark" | "light";
    /** glass/floating texture — theme JSON `surface` (omitted = no glass, no floating) */
    surface?: ThemeSurface;
    /** image background — theme JSON `background` (omitted = no image) */
    background?: ThemeBackground;
    pluginId?: string;
}
/** colorway metadata — returned by theme.listRecipes() (elements of colorways[], spec 06 §2).
 *  Preview colors feed the ThemePicker cards; a single-colorway recipe = 1 entry. */
export interface ColorwayMeta {
    /** Colorway id — globally unique (input to theme.setColorway; the app.themeColor dynamic enum stores this) */
    id: string;
    /** Colorway display name */
    name: string;
    /** Preview colors — accent + window background (used to color card badges; the default colorway lacks this token → empty string) */
    preview: {
        accent: string;
        bgWindow: string;
    };
}
/** recipe metadata — returned by theme.listRecipes() (all available recipes + colorways + preview colors, spec 06 §2).
 *  domains = which domains the recipe contributes (basis for mash-up source filtering, spec 10 §2); type = light/dark category. */
export interface RecipeMeta {
    id: string;
    name: string;
    type: "light" | "dark";
    colorways: ColorwayMeta[];
    domains: ThemeDomain[];
}
export interface LinkDeskLanguage {
    id: string;
    label: string;
    pluginId: string;
}
/** Theme + language + appearance asset namespace surfaces — modeled after the VS Code appearance surface */
export interface AppearanceAPI {
    theme: {
        /** Get the current theme ID */
        getCurrent(): Promise<string>;
        /** Get all available themes */
        getAvailable(): Promise<LinkDeskTheme[]>;
        /** Apply a theme */
        apply(themeId: string): Promise<void>;
        // ──  recipe/colorway 06 §2 six methods — listing goes through the API (data), selection goes through configuration (persisted app.*) ──
        /** All available recipes (including colorway variants + preview colors) — ThemePicker cards / data source for the colorway and mix-and-match dynamic SelectBox */
        listRecipes(): Promise<RecipeMeta[]>;
        /** Current active recipe/colorway — computed from merged configuration (getActiveRecipe + app.theme/app.themeColor fallback) */
        getActive(): Promise<{
            recipeId: string;
            colorwayId: string;
        } | null>;
        /** Currently effective token set (after merging) — seeds appearanceMode→custom, mix-and-match preview */
        getEffectiveTokens(): Promise<Record<string, string>>;
        /** Apply a recipe — persisted to app.theme (the colorway follows the recipe automatically) */
        setRecipe(recipeId: string): Promise<void>;
        /** Apply a colorway variant — persisted to app.themeColor */
        setColorway(colorwayId: string): Promise<void>;
        /** Reset appearance — aligned with the shell command: app.appearanceMode→followTheme (onApply cascades to clear 9 overrides + 6 domain origins + accent color back to the theme baseline,  merged) */
        resetAppearance(): Promise<void>;
        /** Reset mix-and-match — aligned with the shell command: batch resets the 3 origin keys back to follow theme (custom mode preserved; app.mixMode removed in , surface domain removed in ) */
        resetMix(): Promise<void>;
        /** appearance override keys → the full set of baseline seed values for theme/mix-and-match (baseline for the settings page "Modified" badge; no active recipe → null) */
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
        getInitial(): {
            lang: string;
            resources: Record<string, unknown>;
        } | null;
        /** Subscribe to language changes — returns unsubscribe */
        onChange(cb: (data: {
            lang: string;
            resources: Record<string, unknown>;
        }) => void): () => void;
    };
    /** appearance assets — locally picked images are copied into managed storage (controlled source — user-chosen paths cannot be read directly via file://) */
    appearance: {
        /** Import an image into userData/appearance/ (deduplicated by name) — returns a controlled-protocol URL (linkdesk-userdata://…, ),
         *  for app.backgroundImage persistence; the sandbox loads it via the privileged protocol (plain absolute paths are intercepted) */
        importImage(sourcePath: string): Promise<string>;
        /** open the appearance storage directory (userData/appearance) — the main process resolves the path and uses shell.openPath to open the file explorer
         *  at the directory contents (not highlighting a single file); a missing directory is created too (opening reveals the storage location); an openPath failure throws fail-loud. */
        revealStorage(): Promise<void>;
    };
}
/** Storage namespace surface — the read port and open port for the currently effective cache directory (the single resolution point is in the main process storage-handlers) */
export interface StorageAPI {
    storage?: {
        /** Open the cache directory (a file explorer window, non-modal) — the main process resolves the currently effective path and
         *  **creates the directory before opening**
         *  (a missing directory is created too — there is something to open even right after install, never a "not found" popup); an openPath failure throws fail-loud */
        revealCache(): Promise<void>;
        /** The absolute path of the currently effective cache directory — settings.json's `app.storage.cacheDir` (empty/missing = the userData default location);
         *  🔴 the single resolution entry (placement contract iron rule 3: no second copy of the path is stored anywhere — take it, never copy it) */
        cacheDir(): Promise<string>;
    };
}
/**
 * Cross-module shared window types—core/types = cross-module shared types (shell directory convention: types only).
 *
 * WindowMode is referenced by both the shell policy layer (src/App/windows.ts WINDOW_MODE_STRATEGIES keys + WindowShellState.mode)
 * and the core callback contract (CoreCallbacks.findTabWindow)—core does not import App, so the type sinks here,
 * and App imports + re-exports it (consumers still import from `./windows`; zero changes).
 *
 * Semantics ():
 *   main     main window—all zones; panels resident; closing the window = the app quits
 *   detached detached window—tabs follow the window; closing the window = the shell removes the window state (tabs close with the window; they do not return)
 * drift    drift panel window ()—a panel-only window (always empty groups, empty main-area placeholder I9-13);
 *            closing the window = closing the panel (I9-13 decision A)
 */
export type WindowMode = "main" | "detached" | "drift";
/** Menu item — already resolved on the shell side (display-text iron law: label already t()'d; the pool renders dumbly). Shared by the titlebar dropdown and the ☰ hamburger. */
export interface PoolMenuItem {
    /** Display label — shell t(label ?? command.title ?? command) */
    label: string;
    /** Command ID executed on click — "" for parent items without a command (the hamburger does not flatten parent items; clicking is a no-op) */
    command: string;
    /**
     * secondary group name within the menu — the render layer cuts separators by it (ContextMenu semantics: a line between adjacent items of different groups).
     * Only serialized when present (no grouping = a single fallback `__default` group, no lines). Display-text iron law: the pool only compares strings, never interprets semantics.
     * ⚠️ A group on a submenu's children is replaced by the parent item's group by ContextMenu (mapChildren semantics) — grouping only takes effect on **top-level menu items**.
     */
    group?: string;
    /** Shortcut text (after formatKeyLabel) — shown by **both** the top bar and the hamburger (2026-10-04 restored top-bar keycaps); absent when unbound */
    shortcut?: string;
    /** checked state of the current item (√ in visibility menus) — the shell's buildTitleBarMenuGroups/hamburger serialize via resolveVisibilityChecked
     *  (zone visible = ✓). Display-text iron law: the pool renders the raw value dumbly; the shell only pushes a boolean. */
    checked?: boolean;
    /** Submenu — titlebar: only parent items with command+children carry it; hamburger: group label containers are kept as parent items with members folded in (2026-10-04) */
    children?: PoolMenuItem[];
}
/** Menu group — titlebar: each group = one top-bar button (e.g. "File", "View"); hamburger: a grouped section */
export interface PoolMenuGroup {
    /** Group name — sorting/addressing key */
    group: string;
    /** Group display label — shell t(first item's label ?? group) */
    label: string;
    items: PoolMenuItem[];
}
/** Title bar slot button — declared by plugin contributes.titleBar (when-clauses already filtered by the shell) */
export interface TitleBarSlotButton {
    command: string;
    /** codicon class name or image path — **mutually exclusive with `label`**: when a label is present the pool renders a text button and this field is ignored */
    icon?: string;
    /** Tooltip — already t()'d on the shell side (the command reports its own title, falling back to the command id) */
    title: string;
    /**
     * button text — **the final string already resolved on the shell side** (`$` context key references have been substituted,
     * static literals have been through `t()`). The pool is a dumb renderer: it renders what it gets — no evaluation, no translation, no `$` recognition.
     * Present ⇒ render a full-text button; absent ⇒ take the icon branch.
     */
    label?: string;
}
/** Title bar layout — consumed by  TitleBarZone */
export interface TitleBarLayout {
    title: string;
    /** Logo asset URL — resolved by the shell's getAssetPath (Path B: the pool does not import core) */
    logoUrl: string;
    menuBarVisible: boolean;
    /** Menu bar data — pushed after the shell groups/flattens/translates */
    menuGroups: PoolMenuGroup[];
    /** Plugin-contributed slot buttons (left/right) */
    slots: {
        left: TitleBarSlotButton[];
        right: TitleBarSlotButton[];
    };
    /** Window control tooltips — display-text iron law: pushed after shell t() resolution ( pin/unpin sticky two states) */
    windowControls: {
        minimize: string;
        maximize: string;
        restore: string;
        close: string;
        pin: string;
        unpin: string;
    };
}
/** Pool-side icon — serialized by the shell (the pool does not import pluginLoader; Lucide names are mapped to components by the pool); shared by the icon bar and the tab bar */
export type IconBarIcon = {
    kind: "lucide";
    name: string;
} //  Lucide first
 | {
    kind: "codicon";
    name: string;
    color?: string;
} // codicon CSS class (optional per-icon color, )
 | {
    kind: "img";
    src: string;
} // linkdesk:// protocol URL / data URI
 | {
    kind: "emoji";
    text: string;
}; // fallback emoji

/** Icon bar entry — serialized from the shell's viewRegistry (pluginId + icon + name + location) */
export interface IconBarItem {
    pluginId: string;
    icon: IconBarIcon;
    /** tooltip / aria-label — shell t(manifest.name) */
    label: string;
    location: "top" | "bottom"; // main column / bottom fixed group — purely geometric; ⛔ has nothing to do with "is it the gear" (see owned for the gear)
}
/** Shell-owned buttons — belong to the shell, from no plugin (today only the gear). */
export interface IconBarOwnedButton {
    id: string; // stable identity — the pool renders it as data-owned-id (⛔ not data-plugin-id, which would be treated as a drop target)
    icon: IconBarIcon; // shell-owned asset (pushed down after shell getAssetPath resolution)
    label: string; // tooltip / aria-label — resolved by shell t()
    location: "bottom";
    menuId: string; // id of the menu slot to pop up on click (the pool renders dumbly; menu items are still pushed by the shell's MenuRegistry)
}
/** Icon bar layout — consumed by  IconBarZone */
export interface IconBarLayout {
    icons: IconBarItem[];
    /** Shell-owned buttons — rendered by the pool at the end of the bottom group, always visible/undraggable/excluded from iconOrder. ⛔ never stuff them into `icons` (that whole array is on the drag and persistence paths; sub-folder 01-design §4); required: omitting it fails tsc */
    owned: IconBarOwnedButton[];
    /** Active icon — the plugin owning the current sidebar container (not lit when the sidebar is collapsed/has no container; same double guard as the shell's isActive) */
    activePluginId?: string;
    /** ☰ hamburger visible — menuStyle hamburger/both */
    hamburgerVisible: boolean;
    /** Navigation aria-label — shell t("Navigate") (display-text iron law) */
    navLabel: string;
    /** ☰ dropdown — shell MenuRenderer showGroups+showKeybindings+checkWhen semantics: group label containers are kept as parent items with members folded in (2026-10-04); pushed only when hamburgerVisible */
    hamburger?: {
        /** ☰ tooltip — shell t("Menu") */
        title: string;
        groups: PoolMenuGroup[];
    };
}
/** Action-area dropdown entry — label is the display text (i18n key), command is executed, args passes through as a single positional argument */
export interface TitleActionItem {
    /** Display text — i18n key (original Chinese text; resolved by the pool's t() — display-text iron rule) */
    label: string;
    /** Command id executed on click */
    command: string;
    /** Command argument — passed through as a single positional argument of executeCommand(command, args) (JSON-serializable; omit if none) */
    args?: unknown;
}
/** Action-area widget — three forms: icon button / dropdown menu / split primary button + dropdown (same as the VS Code terminal [+] + [▾]).
 *  The widget is a general-purpose piece, not built for the terminal — whoever declares it uses it (general APIs are built by the shell first, never waiting for a consumer — plugin-independence iron rule). */
export type TitleActionWidget =
/** Single icon button — click runs the command */
{
    type: "icon";
    id: string;
    command: string;
    /** codicon class name (e.g. "codicon-add") — the pool renders `<span className={`codicon ${icon}`} />` */
    icon: string;
    /** tooltip / aria-label — i18n key */
    title: string;
    args?: unknown;
}
/** Pure dropdown — the chevron button expands the items list */
 | {
    type: "dropdown";
    id: string;
    items: TitleActionItem[];
    /** chevron tooltip — i18n key */
    title?: string;
}
/** Split primary button + dropdown — the primary button runs the command (default action); the chevron on the right expands the items alternatives */
 | {
    type: "split";
    id: string;
    command: string;
    /** Primary button icon — when there is no icon, the title (after t()) is used as a text button */
    icon?: string;
    /** Primary button tooltip / aria-label / text when there is no icon — i18n key */
    title: string;
    items: TitleActionItem[];
    args?: unknown;
};
/** Sidebar view metadata — serialized from ViewContainerService and pushed to SidebarPool via PoolLayout */
export interface SidebarViewMeta {
    id: string; // view ID ("folders" / "search" / "installed")
    title: string; // display title
    pluginId: string; // _pluginId — PluginComponent uses it to locate the plugin root (resolvePath IPC)
    renderPath: string; // normalized URL of _renderPath (dev /@fs | prod linkdesk://) — the pool dynamic-imports it directly ()
    role?: "toolbar" | "section"; // defaults to "section"
    order?: number;
    collapsed?: boolean; // initial collapsed state declared by the plugin (collapsed: true)
    badge?: string | number;
    titleDescription?: string;
    titleTooltip?: string;
    singleViewPaneContainerTitle?: string; // replaces containerTitle when mergeHeaderWhenSingle
    minHeight?: number; // declared minimum height — PaneSash effectiveMinHeight
    /** view action-area declaration passed through — right side of the sidebar section header (same declaration as , consumed in two places) */
    titleActions?: TitleActionWidget[];
}
/** pool render data for a single sidebar container — element of SidebarLayout.containers[] (keep-alive container list) */
export interface SidebarContainerLayout {
    containerId: string;
    containerTitle: string;
    mergeHeaderWhenSingle?: boolean;
    views: SidebarViewMeta[];
}
/** Sidebar layout — received only by SidebarPool */
export interface SidebarLayout {
    visible: boolean;
    width: number;
    /** 🆕  which edge the sidebar sits on — consumer of  dockTo("sidebar", ...) (swap rule: it and rightSidebar always occupy opposite edges).
     * The pool grid () decides from this whether the sidebar lands in the left or right slot. Defaults to "left". */
    edge?: "left" | "right";
    // ──  container metadata ──
    containerId: string | null; // "file-explorer" / "marketplace" / "serial-monitor"
    containerTitle: string; // "Explorer" / "Plugin Marketplace" / "Serial Monitor"
    mergeHeaderWhenSingle?: boolean;
    views: SidebarViewMeta[];
    /** keep-alive container list — all sidebar containers (not just the active one) are serialized.
     *  The pool mounts them persistently by containerId and toggles display:none — switching containers never unloads views, so plugin component state is preserved.
     *  A container disappears from the list when its plugin unloads → the pool unloads it naturally (source of truth lives in the shell; the pool caches nothing). Old layouts without this field fall back to single-container rendering. */
    containers?: SidebarContainerLayout[];
    collapsedViews?: string[]; // set of persistently collapsed view IDs — shell loadCollapsedState()
    /** shell tells the pool whether the sidebar is collapsed — collapsed = truly gone ( no slim strip/▶, grid auto column 0 width) */
    collapsed?: boolean;
    // ──  sidebar UI text pushed with shell-side t() (display-text iron law — the pool renders zero self-produced text) ──
    emptyText?: string; // empty-state primary text — "No registered views in this container"
    emptyHint?: string; // empty-state hint — "Install a plugin to add views"
    // ──  drag clamp bounds — shell LayoutEngine dock declarations pushed (the pool clamps locally to match the shell's resizeZone, zero hardcoding) ──
    minWidth?: number; // drag minimum width — shell dock.minWidth (170)
    maxWidth?: number; // drag maximum width — shell dock.maxWidth (600)
    // ── backward compatibility ──
    /** @deprecated superseded by views[] — kept for unmigrated code */
    viewId?: string | null;
}
/** 🆕  right sidebar layout — a real zone for the right sidebar (decision 6, consumer of  addZone("rightSidebar")).
 *  Mirrors SidebarLayout (same set of consumed fields) but carries **no edge of its own** — the swap rule guarantees sidebar ↔ rightSidebar
 * always occupy opposite edges, so rightSidebar's edge = the opposite of the sidebar's (derived by the pool grid , avoiding duplicated literals).
 * RightSidebarZone real rendering: copy pushed with shell t() (display-text iron law).  no ◀/▶ collapse buttons — same as the left sidebar. */
export interface RightSidebarLayout {
    visible: boolean;
    width: number;
    // ── container metadata (same semantics as SidebarLayout) ──
    containerId: string | null;
    containerTitle: string;
    mergeHeaderWhenSingle?: boolean;
    views: SidebarViewMeta[];
    containers?: SidebarContainerLayout[];
    collapsedViews?: string[];
    /** 🆕  right sidebar collapsed state — derived from width ≤48 (pool); collapsed = the whole zone disappears (same origin as the left sidebar's ,
     *  no slim strip/▶ — collapse/expand only via the icon bar toggle + the visibility checkbox menu) */
    collapsed?: boolean;
    // ── drag clamp bounds + empty-state copy (same semantics as SidebarLayout) ──
    minWidth?: number;
    maxWidth?: number;
    emptyText?: string;
    emptyHint?: string;
}
/** One entry of the left slim-column version history — **display text already formatted by the shell** (display-text iron law: the pool renders exactly what it receives) */
export interface PoolReleaseNotesHistoryItem {
    /** Version number (no v prefix; the "v" shown at display time is formatting, not copy — added by the pool) */
    version: string;
    /** Short date `MM-DD` (sliced from ISO by the shell, **no locale involved** — mockup 03 renders it exactly this way; switching languages must not change it) */
    dateLabel: string;
}
/**
 * Shell→pool data for the release-notes tab — **three-state discriminated union** (05 §2.4: the state is uniquely decided by the fetch result; there is no fourth).
 *
 * 🔴 **The pool makes no decisions of its own**: whatever `state` says, it renders that branch. Not even "loading or ready" may the pool judge by itself
 * (that conclusion belongs to the shell) — the context key push in  is another landing point of the same rule.
 *
 * 🔴 **Cache hits never pass through the loading state** (05 §2.4): the shell holds an in-memory cache in the renderer (the module singleton of `useReleaseNotes`),
 * so both "opening it a second time in this session" and "switching to a historical version" land **directly on `content`** and the pool's first frame already has content — no
 * skeleton flash. The skeleton only appears on a **genuinely cold fetch** (first time in this session, and the main-process cache missed too).
 *
 * ⚠️ **Three-frame correspondence** = Frame 3 (loading) / Frame 1 (content) / Frame 2 (empty) of
 * `06-main-software-updates/mockups/03-release-notes-tab.html`.
 */
export type PoolReleaseNotesData = {
    state: "loading";
} | {
    state: "content";
    /** Selected version (no v prefix) — if it differs from the requested value, it means "the requested version is not in the list; fell back to the closest one" */
    version: string;
    /** Header subtitle (finished by the shell's `t()`) — e.g. "August 30, 2026 · Stable channel" */
    subtitle: string;
    /** Channel badge text (finished by the shell's `t()`) — "Stable".
     *  ⚠️ The data source is `/releases/latest`, which by GitHub's definition excludes pre-releases ⇒ always the stable channel;
     *  if a preview channel is ever truly added (endpoint change) **this must change with it**, otherwise the badge starts lying. */
    channelLabel: string;
    /** Release body (raw GFM) — the pool renders it through `MarkdownView` (same path as the plugin detail page) */
    body: string;
    /**
     * Target of "View all on GitHub" / "All versions" — the **releases list page** (`github.com/O/R/releases`),
     * not the page of this particular release.
     *
     * 🔴 Why not `htmlUrl` (the main process's `ReleaseNotes.htmlUrl` is the single-release page): all **three** links in mockup 03
     * (Frame 1 header `.rn-actions` "View all on GitHub →", `.rn-all` "All versions → GitHub ↗",
     * Frame 2 `.rn-empty-link` "View on GitHub →") **point to the list page** — the single-release URL is useless for any of them.
     * So the shell pushes the list page derived from `product.updateUrl` (the `listPageUrl` of `useReleaseNotes.ts`)
     * instead of pushing `htmlUrl` down.
     *
     * **Optional**: when `updateUrl` is unavailable (dev has no `product.json`) ⇒ the field is absent ⇒ the pool **does not render** these links
     * (an empty link is worse than no link).
     */
    listUrl?: string;
    /** Left slim-column history (descending, including the selected version) */
    historical: PoolReleaseNotesHistoryItem[];
    /**
     * "Refreshing" phase (04 "release-notes refresh button") — pushed down by the shell; **the pool does not judge it itself** (same rule as `state`):
     * `true` = a refresh is in flight ⇒ the header button spins + is disabled + `aria-busy`, and **the body keeps the old content** (no return to the skeleton).
     * `undefined` = not refreshing.
     */
    refreshing?: boolean;
    /**
     * Refresh-result note (a complete sentence finished by the shell's `t()`; data-bearing text belongs to the shell) — `undefined` = not rendered.
     * Three variants: "Already up to date" / "Found a new version {{version}}…" / "Refresh failed · Showing local cache".
     * Assembled only on the forced pass ⇒ ordinary fetches (version switches/retries) leave no residue.
     */
    refreshNote?: string;
    /**
     * The **full sentence** for the first-launch auto banner (finished by the shell's `t()`, version number included) — `undefined` = no banner.
     *
     * Why a "single sentence" instead of `banner: boolean` + the pool doing its own `t("New version {{version}} detected…")`:
     * the pool's self-produced-text line is **not drawn** here for shell views (modeled after the welcome page — `WelcomePoolView` uses `t()` only
     * for its own few hardcoded labels). A banner sentence containing a version number = data-bearing, and data-bearing text belongs to the shell (same as `subtitle` /
     * `channelLabel`). Incidentally: only the shell knows whether this sentence should appear at all ("the one automatic first-launch show" is the shell's account).
     */
    banner?: string;
} | {
    state: "empty";
    /**
     * 🔴 **This state has exactly one field** — not an omission; the **empty state has nothing to convey**.
     *
     * Every word on mockup 03 Frame 2 (the subtitle "Cannot connect to GitHub", the left slim-column placeholder "No local cache /
     * fetched automatically once online", the body "Failed to load release notes" plus its description, "Retry") is **pure static copy** —
     * it contains no data and varies with nothing beyond version/date/language, so under hard constraint 2 "all UI text goes through `t()`"
     * it belongs to **the pool's own `t()`** (the pool has its own i18n context, same as `WelcomePoolView`).
     * Pushing a static string down from the shell would turn "where translation happens — shell or pool" into a two-place decision.
     *
     * ⚠️ Why not even the "reason": `ReleaseNotes` failure has **only one channel** — the main process converts the error into
     * an `Error(message)` and rethrows; `UpdateLegError.detail.code` (`network` / `rate-limited` /
     * `not-found`) **cannot cross IPC** (`invoke-log.ts`'s `loggedHandle` rethrows as-is; Electron only
     * serializes `message`). So telling "network down" from "GitHub rate-limited" would first require making errors **structured across IPC**,
     * which is main-process/contract-side work, **not something the renderer can patch in**. This field keeps the single generic copy from the mockup.
     * (A related note: no "offline" badge is rendered either — see the 🔴 paragraph at the end of this file.)
     */
    listUrl?: string;
};
/**
 * One row of the about-page field table.
 *
 * 🔴 **`label` also goes through the shell's `t()`** — the only structural difference between this entry and `PoolReleaseNotesData`, and the reason is not "consistency for looks":
 * of the eight labels on the about page (version/commit/date/Electron/Chromium/Node.js/V8/OS), **not one is framework text independent of data**
 * — every row is "the name of this piece of data", the same kind as `channelLabel` ("Stable" = the name of the channel the data came from).
 * The pool's boundary is **"data-bearing text is pushed by the shell; pure framework text is written by the pool"** (header note of `ReleaseNotesPoolView`):
 * what the pool produces itself should be chrome like `t("Copy")` / `t("Check for updates…")` that **contains no field names**.
 *
 * Side benefit (this is where the "fields are extensible = zero architecture change" promised by 06 §4.2 comes true): adding a field = adding one item to the shell-side array,
 * and **the pool side needs not change a single word** — the pool only knows "render as many rows as you are given" and neither knows nor needs to know what "version" means.
 * Conversely, if the pool kept its own label table, adding a field would require synchronized changes in both shell and pool, and the order of the two could drift at any time.
 */
export interface PoolAboutField {
    /** Field name (finished by the shell's `t()`) — e.g. "Commit", "Electron", "Email" */
    label: string;
    /** Field value — displayed as-is, unprocessed by the shell (the **pure** version number from `app.getVersion()`, without a VS Code-style `(user setup)` suffix) */
    value: string;
    /**
     * Presence = the value is a **link** (04 "about page redesign" principle ② "identity/contact/provenance are always clickable"):
     * `mailto:` → the pool renders `<a href>` (the global external-link route `EXTERNAL_PROTOCOLS` includes mailto → openEmail);
     * `https` → external link (`target="_blank"`, the same route hands off to the system browser; the app itself does not navigate away).
     * `undefined` = plain text (machine-produced values like commit hashes / version strings — not clickable, and should not be).
     */
    href?: string;
    /**
     * true = the value is rendered one shade dimmer (`--text-secondary`) — used by the author card's **secondary email** row (04 design §3②: the primary
     * uses link color, the secondary drops a shade; hierarchy expressed by both order and color; same as the mockup's `.mail--secondary`). `undefined` = normal shade.
     */
    secondary?: boolean;
}
/** One card in the about-page card area (04 design §4.1 ③: this version / runtime / author — equal width within the 640 content column) */
export interface PoolAboutCard {
    /** Card title (finished by the shell's `t()`) — e.g. "This version", "Runtime", "Author" */
    title: string;
    /** Rows in the card — text in the card is **left-aligned** (04 decision ①: centered content column ≠ centered rows; key: value pairs must align vertically) */
    rows: PoolAboutField[];
}
/**
 * Shell→pool data for the about tab — **two-state discriminated union** (the 06 §4.2 layout has no third state).
 *
 * 🔴 **The pool makes no decisions of its own** (same as `PoolReleaseNotesData`): whatever `state` says, it renders that branch.
 *
 * ⚠️ **Why there is no `empty`/`error` state**: the about page's data comes from the **local main process** (`app:getProductInfo` reads
 * `product.json` + `process.versions`), not the network — `electron/product.ts`'s `loadProduct()` falls back on missing values and **never throws**
 * (commit/date fall back to `—`, 06 §4.4). So the "fetch failed" state is already absorbed on the main-process side into
 * a content state whose values are `—`; the renderer needs no second degradation surface. The shell only falls back to a same-shaped `content` when
 * `getShellExposed()` is unavailable (non-Electron environment, where the pool view would not be rendered anyway), so the pool is never left on a skeleton.
 *
 * ⚠️ **Two-frame correspondence** = Frame 6 (content) of `06-main-software-updates/mockups/02-update-notification-and-about.html`;
 * `loading` has no mockup frame — it is a **single-frame transition** (data comes from local IPC, not the network); the skeleton is drawn in the content shape
 * to avoid layout jumps (same trade-off as `ReleaseNotesPoolView.LoadingFrame`).
 */
export type PoolAboutData = {
    state: "loading";
} | {
    state: "content";
    /** Brand name — `product.nameLong` (the single source of truth is `electron/product.json`; not hardcoded in the view) */
    name: string;
    /**
     * Brand logo URL — resolved by the shell's `getAssetPath("assets/logo.svg")` and pushed down (**the same asset and the same rule as `titleBar.logoUrl`**:
     * the pool does not import core; asset paths are always resolved by the shell).
     *
     * 🔴 **This field is a documented deviation made while "implementing from the acceptance image"**: mockup Frame 6's `.about-logo` hand-drew a
     * rounded blue square + white square (pure placeholder). The real asset `public/assets/logo.svg` is a rounded blue square + "LD",
     * and that file's own header comment says "**replace this file to change the logo — no code changes needed**" —
     * hand-drawing a square here would make that comment a lie for this page, and the same app would end up with two contradictory "LinkDesk logos"
     * (one in the title bar, one on the about page). So the real asset is used: **one file, one rule for the brand logo across the whole repo**.
     */
    logoUrl: string;
    /** HERO version pill (04 design §4.1: the version was moved from the field table next to the name — why this page was opened should be visible at a glance) */
    version: string;
    /** HERO tagline (a complete sentence finished by the shell's `t()` — decision ⑤ copy "one container for all the ways you work"; it is a label and must be translatable) */
    tagline: string;
    /**
     * Card area (04 design §4.1 ③: three equal-width cards inside the 640 content column) — assembled by the shell; the pool only `map`s.
     * The author card being **entirely absent** = `product.author` has an invalid shape (fallback: skip the whole card, not render a screen of `—`) ⇒ 2 or 3 cards.
     */
    cards: PoolAboutCard[];
    /**
     * Footer copyright line (a complete sentence assembled on the shell side — `© ${year} ${product.author.copyrightHolder} · MIT License`).
     * `undefined` = not rendered (author block absent ⇒ the copyright line has no named holder; it lives and dies with the author card).
     */
    footerCopyright?: string;
    /**
     * Target of the footer's "View source on GitHub" — derived from `updateUrl` (owner/repo segments → `github.com/O/R`,
     * **never hardcoding the repo URL**; same derivation as `useReleaseNotes.listPageUrl()`); `undefined` = not rendered (same "an empty link is worse than no link").
     */
    repoUrl?: string;
};
/** One manual chapter — **fields mirror `AiManualChapter` in `src/core/types/ipc/aiManual.ts`**.
 *  ⚠️ Why not import that type directly: the pool view lives at **render time**, while `types/ipc/aiManual.ts` is a
 *  **cross-context wire contract** (imported by both the main process ↔ shell preload ends). Between the pool and it there is also one handoff by the shell
 *  (`useAiManual` assembles the DTO) — following the existing practice of `PoolReleaseNotesHistoryItem` toward `ReleaseNotes`:
 *  the shell **copies the wire shape as-is** into a pool shape; two banks, each evolving independently (not duplicate definitions but each bank's own type surface). */
export interface PoolAiManualChapter {
    /** Chapter id — filename minus `.md` (`03-by-task`). **Stable identifier**: navigation selection state and keys use it; ⛔ never use the title as the id
     *  (titles change, and selection state would be lost). */
    id: string;
    /** Chapter title — the shell parses it from the first `# ` in the body (falls back to the id when parsing fails). **Data, not copy**: the manual body exists only in Chinese,
     *  ⛔ never passed through `t()` (switching languages must not change the manual's content — the manual is a document, shipped as-is with the package). */
    title: string;
    /** Chapter body markdown (GFM) — handed to the **sole md renderer** `MarkdownView`; the pool does not parse it itself. */
    markdown: string;
}
/**
 * Shell→pool data for the AI operation-manual tab — **three-state discriminated union** (same shape as `PoolReleaseNotesData`).
 *
 * 🔴 **The pool makes no decisions of its own** (family iron law): whatever `state` says, it renders that branch.
 *
 * ⚠️ **`empty` covers two origins, deliberately**: "this build ships without the manual" (`chapters: []`; the main-process side
 * `ai-manual.ts` does not throw) and "unavailable outside the shell" (vitest / pure preview ⇒ `getShellExposed()` is undefined).
 * To the reader they are the same thing: **there is nothing to read here**, and the line below gives the directory where the manual **should** live for self-inspection.
 * The only difference is `dir`: the main process's reply carries the real path; when unavailable it is an empty string ⇒ the view skips that line (not rendering an empty path).
 */
export type PoolAiManualData = {
    state: "loading";
} | {
    state: "content";
    /**
     * `app.getVersion()` — **the sole proof that "this manual belongs to this version"** (criterion ②: in the installed build the manual is reachable
     * **and its content matches the current version**). The shell renders it explicitly next to the title so users/maintainers can verify.
     * 🔴 It comes from **the main process's `app.getVersion()`**, not the version number inside the manual body — the body's is human-readable narrative and lags behind.
     */
    version: string;
    /** All chapters, **sorted ascending by filename** (`00-`/`01-` prefixes are the reading order; the main process has already sorted them; the pool does not re-sort) */
    chapters: PoolAiManualChapter[];
} | {
    state: "empty";
    /** Absolute path where the manual **should** live (main-process resolution) — used to point the way in the empty state; empty string = even the path is unknown ⇒ skip that line */
    dir: string;
};
/** A tab's representation in the pool — serialized when the shell pushes layout */
export interface PoolTab {
    id: string;
    pluginId: string;
    title: string;
    sourceId?: string;
    /** Tab tooltip copy — **for humans only** (used when present; when absent the pool falls back to `title` + a "double-click to pin" suffix).
     *  🔴 2026-09-27: ⛔ never use `sourceId` as copy — it is the **functional key** for cross-group moves / event addressing / plugin-bound data
     *  (the plugin API `tabs.closeBySourceId` matches on it), and on plugin tabs it is often an internal id like `settings-2` or `serial-monitor-49`;
     *  when HintTip was consolidated it was once printed verbatim into the tooltip. The shell's serializeGroups resolves it on the spot:
     * file tabs → full path (the original intent of ); everything else → `undefined`. */
    hint?: string;
    dirty?: boolean;
    // 🆕  metadata required for TabBar rendering
    /** Tab icon — IconBarIcon discriminated union ( view tabs = Type-2 identity img; file tabs = file-type icon
     *  codicon/img. The shell's serializeGroups resolves it on the spot; the pool renders dumbly — previously only emoji/img strings existed, so codicon/lucide tabs fell through) */
    icon?: IconBarIcon;
    /** Pinned tab (Modeled after VS Code pinned tabs) */
    pinned?: boolean;
    /** Tab close behavior — from plugin.json tabBehavior.closeBehavior */
    closeBehavior?: "normal" | "confirm" | "blocked";
    /** Singleton plugins (settings/marketplace etc.) — TabBar shows no [×] close button */
    singleton?: boolean;
    /** Shell-internal views (welcome/plugin details/release notes/about/AI manual) — MainPool content area does not render PluginComponent */
    shellRendered?: boolean;
    /** Shell-internal view type — "welcome" | "plugin-detail"; the pool routes to the corresponding component */
    shellType?: string;
    /** Target plugin ID of the plugin-detail view (whose detail page it is) */
    detailPluginId?: string;
    /** host plugin ID contributing views to the plugin-detail main area (the active marketplace plugin in factorySlots — it is the one
     *  contributing the render surface, ≠ detailPluginId). The shell's serializeGroups resolves and stamps it on the spot; consumed by the pool host to load contributed modules (resolvePath
     *  needs the contributing plugin's root); no active marketplace plugin → undefined = no contribution. */
    detailContributorId?: string;
    /** renderPath of the view contributed to the plugin-detail main area — the _renderPath declared by the active marketplace plugin's contributes.views.main[]
     *  "plugin-detail" entry. Resolved and stamped on the spot by the shell's serializeGroups; consumed by the pool's ShellViewRenderer:
     *  present → dynamic import of the marketplace DetailView; missing/failed to load → the shell's PluginDetailPoolView is the fallback. */
    detailViewRenderPath?: string;
    /** shell→pool data for the release-notes tab (**the shell thinks, the pool draws** — the shell fetches, attaches here and pushes down; the pool only draws).
     *  ⚠️ Same shape as `detailPluginId`/`detailViewRenderPath` (per-tab payload for shell views) — **not a new paradigm**.
     *  Only the one tab with `shellType === "release-notes"` carries it (at most one per window). */
    releaseNotes?: PoolReleaseNotesData;
    /** shell→pool data for the about tab — the **second instance of the same rule** as `releaseNotes`
     *  (per-tab payload for shell views, **not a new paradigm**). Only the tab with `shellType === "about"` carries it. */
    about?: PoolAboutData;
    /** shell→pool data for the AI operation-manual tab — the **third instance** of the same rule
     *  (per-tab payload for shell views). Only the tab with `shellType === "ai-manual"` carries it (at most one per window). */
    aiManual?: PoolAiManualData;
}
/** Split group — each group occupies one flex area containing N keep-alive tabs */
export interface PoolGroup {
    id: string;
    flex: number;
    activeTabId: string;
    tabs: PoolTab[];
}
/** Recursive split-tree node—either a leaf (holding one TabGroup) or a fork (holding two subtrees) */
export type SplitNode = {
    type: "leaf";
    groupId: string;
} | {
    type: "branch";
    direction: "horizontal" | "vertical";
    children: [
        SplitNode,
        SplitNode
    ];
    sizes: [
        number,
        number
    ]; // percentages, e.g. [50, 50]
};
/** View types creatable via [+] — computed by the shell from getTabCreatableViews() at pushLayout; W1: icon/iconSource = pre-resolved by the shell's pickIdentityArt() (same source as the tab bar/marketplace); undefined ⇒ the pool falls back to emoji */
export interface CreatableViewMeta {
    pluginId: string;
    label: string;
    icon?: string;
    iconSource?: "codicon" | "svg" | "url" | "lucide"; // union identical to plugin.schema.json iconSource (contract generation source)
}
/** Bottom panel view metadata — serialized from the panel view registry */
export interface PanelViewMeta {
    id: string;
    title: string;
    pluginId: string;
    /** view render entry path — resolved by the loader (_renderPath); the pool's PluginComponent dynamic-imports it.
     *  Same as ShellViewMeta (sidebar contribution); panel views have zero special channel. */
    renderPath: string;
    /** view action-area declaration passed through — rendered to the right of the PanelZone tab bar for the active view (no declaration → blank right side) */
    titleActions?: TitleActionWidget[];
}
/** container switcher dropdown item — includes hidden views + visibility/active markers (mockup frame 2 decision) */
export interface PanelSwitcherItem {
    viewId: string;
    /** View name — already resolved by shell t() (display-text iron law) */
    title: string;
    /** Owning plugin ID — sub label (e.g. "demo-plugin") */
    pluginId: string;
    /** Current visibility — ✓ checked = visible */
    visible: boolean;
    /** Whether this is the active view */
    active: boolean;
}
/** container switcher dropdown group — dd-group container title + dd-item list */
export interface PanelSwitcherGroup {
    containerId: string;
    /** Container title — already resolved by shell t() */
    containerTitle: string;
    items: PanelSwitcherItem[];
}
/** Bottom panel layout — consumed by  PanelZone */
export interface PanelLayout {
    visible: boolean;
    height: number;
    /** 🆕  panel dock edge — consumer of  dockTo (panel position). Top/bottom = horizontal band (align controls column span);
     *  left/right = vertical strip between the main area and the corresponding sidebar (5-band layout). Defaults to "bottom". */
    edge?: "bottom" | "top" | "left" | "right";
    /** 🆕  panel horizontal alignment — consumer of  setAlign. Geometry is derived by the pool grid (); the shell only pushes config.
     *  center=main-column width / left=extends under the left sidebar / right=extends under the right sidebar / justify=full width. Defaults to "center". */
    align?: "left" | "center" | "right" | "justify";
    /** 🆕  panel width — used when edge∈{left,right} (strip width); top/bottom still use height. Defaults to 300. */
    width?: number;
    activeViewId: string;
    views: PanelViewMeta[];
    // ──  drag clamp bounds — same as  (shell LayoutEngine dock declarations pushed; zero hardcoding in the pool).
    //   Axis-aware: horizontal bands (edge∈{bottom,top}) use minHeight/maxHeight; vertical strips (edge∈{left,right}) use minWidth/maxWidth. ──
    minHeight?: number;
    maxHeight?: number;
    /** 🆕  drag min/max width for vertical-strip panels (left/right) — pushed from shell dock.minWidth/maxWidth */
    minWidth?: number;
    maxWidth?: number;
    /** [+] button tooltip — pushed as shell t("New panel view") (display-text iron law; no panel:createView listener in the shell = safe no-op) */
    createTooltip?: string;
    /** container switcher dropdown DTO — lists all views per container (including hidden), mockup frame 2 */
    switcher?: PanelSwitcherGroup[];
    /** empty-state primary text — pushed as shell t() when all views are hidden / none contributed */
    emptyText?: string;
    /** empty-state guidance — pushed as shell t() like emptyText */
    emptyHint?: string;
    /** 🆕  panel can detach (PanelZone ⤢ button visibility) — when true, render the detach button; clicking emits "panel:detach" (handled by the shell's detachPanel)
     *  — after detaching, the drift window renders this panel exclusively (main area gets an empty placeholder I9-13); built-in false for the drift window (the panel is already outside; no need to detach again) */
    detachable?: boolean;
    /** 🆕  ⤢ button tooltip — pushed as shell t("Panel in its own window") (display-text iron law) */
    detachTooltip?: string;
}
/** Status bar entry — serialized from the shell StatusBar's three sources (contributed/dynamic/event) + shell fixed items (display-text iron law: already resolved by shell t()).
 * renamed to PoolStatusBarItem — same name as api/types.ts's StatusBarItem (manifest contribution type);
 *  flattening the contract into one file would declaration-merge them into a ghost composite type (pluginId would become required); the pool line uses the Pool prefix for disambiguation. */
export interface PoolStatusBarItem {
    id: string;
    pluginId: string;
    /** codicon icon name (no codicon- prefix — the pool adds it) */
    icon?: string;
    label: string;
    title?: string;
    align: "left" | "right";
    /** Command ID executed on click */
    onClick?: string;
    /** Custom-drawn status bar component marker — the normalized URL ( computed as ViewPluginEntry.statusBarRenderPath at loader registration;
     *  the shell reads it and sends the marker) of plugins declaring appearsIn.statusBar → the pool dynamic-imports directly by URL (serial-monitor connection light).
     *  Present = the custom component replaces all static entries of that plugin; absent = a normal entry. */
    componentRenderPath?: string;
    /** Leading divider — shell StatusBar render semantics (every item except the first in the left zone; except the first within a group in the right zone) */
    dividerBefore?: boolean;
}
/**
 * a row for an install job — the **only** row shape of the panel's "In progress / Waiting to install" two sections (dossier 18 §5 I.4).
 *
 * **Why the results area is not here**: install terminal states (success / failure / installed but missing dependencies) are announced by the existing toasts
 * (success = the sole outlet of the lifecycle consumer; failure = the settle failure toast with [Retry], see 73h/73e);
 * the results area is still grouped by source (`NotifGroup`). Job rows appear only in the two sections "not yet resulted" —
 * one install is always visible in exactly one place, never "installed twice".
 */
export interface NotifJobRow {
    /** Row key — jobId (**not** the display name: same-named plugins must stay distinguishable, dossier 18 §7 73d row). */
    id: string;
    pluginId: string;
    /** Display name (resolved shell-side: brought in by the caller, or backfilled from the package manifest after extraction) */
    name: string;
    /** Status glyph codicon class string (⟳ in progress / ○ waiting) */
    iconClass: string;
    /** Status phrase at the right end (already resolved by shell t(), e.g. "Downloading 62%", "Waiting to install") — rendered dumbly by the pool */
    statusLabel: string;
    /** Present only when the download section has a real value → the pool draws a 3px determinate progress bar; absent, nothing drawn (same semantics as NotifItem.percent). */
    percent?: number;
    /** Whether this row can be cancelled — when true the pool renders a [Cancel install] button */
    cancellable?: boolean;
    /** [Cancel install] button copy (shell t()) */
    cancelLabel?: string;
}
/** install job sections — the container of the first two of the panel's three fixed sections (order never re-sorted, §5 I.4) */
export interface NotifSection {
    /** "running" | "queued" — section identity (the pool does not discriminate; used only as a key) */
    key: string;
    /** Section title (shell t(), e.g. "3 in progress", "4 more waiting to install") */
    label: string;
    items: NotifJobRow[];
    /** Explanation for entries folded for exceeding "5 per section" (shell t()) — absent = nothing folded */
    foldedLabel?: string;
}
/** Notification action — serialized from the shell's ToastAction (onClick is a shell-side closure — the pool sends the click back for the shell to execute) */
export interface NotifAction {
    label: string;
    isPrimary?: boolean;
    /**
     * the command + arguments executed on press (the shell's `executeCommand(command, ...args)`).
     *
     * Read surface — an AI reading the DTO via the contract can answer "what is in the button / which command to run / what happens after running",
     * and **actually run it by calling `commands.executeCommand` accordingly** (the same command path as a manual click).
     * ⚠️ The pool's **click path is unchanged**: the panel still sends back the positional index and the shell-side closure executes it (closures are not serializable).
     * Absent = this button has no command (clicking only closes the notification) — same origin as the optional `PluginToastAction.command` in the contract.
     */
    command?: string;
    /** Command arguments — paired with `command`; meaningless when `command` is absent */
    args?: unknown[];
}
/** Notification entry — already resolved on the shell side (icon class/time/source label/actions all done shell-side) */
export interface NotifItem {
    id: string;
    /** Full codicon class string (e.g. "codicon codicon-error notif-severity-error") */
    iconClass: string;
    message: string;
    /** Shell formatTimeAgo (i18n t()) */
    timeLabel: string;
    /** Shell t("Source: {{source}}") — absent when there is no source */
    sourceLabel?: string;
    actions: NotifAction[];
    /** progress-type notification — the pool draws a 3px progress line from this (absent = not a progress notification, nothing drawn).
     *  progress is passed straight through the shell's toast store (the progress flag of pushToast/updateToast). */
    progress?: boolean;
    /** determinate percentage 0-100 — when present, draws a fixed-width fill; when absent, an indeterminate sweep (same semantics as the original ).
     *  The pool clamps on its own when rendering (the shell makes no guarantees — the contract is lenient; malformed values must not break the layout). */
    percent?: number;
    /**
     * wake flag (**read-only passthrough** of the  whitelist) — whether this notification is **allowed** to pop the panel out.
     *
     * 🔴 **Always present** (`false` also carries information: it is the answer to "this one did not pop", see the R5-4 trade-off). From it an AI answers
     * the "because of what" question of the toast six questions: `wake:true` = one of the four whitelist categories (a user-initiated install job /
     * a job terminal state / a plugin-initiated non-progress notification / a shell-produced entry that should pop), `wake:false` = explicitly silenced (progress types, etc.).
     * ⚠️ The sole criterion is the shell-side `notif.ts` `shouldWake` (`wake === true`) — this field is its readout outlet,
     * **not** a second criterion; ⛔ never regress this into an `isImportantNotif` catch-all (dossier 18, item ㉓).
     * ⚠️ "Minimized" **carries no mute authority** — the wake-back criterion has no "and not minimized" clause (adding one would make terminal states unwakeable, violating R5-5).
     */
    wake: boolean;
    /**
     * auto-dismiss duration (ms, `0` = never auto-dismiss). Passed straight through the shell's toast store — `pushToast` always fills it.
     * Same-source criterion as `persistent` (`ttl <= 0` ⇒ persistent, see `derivePersistent` in toast.ts).
     */
    ttl?: number;
    /** long-lived (never auto-dismisses; waits for a manual × click). Field present only when true — same default convention as `progress`. */
    persistent?: boolean;
}
/** Notification group — the shell NotificationCenter's buildSourceGroups (grouped by the first segment of source + unread sorting) */
export interface NotifGroup {
    key: string;
    /** First segment of source, or t("Other") */
    label: string;
    unread: number;
    items: NotifItem[];
    /** (S3/A6): explanation copy for entries folded away because this group exceeded the "5 per source" cap (already resolved by shell-side t(),
     *  rendered dumbly by the pool — same "display-text iron law" as timeLabel/sourceLabel/clearLabel).
     *  Absent = nothing was ever folded (contract leniency — behavior unchanged when old snapshots/test doubles omit this field; the line is not rendered). */
    foldedLabel?: string;
}
/** Notification center data — serialized on the shell side (unread count/copy/grouping all done shell-side) */
export interface NotifLayout {
    unread: number;
    /** Bell tooltip — t("{{count}} notifications") / t("Notifications") */
    bellTitle: string;
    panelTitle: string;
    /** header "Clear completed" button copy — clears only old messages that **have results and are read**; the panel stays open and in-progress items are untouched. */
    clearLabel: string;
    /** header "Minimize" button copy — the **only** action that closes the panel (semantics = collapse; nothing is lost). */
    minimizeLabel: string;
    emptyLabel: string;
    dismissTitle: string;
    /** header summary ("3 in progress · 4 more waiting to install") — **absent when there are no install jobs**.
     *  ⚠️ Reports only the **in progress / waiting** two numbers: never "N/M completed" — whether something got installed is not judged by a progress bar disappearing
     *  (explicitly forbidden in dossier 18 §7 73d row). */
    summaryLabel?: string;
    /** the two install-job sections (in progress → waiting to install), fixed-ordered before the results area. Absent = no installs in flight (these two sections are not rendered). */
    sections?: NotifSection[];
    /** fixed title of the third section "Results" (§5 I.4: the three sections never re-sort).
     *  Result **rows** are not here — they are the existing toasts grouped by source (see the NotifJobRow comment);
     *  this field only provides the fixed title above that area. Absent = no install activity (the title is not rendered, avoiding a spurious extra line in pure-notification scenarios). */
    resultLabel?: string;
    /** Count at the right end of the third section's title ("1 failed · 3 completed") — counts **install job terminal states**, not rows on the panel:
     *  rows get TTL-collected/folded by source; counting them would make the summary jump with unrelated actions (the sample in dossier 18 §5 I.4 is exactly this count). */
    resultSummary?: string;
    groups: NotifGroup[];
    /** auto-expand request — true when the shell decides "an important unread notification exists and the panel is currently closed".
     *  The pool only does a **false→true edge trigger** (opens the panel); it does not re-act while true persists;
     *  absent = no auto-expand (contract leniency — behavior unchanged when old snapshots/test doubles omit this field). */
    autoOpen?: boolean;
}
/** Status bar layout — consumed by  StatusBarZone */
export interface StatusBarLayout {
    items: PoolStatusBarItem[];
    /** Chord hint — complete string built by the shell's CHORD_CHANGED (key names are technical identifiers, not i18n) */
    chordLabel?: string;
    /** Notification center — serialized from the shell's toast store (panel open/close/clear/actions sent back for the shell to execute) */
    notif: NotifLayout;
}
/**
 * 04 "hover hint system" piece 1: command table — `commandId → { title, keybinding }`, feeding `data-hint-command`'s automatic copy and shortcut completion.
 *
 * **Must share a source with the menu**: today the menu reads "registry + formatKeyLabel" from `usePoolSync/titlebar.ts`;
 * if the hint bar pulled its own copy (the pool querying the registry again) ⇒ the same command would show different shortcuts in two places
 * (memory `two-rulers-one-caliber`: implementing the same judgment twice = false reds invalidate true reds).
 * ⇒ the shell's `usePoolSync/hints.ts` computes it once and pushes it down; the pool **renders dumbly** (display-text iron law).
 * `keybinding` is a **shell-formatted** string (`"Ctrl+K Ctrl+T"`) — the pool does not import `src/core/*` (Path B).
 */
export type PoolCommandHints = Record<string, {
    title: string;
    keybinding?: string;
}>;
export interface PoolLayout {
    version: 2;
    titleBar: TitleBarLayout;
    /** Icon bar — absent = the pool does not render the zone (detached-window subset; the main pool always pushes) */
    iconBar?: IconBarLayout;
    /** Sidebar — absent = the pool does not render the zone (detached-window subset; the main pool always pushes) */
    sidebar?: SidebarLayout;
    /** right sidebar real-zone layout — RightSidebarLayout (edge derived as the opposite of the sidebar's; carries no edge of its own) */
    rightSidebar?: RightSidebarLayout;
    groups: PoolGroup[];
    /** (P5): focused panel id — clicking panel blank space / set via tabs (the shell's reduceFocusGroup/FocusTab).
     *  Pool-side consumption: accent focus ring + isActive single-focus judgment (tab.id === activeTabId && group.id === activeGroupId). */
    activeGroupId?: string;
    /** recursive split tree — rendered recursively by MainRenderer, replacing the flat groups.map.
     *  leaf = a single GroupPane, branch = a horizontal/vertical flex container. */
    root?: SplitNode;
    /** list of views creatable as tabs — the dynamic menu of the pool GroupTabBar [+] button.
     *  Empty array = [+] offers no creation menu (detached window I9-6); absent = the pool falls back to the welcome page */
    creatableViews?: CreatableViewMeta[];
    panel?: PanelLayout;
    /** Status bar — absent = the pool does not render the zone (detached-window subset; the main pool always pushes) */
    statusBar?: StatusBarLayout;
    /** 04 "hover hint system" piece 1: master switch for the hint bar (mirror of `app.hint.enabled`).
     *  Absent/undefined = **on** — a detached window or a missing push must not mean "no hints anywhere in the app just because this field is missing". */
    hintEnabled?: boolean;
    /** 04 "hover hint system" piece 1: command table — source of the automatic copy and shortcuts for `data-hint-command`. Window-agnostic ⇒ always pushed. */
    commands?: PoolCommandHints;
}
/**
 * per-window tab list — produced by **the same serializer** (`serializeGroups`) as the layout tree pushed to the pool,
 * so "the label/icon/title in the list" necessarily matches "the row drawn on screen".
 */
export interface TabsSnapshotWindow {
    /** Shell-generated (main pool = `"main"`, detached windows get a shell-generated id) */
    windowId: string;
    mode: WindowMode;
    /** Whether the pool React has mounted and is ready (the shell still pushes layouts for unready windows — the preload buffers and replays, so the list still has content) */
    ready: boolean;
    /** The window's currently focused group (passed straight through from the shell's `tabState.activeGroupId` — not derived on the pool side) */
    activeGroupId: string;
    /** The window's split root tree (same type as `PoolLayout["root"]`; omitted for a single group with no nesting) */
    root?: PoolLayout["root"];
    /** Per-group tab list (including each group's `activeTabId` = the group's active tab) */
    groups: PoolGroup[];
}
/**
 * the return of `tabs.list()` — **all windows in one shot** (including active positions).
 *
 * 🔴 Why all windows instead of "the current window": the shell has **no** "current window" source of truth
 * (a repo-wide grep for `activeWindowId` returns zero hits; the window registry only holds per-window mode/ready/tabState) —
 * inventing a "current window" out of thin air would be fabricating data.
 * Callers (plugins/AI) filter by `windowId` for whichever window they want.
 */
export interface TabsSnapshot {
    windows: TabsSnapshotWindow[];
}
/** Tab namespace surface — modeled after VS Code vscode.window.createTerminal() */
export interface TabsAPI {
    tabs: {
        create(type: string, opts?: Record<string, unknown>): Promise<unknown>;
        openOrFocus(type: string, opts?: Record<string, unknown>): Promise<unknown>;
        focus(tabId: string): Promise<void>;
        close(tabId: string): Promise<void>;
        focusBySourceId(sourceId: string): Promise<void>;
        updateLabelBySourceId(sourceId: string, label: string): Promise<void>;
        closeBySourceId(sourceId: string): Promise<void>;
        /** tab activation subscription — consumed by file-tree autoReveal (actually present on preload-pool; the contract was backfilled in ) */
        onDidChangeActiveTab(cb: (data: {
            tabId: string;
            pluginId?: string;
            filePath?: string;
        }) => void): () => void;
        /**
         * **read-only enumeration** — which tabs are open, which plugin each belongs to, which is active
         * (each group's `activeTabId`).
         *
         * 🔴 Why it must exist: the layout source of truth is the shell's `useTabManager` (React state), and **the shell exposes no
         * getter whatsoever** (the pool can only passively wait for the next `pool.onLayout` frame, but "what is there right now"
         * should not depend on waiting). This method = the shell-side authority exposing itself on demand.
         * 🔴 **Pool-side only**: the shell is itself the tab authority and already holds this state, so it need not round-trip IPC to
         * ask itself ⇒ `preload-shell` does not implement it (the `ShellExposed.tabs` Omit in `surfaces.ts` already removes `list` —
         * same reasoning as `onDidChangeActiveTab`).
         *
         * @returns the list for all windows (see `TabsSnapshot`; **same origin** as 's layout tree — the same `serializeGroups`)
         */
        list(): Promise<TabsSnapshot>;
    };
}
/**
 * KeybindingRegistry type layer—split out of KeybindingRegistry.ts ().
 * Pure types, zero logic. Dependency direction: none (consumed by normalization / registry / chord / persistence / dispatch).
 */
export interface Keybinding {
    /** Command ID */
    command: string;
    /** Keybinding string—e.g. "ctrl+k" / "ctrl+shift+b" */
    key: string;
    /** context key `when` condition */
    when?: string;
    /** Source: user / plugin / builtin—on the same key, user wins */
    source: "user" | "plugin" | "builtin";
    /** Plugin ID—exact-matched on uninstall (B3 fix: the original `source === "plugin"` check wrongly removed every plugin keybinding) */
    pluginId?: string;
    /** extra args passed through to executeCommand at dispatch time */
    args?: unknown[];
}
/** Shell→main-process shortcut table sync payload (KeybindingRegistry.getKeybindingSyncData output) */
export interface KeybindingSyncData {
    shortcuts: string[];
    chordPrefixes: string[];
    chordCombos: string[];
}
/** Keyboard input snapshot—the executeShortcut payload forwarded after the main process normalizes before-input-event */
export interface KeyboardInput {
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    key: string;
    code: string;
}
/**
 * the executeShortcut payload forwarded by the main process's before-input-event—keyboard snapshot + source-window stamp.
 * KeyboardInput stays pure (keyboard fields only); the source is a required field on the composed type (attachKeyboardRouting always has windowId).
 * The shell dispatch uses it to arbitrate shortcuts by the focused window (Ctrl+W closes this window's tab)—isomorphic to ShellTabAction's top-level sourceWindowId (normalization).
 */
export interface ForwardedKeyboardInput extends KeyboardInput {
    sourceWindowId: string;
}
/** Keybindings — injected on both shell/pool ends (syncToMainProcess/onForwardedEvent are shell-side only). Consumed by pool plugins via setKeybindingCaptureActive (file-tree), required */
export interface KeybindingsAPI {
    keybindings: {
        getKeybindings(): Promise<Keybinding[]>;
        getConflicts(): Promise<unknown>;
        registerKeybinding(binding: unknown): Promise<void>;
        saveUserKeybindings(): Promise<void>;
        removeKeybindingForCommand(commandId: string): Promise<void>;
        resetKeybindingToDefault(commandId: string): Promise<void>;
        /** Clear a command's bindings — "this command wants no key": deletes all existing bindings + suppresses built-in/plugin
         *  defaults (still keyless after restart), until the user rebinds or "Restore default". ⚠️ Difference from resetKeybindingToDefault =
         *  when "the author declared a key", reset pushes that key back (a rollback); this method does not. Requires LinkDesk 0.2.46+
         *  (absent on older shells ⇒ callers feature-detect first) */
        clearKeybindingForCommand(commandId: string): Promise<void>;
        findKeybindingForCommand(commandId: string): Promise<Keybinding | undefined>;
        setKeybindingCaptureActive(active: boolean): Promise<void>;
        // Pure-data parameter — contextBridge structured clone drops KeyboardEvent native properties (.key/.code are C++ getters);
        // callers extract the fields first, then pass them (same as KeybindingSettingsView). A real KeyboardEvent naturally satisfies this shape.
        keyboardEventToKeyString(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">): string;
        onChange(cb: () => void): () => void;
        /** Shell→main process keybinding table sync (chord state-machine lookup) */
        syncToMainProcess?(data: KeybindingSyncData): Promise<void>;
        /** Receive intercepted events forwarded from the main process's before-input-event ( the payload carries sourceWindowId — adjudicated per focused window) */
        onForwardedEvent?(cb: (input: ForwardedKeyboardInput) => void): () => void;
    };
}
/** Notification primary-action button descriptor (gap K1) — plugins pass actions to notifications.show,
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
/** Progress notification handle — returned by show() when progress=true */
export interface NotificationHandle {
    /** Update the progress message + optional progress percent ( 0-100 determinate bar; omitted = indeterminate animation keeps pushing messages) */
    update(message: string, percent?: number): Promise<void>;
    /** Finish — closes the progress notification, optionally shows a completion toast */
    finish(message?: string): Promise<void>;
    /** Cancel — closes directly, no completion toast */
    cancel(): Promise<void>;
}
/** A menu item declared by a plugin in plugin.json—either a command or a submenu, never both */
export type ManifestMenuItem = string | {
    command: string;
    label?: string;
    when?: string;
    group?: string;
    /** sort weight—lower sorts first within a group (the shell menu bar uses it for group order) */
    order?: number;
    /** nested submenu—when children exist, command may be empty */
    children?: ManifestMenuItem[];
};
/** Menu item descriptor — returned by menu.getItems() (after shell-side when filtering + t() translation + shortcut resolution) */
export interface MenuItemDescriptor {
    command: string;
    label?: string;
    group?: string;
    order?: number;
    when?: string;
    /** The command title resolved by the shell (display-text iron rule) */
    title?: string;
    /** Display string — the form after formatKeyLabel (e.g. "Ctrl+K Ctrl+T"); ⛔ not the registry's raw string (normalization wedge of case 01, display-text iron rule) */
    shortcut?: string;
    /** the current item's √ mark (single-selection semantics — resolved dynamically by the shell's getItems, same as VS Code's menu current item).
     * Shared by the position/alignment submenu (the current item of edge/align) and the .1 view visibility list (visible view items). */
    checked?: boolean;
    /**
     * per-item command payload — dynamic menu items (e.g. the panel view visibility list) carry data to the command handler.
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
/**
 * Dialog wire contract—
 *
 * Once defined twice: linkdesk-api.ts (plugin side, ) and an inline struct in dialog-handlers.ts
 * manually aligned—changing one side silently broke the other. This module defines it in one place:
 * plugin API re-export (keeping the existing import path) + preload + main process, three ends import type.
 */
export interface DialogOpenOptions {
    title?: string;
    /** true = pick a directory; defaults to picking a file */
    directory?: boolean;
    filters?: {
        name: string;
        extensions: string[];
    }[];
}
/** rich-content confirm dialog open params—pool plugin → shell DialogService (addressed by content view declaration).
 *  title/message are fallbacks—when the content view fails to resolve, the shell falls back to a plain-text confirm (the dialog still shows; it does not silently die). */
export interface DialogContentOpenOptions {
    /** Fallback title—used when content resolution fails; the pool side has already resolved it via t() */
    title?: string;
    /** Fallback body—same as above */
    message?: string;
    /** Owning plugin of the content (the shell resolves the composite address via ViewContainerService.getView) */
    pluginId: string;
    /** Content view declaration id (registered in contributes.views) */
    viewId: string;
    /** Opaque payload—structured-cloned over IPC; the shell does not interpret it; the content view reads it via dialogHost.current() */
    payload?: unknown;
}
/** Plugin-side entry — three fields modeled after the VS Code QuickPickItem (label left of row 1 / description right of row 1 / detail left of row 2) */
export interface PluginQuickPickItem {
    label: string;
    /** Right of the first row */
    description?: string;
    /** Left of the second row */
    detail?: string;
}
/** Plugin-side show() options — minimal v1 surface: items + input placeholder/prefix (buttons/onHighlight deferred until consumers appear) */
export interface PluginQuickPickOptions {
    items: PluginQuickPickItem[];
    placeholder?: string;
    prefix?: string;
}
/**
 * Plugin quickPick request — the shape bridged from preload's show() to the pool's QuickPickHost via a contextBridge function proxy.
 * Local bridge inside the pool (zero IPC): the Promise resolves to the very object from opts.items (identity preserved, not a serialized copy).
 */
export interface PluginQuickPickRequest {
    opts: PluginQuickPickOptions;
}
/** Inline action button — rendered dumbly by the pool; clicks send back actionId */
export interface PoolQuickPickButton {
    /** Action ID — the shell executes onItemAction(item, actionId) */
    actionId: string;
    /** codicon icon name (without the "codicon-" prefix) */
    icon: string;
    tooltip?: string;
}
export interface PoolQuickPickItem {
    /** getKey(item) — the sole key for the shell's action re-resolution */
    key: string;
    /** getSearchText(item) — the pool's local fuzzy matching */
    searchText: string;
    /** Checked marker — ✓ to the left of the label. undefined = no checkmark (generic QuickPicks unaffected); true/false = render a fixed placeholder to keep alignment.
     * original meaning = the activated item; from normalization dossier batch 02 N2 onward **both semantics coexist explicitly** (each answers its own question; ⛔ never add a third use):
     *   ① "currently effective item" — theme/language pickers, the panel [+] view picker (✓ = this is what you are using now);
     *   ② "toggle state" — the panel tab's right-click view list (✓ = shown in the tab bar), the sidebar visibility menu (✓ = expanded/visible). */
    checked?: boolean;
    /** Left of the first row — already t()-resolved */
    label: string;
    /** Right of the first row — already t()-resolved. Reserved for **ownership/category/annotation** (plugin · container / category / owning recipe);
     *  🔴 normalization dossier batch 02 N2: **status must not borrow this slot** ("current", "hidden", "activated" go to detail) —
     *  borrowing it would squeeze out the ownership entirely, and since the pool is a dumb renderer the lost information cannot be recovered. */
    category?: string;
    /** Left of the second row — already t()-resolved */
    detail?: string;
    /** Display string — after the shell's formatKeyLabel (e.g. "Ctrl+K Ctrl+T"); ⛔ not the raw registry string — the pool renders a keycap pill (dumb splitting) */
    keybinding?: string;
    /** Inline action buttons */
    buttons?: PoolQuickPickButton[];
}
export interface PoolQuickPickData {
    open: boolean;
    placeholder: string;
    prefix?: string;
    items: PoolQuickPickItem[];
}
/**
 * Pool Dialog dumb-render data —  (floating-layer-normalization-design.md §7).
 *
 * Smart→dumb data flow: the shell's DialogService bridge (registered by the renderer) serializes options into a DTO and pushes it
 * (display-text iron law — button copy already resolved by shell-side t(); the pool renders as-is).
 * The Promise's resolve closure stays in the shell — the pool only sends back the action type (confirm/cancel); the shell settles.
 */
export type PoolDialogData = {
    open: false;
} | {
    open: true;
    title: string;
    message: string;
    /** Already t()-resolved on the shell side — the pool renders as-is */
    confirmLabel?: string;
    cancelLabel?: string;
    /** Alert mode — only the OK button; no cancel/Escape/backdrop close */
    isAlert: boolean;
    /** rich content slot — replaces title/message/default-button rendering when present (the dialog mechanics are unchanged:
     *  centering/overlay/Esc/trap/click-overlay-cancel are still provided by DialogHost). Content = a plugin view —
     *  the shell holds no renderer; the pool mounts it via PluginComponent (modeled after the FloatingPanel DTO). payload is opaque —
     *  the shell does not interpret it and the pool holds it as-is; the content view reads it via window.linkdesk.dialogHost.current(). */
    content?: {
        pluginId: string;
        /** Pool view registry addressing key — attached at loader runtime (ViewContainerService._renderPath) */
        renderPath: string;
        /** Opaque serialized payload — travels with the open parameters through shell→back to pool (structured clone); used by the content view to fetch data */
        payload?: unknown;
    };
};
/**
 * a readable projection of **pending dialogs** — "is a confirm/alert up, and what is it waiting for".
 *
 * 🔴 Relationship to `PoolDialogData`: that one is the **dumb-render payload** (the pool draws from it); this one is the **answer to "what is being waited on now"**
 * (reads the pending options registered in `DialogService`). Their shapes are deliberately same-origin but they are **not the same channel**:
 * that one goes over the `pool:dialog` direct push; this one is pulled on demand via `plugins:call("getPendingDialogs")`.
 *
 * Consumption surface = `window.linkdesk.dialogHost.pending()`.
 */
export interface PoolPendingDialog {
    /** `"confirm"` = cancellable (Escape/overlay click); `"alert"` = OK only (same source as `PoolDialogData.isAlert`) */
    kind: "confirm" | "alert";
    title: string;
    message: string;
    /**
     * Button copy — **already resolved by the shell per the display-text iron law** (explicit `confirmLabel`/`cancelLabel` take priority, otherwise i18n defaults;
     * the **same implementation** as the push-side `bridges.ts`, see `DialogService.resolveDialogButtons`).
     * `kind:"confirm"` → 2 entries (OK, Cancel); `kind:"alert"` → 1 entry (OK).
     * ⚠️ In rich-content mode (`content` present) the buttons are drawn by the plugin view itself ⇒ **empty array** (⛔ never guess OK/Cancel).
     */
    buttons: string[];
    /** rich-content confirmation — content = a plugin's self-drawn view. Gives the **identity** (not renderPath: that is the pool-internal addressing key,
     *  whereas this surface asks "what is the shell waiting for" from inside the pool); ⛔ no payload (the opaque payload can be large and is useless for reading "what is being waited on"). */
    content?: {
        pluginId: string;
        viewId: string;
    };
}
/** Title bar action buttons — rendered by the pool + sent back for the shell to re-resolve business semantics (zero pool semantics, except UI mechanical knowledge).
 * renamed PoolFloatingPanelButton — same name as poolActions.ts's PoolFloatingPanelAction (IPC round-trip action);
 *  flattening the contract into one file would declaration-merge them into a ghost composite type; the button descriptor uses the Button suffix for disambiguation (contract-family naming convention). */
export interface PoolFloatingPanelButton {
    /** Action id — open-in (open in the main window) / maximize / close; re-resolved by the shell */
    id: string;
    /** Action name already resolved by shell t() — mockup: hover tooltip (open-in expands the full text) */
    label: string;
    /** Built-in icon id — the pool picks the SVG by id (open-in/maximize/restore/close) */
    icon: string;
    /** Local-toggle only (I8-9 maximize→restore on the same button) — icon for the toggled state; absent = not a toggle action (sent back to the shell) */
    toggledIcon?: string;
    /** Copy for the local toggle's switched state (e.g. "Restore") — zero pool-produced text; both states' copy comes from shell t() */
    toggledLabel?: string;
    /** open-in style — icon-only by default, expands to full text on hover (mockup .fp-act.open-in) */
    expandOnHover?: boolean;
}
/** Explicit panel geometry (px) — after I8-5/I8-7 drag/resize, replaces the default centered large-card layout.
 * the same shape set through the API path (non-mouse path) via `panel.setFloatingBounds`. */
export interface FloatingPanelBounds {
    top: number;
    left: number;
    width: number;
    height: number;
}
export type PoolFloatingPanelData = {
    open: false;
} | {
    open: true;
    /** Panel identity — the shell's FloatingPanelService single-instance semantics adjudicates by viewId (I8-10: same viewId focuses / different viewId replaces) */
    viewId: string;
    /** Title — already resolved by shell t(); the pool renders as-is */
    title: string;
    /** Content plugin — the pool renders via PluginComponent(pluginId, renderPath) (the shell holds no renderer) */
    pluginId: string;
    /** Content view renderPath — addressed via the pool's view registry */
    renderPath: string;
    /** Title bar action buttons (order = render order: open-in / maximize / close) */
    actions: PoolFloatingPanelButton[];
    /** Language-switch copy re-push marker (refreshPanelText) — the pool only re-renders title/actions and skips focus acquisition (I8-8: only the first open takes focus) */
    refresh?: boolean;
    /** **API path** explicit geometry (pushed via `panel.setFloatingBounds`, one-shot — ⛔ the shell must not store it into
     *  refreshPanelText's draft, otherwise a language-switch re-push would snap the user-dragged panel back to its old spot).
     *  Three-way semantics: **absent** = leave geometry untouched (local state after drag/resize preserved as-is) | **partial fields** = set precisely
     *  (unspecified fields keep current values, same I8-5/I8-7 clamping) | **null** = back to the default centered large card (the pre-drag state). */
    bounds?: Partial<FloatingPanelBounds> | null;
};
/** geometry host request — preload forwards the API path to the pool's FloatingPanelHost (the pool is the source of truth for geometry:
 *  the panel renders in the pool, and only the pool knows where it truly is at this moment; the shell stores no geometry ⇒ cannot become a second ruler).
 *  `set` while maximized first exits maximization, then applies ("a set must take effect" — geometry and full-window state are mutually exclusive). */
export type FloatingPanelBoundsHostRequest = {
    op: "set";
    bounds: Partial<FloatingPanelBounds> | null;
} | {
    op: "get";
};
/** Readout of `floatingPanelHost.getBounds()` — the **actual** geometry of the pool-side render box + panel identity + maximized state.
 *  "No panel" is not part of this type — the return type is `PoolFloatingPanelGeometry | null`. */
export interface PoolFloatingPanelGeometry extends FloatingPanelBounds {
    viewId: string;
    pluginId: string;
    /** I8-9 maximized (purely visual state, filling the window) — when true the geometry = the full-window box (reported faithfully; ⛔ never report the stale pre-maximize values) */
    maximized: boolean;
}
/** UI overlays/menu/notification namespace surface — Modeled after VS Code vscode.window + ContextKey + the in-pool QuickPick/Dialog/FloatingPanel host bridges */
export interface UiAPI {
    /** Notifications — plugins raise notifications ( the only notification surface is the bell-wide notification panel; the bottom-right narrow-card path was removed wholesale), Modeled after VS Code vscode.window.showInformationMessage */
    notifications: {
        /** Raises a notification, **always returns a handle** (with update/finish/cancel) —  (S6) handle isolation:
         *  previously a handle was returned only when progress:true ⇒ a persistent failure notification (with [Retry]) could not be dismissed,
         * and after the user's manual retry succeeded, that "install failed" entry kept living on, the panel turning into a wall of failures (archive 18 A3/).
         *  ⇒ A notification can only be updated/removed by **the handle that created it**, whether or not it is a progress bar.
         * options.actions carries primary action buttons — clicking runs the shell's executeCommand(action.command, action.args),
         *  the command handler registered by the plugin itself. No actions → no buttons (status quo). Error kinds auto-stay 8s.
         * options.persistent=true long-lived notification — does not auto-dismiss, waits for the user to click × (for error diagnostics);
         * the long-lived cap is **bucketed by source**, 5 each (S3); over the cap, evict the oldest of the same source and show a summary notice */
        show(message: string, options?: {
            type?: "info" | "warning" | "error";
            /** true → progress notification: update can carry a 0-100 percent to drive a real progress bar () */
            progress?: boolean;
            /** true → long-lived notification: does not auto-dismiss (); for error-diagnosis / needs-user-decision scenarios */
            persistent?: boolean;
            actions?: PluginToastAction[];
            /** (S5) producer identity id — **a machine-read attribution key with no human copy** (the human-readable name is resolved by the shell).
             *  The panel **groups by source** and each group's 5-entry long-lived quota keys off this; omitted → all fall into the "Other" group.
             *  Plugins pass their own plugin id; the shell's own domains use `app.<domain>` (e.g. `app.update`).
             *  ⚠️ **Auto-injection is impossible** — the pool is a single shared-realm process where all plugins share the same `window.linkdesk`,
             *  and the preload cannot know "which plugin's tree issued this show()" ⇒ **only the author can declare it explicitly**.
             *  ⚠️ Old plugins that omit it still all fall into the "Other" group: this is a **new contract** and takes effect only after authors re-release. */
            source?: string;
        }): Promise<NotificationHandle>;
        /**
         * **read-only listing** — what the panel currently holds (counts / unread / each entry's content and buttons / wake and liveness criteria).
         *
         * 🔴 Why it must be exactly this shape: what is returned is the **bell-wide panel's DTO itself** (`NotifLayout`, the same `buildNotif(t)` output as
         * `pool.onLayout`'s `statusBar.notif`) — **not** a separately computed summary. Two rulers would inevitably clash: if the grouping/unread/copy the AI reads
         * differed from what is drawn on screen, the read surface would become a source of false information.
         * The design text (route B) also concedes that the layout snapshot **is already pushing** this data and just "hadn't opened the door"; this method is that door,
         * and behind the door it is still the same implementation (⛔ do not fork a second ruler).
         *
         * ⚠️ **Escaped windows get it too**: this method asks the **shell** via `plugins:call` (the shell holds the full state) and does not read this window's layout subset
         * — an escaped window's `statusBar` is cut off by the policy table, so going through layout would answer "no notifications".
         *
         * ⚠️ Copy-type fields (`bellTitle`/`panelTitle`/group labels/`timeLabel`…) are **already resolved by the shell's `t()` in the current language**;
         * callers display them verbatim (display-text iron rule).
         */
        list(): Promise<NotifLayout>;
        /**
         * **change subscription** — calls back whenever the notification surface changes (added/updated/dismissed/acknowledged/panel open-close).
         *
         * 🔴 **The signal carries no payload**: the callback does **not** include a snapshot — including one would push the "data" through a second path,
         * and someone on the pool side would then use the signal's data instead of asking the authority (`list()`), growing a second ruler again. This subscription only answers
         * "**it changed just now**"; for answers call `list()` (consistent with the "status push + pull on demand"
         * division of `watchFile`/`events.on`).
         *
         * Transport = the shell's `events.emit("notif:changed")` → main-process broadcast → the pool's `events.on` (**no new IPC channel**;
         * the namespace matrix §3 channel count unchanged). ⚠️ The broadcast stores its payload by default for new pools to replay ⇒ a newly started pool may receive
         * a "stale change signal" — this subscription has idempotent re-fetch semantics (on receipt, call `list()`), so it is harmless.
         *
         * @returns unsubscribe function
         */
        subscribe(cb: () => void): () => void;
    };
    /** Menus — declarative read/write for plugins */
    menu: {
        registerItems(menuId: string, pluginId: string, items: ManifestMenuItem[]): Promise<void>;
        getItems(menuId: string, context?: Record<string, unknown>): Promise<MenuItemDescriptor[]>;
    };
    /** ContextKey — plugins SET state for the shell's when clauses to read */
    contextKey: {
        set(key: string, value: unknown): Promise<void>;
        _getValue?(key: string): unknown;
    };
    /** Dialogs — confirm/alert/file selection */
    dialog: {
        confirm(message: string): Promise<boolean>;
        alert(message: string): Promise<void>;
        /** File/directory picker — Modeled after Tauri dialog.open ( openFile is the canonical plugin-side name; this method is kept for existing consumers) */
        open(opts?: DialogOpenOptions): Promise<string | null>;
        /** Opens the file picker — returns the user-selected path; cancel → null. Security is controlled by the main process */
        openFile(opts?: DialogOpenOptions): Promise<string | null>;
        /** rich-content confirm — the dialog's content = a plugin self-drawn view (content view declarative addressing + opaque payload).
         *  Dialog mechanics match confirm (centered/mask/Esc/focus lock/click-mask-to-cancel); content layout and buttons are drawn by the plugin view
         *  (Modeled after VS Code's "the dialog is the shell's, the content is the plugin's"). title/message as fallback — if the content view fails to resolve,
         *  the shell falls back to a plain-text confirm (the dialog still appears, no silent death). Returns true = confirmed, false = cancelled/closed. */
        confirmContent(options: DialogContentOpenOptions): Promise<boolean>;
    };
    /** plugin quickPick picker — local bridge inside the pool (zero IPC, rendered by QuickPickHost). A settle of null → undefined */
    quickPick: {
        show(opts: PluginQuickPickOptions): Promise<unknown>;
    };
    /** QuickPick host rendering bridge — consumed by the pool's QuickPickHost (the shell preload has no such surface) */
    quickPickHost: {
        registerHost(fn: (req: PluginQuickPickRequest, settle: (key: string | null) => void) => void): () => void;
        onShow(cb: (data: PoolQuickPickData) => void): () => void;
        select(key: string): void;
        highlight(key: string): void;
        close(): void;
        itemAction(key: string, actionId: string): void;
    };
    /** Dialog dumb-render subscription — consumed by the pool's DialogHost (the shell preload has no such surface). Named dialogHost —
     * the dialog namespace is already the plugin-side confirm/alert/open API */
    dialogHost: {
        onShow(cb: (data: PoolDialogData) => void): () => void;
        /** data of the currently open dialog — after the rich-content view mounts, read via dialogHost.current()?.content?.payload
         *  (readable in content mode only; none open / already closed → null). The shell preload has no such surface (a local read inside the pool). */
        current(): PoolDialogData | null;
        /**
         * **the in-flight dialog list** — "is a confirm/alert currently up, and what is it waiting for".
         *
         * Division of labor with `current()`: `current()` reads **the dumb-render data received by this process** (`open:false` means closed;
         * content already given in full in the form the pool will draw); `pending()` reads **the shell-side DialogService's in-flight requests**
         * (the raw `options` + `kind` + button copy) — the two surfaces ask different facets of the same thing,
         * hence **both are kept**: `pending()` additionally gives "who asked / the rich-content view's pluginId+viewId / how many buttons".
         *
         * 🔴 **The single slot is an honest description of the status quo, not a design goal**: the shell→pool dialog path (`pending` in `src/App/bridges.ts`)
         * carries only one entry at a time; a second `confirm` overwrites the previous settle closure (that Promise never settles —
         * a **pre-existing defect**).  only makes it "readable", **without changing Promise semantics** ⇒ this method truthfully reports "the last one opened".
         * An empty array = no dialog up right now.
         *
         * ⚠️ In rich-content confirm mode () **the buttons are drawn by the plugin view** and the shell does not know how many there are ⇒
         * `buttons` is an empty array and `content` gives the view identity — ⛔ do not guess "OK/Cancel" (fabricating data).
         *
         * ⚠️ `buttons`' **order = declaration order** (`resolveDialogButtons` always yields `[confirm, cancel]`), **not the left/right positions on screen**
         * — proven by CDP on 2026-09-28: on screen the secondary button is drawn left and the primary right, while this array always has confirm first.
         * To act, call `confirm()` / `cancel()` by index; ⛔ do not map by visual position.
         */
        pending(): Promise<PoolPendingDialog[]>;
        confirm(): void;
        cancel(): void;
    };
    /** (type B): floating panel dumb-render subscription — consumed by the pool's FloatingPanelHost (the shell preload has no such surface).
     * Named floatingPanelHost — the panel request API (panel.revealFloating) belongs to PanelAPI; the host rendering bridge belongs to this surface */
    floatingPanelHost: {
        onShow(cb: (data: PoolFloatingPanelData) => void): () => void;
        /** Action return — open-in (open in the main window) / close; settled on the shell side (business semantics re-resolved on the shell side) */
        action(actionId: string): void;
        /**
         * register the geometry host (called when the pool's FloatingPanelHost mounts). The main-world function is proxied via contextBridge
         * into isolated-world storage, per the `quickPickHost.registerHost` precedent. Returns unsubscribe.
         * ⚠️ The panel renders in the pool ⇒ **the geometry source of truth is in the pool**: dragging / resizing / the `panel.setFloatingBounds` API path
         * all ultimately land on this host (the shell stores no geometry and does no geometry math).
         */
        registerBoundsHost(fn: (req: FloatingPanelBoundsHostRequest) => boolean | PoolFloatingPanelGeometry | null): () => void;
        /**
         * read the current floating panel geometry (**synchronous** — answered directly in the pool with zero IPC, per the `dialogHost.current()` precedent).
         * Returns the **actually effective** geometry (the real result after clamping / maximizing, not the caller's intended value); **no panel** → `null`.
         *
         * Criterion usage: after `panel.setFloatingBounds({ top: 100, left: 80 })`, call this function to reconcile — `top/left` should equal
         * 100/80 (equal to the clamped values when out of bounds). ⚠️ The shell-side / CLI read outlet is not this function (that is an in-pool surface) but the pool-reported
         * shell mirror: the command `workbench.action.getFloatingPanelBounds`.
         */
        getBounds(): PoolFloatingPanelGeometry | null;
    };
}
/** Port list entry—the listPorts() return */
export interface SerialPortInfo {
    name: string;
    description: string;
}
/** Serial port status snapshot—F5 refresh / getStatus() return */
export interface SerialStatus {
    isOpen: boolean;
    portName: string;
    baudRate: number;
}
/** Open serial port config—plugin API input + consumed by the main-process serial-service */
export interface OpenPortConfig {
    portName: string;
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: string;
    encoding?: string;
    /** D8—resource ownership declaration: declared by the plugin itself at openPort (pool WCV means multiple plugins share one JS context,
     *  so the main process cannot identify the plugin from the sender); on unload, closePortsByOwner reclaims the hardware resources by it. */
    ownerPluginId?: string;
}
/** Serial data payload—the serial.data push ( evolved from the original port-name-less string—D6 payload objectification). */
export interface SerialDataPayload {
    /** Data-source port = routing key—consumers receive their own port's data by portName (multiple ports coexist, each receiving its own) */
    portName: string;
    /** Decoded line text */
    text: string;
}
/** Serial stats payload—the serial.stats push ( evolved from the original port-name-less SerialStats—the data source for the S10 per-port counters).
 *  tx/rx are push deltas (not cumulative values)—consumers accumulate on their own. */
export interface SerialStatsPayload {
    /** Stats-owner port = routing key—each port's counters accumulate independently */
    portName: string;
    tx?: number;
    rx?: number;
}
/** Serial system message payload—the serial.system push ( evolved from the original port-name-less string—the root fix for the S12 regex-extract-port-name hack).
 *  message keeps the V2 message format (a localized status banner embedding the port name, e.g. `---- <serial port opened> COM3 ----`—the runtime string itself is Chinese, verbatim samples live in the serial handler tests); portName is structured so no parsing is needed.
 * (P1)—type classification tag (review ①: classified at the source end, one concept written in one place, no consumer-side message-keyword matching):
 *  status = normal success flow (open/close/baud-rate switch); error = abnormal flow (D8 refusal of a second open on the same port / driver errors / unplug).
 *  Consumer-side routing by key: status filtered per port (other ports' operations are not shown); error globally visible (shown even on inactive tabs). */
export interface SerialSystemPayload {
    /** Message-owner port = routing key—consumed exclusively by this port's session (open/close state switches); non-matching sessions may still display the text but do not trigger a state switch */
    portName: string;
    message: string;
    /** Message category—status success flow / error failure anomaly (D8 refusal, driver error, unplug) */
    type: "status" | "error";
}
/** Serial / clipboard / inter-plugin communication / events / persistent storage namespace surfaces — modeled after VS Code SerialPort API + p2p + EventEmitter + state */
export interface DataAPI {
    /** Serial — read/write/listen, modeled after VS Code SerialPort API */
    serial: {
        listPorts(): Promise<SerialPortInfo[]>;
        /** D5 dual form: no arg → SerialStatus[] (all open ports, empty array = all closed) / with arg → a single port snapshot (for F5 traversal restore) */
        getStatus(): Promise<SerialStatus[]>;
        getStatus(portName: string): Promise<SerialStatus>;
        openPort(cfg: OpenPortConfig): Promise<void>;
        /** D2 — portName optional: omitted = the only open port (0 ports throws "serial port not open" / ≥2 ports throws "multiple serial ports open, please specify portName") */
        closePort(portName?: string): Promise<void>;
        sendData(data: number[], portName?: string): Promise<void>;
        sendText(text: string, enc: string, portName?: string): Promise<void>;
        setDtr(enable: boolean, portName?: string): Promise<void>;
        setRts(enable: boolean, portName?: string): Promise<void>;
        /** payloads made objects — SerialDataPayload.portName = routing key (multiple ports coexist, each receives its own) */
        onData(cb: (payload: SerialDataPayload) => void): () => void;
        onStats(cb: (payload: SerialStatsPayload) => void): () => void;
        onSystem(cb: (payload: SerialSystemPayload) => void): () => void;
    };
    /** Clipboard — read/write the system clipboard */
    clipboard: {
        readText(): Promise<string>;
        writeText(text: string): Promise<void>;
        /** Write a file list — used by file-tree copy/paste */
        writeFileList(paths: string[]): Promise<void>;
    };
    /** p2p targeted inter-plugin push — same pattern as bridge.broadcast (fire-and-forget) */
    p2p: {
        send(target: string, channel: string, data: unknown): void;
        on(channel: string, cb: (data: unknown) => void): () => void;
    };
    /** Generic event subscribe + publish — the inter-plugin data pipeline. channel is a free-form string; payloads are typed per channel — subscribers narrow */
    events: {
        /** on made generic — the payload type is inferred from the subscriber's cb (same as the event-system EventSystemApi;  already made the impl generic); channel contract types (ConfigurationChangedPayload etc.) can be passed directly */
        on<T = unknown>(channel: string, cb: (payload: T) => void): () => void;
        emit(channel: string, payload: unknown): void;
        heartbeat?(): void;
        notifyTheme?(isDark: boolean): void;
    };
    /** plugin persistent storage — centralized cache + file persistence */
    pluginState: {
        /** Read persisted state — a runtime dynamic value; defaults to unknown; callers narrow via explicit get<string>(...) or their own narrowing */
        get<T = unknown>(pluginId: string, key: string): Promise<T | undefined>;
        set(pluginId: string, key: string, value: unknown): Promise<void>;
        /** Subscribe to persisted state changes — exact match on pluginId+key (wildcard key subscription goes through events.on("plugin-state:changed"), see the  added export PluginStateChangedPayload). Returns unsubscribe */
        onChange(pluginId: string, key: string, cb: (value: unknown) => void): () => void;
    };
}
export interface WorkspaceFolder {
    /** Full folder path (file:// URI) */
    uri: string;
    /** Folder name—the last path segment */
    name: string;
    /** Index—the first opened folder is index=0 */
    index: number;
}
/** File/directory entry—shared by front and back ends */
export interface FileEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    isFile: boolean;
    size?: number; // bytes
    modifiedAt?: number; // Unix timestamp ms
    /** V whether the file is read-only (not writable) */
    isReadonly?: boolean;
}
export interface FileChangeEvent {
    path: string;
    type: "created" | "changed" | "deleted";
}
/** Environment info — returned by env.get() (assembled by the main process env-handlers) */
export interface EnvInfo {
    appDataDir: string;
    pluginsRootDir: string;
    appPluginsDir: string;
    /** (1.2-4): the user-installed package code root {userData}/plugins — the unpack home of .linkdesk-plugin (kept separate from the read-only appPluginsDir root) */
    userPluginsDir: string;
    pluginDataDir?: string;
    pluginCacheDir?: string;
    pluginExportsDir?: string;
}
/** IPC search:searchFiles payload—the wire subset of FileSearcher.SearchOptions (no signal) */
export interface SearchWireOptions {
    roots: string[];
    query: string;
    include?: string;
    exclude?: string;
    caseSensitive?: boolean;
    wholeWord?: boolean;
    useRegex?: boolean;
    maxResults?: number;
}
/** A single match—lineNumber is 1-based; matchStart/matchEnd are 0-based column ranges within the line (end exclusive) */
export interface SearchWireMatch {
    filePath: string;
    lineNumber: number;
    lineText: string;
    matchStart: number;
    matchEnd: number;
}
/** IPC search:searchFiles return—the wire shape of FileSearchResult */
export type SearchWireResult = Array<{
    filePath: string;
    matches: SearchWireMatch[];
}>;
/** Workspace / filesystem / path / environment / search / encoding namespace surfaces — modeled after VS Code vscode.workspace + env + ExtensionContext */
export interface WorkspaceAPI {
    /** Workspace — injected by the pool preload (the shell side uses WorkspaceService directly). Pool-authoritative namespace — a must-use plugin surface (file-tree), required */
    workspace: {
        getFolders(): Promise<WorkspaceFolder[]>;
        getActive(): Promise<string | undefined>;
        setActive(uri: string): Promise<void>;
        openFolder(): Promise<void>;
        addFolder(path: string): Promise<void>;
        removeFolder(path: string): Promise<void>;
        onDidChangeFolders(cb: () => void): () => void;
        onDidChangeActiveWorkspace(cb: (uri: string | null) => void): () => void;
    };
    /** Filesystem — plugin read/write (path validation is performed by the main process) */
    filesystem: {
        readTextFile(p: string): Promise<string>;
        writeTextFile(p: string, d: string): Promise<void>;
        exists(p: string): Promise<boolean>;
        createDir(p: string): Promise<void>;
        copy(src: string, dest: string): Promise<void>;
        /** rename/move a file or directory (atomic fs.rename in the main process; modeled after POSIX rename / VS Code fs.rename) */
        rename(src: string, dest: string): Promise<void>;
        remove(p: string): Promise<void>;
        listDir(p: string): Promise<FileEntry[]>;
        readBinaryFile(p: string): Promise<Uint8Array>;
        writeBinaryFile(p: string, d: Uint8Array): Promise<void>;
        /** Watch a directory for changes — returns unsubscribe (internally uses the filesystem:changed:<watcherId> channel) */
        watch(dirPath: string, onEvent: (e: FileChangeEvent) => void): Promise<() => void>;
        /** List entry names — shell preload only (the pool side should use listDir) */
        readdir?(p: string): Promise<string[]>;
    };
    /** Path utilities — injected on both shell/pool ends (in-pool plugins such as editor/file-tree consume normalize/join etc.); appDataDir is identical on both ends ( added on the pool side — settings plugins resolve userData paths in the pool) */
    path: {
        appDataDir?(): Promise<string>;
        normalize(p: string): string;
        join(...parts: string[]): string;
        basename(p: string): string;
        dirname(p: string): string;
        extname(p: string): string;
    };
    /** Environment info — modeled after VS Code ExtensionContext */
    env: {
        get(pluginId?: string): Promise<EnvInfo>;
    };
    /** file search — full-text search/replace (executed via IPC in the shell/main process) */
    search: {
        //  the wire contract's canonical home is src/core/types/ipc/search.ts — same origin on both ends with preload-pool buildSearch
        searchFiles(opts: SearchWireOptions): Promise<SearchWireResult>;
    };
    /** encoding detection/conversion (main-process EncodingService) */
    encoding: {
        detect(buffer: Uint8Array): Promise<string>;
        decode(buffer: Uint8Array, encoding: string): Promise<string>;
        encode(text: string, encoding: string): Promise<Uint8Array>;
        /** T1 binary guard: purely heuristic determination (the shell owns the decision — one source of truth; older shells lack this method ⇒ plugins must feature-detect and degrade) */
        isBinary(buffer: Uint8Array): Promise<boolean>;
    };
}
/** File decoration —  in-pool local registry. Shape modeled after the plugin API contract §3.24 */
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
/** File decoration / association / language definition / LSP / protocol / view container namespace surfaces — editor companion services (answered directly by the main process / in-pool) */
export interface EditorAPI {
    /** file decorations — a local in-pool registry (zero IPC). Shape modeled after contract §3.24 */
    decorations: {
        registerProvider(pluginId: string, provider: FileDecorationProvider): void;
        unregisterProvider(pluginId: string): void;
        getDecoration(uri: string): Promise<FileDecoration | null>;
        onDidChange(cb: (uris: string[]) => void): () => void;
    };
    /**
     * file associations — extension→plugin ID (answered directly by the main-process FileAssociationService).
     * T2 (wave 3): `getPluginFor` upgraded to full override-table-aware resolution (override → declaration → role, 01 §T2.2) —
     * the three entries (FoldersView/SearchView/intake) all consume it ⇒ F3 "one place of truth"; `listHandlersFor` =
     * the read-only selector surface; `setDefault` = the override table's only write port ("Set as default" / "Restore automatic",
     * bidirectional sync ); `setDefaultBulk` = the **bulk** form of the same port (2/aggregate write — writes N types at once,
     * aggregation logic on the manager side).
     */
    fileAssociation: {
        getPluginFor(ext: string): Promise<string | undefined>;
        /**
         * List all declarers of the extension plus the current-default marker (data source for the "Open with…" picker and the
         * settings page dropdown, 01 §T2.1); no declarers ⇒ [].
         * `title` = the **plugin** display name (manifest.name ?? pluginId); `displayName` = the **file type** display name
         * (the displayName in the declaration, e.g. .rs → "Rust") — the two differ semantically; naming surfaces use `title`.
         */
        listHandlersFor(ext: string): Promise<Array<{
            pluginId: string;
            title: string;
            displayName: string;
            isCurrent: boolean;
        }>>;
        /** The override table's only write port — `pluginId: null` = restore automatic (deletes the override key); config:changed is broadcast immediately after writing () */
        setDefault(ext: string, pluginId: string | null): Promise<void>;
        /** Same as above, **writes N types at once** (2/aggregation: `pluginId: null` = delete per type) — invalid/duplicate extensions are skipped within the write surface */
        setDefaultBulk(exts: string[], pluginId: string | null): Promise<void>;
    };
    /** langDef — language definition registry (answered directly by the main process). Returns only serializable fields (monarch tokenizer functions are stripped on the main-process side) */
    langDef: {
        get(extension: string): Promise<{
            id: string;
            lsp?: {
                command: string;
                args?: string[];
            };
        } | null>;
    };
    /** LSP bridge — autocompletion/F12/diagnostics/rename */
    lsp: {
        spawn(command: string, args: string[] | undefined, pluginId: string): Promise<string>;
        write(channelId: string, data: string): void;
        dispose(channelId: string): Promise<unknown>;
        onData(cb: (channelId: string, data: string) => void): () => void;
    };
    /** protocol — protocol registry (answered directly by the main process). parseLine/detect are stripped before returning (JS functions cannot cross processes) */
    protocol: {
        listProtocols(): Promise<Array<{
            id: string;
            name: string;
            pluginId: string;
            mode: string;
        }>>;
        getActiveProtocolId(): Promise<string>;
        setActiveProtocolId(protocolId: string): Promise<void>;
    };
    /** viewContainer — real IPC query/update (asks the shell-side registry). The DTO contains only serializable public fields */
    viewContainer: {
        getViewContainer(id: string): Promise<Record<string, unknown> | undefined>;
        getViews(containerId: string): Promise<Array<Record<string, unknown>>>;
        //  getView compound addressing — (pluginId, viewId) precise view metadata lookup (collision surface  of )
        getView(pluginId: string, viewId: string): Promise<Record<string, unknown> | undefined>;
        registerView(pluginId: string, containerId: string, descriptor: Record<string, unknown>): Promise<void>;
    };
}
/** (1.2-4): returned by plugins.resolveEntry() — sibling of resolvePath (discovery family, not the install handler).
 *  The pool/runtime assembles both dev /@fs and prod linkdesk:// URLs from { root, entry }. */
export interface PluginEntryInfo {
    /** Absolute path of the plugin directory (forward slashes); null = plugin does not exist */
    root: string | null;
    /** Entry file name — bundle → "index.bundle.js"; source → manifest.entry (default "src/index.tsx"); none = null */
    entry: string | null;
    /** Whether the directory contains index.bundle.js (bundle-format fact) */
    bundle: boolean;
}
/** Compatibility reading request () — input to plugins.getCompatibility: plugin identity + catalog-side facts (for uninstalled plugins the caller
 *  supplies them from the catalog entry; for installed plugins the on-disk manifest is the effective value and the main process overrides) */
export interface PluginCompatibilityRequest {
    pluginId: string;
    /** The minimum shell version the plugin requires (carried by the catalog entry; the only source for uninstalled plugins) */
    minAppVersion?: string | null;
    /** The plugin's last release date (catalog `publishedAt`, ISO) */
    publishedAt?: string | null;
}
/** Compatibility reading () — the state algorithm lives in one place, the shell's `src/core/compat/compatibility.ts`; this surface provides machine state only,
 *  ⛔ it carries no user-visible sentences (user-facing copy belongs to the marketplace plugin's i18n; the user-facing vocabulary lives in archive 00 §0d) */
export interface PluginCompatibilityReading {
    pluginId: string;
    /** Five states (fixed mapping to the five user-facing words; the mapping table lives in the compatibility.ts header comment) */
    state: "current" | "compatible" | "drifted" | "incompatible" | "unknown";
    /** Dangling reading; null = unavailable (not installed / catalog unreadable) — missing data ≠ a problem */
    dangling: {
        count: number;
        names: string[];
    } | null;
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
/**
 * core type definitions.
 * Plugin metadata, tab extension fields, view registry entries.
 *
 * Design basis: [[phase4-design-decisions]] + public/schemas/plugin.schema.json
 */
export type PluginType = "view" | "card" | "theme" | "language" | "protocol" | "resource" | "datasource";
export interface TabBehavior {
    /** Auto-create this tab when no tabs are on stage, and it cannot be closed. Only the welcome page declares it. */
    isFallback?: boolean;
    /** Globally only one instance allowed; creating it again → focus the existing one. E.g. the settings page. */
    singleton?: boolean;
    /** Show a confirm dialog before close; the value is the prompt text. E.g. the terminal. */
    confirmOnClose?: string;
    /** The Tauri invoke command called before close (after the confirmOnClose confirmation, before closeTab). E.g. the terminal declares "close_port". */
    invokeBeforeClose?: string;
    /** The unique field in CreateTabOptions used to determine tab identity. null = allow multiple instances without dedup (default).
     *  E.g. workspace declares "workspaceName" — only one tab per workspace name. */
    identityField?: string;
}
export interface StatusBarItem {
    id: string;
    icon?: string;
    label: string;
    align?: "left" | "right";
    onClick?: string;
    /** Declare true → the shell auto-registers a config item (<pluginId>.statusBar.<id>) + injects the visible prop.
     *  The plugin author writes one line of JSON and the user can toggle it in the Settings Editor. */
    configurable?: boolean;
}
export interface PluginManifest {
    $schema?: string;
    /**
     * Plugin identity — **immutable forever after publication** (Modeled after VS Code's `publisher.name`). The install directory
     * `{userData}/plugins/<pluginId>/`, the distribution artifact name `<pluginId>.linkdesk-plugin`, the marketplace catalog dedup key,
     * the uninstall tombstone key, and update reconciliation all key off it.
     *
     * From L7 () onward **explicit declaration is required**: when undeclared it falls back to the "project directory name" (`derivePluginId`), and since
     * the repo name and the local directory name are free-form, changing the directory name changes the identity — with five consequences (two coexisting copies in the install area / tombstones not matching /
     * two marketplace entries / the update chain silently broken / plugin data seemingly lost) and not one of them reports an error. The fallback path is kept only for backward compatibility
     * with existing third-party plugins outside the repo.
     * Shape constraint `^[A-Za-z0-9][A-Za-z0-9._-]*$` (`SAFE_PLUGIN_ID`, prevents path traversal straight into the filesystem).
     */
    pluginId?: string;
    /** @deprecated Use declarative fields such as contributes + tabBehavior instead — contribution points are detected from the manifest's actual declaration fields (Modeled after VS Code contributes) */
    type?: PluginType;
    core?: boolean;
    /** Plugin role — governs loading strategy only. view = has a UI component, data = pure data. Auto-derived when omitted */
    pluginRole?: "view" | "data";
    name: string;
    version: string;
    icon?: string;
    iconSource?: "codicon" | "svg" | "url" | "lucide";
    /** Marketplace display art (cover art, archive 14's dual-icon model ) — relative path of an svg asset, may be drawn elaborately and complex
     *  (semantically separate from icon's "monochrome small UI icon": the shell's icon bar/tab bar read only icon). Omitted → the marketplace falls back to icon.
     *  Convention: value = a relative path into package resources (e.g. "resources/cover.svg"); iconSource omitted → inferred as a linkdesk:// path. */
    marketIcon?: string;
    marketIconSource?: "codicon" | "svg" | "url" | "lucide";
    description?: string;
    author?: string;
    entry?: string;
    sidebar?: string;
    tabBehavior?: TabBehavior;
    /** System slot role — declares which system-level function this plugin fills. settings = the settings page, marketplace = the plugin marketplace.
     *  Multiple plugins with the same role legitimately coexist (one-to-many, all collected into the slot candidates); default = the stable order of first registration
     * ( core:true carries no behavioral privilege and does not grab the default); the user's switched active suite persists.
     * open string — third parties may declare new role names with zero shell changes (FactorySlots looks up by string). */
    factoryRole?: string;
    statusBar?: StatusBarItem[];
    /** @deprecated  — migrated to contributes.themes. Kept only for normalizeManifest backward compatibility. */
    file?: string;
    /** @deprecated  — migrated to contributes.themes. Kept only for normalizeManifest backward compatibility. */
    themes?: {
        id: string;
        name: string;
        file: string;
    }[];
    /** @deprecated  — migrated to contributes.languages. Kept only for normalizeManifest backward compatibility. */
    languages?: {
        code: string;
        name: string;
        file: string;
    }[];
    mode?: "text" | "binary";
    resources?: string[];
    recommends?: {
        plugin: string;
        reason: string;
    }[];
    suggests?: {
        plugin: string;
        reason: string;
    }[];
    /** Plugin-level activation-order dependencies () — declared by pluginId; the loader loads dependencies before this plugin.
     * Pure declaration: no version constraints (version semantics belong to the  marketplace domain; activation order does not carry them); missing dependency → the loader state machine parks it PENDING.
     *  A different domain from ConfigurationRegistry's config-item-level dependsOn (one config item within the same manifest depending on another). */
    requires?: string[];
    screenshots?: string[];
    minAppVersion?: string;
    /** @deprecated  — merged into requires (plugin-level activation dependencies are uniformly declared by requires).
     * Zero plugins use it; the loader reads it for compatibility until the  migration lands. */
    extensionDependencies?: string[];
    docs?: string;
    cardDocMap?: Record<string, string>;
    /** @deprecated  — use contributes.i18n instead. Per-plugin `i18n/{lang}.json`, key = original Chinese text. See [[i18n-round2-leftovers]] */
    i18n?: Record<string, string>;
    cssVars?: Record<string, {
        dark: string;
        light: string;
    }>;
    permissions?: ("serial" | "filesystem" | "network")[];
    /**
     * g: view metadata — declares how the view interacts with the shell.
     * These fields replace the hardcoded special cases of Phase 3/4 (isSidebarOnlyView / BOTTOM_ICONS etc.).
     */
    /** Where the plugin UI appears — declarative. Replaces iconLocation + viewRole + keepSidebarOnFocus.
     *  Modeled after VS Code: viewsContainers + views combine to derive Activity Bar / Sidebar / Panel */
    appearsIn?: {
        iconBar?: "top" | "bottom";
        sidePanel?: boolean;
        tabBar?: boolean;
        /** W2 admission (decided 2026-10-02: allowlist-based, default false) — declared true to enter the welcome page's "Start" card and the [+] create menu.
         *  ⚠️ Governs only the **display** in those two menus: not declaring ⇏ cannot open (command/recents/session restore/floating panel open-in still open it;
         *  those consumers ask about **capability** — getTabOpenableViews). The value domain matches plugin.schema.json's appearsIn.standaloneOpenable verbatim. */
        standaloneOpenable?: boolean;
        /** Custom-drawn (code) status bar component file path (relative to the plugin root, .tsx) — a combined existence + file declaration (Modeled after the view's render).
         *  A value = the plugin's custom status bar component replaces its static statusBar contribution; at registration the loader's resolveRuntimePluginRoot
         *  normalizes it → ViewPluginEntry.statusBarRenderPath (dev /@fs source / prod linkdesk:// dist; after SDK packaging
         * this field is rewritten to the statusBar.bundle.js compiled surface), and the shell emits a component marker → the pool dynamic-imports it directly ().
         *  Omitted = no custom component (static contribution items proceed as usual). */
        statusBar?: string;
    };
    /** @deprecated  — replaced by appearsIn.iconBar. Kept only as a backward-compatibility fallback in viewRegistry.ts. */
    iconLocation?: "top" | "bottom";
    /** @deprecated  — replaced by appearsIn.tabBar / appearsIn.sidePanel. */
    viewRole?: "sidebarPrimary" | "tabOnly";
    /** @deprecated After  the shellRendered concept no longer exists — shell-level views are written directly into App.tsx and not declared via plugin.json. Kept only for backward compatibility. */
    shellRendered?: boolean;
    /** @deprecated  — no longer needed after appearsIn normalization. */
    keepSidebarOnFocus?: boolean;
    /**
     * Modeled after VS Code package.json contributes.
     * Uses Record<string, unknown> to tolerate unknown keys — parseContributions detects each key individually.
     * Types for known keys are in ContributesViewsContainers / ContributesViews below.
     */
    contributes?: Record<string, unknown>;
}
/** Discovery entry — returned by plugins.listAll() ( the main process scans all subdirectories of plugins/ directly, replacing the renderer's import.meta.glob).
 *  Plugins installed via bundling/marketplace are not in the source tree — glob cannot discover them; listAll treats the disk as the single source of truth, same surface for dev/prod.
 *  The full manifest is plain JSON data (IPC-serializable); statusBar/contributes etc. travel with the manifest
 * ( the statusBar entry is derived by the consumer from manifest.statusBar, no separate channel needed). */
export interface PluginDiscoveryEntry {
    pluginId: string;
    /** manifest.entry — the plugin's JS entry (absent = pure-contribution plugin, manifest only, no components) */
    entry?: string;
    /** Full plugin.json */
    manifest: PluginManifest;
    /** (1.2-4): the directory contains index.bundle.js = an unpacked SDK-packaged .linkdesk-plugin artifact.
     *  A disk-format fact (not plugin identity — hard constraint 11); a bundle plugin's JS entry is always index.bundle.js (basis for the runtime branch). */
    bundle?: boolean;
    /** (1.2-4): disk-location fact — home = code root (app = read-only app plugin root / userData = {userData}/plugins, the user-installed home).
     *  subdir = always null after the 2026-09-05 flattening to a single root (the flat tree's root-direct scan produces no subdirectories; the type keeps null for downstream null-safety). */
    origin?: {
        home: "app" | "userData";
        subdir: string | null;
    };
}
/** job identity for install progress — travels with the shell-side `installPlugin` call into the main process's fs/net segment (download/extract);
 *  the main-process segment uses it to write `plugin:installProgress` events back to the **specific job/plugin** (the "event-side backfill" of archive 18 §V I.6-3).
 *  Previously the download/extract events carried **no identity at all**; with parallel installs the percentages poured into the same row; at N=1 correctness was accidental via "assign to the active session".
 *  `jobId` is a product of the shell-side job table (single producer, see install-queue.ts) — the main process only forwards it; it neither generates nor persists it. */
export interface PluginInstallJobRef {
    jobId: string;
    /** Carried along when the pool-side request already has an id — the download segment uses it to attribute progress to the specific plugin (a package stream that only yields an id after extraction carries only jobId) */
    pluginId?: string;
}
/** (segment B): returned by pluginManager.checkUpdates — the main process fetches the catalog + compares semver (the shell passes current; the shell is the ledger/disk owner) */
export interface PluginUpdateCheckResult {
    current: string;
    latestVersion: string;
    downloadUrl?: string;
    update: boolean;
}
/** Manifest serialization subset of list() — aligned with the projection fields of handlePluginsCall "list"
 * the declared dependency id list (manifest.requires passed through) — the data source for the marketplace's missing-dependency check and the depends-on/depended-on rows
 *  (the dependencies.ts engine runs only inside the shell; consumption goes through the list() projection). No requires = undefined.
 * (archive batch 1 of 14): + icon/iconSource — the data channel for marketplace row/detail icons (the previously self-acknowledged "7-field alignment" trade-off
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
    //  (data channel of archive batch 1 of 14): icon/iconSource pass-through — the marketplace gets the plugin icon
    // (the sole manifest data source for row/detail PluginIcon rendering; no icon = undefined → the consumer's default art as fallback).
    // Isomorphic with  the list() subset keeps picking only UI-consumed fields, never shipping the whole manifest over IPC.
    icon?: PluginManifest["icon"];
    iconSource?: PluginManifest["iconSource"];
    //  (archive batch 2 of 14, item 5): marketIcon/marketIconSource pass-through — the data channel for the marketplace's display art (cover art).
    // The marketplace consumes "marketIcon ?? icon", picked at the marketplace layer (the shell UI reads only icon, hence list passes through both pairs);
    // no marketIcon = undefined → the marketplace falls back to icon, and if still empty → the default cover.
    marketIcon?: PluginManifest["marketIcon"];
    marketIconSource?: PluginManifest["marketIconSource"];
}
/** Plugin list entry — returned by pluginManager.list() (manifest subset serialized by the main process).
 * Partial<PluginManifest> was too wide (component and other fields unreachable over IPC) — narrowed to the
 *  7 fields actually serialized by the IpcBridgeHandler.handlePluginsCall "list" branch, consumed by the marketplace.
 * pendingReason — the reason a plugin is parked for missing dependencies ("waiting for dependency: xxx"); undefined = not parked.
 *  A value = the plugin is installed but its dependencies are not ready (PENDING); list/detail show a waiting state. */
export interface PluginListEntry {
    pluginId: string;
    manifest: PluginListSubset;
    /** Parked reason for missing dependencies — the marketplace shows a PENDING badge + a detail hint bar () */
    pendingReason?: string;
    /** (G6): where this plugin **lives** — `true` = in the user-installed home (`{userData}/plugins`), replaceable by a downloaded package.
     *  `false` = the read-only app root (bundled ship-with-package plugins / plugins installed from a directory source) — the update flow necessarily throws "not in the user install area" for it,
     *  and the marketplace **must not** render "update to vX" (a dead button that fails on click; including the 8 official bundled plugins).
     *  The single source of the criterion = `isPluginUpdatable` (a disk-residence fact, not plugin identity — hard constraint 11). */
    updatable?: boolean;
}
/** install request-side identity — the job table dedupes by pluginId and job rows need display names, but only the pool side knows both
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
     * dependency resolution catalog — when passed, **missing** dependencies in this plugin's `requires` are
     * auto-installed first by the shell **within the same install job** (inline recursion, no second slot — dependency resolution reuses updateCheck against this catalog for the latest direct link).
     * Omit = behavior identical to today (parked on missing dependency). Resolution radius = this catalog (the shell has no built-in catalog URL).
     * Design decision: see the repo-internal design dossier on dependency-chain auto-install for the plugin marketplace (Chinese docs tree, ledger anchor preserved above).
     */
    catalogUrl?: string;
}
/** install result — on success:false, error is the failure reason (in Chinese; validation / version conflict / copy failure).
 *  Install progress events: events.on("plugin:installProgress", ({ stage, pluginId, message }) => ...)
 *  stage: validating | copying | loading | done | error
 * load/unload broadcast (shell loader → the single Pool):
 *  events.on("plugin:installed", ({ pluginId, version, reason }) => ...) reason: install | reinstall
 *  events.on("plugin:uninstalled", ({ pluginId, reason }) => ...) reason: uninstall */
export interface PluginInstallResult {
    success: boolean;
    pluginId?: string;
    version?: string;
    needRestart?: boolean;
    error?: string;
    /** (archive 18 §V I.6-7): the third terminal state — **installed but missing dependencies** (it is installed, shows in the list, but is unusable).
     *  When true, success is also true (the files really did land on disk), but consumers **must not render it as "✓ installed"** — that would be lying.
     *  The job row shows "installed but missing dependencies: {name}". */
    parked?: boolean;
    /** the user clicked "Cancel install" on the panel — **not a failure** (`success` being false just means "the install did not happen").
     *  Consumers **must not** take the failure branch off this (no error toast, no [Retry] push, no red row) — the user actively stopped it, intent already expressed;
     *  reporting the error again would weaponize the user's own decision against them. The job row is **removed entirely** by the queue side (no ✗ rendered). */
    cancelled?: boolean;
}
/** Disabled/uninstalled list entry — the serialized shape of loader getDisabledPluginInfo/getUninstalledPluginInfo (a further subset of PluginListSubset)
 * the core flag passes through — list() EXCLUDES disabled plugins; the disabled-state detail page's uninstall button honors  "no uninstall button on the detail page for core:true"
 *  and core can only be obtained here (read from the cached manifest; a purely additive optional field, zero regression).
 * + four icon fields (icon/iconSource/marketIcon/marketIconSource) — the **same precedent as  adding an icon channel to list()**.
 *  Disabled rows previously had to fall back to the catalog entry for art, but the catalog entry's icon had changed to an absolute URL (the not-installed shape) ⇒ a disabled row
 *  (even though the plugin is still on disk) would silently start pulling remote art, breaking offline. After the channel was added the resolution order is unified with the other positions: installed first → catalog → default block.
 *  The not-installed list (getUninstalledPluginInfo) is **not** extended: the plugin is no longer on disk, there is no local art to read, and the catalog entry is already the sole source. */
export interface PluginInfoEntry {
    pluginId: string;
    name: string;
    description?: string;
    version?: string;
    core?: boolean;
    /** (G6): the same residence criterion as `PluginListEntry.updatable` — being disabled **does not change residence** (disable only records a list entry,
     *  the catalog stays in place) ⇒ a disabled plugin in the userData home can still be updated, one in the app tree cannot. */
    updatable?: boolean;
    /** small UI icon (Type-1 silhouette for icon-bar plugins / Type-2 identity art for the rest) */
    icon?: string;
    iconSource?: "codicon" | "svg" | "url" | "lucide";
    /** plugin identity color art (Type-2) — first candidate for row/detail display positions */
    marketIcon?: string;
    marketIconSource?: "codicon" | "svg" | "url" | "lucide";
}
/** (segment B): update result — the update extension of PluginInstallResult.
 *  upToDate = the catalog answered directly that it is already the latest (success:true but not "an update happened" — the UI shows "already up to date", not a red error);
 *  currentVersion travels along for toast/log display of vOld→vNew. needRestart is always true (the bundle module cache needs a restart to activate). */
export interface PluginUpdateResult extends PluginInstallResult {
    /** On-disk version before the update */
    currentVersion?: string;
    /** Already the latest after checking the catalog (no replacement happened this time) */
    upToDate?: boolean;
}
/** Plugin discovery/management namespace surfaces — bridges IpcBridgeHandler → loader functions */
export interface PluginsAPI {
    /** Plugin discovery — injected on both ends: resolvePath exists identically on both; the read surface (listDirs/listAll/readAllManifests/listDisabledDirs/readManifest) is shell preload only (the loader runs only in the shell) */
    plugins: {
        resolvePath(id: string): Promise<string>;
        /** (1.2-4): sibling of resolvePath (discovery family) — returns { root, entry, bundle } (the bundle entry is always index.bundle.js).
         *  Optional — keeps the state.ts guard and both preload surfaces (shell/pool) compiling; callers check for existence before calling. */
        resolveEntry?(id: string): Promise<PluginEntryInfo>;
        /** compatibility reading (read-only) — "does this plugin match the current version" is computed at a single point by the shell
         *  (state algorithm `src/core/compat/compatibility.ts`; the mapping table between the five user-facing words and the readings lives in that file's header comment).
         *  Optional — same precedent as resolveEntry (keeps the mock and the existing implementation surface compiling; callers check for existence first). */
        getCompatibility?(req: PluginCompatibilityRequest): Promise<PluginCompatibilityReading>;
        listDirs?(): Promise<string[]>;
        /** full discovery — [{ pluginId, entry, manifest }] (replaces import.meta.glob; packaged plugins live outside the source tree, so reading disk in the main process is the only source of truth) */
        listAll?(): Promise<PluginDiscoveryEntry[]>;
        listDisabledDirs?(): Promise<string[]>;
        /** Returns the raw plugin.json JSON text — consumers JSON.parse it themselves */
        readManifest?(id: string): Promise<string>;
        /** all manifests — Record<pluginId, PluginManifest> (the IPC replacement for the pluginManifests eager glob) */
        readAllManifests?(): Promise<Record<string, PluginManifest>>;
        /** (1.2-5): the main-process real download stage — fetches the .linkdesk-plugin package → {userData}/tmp/<original package name> (shell preload only; called by the loader's install flow packageOps).
         * may carry a job identity — progress events from the main-process stage backfill jobId/pluginId accordingly (absent = events carry no identity; with N=1 attributed to the active session) */
        packageDownload?(url: string, job?: PluginInstallJobRef): Promise<{
            zipPath: string;
            sizeBytes?: number;
        }>;
        /** (1.2-5): the main-process real extract stage — shared bundle-zip semantics → {userData}/plugins/<id>/ (2026-09-05 flattened single root; shell preload only; rejects if the target already exists).
         * job same as packageDownload — extract-stage progress events backfill the identity */
        packageExtract?(zipPath: string, expectedPluginId?: string, job?: PluginInstallJobRef): Promise<{
            pluginId: string;
            version: string;
            targetDir: string;
        }>;
        /** abort an in-flight download by jobId — the single landing point for the panel's "Cancel install".
         *  An AbortSignal cannot cross IPC (structured clone rejects it), so only this **targeted message** can be sent; the main process only keeps
         *  a jobId → AbortController registry and does not interpret semantics. Returns false = that job currently has no in-flight download
         *  (already finished / not started / not in the download stage) — callers should read this as "cancel accepted, wait for the terminal state", not as a failure. */
        packageCancel?(jobId: string): Promise<boolean>;
        /** (stage B): the main-process real network stage — fetches marketplace.json → version comparison (does not touch the ledger — current is passed in by the shell). Prereleases are ignored by default. */
        packageUpdateCheck?(pluginId: string, catalogUrl: string, currentVersion?: string): Promise<PluginUpdateCheckResult>;
        /** b/c (stage B): the main-process real download+extract stage — downloads to tmp → extracts to {userData}/tmp/.stage-<id> (id consistency + version direction validation; the old directory is untouched).
         * (anchor ①): allowOlder explicitly true admits a downgrade where "package version < current" (version dropdown picks an older version + passed after F2 confirm); the default still rejects <=; the same version is always rejected.
         * (G1): job same as packageDownload — update download-stage progress is attributed by jobId, and can be truly aborted by jobId. */
        packageStageUpdate?(pluginId: string, source: string, currentVersion?: string, allowOlder?: boolean, job?: PluginInstallJobRef): Promise<{
            pluginId: string;
            newVersion: string;
            stagedDir: string;
        }>;
        /** (stage B): the main-process atomic replacement stage — same-volume rename: target→.bak→staged→target→rm .bak (restores the old version on failure).
         *  0.2.48: `deferred: true` = the old directory is occupied (dev-track Vite handles being the main scenario; disk untouched, staging kept as-is) —
         *  the caller shows "will be replaced automatically after restart", and `commitPendingStagedUpdates` commits it on startup; version = the staged new version number. */
        packageCommitUpdate?(pluginId: string, stagedDir: string): Promise<{
            pluginId: string;
            version: string;
            deferred?: boolean;
        }>;
    };
    /** Plugin management — bridges IpcBridgeHandler → loader functions. Pool-authoritative (consumed by marketplace plugins), required */
    pluginManager: {
        list(): Promise<PluginListEntry[]>;
        enable(id: string): Promise<unknown>;
        disable(id: string): Promise<unknown>;
        uninstall(id: string): Promise<unknown>;
        /** opts carries the requester-side identity (pluginId/displayName/origin) — job table dedup + job row display name */
        install(path: string, opts?: PluginInstallRequestOpts): Promise<PluginInstallResult>;
        /** (1.2-5): the explicit name for the url/.linkdesk-plugin package install flow (installPlugin routing alias; identical on both the shell and pool preloads — the pool proxies via plugins:call). Progress goes through the plugin:installProgress channel */
        installWithProgress?(path: string, opts?: PluginInstallRequestOpts): Promise<PluginInstallResult>;
        reinstall(id: string): Promise<unknown>;
        getDisabled(): Promise<PluginInfoEntry[]>;
        getUninstalled(): Promise<PluginInfoEntry[]>;
        isDisabled(id: string): Promise<boolean>;
        /** (stage B): safe update (atomic + unload mechanical path) — opts: { catalogUrl? (check picks the latest) | url? (update package given directly) }.
         * (anchor ①): allowOlder explicitly true admits a downgrade (version dropdown picks an older version + passed after F2 confirm); the default rejects <=. */
        update?(pluginId: string, opts?: {
            catalogUrl?: string;
            url?: string;
            allowOlder?: boolean;
        }): Promise<PluginUpdateResult>;
        /** (stage B): read-only update check — returns downloadUrl when a new version exists (data source for the UI badge; the update action goes through update) */
        checkUpdates?(pluginId: string, catalogUrl: string): Promise<PluginUpdateCheckResult>;
        /** install/uninstall/reinstall success → notify the main process to fully rescan the three tables */
        notifyManifestChanged?(): void;
    };
}
/**
 * Bridge request envelope contract—
 *
 * The envelope for plugin IPC requests forwarded by the main process to shell-side services (IpcBridgeHandler):
 * requestId is used to correlate with respond; args are the command's own parameters (narrowed by a shell-side switch).
 * Shared by preload-shell's IpcRelay buffering and IpcBridgeHandler onRequest.
 */
export interface BridgeRequestPayload {
    requestId: string;
    channel: string;
    args: unknown[];
    /**
     * source-window stamp on the envelope—the main process reverse-looks-up the windowId by sender (the pool does not know its own windowId, the  iron rule),
     * so every pool→shell request carries its source-window identity. The shell routes per-window operations by it (the sourceId family: tab modify/close/focus land in the source window's registry,
     * the main window stays as before)—the same-root normalization for the lost-window-identity class (black dot/panel/dialog). The shell-side switch consumes it as needed when narrowing; ignored if no consumer.
     */
    sourceWindowId?: string;
}
/**
 * Pool→shell sidebar action wire contract—
 *
 * Originally defined in PoolSectionStack.tsx (an internal pool component type), but travels over IPC pool.sidebarAction to the shell
 * (preload-shell → usePoolSync → ViewContainerService)—a cross-stack protocol, consolidated into this directory.
 */
export interface SidebarAction {
    action: "reorder" | "setCollapsed" | "setVisible" | "toggleSidebarCollapse" | "setSidebarWidth";
    containerId?: string;
    viewId?: string;
    /** setCollapsed composite-key persistence—the pool-side view carries its own pluginId (SidebarViewMeta), so the shell addresses the same-named view precisely */
    pluginId?: string;
    newIndex?: number;
    collapsed?: boolean;
    visible?: boolean;
    /** divider drag commit—resizeZone("sidebar", width). Added in  (the original contract missed this variant) */
    width?: number;
}
/** Split direction—pool-side onDropSplit has already normalized it from the drop zone (MainZone:382) */
export type TabSplitDirection = "horizontal" | "vertical";
/**
 * Tab drag-to-split—types + drop-zone detection algorithm.
 * Design basis: the V3-tab-split design doc §9 (repo-internal, Chinese-named)
 */
export type DropZone = "left" | "right" | "up" | "down" | "center" | null;
/** Pool→shell tab actions—the union literal is the wire enum */
export type PoolTabAction = {
    action: "focusTab";
    tabId: string;
}
//  (P5): clicking a panel's blank area focuses that panel—changes activeGroupId only, not activeTabId
// (activeTabId is already that group's active tab; focus = which panel the user is looking at; command routing/focus ring depend on it)
 | {
    action: "focusGroup";
    groupId: string;
} | {
    action: "closeTab";
    tabId: string;
}
// closeOtherTabs/closeTabsToRight/closeAllTabs/duplicateTab have zero in-tree senders—
// but tabAction is a plugin-visible API (third-party plugins can send it), so the shell switch keeps them as a contract surface
 | {
    action: "closeOtherTabs";
    groupId: string;
    tabId: string;
} | {
    action: "closeTabsToRight";
    groupId: string;
    tabId: string;
} | {
    action: "closeAllTabs";
    groupId: string;
} | {
    action: "reorderTab";
    groupId: string;
    tabId: string;
    newIndex: number;
    oldIndex: number;
}
//  newIndex = the insert gap within the target group (cross-group drag landing = the gap at the vertical bar; omitted appends to the end)
 | {
    action: "moveTab";
    tabId: string;
    targetGroupId: string;
    newIndex?: number;
} | {
    action: "splitTab";
    tabId: string;
    direction: TabSplitDirection;
    zone?: DropZone;
    targetGroupId?: string;
} | {
    action: "duplicateTab";
    tabId: string;
} | {
    action: "pinTab";
    tabId: string;
} | {
    action: "createTab";
    pluginId?: string;
    workspaceName?: string;
} | {
    action: "updateSplitSizes";
    anchorGroupId: string;
    sizes: [
        number,
        number
    ];
    branchIndex?: number;
}
//  tab released after being dragged out of the window—screenX/Y = release point screen coordinates (shell-side hit testing: TabBar→merge into window / blank→new window)
 | {
    action: "releaseOutsideWindow";
    tabId: string;
    screenX: number;
    screenY: number;
};
/**
 * Same as  ①: tab actions received by the shell—the main process resolves and injects sourceWindowId by sender (authoritative window identity).
 * The pool never knows its own windowId; the shell reads sourceWindowId to determine the source window (detach source / no merge within the same window).
 */
export type ShellTabAction = PoolTabAction & {
    sourceWindowId: string;
};
/** TabBar viewport rect—reported by the pool side via getBoundingClientRect (data source for dock/release merge-window hit testing).
 *  Coordinates are viewport-relative (0,0 = top-left of the window content area); the shell holds the authoritative window bounds and converts to screen (bounds.x + rect.left).
 *  groupId is carried—after a hit, mergeTabToWindow goes straight to the target group. */
export interface TabBarViewportRect {
    groupId: string;
    left: number;
    top: number;
    width: number;
    height: number;
}
/** Pool→shell: TabBar rects report payload—the main process resolves windowId by sender and attaches it () */
export interface TabBarRectsPayload {
    windowId: string;
    rects: TabBarViewportRect[];
}
/** drag position report payload—reported by the pool's drag-out gesture (mousemove for the whole duration after pickup); the shell excludes the source window and converts to screen coordinates for dock hit testing.
 *  Coordinates are screen coordinates (e.screenX/screenY—window bounds are screen coordinates too, so hit testing works directly). canceled = Esc cancel (keydown carries no coordinates). */
export interface TabDragPositionPayload {
    tabId: string;
    screenX: number;
    screenY: number;
    /** Esc canceled the drag—the shell clears the dock hint (keydown carries no coordinates, only sets the flag; screenX/screenY are filled with 0) */
    canceled?: boolean;
    /** title of the dragged tab—reported by the pool so the main process can render text in the ghost window (the main process holds no tabState; the title comes from the pool). Ignored by the shell/dock */
    title?: string;
    /** whether the cursor is outside the source window (screen coordinates compared against winScreenX+viewport size, same source as the onMouseUp outside-window check)—
     *  outside → the main process shows the OS ghost (a DOM floating block outside the window would be clipped); inside → the OS ghost hides (the DOM floating block stays visible). Ignored by the shell/dock */
    outside?: boolean;
    /** evolution: drag ghost appearance—theme three colors (the source pool reads --bg-card/--border/--text-primary via getComputedStyle,
     * all plain hex values) + the dragged tab's icon ( the pool narrows the tab.icon discriminated union into a form the ghost window can render—emoji text or an img
     *  URL; codicon/lucide have no glyph font injected → null, iconKind distinguishes the rendering).
     *  Consumed by the main process only when outside=true (outside the window); ignored by the shell/dock. Optional—old pools may omit it (no cap).
     *  iconKind determination is the same as the DragOverlays floating block (emoji: direct text render; img: image URL). */
    ghost?: {
        theme: {
            bg: string;
            border: string;
            text: string;
        };
        icon: string | null;
        iconKind: "emoji" | "img" | null;
    };
}
/** Pool→shell: drag position report payload—the main process resolves sourceWindowId by sender and attaches it (source-window exclusion—the pool never knows its own windowId) */
export type ShellTabDragPosition = TabDragPositionPayload & {
    sourceWindowId: string;
};
/** Shell→pool: dock hint payload—the target window's TabBar insert indicator (groupId hit) / clear (groupId null = no dock target, clear everything).
 * on a groupId hit, viewportX/Y are carried—the cursor position in the target window's viewport coordinates (the shell converts from screen coordinates minus the window bounds origin),
 *  and the target pool uses it to compute the insert gap (the vertical-line landing spot, reusing computeTabInsertIndex). */
export interface AdsorbHintPayload {
    groupId: string | null;
    viewportX?: number;
    viewportY?: number;
}
/** Pool→shell: dock insert gap callback—whenever the target pool computes a new gap (the vertical-line landing spot) it reports it; the shell stores it in the dock registry for precise placement on release-and-merge.
 * windowId is injected by the main process based on the sender (the pool never knows its own windowId, settled in ). */
export interface AdsorbIndexPayload {
    windowId: string;
    groupId: string;
    /** Insert gap 0..tabs.length (the vertical-line landing spot)—on release, the merge lands exactly in the gap the line points at (the hint never lies) */
    insertIndex: number;
}
/** QuickPick action—select/highlight/close/itemAction report back by key */
export interface PoolQuickPickAction {
    type: string;
    key?: string;
    actionId?: string;
}
/** Dialog action—confirm/cancel reported back; the shell settles the Promise */
export interface PoolDialogAction {
    type: string;
}
/** Floating panel action—action reported back by actionId (open-in/close); the shell settles the Promise (type B) */
export interface PoolFloatingPanelAction {
    type: string;
    actionId?: string;
}
/** Memory pressure notification—the main process's window-manager sampled above threshold () */
export interface MemoryPressureData {
    totalRSS: number;
    threshold: number;
}
/** Shell→main: create pool window request—windowId generated by the shell (tabState ownership), bounds optional (A4 multi-window foundation) */
export interface CreatePoolWindowRequest {
    windowId: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
}
/** pool window position/size change rect—reported by main-process moved/resized events (the shell updates the registry by windowId + persists it, A6).
 *  Not an independent contract entry (the contract generator's walkRefs force-exports anything referenced into linkdesk.d.ts)—the source does not export it, so knip does not flag dead code. */
export interface WindowBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}
/** Main→shell: pool window bounds change notification (user moves/resizes the window)—the shell persists the floating window position (I9-14 position/size record) */
export interface PoolWindowBoundsPayload {
    windowId: string;
    bounds: WindowBounds;
}
/** plugin disk locations — the data source for the marketplace detail page's "open install location / data location" rows.
 *  Resolved in the main process (the pool holds **zero** knowledge of install paths — the renderer gets only results, never assembles paths). */
export interface PluginDiskLocation {
    /** Absolute path of the plugin directory (forward slashes — same convention as `plugins.resolvePath`; consumers use it as a link tooltip and do not splice it themselves) */
    installDir: string;
    /** Plugin data directory — **non-empty only when the plugin actually has data** (directory missing or empty → null).
     *  Same criterion as the VS Code detail page's "cache" row (after `computeSize`, `if (!cacheSize) return` — the whole row is hidden when empty):
     *  a pure-UI plugin is always null; **not everyone has one**, so no empty row is invented. */
    dataDir: string | null;
}
/** the two targets of `shell.openPluginFolder` — install directory / data directory */
export type PluginFolderKind = "install" | "data";
/** Shell↔plugin relay / pool control / window / shell-level commands / hot-exit staging namespace surfaces — injected on both ends (bridge is true-shell-only / hotExit is pool-side-only) */
export interface ShellAPI {
    /** Shell↔plugin communication relay — shell preload only */
    bridge?: {
        onRequest(cb: (req: BridgeRequestPayload) => void): () => void;
        respond(requestId: string, result?: unknown, error?: string): void;
        broadcast(channel: string, payload: unknown): void;
        notifyConfigChanged(key: string, value: unknown): void;
    };
    /** Pool control — shell preload: pushes layout + registers pool→shell action callbacks; pool preload: receives layout + sends actions. Each end implements its own half (method-level subset surface, surfaces.ts) */
    pool: {
        // ── Shell side (absent from the pool preload) ──
        /** optional targeted push by windowId (defaults to 'main') — the shell traverses its window registry to push each window's layout by id */
        pushLayout(layout: PoolLayout, windowId?: string): void;
        /** A3: the callback receives windowId (main pool='main', detached pool=shell-generated id) — the shell pushes that window's layout targeted by id */
        onReady(cb: (windowId: string) => void): () => void;
        toggleDevTools(): void;
        onSidebarAction(cb: (action: SidebarAction) => void): () => void;
        //  the shell side receives action = ShellTabAction (the main process injects sourceWindowId by sender —  authoritative window identity)
        onTabAction(cb: (action: ShellTabAction) => void): () => void;
        //  pool→shell TabBar viewport rects report (data source for dock/detach-merge hit testing) — windowId injected by the main process
        onTabBarRects(cb: (payload: TabBarRectsPayload) => void): () => void;
        //  pool→shell drag position report (mousemove throughout while picked up) — sourceWindowId injected by the main process (the shell excludes the source window from hit testing)
        onDragPosition(cb: (pos: ShellTabDragPosition) => void): () => void;
        //  shell→pool dock hint (target window TabBar insert indicator/clear) — windowId pushed targeted after the shell resolves the hit (payload carries viewport coordinates)
        pushAdsorbHint(hint: AdsorbHintPayload, windowId: string): void;
        //  pool→shell dock insertion gap report (shell side — windowId injected by the main process; the shell keeps a docking registry for precise placement on detach-merge)
        onAdsorbIndex(cb: (payload: AdsorbIndexPayload) => void): () => void;
        pushQuickPick(data: unknown): void;
        onQuickPickAction(cb: (action: PoolQuickPickAction) => void): () => void;
        pushDialog(data: unknown): void;
        onDialogAction(cb: (action: PoolDialogAction) => void): () => void;
        //  (type B): in-shell floating panel — pushPanel dumb render data + action callbacks back
        pushFloatingPanel(data: unknown): void;
        onFloatingPanelAction(cb: (action: PoolFloatingPanelAction) => void): () => void;
        onMemoryPressure(cb: (data: MemoryPressureData) => void): () => void;
        // ──  (A4): multi-window foundation — shell-driven create/close of pool windows + listening for OS window close (the main process owns the window lifecycle) ──
        createWindow(opts: CreatePoolWindowRequest): void;
        closeWindow(windowId: string): void;
        onWindowClosed(cb: (windowId: string) => void): () => void;
        // ──  main→shell pool window bounds changes (moved/resized reports) — shell registry update + persisting floating window positions (I9-14) ──
        onWindowBoundsChanged(cb: (payload: PoolWindowBoundsPayload) => void): () => void;
        // ── Pool side (absent from the shell preload) ──
        /**
         * **read the current layout on demand** — the full layout snapshot most recently received
         * by this window (tree `root` + groups `groups`).
         *
         * 🔴 The **same yardstick** as `onLayout`: what is returned is the very body of the most recent `onLayout` payload.
         * The pool renders whole-value snapshot frames and **does not cache old values for merging** (the two iron rules in the
         * `poolLayout.ts` header) — this method only leaves a read port for "not waiting for the next frame" and **does not participate in rendering**.
         *
         * ⚠️ No push has been received yet (pool just started, shell has not pushed / window not ready) → `null` (**no empty layout is fabricated**).
         * ⚠️ **A detached window receives a policy subset** (`WINDOW_MODE_STRATEGIES`: detached = `titleBar`+`groups`;
         * drift = `titleBar`+`panel`) ⇒ in those windows `statusBar`/`sidebar`/`iconBar` **do not exist** —
         * this is a normal consequence of the window mode, not data loss. Use `tabs.list()` (ask the shell) to see the full picture across windows.
         * ⚠️ Split-tree depth cap `MAX_TREE_DEPTH = 4` (`src/core/utils/splitTree.ts`) — deeper levels never appear in the tree;
         * readers need not guard for infinite depth, but **do not assume 4 levels is always reachable** (users may not split that deep).
         */
        getLayout(): PoolLayout | null;
        onLayout(cb: (layout: PoolLayout) => void): () => void;
        ready(): void;
        sidebarAction(action: SidebarAction): void;
        tabAction(action: PoolTabAction): void;
        //  pool→shell TabBar viewport rects report (pool side — MainZone useTabDrag reports getBoundingClientRect)
        tabBarRects(rects: TabBarViewportRect[]): void;
        //  pool→shell drag position report (pool side — useDragReorder reports mousemove after pickup, shell does dock hit testing)
        dragPosition(pos: TabDragPositionPayload): void;
        //  shell→pool dock hint subscription (pool side — MainZone subscribes for the target window's TabBar insert indicator/clear)
        onAdsorbHint(cb: (hint: AdsorbHintPayload) => void): () => void;
        //  pool→shell dock insertion gap report (pool side — the target pool computes the vertical-line drop point and reports; the shell places precisely on detach-merge)
        adsorbIndex(payload: {
            groupId: string;
            insertIndex: number;
        }): void;
        // ──  (P8): generic "cancelable beforeClose" channel (pool side) ──
        // Plugins register a handler (their own logic: show a confirmation / clean up resources / return a boolean deciding whether closing the tab is allowed);
        // the GroupTabBar close path `await beforeClose` — if the handler returns false (or Promise<false>), the close is canceled.
        registerBeforeClose(pluginId: string, handler: (tab: PoolTab) => boolean | Promise<boolean>): void;
        unregisterBeforeClose(pluginId: string): void;
        beforeClose(pluginId: string, tab: PoolTab): Promise<boolean>;
    };
    /** Window control — TitleBar button mapping, injected on both ends (11 methods on one channel, shared module electron/window-namespace.ts) */
    window: {
        minimize(): void;
        maximize(): void;
        unmaximize(): void;
        close(): void;
        /** zoom factor → main process setZoomFactor (pool WCV) */
        setZoom(factor: number): void;
        toggleDevTools(): Promise<void>;
        isMaximized(): Promise<boolean>;
        onMaximizeChange(cb: (maximized: boolean) => void): () => void;
        /** OS-level always-on-top (covers other apps) — true pins / false unpins; routed to the host window by sender */
        setAlwaysOnTop(pinned: boolean): void;
        isAlwaysOnTop(): Promise<boolean>;
        onAlwaysOnTopChange(cb: (pinned: boolean) => void): () => void;
    };
    /** Shell-level commands — revealInOS / openInTerminal / startDrag / relaunch, injected on both ends */
    shell: {
        showItemInFolder(p: string): Promise<void>;
        openInTerminal(dirPath: string, terminalExe?: string, customCommand?: string): Promise<void>;
        /** disk location of an installed plugin — the **criterion** data source for "open containing folder / data location"
         *  on the marketplace detail page (whether a data directory exists decides whether that row is drawn).
         *  Resolved by the main process (the pool has zero knowledge of install paths); plugin not found on disk → null.
         *  ⚠️ Division of labor with `shell.showItemInFolder(p)`: **that one takes a path, this one takes an identity** —
         *  the caller (marketplace) cannot and should not assemble absolute paths. */
        pluginLocation(pluginId: string): Promise<PluginDiskLocation | null>;
        /** open the plugin's install directory / data directory in the file explorer — the main process resolves the path then `shell.openPath`.
         * Opens the directory **contents** (same feel as  `appearance.revealStorage` "open storage location"),
         *  **not** `showItemInFolder`'s "parent folder with it selected". When the directory does not exist: `install` throws
         *  (plugin not on disk — never pretend the open succeeded); `data` creates an empty directory first, then opens (same as revealStorage —
         *  opening reveals the storage location; an empty directory is equally legitimate). */
        openPluginFolder(pluginId: string, kind: PluginFolderKind): Promise<void>;
        startDrag(filePath: string, iconPath?: string): void;
        /** (G4): **truly restart the app** (quit and start the process again).
         *  The difference from `window.location.reload()` is whether the pool survives — the pool is an independent WebContentsView,
         *  a shell reload does not rebuild it, so after updating view-type plugins the pool still runs the old bundle
         *  (the UI looks completely unchanged).
         *  Honest boundary: the whole app quits and starts again — unsaved editor content is handled by hot exit, and the workspace
         *  layout goes through persisted restore.
         *  Shell preload only (the pool has no need to restart its own host); once called, this process terminates soon after — do not rely on its return. */
        relaunch?(): Promise<void>;
        /**
         * T4 (2026-10-05, the "file open-with and contribution points" case): **controlled openExternal** — asks the host to hand the URL
         * to the system default handler (browser / mail client / handler registered for the protocol, e.g. VS Code).
         *
         * 🔴 **The whitelist is not advice, it is a gate**: only `http:` / `https:` / `mailto:` and protocols registered in the host
         * constant (today including `vscode:`) pass; **everything else is rejected** (`file:` / `javascript:` / `data:` are explicitly
         * rejected — plugin file access goes through `workspace` / `filesystem`, not the OS shell; and executing external input as a
         * script is not something the host should do on anyone's behalf).
         * Rejected = this Promise **rejects** (no silent failure); the caller should catch it and give the user an explanation.
         *
         * ⚠️ Honest boundary of "handing off to the system": the host **cannot sense** whether the target program is installed —
         * `vscode://` brings up the OS's answer; when it is not installed, Windows itself pops "How do you want to open this?".
         * The host only guarantees "the protocol is whitelisted and the URL is well-formed".
         * The whitelist list belongs to the host-reserved surface ledger (family `externalProtocols`); changing it = one public-surface decision.
         */
        openExternal(url: string): Promise<void>;
    };
    /** Hot exit staging — persists unsaved editor content to disk (). `?`: pool-side only (the shell preload does not inject it) */
    hotExit?: {
        save(filePath: string, content: string): Promise<void>;
        load(filePath: string): Promise<string | null>;
        clear(filePath: string): Promise<void>;
    };
    /** Get the paths of files dragged in from the OS — injected on both ends */
    getFilePath: (file: File) => string;
}
/** Bottom panel namespace surface — modeled after VS Code vscode.window.createTreeView focus / view-promotion semantics */
export interface PanelAPI {
    panel: {
        /** Focus a bottom panel view — if the panel is hidden, it expands and switches to that view; if shown, focus switches. No-op when viewId is not in the panel container */
        reveal(viewId: string): Promise<void>;
        /** In-shell floating panel (type B) — pops a declared view out (I8-2 identity toggle). No-op when viewId is an undeclared view.
         * optional pluginId compound addressing — when two plugins share the same viewId (dual settings suites coexisting), the plugin side
         *  carries pluginId to hit the target suite precisely (the shell-side Ctrl+, / context menu path already does; a bare viewId with multiple
         *  hits fails loud as a no-op) */
        revealFloating(viewId: string, pluginId?: string): Promise<void>;
        /**
         * set the geometry of the current floating panel (**non-mouse path** — does not fight dragging; the two paths coexist).
         *
         * `bounds` only carries the fields to change (e.g. only `{ top, left }` moves the position, leaving `height` untouched); `null` = back to
         * the default centered large card (the state before I8-5/I8-7 dragging). No-op when the panel is **not open** (this API only changes
         * geometry; ⛔ it does not open the panel — opening belongs to `revealFloating`).
         *
         * ⚠️ Out-of-range values are clamped by **the same bounds as dragging** (not rejected): `height < 300` → 300;
         * `height > window height - 80` → clamped to the cap; `top/left` clamped into the 6px in-shell margin; `width` is capped only
         * (window width - 12). To read back the **actually effective** geometry, use `floatingPanelHost.getBounds()` (synchronous in-pool
         * answer) or the shell command `workbench.action.getFloatingPanelBounds`.
         */
        setFloatingBounds(bounds: Partial<FloatingPanelBounds> | null): Promise<void>;
    };
}
/** Settings suite entry — one row returned by settings.list().
 * Not exported (module-local interface) — the contract generator collects it automatically via SettingsAPI.list's transitive reference and emits the export;
 * there is no third-party consumer inside the shell, so exporting it would be reported as unused by knip (excluded domains in linkdesk-api.ts do not count as consumers). */
export interface SettingsPluginInfo {
    /** Plugin ID — the handle for getActive/setActive */
    pluginId: string;
    /** Plugin display name (raw manifest.name; consumers do their own i18n) */
    title: string;
}
/** Settings suite namespace surface — injected on both ends (the settings UI renders in the pool; the shell-side implementation goes through the IPC bridge) */
export interface SettingsAPI {
    settings: {
        /** All settings suites declaring factoryRole:"settings" (including the default/built-in one), in registration order */
        list(): Promise<SettingsPluginInfo[]>;
        /** The current active settings suite ID — reads the persisted activation (on-disk record); falls back to the default (built-in) when there is no record or the plugin is uninstalled */
        getActive(): Promise<string | undefined>;
        /** Switch the active settings suite — validates the candidate, then persists (survives restart). Throws fail-loud for non-candidates */
        setActive(pluginId: string): Promise<void>;
    };
}
/** Slot entry — one row returned by factorySlots.list(role).
 * Not exported (module-local interface) — the contract generator collects it automatically via list's transitive reference and emits the export;
 * there is no third-party consumer inside the shell, so exporting it would be reported as unused by knip (excluded domains in linkdesk-api.ts do not count as consumers). */
export interface FactorySlotEntry {
    /** Plugin ID — the handle for getActive/setActive */
    pluginId: string;
    /** Plugin display name (raw manifest.name; consumers do their own i18n) */
    title: string;
    /** this plugin's contributes.floatingPanel.viewId (undeclared = undefined) — used for switching/opening the candidate floating panel */
    viewId?: string;
}
/** factorySlots namespace surface — injected on both ends (the in-pool renderer side implements it via the IPC bridge) */
export interface FactorySlotsAPI {
    factorySlots: {
        /** Names of all filled roles (registration order) — for the settings page's "any factoryRole with ≥2 candidates → that role name group appears": enumerate roles first, then list(role) to judge the candidate count */
        listRoles(): Promise<string[]>;
        /** All candidate plugins declaring the given factoryRole [{pluginId, title}], in registration order */
        list(role: string): Promise<FactorySlotEntry[]>;
        /** The active plugin ID for the given role — reads the persisted activation (on-disk record); falls back to the default (built-in) when there is no record or the plugin is uninstalled */
        getActive(role: string): Promise<string | undefined>;
        /** Switch the active plugin for the given role — validates the candidate, then persists (survives restart). Throws fail-loud for non-candidates */
        setActive(role: string, pluginId: string): Promise<void>;
    };
}
/**
 * linkdesk-api app domain — the read-only main-software product identity surface (n-software-updates).
 * Split out of linkdesk-api.ts () — the 14th namespace domain interface.
 * Dependency direction: app → none (pure function signatures, zero type dependencies); cross-composed by the aggregator.
 *
 * Exposure boundary (00-README §3②, decided 2026-08-30): read-only, no writes — the version number is third-party readable
 * (consumed by the marketplace minAppVersion validation, ); update write commands (download/restart) are the shell's
 * private affair and not opened up. ProductInfo (the full identity of app:getProductInfo) is not a third-party plugin surface —
 * it is used internally by the main software (About page ) and stays out of this contract (see electron/product.ts).
 */
export interface AppAPI {
    /** The app namespace — read-only product identity. The only runtime source of the version number = main-process app.getVersion() (package.json as the single point, 02 §2.3). */
    app: {
        getVersion(): Promise<string>;
    };
}
/** Full description when an update is available — carried by every state from `UpdateState.available` onward */
export interface UpdateInfo {
    /** New version (SemVer, no v prefix) */
    version: string;
    /** Currently running version (`app.getVersion()` — 02 §2.3, the sole runtime source) */
    currentVersion: string;
    /** ISO release date (Release `published_at`) */
    publishedAt: string;
    /** Release notes page URL (GitHub release `html_url`) */
    releaseNotesUrl: string;
    /** Direct installer link (present only after `available` — the check leg can already fetch it; only the download consumes it) */
    downloadUrl?: string;
    /**
     * Installer sha256 (64-char lowercase hex, **the `sha256:` prefix already stripped**).
     * 🔴 **Source = the Release asset's `digest` field** (computed server-side by GitHub) — the API has **no** `checksum` field;
     * reading it by that name is always `undefined` ⇒ every run takes the "absent ⇒ degrade and allow" path ⇒ validation silently fails (release-pipeline dossier §1.5.1).
     */
    checksum?: string;
    /** Installer size in bytes (Release asset `size`) */
    size?: number;
}
/**
 * Six classes for the check leg + five for the download leg + one startup-reset class (01 §2.3 / §2.4 / §2.5).
 * The copy must be mutually distinct — "you are already on the latest version" and "the tag is not SemVer" are two different things; no half-and-half attribution.
 *
 * ⚠️ Not separately `export`ed for now: the only current consumer is this file's `UpdateError.code`, and the knip gate forbids empty exports.
 * When the shell side needs an "error code → copy" mapping (), take `UpdateError["code"]`, or promote it back to a named export then.
 */
export type UpdateErrorCode =
// —— Check leg (six classes) ——
/** Unreachable/timeout/proxy not in effect (this leg always goes through main-fetch.ts, ) */
'network'
/** GitHub 403/429 (`x-ratelimit-remaining: 0`) → "auto-retry later"; not to be reported as a network failure */
 | 'rate-limited'
/** Repository does not exist / no Release (404) */
 | 'not-found'
/** Malformed JSON structure / missing `tag_name`/`published_at` */
 | 'invalid-response'
/** 🔴 Release fetched but no asset matches (naming drift) — **must not be reported as network** */
 | 'asset-missing'
/** 🔴 `tag_name` is not valid SemVer — **report separately from "no update"**; silently ignoring it would make release incidents invisible */
 | 'version-unparsable'
// —— Download leg (five classes) ——
/** sha256 mismatch → delete the file + report an error */
 | 'checksum-mismatch'
/** 🔴 Release carries no checksum → log it + degrade and allow (do not block the update, 01 §2.4) */
 | 'checksum-unavailable'
/** Write to disk failed (disk full / no permission) */
 | 'write-error'
/**
 * 🔴 Transfer interrupted — two sub-cases share one code: ① a download left behind by a process exiting mid-run → after restart attributed `idle + interrupted`,
 * **not reviving `downloading`** (); ② this download **broke off halfway** (received < Content-Length, ).
 * Their user semantics and handling are identical (this attempt failed; download again); splitting into two codes would only make the shell write one identical line of copy twice.
 * ⚠️ Boundary with `network`: cannot connect / hangs until timeout during the **connection phase** = `network`; **already downloading and broke mid-way** = this code.
 */
 | 'interrupted'
/** Cancelled by the user/system */
 | 'canceled'
// —— Startup reset (one class, not produced by a leg) ——
/**
 * 🔴 The last update **failed to install, and the installer is no longer on disk** (computed by the startup reset , `update-install.ts`'s
 * `resolveStartupInstall`) — lands on `idle + this code`, `update` preserved.
 *
 * **Why not reuse `interrupted`** (codes split 2026-09-12, fixed in passing beyond this entry's scope): within a leg the two are indeed synonymous (both
 * "this attempt failed; download again"), but **the shell-side handling differs** — this code is **read back from disk at startup** with no initiator,
 * so the "whoever initiates reports" path (`checkForUpdatesAndReport`) can never reach it ⇒ if it were `interrupted`,
 * the user would get **zero notification on next startup** (empirically: `initUpdateService` discards `resolution.outcome`,
 * and producers stay silent on `idle` across the board). The shell's transition-driven path **only reports on this code** (`useUpdateNotifications`),
 * so "the download leg's broken stream" and "an unfinished update at startup" are machine-distinguishable, no longer relying on an indirect invariant
 * like "whether `update` is present" that drifts with the implementation.
 */
 | 'install-interrupted';
/** Structured record of one failure — the in-state `lastError` (no throwing, 07 §4.1) */
export interface UpdateError {
    code: UpdateErrorCode;
    /**
     * Human-readable = **i18n key form** (= the original Chinese text, hard constraint 2).
     *
     * 🔴 **Sentences carrying runtime values must be written as lexicon entries + `{{placeholders}}`, with values going through `params`** — concatenating them directly into `message`
     * (e.g. `Download timed out — 30 seconds without data`) makes the whole sentence **forever impossible to become a lexicon entry** (not one character identical), and `t()` can only
     * emit the original Chinese text verbatim ⇒ such sentences stay Chinese in every language (fixed 2026-09-12, fixed in passing beyond this entry's scope).
     * The dividing line: **the sentence skeleton (translatable) goes into `message`; runtime values that only flow in and never out (seconds/byte counts/raw system errors) go into `params`**.
     * Interpolation syntax matches the shell's `t()` (i18next's `{{name}}`).
     */
    message: string;
    /**
     * Actual values for the lexicon entry's placeholders (`{ seconds: 30 }` corresponds to `{{seconds}}` in the entry).
     * Values themselves are **never translated** — raw system errors (`msg(e)`) and HTTP status texts are language-neutral by nature, so pass them as **opaque values**.
     * Omitted (not passed) = the entry has no placeholders; the shell still calls `t(message)` as usual.
     */
    params?: Record<string, string | number>;
}
/** Download progress — carried by `UpdateState.downloading`, throttled to ≤500ms per message (07 §4.2) */
export interface DownloadProgress {
    /** Bytes downloaded */
    transferred: number;
    /** Total bytes */
    total: number;
    /** 0-100 integer */
    percent: number;
}
/**
 * Update state machine discriminated union (01 §2.1, nine states).
 *
 * ```
 * uninitialized → disabled (update source unavailable) / idle
 * idle ──check──▶ checking ──new version──▶ available (no update / error → idle)
 * available ──download──▶ downloading ──done──▶ downloaded (failure → idle + lastError)
 * downloaded ──"restart and update"──▶ updating ──quitAndInstall──▶ process exits
 * ready = downloaded's notification state (the "restart and update" toast has been shown)
 * ```
 *
 * 🔴 **`downloaded` has no edge back to idle** (, decided by the user 2026-09-12; the old diagram's
 * `downloaded ──"later"──▶ idle` was **wrong** and has been deleted). The notification's "later" **only dismisses that one notice**;
 * the state stays put — the installer is already on disk waiting to run, and downgrading the state to `idle` would only make the user download again.
 * Two exits: `updating` (clicking "restart and update"), or the startup reset restores it after the process exits ().
 * From this follows  (already landed in `electron/services/update-service.ts`): these two states are **check-immune** —
 * the check leg compares `latest > current`, and a version already downloaded is necessarily still greater than the current one ⇒ every check judges `available`,
 * and the UI would regress from "restart" back to "download update".
 *
 * 🔴 **`downloaded`/`ready` carry a `warning` slot (decided by the user 2026-09-12 ⇒ option (a) "add a warning slot to the state")**:
 * degrade-and-allow cases (`checksum-unavailable` etc. "install as usual, but log it") **must land in this slot**.
 * Previously there was only one `idle.lastError` slot, and **on degrade-and-allow the state goes to `downloaded`** ⇒ implementing the old type as-is
 * would silently drop this record (the release side would never see that it omitted a checksum, zeroing out the intended effect; also an instance of
 * [[snapshot-shadows-truth-bug-class]] ④ "one chance only + failures stay silent").
 *
 * ⚠️ `warning` is not a copy of `lastError`: **`lastError` = this attempt failed** (back to `idle`, with an exit waiting for the user to retry);
 * **`warning` = it succeeded, but there is something the release side should know** (the state proceeds as usual). So it appears only on the "success path",
 * and it **propagates across states**: `downloaded.warning` → (when the shell raises the notice) → `ready.warning`.
 */
export type UpdateState = {
    type: 'uninitialized';
} | {
    type: 'disabled';
    reason: string;
} | {
    type: 'idle';
    update?: UpdateInfo;
    lastError?: UpdateError;
} | {
    type: 'checking';
} | {
    type: 'available';
    update: UpdateInfo;
} | {
    type: 'downloading';
    update: UpdateInfo;
    progress: DownloadProgress;
}
/** `warning` = the degrade-and-allow record (e.g. `checksum-unavailable`) — see the 🔴 above, not a failure */
 | {
    type: 'downloaded';
    update: UpdateInfo;
    warning?: UpdateError;
} | {
    type: 'updating';
    update: UpdateInfo;
}
/** The notification state of `downloaded` — `warning` is carried over from `downloaded` (the consumer is the shell, ) */
 | {
    type: 'ready';
    update: UpdateInfo;
    warning?: UpdateError;
};
export interface UpdateAPI {
    /** The update namespace — read-only update state (for "About"-type plugins to read the host version/update state). */
    update: {
        /** Read the full state-machine state (07 §4.1: never throws — the service always has a state). */
        getState(): Promise<UpdateState>;
    };
}
/**
 * linkdesk API — the type-safe entry point for plugin code.
 * Global namespace structure modeled after the VS Code `vscode` object.
 * The namespaces injected by the pool preload are the plugin runtime source of truth (required);
 * only bridge (true-shell-only) / hotExit (pool-side-only) are optional with `?` — the other side does not inject them (review N1 fix:
 * the remaining bridge surfaces window/pool/shell/getFilePath are injected on both ends and marked required in the contract).
 * cross-composed from 15 namespace domain interfaces (interface→type intersection;
 * index access such as LinkDeskAPI["pool"]/["configuration"] keeps the consumer contract unchanged).
 */
export type LinkDeskAPI = CommandsAPI & AppearanceAPI & StorageAPI & TabsAPI & KeybindingsAPI & UiAPI & DataAPI & WorkspaceAPI & EditorAPI & PluginsAPI & ShellAPI & PanelAPI & SettingsAPI & FactorySlotsAPI & AppAPI & UpdateAPI;
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
 * — third-party custom hints are legitimate (promise, not withdrawn); a hint the renderer does not know ⇒ degrade to **read-only display + title explanation**,
 *   ⛔ no longer falling into an editable fallback (prevents bare strings from punching through the value domain).
 * The runtime list and type guards live in `@linkdesk/ui` (`SETTINGS_UI_HINTS` / `isSettingsUiHint`) —
 * this contract package is a **pure type-generation artifact with zero runtime** and can only carry types.
 */
export type SettingsUiHint = "themePicker" | "select" | "accentSource" | "slider" | "image" | "fontTone" | "fontFamily" | "color" | "file" | "directory" | "fontSize" | "segmented" | "stringList" | "fileAssociationsManager";
/**
 * Canonical render hint for settings rows (`renderHint`) — three values.
 * `readonly` read-only status row (value comes from the `statusCommand` runtime data source, not from config storage);
 * `action` action button (label = `description`, click runs `actionCommand`); `color` color swatch preview
 * (used by the shell's `app.accentColor` / `app.glassTint`). Same as uiHint: the declaring side stays an open `string`; unknown values degrade.
 * 🆕 Settings row case 2.1 (2026-10-04 · companion-declaration orthogonalization): `readonly`/`action` are shorthands for "the primary control is itself";
 * `statusCommand`/`actionCommand` can coexist with **any** primary control (rendering `[primary control][companion button][companion read-only]`).
 */
export type SettingsRenderHint = "readonly" | "action" | "color";
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
    anchor?: {
        x: number;
        y: number;
    };
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
    manifest?: {
        icon?: string;
        iconSource?: "codicon" | "svg" | "url" | "lucide";
    };
    /** Whether this handler is the current default */
    isDefault: boolean;
    /** Whether this handler was chosen by automatic adjudication (when no explicit override exists) */
    isAuto: boolean;
}
/** Icon mapping entry — font glyph form (monochrome/multi-color fonts; seti-style fonts carry one color per icon; codicon is the guaranteed monochrome fallback) */
export interface IconThemeGlyph {
    /** CSS class name (codicon fallback / custom icon font asset) */
    class: string;
    /** Optional per-icon color (seti-style color fonts) */
    color?: string;
}
/** Icon mapping entry — image asset form (any multi-color/skeuomorphic/textured art) */
export interface IconThemeImage {
    /** Relative path of the image asset — resolved by the shell at load time to a linkdesk:// absolute URL (getPluginAssetPath); consumers carry zero resolution burden */
    imagePath: string;
}
/** Icon mapping entry — dual form (④ decision: font glyph or image asset; a single theme may mix both; the shell performs zero review) */
export type IconThemeMapping = IconThemeGlyph | IconThemeImage;
/** Icon theme mapping table — fileExtensions/fileNames/folderNames → dual-form entries */
export interface IconThemeMappings {
    files?: Record<string, IconThemeMapping>;
    extensions?: Record<string, IconThemeMapping>;
    folders?: Record<string, IconThemeMapping>;
    /** Folder open state — optional; reuses folders when unspecified */
    foldersExpanded?: Record<string, IconThemeMapping>;
    /* ── Default icons ( aligns with VS Code iconTheme top-level default keys — use the theme default instead of the codicon fallback when the mapping table misses) ── */
    /** Default file icon — used when files/extensions miss (default = the shell's codicon fallback) */
    file?: IconThemeMapping;
    /** Default folder icon — used when folders miss (default = the shell's codicon fallback) */
    folder?: IconThemeMapping;
    /** Default expanded folder icon — used when foldersExpanded misses (default = the shell's codicon fallback) */
    folderExpanded?: IconThemeMapping;
    /** Root folder icon (default = the shell's codicon fallback) */
    rootFolder?: IconThemeMapping;
    /** Root folder expanded icon (default = the shell's codicon fallback) */
    rootFolderExpanded?: IconThemeMapping;
}
/** Plugin state change—the plugin-state:changed payload (cross-WebView state sync primitive) */
export interface PluginStateChangedPayload {
    pluginId: string;
    key: string;
    value: unknown;
}

declare global {
  interface Window {
    /** Plugin API—modeled after the VS Code vscode namespace (injected by preload-pool.ts / preload-shell.ts) */
    linkdesk: LinkDeskAPI;
  }
}

export {};
