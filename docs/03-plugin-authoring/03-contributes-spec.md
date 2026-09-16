# 03 — Plugin contributes Specification

> 2026-07-24 · full rewrite 2026-08-21 · **2026-09-06 reconciled against the implementation** (the contributes surface carries no directory/distribution semantics; a section-by-section review found zero flattening residue, kept as-is). **The `contributes` field of plugin.json — a plugin declaring "what I can do".** Mirrors VS Code's `package.json` contributes. The shell wires everything up for you — without changing any core code.
> Source of truth: `src/pluginLoader/contributions.ts` (parseContributions — 13 shell-side consumption points) + `electron/plugins/plugin-manifest-loader.ts` (2 main-process consumption points) + `public/schemas/plugin.schema.json` (IDE validation).

---

## 1. Core principles

**A plugin declares → the shell wires it up.** Declare `contributes.configuration` and the Settings Editor gains a group. Declare `contributes.commands` and Ctrl+Shift+P gains an entry.

**The shell is never told what your plugin does.** All the shell knows is "some plugin registered these commands/menus/keybindings/settings" — not "this is a CAD plugin or a map plugin".

---

## 2. All contribution points

> Consumers live in two places: the **shell side** (`parseContributions`, where plugin code runs) and the **main process** (`plugin-manifest-loader`, which scans the disk at startup and rescans the three tables on install/uninstall).

### Shell-side consumers (14)

| Contribution point | Status | Description | Shell consumer |
|------|:--:|------|------|
| `commands` | ✅ | register commands → command palette/context menus/keybindings | CommandRegistry |
| `menus` | ✅ | register menu items → context menus/gear menu/menu bar | MenuRegistry |
| `keybindings` | ✅ | register keybindings | KeybindingRegistry |
| `configuration` | ✅ | register settings → rendered automatically in the Settings Editor | ConfigurationRegistry |
| `configurationDefaults` | ✅ | weak defaults — a value set by the user wins | ConfigurationRegistry |
| `themes` | ✅ | register themes → theme browser/appearance | ThemeRegistry (data loaded asynchronously) |
| `iconThemes` | ✅ | register icon themes → users switch icon sets | IconRegistry |
| `icons` | ✅ | shared icons — plugin A contributes, plugin B references | IconRegistry |
| `languages` | ✅ | register UI language packs | LanguageRegistry (data loaded asynchronously) |
| `titleBar` | ✅ | top bar left/right slot buttons | MenuRegistry |
| `viewsContainers` | ✅ | declare sidebar/panel containers | ViewContainerService |
| `views` | ✅ | register views in a container — any plugin can register in any container | ViewContainerService |
| `floatingPanel` | ✅ | declare that a view can be shown in a shell-internal floating panel (type B) — `viewId` references an already-registered view; without the declaration there is no "Open in Floating Panel" context menu item | declaration addressing → FloatingPanelService |
| `i18n` | ✅ | plugin-bundled translation files | i18nResources (i18next namespace) |

### Main-process consumers (2)

| Contribution point | Status | Description | Consumer |
|------|:--:|------|------|
| `langDefs` | ✅ | **programming language declarations** (ID/extensions/syntax highlighting/LSP) — the main process is the only writer | main-process LangDefRegistry (shell-side registration removed) |
| `fileAssociations` | ✅ | file extension → plugin routing | main-process FileAssociationService (shell-side registration removed) |

### Top-level fields (not contributes, but often mistaken for it)

| Field | Description |
|------|------|
| `statusBar` | **status bar entries — a top-level field**, not contributes.statusBar (mirrors the VS Code status bar extension point that lives outside `contributes.views`) |
| `tabBehavior` | tab behavior (singleton/isFallback/confirmOnClose/identityField) — see `02 §6` |
| `appearsIn` | where the plugin's UI appears (iconBar/sidePanel/tabBar/statusBar) — replaces the old iconLocation/viewRole |
| `requires` | plugin-level activation-order dependency (a string array) — see `02 §4` |
| `factoryRole` | system slot (settings = settings page / marketplace = plugin marketplace) — **fill it in = form two (replacement/slot switching); leave it out = form one (a normal view plugin coexisting)**, see `06 §factoryRole field details`. **Multiple plugins in the same role already coexist**: same-role plugins legally coexist (one-to-many), the default is the first registered in stable order (core:true has no behavioral privilege and does not claim the default), the settings page groups by role + a switch button + the active set occupies the slot, and the active set is persisted and kept across restarts |
| `pluginRole` | load strategy (view/data) — derived automatically when absent, see `02 §2.1` |

### ❌ Non-existent / removed fake points

| Contribution point | Status |
|------|------|
| `cards` | **removed** — CardRegistry was deleted wholesale, and the card workbench is a plugin (hard constraint 3). **Writing it has no effect** |
| `protocols` | **a fake point** — `contributes.protocols` has no consumer. Protocol parsing goes through the `serial.onData` data pipeline + `ProtocolParser` (a whitelisted tool), not through a contributes declaration |
| `aiFunctions` | never implemented |

---

## 3. Contribution points in detail

### 3.1 `contributes.commands` — commands

```json
{
  "contributes": {
    "commands": [
      {
        "id": "cad.importDxf",
        "title": "Import DXF…",
        "category": "CAD",
        "when": "activeEditor == 'cad'"
      }
    ]
  }
}
```

| Field | Required | Description |
|------|:--:|------|
| `id` | ✅ | command ID. Naming: `<pluginId>.<action>`, e.g. `terminal.copy` |
| `title` | ✅ | display name (an i18n key — the original Chinese text) |
| `category` | ❌ | command palette grouping — "CAD" / "Terminal" / "File" |
| `when` | ❌ | context key when condition. Without `when` the command is visible in any context |

**Declaring registers metadata (a placeholder):** `contributes.commands` only registers command metadata (id/title/category/when); **the real handler is registered on the pool side** (pool-side `_poolCommands` wins). A command whose handler was never registered is a no-op when invoked (with a diagnostic warn).

```typescript
// register the real handler on the pool side (when the component mounts)
useEffect(() => {
  window.linkdesk.commands.registerCommand("cad.importDxf", async () => {
    const paths = await window.linkdesk.dialog.openFile({ filters: [{ name: "DXF files", extensions: ["dxf"] }] });
    // ...
  });
}, []);
```

### 3.2 `contributes.menus` — menu items

```json
{
  "contributes": {
    "menus": {
      "editorContext": [
        "cad.importDxf",
        { "command": "cad.exportPdf", "when": "activeEditor == 'cad'", "group": "edit" }
      ],
      "tabContext": [
        { "command": "cad.closeAll", "when": "activeEditor == 'cad'" }
      ]
    }
  }
}
```

**MenuId is an open string (`MenuRegistry` `type MenuId = string`) — a plugin declaring any string makes it a contract, with no shell code needed.** The shell's built-in registration points (the MENU_SLOTS constant table, 14 slots):

| MenuId | Scenario |
|------|------|
| `commandPalette` | the Ctrl+Shift+P command palette |
| `tabContext` | right-click on a tab in the tab bar |
| `panelViewContext` | right-click on the panel tab bar (position/alignment submenu + view visibility list) |
| `editorContext` | right-click in a tab's main content area |
| `extensionGear` | the bottom gear menu (settings/command palette/theme picker) |
| `marketplaceItemGear` | the gear on a marketplace item (enable/disable/uninstall) |
| `menuBar` | the ☰ hamburger menu bar |
| `panel` | merging into the "Panel" group of the menu bar (the shell's own entry has been removed — plugin items with `group:"panel"` are still merged into the menu bar as their own group) |
| `fileContext` | right-click in the file tree |
| `cardContext` | right-click on a card |
| `quickSendContext` | right-click on a quick-send pill |
| `iconBar` | right-click on the icon bar |
| `settingItemGear` | the gear on a setting row (on row hover in the Settings Editor) |
| `viewTitleContext` | right-click on a sidebar view title (collapse/reset position/views in the same group) |

**Menu item fields:**

| Field | Required | Description |
|------|:--:|------|
| `command` | ✅ | command ID — may be an empty string when `children` is present (a parent item executes no command, it expands a submenu) |
| `label` | ❌ | display label — when present it overrides the command title `getCommand(id).title`; required for a parent item (one with no `command`) |
| `group` | ❌ | grouping — items in the same group are clustered together, groups are separated by a divider. e.g. `"navigation"` / `"edit"` / `"delete"` |
| `when` | ❌ | context key when condition |
| `order` | ❌ | sort weight — within a group, smaller comes first |
| `children` | ❌ | nested submenus — **recursion of arbitrary depth** (mirrors VS Code's `SubmenuAction`); children are homogeneous (`children` can nest further `children`) |

**Shorthand:** a bare command-ID string = `{ "command": "<id>" }`

**Nested submenu example (any depth):**
```json
{
  "contributes": {
    "menus": {
      "menuBar": [
        { "command": "", "label": "View", "group": "view", "children": [
          { "command": "cad.importDxf", "group": "view" },
          { "command": "", "label": "Interface", "group": "view", "children": [
            { "command": "cad.togglePanel", "label": "Panel", "group": "view" }
          ] }
        ] }
      ]
    }
  }
}
```

### 3.3 `contributes.keybindings` — keybindings

```json
{
  "contributes": {
    "keybindings": [
      { "command": "cad.importDxf", "key": "ctrl+shift+i", "when": "activeEditor == 'cad'" },
      { "command": "cad.exportPdf",  "key": "ctrl+shift+e", "when": "activeEditor == 'cad'" }
    ]
  }
}
```

| Field | Required | Description |
|------|:--:|------|
| `command` | ✅ | command ID |
| `key` | ✅ | key sequence — `"ctrl+k"` / `"ctrl+shift+p"` / `"ctrl+k ctrl+o"` (a chord) |
| `when` | ❌ | context key when condition |

**⚠️ Track selection (`05 §4`):** only put **non-text keys** in `contributes.keybindings`. Writing text-editing keys such as `ctrl+c` / `ctrl+v` / `f2` here makes the main process's `before-input-event` unconditionally swallow input in every pool text field. The right way to bind text keys / focus-bound keys is a pool-side container `onKeyDown` (DOM focus partitions naturally).

### 3.4 `contributes.configuration` — settings

```json
{
  "contributes": {
    "configuration": {
      "title": "CAD Viewer",
      "properties": {
        "cad.gridSize": {
          "type": "number",
          "default": 10,
          "description": "Grid size (mm)"
        },
        "cad.units": {
          "type": "string",
          "default": "mm",
          "enum": ["mm", "cm", "inch"],
          "enumDescriptions": ["Millimeters", "Centimeters", "Inches"],
          "description": "Units"
        },
        "cad.autoSave": {
          "type": "boolean",
          "default": true,
          "description": "Auto save"
        },
        "cad.showGrid": {
          "type": "object",
          "default": { "enabled": true, "color": "#555" },
          "description": "Grid appearance (object)"
        },
        "cad.exportFormats": {
          "type": "array",
          "default": ["dxf", "stl"],
          "description": "List of exportable formats"
        }
      }
    }
  }
}
```

**Supported types (the full schema):** `"string"` | `"number"` | `"boolean"` | `"object"` | `"array"`

> **Note:** there is no `"integer"` — use `"number"`. `minimum`/`maximum` are supported at runtime but are not declared in the schema yet (the IDE will flag them) — advanced usage is allowed, and loading does not validate.

**Fields:**

| Field | Required | Description |
|------|:--:|------|
| `type` | ✅ | string/number/boolean/object/array |
| `default` | ✅ | default value |
| `description` | ✅ | description — rendered as a hint by the Settings Editor |
| `enum` | ❌ | dropdown options (optional for the string type) |
| `enumDescriptions` | ❌ | option descriptions — one-to-one with enum |
| `uiHint` | ❌ | rendering hint — SettingsView picks the control from the hint (known values include `"color"`/`"fontFamily"`/`"fontSize"`/`"file"`/`"directory"`/`"slider"`/`"segmented"`/`"image"`; it is an open string — an unknown hint degrades to the default rendering for the type). `"segmented"` = a segmented single-select (the ghost dual-track scheme, declared together with `enum` + `enumDescriptions`; the short label = the part of the enumDescription before `—`, the tooltip = the whole line) |
| `group` | ❌ | **a second-level heading inside the group** — keys sharing the same `group` value are rendered under a subheading on the settings page; keys without a `group` stay flat. Declaring a Chinese section name is enough for it to display; heading text goes through i18n (the plugin's `contributes.i18n` provides the translation). Zero shell changes — the shell mechanism works exactly the same for plugin keys |

**Effect after installation:** the Settings Editor's left navigation tree automatically gains a "CAD Viewer" group → the form is rendered automatically on the right — no hand-written settings UI needed.

**Key naming rule:** `<pluginId>.<property>` (**replace the first segment only, leave the stem untouched** — the first segment must be this repo's identity), e.g. `cad.gridSize`, `terminal.baudRate`. The rule is judged at **two levels** — don't conflate them:

| Criterion | Severity | Judged by | What happens |
|:--|:--:|:--|:--|
| A key must **not** fall inside the **host's reserved key ledger** | 🔴 **red (rejected)** | the shell runtime `ConfigurationRegistry` + the SDK leg `linkdesk/no-unowned-config-key` | The declaration **does not take effect** (the key is never registered, never shows up in the settings page) and one `console.error` is emitted. Your plugin **still installs** — what's rejected is this one key, not your plugin |
| A **new** key's first segment must be this repo's `pluginId` | 🟡 yellow (advisory) | the SDK leg (**the runtime does not enforce it**) | The report carries a `suggested` name with only the first segment replaced. 19 legacy keys break this rule (e.g. `files.exclude`); the shell renames and migrates those on its own schedule — **write new keys by the rule** |

The **host reserved key ledger** (`configKeys`) is a **generated** list that ships inside the SDK package ⇒ machine-readable, never guess it:

```
node_modules/@linkdesk/plugin-sdk/schemas/host-reserved.json   →  "configKeys": [ "app.theme", ... ]
```

Every `app.*` key belongs to the host (its settings, appearance and update surfaces). The ledger **also contains retired keys** — names the host once used and then deleted (e.g. `app.themeColorMode`) **do not free up**: an old `settings.json` may still hold a value under that name, and the host's upgrade-time migration still reads it ⇒ taking it over means overwriting the host's **historical data**.

> **Why "taking a host key" is red while "missing your prefix" is only yellow**: taking a host key does **real harm** (it overwrites the host's effective value and can poison internal flag keys such as `app.schemaVersion` — with neither side reporting anything, so what the user sees diverges from how the host actually behaves); whereas "missing the prefix" has 19 counter-examples in the existing corpus, and a hard rule would break those plugins on the spot. Different severity = different tolerance, not "the more important rule is written more strictly".

**Reading settings from a plugin (the plugin communication iron rule — only through `window.linkdesk.configuration`):**
```typescript
const gridSize = await window.linkdesk.configuration.get<number>("cad.gridSize");
// or subscribe to changes
useEffect(() => {
  return window.linkdesk.configuration.onChange<number>("cad.gridSize", (val) => {
    // the user changes the value in the Settings Editor → notified automatically
  });
}, []);
```

### 3.5 `contributes.configurationDefaults` — weak defaults

```json
{
  "contributes": {
    "configurationDefaults": {
      "terminal.baudRate": 115200,
      "terminal.encoding": "utf-8"
    }
  }
}
```

The difference from `configuration`: `configuration` defines **your own** settings. `configurationDefaults` suggests values for **someone else's** settings. A value set by the user wins — a weak default only applies when the user has never set that key.

**Key ownership:** weak-default keys go through the **same ledger** (`host-reserved.json`'s `configKeys`) —

- **You may not suggest a value for a host key** (every `app.*` key is one): the key is rejected and one `console.error` is emitted. Same reasoning as above — that is the host's own settings surface, and dictating its default changes host behaviour.
- Suggesting values for **your own** keys or for **another plugin's** keys is **legitimate** — that is exactly what this mechanism is for (which is also why it does **not** require your prefix: the prefix criterion applies only to the keys in `contributes.configuration`).
- **Two plugins suggesting the same key** ⇒ **not rejected**: both stay on record, the merge takes the **last writer** in registration order, and one `console.warn` names the earlier plugin. That is the only legitimate "one key, several authors" shape — and a value the user set by hand in the settings page always outranks any weak default.

### 3.6 `contributes.themes` — themes

```json
{
  "contributes": {
    "themes": [
      { "id": "my-theme-dark", "label": "My Theme Dark", "uiTheme": "dark", "path": "themes/my-dark.json" }
    ]
  }
}
```

| Field | Required | Description |
|------|:--:|------|
| `id` | ✅ | theme ID |
| `label` | ✅ | display name |
| `uiTheme` | ✅ | `"dark"` \| `"light"` \| `"highContrast"` |
| `path` | ✅ | path to the theme definition JSON file (`appearance` + `colorways[]`) — **relative to the plugin directory** |

The declaration is metadata-only; theme color data is fetched asynchronously at load time. A legacy top-level `themes` field is normalized automatically (see `02 §2.1`).

> **🔥 Recipe JSON contract (now folded into plugin-sdk)**: the recipe file that `path` points to is validated against `theme.schema.json` — inside the repo that is `public/schemas/theme.schema.json` (`npm run check` chains `check-theme-schema.mjs`, and a format error turns the light red with exit 1 on the spot instead of staying silent); for npm authors it is the `schemas/theme.schema.json` shipped with `@linkdesk/plugin-sdk` plus the SDK's `validateThemeJson` (the same schema file, so the rules never drift). At runtime, a `parseThemeRecipe` toast is the second line of defense. Theme files should begin with `"$schema"` pointing at the schema to get editor IntelliSense (for the npm path see [11-authoring-themes](11-authoring-themes.md) §②).

**id naming rule:** the target shape is `<pluginId>.<name>` (**replace the first segment only, leave the stem untouched**), e.g. `theme-pill.pill-bubble`. **One rule covers three ids** — `themes[].id` (recipe), the top-level `id` inside the recipe JSON that `path` points to (recipe), and `colorways[].id` (colorway variant). The severities mirror the key rule above:

| Criterion | Severity | Judged by | What happens |
|:--|:--:|:--|:--|
| An id must **not** fall inside the **host fallback-id ledger**'s **own space** column | 🔴 **red (rejected)** | the shell runtime `ThemeRegistry` + the SDK leg `linkdesk/appearance-ownership` | The id **is not registered** (the recipe/colorway is simply absent, so users never see it in the picker) and one `console.error` names the fallback id it collided with. Your plugin **still installs** — what is rejected is this one id, not your plugin |
| A **new** id's first segment should be this repo's `pluginId` | 🟡 yellow (advisory) | the SDK leg (**the runtime does not enforce it**) | The report carries a `suggested` name with only the first segment replaced. The official theme repos still declare 25 ids that break this rule (`mint-soda`, `kraft`, …); the shell renames and migrates those on its own schedule — **write new ids by the rule** |
| Two recipes of the **same** plugin sharing one **colorway** id | 🟡 yellow + logged | the SDK leg | The shell's contract is that a **colorway id is globally unique** — a cross-recipe duplicate shows up as duplicate entries in the colorway dropdown |

The **host fallback-id ledger** ships inside the SDK package and is **split by space** (recipes and colorways are **two namespaces**: `mint-soda` can be both, so the comparison stays **inside the column**, never across):

```
node_modules/@linkdesk/plugin-sdk/schemas/host-reserved.json
  → "appearanceRecipeIds":   ["dark", "light"]                ← recipe column
    "appearanceColorwayIds": ["dark-fallback", "light"]       ← colorway column (note: the colorway fallback is dark-fallback, not dark)
    "appearanceIdGrants":    { "light": ["theme-defaults"] }  ← the exception: who holds that id by grant
```

A fallback id is the layer that keeps **the app rendering after every theme plugin is uninstalled**, so taking one over means taking over the host's fallback surface. **`appearanceIdGrants` is not an allowlist** — it records, **per id**, who holds it: `light` carries a grant because the official theme repo is the *implementer* of the host's light fallback; your plugin is not in that table (and cannot add itself — it is a shell-side public-surface decision) ⇒ it is always judged red.

> **Why "taking a fallback id" is red while "missing your prefix" is only yellow**: taking a fallback id does **real harm** (it takes over the host's fallback surface, so themes break once the plugins are uninstalled); whereas "missing the prefix" has 25 counter-examples in the existing corpus, and a hard rule would break those theme repos on the spot. Different severity = different tolerance, not "the more important rule is written more strictly".

**Two plugins declaring the same id:** the shell keeps the **first registrant** — the later id **cannot be registered** and one `console.error` names both sides (who arrived first, who was rejected). This is not the same as taking a fallback id: neither side touched the host's names, but **one name has room for one owner only**, so prefixing your own name is what keeps that day from arriving.

### 3.7 `contributes.iconThemes` — icon themes

```json
{
  "contributes": {
    "iconThemes": [
      { "id": "my-icons", "label": "My Icons", "path": "icons/icon-theme.json" }
    ]
  }
}
```

Mirrors VS Code's `productIconThemes`. Same fields as themes (id/label/path). **The mappings JSON has two forms** — each entry picks one:

```json
{
  "files": {
    "readme.md": { "class": "codicon codicon-markdown" },
    "main.rs":  { "class": "myfont myfont-rust", "color": "#dea584" },
    "logo.svg": { "imagePath": "icons/logo.svg" }
  },
  "extensions": { ".ts": { "class": "codicon codicon-typescript" } },
  "folders":   { "src": { "class": "codicon codicon-folder" } },
  "foldersExpanded": { "src": { "class": "codicon codicon-folder-opened" } }
}
```

| Form | Fields | Rendering | Description |
|------|------|------|------|
| **font glyph** | `class` (required) + `color?` (optional) | `<span>` | a monochrome/colored font glyph (seti/material are this kind, one color per icon); a custom font goes through `@font-face` (see the `font` section below) |
| **image asset** | `imagePath` | `<img>` | any multi-color artwork (skeuomorphic/textured); a relative path is resolved by the shell at load time into the absolute `linkdesk://{pluginId}/{path}` URL (zero parsing burden on the consumer) |

Both forms can be mixed in one theme. **The picker = the `app.iconTheme` setting** (declared by the shell, default `"default"` = built-in codicon fallback, so the system works even with zero icon-theme plugins; the enum = registered icon themes + default, refreshed dynamically on install/uninstall). Switching is broadcast through the `iconTheme:changed` event (payload + contract in the `01-plugin-api-contract.md` §3.2 shell broadcast event table) — **plugins that need a custom file-icon visual subscribe and apply it themselves**.

**Optional top-level `font` section (custom icon fonts)** — declare it when a `class` references a glyph from a custom font; the shell generates the @font-face broadcast into the pool + injects the glyph class CSS, so the author carries zero @font-face burden:

```json
{
  "font": {
    "path": "icons/fonts/my-icons.woff2",
    "family": "my-icons",
    "glyphs": "icons/my-icons.css"
  },
  "files": { "main.rs": { "class": "my-icons my-icons-rust", "color": "#dea584" } }
}
```

| `font` field | Type | Description |
|------|------|------|
| `path` | string (required) | relative path to the font asset (or an absolute URL) — the shell resolves `linkdesk://` + generates `@font-face` |
| `family` | string (required) | font family name — this is what the `font-family` in the glyph CSS writes |
| `glyphs` | string (optional) | relative path to the glyph class CSS file (`@font-face` must **not** be written inside it — the shell already generates it; write only `.my-icons-x::before{content:"…"}`) |

No `font` section → zero custom fonts (codicon fallback / a pure image-asset theme). Font injection is transparent to consumers (handled by the preload mechanical layer), no manual subscription needed.

**Top-level default icon five keys (aligned with VS Code's iconTheme top-level keys)** — when the mapping tables (files/extensions/folders/foldersExpanded) do not match, the theme default is used instead of the codicon fallback; entries use the same two forms:

```json
{
  "file": { "imagePath": "icons/material/file.svg" },
  "folder": { "imagePath": "icons/material/folder.svg" },
  "folderExpanded": { "imagePath": "icons/material/folder-open.svg" },
  "rootFolder": { "imagePath": "icons/material/folder-root.svg" },
  "rootFolderExpanded": { "imagePath": "icons/material/folder-root-open.svg" }
}
```

> **🔥 mappings JSON contract (established — icon-theme.schema.json rewritten to align with the engine's normalizeIconThemeMappings)**: the mappings file that `path` points to is validated against `icon-theme.schema.json` — inside the repo that is `public/schemas/icon-theme.schema.json` (`npm run check` chains `check-theme-schema.mjs`, which also scans `contributes.iconThemes`); for npm authors it is the `schemas/icon-theme.schema.json` shipped with `@linkdesk/plugin-sdk` plus the SDK's `validateIconThemeJson` (the same schema file, so the rules never drift). A runtime parse failure with warn/toast is the second line of defense. Files should begin with `"$schema"` pointing at the schema to get editor IntelliSense.

**id naming rule:** an icon-theme id is judged on **one thing only** — it must **not** be the host fallback id `default` (red: the id is not registered, plus one `console.error`). The "carry your repo prefix" criterion is **not applied here**: an icon-theme id is **shown verbatim in the settings page** (the picker renders the id text), so renaming it would change user-visible text ⇒ it stays as it is. If you want it to read better in the dropdown, change the `label` (display name), not the id.

```
  → "appearanceIconThemeIds": ["default"]   ← icon-theme column (this is its only entry)
```

### 3.8 `contributes.icons` — shared icons

```json
{
  "contributes": {
    "icons": {
      "stm32-chip": {
        "description": "STM32 chip icon",
        "default": { "fontPath": "icons.woff", "fontCharacter": "\\e001" }
      }
    }
  }
}
```

Plugin A contributes, plugin B references (`"icon": "stm32-chip"` + `"iconSource": "shared"`).

**id naming rule:** the **keys** here *are* the shared icon ids (plugin A contributes, plugin B references) ⇒ prefix them with your repo identity: `<pluginId>.<name>` (🟡 advisory, reported by the SDK leg). The host has no fallback shared icons ⇒ this family has **no red**; but when two plugins declare the **same key**, the later one **cannot be registered** and one `console.error` names both sides (the same arbitration as recipes and colorways).

### 3.9 `contributes.languages` — UI language packs
 + `contributes.i18n` — plugin-bundled translations

**Two translation pipelines — don't mix them:**

| Pipeline | Declared in | Purpose | Example |
|------|------|------|------|
| **UI language pack** | `contributes.languages` | switches the language of the whole UI (global) | Chinese/English/Japanese |
| **plugin-bundled translations** | `contributes.i18n` | multilingual translations of this plugin's own text (files declared per language code) | `{ "en": "i18n/en.json" }` |

```json
{
  "contributes": {
    "languages": [
      { "id": "zh", "label": "中文", "path": "lang/zh.json" },
      { "id": "en", "label": "English", "path": "lang/en.json" }
    ],
    "i18n": { "en": "i18n/en.json" }
  }
}
```

- In `contributes.i18n` the key = a language code and the value = the path to a JSON translation file (key = the original Chinese text, value = the translation). **No zh.json is needed** — Chinese keys fall back to themselves.
- Translation files are loaded through `fetchPluginDataFile` (bypassing the Vite glob cache — JSON in a newly installed plugin directory is discovered in real time).
- The plugin text iron rule: **all UI text goes through `t()`**, and the i18n key is the original Chinese text (`05 §6`).

### 3.10 `contributes.titleBar` — top bar buttons

```json
{
  "contributes": {
    "titleBar": {
      "right": [
        { "command": "myPlugin.openPanel", "icon": "codicon-graph-line", "when": "myContext" },
        { "command": "myPlugin.runTask", "label": "Run task" },
        { "command": "myPlugin.showStatus", "label": "$myPluginStatus", "when": "myStatusVisible" }
      ]
    }
  }
}
```

| Field | Required | Description |
|------|:--:|------|
| `command` | ✅ | command ID executed on click |
| `icon` | ❌ | a codicon icon name or an image path |
| `label` | ❌ | button text — **when present no icon is rendered** (label wins). A text-only button, whose width adapts to the text |
| `when` | ❌ | context key when condition — the button is hidden when it is not satisfied |

Slots: `left` (left side of the title bar) / `right` (right side).

**The two forms of `label`** — distinguished by a **literal prefix**, not by "guessing whether the name looks like a key":

| Syntax | Meaning |
|:--|:--|
| `"label": "Run task"` | **static text**. It is run through `t()` as an i18n key (in this repo an i18n key is the original Chinese text), and the translation is provided in the plugin's i18n file (§3.9) |
| `"label": "$myPluginStatus"` | **dynamic text**. What follows `$` is a context key name — the shell takes that key's **current value** as the text, so the button text switches with the key's value (mirrors the idea behind VS Code's `${...}`) |

⚠️ **The dynamic text key is maintained by you**, through `linkdesk.contextKey.set("myPluginStatus", "…")`; when the key does not exist the button displays the literal `$myPluginStatus` (**deliberately conspicuous** — a silent blank is the hardest thing to debug).

⚠️ **The `$` prefix is mandatory:** in this repo i18n keys are not always Chinese (keys such as `EN`/`JSON`/`workspace`/`settings` under an English UI are pure ASCII), so "is this name a live context key?" cannot be determined reliably — without the prefix, another plugin registering a context key with the same name would **silently override** your button text.

⚠️ **The dynamic text value is also an i18n key**: what you `set` should be the original Chinese text (e.g. "运行中"), and the shell still runs it through `t()` ⇒ the English UI follows along. Stuffing a finished translation in directly would bypass the translation layer.

### 3.11 `contributes.viewsContainers` + `contributes.views` — view containers

> **Full API documentation: `08-view-container-api.md`** (including the titleActions declaration system, panel.reveal, and runtime metadata updates). Only the field summary is given here.

**viewsContainers — declaring sidebar/panel/main-area channels:**

```json
{
  "contributes": {
    "viewsContainers": {
      "explorer": {
        "title": "Explorer",
        "location": "sidebar",
        "hideIfEmpty": false
      }
    }
  }
}
```

| Field | Required | Description |
|------|:--:|------|
| `title` | ✅ | the name shown in the sidebar header |
| `location` | ❌ | `"sidebar"` \| `"panel"` \| `"auxiliarybar"` \| `"main"`. Defaults to `"sidebar"` (sidebar = left / auxiliarybar = right / panel = bottom panel tab bar / main = the main-area tab render surface — contributed only by active factoryRole plugins (the marketplace) through `views."main"[]`, and consumed by the shell's ShellViewRenderer when it resolves plugin-detail-style tabs; it requires a matching `viewsContainers."main"` declaration, see `08-view-container-api.md`) |
| `hideIfEmpty` | ❌ | hide the container automatically when it has no active view |
| `order` | ❌ | ordering within the same location. Smaller comes first |
| `icon` | ❌ | overrides the plugin's own icon |
| `mergeHeaderWhenSingle` | ❌ | hide the view header when the container has only one view — the title merges into the container header |

**views — registering content in a container:**

```json
{
  "contributes": {
    "views": {
      "explorer": [
        { "id": "folders", "title": "", "render": "src/views/FoldersView.tsx", "order": 0 },
        { "id": "search", "title": "Search", "render": "src/views/SearchView.tsx", "order": 1 }
      ]
    }
  }
}
```

| Field | Required | Description |
|------|:--:|------|
| `id` | ✅ | unique view ID |
| `render` | ✅ | component module path — **relative to the plugin directory** |
| `title` | ❌ | SidebarSection collapse header title. An empty string = no collapse header rendered |
| `role` | ❌ | `"toolbar"` \| `"section"` — a toolbar sticks to the top and is not overridden by a section |
| `order` | ❌ | ordering inside the container. Smaller is higher |
| `collapsed` | ❌ | initially collapsed |
| `when` | ❌ | context key condition — shown only when satisfied |
| `canToggleVisibility` | ❌ | ✅ implemented — the user can toggle visibility in the panel switcher / the sidebar "Views" submenu |
| `canMoveView` | ❌ | ✅ implemented — the user can drag and drop this view into another container |
| `hideByDefault` | ❌ | ✅ implemented — hidden by default, the user has to turn it on |
| `singleViewPaneContainerTitle` | ❌ | replaces the container title when there is a single view and the container has `mergeHeaderWhenSingle` |
| `titleDescription` | ❌ | secondary text next to the title — e.g. `(5 files)` |
| `showActions` | ❌ | `"always"` \| `"whenExpanded"` \| `"default"` — when the action area is shown |
| `titleTooltip` | ❌ | title hover tooltip — shows the full title when it is truncated |
| `minHeight` | ❌ | minimum drag-resize height (px). Default 100 |
| `titleActions` | ❌ | **the view action area declaration system** — see the subsection below |

**Key feature: any plugin** can register a view in someone else's container:
```json
// Git plugin — registers TIMELINE in file-tree's explorer container
{ "contributes": { "views": { "explorer": [{ "id": "timeline", ... }] } } }
```
The file-tree plugin needs zero changes.

#### titleActions — the action area on the right of a view header

**Mirrors the `[+][🔄][⊟]` on the right of VS Code's view headers / `[+][▾]` in the terminal.** Three widget forms:

| Type | Form | Click behavior |
|------|------|------|
| `icon` | a single icon button | executes `command` |
| `dropdown` | a pure dropdown (chevron) | expands the `items` list; clicking an entry executes its `command` |
| `split` | a main button + dropdown composite | the main button executes `command` (the default action), the chevron on the right expands `items` |

**Widget fields:** `id` (unique), `command` (the command ID executed on click), `args` (optional — passed through as the single positional argument of `executeCommand(command, args)`), `icon` (a codicon class name), `title` (tooltip/aria-label), `items` (dropdown/split alternative entries `{ label, command, args }`). **`label`/`title` are i18n keys (the original Chinese text)**.

```json
{
  "id": "demo-output",
  "title": "Output",
  "render": "src/views/DemoOutputView.tsx",
  "order": 0,
  "titleActions": [
    {
      "type": "split",
      "id": "add-log",
      "command": "panel-demo.addLog",
      "icon": "codicon-add",
      "title": "Add demo log",
      "args": { "level": "info" },
      "items": [
        { "label": "Add info", "command": "panel-demo.addLog", "args": { "level": "info" } },
        { "label": "Add warning", "command": "panel-demo.addLog", "args": { "level": "warn" } }
      ]
    },
    { "type": "icon", "id": "clear-log", "command": "panel-demo.clearLog", "icon": "codicon-clear-all", "title": "Clear output" }
  ]
}
```

**Command registration (the source of truth for executing a titleActions command = the pool-side command registry):**
```typescript
useEffect(() => {
  window.linkdesk.commands.registerCommand("panel-demo.addLog", (args) => { addLine(args.level, args.text); });
}, []);
```
> **`when: "false"` = a purely programmatic command that stays out of the command palette** — titleActions-only commands are declared this way, which keeps them from cluttering Ctrl+Shift+P. The shell's unified renderer `ViewTitleActions.tsx` has two consumers: the panel tab bar (the active view) + the sidebar section collapse header. For a real example see `08 §3`.

### 3.12 `contributes.langDefs` — programming language declarations (main process)

> **The only writer is the main process** `plugin-manifest-loader` (disk scan at startup + rescan on install/uninstall). The shell-side `parseContributions` does not consume it. There is nothing for the plugin to manage on the loading side — just declare it.

```json
{
  "contributes": {
    "langDefs": [
      {
        "id": "python",
        "extensions": [".py", ".pyi"],
        "aliases": ["Python"],
        "monarch": { "tokenizer": { } },
        "lsp": {
          "command": "node",
          "args": ["node_modules/pyright/dist/pyright-langserver.js", "--stdio"]
        }
      }
    ]
  }
}
```

| Field | Required | Description |
|------|:--:|------|
| `id` | ✅ | language ID — e.g. cpp / python / rust |
| `extensions` | ✅ | extension list — e.g. `['.cpp', '.cxx', '.h']` |
| `aliases` | ❌ | aliases — e.g. `['C++', 'C']` |
| `monarch` | ❌ | a Monarch tokenizer definition (Monaco's built-in syntax highlighting) |
| `lsp` | ❌ | LSP language server configuration (command/args) |

> **`command` = an interpreter or executable name** (e.g. `node` / `clangd` / an absolute path), not a script path — the script path goes first in `args`.
> **Relative-path arguments in `args` are resolved against the plugin root** (absolutized once at the registration site) — in the example above `node_modules/pyright/dist/pyright-langserver.js` → `<plugin root>/node_modules/pyright/dist/pyright-langserver.js`; flags such as `--stdio` are passed through as-is. **Ship the LSP binary with the plugin**: run `npm install` in the plugin root first, and when the SDK packages the plugin the referenced `node_modules` packages are bundled into the `.linkdesk-plugin` automatically from the `args` references (the shell no longer ships an LSP; the python plugin is a real example).

### 3.13 `contributes.fileAssociations` — file associations (main process)

> **The only writer is the main process.** The extension is pointed at the shell — the plugin handles opening it itself.

```json
{
  "contributes": {
    "fileAssociations": [
      { "extension": "dxf", "command": "cad.openFile", "displayName": "DXF drawing" },
      { "extension": "stl" },
      { "extension": "step" }
    ]
  }
}
```

| Field | Required | Description |
|------|:--:|------|
| `extension` | ✅ | file extension — **without the dot**, e.g. dxf / stl / step |
| `command` | ❌ | the command ID executed when opening a file with this extension |
| `displayName` | ❌ | the display name in the "Open with…" picker |

> **The `pluginId` is declared by the top-level `pluginId` field** (it must be written explicitly; do **not** write it under `contributes`). When it is not declared it falls back to "the project directory name" — the fallback path is kept only for legacy third-party plugins outside the repo, and **new plugins always declare it explicitly** (directory names and repository names are free-form, so relying on the fallback means your identity drifts with the name, and none of the five consequences reports an error). See [16-naming-conventions](16-naming-conventions.md).

### 3.14 `statusBar` — status bar entries (a top-level field)

```json
{
  "statusBar": [
    { "id": "units", "label": "mm", "align": "right" },
    { "id": "zoom", "label": "100%", "align": "right", "onClick": "cad.zoomFit" },
    { "id": "lock", "icon": "codicon-lock", "configurable": true }
  ]
}
```

| Field | Required | Description |
|------|:--:|------|
| `id` | ✅ | unique identifier |
| `label` | ❌ | display text |
| `icon` | ❌ | a codicon name or an SVG path |
| `align` | ❌ | `"left"` \| `"right"` |
| `onClick` | ❌ | click behavior — a command name |
| `configurable` | ❌ | declare `true` → the shell registers the setting automatically + injects the visible prop. The plugin author writes one line of JSON and zero code |

**Note:** `statusBar` is a **top-level** field, not `contributes.statusBar`. Place the component at `statusBar.tsx` / `src/statusBar.tsx` / `src/components/statusBar.tsx` (the runtime tries all three paths).

### 3.15 `contributes.floatingPanel` — floating panel declarations

> **A shell-internal floating panel (type B)** — the plugin declares that a view can be displayed in a floating panel. The shell resolves the view by declaration addressing (pluginId/renderPath/title), with zero hard-coded plugin IDs (the same consumption style as hard constraints 10/11).

```json
{
  "contributes": {
    "floatingPanel": { "viewId": "settings" }
  }
}
```

| Field | Required | Description |
|------|:--:|------|
| `viewId` | ✅ | **a view ID already registered in contributes.views** — declaration addressing resolves the plugin/renderPath/title |

**Declaring is consuming — four things appear automatically:**

| Effect after declaring | Mechanism |
|------|------|
| "Open in Floating Panel" appears in the tab context menu | declaration-driven — it does not appear when undeclared (filtered by declaration) |
| Three actions inside the panel once it is open (open in main window / maximize / close) | "Open in main window" lands at the end of the currently active group (reusing the file-tree open-placement rule) |
| `linkdesk.panel.revealFloating(viewId)` opens the panel programmatically | panel identity toggle semantics — no panel → open; same view → close; another panel → replace |
| Uninstalling the declaring plugin → the menu item disappears + revealFloating no-ops without crashing | the declaration unloads with the plugin lifecycle |

**The first declarer = settings** (`core.openSettings`, Ctrl+, opens the panel); **the second declarer, used as a validation vehicle = the `floating-panel-demo` test plugin** (a tab-style view; end-to-end validation of replacement + the right-click return path + unload no-op).

---

## 4. Context Key when conditions

The `when` field of menu items and commands uses ContextKeyService expressions:

| Operator | Example | Meaning |
|------|------|------|
| bare key | `portOpen` | a truthy key value → true |
| `!` | `!portOpen` | negation |
| `&&` | `activeEditor == 'cad' && portOpen` | logical and |
| `\|\|` | `activeEditor == 'a' \|\| activeEditor == 'b'` | logical or |
| `==` | `activeEditor == 'cad'` | equals |
| `!=` | `editorCount != 0` | not equals |
| `in` | `activeEditor in ['cad', 'terminal']` | set membership |
| `()` | `!(portOpen \|\| editorCount > 1)` | grouping |

**Available Context Keys (written by the shell):**

| Key | Type | Writer |
|------|------|------|
| `activeEditor` | `string \| null` | on tab switch — the pluginId of the currently focused tab |
| `portOpen` | `boolean` | on serial port open/close |
| `portName` | `string \| null` | on serial port open/close |
| `editorCount` | `number` | on tab add/remove |
| `editorHasSelection` | `boolean` | when the editor has selected text (reserved) |

---

## 5. Full plugin.json example — a CAD plugin (every field aligned with the real consumption surface)

```json
{
  "$schema": "plugin.schema.json",
  "name": "CAD Viewer",
  "version": "1.0.0",
  "icon": "PencilRuler",
  "iconSource": "lucide",
  "description": "DWG/DXF/STL file viewer",
  "author": "Community",
  "entry": "src/index.tsx",
  "appearsIn": { "iconBar": "top", "tabBar": true },
  "tabBehavior": {
    "singleton": true,
    "confirmOnClose": "Unsaved changes will be lost"
  },
  "requires": ["file-tree"],
  "statusBar": [
    { "id": "units", "label": "mm", "align": "right" }
  ],
  "contributes": {
    "i18n": { "en": "i18n/en.json" },
    "commands": [
      { "id": "cad.importDxf", "title": "Import DXF…", "category": "CAD" },
      { "id": "cad.zoomFit", "title": "Zoom to fit", "category": "CAD", "when": "activeEditor == 'cad'" }
    ],
    "menus": {
      "editorContext": [
        { "command": "cad.importDxf", "group": "navigation" },
        { "command": "cad.zoomFit", "group": "view" }
      ],
      "commandPalette": [
        { "command": "cad.importDxf" },
        { "command": "cad.zoomFit", "when": "activeEditor == 'cad'" }
      ]
    },
    "keybindings": [
      { "command": "cad.zoomFit", "key": "ctrl+0", "when": "activeEditor == 'cad'" }
    ],
    "configuration": {
      "title": "CAD Viewer",
      "properties": {
        "cad.gridSize": { "type": "number", "default": 10, "description": "Grid size" },
        "cad.units": { "type": "string", "default": "mm", "enum": ["mm", "cm", "inch"], "description": "Units" },
        "cad.autoSave": { "type": "boolean", "default": true, "description": "Auto save" }
      }
    },
    "viewsContainers": {
      "cad": { "title": "CAD Viewer", "location": "sidebar" }
    },
    "views": {
      "cad": [
        { "id": "layers", "title": "Layers", "render": "src/views/LayersView.tsx", "order": 0 }
      ]
    },
    "fileAssociations": [
      { "extension": "dxf", "command": "cad.openFile", "displayName": "DXF drawing" },
      { "extension": "dwg" },
      { "extension": "stl" }
    ]
  }
}
```

---

## 6. Comparison with VS Code contributes

| VS Code contributes | LinkDesk | Difference |
|------|------|------|
| `commands` | ✅ | same — metadata declaration + a handler registered on the pool side |
| `menus` | ✅ | LinkDesk adds `quickSendContext` / `cardContext` / `viewTitleContext` and more (MenuId is an open string) |
| `keybindings` | ✅ | same — but text keys go through the pool-side onKeyDown (`05 §4`) |
| `configuration` | ✅ | same — the types include object/array |
| `configurationDefaults` | ✅ | same |
| `themes` | ✅ | same |
| `productIconThemes` | ✅ `iconThemes` | same |
| `icons` | ✅ | same (shared icons, iconSource:shared) |
| `languages` (programming languages) | ✅ `langDefs` | consumed by the **main process** — syntax highlighting/LSP |
| `languages` (translation packs) | ✅ `languages` | LinkDesk's `languages` = UI language packs (i18n); VS Code uses the l10n system |
| `views` / `viewsContainers` | ✅ | same + LinkDesk adds the `titleActions` declaration system + visibility/migration/panel.reveal |
| `titleBar` | ✅ | top bar left/right buttons |
| `viewsWelcome` | ⏳ | welcome content — future |
| `fileAssociations` | ✅ | **main process** — VS Code leaves file associations to the operating system, LinkDesk has them built in |
| `extensionDependencies` | ✅ `requires` | a string array (`02 §4`) |
| ~~`activationEvents`~~ | ~~✅~~ | **deleted** (retired, 2026-09-09) — the load model is simplified: register the full metadata set at startup, JS loaded by the pool on demand (`02 §5`) |
| `snippets` / `problemMatchers` | ❌ not planned | shipped by the Monaco/LSP plugins themselves |
| `breakpoints` / `debuggers` | ❌ not planned | debuggers — not needed for now |

---

> **← Previous:** `02-plugin-lifecycle.md`
> **→ Next:** `04-distribution-format.md`
> **→ Related:** `08-view-container-api.md` (the full semantics of views)
> **→ Source of truth:** `src/pluginLoader/contributions.ts` / `public/schemas/plugin.schema.json` (the shape of contributes); theme recipe data = `public/schemas/theme.schema.json`, icon theme mappings data = `public/schemas/icon-theme.schema.json` (theme/icon-theme ship together with `@linkdesk/plugin-sdk`)
> **All documentation index:** `00-readme.md`
