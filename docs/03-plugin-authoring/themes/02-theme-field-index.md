# Theme Field Index — Where Fields Live, What the Variables Are Called

> **This page does exactly two things: ① it tells you where each field's authoritative definition lives; ② it gives you a "domain → CSS variable" cross-reference.**
> 🔴 **There is exactly one place with authoritative field definitions: `theme.schema.json`** (`schemas/theme.schema.json` inside the SDK package). This page **does not copy the schema** — copies drift.

| | |
|---|---|
| Audience | People already writing recipes who need to look up "what is this key called and which variable does it map to" |
| Form | An index (look it up in a table → jump to the real source) |
| Not | A tutorial (→ [01-Build a Theme Plugin](01-build-a-theme-plugin.md)) · the recipe syntax deep reference (→ [11-Authoring Themes](../11-authoring-themes.md)) |

---

## 1. Top-Level Recipe Fields

| Field | Required | Meaning |
|:--|:--:|:--|
| `id` | ✅ | Recipe id (globally unique; matches `contributes.themes[].id` in `plugin.json`) |
| `name` | ✅ | Display name (the theme picker's title) |
| `type` | ✅ | `"dark"` \| `"light"` — the dark/light baseline |
| `colorways` | ✅ | **The colorway variant array** (a single colorway still goes in as 1 item) — each item is `{ id, name, colors }` |
| `appearance` | ❌ | The style domain (single value, sparse) — missing domains/keys inherit the shell default |

> These are the only 5 top-level fields. The type/enum/description of each field is defined by `theme.schema.json`.

---

## 2. The Four `appearance` Domains → CSS Variable Cross-Reference

### `radius` — eight radius tiers

| Recipe key | CSS variable | Meaning |
|:--|:--|:--|
| `xs` | `--radius-xs` | Scrollbars / toggles / drag indicators |
| `sm` | `--radius-sm` | Inputs / buttons / small badges (**the most used by far**) |
| `md` | `--radius-md` | Settings groups / cards |
| `lg` | `--radius-lg` | Dialogs / floating panels / menus |
| `xl` | `--radius-xl` | Large glassy panels (an engine-scale tier; few shell surfaces consume it today) |
| `2xl` | `--radius-2xl` | The largest panels / background containers |
| `pill` | `--radius-pill` | Pill (`999`) |
| `full` | `--radius-full` | Circle (`50`) |

> Write only the tiers you want to change, e.g. `"radius": { "md": 10, "lg": 16 }`.

### `glass` — glass and floating materials

| Recipe key | CSS variable | Meaning | What to write to turn it off |
|:--|:--|:--|:--|
| `type` | — | The glass recipe (the enum has only `"glass"`); **absent = no glass** | omit the `glass` domain |
| `blur` | `--glass-blur` | backdrop blur in px | `0` |
| `saturate` | `--glass-saturate` | Saturation boost | `1` |
| `tint` | `--glass-tint` | Color laid over the glass surface | `"transparent"` |
| `opacity` | `--glass-opacity` | Opacity of the glass surface (1 = opaque) | `1` |
| `specular` | `--glass-specular` | Top highlight strength (the "sheen" of liquid glass) | `0` |
| `specularColor` | — | Base color of the highlight (white by default; alpha still comes from `specular`) | — |
| `morph` | `--glass-morph` | Morph transition in ms ("responsiveness") | `0` |
| `radius` | — | Floating panel corner radius in px (0 = square, flush to the edge) | `0` |
| `shadow` | (maps to `--shadow-lift`) | Floating shadow on/off | `false` |
| `texture` / `textureOpacity` | (written into the per-surface background family) | Path to a tileable texture asset, and its opacity | omit |

> ⚠️ **Large areas of `blur` are a GPU cost** — the more sparing you are, the smoother things run.

### `font` — fonts

| Recipe key | CSS variable | Value |
|:--|:--|:--|
| `ui` | `--font-ui` | **A system font family name string** (one already present on the user's machine), **or** a relative asset path (`assets/xxx.woff2` — the shell registers an `@font-face` and then uses the family name) |
| `mono` | `--font-mono` | Same as above (monospace font for code/panels) |

### `background` — image backgrounds

| Recipe key | CSS variable | Meaning |
|:--|:--|:--|
| `image` | `--bg-image` | Image path (**relative**; the shell wraps it in `url()`) |
| `opacity` | `--bg-opacity` | Opacity of the image layer |
| `mask` | `--bg-mask` | Mask **lightness coefficient (a number 0–1; 0 = no mask)** |
| `maskColor` | (same as above) | Base color of the mask (black by default) |
| `mode` | — | `"panorama"` (default, one image spread across everything) \| `"zones"` (the same image sliced continuously across window regions) |

> 🔴 **`mask` is a number (0–1), not a color string** — to specify the mask color, use `maskColor`.
> (The fully-specified example in [11-Authoring Themes](../11-authoring-themes.md) once wrote it as `rgba(...)`, which contradicts the schema; that has been corrected.)

---

## 3. `colorways[].colors` — How to Name Color Tokens

**The rule in one sentence: key = CSS variable name with the `--` prefix stripped.** Write `"bg-window"` in the recipe and the shell writes it into `--bg-window`.

**The batch authors change most often** (not the full set):

| Category | Token names |
|:--|:--|
| Background surfaces | `bg-window` · `bg-card` · `bg-input` |
| Text | `text-primary` · `text-secondary` · `text-muted` · `tone-surface-deep` / `tone-ink-on-deep` · `tone-surface-light` / `tone-ink-on-light` |
| Accent | `accent` · `accent-hover` |
| Dividers and borders | `border` · `separator` |
| Icons | `icon-inactive` |
| Status | `status-connected` · `status-disconnected` · `error` · `warning` · `success` |
| Scrollbars | `scrollbar-thumb` · `scrollbar-thumb-hover` |
| Badges | `badge-background` · `badge-foreground` · `badge-text` |
| Overlays | `scrim-dialog` · `scrim-overlay` · `floating-panel-backdrop` · `context-menu-shadow` |

**Where the full set is**: the complete table of the shell's default theme tokens = `:root` in the repo's `src/index.css` (close to a hundred of them).
**Change only a few and write only a few** — anything unwritten inherits the baseline (a light theme inherits the light backing, a dark theme the dark backing).

> ⚠️ **Don't count on changing `--accent` and being done**: some controls deliberately read their own token (a toggle's `--toggle-on-bg`, for example) instead of `--accent` — by design, so they can be decoupled. For precise control, go read the variable that control actually uses.

---

## 4. Assets and Paths

| Kind | Where it goes | How to write it in the recipe |
|:--|:--|:--|
| Fonts | `assets/xxx.woff2` / `.ttf` | `"font": { "ui": "assets/MyFont.woff2" }` |
| Background images | `assets/xxx.png` / `.jpg` / `.webp` | `"background": { "image": "assets/bg.png" }` |
| Textures | `assets/xxx.png` (tileable) | `"glass": { "texture": "assets/paper.png" }` |
| Plugin icon | `resources/icon.svg` | the `icon` field in `plugin.json` |

🔴 **Always relative paths** (relative to the plugin project root). Absolute paths (`/assets/...`) break once packaged — the shell uses one shared asset resolver to turn relative paths into accessible URLs.

---

## 5. Sparse Overrides and Inheritance (this one rule is enough)

```
colorways[].colors    write only the color keys you want to change  →  unwritten keys inherit the baseline
appearance.<domain>   write only the domains you want to change     →  unwritten domains inherit wholesale
appearance.<domain>.<key>  write only the keys you want to change   →  unwritten keys inherit the shell default
```

**The less you write, the more stable it is.** When the shell later adjusts default appearance, themes that wrote little improve automatically; themes that wrote a lot get "stuck on old values".

---

## 6. Source-of-Truth List (when they disagree, these win)

| What you're looking up | Where to go |
|:--|:--|
| The type/enum/description of every recipe field | `theme.schema.json` · `schemas/theme.schema.json` inside the SDK package |
| What variables mean and their defaults (font/radius/glass/background/shadow) | repo `docs/02-Electron架构/E5.8_归一化基建/外观主题化/02-变量契约.md` |
| The data model (the three concepts: recipe / colorway variant / domain) | repo `docs/02-Electron架构/E5.8_归一化基建/外观主题化/05-主题数据模型.md` |
| The theme API and events (`setRecipe` / `theme:changed`) | repo `docs/02-Electron架构/E5.8_归一化基建/外观主题化/06-主题API契约.md` |
| The full table of the shell's default tokens | `:root` in the repo's `src/index.css` |

> All of the above are reachable on GitHub; **inside your plugin project, the only one within arm's reach is `theme.schema.json` in the SDK package** — point `$schema` at it to get editor completion and validation errors.
