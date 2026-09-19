# 19 — Component Cheatsheet: What UI Parts Does the Shell Provide?

> **This page answers one question:** the buttons, dropdowns, toggles, context menus on screen… **which of them does the shell already give you**? When should you use which?
>
> 🔴 **This page is a "list + selection criteria", not an API manual.** The **single source of truth** for component props, signatures, and defaults is in the package:
> the README and `dist/index.d.ts` under `node_modules/@linkdesk/ui/` (`import` it in your editor and you get completion).
> **This page does not copy the props tables** — copies drift, and that's exactly the second source of truth we want to avoid.

| | |
|---|---|
| Audience | Authors who want to write UI without building their own wheels |
| Form | A cheatsheet (look up one row per "what widget do I want") |
| Not | Props documentation for the components (→ the README / d.ts inside the `@linkdesk/ui` package) · UI conventions (→ [05-UI Conventions](05-ui-conventions.md)) |

---

## 1. When Shared Parts Are **Mandatory** (not a suggestion)

| What you're doing | You must go through | Why |
|:--|:--|:--|
| Context menu | A `contributes.menus` declaration + `<ContextMenu>` (or `window.linkdesk.menu.registerItems`) | Hand-rolling a context menu = violating a hard constraint; and it won't follow the theme / glass |
| Dialog / overlay | `createPortal` to `document.body` (the shared `OverlayPortal` already encapsulates the positioning conventions) | Layering, focus trapping, and window-drag-region conflicts are all handled in there |
| Persisting "remember what the user picked last" | `window.linkdesk.configuration.get/set` | `localStorage.setItem()` is forbidden |
| Letting the user pick a file/directory | `window.linkdesk.dialog.openFile` + `FilePathInput` | Path resolution and asset-path conventions live shell-side |

**In one sentence:** the glass / theme / focus / layering behavior of these controls is **managed centrally by the shell**. Write your own and it won't follow a theme switch — users flipping back and forth between two appearances will notice immediately.

---

## 2. Installing and Importing

```bash
npm i @linkdesk/ui      # Optional — install it when you want your UI to match the built-ins
```

```tsx
import { Button, Toggle, ContextMenu } from "@linkdesk/ui";
// ⛔ Do not import "@linkdesk/ui/index.css" — the shell pool supplies the styles; that line has no business in your source
```

> The package is the build artifact of a **single-source, anti-drift** setup: the shell changes a component → the package changes with it, so "same as the built-ins" is literally the same implementation. It also **does not go into** your `.linkdesk-plugin` bundle (externalized at build time), and at **runtime the shell pool supplies that one instance** — nothing to worry about in terms of size or duplicate copies.

### 2.1 One version line (no lookup table)

The version of `@linkdesk/ui` **equals the version of the LinkDesk shell you installed**. Shell 0.2.13 → package 0.2.13.

- **Which one to install**: look at the **oldest shell** you intend to support and install the matching ui version; `npm i @linkdesk/ui@latest` gets you the newest line. This page keeps no lookup table — the shell maintains that line, and it isn't something you have to track.
- **No need to chase upgrades**: a range like `^0.2.13` picks up later patches on the same line by itself; a shell upgrade won't suddenly break your plugin.
- **When you do have to move**: only when a **new component you want** appears in a higher version — that's a deliberate upgrade on your side, not something you're forced into.

### 2.2 Three promises the shell makes to authors (each backed by a mechanical gate)

| Promise | What it means | Backstop |
|:--|:--|:--|
| **Add-only** | Published component/export names are lifelong commitments: new ones get added, existing ones are never renamed or removed | The shell repo's export-surface snapshot gate (removing one fails the gate) |
| **Behavior changes arrive as new names** | To change behavior, a new prop or a new component name is added; the old name keeps its meaning | Same gate — changing the meaning of an old name counts as a removal |
| **Styles follow the shell** | What a component looks like is the shell's call; upgrades bring the styling along | Styles are supplied by the shell pool (above); your bundle carries no copy that can drift |

> Conversely: **to change appearance, switch components or variant props — don't override `ldk-` class names** (those belong to the host; see [05-UI Conventions](05-ui-conventions.md) §12).

---

## 3. Component List

| Component | What it does | When to use it |
|:--|:--|:--|
| `Button` | Button | Any "click and it happens" action; variants/sizes follow the theme |
| `Toggle` | Toggle switch | Two-state settings (on/off) |
| `Slider` | Slider | Adjusting a numeric range (pair with `inferSliderStep` for the step) |
| `NumberInput` | Numeric input box | Numbers that need precise entry (often sits next to a slider) |
| `SelectBox` | Dropdown (fixed options) | Enumerated values, e.g. units mm/cm/inch |
| `DynamicSelect` | Dropdown (dynamic options) | Options that come from runtime data (serial port list, theme list…) |
| `Combobox` | Type-ahead dropdown | Many options, and users may type their own (custom paths, etc.) |
| `SegmentedRadio` | Segmented radio | 2–4 mutually exclusive short options, clearer than a dropdown (e.g. Left/Center/Right) |
| `FormRow` | One form row (label + control) | When you want the settings-page layout: label on the left, control on the right |
| `StringListEditor` | String list editor (one per row, add/remove) | Path lists / extension lists / marketplace source lists |
| `FilePathInput` | File or directory path input | Picking a path, with a browse button and validation |
| `FontFamilySelect` | Font family picker | Let users choose UI/editor fonts |
| `ColorPicker` | Color picker | Let users pick a color (remember to store it as a config value, don't hardcode it into the component) |
| `ThemePicker` | Theme picker | When you want to list/preview the available themes (usually you can just use the shell's settings page) |
| `MarkdownView` | Markdown rendering (with sanitization) | Showing a README / description / changelog — **the one sanctioned component**; don't pull in your own markdown library |
| `Badge` | Small badge / count | Corner badges like unread counts or installed counts |
| `PluginIcon` | Renders a plugin icon | Showing some plugin's icon (handles codicon / custom svg / colored identity art automatically) |
| `ContextMenu` | Context menu component | Works with `contributes.menus` — see [05-UI Conventions](05-ui-conventions.md) |
| `InlineInput` | Inline input (imperative handle) | Renaming in place in a tree/list (grab the `ref` and call `InlineInputHandle`) |
| `OverlayPortal` | Overlay portal host | Use it when a custom-drawn dialog needs to portal to body; don't scatter bare `createPortal` calls everywhere |
| `HintCard` | Anchored hover hint card (non-interactive) | For "hover a small badge, see a short explanation card": give `lines` (1–3 sentences) and the anchor element; triggering/positioning/glass are all handled by the shell; ⛔ no links or buttons inside the card |

> The list follows the package's actual export surface (`packages/linkdesk-ui/src/index.ts` is the single source of truth) — if this page disagrees with the package, **the package wins**.

---

## 4. Hooks and Utility Functions

| Name | What it does | When to use it |
|:--|:--|:--|
| `useDebouncedInput` | Input debouncing | Computing/searching as the user types (avoid firing heavy work on every character) |
| `useClipboardKeys` | Clipboard shortcuts (three tracks) | When you want copy/paste inside your own widget (text keys go through the container's `onKeyDown` — see doc 05) |
| `useClickPreview` | Single-click/double-click preview distinction | Interactions like "single-click previews, double-click opens" on list items |
| `inferSliderStep` | Infers a slider step from a range | Pair with `Slider` (float ranges automatically get something like a 0.01 step) |
| `urlSourceKey` | Dedup key for URL sources (owner/repo, branch-independent) | When you build your own "add a source" list, the key must match the shell's |
| `FileIconResolver` | File icon resolver | When you want to show file icons (mapped by extension/filename, the same resolver as the shell) |
| `pickIdentityArt` / `DEFAULT_PLUGIN_IDENTITY_URI` | Plugin identity-art arbitration and fallback | Use the same arbitration chain when drawing your own plugin identity art |
| `IconDescriptor` / `ContextMenuProps` / `ManifestIconShape` / `ResolvedIcon` / `InlineInputHandle` | Types | `import type` when you need to annotate types explicitly |

---

## 5. Common Mistakes

| Symptom | Root cause | Do this instead |
|:--|:--|:--|
| After a theme switch my dropdowns/menus still look old | You wrote your own widget set | Switch to the shared parts from `@linkdesk/ui` |
| The context menu won't open / lands in the wrong place | Hand-wiring the `contextmenu` event | `contributes.menus` + `<ContextMenu>` |
| The Title Bar eats half the clicks on my dialog | The overlay sits at `top: 0` and collides with the window drag region | Use the shared overlay component (it already avoids the drag region) |
| User settings don't stick | You used `localStorage` | `window.linkdesk.configuration.set` |
| Two UI libraries installed, styles bleed into each other | You pulled in a third-party component library | Use the shared parts where you can; if you truly need a third party, watch out for style isolation |
| The shell restyled a component but my plugin didn't follow | Your source `import`s `@linkdesk/ui`'s css (baking the styles into your own package) | Delete that line — the shell pool supplies the styles (the SDK's lint leg fails it; see §2) |

---

## 6. Related Reading

| What you want to do | Read this |
|:--|:--|
| UI conventions (context menus / overlays / persistence / the two shortcut tracks / the three clipboard channels) | [05-UI Conventions](05-ui-conventions.md) |
| Which region a component goes in, and how to declare it | [17-Region Map](17-region-map.md) |
| How components wire together | [18-Cross-Region Wiring](18-cross-region-wiring.md) |
| Component props and signatures (source of truth) | the README / `dist/index.d.ts` inside the `@linkdesk/ui` package |
| Every `window.linkdesk.*` method signature | [01-Plugin API Contract](01-plugin-api-contract.md) |
