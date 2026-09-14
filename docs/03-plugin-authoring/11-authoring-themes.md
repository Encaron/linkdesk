# 11-Authoring Themes (third-party theme plugin author guide)

> **Status:** final (2026-08-23) — the schema is frozen ([05](../02-Electron架构/E5.8_归一化基建/外观主题化/05-主题数据模型.md) decisions A-F).
> **In one line:** a theme = a kind of plugin — one recipe json (style domain + colorway variants) + optional assets; a "domain contributor" inherits the default for any domain it leaves out, so the less you write the more stable it is.
> **AI-friendliness:** the readers of this doc = **humans + AI** — an AI reading it can produce valid theme files, and an AI reading an example theme (such as the migrated mint-soda) can imitate equivalents. Every schema concept has exactly one way to be written (decision F: always `colorways[]`).
> **2026-09-06 reconciliation with the implementation** (audit): flattened single root (no plugins/{builtin,user}) · shared controls via @linkdesk/ui · distribution = .linkdesk-plugin zip. References to the corresponding mechanisms have been removed from this page.

## 1. What a theme plugin is

- A theme is a **plugin** (hard constraint 10: the shell hard-codes no plugin id; themes also go through a plugin.json declaration).
- One theme plugin = 1 recipe json (`appearance` style domain + `colorways[]` colorway variants). It may also contain multiple recipe json files.
- **Domain contributor**: write only the domains you own; the rest inherit the shell defaults ([03 Domain Contributors](../02-Electron架构/E5.8_归一化基建/外观主题化/03-域贡献者与混搭.md)) — a pure-color theme = colors only; a glass theme = glass + colors.
- **Style vs. colorway separation**: if you want "1 style base + N colorways" → put `colorways[]` in one recipe ([05 §2](../02-Electron架构/E5.8_归一化基建/外观主题化/05-主题数据模型.md) for the complete schema).

## 2. Writing a theme (create the directories first → three steps)

### ⓪ Directory structure (must-read — flattening into the root is forbidden)

A theme plugin's directories = three slots, each holding its own kind (aligned with the general convention in [09-plugin-directory-layout](09-plugin-directory-layout.md)):

```
theme-myglass/
├── plugin.json              # declaration (contributes.themes)
├── themes/                  # the only home for recipe json — flattening into the plugin root is forbidden
│   └── myglass.json
├── assets/                  # assets: fonts (woff2/ttf) + background images (png/jpeg/webp)
│   ├── MyFont.woff2
│   └── bg.png
└── resources/               # plugin icon and other metadata assets (09 §general convention)
```

| Directory | What goes in it | Rule |
|:--|:--|:--|
| `themes/` | recipe json (`appearance` + `colorways[]`) | **recipe json always goes here; flattening into the plugin root is forbidden**; one plugin may contain multiple recipe json files (each `contributes.themes` entry's `path` points at one) |
| `assets/` | fonts (woff2/ttf) + background images (png/jpeg/webp) | write relative paths `assets/...` in the json → resolved uniformly by the shell's `getPluginAssetPath(pluginId, path)` (hard constraint 12); **absolute paths `/assets/...` are forbidden** |
| `resources/` | plugin icon and other metadata assets | consistent with the general convention in [09-plugin-directory-layout](09-plugin-directory-layout.md) |

> **Why flattening is forbidden:** themes only get deeper — per-surface fine-tuning json, i18n, README, src (if scripts/UI are needed) all land in the plugin directory over time. A flat root = every future file needs a last-minute decision about where it goes; with the `themes/`+`assets/`+`resources/` three slots set up first, **each kind of customization has its own home and extensions need zero moving** (2026-08-23 user decision: "there are definitely going to be more things to customize in themes down the road, so it has to be easy to get into theme authoring").
>
> **A minimal theme = just the one directory, `themes/`** (a pure-color theme pulls in no assets and can skip even `assets/`); only fonts/background images need `assets/`.

### ① plugin.json declaration

```jsonc
// plugin.json — theme declaration goes through contributes.themes (modeled on VS Code; authoritative schema in plugin.schema.json)
{
  "id": "theme-myglass",
  "name": "My Glass Theme",
  "version": "0.1.0",
  "contributes": {
    "themes": [
      { "id": "myglass", "label": "My Glass", "uiTheme": "dark", "path": "themes/myglass.json" }
    ]
  }
}
```

### ② Recipe json (referencing the schema)

```jsonc
// themes/myglass.json — contract = theme.schema.json (the contract ships with @linkdesk/plugin-sdk = the author's npm channel)
// Recommended: inject $schema on the first line for editor IntelliSense (modeled on plugin.schema.json):
//   "$schema": "./node_modules/@linkdesk/plugin-sdk/schemas/theme.schema.json"
//   ↑ this is the only form (relative to **the plugin's own project root**). Official theme plugins also
//     live in their own repos with the same project shape as third parties; the in-repo
//     "../../../public/schemas/…" relative form **became void when the source moved out**.
// Malformed-input interception: editor IntelliSense + the SDK's validateThemeJson (the same channel for npm projects and the official plugin repo)
// Full schema in [05 §2](../02-Electron架构/E5.8_归一化基建/外观主题化/05-主题数据模型.md); the runtime parseThemeRecipe toast is the second line of defense
{
  "id": "myglass", "name": "My Glass", "type": "dark",
  "appearance": {
    "radius": { "md": 10, "lg": 16 },
    "glass": { "blur": 16, "saturate": 1.3, "tint": "rgba(255,255,255,0.06)", "opacity": 0.9 },
    "font": { "ui": "assets/MyFont.woff2", "mono": "JetBrains Mono" },
    "background": { "image": "assets/bg.png", "opacity": 0.85, "mask": 0.3 }   // mask = 0-1 brightness coefficient (number); the base color goes through maskColor separately
  },
  "colorways": [
    { "id": "violet", "name": "Violet", "colors": { "bg-window": "#0E0B16", "accent": "#8B5CF6" } },
    { "id": "emerald", "name": "Emerald", "colors": { "bg-window": "#0A1410", "accent": "#34D399" } }
  ]
}
```

> **A single-colorway theme** = a `colorways` array with exactly 1 item (e.g. the official dark theme after migration = `colorways: [{ id:"dark", name:"Dark", colors:{…} }]`) — **there is no second way to write it** (decision F).

### ③ Assets (optional)

- Fonts/background images live in the plugin directory and are referenced by **relative paths** in the json (`assets/...`) — at render time the shell resolves them uniformly with `getPluginAssetPath(pluginId, path)` (hard constraint 12). **Writing absolute paths like `/assets/...` is forbidden.**
- Fonts come in two forms: ① an asset path (distributed with the plugin) ② a system font-family name string (already present on the user's machine).

### ④ Fully-loaded example (all six domains written + assets + 3-4 colorways — the "almost everything is themeable" template)

> Authors who want to write every themeable domain in one go can copy this. **Style (the six appearance domains) and colorways are separated** — switching a colorway only touches array items; all assets are relative paths. The template comes from the shell's built-in liquid glass recipe.

```
theme-liquid-glass/
├── plugin.json              # contributes.themes declaration
├── themes/
│   └── liquid-glass.json    # fully-loaded recipe (all six domains written + 3 colorways)
├── assets/                  # assets: fonts + background images
│   ├── SpaceGrotesk.woff2   # font.ui asset font
│   ├── JetBrainsMono.ttf    # font.mono asset font
│   └── aurora.jpg           # background.image asset
└── resources/
    └── icon.svg             # plugin icon
```

```jsonc
// themes/liquid-glass.json
{
  "id": "liquid-glass",
  "name": "Liquid Glass",
  "type": "dark",
  "appearance": {
    "radius": { "xs": 2, "sm": 4, "md": 8, "lg": 14, "xl": 20, "2xl": 24 },
    "glass": { "blur": 20, "saturate": 1.8, "tint": "rgba(14,16,24,0.38)", "opacity": 0.9, "specular": 0.6, "morph": 400, "radius": 14, "shadow": true },
    "font": { "ui": "assets/SpaceGrotesk.woff2", "mono": "JetBrains Mono" },
    "background": { "image": "assets/aurora.jpg", "opacity": 1, "mask": "rgba(0,0,0,0.88)" }
  },
  "colorways": [
    { "id": "aurora", "name": "Aurora Violet", "colors": { "bg-window": "#0E0B16", "accent": "#8B5CF6" } },
    { "id": "emerald", "name": "Emerald",   "colors": { "bg-window": "#0A1410", "accent": "#34D399" } },
    { "id": "ocean",  "name": "Deep Ocean",   "colors": { "bg-window": "#0B121E", "accent": "#38BDF8" } }
  ]
}
```

| Domain | How to write it | Notes |
|:--|:--|:--|
| radius | six size steps | `--radius-pill`/`--radius-full` form values are not written here (excluded from the scale, [08 §3](../02-Electron架构/E5.8_归一化基建/外观主题化/08-持久化与配置.md)) |
| glass | material keys + floating form | specular/morph = liquid glass's "specular highlight / response" ([02 §2.3](../02-Electron架构/E5.8_归一化基建/外观主题化/02-变量契约.md) material positioning); radius/shadow = floating corner radius / drop shadow (merged into glass after the surface domain was removed; inset is host-derived and border is not a field) |
| font | ui asset path + mono system family name | asset fonts take two steps: first register the family name with @font-face → then write `--font-ui` |
| background | image asset + opacity + mask | relative path → getPluginAssetPath (hard constraint 12) |
| colorways | style base + N colorways | 3-4 is recommended; a single colorway is still an array with 1 item (decision F) |

> **Sparse and omittable:** the fully-loaded example only means "every domain is written" — missing domains inherit the shell defaults and missing keys within a domain inherit too (§3 sparse override); the less you write, the more stable it is. A pure-color theme = only `colorways` (and can skip even `assets/`).

## 3. Pitfalls

| Pitfall | Explanation |
|:--|:--|
| Recipe json flattened into the plugin root | **Forbidden (§2 ⓪ directory spec)** — always put it in `themes/`; future i18n/README each get their own home |
| Writing a top-level `colors` (no `colorways`) | **The old format is deprecated** (decision F) — the engine reads only `colorways[]`; even a single colorway goes in an array with 1 item |
| Writing absolute paths | Everything blows up under packaged `file://` — always relative paths + getPluginAssetPath |
| Repeating every color | Sparse override = write only the differing keys; unwritten ones inherit `:root`, which is more stable |
| Wanting to break free of the accent color | Use **your own token** (e.g. `--toggle-on-bg`) instead of reading `--accent` ([04 §6](../02-Electron架构/E5.8_归一化基建/外观主题化/04-两层调节与设置页.md)) |
| Large blur values | `--glass-blur` has a performance ceiling (large-area backdrop-filter is a GPU burden) — the contract will spell out the number ([02 §2.3](../02-Electron架构/E5.8_归一化基建/外观主题化/02-变量契约.md) pending decision) |

## 4. What theme authors get

- Data: `window.linkdesk.theme.listRecipes()` (including colorways/preview colors) — third-party UIs can consume it too ([06 §6](../02-Electron架构/E5.8_归一化基建/外观主题化/06-主题API契约.md) pending decision 3: prefer reusing the general API).
- Applying: `setRecipe`/`setColorway`, or writing the `app.theme` configuration directly.
- Events: `theme:changed` (the payload carries tokens) for live reactions.
- Mix-and-match: your theme automatically shows up among the mix-and-match sources in the settings page according to the domains it contributes (`RecipeMeta.domains`), with **zero extra work for the author** ([10 §2](../02-Electron架构/E5.8_归一化基建/外观主题化/10-混搭设计.md)).

## 5. Migration (existing theme plugins — decision F: zero backward compatibility)

The engine **reads only the new format** (`colorways[]`); the old flat format is no longer read ([05 §5](../02-Electron架构/E5.8_归一化基建/外观主题化/05-主题数据模型.md)). Converting existing theme plugins:

| Plugin | Current state | After migration |
|:--|:--|:--|
| `theme-defaults` | dark.json + light.json (flat colors) | a single recipe json: `colorways: [{id:"dark",…},{id:"light",…}]` |
| `theme-mint-soda` | 4 json (mint-soda/mint-dew/sea-salt-mint/lime-mint) | 1 recipe json = 4 colorways (the theme list shows 1 card; recommended) |
| `theme-twilight-forest` | 4 json (green/purple/sunset/teal) | same as above → 1 recipe, 4 colorways |

Conversion = **pure data editing** (wrapping `colors` in a `colorways[]` array), with no engine changes. After merging, the theme picker list is cleaner (1 card with multiple colorways vs. N cards). **While migrating, also put things in place per the §2 ⓪ directory spec** (json into `themes/`, assets into `assets/`, the old flat structure zeroed out).

## 6. Related

- Authoritative schema: [05-Theme Data Model](../02-Electron架构/E5.8_归一化基建/外观主题化/05-主题数据模型.md)
- Authoritative API: [06-Theme API Contract](../02-Electron架构/E5.8_归一化基建/外观主题化/06-主题API契约.md)
- Theme appearance doc set: [Appearance Theming README](../02-Electron架构/E5.8_归一化基建/外观主题化/README.md)
- General plugin specs: [06-plugin-json-spec](06-plugin-json-spec.md) / [03-contributes-spec](03-contributes-spec.md)
