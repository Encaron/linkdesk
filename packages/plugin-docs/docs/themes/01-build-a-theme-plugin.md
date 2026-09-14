# Build a Theme Plugin — From Scratch to Installed

> **In one sentence: authoring a theme requires no code.** A theme plugin = **one JSON recipe** + **one declaration**. Changing the color scheme means editing that JSON.
>
> **This page is the walkthrough** (I want to build a theme, so let's go from the top); the **deep reference for recipe fields** is in [11-Authoring Themes](https://github.com/Encaron/linkdesk/blob/electron/docs/11-authoring-themes.md) (directory conventions / fully-specified example / pitfalls table), and the **index of fields and variables** is in [02-Theme Field Index](02-theme-field-index.md).

| | |
|---|---|
| Audience | Anyone who wants to build a theme (a colorway pack / a glass style) — human, or a human's AI |
| Form | A tutorial walkthrough (just follow it in order; no components to write at any point) |
| Not | A field dictionary (→ [02-Theme Field Index](02-theme-field-index.md)) · the theme system's internal design (that's shell history; authors don't need it) |

---

## 1. Build Three Mental Models First

| Concept | In one sentence |
|:--|:--|
| **Theme = plugin** | A theme takes exactly the same path as any other plugin: `plugin.json` declaration → bundle → install → marketplace. **It just has no components** (a pure data plugin) |
| **Recipe** | One theme file = one complete appearance recipe. It has two orthogonal axes: **style** (`appearance`) and **colorways** (`colorways[]`) |
| **Sparse override** | **Write only what you want to change; everything else inherits the shell default.** The less you write, the more stable it is — when the shell later adjusts a default, your theme benefits automatically |

**Style and colorway are separated** (the single most important rule of the whole design): to get "1 style base + N colorways", put `colorways[]` in **one recipe** — switching colorways only touches the array items, and the style (radius/glass/font/background) is never re-copied.

---

## 2. The Walkthrough from Scratch (five steps)

### Step 1: Scaffold the Project

```bash
npm create linkdesk-plugin@latest theme-myglass    # kebab-case name
cd theme-myglass
npm install
```

The scaffold already contains `plugin.json` and `src/index.tsx`. **A theme plugin has no use for that component file** — leaving it in does no harm (it's an empty minimal view).

### Step 2: Lay Out the Directory (don't flatten it into the root)

```
theme-myglass/
├── plugin.json              # Declaration (contributes.themes)
├── themes/                  # ← the one and only home for recipe json
│   └── myglass.json
├── assets/                  # Optional: fonts (woff2/ttf) + background images (png/jpeg/webp)
└── resources/               # Metadata assets such as the plugin icon
```

> 🔴 **Recipe json always goes in `themes/`**, never flattened into the plugin root. The reason is practical: themes grow deeper over time (per-surface fine-tuning, i18n, README…), so set up the three slots now and you won't have to move anything later.
> **A minimal theme needs only the `themes/` directory** — a pure colorway theme doesn't even need `assets/`.

### Step 3: Declare It (`plugin.json`)

```jsonc
{
  "pluginId": "theme-myglass",
  "name": "My Glass Theme",
  "version": "0.1.0",
  "contributes": {
    "themes": [
      { "id": "myglass", "label": "My Glass", "uiTheme": "dark", "path": "themes/myglass.json" }
    ]
  }
}
```

| Field | Meaning |
|:--|:--|
| `id` | Theme id (the `id` in the recipe file must **match it**) |
| `label` | The name shown in the theme picker |
| `uiTheme` | `"dark"` or `"light"` — decides which baseline set (dark or light backing) is used |
| `path` | Path of the recipe json relative to the plugin root |

> One plugin **can ship multiple recipes** (write several entries in `contributes.themes`, each pointing at a json). But **one style with multiple colorways** is better merged into a single recipe (`colorways[]`) — that way the theme picker shows **one card with several colorways**, which is tidier than a row of cards.

### Step 4: Write the Recipe (minimal working version)

```jsonc
// themes/myglass.json
{
  "id": "myglass",
  "name": "My Glass",
  "type": "dark",
  "appearance": {
    "radius": { "md": 10, "lg": 16 },
    "glass": { "blur": 16, "saturate": 1.3, "tint": "rgba(255,255,255,0.06)", "opacity": 0.9 }
  },
  "colorways": [
    { "id": "violet",  "name": "Violet",  "colors": { "bg-window": "#0E0B16", "accent": "#8B5CF6" } },
    { "id": "emerald", "name": "Emerald", "colors": { "bg-window": "#0A1410", "accent": "#34D399" } }
  ]
}
```

**Three points you must remember:**

1. **Keys in `colors` = CSS variable names with the `--` prefix stripped** (`--bg-window` → `"bg-window"`) — what you write *is* the variable; there's no second set of names to memorize.
2. **`colorways` is always an array** — even a single colorway goes in as a 1-item array (**there is no other spelling**).
3. Do **not** also write a top-level `colors` — that's the old format; the engine reads only `colorways[]`.

> To get editor completion and validation errors, add a `$schema` line at the top of the recipe pointing at the schema inside the SDK package:
> `"$schema": "./node_modules/@linkdesk/plugin-sdk/schemas/theme.schema.json"` (relative to **your own project root**; this is the only accepted form).

### Step 5: See It

Themes are pure data plugins and have **no "browser preview host page"** — the only way to see the effect is in the real shell:

```bash
npm run dev:real     # Real-device loop: installs into your installed LinkDesk, refreshes as you edit
```

Once installed into LinkDesk: **Settings → Appearance/Themes** shows your theme card; select it and the whole interface changes color/radius/glass together.

Publishing it to others (package → publish, two steps) follows **exactly the same** flow as any other plugin — see steps 8 and 9 of [13-Development Guide](https://github.com/Encaron/linkdesk/blob/electron/docs/13-development-guide.md).

---

## 3. Common Pitfalls

| Pitfall | Explanation |
|:--|:--|
| Recipe json flattened into the plugin root | Always put it in `themes/` (Step 2) |
| Writing a top-level `colors` (with no `colorways`) | The old format is deprecated — the engine reads only `colorways[]` |
| Absolute paths for assets | They all break under `file://` once packaged — **always relative paths** (`assets/...`); the shell resolves them uniformly |
| Copying in every key that can be changed | Sparse overrides are easier to maintain — write only the keys you differ on; anything unwritten inherits the default |
| The theme changes, but only takes effect inside my own plugin | Themes are **global** (shell-level CSS variables); for local overrides use your plugin's own CSS, not the theme domain |

---

## 4. What Else You Get (extra powers for theme authors)

- **Mix-and-match shows up for free**: based on the domains you contribute, your theme automatically appears among the settings page's "mix sources" — **zero extra work for the author**.
- **Data and events**: `window.linkdesk.theme.listRecipes()` returns the recipe list (with preview colors); the `theme:changed` event gives you live wiring.
- **Applying a theme**: `setRecipe` / `setColorway`, or write the `app.theme` config directly.

Method signatures and payloads → [01-Plugin API Contract](https://github.com/Encaron/linkdesk/blob/electron/docs/01-plugin-api-contract.md).

---

## 5. Related Reading

| What you want to do | Read this |
|:--|:--|
| **The index of recipe fields and variables** (the second doc in this folder) | [02-Theme Field Index](02-theme-field-index.md) |
| Recipe syntax deep reference (directory conventions / fully-specified example / full pitfalls table) | [11-Authoring Themes](https://github.com/Encaron/linkdesk/blob/electron/docs/11-authoring-themes.md) |
| The complete path from scratch to publishing | [13-Development Guide](https://github.com/Encaron/linkdesk/blob/electron/docs/13-development-guide.md) |
| I want to draw my own plugin icon / identity art | [06-plugin.json Spec](https://github.com/Encaron/linkdesk/blob/electron/docs/06-plugin-json-spec.md) |
| Field-level authoritative definitions | `theme.schema.json` (`schemas/theme.schema.json` inside the SDK package) |
| The full documentation index | [00-README](https://github.com/Encaron/linkdesk/blob/electron/docs/00-readme.md) |
