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
