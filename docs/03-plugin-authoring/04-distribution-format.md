# 04 — Plugin Distribution Format

> 2026-07-24 · updated 2026-08-21 · **full rewrite 2026-09-06 (flatten to single root + single-file zip distribution)**.
> **How plugins are delivered, how they are installed, and the version-compatibility rules.** Modeled after VS Code's `.vsix`—LinkDesk distributes via a **single-file `.linkdesk-plugin` zip**.
> The source of truth for packaging-format details = [linkdesk-plugin format spec](../02-Electron架构/E6_插件生态与发布/01-插件独立构建/02-linkdesk-plugin格式规范.md) (this page only covers the author-side delivery/install/version story).

---

## 1. Distribution Format—One Single-File `.linkdesk-plugin` Zip

**A LinkDesk plugin's delivery form = one single `.linkdesk-plugin` file** (a zip package, the SDK build output). Plugin source is an ordinary directory ([09-plugin-directory-layout.md](09-plugin-directory-layout.md)), but **what gets handed to users / published to the marketplace is always that zip**—the era of directory distribution, where copying a whole directory was the install, is over (flatten-to-single-root decision, 2026-09-05).

```
my-plugin/
├── <id>.linkdesk-plugin        ← the sole carrier for distribution/install/marketplace (zip)
│   ├── plugin.json             ← rewritten clone (contributes.views[].render → views/<View>.bundle.js)
│   ├── index.bundle.js         ← main entry bundle (whenever the loader sees it, it becomes the runtime entry)
│   ├── index.bundle.css        ← aggregated styles
│   ├── views/<View>.bundle.js  ← one independent build per contributes.views[].render
│   ├── resources/ icon.svg etc.  ← resources ship inside the package
│   └── (themes/ assets/ i18n/ node_modules/ …)  depending on plugin content
└── src/ …                      ← author source (does not go into the zip)
```

**Who produces the zip:** [plugin-sdk](../../packages/plugin-sdk) (`npm run publish` goes through the [author journey](../02-Electron架构/E6_插件生态与发布/05-文档与发布/00-第三方作者旅程.md)) emits `<id>.linkdesk-plugin` + the unpacked directory `dist/<id>.linkdesk-plugin/` at **the project root**. All JS inside the zip is pre-built and self-contained (react-family packages are external, provided by the shell)—**there is no source compilation in the installed state**.

**Why a single file:** the shell loader only accepts pre-built bundles for installed plugins—`plugin-file-service` sees that `index.bundle.js` exists and overwrites the entry to point at it (`resolveEntry`; the bundle entry is always `index.bundle.js`). The zip is "one plugin = one file that can be downloaded, verified, and atomically replaced", and both install/uninstall and marketplace downloads work against it.

> **The source directory and the distribution file are two different things:** development uses a directory (dev source tree with HMR), distribution uses a zip (pre-built output). Don't use a source directory as an install carrier, and don't edit a bundle inside the zip as a hot update—changed source requires a **rebuild + republish** (see §2, version discipline).

---

## 2. Install Flow—zip → `{userData}/plugins/<id>/`

**The install target is always `{userData}/plugins/<pluginId>/`** (`env.userPluginsDir`, where {userData} = Electron's `app.getPath('userData')`, on Windows `%APPDATA%/LinkDesk`). The installed state **has no builtin/user two-tier split**—plugins shipped with the shell and third-party plugins installed by the user lie **flat side by side in the same tree**; the only remaining difference is manifest fields (see §3).

**Two arrival paths (the same landing path):**

| Path | Who | Landing point | Semantics |
|------|------|------|------|
| **boot auto-install (one-time first-launch seed)** | `bundled-plugins/*.linkdesk-plugin` shipped with the shell (in prod, `resources/bundled-plugins`) | `{userData}/plugins/<id>/` | Decision order: ① directory exists → skip (never overwrite, same or different version) ② ledger says `removed` → skip (respect it) ③ **no record at all + directory missing → lay down the seed** (first launch / a new bundled item's first appearance on update) ④ live record + directory missing → skip, do not lay down (no resurrection—tombstoning is the renderer's reconciliation job via a ledger stamp). Corrupt-directory repair (integrity repair, ≠ resurrecting a deleted plugin) is retained |
| **User install** | `pluginManager.install(url \| zip on disk \| directory)` | same as above | Download/extract/verify → write to disk; a directory source is a dev convenience only—the main distribution path is the zip |

**Install-time verification (intercepted before extraction, so no half-installed directory is produced):**
- Locate `plugin.json` at the zip top level (basename match, tolerating one wrapper directory)—JSONC parse
- `pluginId` resolution: manifest first, zip file basename as the fallback, cross-checked between the two sources; must pass the safe character set (no path separators/relative segments)
- zip-slip protection—entry paths that escape the extraction target are rejected
- Same version already installed → skip (user install deletes the source); different version → leave it alone (upgrading is the update flow's job; boot never overwrites)

**There are three source roots—don't mix them up** (🔴 Note: **shipped plugins' source is not in the shell repo**):

| Source root | Location | Form | HMR | Who lives here |
|------|------|------|:--:|------|
| **The plugin's own repo** | GitHub `Encaron/linkdesk-plugin-<id>` (local clones land under `E:\linkdesk-plugins\official\<id>\`) | source + SDK build (`npm run build` → `<id>.linkdesk-plugin`) | ✅ (`linkdesk-plugin-sdk dev`) | **all 18 shipped plugins**—one repo each, and the only source of truth for their source |
| **Shell repo fixtures** | `<shell repo>/plugins/<id>/` (`env.appPluginsDir`) | source + Vite on-the-fly compilation | ✅ (`npm run dev` hot reload) | only the two remaining **dev fixtures**: `panel-demo` / `floating-panel-demo` (not shipped, not in the zip) |
| **Installed state** | `{userData}/plugins/<id>/` | pre-built bundle unpacked from the zip | ❌ (changing the package means rebuild + reinstall/rematerialize) | every plugin installed on the user's machine |

> 🔴 **Why a shipped plugin's source can't be kept in both places**: as soon as the shell repo and the plugin repo each hold a copy, changing one leaves the other stale, and **no gate can detect the divergence** (the content-fingerprint gate only covers zip contents, not source) ⇒ the source of truth must be unique. What the shell repo keeps are **artifacts** (`bundled-plugins/*.linkdesk-plugin`) and **documentation archives**, not source.

> **Real-device loop exception (author dev):** in the installed state, changing a package requires "rebuild + reinstall/rematerialize", which in **every author real-device verification** scenario means the one-shot-cycle pain of WPF v2. The real-device loop automates it—an SDK rebuild in seconds + a **direct write** into `{userData}/plugins/<id>` (same-disk overwrite semantics, effective on reload) becomes the cycle, and the author still never touches the shell. The distribution zip's "don't modify your own bundle" discipline is unchanged (that is the package for end users). Design archive → [author real-device debugging loop](../02-Electron架构/E6_插件生态与发布/02-插件开发工具链/04-作者真机调试环.md).

> **Uninstall semantics (after 2026-09-05):** uninstalling an installed plugin = **delete the `{userData}/plugins/<id>/` directory + settle the ledger entry** (no longer a move into `.disabled/`); only app plugins uninstalled from a repo source tree get moved to the `plugins/.disabled/` graveyard (recoverable via reinstall). The sole owner of the ledger `installed-plugins.json` = the renderer-side PluginInstallService; boot only reads its `removed` marker to avoid accidental restoration.
> 🔵 **Cross-check conclusion (does the `.disabled/` graveyard still have consumers):** **the mechanism remains, with no object at present**. The consumers are alive—`src/pluginLoader/loader.ts` reads it (`reinstallPlugin` / the uninstall toast's "undo" / cross-restart orphan cleanup all treat `env.appPluginsDir/.disabled` as the single authoritative surface). But `env.appPluginsDir` = the shell repo's `plugins/`, and the 18 shipped plugins have moved out ⇒ only the two fixtures remain there, and **there is no longer any "app plugin uninstalled from a repo source tree"**. ⇒ The mechanism is **retained** (it is part of the in-repo plugin dev path; removing it would touch three places in the loader plus the main-process scan surface, so risk outweighs benefit), but **don't** treat it as a revocable-uninstall channel for shipped plugins anymore.

---

## 3. Directory Taxonomy—No "builtin/user" Categories, Only Fields

**There is exactly one kind of plugin.** The installed state lies flat under `{userData}/plugins/<id>/`, and every identity difference lives in plugin.json declaration fields, not in the directory:

| Field | Meaning (the only source of truth) |
|------|------|
| `core: true` | **A UI guard against accidental deletion**—the uninstall button is hidden/disabled (the shell relies on it for basic interactions such as the settings page and the marketplace; delete it and the shell is crippled). **It is not a category and grants no behavioral privilege**—loading and install/uninstall take the same path |
| `distribution` | ⚠️ **Legacy field** (already annotated in the schema)—after flattening it no longer maps to any directory, and the install side always normalizes it to `user`. **Third-party plugins should not set it** |

Wording discipline (hard constraint 11): don't frame it as two categories "builtin plugins vs. third-party plugins"—say "**plugins with core:true**" (purely a UI button-hiding mechanism against accidental deletion; at the API/command layer they can still be uninstalled or disabled) and "**plugins shipped with the shell**" (the bundled zip ones). **Current state in the repo:** only the two dev fixtures remain under the shell repo's `plugins/`; the 4 core:true plugins (`editor` `file-tree` `marketplace` `settings`) keep their source in **their own repos**; **shipped with the shell = the 6 zips in `bundled-plugins/`** (settings / plugin marketplace / language / base theme / file tree / editor)—the version ledger is `bundled-plugins.lock.json`. "Which ones are core:true" is not a list inside shell code; it is declared only by the zip and lock data (hard constraint 10).

**Plugin data directories (independent of the code roots):**

| Path | Purpose |
|------|------|
| `{userData}/linkdesk/plugins/<id>/data/` | plugin persistent data—the only writable directory |
| `.../data/cache/` | cache (safe to delete) |
| `.../data/exports/` | exported files (user-visible) |

> 🔥 **Don't mix up the two "plugins" roots:** `{userData}/plugins` = the code root (where the zip is extracted, `userPluginsDir`); `{userData}/linkdesk/plugins` = the data root (`pluginsRootDir`). Uninstall + reinstall **does not clear data**—data lives in a separate data root. Authors get `pluginDataDir` via `window.linkdesk.env.get("<id>")` (returned only when pluginId is included); the shell creates the directory automatically, so the plugin doesn't need to.

---

## 4. Version Compatibility

### Semantic Versioning + the Update Path

`version` follows semver (`major.minor.patch`). **boot never refreshes an installed plugin** (the bundled folder is a first-launch offline seed, not an update channel)—there is only one way for an installed user to get new content = **the update flow**: `pluginManager.checkUpdates` (fetch catalog + semver comparison) → `update` (stage to tmp → atomic replace → roll back to the old version on failure). Real marketplace entries discover updates by version.

### 🔥 Any content change must bump the plugin's own version (decided 2026-09-06)

**For a plugin that has been distributed, any content change (code / resources / README / CHANGELOG) must bump `plugin.json.version`.** An installed user's copy is **frozen per version**—boot only fills in what's missing and never refreshes what's installed; the only way for a user to get new content = **the version number**. Changing content without bumping = installed users stay stuck on the old content forever (confirmed empirically on 2026-09-06: a bundled shipping zip gained pyright without a bump → the installed copy's LSP broke entirely).

**The same holds for bundled zips shipped with the shell**: repacking a zip with content changes requires a bump—the packaging gate in `npm run check` fails red on "same version, different content" (`scripts/check-bundled-version-bump.mjs`). For an installed user to get a bundled content fix = discovery/update through a real marketplace entry by version; **boot does not reach in**.

### minAppVersion / requires / permissions

All three are declared in the schema (see [03-contributes](03-contributes-spec.md)) and none is enforced at install time—their semantics align with [02 Lifecycle §9](02-plugin-lifecycle.md):

- `minAppVersion` — checked at load time (not satisfied → toast + skip)
- `requires` — runtime dependency orchestration applies (missing dependency → suspend as PENDING + cycle fail-loud + cascading uninstall in reverse topological order, see [02 §4](02-plugin-lifecycle.md))
- `permissions` — declaring them informs the user; the authorization model is still pending

---

## 5. Resource Paths—Relative to the Plugin Directory, Resolved by the Shell (Hard Constraint 12)

**🔥 Hardcoding absolute paths is forbidden.** References to in-plugin resources (icons/images/fonts/any asset) = **declarative paths relative to the plugin directory**, which the shell resolves at load time into an absolute URL under the current protocol (icons go through `resolvePluginIcon`; `contributes.views[].render` / assets go through `getPluginAssetPath`)—compatible with both dev `http://localhost:1420` and packaged `file://`. **Authors don't import path utilities and don't hand-build URLs.**

```jsonc
// ✅ Right—declare a relative path, the shell resolves it (works in dev and in packaged builds)
{ "icon": "resources/logo.png" }
// Same for contributes.views[].render: { "render": "src/views/MainView.tsx" }

// ❌ Wrong—an absolute path literal; it blows up under file:// after packaging
// { "icon": "/assets/logo.png" }
```

> **Working in dev is a coincidence** (the http server catches absolute paths); it only shows up under `file://` after packaging. When you need self-rendered resources, use a declared path and let the shell resolve it—see [09 §Static Assets](09-plugin-directory-layout.md) and [01-Plugin API Contract](01-plugin-api-contract.md).

---

## 6. Post-Install Lifecycle Operations

Author-side notes on install/uninstall/update/reinstall are in [02 plugin lifecycle §9](02-plugin-lifecycle.md). The author API surface (install/installWithProgress/uninstall/update/checkUpdates/reinstall) is in the `pluginManager` section of [01-Plugin API Contract](01-plugin-api-contract.md).

---

## 7. Full Development → Distribution Flow

```
1. Develop (your own project, or repo plugins/<id>)
   Write plugin.json + src/ → run in the source tree → instant HMR

2. Build (before a third-party release)
   Use plugin-sdk → produces <id>.linkdesk-plugin (full author-side flow → the third-party author journey)

3. Distribute
   Deliver the <id>.linkdesk-plugin single file → user installs it / publish to the marketplace

4. Install
   pluginManager.install(url | zip on disk) → verify → extract to {userData}/plugins/<id>/
   → restart or load immediately → the icon appears

5. Update
   Content changes require a version bump → rebuild and republish → user runs checkUpdates/update
```

---

## 8. Comparison with VS Code

| LinkDesk | VS Code |
|------|------|
| `.linkdesk-plugin` single-file zip (downloaded/extracted to `{userData}/plugins/<id>/`) | `.vsix` single file (downloaded/extracted to `~/.vscode/extensions/<id>/`) |
| `{userData}/plugins/<id>/` install directory (flat, single root) | `~/.vscode/extensions/<id>/` |
| `core: true` plugins can't be uninstalled (accidental-deletion guard) | `builtin/` built-in extensions |
| Uninstall = delete directory + settle the ledger (really deleted); only source-tree app plugins move to `.disabled/` | Uninstall = delete files (not recoverable) |
| `env.get(id).pluginDataDir` | `ExtensionContext.storagePath` |
| `core: true` plugin shipping = `bundled-plugins/*.linkdesk-plugin` (**a first-launch seed**: boot only fills in what's missing and **never refreshes installed copies**; but **the box itself does refresh with the shell version**—before packaging, `sync:bundled` pulls each plugin's "latest released version") | Ships with app updates (built into the installer) |
| `requires` **runtime** dependency orchestration ([02 §4](02-plugin-lifecycle.md)) | `extensionDependencies` resolved at install time |

---

> **← Previous:** `03-contributes-spec.md`
> **→ Related:** `02-plugin-lifecycle.md` (install/uninstall/update) · `09-plugin-directory-layout.md` (source directory) · [linkdesk-plugin format spec](../02-Electron架构/E6_插件生态与发布/01-插件独立构建/02-linkdesk-plugin格式规范.md) (the source of truth for the zip format)
