# @linkdesk/ui

The LinkDesk shared UI component library — context menus, dropdowns, combo boxes, toggles, sliders, color pickers, form rows, file path inputs, theme pickers, and more.

The component source lives in exactly one place, `src/components/shared/` in the LinkDesk shell; this package is its compiled distribution surface: **after `npm i @linkdesk/ui`, plugin authors get the same components the built-in plugins use, automatically following the host theme and glassmorphism**, with no need to care about implementation details.

## Installation

```bash
npm i @linkdesk/ui react react-dom
```

## Usage

```tsx
import { SelectBox, Toggle } from "@linkdesk/ui";
import "@linkdesk/ui/index.css"; // most component CSS is pulled in automatically by the entry JS; use this path when you need to import it explicitly

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
- See the LinkDesk shell repository's `docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/07-共享组件独立分发设计.md`.

## Development (inside the LinkDesk shell repository)

```bash
cd packages/linkdesk-ui
npm run build   # dist build: esm + aggregated css + declaration files
```

## Maintaining this package (LinkDesk maintainers)

This package is **one of the five author axes** (the others: `@linkdesk/contracts` / `@linkdesk/plugin-sdk` / `create-linkdesk-plugin` / `@linkdesk/plugin-docs`) and has its own version axis — **publishing it does not bump the application, and the application does not bump it**.

Its surface is `src/**` + this README. The component source lives in the shell's `src/components/shared/` — **changing a component means this axis moved**, so bump and publish, otherwise plugin authors keep getting the old components.

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
