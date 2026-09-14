# Plugin Development — Start Here

> 🌐 **Chinese version（维护者面原文）→ [../03-插件制造/00-README.md](https://github.com/Encaron/linkdesk/blob/electron/docs/03-插件制造/00-README.md)** — this English tree is the **author-facing primary**; the two trees mirror each other one-for-one (the `check-author-docs-bilingual` gate enforces it).

> **This directory exists for one purpose: to get plugin authors (and their AIs) from zero to a working plugin, fast.**
> The LinkDesk core is an empty shell; everything is a plugin. **This page is the tour** — pick your entry point by "what I want to do" or "which tier I'm in"; there's no need to read top to bottom.

| | |
|---|---|
| Audience | Plugin developers (not core developers) |
| How to use | Pick an entry point on this page → follow a walkthrough in [13-development-guide](13-development-guide.md) → jump via links when you need details |
| Also | The [documentation index](#documentation-index) at the bottom of this page lists every doc in this directory — look there when you can't find something |

---

## 1. Where to Start

### Pick by "What I want to do"

| What I want to do | Read first | Then |
|:--|:--|:--|
| **Build a minimal plugin** (10-minute tier) | "Three tiers" in [13-development-guide](13-development-guide.md) | Just get it running — `npm create` → `npm run dev` |
| **Build a view plugin** (30-minute tier: get into a region, declare contribution points, use shared components) | [17-region-map](17-region-map.md) | → [the 30-minute tier in 13](13-development-guide.md) → [19-component-cheatsheet](19-component-cheatsheet.md) |
| **Build an advanced plugin** (1-day tier: data pipeline / cross-plugin / Canvas / LSP) | [the 1-day tier in 13](13-development-guide.md) | → [07-plugin-to-plugin-communication](07-plugin-to-plugin-communication.md) · [14-data-pipeline-command-conventions](14-data-pipeline-command-conventions.md) |
| **Build a theme** (no code) | [themes/01-build-a-theme-plugin](themes/01-build-a-theme-plugin.md) | → [themes/02-theme-field-index](themes/02-theme-field-index.md) |
| **Add a setting to my plugin** | [20-adding-a-setting](20-adding-a-setting.md) | → [03-contributes-spec](03-contributes-spec.md) |
| **Make several regions work together** (sidebar selection → main area switch → status bar update) | [18-cross-region-wiring](18-cross-region-wiring.md) | → [07-plugin-to-plugin-communication](07-plugin-to-plugin-communication.md) |
| **Look up the API** (what can I call) | [01-plugin-api-contract §3](01-plugin-api-contract.md) (the entry table for the three API surfaces) | → the SDK package README cheatsheet / `linkdesk.d.ts` |
| **Use the UI parts the shell provides** | [19-component-cheatsheet](19-component-cheatsheet.md) | → [05-ui-conventions](05-ui-conventions.md) |
| **Look up a specific field** | [06-plugin-json-spec](06-plugin-json-spec.md) | → `plugin.schema.json` (IDE completion) |
| **Package / share / list** | [04-distribution-format](04-distribution-format.md) | → [steps 8–9 in 13](13-development-guide.md) |
| **Where to put the project, how to name the repo** | [15-multi-repo-and-local-workspace](15-multi-repo-and-local-workspace.md) | → [16-naming-conventions](16-naming-conventions.md) |

### Pick by "Which tier I'm in"

**The testable version of that claim:** a stranger (or their AI) **asks nobody**, working only from the scaffold output:

| Tier | Goal | Walkthrough entry |
|:--:|:--|:--|
| ⏱ **10 minutes** | Get a **minimal runnable plugin** | [13-development-guide](13-development-guide.md) steps 1–3 |
| ⏱ **30 minutes** | Get a **view plugin** (gets into a region, declares contribution points, uses shared components) | + steps 4–6 + [17-region-map](17-region-map.md) |
| ⏱ **1 day** | Get an **advanced plugin** (data pipeline / cross-plugin / Canvas / LSP class) | + steps 7–9 + [07](07-plugin-to-plugin-communication.md) · [14](14-data-pipeline-command-conventions.md) · [18](18-cross-region-wiring.md) |

> 🔴 **An honest note from the writers**: these three tiers are this directory's **acceptance criteria**, not marketing copy. **If any tier doesn't work end to end, the step you got stuck on is the missing-docs list** — please report it back to us.

---

## 2. What Plugins Can Do

**There is no API allowlist.** Plugins run in the renderer process (all plugins share one renderer process and talk to each other through the shell), and can `import` any JS library and call any Web API — Canvas, WebGL, WebAssembly, WebRTC, Web Audio… the whole Web platform, no restrictions.

System-level capabilities (serial ports, filesystem, configuration, dialogs) are exposed through `window.linkdesk.*` — plugins go through the shell; they cannot call raw Node.js capabilities directly, nor `import` shell-internal source code.

| What you want to build | How | Example |
|------|------|------|
| GPS map | `import` Leaflet / AMap SDK → React component | AMap plugin |
| Serial data parsing | `window.linkdesk.protocol.*` (main-process protocol registry) + `window.linkdesk.serial.onData` data pipeline | SBQ protocol plugin |
| Card visualization | The card workbench is a plugin — `contributes.views` registers views into the card container | Thermometer/waveform cards |
| Code editor | `import monaco-editor` → React component | Monaco editor plugin |
| CAD viewer | `import` Three.js → Canvas/WebGL | CAD plugin |
| Document reader | `import markdown-it` / `<iframe>` | Markdown/HTML reader |
| Logic analyzer | Canvas 2D + `window.linkdesk.serial` | Timing waveform analyzer |
| 3D model viewing | `import` Three.js / Babylon.js | STL/STEP viewer |
| Code intelligence / completion | Speak the LSP protocol or an AI API | clangd / Copilot plugin |
| Icons/buttons | codicon icon set + CSS variables | Any plugin |

---

## 3. Plugin Contribution Types (what you declare = where it shows up)

> The `type` field in `plugin.json` is **deprecated** — the loader auto-detects contribution types from declaration fields such as `entry` / `mode` / `themes` / `languages` / `resources` / `contributes`. **A single plugin can contribute several capabilities at once** (terminal = view + protocol; CAD = view + theme).

| Capability | How to declare it | Where it shows up | Example |
|------|------|------|------|
| **View** (tab) | `entry` + `appearsIn.tabBar` | Main Area tabs | Terminal/map/CAD/editor |
| **Sidebar / Bottom Panel** | `contributes.viewsContainers` + `contributes.views` | Sidebar / Bottom Panel | File tree/output/todo |
| **Status bar item** | top-level `statusBar[]` | Status Bar | Connection status/traffic counter |
| **Title bar button** | `contributes.titleBar` | Title Bar | One-click run |
| **Commands / menus / keybindings** | `contributes.commands` / `menus` / `keybindings` | Command palette / context menu / keybindings | — |
| **Setting** | `contributes.configuration` | The settings page auto-renders a group | → [20](20-adding-a-setting.md) |
| **Settings UI** (a whole replacement) | `factoryRole: "settings"` + `contributes.views` | Several coexist; the user switches | → [10-building-a-settings-plugin](10-building-a-settings-plugin.md) |
| **Theme** | `contributes.themes` | Theme picker | → [themes/01](themes/01-build-a-theme-plugin.md) |
| **Language pack** (UI translation) | `contributes.languages` | Language list | 日本語 / English |
| **Protocol parsing** | the `mode` field + `window.linkdesk.protocol.*` | Main-process protocol registry | SBQ heart-rate protocol |
| **Static resources** | the plugin's `resources/` directory declares relative paths | Shipped with the plugin | STM32 reference manual HTML |

**What each region is, how they relate to each other, and which snippets to copy** → [17-region-map](17-region-map.md).

---

## 4. The Author Toolchain: Four Packages

> Third-party authors write plugins in **their own project root** and never touch the shell repo — from zero to `.linkdesk-plugin` is all npm.

| Package | What it does | When authors install it |
|:--|:--|:--|
| `create-linkdesk-plugin` | Generates a plugin project skeleton in one line (the yo code equivalent) — **and it creates the git repo for you** | `npm create` when starting a new plugin; one-off, not part of the project |
| `@linkdesk/plugin-sdk` | The four author-toolchain commands: `dev` (dev host + HMR) / `build` (→ `.linkdesk-plugin`) / `validate` / `lint`; ships `plugin.schema.json` + `theme.schema.json` + the dev host page | devDependencies of every plugin project |
| `@linkdesk/contracts` | Full TS types for `window.linkdesk.*` (generated contract artifacts — the single source of truth) | **No need to install it yourself** — the SDK depends on it and forwards everything |
| `@linkdesk/ui` | Shared UI parts (buttons/selects/toggles/color picker/context menu…) | **Optional** — install it when you want your UI to look built-in (automatic theme/glass following) → [19-component-cheatsheet](19-component-cheatsheet.md) |

**In one sentence:** `create` generates the project → the project installs `sdk` → `sdk` brings `contracts` (types come along) → `ui` is standalone, installed on demand.
> Version numbers are not pinned on this page — **just install without a version to get the latest**.

**The commands authors actually type:**

```bash
npm create linkdesk-plugin@latest my-plugin   # ① Create the project (once per plugin; auto git init + initial commit)
cd my-plugin && npm install            # ② Install the SDK (types flow into the TS program automatically)
npm run dev                            # Preview: browser dev host → HMR on save
npm run dev:real                       # Real-machine loop: sub-second debugging inside an installed LinkDesk (for real-IPC plugins)
npm run validate                       # Validate plugin.json / theme recipe
npm run build                          # Hand off: my-plugin.linkdesk-plugin (install into LinkDesk / publish)
npm run publish                        # Publish to your own GitHub repo (step one of listing)
```

---

## 5. Zero to Shipped — The Shortest Path

```
1. npm create linkdesk-plugin@latest my-plugin    → generate the project (pluginId / name / author already filled in, git repo created)
2. Write plugin.json + src/index.tsx       → declare your plugin, write the first piece of UI
3. npm run dev                             → see it in the browser preview host
4. npm run build                           → produces my-plugin.linkdesk-plugin (a single-file zip)
5. Install / publish                       → to share: one file does it; to list: see below (two steps)
```

**Listing is two steps — don't stop after the first:**

| Step | What you do | Who can see it afterwards |
|:--:|------|------|
| ① | `npm run publish` — publish to **your own** GitHub repo (Release asset + `marketplace.json` at the repo root) | Only people who manually add your repo as a "marketplace source" |
| ② | **Get your plugin into the official catalog** | **All users with default configuration** ← this step is what "listing" really means |

Full story → [04-distribution-format §Listing Is Two Steps](04-distribution-format.md) · end-to-end journey → [13-development-guide](13-development-guide.md) step 9.

---

## Hard Constraints — Before You Write Any Plugin Code

1. **All colors go through CSS variables `var(--xxx)`**; hardcoded hex is forbidden
2. **All UI text goes through `t()`**; hardcoding display strings to bypass `t()` is forbidden (i18n key = the plugin UI's source text — authors are advised to use their native language: Chinese plugins use Chinese keys, English/French plugins use keys in their own language)
3. **Context menus are declarative** — declare them in `plugin.json` `contributes.menus` + consume them with `<ContextMenu>` (or `window.linkdesk.menu.registerItems`); hand-written context menus are forbidden
4. **Popups render to `document.body` with `createPortal`**
5. **Persistence goes through `window.linkdesk.configuration.get/set/onChange`**; `localStorage.setItem()` is forbidden
6. **Plugins may only use the `window.linkdesk.*` API; `import @src/core/...` is forbidden** (ESLint `noCoreImportInPlugin` blocks it at `error` level — both `.tsx` and `.ts`)
7. **Don't hide content with conditional rendering** — under the keep-alive architecture all tabs stay mounted
8. **The shell doesn't know what your plugin does** — don't depend on any special-casing in the shell

---

## Documentation Index

| # | Doc | When to read it |
|:--:|------|------|
| ★ | [13-development-guide](13-development-guide.md) | **Start here the first time you write a plugin** — the nine-step walkthrough from `npm create` to listing + the three tiers |
| 1 | [01-plugin-api-contract](01-plugin-api-contract.md) | Before the first line of code — know which APIs you can call (**the master entry to the three API surfaces**) |
| 2 | [02-plugin-lifecycle](02-plugin-lifecycle.md) | Understand the whole register→activate→run→uninstall process |
| 3 | [03-contributes-spec](03-contributes-spec.md) | Register commands/menus/keybindings/settings/views/themes/i18n/title bar buttons |
| 4 | [04-distribution-format](04-distribution-format.md) | Install and distribute — let others install your plugin (including the **two-step listing** story) |
| 5 | [05-ui-conventions](05-ui-conventions.md) | Context menus/overlays/persistence/two keybinding tracks/three clipboard channels — must go through the shared facilities |
| 6 | [06-plugin-json-spec](06-plugin-json-spec.md) | The complete plugin.json field reference — **note: there is no `readme` / `changelog` field here**; the description and changelog are files |
| 7 | [07-plugin-to-plugin-communication](07-plugin-to-plugin-communication.md) | How plugins pass data to each other — **three communication mechanisms**: event broadcast / command invocation / data pipeline |
| 8 | [08-view-container-api](08-view-container-api.md) | Every ViewContainer field: registering sidebar/panel views, adding content to someone else's container, titleActions |
| 9 | [09-plugin-directory-layout](09-plugin-directory-layout.md) | Plugin directory structure — where files go, naming conventions + **the authoritative criteria for `README.md` / `CHANGELOG.md`** |
| 10 | [10-building-a-settings-plugin](10-building-a-settings-plugin.md) | **A whole replacement for the settings UI** (≠ adding one setting to your own plugin, which is doc 20) |
| 11 | [11-authoring-themes](11-authoring-themes.md) | Deep reference on recipe authoring (directory conventions / full example / migration and pitfalls) |
| 12 | [12-readme-media-contract](12-readme-media-contract.md) | How to write images/GIFs/linked cover videos/in-page videos in a README |
| 13 | [13-development-guide](13-development-guide.md) | **The walkthrough** (same as the first row) |
| 14 | [14-data-pipeline-command-conventions](14-data-pipeline-command-conventions.md) | Naming and registration conventions for data pipeline commands |
| 15 | [15-multi-repo-and-local-workspace](15-multi-repo-and-local-workspace.md) | Where plugin projects live, how to name repos, **the iron rule that a container never hosts a repo** |
| 16 | [16-naming-conventions](16-naming-conventions.md) | **Seven names, one identity** — how ids are chosen/whether they can change, what the repo is called, version numbers sourced in four places |
| **17** | **[17-region-map](17-region-map.md)** | **Which region my plugin shows up in** — how to declare each of icon bar/sidebar/main area/Bottom Panel/status bar |
| **18** | **[18-cross-region-wiring](18-cross-region-wiring.md)** | **How regions wire together** — sidebar selection → main area switch → status bar update (a set of recipes) |
| **19** | **[19-component-cheatsheet](19-component-cheatsheet.md)** | **Which UI parts the shell provides**, and when to use which |
| **20** | **[20-adding-a-setting](20-adding-a-setting.md)** | The minimal approach: declare one → it appears on the settings page automatically → read it in code |
| **T1** | **[themes/01-build-a-theme-plugin](themes/01-build-a-theme-plugin.md)** | The theme-authoring walkthrough (no code) |
| **T2** | **[themes/02-theme-field-index](themes/02-theme-field-index.md)** | A cross-index of recipe fields and CSS variables |

**JSON Schema:** `plugin.schema.json` — IDE autocompletion | Theme recipes: `schemas/theme.schema.json` inside the SDK package

---

## Related

- Contract type source of truth: `linkdesk.d.ts` inside the `@linkdesk/contracts` package (arrives with the SDK)
- Theme system design doc (**the shell's why**; authors need not read it): repo `docs/02-Electron架构/E5.8_归一化基建/外观主题化/`
- Legacy Tauri-era docs: `docs/01-Tauri_P1至P5.5/` (historical reference only)
