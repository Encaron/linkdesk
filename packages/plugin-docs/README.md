# @linkdesk/plugin-docs

> **LinkDesk plugin-authoring documentation** — learn to build a plugin from zero. **Offline package**: install it and read locally, no need to browse the repository.

Written for **plugin authors and their AI assistants**. Start with `docs/00-readme.md` — it is a guided entry point that routes by "what do I want to build" and by "which tier am I in" (10 minutes / 30 minutes / 1 day).

## Install

```bash
npm i @linkdesk/plugin-docs
# then read node_modules/@linkdesk/plugin-docs/docs/00-readme.md
```

> It is not a build dependency — **do not add it to your plugin's `package.json`**. Install it when you want to read.

## What's inside

| What you want to do | Read |
|:--|:--|
| Pick your tier (10 min / 30 min / 1 day) | `docs/13-development-guide.md` |
| Know where your plugin lives (Icon Bar / Sidebar / Main Area / Bottom Panel / Status Bar) | `docs/17-region-map.md` |
| Wire regions together (select → switch view → update the status bar) | `docs/18-cross-region-wiring.md` |
| Use the UI parts the shell already provides | `docs/19-component-cheatsheet.md` |
| Add a setting to your plugin | `docs/20-adding-a-setting.md` |
| Build a theme (no code) | `docs/themes/01-build-a-theme-plugin.md` · `docs/themes/02-theme-field-index.md` |
| Look up the API (what can I call) | `docs/01-plugin-api-contract.md` |
| Look up a field | `docs/06-plugin-json-spec.md` · `docs/plugin.schema.json` |

Full index → the documentation index in `docs/00-readme.md`.

**Chinese version** (the maintainer-facing original, mirrored one-for-one): `docs/zh/00-README.md`.

## 🔴 Where the source of truth is (edit the docs there, not here)

```
source   <repo> docs/03-plugin-authoring/**   (English — the author-facing primary)
         <repo> docs/03-插件制造/**            (Chinese — the maintainer-facing original)
  ↓      npm run docs:build  (scripts/generate-plugin-docs.mjs)
output   this package's docs/**  (English at the root, Chinese under zh/)   ← generated, do not hand-edit
  ↓      npm run docs:check  (wired into npm run check)
rule     byte-for-byte comparison against the source (except the link rewrites below)
```

- **Links**: targets that point **outside** the doc trees (the API contract, the toolchain docs, the theme variable contract…) are **absolutized to GitHub URLs** at generation time, so they work from inside an npm package too. In-tree links stay relative.
- So **if you find a documentation problem**: fix it in the repository under `docs/`, not in this package. If the source changes and the package is not regenerated, `npm run check` fails.

## Versions and publishing

This package is the **fifth author axis** (the others: `@linkdesk/contracts` / `@linkdesk/plugin-sdk` / `create-linkdesk-plugin` / `@linkdesk/ui`) — **any content change means a PATCH**, and it is independent of the application version.

```bash
npm publish --registry=https://registry.npmjs.org   # pass the registry explicitly (inside a workspace this package's .npmrc is ignored)
npm run release:mark                                 # record the baseline (verified against the shelf)
```

## License

MIT
