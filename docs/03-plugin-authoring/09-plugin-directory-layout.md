# Plugin Directory Layout Spec

> 2026-08-05. **Official plugin template — a third-party developer looking at any official plugin sees the same directory structure.**
> **2026-09-06 reconciliation with the implementation** (audit): flattened single root (no plugins/{builtin,user}) · shared controls via @linkdesk/ui · distribution = .linkdesk-plugin zip. References to the corresponding mechanisms have been removed from this page.
> 🔥 **2026-09-11 adds three things**: ① the **"line ceiling" column for each file category** (until now this doc only governed directory semantics and never said how big is too big — plugin size was effectively in a double blind spot where "neither the spec nor the gate cares"); ② **`hooks/` directory + `utils/` boundary details**; ③ **the path-mirroring semantics of `__tests__/` carved in stone**. **The mechanical enforcement of the ceilings = the size gate in `npm run check`** (the tables in this section are authoritative).

---

## Standard directory structure

```
my-plugin/
├─ plugin.json           # plugin declaration — the only required file
├─ icon.svg              # plugin icon (optional) — root directory or resources/, declared by the plugin.json `icon` field
├─ README.md             # plugin readme — the data source for the "Details" tab of the details page (strongly recommended)
├─ CHANGELOG.md          # changelog — the sole source of truth for the "Changelog" tab of the details page (strongly recommended)
├─ i18n/                 # translation files — one JSON per language (optional)
│  └─ en.json            # key = original text, value = translation
├─ resources/            # static assets — icons/fonts/images (optional — declared as relative paths, the shell resolves them)
│  └─ icon.png
└─ src/
   ├─ index.tsx           # entry — export default React component (≤120 lines, thin facade)
   ├─ views/              # page-level components — one per ViewContainer view (≤150 lines)
   │  ├─ MainView.tsx
   │  └─ SettingsView.tsx
   ├─ components/         # reusable UI components — referenced by views/ or externally (≤150 lines)
   │  └─ Toolbar.tsx
   ├─ hooks/              # React hooks — `use*` prefix, one hook per file (≤150 lines)
   │  └─ useToolbarState.ts
   ├─ services/           # business logic — data models, state management, API wrappers (≤200 lines)
   │  ├─ model.ts
   │  └─ api.ts
   ├─ utils/              # pure-function utilities — no side effects, no instance state (≤150 lines)
   │  └─ format.ts
   ├─ styles/             # CSS files — one .css per view/component, never inline (≤300 lines)
   │  ├─ MainView.css
   │  └─ Toolbar.css
   └─ __tests__/          # tests — same name as the file under test + .test suffix, same relative path
      ├─ services/
      │  └─ model.test.ts
      └─ views/
         └─ MainView.test.tsx
```

## `README.md` / `CHANGELOG.md` — readme and changelog

> 🔥 **2026-09-11**. **Previously this doc didn't mention these two files once**, so "add a readme / add a changelog" had **no authoritative yardstick**. This section is that yardstick.

### Division of labor and readers

| File | Feeds | What happens if it's missing |
|:--|:--|:--|
| **`README.md`** | The **Details** tab of the plugin details page (Markdown rendering, supports images / video / external links — see [12-readme-media-contract](12-readme-media-contract.md)) | The details page is **left with a single `description` line** |
| **`CHANGELOG.md`** | The **Changelog** tab of the plugin details page | That tab shows **"This plugin ships no changelog"** |

### Fixed location — plugin root, path never declared

Both live in the **plugin root directory** (alongside `plugin.json`), with **fixed filenames**. They are **not written into `plugin.json` and no field is consulted** — the reader loads the in-package file by **fixed filename**.

> 🔴 **Why this is carved in stone**: `plugin.json` once had `readme` / `changelog` fields, but **nothing ever read them** (the reader reads the **filenames** `README.md` / `CHANGELOG.md` directly). Keeping them around = keeping a **deceptive way of writing things**. **Removed 2026-09-11** ⇒ **any "record the readme / changelog inside `plugin.json`" pattern you see is stale material.**

### The `CHANGELOG.md` format convention

The SDK's `publish` slices sections out of it to fill catalog entries, so **the section-heading format is constrained**:

```markdown
# Changelog                  ← document title (content is free-form)

## v1.0.0 (2026-09-11)       ← 🔴 version section heading: `## v<version>`
- Fixed such and such
- Added some capability

## v0.9.0 (2026-08-01)       ← older versions below, newest on top
- …
```

- **The section heading must yield a parseable version number** — `## v1.0.0…` / `## 1.0.0…` both work (the `v` is optional), and **the version number must be exactly equal to `plugin.json`'s `version`**.
- **Unparseable version number → that version's catalog entry is left blank** (**honestly blank, never guessed**).
- **The date goes in parentheses on the heading line** (`(2026-09-11)`) — **display only**.
- **Body text outside the heading = that version's change notes** — the raw Markdown is copied verbatim, no second-pass parsing.
- **Versions in descending order** (newest on top) — the details page renders in this order.

### 🔴 The "one concept, one place" iron rule

> **There is no `changelog` / `readme` field in `plugin.json`, and there never will be.**
> The changelog goes **only** in `CHANGELOG.md`; the readme goes **only** in `README.md` — one thing has **exactly one home**.

This must be **written down explicitly**: the old pattern still lingers in old commits, old docs, and old plugins, and **if it isn't spelled out, the next person will copy it back in**.

### Coupling with the version number

Changing the contents of `README.md` / `CHANGELOG.md` **= a content change = you must bump `plugin.json.version`** and rebuild the distribution artifact — an installed user's copy is **frozen by version**, and the app only fills in what's missing and never refreshes what's installed (see [04-distribution-format §4](04-distribution-format.md)).

**`version` is the anchor for four places**: the version number in the `CHANGELOG.md` section heading ↔ `plugin.json.version` ↔ the catalog entry `versions[].version` ↔ `package.json.version` — **all four share one source**.

> The fourth place (`package.json.version`) is newly included: now that plugin source lives in its own separate repo, `package.json` is the **first thing a newcomer (or an AI) sees** when opening the repo — two version numbers coexisting and disagreeing guarantees someone bumps the wrong one, while both the publish chain and the content-fingerprint gate read `plugin.json.version` ⇒ **bumping the wrong one = silently ineffective**. Mechanical backstop = `scripts/check-plugin-version-sync.mjs` (hooked into `npm run check`, with a negative control).

---

**⚠️ The plugin source directory produces no build artifacts (Vite dev chunks are build-internal and never land in `dist/`).** The distributed artifact = a single-file `<id>.linkdesk-plugin` zip built with plugin-sdk (containing `index.bundle.js` + `views/*.bundle.js` + a rewritten plugin.json; once the loader detects `index.bundle.js` it uses the bundle as the entry) — authors need not care about build artifacts, only about the source structure above; distribution details in [04-distribution-format](04-distribution-format.md).

## Source location and the distribution artifact

> 🔥 **2026-09-14**. This section answers a question that had never been written down before: **which repo does the plugin source live in?** How to lay out the local directory and how to create the repo → [15-multi-repo-and-local-workspace](15-multi-repo-and-local-workspace.md).

1. **The source of truth for source code = the plugin's own repo** (`github.com/<owner>/<repo>`), **not the shell repo**. The shell repo's `plugins/` allows only two kinds of things: **fixtures** (demos that don't ship, e.g. `panel-demo`) and **build artifacts** (`bundled-plugins/<id>.linkdesk-plugin`).
2. **The semantics of `bundled-plugins/<id>.linkdesk-plugin` in the shell repo = the seed snapshot used for factory shipping**, with its version accounted for by `bundled-plugins.lock.json`. It is **not a second copy of the source** — if the source changes you must change it back in the plugin repo, then run the publish chain to refresh the seed.
3. **The chain from source to a user's desktop**: plugin repo → `npm run build` → `<id>.linkdesk-plugin` (zip) → GitHub Release asset → catalog entry → user install. **Not one step passes through the shell repo.**
4. **Plugin identity (id) is immutable forever**; the display name (`name`) can change; the repo name can change — the three-way rule and all naming criteria → [16-naming-conventions](16-naming-conventions.md).
5. **There is exactly one source of truth for the version number inside a plugin = `plugin.json.version`**. `package.json.version` is not the source of truth, but must equal it (the version number is "one source in four places" — see [16-naming-conventions §5.1](16-naming-conventions.md)).

**Reconciliation with the `publish` implementation** (the spec must not contradict the tool): the publish target repo = the project's git remote `origin` (`getCurrentRepoRemote` in `packages/plugin-sdk/src/publish.ts`; not a git repo / no origin → immediate error); the catalog is written to the **repo-root `marketplace.json`** (read-modify-write via the Contents API); `readmeUrl` / `versions[].changelog` are filled in automatically by publish from the project-root `README.md` / `CHANGELOG.md`.

---

## Static assets and icons

**Icon location:** the plugin root or `resources/` — declared by the `icon` field of `plugin.json`. A bare string = the built-in icon set (codicon name / `iconSource:"lucide"` allowlist name), e.g. `"icon": "FolderTree"`; a path = a file relative to the plugin directory, e.g. `"icon": "resources/icon.png"` (the serial-monitor official usage).

> ℹ️ **Spec convergence**: new plugins put icons and media **in `resources/` across the board** (see [12-readme-media-contract §3](12-readme-media-contract.md)). "The root directory works too" is a **technical fact** (the shell resolves whatever relative path you declare), **not the recommended pattern** — official templates all use `resources/`; match them.

**Reading assets (author's view = declare a relative path, the shell resolves it):** every asset path appearing in plugin.json declaration fields (`icon` / `contributes.views[].render` / the `assets/...` in a theme recipe json) is written **relative to the plugin directory** — at load/render time the shell resolves it into an absolute URL under the current protocol via `getPluginAssetPath(pluginId, path)` (works for both dev `http://localhost:1420` and packaged `file://`). **Authors import no path utilities and hand-build no URLs** (hard constraint 12 forbids authors writing absolute path literals such as `/assets/...`, `/resources/...` — those all blow up under packaged file://; working in dev is just a coincidence).

```
resources/
├─ icon.svg             # plugin icon — pointed to by the plugin.json icon field
├─ logo.png             # details page / marketplace banner image
└─ manual.html          # bundled docs (pointed to by the `docs` field)
```

---

## Theme plugin directory (themes/ + assets/ — flattening into the root is forbidden)

> A theme = a pure-data plugin (`contributes.themes` declaration + recipe json + assets) that usually **produces no `src/` code**. The authoritative directory spec: [11-authoring-themes](11-authoring-themes.md) §2 ⓪.

```
theme-myglass/
├─ plugin.json           # contributes.themes declaration — recipe json paths point under themes/
├─ themes/               # the only home for recipe json — flattening into the plugin root is forbidden
│  └─ myglass.json
├─ assets/               # fonts (woff2/ttf) + background images (png/jpeg/webp) — relative paths from the json
│  ├─ MyFont.woff2
│  └─ bg.png
└─ resources/            # plugin icon, etc. (the general convention above)
```

| Directory | What goes in it | Rule |
|:--|:--|:--|
| `themes/` | recipe json (`appearance` + `colorways[]`) | **flattening into the root is forbidden**; pointed to by `contributes.themes[].path`; one plugin may hold multiple recipe json files |
| `assets/` | fonts / background images | write relative paths `assets/...` in the json → resolved by the shell's `getPluginAssetPath`; absolute paths forbidden (hard constraint 12) |
| `resources/` | plugin icon | the general convention ("Static assets and icons" above) |

A theme author who ships `src/` (e.g. custom UI/scripts) follows the general structure — a pure-data theme has no `src/`.

---

## Criteria for each file category

> 🔥 **2026-09-11 adds the "line ceiling" column**. **The ceilings are mechanically enforced by the size gate in `npm run check`** — the table in this section is the author's first-hand basis. **Over the ceiling means you must split** (via feature-folder, see below).

| Directory | What goes in it | What doesn't | Line ceiling |
|:--|:--|:--|--:|
| **views/** | page-level React components — with their own route or a ViewContainer entry | toolbar buttons, status bar items (→ components/) | ≤150 |
| **components/** | reusable UI components — stateless/weakly-stateful components referenced from multiple places | logic that touches the filesystem directly (→ services/) | ≤150 |
| **hooks/** | React hooks — `use*` prefix, **one hook per file** | components (→ components/), services (→ services/) | ≤150 |
| **services/** | business logic, data models, API wrappers | JSX rendering code (→ views/ or components/) | ≤200 |
| **utils/** | pure-function utilities — side-effect-free, UI/business-agnostic general functions (formatting/parsing/math) | stateful / side-effecting logic (→ services/); React hooks (→ hooks/) | ≤150 |
| **styles/** | standalone .css files — one per view/component | inline style (hand-writing it is forbidden — use CSS variables) | ≤300 |
| **resources/** | static assets — icons/fonts/images/docs (declared as relative paths, resolved by the shell) | modules that get imported (→ src/) | — |
| **`src/` root singletons** | cross-layer shared type definitions (`types.ts`) / constants (`constants.ts`) | modules with logic (→ their role folders) | ≤150 |
| **`src/index.tsx`** | plugin entry (thin facade, registers contribution points) | — | ≤120 |
| **__tests__/** | Vitest tests — `<file under test>.test.ts(x)` | test helpers (→ `__tests__/helpers/`) | unlimited (>1000 lines: split by `describe` group into multiple files in the same folder) |

🔴 **The table above covers directories you write yourself** (`views`/`components`/`hooks`/`services`/`utils`/`styles`). **Creating another top-level directory = the gate errors out on the spot** (fail-loud: "unknown role folder") — this isn't there to block you, it's there to **force you to state explicitly "what role is this and how many lines does it get"**. The honest move is to **register it** (e.g. serial-monitor's `cm6/` = a pure-logic CodeMirror domain, registered at the 150 tier), **not** to move code into `utils/` to fit the table. **Before adding this to the spec, think hard about whether it really is a new kind of thing.**

🔴 **`.css` is always 300, no matter which directory it sits in** — a component's co-located styles (e.g. `views/SettingsView.css`) and CSS under `styles/` are measured with the same ruler.

🔴 **Aggregator tier (ceiling ×2) — two forms**: what the facade looks like depends on whether it carries a "basename constraint".

| Form | What it looks like | Who uses it |
|:--|:--|:--|
| **(a) Loose facade beside the folder** | a folder `X/` **exists alongside** the file `X.ts(x)` | `views/` — the filename = `contributes.views[].render`, **renaming it changes the artifact** ⇒ the facade can only stay beside the folder and can only keep the original name |
| **(b) Entry inside the folder** | the path is **`<roleDir>/<Feature>/index.ts(x)`** | `services/` / `components/` / `hooks/` / `utils/` — the service/component name is not any declared field (**no basename constraint**) ⇒ the facade is the folder's entry, with no extra loose file left in the root |

Both forms count at this tier **×2** (`views`/`components`/`hooks`/`utils`→300 · `services`→400). **This is a relaxed ceiling, not a target** — the facade should still be as thin as possible, and **must not contain pure logic** (pure functions / data transforms / types must sink into submodules).

> ⚠️ **Don't treat "a folder with the same name" as the only criterion** — when you create `services/foo/index.ts` + submodules under `services/`, **the gate recognizes it as an aggregator** (form b). Conversely, under `views/` **do not** rename the facade to `index.tsx` — that changes the name `render` points at.

> **Handling overruns**: use a **feature-folder (same-named folder = aggregator + submodules)** — the facade keeps its original path and filename (**zero changes to external imports**) and submodules go into the same-named folder. **Splitting into multiple flat files within the same domain is forbidden.**

> 🔔 **Folder-width yellow light (threshold 12) — a reminder only, never blocking**: when **a folder's direct children (files + subfolders) exceed 12**, `npm run check` prints a notice (**`check` still goes green**). It doesn't stop you, it just forces you to **take a look + give a one-line reason**. **Don't create 3-file fragment folders just to clear the light** — that's worse than flat files. A very wide folder == often means two or three distinct functional domains are hiding inside, which is worth a read.
>
> 📌 **How to read the gate**: the closing line prints the currently effective tiers (`tier A … ; tier B plugins/<id>/src by role table · tier C entry ≤120`). **If the plugin tier is ever turned off, that line becomes `⚠️ Plugin tier disabled — the plugin domain is currently unguarded`** — so **whether the gate is on duty is visible from the output alone**, with no need to read the script.

### Decision flow

```
Does this file contain JSX/React rendering?
  ├─ Yes → Is it a page corresponding to one ViewContainer?
  │        ├─ Yes → views/
  │        └─ No → components/
  └─ No → Is it a React hook (`use*` prefix)?
           ├─ Yes → hooks/ (one hook per file)
           └─ No → Does it operate on data/state/files/network?
                    ├─ Yes → services/ (has side effects)
                    └─ No → Is it a pure function (stateless, side-effect-free)?
                             ├─ Yes → utils/
                             └─ No → Is it CSS?
                                      └─ Yes → keep it with the view/component it serves (co-located is legal),
                                              otherwise put it in styles/. **The gate goes by extension
                                              (always 300) and doesn't care which directory it's in**
                                               ├─ Yes → __tests__/
                                               └─ No → src/ (root, special cases)
```

### 🔴 The `utils/` boundary with `services/` and `hooks/` (added 2026-09-11)

`utils/` takes **pure functions only** — no instance state, no side effects, no React. **Two mechanical criteria**:

- **Has instance state / has side effects** (holds a `Map`/`Set`/buffer, reads or writes disk, sends IPC, maintains a singleton) → **does not go in `utils/`, goes in `services/`**.
- **Is a React hook (`use*`)** → **does not go in `utils/`, goes in `hooks/`**.

> **Lesson from the field**: `serial-monitor/src/utils/` once held both `RingBuffer.ts` (**a stateful class**) and `useSendData.ts` (**a React hook**) — neither belonged in `utils/`. This boundary was never carved in stone before, so authors could only guess.

### 🔴 `__tests__/` paths and naming (made explicit 2026-09-11)

**`__tests__/` is a plugin-layer convention and is always used** — shell-layer tests follow the shell's own structure (`src/**/` co-located next to the shell code), and **plugins do not adopt co-location** (that is the shell-layer approach). Plugin tests use Vitest.

**Naming**: `<file under test>.test.ts(x)` — **inside `__tests__/` keep the same relative path as the file under test**:

```
src/services/model.ts        → src/__tests__/services/model.test.ts
src/views/MainView.tsx       → src/__tests__/views/MainView.test.tsx
src/views/Detail/state.ts    → src/__tests__/views/Detail/state.test.ts
```

**Line count**: test files **are not subject to the size gate** (the gate skips `__tests__/`) — fixtures are naturally long, so no ceiling applies; **but tests over 1000 lines get split by `describe` group into multiple files in the same folder**.

> ⚠️ **The easiest place to trip when migrating existing tests**: once a test file sits one level deeper, **every relative import changes** (`./model` → `../../services/model`). **The symptom of missing one is Vitest silently skipping the file (`0 test`) rather than erroring** — after migrating, verify the total case count hasn't dropped.

---

## Special cases — things allowed in the `src/` root

- **`index.tsx`** — the plugin entry, which must live in the `src/` root
- **Highly cohesive single-file plugins** (≤3 files total) — subdirectories are not mandatory
- **Cross-layer shared type definitions** (e.g. `types.ts`) — in the `src/` root, imported by multiple subdirectories

---

## The `i18n/` translation directory

A plugin ships its own translation files, one JSON per target language. key = the original plugin UI string (using the author's native language is recommended), value = the translation.

```
i18n/
├─ en.json     ← { "在文件树中显示": "Reveal in File Tree" }
└─ ja.json     ← { "在文件树中显示": "ファイルツリーで表示" }
```

**Declaration:** the `contributes.i18n` field of `plugin.json` declares the path of each language file:
```json
"contributes": {
  "i18n": { "en": "i18n/en.json", "ja": "i18n/ja.json" }
}
```

**You don't need to write a fallback file for the author's native language** — a key with no translation is returned as-is by `parseMissingKeyHandler`: a Chinese plugin doesn't need a `zh.json`, and a pure-English or pure-French plugin likewise doesn't need a fallback file for English or French — the key is the original text, and a missing translation silently falls back to displaying the key itself.

**What gets translated:** `title`/`description` in `plugin.json` (for commands, settings, view container names) + UI strings passed to `t()` in `.tsx`.

**Language-switch behavior:** the shell automatically loads each plugin's `contributes.i18n` → registers it into i18next → takes effect immediately on a language switch, with no restart. Just call `t()` at render time; no `namespace` argument is required — translations are registered in the global `"translation"` namespace.

---

## Naming conventions

- **Filenames:** PascalCase (components), camelCase (non-components), kebab-case.css (styles)
- **Test files:** `<file under test>.test.ts(x)` — placed in `__tests__/`, **keeping the same relative path as the file under test** (see "`__tests__/` paths and naming" above)
- **CSS files:** same name as the component being styled — `MainView.tsx` → `MainView.css`

---

## Compared with VS Code

VS Code extensions have no mandatory directory structure, but the official examples follow a similar convention:

| VS Code | LinkDesk |
|:--|:--|
| `src/extension.ts` | `src/index.tsx` |
| `src/commands/` | none — commands are registered in `index.tsx` |
| `src/views/` | `src/views/` — identical |
| `src/test/` | `src/__tests__/` — Vitest's double-underscore convention |
| `media/` | `src/styles/` — LinkDesk keeps everything under src |
| `package.nls.json` / `l10n/` | `i18n/` — LinkDesk keys are the original Chinese text and only target-language JSON is provided |

---

> **← Previous chapter:** `08-view-container-api.md`
> **← Index:** `00-readme.md`
