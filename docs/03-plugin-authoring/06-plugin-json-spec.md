# The plugin.json Spec

> **2026-09-06 reconciliation against the implementation** (audit): flattened single root `plugins/<id>` (no builtin/user two-tier) · there is only one kind of plugin (`core:true` = an accidental-uninstall guard flag, not a category) · `distribution` = ⚠️ legacy field, do not fill it in.
> 🔴 **Throughout this document, "the root" always means the root of the plugin's own repo**: plugin source lives in **its own repo**; the `plugins/` folder of the shell repo holds only two development fixtures.
> Every bare path in this document (`plugin.json` / `src/…` / `resources/…`) is **relative to the plugin repo root** — do not go looking for a shipped plugin's source under the shell repo's `plugins/` (it is not there).
> The single entry point for plugin metadata. One plugin = one folder + one `plugin.json` + one entry file.
> **Aligned with VS Code: the `type` field is no longer needed — the loader detects the contribution type from the declared fields.**

---

## Plugin directory structure

A plugin is just a folder (a source directory). In the repo source tree it is `plugins/<id>/` (flattened single root, directory name = plugin ID); third-party authors develop at **their own project root** and build a `.linkdesk-plugin` for distribution (see [04-distribution-format §1](04-distribution-format.md)). **There is no builtin/user two-tier.**

```
my-plugin/
├── plugin.json              # Plugin metadata (the only required file)
├── README.md                # Plugin description — data source for the "Details" tab of the detail page
├── CHANGELOG.md             # Changelog — the single source of truth for the "Changelog" tab of the detail page
├── resources/               # Static assets — icons / images / fonts
│   └── icon.svg             # Icon (SVG recommended)
├── src/                     # Source code
│   ├── index.tsx            # Entry component
│   ├── sidebar.tsx          # Sidebar component (if any)
│   └── styles.css           # Styles
└── i18n/                    # Translation files (optional, declared by contributes.i18n)
```

| File | Description |
|------|------|
| `plugin.json` | **The only required file.** The file name is fixed and cannot be renamed |
| `README.md` | Plugin description — data source for the "Details" tab of the detail page. **The file name is fixed and it is not written into `plugin.json`** (see [09-plugin-directory-layout](09-plugin-directory-layout.md)) |
| `CHANGELOG.md` | Changelog — the **single source of truth** for the "Changelog" tab of the detail page. **The file name is fixed and it is not written into `plugin.json`**; the section-heading format is in [09-plugin-directory-layout](09-plugin-directory-layout.md) |
| `src/` | **Recommended**: put source under a `src/` subdirectory instead of leaving it flat. The `entry`/`sidebar` paths are relative to `plugin.json`, e.g. `"entry": "src/index.tsx"` |
| `resources/` | Static assets such as icons. Aligned with the `resources/` / `assets/` directories common in VS Code extensions |
| `icon` field | A path relative to `plugin.json`, e.g. `"icon": "resources/icon.svg"` |
| `i18n/` | Translation files — one JSON per language (the path is declared by `contributes.i18n`) |
| `__tests__/` | Test files; `src/__tests__/` is recommended |

> **A plugin source directory produces no `dist/`** (distribution build artifacts are produced by plugin-sdk into the `.linkdesk-plugin` (`index.bundle.js` + `views/*.bundle.js` + a rewritten plugin.json); authors do not care). The complete directory conventions are in `09-plugin-directory-layout.md`.

---

## There is only one kind of plugin — identity differences live in declared fields, not in directories

**After the single-root flattening (2026-09-05) there are no longer "builtin/user" kinds**: repo `plugins/<id>` and installed-state `{userData}/plugins/<id>` are both **flat single roots** — plugins shipped with the shell and third-party installs sit side by side in the same tree. The only difference is in plugin.json fields:

| Field | Meaning | Who should fill it in |
|------|------|:--|
| `core: true` | **UI accidental-uninstall guard flag** — the uninstall button is hidden/disabled (the shell depends on it for baseline interactions such as the settings page and the plugin marketplace). **No behavioral privileges, not a category** | These official ones: `editor` `file-tree` `marketplace` `settings` |
| `distribution` | ⚠️ **Legacy field** (already marked deprecated in the schema, do not fill it in) — it no longer maps to any directory and the install side always normalizes it to `user` | **Third parties must not fill this in** |

### Creating a plugin (third party, your own project root)

```jsonc
// my-plugin/plugin.json
{
  "name": "My Plugin",
  "version": "1.0.0",
  "entry": "src/index.tsx"
  // Do not fill in core — an ordinary plugin the user can freely install and uninstall
  // Do not fill in distribution — a legacy field; once installed into the app it is always normalized to user
}
```

Build → `<id>.linkdesk-plugin` → the user installs it → `{userData}/plugins/<id>/` (see [04 §2](04-distribution-format.md)).

### core:true official plugins (shipped with the shell)

```jsonc
// plugins/file-tree/plugin.json (actual state of the repo's single root)
{
  "name": "File Tree",
  "version": "1.0.0",
  "core": true,                // 🔥 uninstall guard — no uninstall button in the UI
  "entry": "src/index.tsx"
}
```

> **Wording discipline (hard constraint 11):** "builtin / shipped with the shell" refers to that copy of `bundled-plugins/*.linkdesk-plugin` and the boot auto-install path, **not to a kind of plugin**. Say "a plugin with core:true", "a plugin shipped with the shell" — do not say "builtin plugins are…" as a category definition. An official plugin distributed through the marketplace is just as much an ordinary plugin when it does not set core — whether it is bundled is decided by whether it goes into bundled-plugins, not by the field.

---

## Minimal example (a view plugin)

```json
{
  "pluginId": "gps-map",
  "name": "GPS Map",
  "version": "1.0.0",
  "icon": "resources/map.svg",
  "description": "Interactive map view, supports Leaflet/Amap",
  "author": "Community",
  "entry": "src/index.tsx"
}
```
The `entry` field → the loader automatically recognizes this as a view plugin. `pluginId` = **the plugin's identity, forever immutable after publication** — although it runs without one (it falls back to the project directory name), **new plugins should always declare it explicitly**: repo names and local directory names are free-form, and relying on the fallback lets identity drift along with the name.

## Contribution detection rules

| Declared field | Auto-detected as | Load behavior |
|---------|-----------|---------|
| `entry` | view | dynamic import → registered into viewRegistry |
| `themes` | theme | registered into ThemeEngine |
| `languages` | language | registered into i18next |
| `mode` | protocol | protocol registration (fully implemented in Phase 5)|
| `resources` | resource | resource registration (fully implemented in Phase 5)|
| `sidebar` | view + sidebar | the sidebar component is registered together with the view |
| `statusBar` | view + statusBar | the status bar contribution is registered together with the view |
| `contributes.commands` | — | registered into CommandRegistry → command palette / context menus / keybindings |
| `contributes.configuration` | — | registered into ConfigurationRegistry → rendered automatically by the Settings Editor |
| `contributes.menus` | — | registered into MenuService → context menus generated dynamically |
| `contributes.keybindings` | — | registered into KeybindingRegistry → global keyboard listening |
| `contributes.themes` | theme | registered into ThemeRegistry → theme browser |
| `contributes.languages` | language | registered into LanguageRegistry |
| `contributes.fileAssociations` | — | registered into FileAssociationService → double-clicking a file opens it automatically |
| `contributes.floatingPanel` | —  | Declares that the view can be displayed in a floating panel inside the shell — viewId references an already-registered view; without the declaration there is no "Open in Floating Panel" context-menu item |

**A plugin can declare several contributions at once.** A view plugin, for example, can have `entry` + `sidebar` + `statusBar` + `contributes.configuration` + `contributes.commands` — each is registered independently and does not affect the others.

## Complete examples

### View + sidebar + status bar

```json
{
  "name": "Terminal",
  "version": "1.0.0",
  "icon": "terminal",
  "entry": "index.tsx",
  "sidebar": "sidebar.tsx",
  "statusBar": [
    { "id": "connection", "label": "Not connected", "align": "left" },
    { "id": "stats", "label": "TX:0  RX:0", "align": "left" }
  ]
```

### Theme plugin

```json
{
  "name": "Dracula",
  "version": "1.0.0",
  "icon": "color-mode",
  "description": "The classic Dracula dark theme",
  "author": "Community",
  "file": "dracula.json"
}
```

Multi-theme package:

```json
{
  "name": "Dracula Official",
  "version": "1.0.0",
  "themes": [
    { "id": "dracula", "name": "Dracula", "file": "dark.json" },
    { "id": "dracula-soft", "name": "Dracula Soft", "file": "soft.json" }
  ]
}
```

### Language pack plugin

```json
{
  "languages": [{ "code": "ja", "name": "日本語", "file": "ja.json" }],
  "name": "日本語",
  "version": "1.0.0",
  "icon": "globe",
  "description": "Japanese UI translation",
  "author": "Community",
  "file": "ja.json"
}
```

### Protocol plugin

```json
{
  "mode": "text",
  "name": "SBQ Heart-Rate Protocol",
  "version": "1.0.0",
  "icon": "circuit-board",
  "description": "Heart-rate protocol parser with a single-character packet header",
  "author": "Community",
  "entry": "index.ts",
  "mode": "text"
}
```

### Static resource plugin

```json
{
  "name": "STM32 Register Manual",
  "version": "1.0.0",
  "icon": "book",
  "description": "STM32F103 reference manual HTML",
  "author": "Community",
  "resources": ["manual.html"]
}
```

---

## Field reference

### Required fields

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Display name, visible to users. **Required at the schema level** (alongside `version`; these are the only two that are mandatory) |
| `version` | `string` | Semantic version, e.g. `"1.0.0"`. **Required at the schema level.** 🔴 **It is also the single source of truth for the "same version in four places"** (`CHANGELOG.md` section heading ↔ this field ↔ the catalog entry `versions[].version` ↔ `package.json.version`) — rules in [09-plugin-directory-layout](09-plugin-directory-layout.md) under "version synchronization"; **this table does not duplicate them** |
| `entry` | `string` | Entry file path, relative to the plugin directory. **Needed only by view / tab plugins** — it is not required at the schema level (an entryless sidebar plugin has zero entry; see "When an icon appears in the icon bar") |
| `icon` | `string` | Icon identifier — a codicon/Lucide name or an SVG path (optional; a default icon is used if omitted) |

> **The `type` field is deprecated** (no longer required, and not on the schema's required list) — the loader detects the contribution type automatically from the declared fields `entry`/`themes`/`languages`/`mode`/`resources`/`contributes`.

### Optional fields

| Field | Type | Description |
|---|---|---|
| `$schema` | `string` | JSON Schema reference path |
| `pluginId` | `string` | 🔴 **The plugin's identity — forever immutable after publication** (VS Code's `publisher.name` is the counterpart). The install directory `{userData}/plugins/<pluginId>/`, the distribution file name `<pluginId>.linkdesk-plugin`, the marketplace catalog dedupe key, the uninstall tombstone key and update reconciliation all key off it. **Declaring it explicitly is strongly recommended**: without a declaration it falls back to the "project directory name", and repo names and local directory names are free-form — rename the directory and the identity changes with it, with **nothing ever reporting an error**. Charset `^[A-Za-z0-9][A-Za-z0-9._-]*$`. Rules and the empirical evidence behind them are in [16-naming-conventions](16-naming-conventions.md) |
| `core` | `boolean` | `true` = **UI accidental-uninstall guard flag** (matching the newer wording in the field table above) — the uninstall button on the detail page is hidden/disabled; **no behavioral privileges and not a category**: the API/command layers can still uninstall and disable it, and uninstalling writes a `removed` tombstone. Defaults to `false` |
| `distribution` | `string` | ⚠️ **Legacy field** (since the single-root flattening on 2026-09-05 it no longer maps to any directory; the install side always normalizes it to `user`; already marked deprecated in the schema). **Third parties must not fill this in** |
| `factoryRole` | `string` | System slot role: `"settings"` \| `"marketplace"`. **Filling it in = form 2 (replace / switch into the slot); omitting it = form 1 (coexist as an ordinary view plugin)** — see "The `factoryRole` field in depth" below |
| `iconSource` | `string` | `"codicon"` (default) / `"svg"` / `"url"` |
| `marketIcon` | `string` | The **coloured identity image** for marketplace display (list row + detail header). Unlike `icon`: plugins on the icon bar use it to supply a colour image. Missing → falls back to `icon` → then to the unified default block. See "The marketplace image `marketIcon`" below |
| `marketIconSource` | `string` | Same enum as `iconSource`. When the value is `resources/…` you can **just omit it** (inferred from the value) |
| `description` | `string` | One-line description shown on the plugin detail page. Multi-line is supported |
| `author` | `string` | Author name |
| `sidebar` | `string` | Sidebar component path; only effective for the `view` type |
| `tabBehavior` | `object` | Tab behavior declaration, see below |
| `statusBar` | `array` | Status bar contribution entries, see below. Only effective for the `view` type |
| `file` | `string` | Single-file entry — the `.json` of a `theme` or a `language`. Mutually exclusive with `themes`/`languages` |
| `themes` | `array` | Multiple themes `[{ id, name, file }]`. `theme` type only |
| `languages` | `array` | Multiple languages `[{ code, name, file }]`. `language` type only |
| `mode` | `string` | Protocol mode: `"text"` (available in Phase 4) / `"binary"` (Phase 6+ WASM). `protocol` type only |
| `resources` | `string[]` | List of resource files — HTML/images and so on. `resource` type only |
| `recommends` | `array` | Plugins recommended to be installed as well `[{ plugin: string, reason: string }]` |
| `suggests` | `array` | Optionally related plugins `[{ plugin: string, reason: string }]` |
| `requires` | `string[]` | Plugin-level activation dependencies — declared by pluginId; at load time dependencies are loaded before this plugin. No version constraints. See "The `requires` field in depth" below |
| `screenshots` | `string[]` | Array of screenshot URLs (enabled in Phase 5+) |
| `minAppVersion` | `string` | Minimum app version requirement |
| `docs` | `string` | Bundled documentation path (for resource plugins) |
| `cardDocMap` | `object` | Card ID → documentation anchor mapping |
| `i18n` | `object` | Plugin-bundled translations `{ "en": "i18n/en.json", "ja": "i18n/ja.json" }` — key = the plugin UI's source text (the author's native language is recommended). It lives under `contributes.i18n`, not at the top level |
| `cssVars` | `object` | Plugin-defined CSS variables `{ "--name": { "dark": "#fff", "light": "#000" } }` |
| `permissions` | `string[]` | Permission declarations `["serial", "filesystem", "network"]` (enabled in Phase 5+) |

### Why are there no `readme` / `changelog` fields here?

The description and the changelog **are file-based** — `README.md` / `CHANGELOG.md` in the plugin root directory (location, format and their relationship to the detail page are in [09-plugin-directory-layout](09-plugin-directory-layout.md)).

These two fields did exist during early development, but they **never had a reader** (readers read files inside the package by **fixed file name** and never look at any declared field), so they **were removed on 2026-09-11**.

> **Writing them into `plugin.json` has no effect; they are simply ignored** (the top level uses lenient validation, so writing them raises no error — which makes them a lie). **If you copied these two fields from an old tutorial or an old commit → delete them and switch to files.**

### The `requires` field in depth

Plugin-level activation ordering — declares which plugins must be activated before this one is activated.

**VS Code's `extensionDependencies` is the counterpart**: the same family of mechanism, and this field is its normalized consolidation (see "Naming boundaries" below).

**Semantics:**
- The value = an array of the dependency plugins' `pluginId`s (no version constraints — activation ordering carries no version semantics; version matching is the marketplace's business)
- The loader loads in topological order: plugins in `requires` are activated first, then this plugin — scan order no longer affects activation order
- Missing dependency → this plugin is suspended (PENDING) and loads automatically once the dependency is installed/enabled
- Dependency uninstalled/disabled → this plugin is uninstalled along with it (consumers first, reverse topological order)
- A dependency cycle (A→B→A) → detected at load time and reported as an error; the plugin is not activated

**Example:**

```json
{
  "name": "Serial Enhancements",
  "version": "1.0.0",
  "icon": "package",
  "requires": ["serial-core"]
}
```

**Naming boundaries (three kinds of "dependency" that must not be confused):**

| Field | Level | Meaning |
|---|---|---|
| `requires` | Plugin level (top level of plugin.json) | Activation ordering dependency — dependencies first, then this plugin |
| `dependsOn` | Setting level (inside a `contributes.configuration` entry) | One setting depends on the value of another setting |
| `extensionDependencies` | Plugin level (historical field) | Deprecated — folded into `requires` (shipped) |

### ~~`activationEvents`~~ — removed (retired, 2026-09-09)

> 🔴 This field has been deleted from both the schema and the runtime; **do not write it again** (writing it raises no error — the schema root's `additionalProperties: true` tolerates old manifests, but it has no effect whatsoever).
> Why it was retired: once all the shell-side deferred-activation tracks were deleted, the load model was simplified to "register all metadata at startup + lazily load JS by URL from the pool" — no event field is needed for fine-grained control.
> **The current JS load-timing contract is in `02-plugin-lifecycle.md` §5**: surface mount (import when a view opens) ∪ on-command activation (command miss → import the owning entry; for pure command plugins the handlers must sit at the top level of the entry).

### The `factoryRole` field in depth — form 1 (coexist) vs form 2 (replace)

> **In one sentence: want your own icon/UI to appear *side by side* with the official one → do not fill in `factoryRole` (an ordinary view plugin, coexisting by nature); want to *replace* the official one and become the system default (settings page / plugin marketplace) → fill in `factoryRole` (enter the slot, switch between them).**

| | Form 1 (coexist) | Form 2 (replace) |
|---|---|---|
| Declaration | **Do not fill in** `factoryRole` | **Fill in** `factoryRole:"settings"` / `"marketplace"` |
| Essence | An ordinary view plugin (`appearsIn.iconBar` + its own view) | One candidate for that role, entering a FactorySlots slot |
| Icon bar | Its own icon **side by side** with the official one | The active set's icon **occupies the slot**; inactive sets are hidden |
| Switching | None — the user clicks whichever one they want | The settings page automatically shows a **group named after the role** + a switch button |
| Possible today? | ✅ Zero shell changes | ✅ Already shipped |

**Names play no part in the mechanism.** The shell has no "compare names" logic whatsoever — pluginIds are distinct and never collide; view ids are immune to collision thanks to the `(pluginId, viewId)` composite key; the display name is only for users. What is called a "group of the same name" is really a "**group of the same role**" — groups are named after the **role name** (e.g. "Plugin Marketplace"), so whether you call yours "Marketplace" or "Map Store", as long as you declare the same `factoryRole` you land in the same group.

**How to choose (the author's own expression):**
- **Want coexistence → do not fill it in.** Example: a third party builds an entirely new marketplace UI; an extra icon of their own appears next to the official one in the icon bar, clicking it shows their UI, pulling the same data as the official one
- **Want replacement → fill it in.** Example: declaring `factoryRole:"marketplace"` → the settings page shows a "Plugin Marketplace" group + a switch button, and once switched, the icon/content become yours

**Form 2 implementation details** (already shipped; reference entities `plugins/settings` (the official core:true settings set) + `10-building-a-settings-plugin.md`):

- **① One-to-many slots**: several plugins declaring the same `factoryRole` = **legitimately coexisting**; all are collected as slot candidates (no more "first one wins"). The **default** (when the user has never switched / on open) = first-registered stable order (core:true has no behavioral privilege and does not grab the default — registration order does not rely on a coincidence of scan order). Multiple coexisting candidates are no longer silent — the shell console fail-louds, naming every candidate + the default (re-emitted only when the candidate set for that role changes).
- **② Active set = the user's switch choice, persisted to disk** (survives restarts). The public enumeration/switching surface is `window.linkdesk.factorySlots.*` (a generic enumeration surface, role-agnostic and taking a role parameter; the settings role additionally has the compatible alias `window.linkdesk.settings.*`, which forwards everything as-is internally):

  | Method | Purpose |
  |------|------|
  | `factorySlots.listRoles()` | All filled role names (registration order) — the settings page enumerates roles first, then calls list(role) to judge the candidate count |
  | `factorySlots.list(role)` | All candidates for that role `[{ pluginId, title, viewId? }]` — title = the raw display name, viewId = that set's `contributes.floatingPanel.viewId` (undefined if not declared) |
  | `factorySlots.getActive(role)` | The active set's plugin ID — reads the persisted value; with no record / after uninstall it falls back to the default (the first-registered candidate, no core preference) |
  | `factorySlots.setActive(role, pluginId)` | Switch the active set — validates the candidate, then persists; **a non-candidate fail-louds with an error** |

- **③ Switch entry point = a role group on the settings page (appearing dynamically)**: when the settings UI opens it enumerates `listRoles()` → for every **non-settings-plugin role** it calls `list(role)` → **a group is created only when there are ≥2 candidates** (a single candidate makes switching meaningless). Group shape = the switch button on top (listing every candidate for that role, the active one highlighted) + the active set's own configuration below; it reuses a group of the same name where possible (finding the active candidate's own configuration group by pluginId), and only creates a new one otherwise; if the active set has no settings, it shows an empty state. Switching = `setActive` → refetch data → the configuration follows the active set. Switching your settings plugin's **own role** (settings) = the button in the generic area at the top (see `10-building-a-settings-plugin.md`).
- **④ Icon bar slot occupancy**: for plugins that declare `factoryRole` (form 2), the icon bar **renders only the active set's icon** and hides inactive ones — "swap the official one out for yours"; form 1 plugins that do not declare it still all show up side by side as before.
- **⑤ Routing seam**: opening settings (`Ctrl+,` / the gear) = `factorySlots.getActive("settings")` → if a tab is already open, focus it / if `floatingPanel` is declared → the floating panel (the payload carries pluginId for composite addressing) / if nothing is declared → open a tab. After switching the active set, all subsequent opens go through the new set, consistently on both ends.
- **⑥ Switching sets on the plugin side** (the switch button's click, zero shell changes): `setActive` → tab form = close this set's tab → open the target set (singleton dedupe focuses it if it already exists); floating panel form = `panel.revealFloating(viewId, pluginId?)` **replacing the panel content in place with composite addressing** (no leftover tab popping up behind; if the target set declares no floatingPanel → fall back to opening a tab). Deleting any set → `onPluginLifecycleChange` → refetch → the button disappears on its own.

**Two-scenario example (official + third-party plugin marketplace):**

| | Form 1 (coexist) | Form 2 (replace) |
|---|---|---|
| Third-party declaration | Do not fill in `factoryRole` — an ordinary view plugin (`appearsIn.iconBar` + its own view + `pluginManager.*` data) | Fill in `factoryRole: "marketplace"` |
| Icon bar | Your own icon sits side by side next to the official Marketplace; the two marketplaces are fully independent | Only the **active set's** icon is shown (default = the first-registered candidate, no core preference); inactive sets are hidden |
| Settings page | No notion of slots | Shows a "Plugin Marketplace" role group (2 candidates) + a switch button |
| User switching | None — click whichever you want | Switch to your Map Store → the icon/open behavior all become yours, persisted across restarts |
| Data | The same `pluginManager.*` API, each building its own UI | The same data, with the UI swapped for the active set |


### The `icon` field in depth

The icon appears in the icon bar, the tab bar, the welcome page and the [+] menu — the same icon everywhere, rendered uniformly by the `<PluginIcon>` component.

**Aligned with VS Code:** icon files sit inside the plugin's own directory, and the `icon` field just names the file.

**Three ways to specify an icon:**

| Way | `icon` value | `iconSource` | File location |
|------|-----------|-------------|---------|
| Built-in codicon | `"package"` | Omit (defaults to `"codicon"`) | No file needed — the built-in codicon font |
| Built-in Lucide icon | `"FolderTree"` | `"lucide"` | No file needed — the shell's built-in Lucide icon set (whitelist in PluginIcon's `LUCIDE_MAP`: FolderTree/Folder/File/Package and so on) |
| Custom SVG / PNG | `"resources/icon.svg"` | Omit | `<plugin directory>/resources/icon.svg` (the `resources/` subdirectory is recommended) |
| Custom PNG (no extension) | `"resources/icon"` | Omit | `<plugin directory>/resources/icon.png` (`.png` is appended automatically) |
| External URL | `"https://..."` | `"url"` | Any reachable URL |

**Examples:**

```json
// Built-in codicon — zero files, just write the codicon name
{ "icon": "package" }

// Custom SVG — recommended; vectors stay sharp and fill="currentColor" follows the theme
{ "icon": "resources/icon.svg" }
// Put the file in the plugin directory: my-plugin/resources/icon.svg

// Custom PNG — a bitmap, may look blurry at multiple sizes
{ "icon": "resources/icon.png" }
// Put the file in the plugin directory: my-plugin/resources/icon.png

// External URL
{ "icon": "https://example.com/icon.svg", "iconSource": "url" }
```

> **SVG + `fill="currentColor"` is recommended:** one file fits every size (24px in the icon bar, 14px in the tab bar, 24px/16px on the welcome page) and recolors automatically for light/dark themes. PNG gets blurry when scaled up and is not recommended.

### The marketplace image `marketIcon` — what your plugin looks like in the market

`icon` is the **small in-app icon** (icon bar / tab bar / [+] menu); `marketIcon` is the **coloured identity image shown in
the marketplace list row and at the top of the detail page**. They can differ: a plugin that sits in the **icon bar** must
draw `icon` as a single-colour line glyph (the icon bar force-tints it, so a coloured image turns into a blob), while the
marketplace slot wants a branded colour image — that is when you add `marketIcon`. Plugins outside the icon bar normally
do not need it (`icon` *is* the identity image).

**Three tiers — pick what you need, all three are publishable:**

| Tier | What you declare | What the marketplace shows |
|:--|:--|:--|
| **No image** | Declare neither | The unified default coloured block (good enough to publish) |
| **One image** | `icon` only (coloured SVG) | The market row, the detail header and your own tab icon all show it |
| **Two images** | `icon` (line glyph) + `marketIcon` (coloured identity image) | Line glyph in the UI, colour image in the marketplace |

```json
{ "icon": "resources/icon-bar.svg", "marketIcon": "resources/icon.svg" }
```

**The two data paths (not your concern, but they decide who sees which image):**

| Who is looking | Read from | Value form |
|:--|:--|:--|
| **An installed user** | the `plugin.json` inside your package | A package-relative path (`resources/icon.svg`) — works offline |
| **A not-yet-installed user** (browsing the market) | the catalog entry `marketplace.json` | An **absolute URL** — `publish` converts your relative path into a raw link automatically; **you never write the URL** |

🔴 **Two rules:**

1. Always write `icon` / `marketIcon` as a **package-relative path** (`resources/…`). `publish` turns it into
   `https://raw.githubusercontent.com/<you>/<repo>/v<version>/resources/…` at release time — **writing a URL by hand is
   redundant** and tends to go stale when the version changes. (An external CDN is still allowed: a full http(s) URL plus
   `iconSource: "url"` is passed through untouched, but keeping it alive is on you.)
2. **Changing the image = change the file + bump the version + `publish` again.** Installed users read the image from the
   package, so they only get a new one with a new version; without a bump, whoever installed the old version never sees it.

### When an icon appears in the icon bar (appearsIn.iconBar)

> **opt-IN — without declaring `appearsIn.iconBar` there is no icon of yours in the icon bar.** The old `iconLocation` default of `"top"` (opt-OUT — the editor got squeezed into the icon bar even without declaring anything) has been deprecated; it is now controlled declaratively by `appearsIn.iconBar` (`"top"` = the upper icon group, `"bottom"` = the fixed bottom group).

**Two paths to an icon:**

| Path | Prerequisite | Description |
|------|------|------|
| **Has an `entry`** | `entry` + `appearsIn.iconBar` | The classic form — the entry component registers into viewRegistry, giving an icon + openable as a tab |
| **entryless** | **No `entry`** + `contributes.viewsContainers` containing a sidebar container + `appearsIn.iconBar` | The simplest path for sidebar-only plugins — **no need to write a dummy `src/index.tsx`**. The shell registers a component-less entry and the icon still appears |

**Who does not get an icon:**
- **Data plugins** (zero sidebar containers, e.g. a language pack) — deliberately not shown. Gated by `pluginRole: "data"`, so nobody is forced to write an empty shell just to get an icon
- **Pure panel / auxiliarybar containers** — the icon bar's semantics are "open a sidebar container", and panel / auxiliarybar do not count
- **entryless plugins are never tabs** — `appearsIn.tabBar: true` must be paired with `entry` (tab rendering depends on the entry component)

**Minimal entryless sidebar plugin — zero index.tsx:**

```json
{
  "name": "Sidebar Tools",
  "icon": "globe",
  "appearsIn": { "iconBar": "top" },
  "contributes": {
    "viewsContainers": {
      "my-sidebar": { "title": "Sidebar Tools", "location": "sidebar" }
    },
    "views": {
      "my-sidebar": [
        { "id": "main", "title": "Main View", "render": "src/views/MainView.tsx", "order": 0 }
      ]
    }
  }
}
```

Views are loaded by ViewContainerService from `contributes.views[].render`, and the icon goes through the shell's component-less registration path. **For a sidebar-only plugin to get an icon = `appearsIn.iconBar` + a sidebar `viewsContainers`, with no `entry` and no `src/index.tsx` needed**; **only plugins that need tabs need `entry`**.

### The `contributes` field (Phase 5+) — aligned with VS Code

> **Once a plugin declares `contributes`, the system wires it up automatically — no core code changes needed.**

#### contributes.configuration — plugin settings appear automatically in the Settings Editor

After installation, the Settings Editor's left-hand tree automatically gains a group and the right-hand side renders a form automatically. **No hand-written settings UI required.**

```json
{
  "contributes": {
    "configuration": {
      "title": "CAD Viewer",
      "properties": {
        "cad.gridSize": {
          "type": "number",
          "default": 10,
          "minimum": 1,
          "maximum": 100,
          "description": "Grid size (mm)"
        },
        "cad.units": {
          "type": "string",
          "default": "mm",
          "enum": ["mm", "cm", "inch"],
          "description": "Units"
        },
        "cad.darkThemeOverride": {
          "type": "boolean",
          "default": false,
          "description": "Force a dark view"
        }
      }
    }
  }
}
```

**Supported types:** `"string"` | `"number"` | `"boolean"` | `"integer"`
**Supported constraints:** `enum` (dropdown list) | `minimum` / `maximum` (numeric range) | `default` (default value)

**Reading settings from plugin code (through `window.linkdesk.configuration` — an iron rule of plugin communication; `import @src/core/...` is forbidden):**
```typescript
function CadView() {
  const [gridSize, setGridSize] = useState<number | undefined>(10);

  useEffect(() => {
    window.linkdesk.configuration.get<number>("cad.gridSize").then(setGridSize);
    return window.linkdesk.configuration.onChange<number>("cad.gridSize", setGridSize);
  }, []);
  // The user changes the value in the Settings Editor → onChange callback → the component re-renders automatically
}
```

#### contributes.commands — plugin-registered commands that appear in the command palette

```json
{
  "contributes": {
    "commands": [
      {
        "id": "cad.importDxf",
        "title": "Import DXF…",
        "category": "CAD"
      },
      {
        "id": "cad.exportPdf",
        "title": "Export PDF…",
        "category": "CAD",
        "when": "activeEditor == 'cad'"
      }
    ]
  }
}
```

**`when` conditions:** evaluated in real time by the Phase 5 ContextKeyService. Expression syntax:

| Operator | Example | Meaning |
|--------|------|------|
| bare key | `portOpen` | the key's value is truthy → true |
| `!` | `!portOpen` | negation |
| `&&` | `activeEditor == 'terminal' && portOpen` | logical AND |
| `\|\|` | `activeEditor == 'a' \|\| activeEditor == 'b'` | logical OR |
| `==` | `activeEditor == 'terminal'` | equals (value comparison) |
| `!=` | `editorCount != 0` | not equals |
| `in [a, b]` | `activeEditor in ['terminal', 'cad']` | set membership |
| `()` | `!(portOpen \|\| editorCount > 1)` | grouping |

**Available context keys:**

| Key | Type | Description | Written by |
|-----|------|------|--------|
| `activeEditor` | `string \| null` | The pluginId of the currently focused tab | App.tsx (on tab switch) |
| `portOpen` | `boolean` | Whether the serial port is open | App.tsx (on serial port open/close) |
| `portName` | `string \| null` | The current serial port name, e.g. `"COM3"` | App.tsx (on serial port open/close) |
| `editorCount` | `number` | The total number of open tabs | App.tsx (on tab add/remove) |
| `editorHasSelection` | `boolean` | Whether the editor has selected text | Reserved (Phase 6 CM6 selection listener) |

> **Rule for writing `when`: every plugin command should declare a `when`.** Omitting `when` = visible in every context — the command would show up in the command palette even on multi-tab pages, confusing the user.

#### contributes.menus — plugins declaring context menu items

```json
{
  "contributes": {
    "menus": {
      "editorContext": [
        "cad.importDxf",
        "cad.exportPdf"
      ],
      "tabContext": [
        { "command": "cad.closeAll", "when": "activeEditor == 'cad'" }
      ]
    }
  }
}
```

**Available menu IDs:** `editorContext` (right-click inside tab content) | `tabContext` (right-click on the tab bar) | `fileContext` (right-click in the file tree, Phase 6) | `cardContext` (right-click on a card, Phase 7) | MenuId is an open string (`menuBar` / any newly registered point)

**Menu item fields:** `command` (command ID; may be empty when `children` is present) | `label` (overrides the command title) | `group` | `when` | `order` (ordering within the same group) | `children` (nested submenus, **recursive to any depth** —). See `03-contributes-spec.md §3.2`.

**Menu positions (MenuId) are defined by the framework; you only decide what command goes where.** The framework registers built-in items of its own — "Close" and "Split" belong to the framework, "Clear" and "Pause" to the terminal plugin, "Import DXF" to the CAD plugin. The menu a user sees on right-click = framework built-ins + terminal + CAD + your plugin — many contributors, merged at render time.

#### contributes.keybindings — plugins declaring keyboard shortcuts

```json
{
  "contributes": {
    "keybindings": [
      {
        "command": "cad.importDxf",
        "key": "ctrl+shift+i",
        "when": "activeEditor == 'cad'"
      }
    ]
  }
}
```

---

### The `tabBehavior` field

```json
{
  "tabBehavior": {
    "isFallback": false,
    "singleton": false,
    "confirmOnClose": "Closing this tab will disconnect the serial port"
  }
}
```

| Property | Type | Description |
|---|---|---|
| `isFallback` | `boolean` | Automatically creates this tab when no tab is present, and it cannot be closed. Only the welcome page declares it |
| `singleton` | `boolean` | Only one instance is allowed globally; creating another → focuses the existing one. E.g. the settings page |
| `confirmOnClose` | `string` | Shows a confirmation dialog before closing, with this value as the prompt text. E.g. the terminal |

### `statusBar` entries

```json
{
  "statusBar": [
    { "id": "connection", "icon": "circle-filled", "label": "COM3 connected", "align": "left" },
    { "id": "txrx", "label": "TX:0  RX:0", "align": "left" }
  ]
}
```

| Property | Type | Description |
|---|---|---|
| `id` | `string` ✅ | Unique identifier |
| `icon` | `string` | codicon name or SVG path |
| `label` | `string` | Display text |
| `align` | `string` | `"left"` (default) / `"right"` |
| `onClick` | `string` | Click behavior — a command name |

---

## Directory structure conventions

```
plugins/<pluginId>/            ← repo source tree (flat single root; directory name = plugin ID)
{userData}/plugins/<pluginId>/ ← installed state (where the .linkdesk-plugin zip is extracted)
```

`<pluginId>` = folder name = the plugin's unique identifier (the only source of identity — the loader derives pluginId from the directory name; the schema has no top-level pluginId field). Naming rules:
- lowercase English + hyphens: `gps-map`, `protocol-sbq`, `theme-dracula`
- no app name, no version number: `terminal`, not `v3-terminal`

> The complete directory structure (what goes in `resources/` / `src/utils/` / `__tests__/`, naming conventions) is in `09-plugin-directory-layout.md`.

---

## Validation rules

The loader validates `plugin.json` (the `type` field takes no part in validation — it is deprecated; the loader detects types automatically from the declared fields):

**Install time (intercepted before extracting into `{userData}/plugins/<id>/`):**
1. **Missing `plugin.json`** → installation fails (not a valid plugin)
2. **Malformed JSON** → installation fails, with an error message
3. **`validateInstallManifest` validation** (pluginId/version/name resolvable) → fails before copying if invalid

**Load time (startup scan + runtime loads):**
1. **File does not exist** → skip that directory, log it
2. **Malformed JSON** → skip, notify the user with a toast
3. **A view plugin missing `entry` / whose entry file does not export a default component** → skip, toast (does not block other plugins)
4. **`minAppVersion` higher than the current version** → skip, marked "needs upgrade"
5. **Duplicate plugin with the same name** → the higher version wins, toast notification

A plugin that fails any validation does not block other plugins from loading.

---

## Related

- `04-distribution-format.md` — distribution/installation/version compatibility
- `09-plugin-directory-layout.md` — source directory structure and naming conventions
- [Third-party author journey](../02-Electron架构/E6_插件生态与发布/05-文档与发布/00-第三方作者旅程.md) — the complete path from zero to publication
- `plugin.schema.json` — the JSON Schema file in the same directory (the authoritative version, one of the three-copy gate)
