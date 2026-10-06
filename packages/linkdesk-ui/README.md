# @linkdesk/ui

The LinkDesk shared UI component library — context menus, dropdowns, combo boxes, toggles, sliders, color pickers, form rows, file path inputs, theme pickers, and more.

**Centralized UI supply (L9, E6#123/#124):** the component source lives in exactly one place, `src/components/shared/` in the LinkDesk shell, and at runtime the components are served to every plugin by the shell pool as a single vendor instance (import-map + vendor css) — **the shell upgrades once, every plugin follows**. This npm package is the *type contract + dev resolution body*: `npm i @linkdesk/ui` gives your editor types and lets local dev resolve the imports; it is no longer shipped inside your plugin bundle. The package version is locked step with the shell version (one line, no lookup table).

## Installation

```bash
npm i @linkdesk/ui react react-dom
```

## Usage

```tsx
import { SelectBox, Toggle } from "@linkdesk/ui";
// No css import — component styles are supplied by the shell at runtime (importing @linkdesk/ui css is a lint error: linkdesk/no-ui-css-import).

export function MyView() {
  return (
    <Toggle
      checked={checked}
      onChange={setChecked}
      label={{ title: "Enable", description: "Takes effect once enabled" }}
    />
  );
}
```

> 🔥 Styling goes through host CSS variables — there is no need (and no reason) to override theme hex values inside a plugin. i18n strings go through the host language system, and the text inside components is translated by the host.

## Manager views (whole sections, not just single controls)

Some host contributions are not a single control but a **whole manager section**. Those views ship here too, built on the same contracts, so every settings renderer shows the same thing:

- `ManagerView` — the assembly view for the host group that declares `uiHint: "fileAssociationsManager"` (the "default Open With" manager): a "types with multiple handlers" section plus a "browse by plugin" card list. Feed it a `ManagerModel` produced by `buildManagerModel({ plugins, handlersByExt, overrideTable, search })` and an `onPick(exts, pluginId, label)` writer (`pluginId: null` = restore automatic). `contestedGearItems` / `cardGearItems` / `cardRowGearItems` inject gear-menu items — command ids stay yours; omit them and no gear is drawn.
- `PluginCard` — the plugin-card shell (identity + icon, controlled expand, gear menu, disabled state) with an optional `toolbar` slot. The slot renders as **its own row** between the card head and the card body (`.ldk-plugin-card-toolbar`); the card head click is expand/collapse, so never nest interactive controls inside it.
- `CardRow` / `ContestedRow` — the card-body row (extension + state pill + per-row dropdown + gear) and the contested-group row (whole-group dropdown), for when you assemble the sections yourself.
- **One aggregation, no second implementation**: `buildManagerModel` (six row states, same-signature group merging, stale-override detection), `orderRows` / `filterRows` (row order — declaration order preserved verbatim — plus filtering and the hit-reason split via `hitKindOf`), `extractDeclaredExtensions` / `normalizeExt` / `normalizeExtList` / `overrideKeyOf` / `readOverride` / `extLabelHead`, and `isSettingsHiddenHint` / `SETTINGS_HIDDEN_HINTS` (the canonical hidden-slot hint list — a renderer that does not recognise a hint in this list must not draw that row at all).
- Styling of these views is the host's: the class family is `ldk-famgr-*` (shared components never borrow a host plugin's family such as `settings-*`).

**Two supported ways to consume them** — pick either, they are equally first-class:

1. **Take the whole view** (the default skin the official settings plugin uses): `ManagerView` + the shared model + your writer. Zero re-derivation, and your renderer still owns grouping/search/wiring.
2. **Draw it yourself** from the same pieces: keep `buildManagerModel` and lay out `PluginCard` / `CardRow` / `ContestedRow` (or your own markup) however you like — the data surface is all existing contracts, so a renderer can also fetch the data itself.

What you must **not** do is re-implement the row states, the group merging, or the row order/filter rules in your own plugin: they live exactly once, in the helpers above.

## Design constraints

- **Single source, copying forbidden**: this package's `dist/` is a build artifact (the source lives only in the LinkDesk shell repository), and plugins depend on the npm distribution directly; do not fork components into a plugin and maintain them there.
- **Follow the theme**: all components consume host CSS variables, so switching themes in a plugin recolors them automatically.
- See the LinkDesk shell repository's `docs/02-Electron架构/插件生态与发布/01-插件独立构建/07-共享组件独立分发设计.md`.

## Development (inside the LinkDesk shell repository)

```bash
cd packages/linkdesk-ui
npm run build   # dist build: esm + aggregated css + declaration files
```

## Maintaining this package (LinkDesk maintainers)

This package is **one of the five author axes** (the others: `@linkdesk/contracts` / `@linkdesk/plugin-sdk` / `create-linkdesk-plugin` / `@linkdesk/plugin-docs`) and follows the same rule as the rest: **publish when its author-facing content changes** (🟢 2026-10-01 — the 2026-09-19 same-number lockstep with the shell is retired). The version number is this package's own (patch +1 per publish, no relation to the shell version). At shell release time the publish gate checks the *cargo*, not the number: the ui author-face in the shell tree must match the npm release baseline (criterion ⑤ `judgeUiSurfaceSynced`) — drifted ⇒ bump + publish + `release:mark` along with the shell release; identical ⇒ this package stays untouched.

Its surface is `src/**` + this README. The component source lives in the shell's `src/components/shared/`, and at runtime the shell pool serves it (L9 — plugins no longer carry a copy), so **plugins pick up new styles automatically regardless of npm versions**; what this package ships is types + the dev-resolution build. **Changing a component moves the shell tree and this package together** — rebuild and publish when the surface drifts. Which shell a published package was cut from is stamped at build time into `dist/shell-provenance.json` (shell version + short commit + date).

```bash
# 1. bump  packages/linkdesk-ui/package.json  version   (0.x backward-compatible → patch)
# 2. npm run build  (inside the package — dist is what ships)
# 3. publish
npm publish --registry=https://registry.npmjs.org     # 🔴 the registry flag is mandatory — the machine default is a read-only mirror
# 4. record the baseline (run in the LinkDesk repo root)
npm run release:mark
```

> Full procedure + the three measured pitfalls → **`docs/06-发布管理/作者轴npm发版.md`** in the LinkDesk repository.

## License

MIT
