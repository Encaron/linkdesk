# How to Build a Settings Plugin

> 2026-08-22 · **2026-09-06 reconciliation with the implementation** (flattened single root + shared controls moved to @linkdesk/ui). **For third-party plugin authors.** Want your plugin to give users a "settings UI"? No shell changes needed — just declare a plugin with `factoryRole: "settings"`. This is **a complete replacement for the entire settings UI**, not one more settings item inside it.

## What this is

**A settings plugin = a whole settings interface.** A plugin declaring `factoryRole: "settings"` coexists with the official settings plugin:

- The user opens settings (`Ctrl+,` / the gear icon) → they land in the UI of the **currently active set** (never switched = the official set)
- Multiple sets can be installed → each settings UI has a **shared area** at the top listing all N sets (including itself); click a set to switch to it
- The active-set choice is **persisted**, surviving restarts

Key mental model: **a settings plugin's UI is just a renderer; the data always lives in one place.** Every set's UI calls the same `window.linkdesk.configuration` API and sees the same data — switching sets only swaps the renderer, the data doesn't move. This isn't a "private vs. public data" distinction, it's about **consistency**: everyone sees the same thing.

## Minimal declaration — three steps in plugin.json

Follow the official settings plugin (= the `plugin.json` in **the settings plugin's own repo**, `Encaron/linkdesk-plugin-settings`; the shipped plugin's source is no longer in the shell repo):

```jsonc
{
  "$schema": "../../public/schemas/plugin.schema.json",
  "name": "Pretty Settings",                 // plugin name — this is what the shared-area button shows (goes through t())
  "version": "1.0.0",
  "icon": "resources/icon.png",
  // omit core — uninstallable; core: true means the UI has no uninstall button (an anti-mistake-deletion flag, not a category)
  "factoryRole": "settings",                // ① the key — declares you are a member of the "settings set" family
  "entry": "src/index.tsx",                 // tab entry (appearsIn.tabBar requires entry)
  "appearsIn": { "iconBar": "bottom", "tabBar": true },
  "tabBehavior": { "singleton": true },     // singleton — switching won't open a duplicate if it's already open
  "contributes": {
    "viewsContainers": {
      "settings": { "title": "Settings", "location": "auxiliarybar" }   // ② view container
    },
    "views": {
      "settings": [
        { "id": "settings", "title": "Settings", "render": "src/views/SettingsView.tsx", "order": 0 }
      ]
    },
    "floatingPanel": { "viewId": "settings" }   // ③ floating panel form (optional)
  }
}
```

All three key declarations are required: **`factoryRole: "settings"`** (puts you in the shared-area candidate list) + **`contributes.views`** (the actual render component) + **`floatingPanel`** (the `Ctrl+,` fallback form).

## Data API shape — everything goes through `window.linkdesk.*`

Settings plugins are **forbidden from `import @src/core/...`** (the plugin communication iron rule + ESLint `noCoreImportInPlugin`). All data is in the public API:

| What you want | Call | Return shape |
|------|------|------|
| All configuration groups | `window.linkdesk.configuration.getConfigurationContributions()` | `[pluginId, { title, properties }][]` (named type `LinkDeskConfigurationContribution`) |
| Merged schema | `window.linkdesk.configuration.getSchema()` | `LinkDeskConfigSchema` — includes `type/default/description/enum/enumDescriptions` + **`uiHint`/`minimum`/`maximum`/`renderHint`/`dependsOn`** (type completions; the basis on which the official controls switch their colors) |
| Read/write/subscribe to configuration | `configuration.get/set/onChange` | the general API, usable by any plugin |
| Settings-page-specific refresh | `configuration.onDidChangeConfiguration(cb)` | config changes → cb(key, value), UI refreshes live |
| Jump to a configuration group | `configuration.consumeSettingsGroup()` / `onRequestSettingsGroup(cb)` | switch groups on open |
| Scroll to a setting | `configuration.consumeScrollToSetting()` / `onRequestScrollToSetting(cb)` | scroll it into position on open |
| Keybindings page data | `window.linkdesk.keybindings.getKeybindings()` | `Keybinding[]` (the data source for the keybindings UI) |
| Theme picker | `window.linkdesk.commands.executeCommand("theme.pick")` | opens the theme QuickPick (two-stage: recipe → colorway) |
| Language picker | `window.linkdesk.commands.executeCommand("workbench.action.selectLanguage")` | opens the language QuickPick |
| Plugin install/uninstall refresh | `window.linkdesk.configuration.onPluginLifecycleChange(cb)` | plugin installed/uninstalled → cb, re-fetch candidates / button disappears |

**The `settings.json` filename constant is part of the data contract.** The official settings plugin's "Open as JSON" button locates the on-disk file like this:

```ts
const dir = await window.linkdesk.path?.appDataDir?.();
const filePath = dir ? window.linkdesk.path.join(dir, "settings.json") : "";
```

The filename is simply `settings.json`, with no shell-side map — copy it as-is.

## Shared controls — `@linkdesk/ui`

A settings UI's shared controls live in the **`@linkdesk/ui`** package (consolidated there — third parties `npm i @linkdesk/ui` and import directly; **`import @src/core/...` is forbidden, and so is `@src/components/...`**); install the version line that **matches the shell** (see [19-component-cheatsheet §2.1](19-component-cheatsheet.md): ui version = shell version) — components and styles are supplied by the shell pool at runtime, so ⛔ **do not import its css from your source**:

`ContextMenu` · `InlineInput` · `SelectBox` · `Toggle` · `ColorPicker` · `FontFamilySelect` · `FilePathInput` · `NumberInput` · `Slider` · `Combobox` · `FormRow` · `SegmentedRadio` · `ThemePicker` · `PluginIcon` · shared hooks (`useDebouncedInput` / `useClipboardKeys`, etc.)

```tsx
import { InlineInput, SelectBox, FormRow } from "@linkdesk/ui";
```

> The official settings implementation (`src/views/SettingsView.tsx`, in the settings plugin's own repo) imports from `@linkdesk/ui` — copy the import line as-is, no extra project configuration needed.

## The composition layer is free-form — same data, laid out however you like

The data API only determines "what data exists"; **the layout is your free play**. Current references:

- **Official settings** (repo `Encaron/linkdesk-plugin-settings`, core:true) = group tree on the left + form on the right + a flat switch bar on top — the only settings set in service right now (the old `settings-demo` reference implementation has been retired; for composing from scratch see approach 1/2 below)
- Your own settings set can be arranged however you like: banner header + card sections (every configuration group = a card, with a role pill row + keycap cards for keybindings) + a bottom-right pill for switching sets — all fine (the design source for form two = the factory-role coexistence mockup `01-形态一形态二-复杂场景图.html`)

Composition dimensions: group navigation / search box / control rendering / "Open as JSON" / the keybindings subpage / banner header / card sections — each of these can be built, skipped, or moved.

## Switching the active set — shared-area buttons + whole-plugin-side set switching

Each settings plugin's top shared area renders **buttons for all N sets (including itself)**, with the active set highlighted. Clicking to switch = **whole-plugin-side set switching** with zero shell changes:

```ts
async function handleSettingsSwitch(targetId: string) {
  await window.linkdesk.factorySlots.setActive("settings", targetId); // ① persist to disk
  if (tabId) {
    // ② tab form: close this set's tab → open the target set (singleton dedup focuses it if it already exists)
    await window.linkdesk.tabs.close(tabId).catch(() => {});
    await window.linkdesk.tabs.create(targetId).catch(() => {});
  } else {
    // ③ floating panel form: switch in place — candidate viewId composite addressing, the shell replaces the panel content compositely
    const target = settingsCandidates.find((c) => c.pluginId === targetId);
    if (target?.viewId) {
      await window.linkdesk.panel.revealFloating(target.viewId, target.pluginId).catch(() => {});
    } else {
      await window.linkdesk.tabs.create(targetId).catch(() => {}); // no floating panel declared → fall back to opening a tab
    }
  }
}
```

The component receives `tabId` in its `{ isActive, tabId }` props (injected by the shell; `undefined` for a floating panel with no tab → takes the floating-panel switch-in-place branch). `settingsCandidates` comes from `factorySlots.list("settings")` — each candidate carries a `viewId` (that set's `contributes.floatingPanel.viewId`, used for composite addressing when switching in place). The optional pluginId on `panel.revealFloating(viewId, pluginId?)` was added later — when two sets with the same viewId coexist, passing pluginId hits the target set precisely.

The number of shared-area buttons is **derived from the live set at runtime** — delete any set → `onPluginLifecycleChange` → re-fetch → the button disappears automatically.

## Approach 1: Copy the official plugin (fastest)

Copy the official settings plugin's directory (repo `Encaron/linkdesk-plugin-settings`) wholesale into your project root and change only:

1. `plugin.json` — `name`/`description`; **remove `core: true`** (otherwise the UI has no uninstall entry point); for new UI copy see the i18n section below
2. Append your own style to `src/views/SettingsView.css` — **but override rules must hang off your own root class**, see "🔥 CSS scoping iron rule" below

The official settings plugin has **zero `@src/core` imports** (two historical `@src/core` dependencies were eliminated along the way: `getFilePath` → self-derived from `path.appDataDir`; `useConfigurationIpc` → calls `window.linkdesk.configuration.*` directly), so a copy is self-contained.

## Approach 2: Compose from scratch (an entirely different canvas)

Don't copy the official settings plugin's component structure — **the components depend only on the data API + `@linkdesk/ui` shared controls, and the layout is entirely yours**: banner header, card grid, role pill row, keycap cards for keybindings, a floating pill in the bottom-right — arrange them however you want (data API shapes in the table above, controls in the "Shared controls" section).

> Reference path: `src/views/SettingsView.tsx` in the official settings plugin repo is a minimal settings-set skeleton; for an entirely different canvas, write your own `SettingsView.tsx` from scratch and point `contributes.views[].render` at it.

## 🔥 CSS scoping iron rule

**Two settings sets' CSS is injected into the same Pool document.** If your override rules use bare shared classes (e.g. `.settings-form .settings-row`, `.settings-role-switch--gen`), they will fight the official set's rules of the same kind — last injected wins, and the official set gets polluted by your styles (bug 2 measured on real hardware: the demo's card bubbles leaked into the official set — the lesson still stands).

The structural fix = **your own dedicated root-class namespace** (use your own pluginId, e.g. `.my-settings`):

- Put a dedicated class on the root element (`.my-settings`) and hang every override/rule you add off it: `.my-settings .settings-row { ... }`
- Rules then match only your own subtree → the official set is unaffected; and you get "style self-containment" for free (whether the official set's CSS loads or not doesn't affect you)
- Prefix your own new component classes too (`.ms-*`); don't use bare names (`.keycap` must also hang off `.my-settings .keycap`)

## New i18n copy (the i18n audit gate)

New UI copy goes through `t("<original Chinese text>")`; the i18n audit in `npm run check` requires **every new key to have an English translation**, otherwise it goes red. A settings plugin just declares its translation file in `contributes`:

```jsonc
"contributes": {
  "i18n": { "en": "i18n/en.json" },
  // ...
}
```

`i18n/en.json` = `{ "中文原文": "English" }` (zh isn't needed — Chinese keys have a built-in fallback).

## Verification

- `npm run check` all green (tsc + ESLint zero warnings + vitest)
- On real hardware: run `npm run dev` in **your own project root** (or build a zip and install it into `{userData}/plugins`) → restart → the icon bar shows up → open settings → the shared area shows the new button → click to switch → persistence survives a restart
- Uninstallable and reinstallable (uninstallable ⇒ reinstallable = the very definition of plugin-ness)

> Reference implementation: repo `Encaron/linkdesk-plugin-settings` (the core:true official settings set, whose UI has no uninstall entry point).
