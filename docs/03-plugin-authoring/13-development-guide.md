# Plugin Development Guide — From Zero to Shipped

> 2026-09-12. **This is a walkthrough, not a reference manual.** Every step covers only three things: **what to do** / **how to know you did it right** / **which doc has the details**.
> Field meanings, method signatures, and normative clauses are **never repeated here** — each has its own single source of truth, so follow the links. Repeating them = creating a second source of truth = it will clash with the real one sooner or later.

| | |
|---|---|
| Readers | Someone writing a LinkDesk plugin for the first time |
| Shape | A tutorial walkthrough (just execute it in order from the top) |
| Not | An API reference (→ [01-plugin-api-contract](01-plugin-api-contract.md) + [the plugin-sdk README cheatsheet](../../packages/plugin-sdk/README.md#api-速查表)) · a field dictionary (→ [06-plugin-json-spec](06-plugin-json-spec.md)) · normative clauses (→ the [00-readme](00-readme.md) index) |
| Estimate | Steps 1-3: see your own plugin running in 10 minutes |

---

## Before You Start — Three Iron Rules

Break any of these and your plugin **installs but then breaks** (it can even take the shell down with it). Memorize them now; that's much cheaper than fixing things afterwards:

1. **Use only `window.linkdesk.*`** — importing shell internals (`@src/core/...`) is forbidden. ESLint `noCoreImportInPlugin` is at `error` level, so the moment you write it, it's red.
2. **Colors go through CSS variables `var(--xxx)`** — hardcoded hex is forbidden, otherwise your plugin won't follow theme switches.
3. **Copy goes through `t()`** — the key is the source text (Chinese plugins use Chinese keys, with Chinese as the built-in fallback; English translations go in `i18n/en.json`).

> All eight rules + their scope → [00-readme §Hard Constraints](00-readme.md#hard-constraints--before-you-write-any-plugin-code).

---

## Step 1: Generate the Project Skeleton

**What to do**

```bash
npm create linkdesk-plugin@latest my-cool-plugin    # the name must be kebab-case (lowercase letters/digits/hyphens)
cd my-cool-plugin
npm install
```

Running `npm create linkdesk-plugin@latest` with no arguments asks for the plugin name interactively.

> 🔴 **Keep the `@latest`.** Without a version anchor npm's npx cache can silently hand you a months-old copy of the scaffold, and the CLI never prints its own version — the only symptom is a project **missing files** (no git repo, no `AGENTS.md`, no CI, 7 files instead of 16). If that already happened to you: `npm cache clean --force`, then re-run.

**How to know you did it right**
A new directory shows `plugin.json` + `src/index.tsx`, and placeholders like `{{pluginName}}` in `plugin.json` have **been replaced with your real plugin name** (`pluginId` / `name` / `description` / `author` are filled in too, with `author` defaulting to `git config user.name`). The CLI prints a line telling you **whether a git repo was created**: if it was, `git log` has one "initial skeleton" commit and the branch is called `main`.

**Which doc has the details**
[02-plugin-dev-toolchain/01-create-linkdesk-plugin-scaffold.md](../02-Electron架构/E6_插件生态与发布/02-插件开发工具链/01-create-linkdesk-plugin脚手架.md) — the **file-by-file contract** for the generated output (why each file exists, the placeholder rules, the roles of the 16 template files). **Don't look for the project structure here**; that doc is the single source of truth.

> ✅ **Repo creation (shipped 2026-09-14)**: the scaffold **creates the git repo for you** — following the three `cargo new` semantics, **not "always `git init`"**:
> - the project directory is **not inside any git repo** ⇒ `git init -b main` automatically + **one initial commit** (the template ships a `.gitignore`, so your first step isn't a screenful of untracked files);
> - the project directory **is already inside some git repo** ⇒ **don't create one** (prevents nested repos — for example when you generate the plugin in a subdirectory of an existing repo);
> - **`--no-git`** ⇒ never create one (the escape hatch, matching `cargo new --vcs none`).
>
> The CLI **prints explicitly** whether it created a repo and why, so don't guess. 🔴 **This requires scaffold version ≥ 0.1.3** — older versions
> neither create a repo nor generate CI in the project. The CLI has no `--version` flag, so it can't tell you which copy you got; that is exactly why Step 1's command carries `@latest`.
> Where the project should live and what the repo should be called → [15-multi-repo-and-local-workspace](15-multi-repo-and-local-workspace.md).

---

## Step 2: Run It and See It

**What to do**

```bash
npm run dev        # = linkdesk-plugin-sdk dev
```

**How to know you did it right**
A browser opens the dev host page automatically, showing the template's built-in **"Plugin is running ✨"**. Now edit the text in `src/index.tsx` and save — **the page updates instantly** (HMR, no restart).

**Which doc has the details**
[02-local-preview-environment.md](../02-Electron架构/E6_插件生态与发布/02-插件开发工具链/02-本地预览环境.md) — what the dev host is, why the author side needs zero configuration, and HMR's boundaries. This step **does not start the LinkDesk app**; it only runs the plugin's own preview host.

---

## Step 3: Write Your First Piece of UI

**What to do**
Edit the React component that is the `default export` in `src/index.tsx`. This is how the shell renders it:

```tsx
export default function HelloPlugin({ isActive }: { isActive: boolean }) { … }
```

- `isActive` = whether this tab currently has focus. **Under the keep-alive architecture all tabs stay mounted** — don't use `isActive` to blank out the whole content; it's only good for gating "effects that should run only while focused" (such as autosave or polling).
- `tabId` / `sourceId` = this tab's id / contextual data (editor-type plugins use `sourceId` to know which file the user opened).

**How to know you did it right**
The UI updates in the preview host as you edit. **And**: the UI has no bare hex colors and no hardcoded Chinese (use `t()`) — both are visible to the naked eye, and both are what `npm run lint` will catch later.

**Which docs have the details**
- View contract details → [05-ui-conventions](05-ui-conventions.md) (context menus/overlays/persistence/two keybinding tracks)
- Want it in the sidebar or the Bottom Panel → [08-view-container-api](08-view-container-api.md)

---

## Step 4: Call an API

**What to do**
To see what can follow `window.linkdesk.`, check the **cheatsheet** (45 namespaces / 242 methods, auto-generated from the contract):

- 👉 [plugin-sdk README §API cheatsheet](../../packages/plugin-sdk/README.md#api-速查表)
- Full signatures and per-method notes → `node_modules/@linkdesk/contracts/linkdesk.d.ts` (your IDE can jump straight to it)

Example: read one setting and subscribe to a change.

```ts
const theme = await window.linkdesk.theme.getCurrent();
const dispose = window.linkdesk.configuration.onChange("my-plugin.greeting", (v) => { … });
```

**How to know you did it right**
If TypeScript compiles, it's right — the types for `window.linkdesk.*` come with the SDK (already wired up in `tsconfig.json`'s `types`), so **a misspelled method name or a wrong parameter type turns `tsc` red on the spot**. That's the free line of defense the contract gives authors.

**Which docs have the details**
- Which surfaces are available on which side (pool/shell), and what the `?` marking means → [01-plugin-api-contract §3 the single source of truth](01-plugin-api-contract.md)
- ⚠️ **Methods marked `°` in the cheatsheet** (contract `?`) are injected into only one preload, **and most are shell-side only** — your plugin runs in the pool, so check existence before calling them.
- How plugins pass data to each other → [07-plugin-to-plugin-communication](07-plugin-to-plugin-communication.md) (event broadcast / command invocation / data pipeline)

---

## Step 5: Declare Contribution Points (commands / menus / keybindings / settings / tabs / i18n)

**What to do**
Declare them in `contributes` in `plugin.json`. Commands, menu items, keybindings, settings, views, themes, i18n and title bar buttons **are all registered here**.

**How to know you did it right**

```bash
npm run validate     # validates plugin.json: $schema / field legality / i18n files exist
```

No errors in the output means it passes. Declared a command → press `Ctrl+Shift+P` and you can find it in the command palette; declared a setting → the item appears on the settings page.

**Which docs have the details**
- Full syntax and examples for every contribution point → [03-contributes-spec](03-contributes-spec.md) (**the thickest doc; look up the point you need**)
- The meaning/type/default of every field → [06-plugin-json-spec](06-plugin-json-spec.md)
- The lifecycle (register→activate→run→uninstall) → [02-plugin-lifecycle](02-plugin-lifecycle.md)

---

## Step 6: Use Shared Components (don't build your own context menu)

**What to do**

```bash
npm i @linkdesk/ui
```

Controls like context menus, selects, and toggles come from the shared package — **glass/theme follow automatically**, no styling of your own; components and styles are supplied by the shell pool at runtime (install the line that **matches the shell**, see [19-component-cheatsheet §2.1](19-component-cheatsheet.md)), and ⛔ you must not import its css.

**How to know you did it right**
Switch themes and your context menu's appearance follows (hand-made implementations usually don't). Repo hard constraint 3 is explicit: a hand-written context menu is a violation.

**Which doc has the details**
[05-ui-conventions](05-ui-conventions.md) + [19-component-cheatsheet](19-component-cheatsheet.md)

---

## Step 7: Install It into a Real LinkDesk to Verify

**What to do**
The preview host isn't the real shell after all. To confirm real-machine behavior (real serial port, real files, real windows):

```bash
npm run dev:real     # = linkdesk-plugin-sdk dev --real
```

**How to know you did it right**
You can see your plugin in the LinkDesk app, behaving the same as in the preview. **One boundary to note**: an installed plugin runs the **prebuilt bundle**, so any source change requires a rebuild to take effect — that's not a bug, it's distribution discipline.

**Which doc has the details**
[04-author-real-machine-debug-loop.md](../02-Electron架构/E6_插件生态与发布/02-插件开发工具链/04-作者真机调试环.md) — how the real-machine loop automates "rebuild + write directly", and why changing the bundle of an installed plugin doesn't count as a hot update.

---

## Step 8: Package It and Hand It to Others

**What to do**

```bash
npm run build
```

**How to know you did it right**
**One** `<pluginId>.linkdesk-plugin` single file (a zip) appears at the project root, plus an unpacked `dist/<pluginId>.linkdesk-plugin/` directory. Give that single file to someone else and they can install it.

⚠️ **Don't treat the source directory as the distribution vehicle** — the era of "copy the whole directory to install" is over. And once `plugin.json`'s `version` goes +1, you **must add a `## v<new version>（YYYY-MM-DD）` section to `CHANGELOG.md` in the same commit**, otherwise the plugin details page will show "No changelog provided for this version".

**Which docs have the details**
- Distribution format and install flow → [04-distribution-format](04-distribution-format.md)
- The byte-level format spec inside the zip → [01-plugin-standalone-build/02-linkdesk-plugin-format-spec.md](../02-Electron架构/E6_插件生态与发布/01-插件独立构建/02-linkdesk-plugin格式规范.md)
- Rules for images/GIFs/videos in a README → [12-readme-media-contract](12-readme-media-contract.md)

---

## Step 9: List on the Marketplace

> 🔴 **First, clear up the most common misunderstanding: listing is "two steps", and `npm run publish` is only half of the first one.**
>
> | Step | What you do | Who can see it afterwards |
> |:--:|------|------|
> | **①** | `npm run publish` — publish to **your own** GitHub repo (Release asset + `marketplace.json` at the repo root) | **Only people who manually add your repo address as a "marketplace source".** Default users **can't see it** |
> | **②** | **Get your plugin into the official catalog** `Encaron/linkdesk-marketplace` (open a PR adding one entry to the catalog's `marketplace.json`) | **All users with default configuration** — this step is what "listing" really means |
>
> "I ran publish, so why can't I find it in the marketplace" = you're stuck on step two. Full story (including how to submit to the official catalog) → [04-distribution-format](04-distribution-format.md).

**What to do**

```bash
npm run publish      # = linkdesk-plugin-sdk publish — step ①
```

**Prerequisite — the project must already be a git repo pushed to GitHub**

publish's target repo = your project's git remote `origin` (publishing to **your own** GitHub repo: Release asset + `marketplace.json` at the repo root; the multi-marketplace-source model). Before running it, use `git remote -v` to confirm origin points at your GitHub repo.

> ✅ **Current state (shipped 2026-09-14)**: the scaffold **already creates the git repo** (`main` branch + one initial commit, see step 1) ⇒ pushing to GitHub is **down to two commands**; the `git init` one from the three people usually mention is no longer needed:
>
> ```bash
> git remote add origin git@github.com:<you>/<repo>.git
> git push -u origin main
> ```
>
> When you still need to run `git init` yourself: you generated with `--no-git`, or the project was generated **inside another git repo** (in which case the scaffold deliberately skips creating a nested repo, following `cargo new` semantics).

**Publishing from CI / non-interactive shells (AI agents included)**

Two steps want you at the keyboard in an interactive run — both have non-interactive answers:

| Interactive step | Non-interactive answer |
|:--|:--|
| The GitHub token prompt | Set the `LINKDESK_GITHUB_TOKEN` env var (below) |
| The `[y/N]` "publish this?" confirmation | Pass `--yes` (or preview first with `--dry-run`) |

`publish` finds the token in this order: **①** env `LINKDESK_GITHUB_TOKEN` → **②** the SDK config file (`linkdesk-sdk/config.json` under your OS config directory — written automatically the first time you published from an interactive terminal) → **③** a masked interactive prompt. Without a token in a non-interactive shell, publish **fails immediately** with a message telling you to set the env var — it does not hang.

```bash
LINKDESK_GITHUB_TOKEN=ghp_xxx npm run publish -- --yes   # one-off, inside a script
```

```yaml
# GitHub Actions — expose the stored secret to the step
env:
  LINKDESK_GITHUB_TOKEN: ${{ secrets.LINKDESK_GITHUB_TOKEN }}
```

> 🔔 **A 401 that means "expired", not "wrong":** publish talks to the GitHub REST API with a **classic PAT** (repo scope). If publishing suddenly fails with 401 while everything else on the machine still works, the usual culprit is an **expired PAT** — create a fresh one and update the env var or the config file.

**How to know you did it right**
Step one: your `.linkdesk-plugin` asset shows up on the GitHub Release. Step two: once your entry is in the official catalog, **on a clean machine (default configuration, no marketplace sources added)** it can be found in the marketplace, installed, and updated — that's the criterion for "listing complete".

**Which docs have the details**
- The full chain (local → GitHub → the user's machine) → [03-plugin-release-pipeline.md](../02-Electron架构/E6_插件生态与发布/02-插件开发工具链/03-插件发布流水线.md)
- The end-to-end journey from an author's perspective → [05-docs-and-release/00-third-party-author-journey.md](../02-Electron架构/E6_插件生态与发布/05-文档与发布/00-第三方作者旅程.md)

---

## Pitfalls Beginners Hit Most

| Symptom | Root cause | Where to look |
|---|---|---|
| When the theme switches, my UI colors don't follow | Hardcoded hex | Iron rule 2 · [00-readme](00-readme.md#hard-constraints--before-you-write-any-plugin-code) |
| Switch away from a tab and back: state is lost / content is empty | You conditionally rendered on `isActive` — under keep-alive it shouldn't unmount | [05-ui-conventions](05-ui-conventions.md) |
| After `npm run build` the installed plugin still behaves the old way | Installed plugins run the prebuilt bundle; source changes need a rebuild | Step 7 · [04-author-real-machine-debug-loop.md](../02-Electron架构/E6_插件生态与发布/02-插件开发工具链/04-作者真机调试环.md) |
| The details page says "No changelog provided for this version" | The version went +1 but `CHANGELOG.md` didn't get a new section | Step 8 |
| The plugin details page description area is empty | The description comes from the `README.md` file, and **`plugin.json` has no `readme` field** | [09-plugin-directory-layout](09-plugin-directory-layout.md) · [06-plugin-json-spec](06-plugin-json-spec.md) |
| My context menu's styling doesn't match the shell | You hand-wrote the context menu | Step 6 · [05-ui-conventions](05-ui-conventions.md) |
| `import @src/core/xxx` errors out | That's shell-internal implementation; plugins must not import it | Iron rule 1 |

---

## Documentation Map (find it by what you're doing)

| What you want to do | Read this |
|---|---|
| **Know what APIs you can call** | [01-plugin-api-contract](01-plugin-api-contract.md) + [SDK README cheatsheet](../../packages/plugin-sdk/README.md#api-速查表) |
| Look up **what a field means** | [06-plugin-json-spec](06-plugin-json-spec.md) + `plugin.schema.json` |
| Register **commands/menus/keybindings/settings/views/themes/i18n** | [03-contributes-spec](03-contributes-spec.md) |
| Understand **when a plugin is activated/uninstalled** | [02-plugin-lifecycle](02-plugin-lifecycle.md) |
| Pass data **between plugins** | [07-plugin-to-plugin-communication](07-plugin-to-plugin-communication.md) |
| **Sidebar/panel views**, adding things into someone else's container | [08-view-container-api](08-view-container-api.md) |
| A whole **replacement settings UI** | [10-building-a-settings-plugin](10-building-a-settings-plugin.md) |
| Build **themes/icons** | [11-authoring-themes](11-authoring-themes.md) |
| **Where files should go**; authoritative README/CHANGELOG criteria | [09-plugin-directory-layout](09-plugin-directory-layout.md) |
| The full documentation index | [00-readme §Documentation Index](00-readme.md#documentation-index) |
