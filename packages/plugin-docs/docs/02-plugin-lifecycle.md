# 02 — Plugin Lifecycle

> 2026-07-24 · full rewrite 2026-08-21 · **2026-09-06 reconciled against the implementation** (flattened single root + zip distribution install/uninstall flow). **The complete state machine of a plugin, from existence to disappearance.**
> The foundation has been replaced: the early multi-process model (a dedicated render container per plugin) → **minimal Pool — 1 BrowserWindow + 1 WebContentsView, all plugin components render in the same renderer process**.
> Load/unload semantics are defined by the shell-side state machine + reversible registration + dependency orchestration (`src/pluginLoader/`). This page is all a third-party author needs to read.

---

## 1. Two load paths — repo source tree (HMR) and installed state (bundle)

Both startup scanning and file watching can discover plugins, and **both go through the single entry point `loadPlugin(pluginId, reason)`** (normalized — callers no longer decide for themselves "which path this takes"):

| Path | Source | How the manifest is read | How the JS entry is loaded |
|------|------|----------------|----------------|
| **repo source tree** (dev) | `<repo>/plugins/<id>/` (flattened single root, expanded with `import.meta.glob`) | Vite eager import | `loadPluginComponent` → Vite-built chunk (**HMR applies instantly**) |
| **installed state** | `{userData}/plugins/<id>/` (unpacked from a `.linkdesk-plugin` zip, `plugins.readManifest`) | `JSON.parse` | detect `index.bundle.js` → runtime dynamic import (in dev, `resolveUserDataBundles` points the react family back; in prod, `linkdesk://{id}`) — **prebuilt artifact: changing the package means rebuilding and reinstalling, no HMR** |

**One pipeline, `loadPlugin`, covers both paths**: repo goes through Vite modules, userData goes through a runtime bundle. Adding a capability only requires changing `loadPlugin` in one place.

---

## 2. Startup load pipeline — `loadPlugin` step by step

Each `loadPlugin(pluginId, reason)` call executes in order (`reason` = `startup` | `install` | `reinstall` | `enable`):

```
markLoadStarted (PENDING → LOADING)
  ↓ ① read manifest (glob eager import / runtime IPC) — failure → markLoadFailed + toast
  ↓ ② minAppVersion check — versionGte not satisfied → markLoadFailed + toast
  ↓ ③ dependency check — cycle → fail-loud; missing → suspend to PENDING (see §4)
  ↓ ④ cache metadata (details stay browsable after unload)
  ↓ ⑤ load JS entry + statusBar (glob = chunk; runtime = dynamic import)
  ↓ ⑥ register views — runtime/entryless plugins use registerViewPlugin (see §2.2)
  ↓ ⑦ parse contributes → dispatch to each Registry (normalizeManifest → parseContributions, see §2.3)
  ↓ ⑧ themes / languages / i18n data files loaded asynchronously (fetch)
  ↓ ⑨ wrap up: loadedPluginIds.add + markLoadSuccess (→ ACTIVE) + sync theme/language enums + onDidInstall.fire
  ↓ ⑩ sweep the pending queue — load plugins whose dependencies are now satisfied (sweepPendingDependencies)
```

**🔥 Hard constraint 13, race guard:** two concurrent `loadPlugin` calls → the second returns the first one's in-flight Promise (`_loadingPromises` Map). StrictMode double-mounts and watcher/startup-scan collisions are both safe.

### 2.1 Legacy format normalization + role derivation

- **`normalizeManifest` (a pure function — reads the manifest, never mutates it):** the legacy top-level `themes` / `languages` / `file` fields are folded into `contributes.themes` / `contributes.languages` automatically. New plugins write `contributes` directly and never deal with this layer.
- **Role derivation:** `pluginRole` is declared explicitly; when it is absent it is derived — `!manifest.entry && has contributes` → `"data"` (a pure data plugin: themes/language packs, no React components, component loading skipped). Plugins with `pluginRole: "data"` do not load a JS entry.

### 2.2 Entryless plugins — a view without an entry

**`entry` is not required.** Declaring `contributes.viewsContainers` (location defaults to sidebar) + `contributes.views` is enough — components are loaded from the path declared in `contributes.views[].render`, and `render` is a module path string, so no `index.tsx` entry is needed.

**Icon bar gap fix:** `!manifest.entry && hasSidebarContainers(manifest)` → the plugin also enters viewRegistry (metadata-only registration) — otherwise an entryless plugin declaring `appearsIn.iconBar` is silently dropped and no icon shows up in the icon bar. Components are loaded by ViewContainerService through the render path; the registry only acts as the metadata/icon entry point (component is empty, optional).

### 2.3 contributes → the registries

`parseContributions(pluginId, contributes)` checks each key and dispatches it to 12 consumption points (commands/menus/keybindings/configuration/configurationDefaults/themes/iconThemes/icons/languages/titleBar/viewsContainers/views/i18n) — **the full list is in `03-contributes-spec.md`**. Unrecognized keys are silently skipped — new contribution points work without changing the loader.

### 2.4 Load order (`initPluginLoader`)

1. Single-source discovery, `plugins:listAll` (the main process scans every subdirectory of plugins/ directly; dev and prod see the same surface) → the full entry list (including packaged/marketplace-installed plugins; glob has been retired)
2. `loadPlugin("startup")` one by one — **disabled plugins are skipped**; manifest/contributes are registered for everything, with **zero JS imports** (JS is lazily loaded by the pool per URL, see §5)
3. Ledger reconcile (two-way tombstones from the diff; entries are stamped, never deleted wholesale)
4. Error rollup → toast + diagnostic log (failed plugins and reasons go to the pluginLoader log channel)
5. Purge zombie cache entries (ghost entries with status="installed" that never actually loaded)
6. Boot sweep of `.disabled/` graveyard orphans (a graveyard copy surviving a restart = an ownerless copy whose same-session undo toast has expired → really delete it + clear the ghost `uninstalled` cache entry)

### 2.5 File watching (hot-plug)

`startPluginWatcher` polls `listDirs` every 2s:
- **A new directory appears** → `loadPlugin` loads it immediately (a repo source tree goes through the Vite chunk; userData goes through install discovery)
- **Loaded, but the directory was deleted manually** → `unloadPlugin(id, "uninstall")` removes the registrations automatically
- Skip conditions (`shouldWatcherSkip`): the state machine is `failed` / `pendingReason` has a value — this keeps the 2s poll from re-entering over and over and blowing up (a lesson from cycle-toast spam regressions)

---

## 3. State machine — `LOADING → ACTIVE / FAILED / PENDING`, unload `UNLOADING → DISPOSED`

```
   PENDING ──loadPlugin──▶ LOADING ──all registrations live──▶ ACTIVE
      ▲                      │                        │ unload/disable
      │                      ▼ load throws            ▼
      └────────── FAILED ◀──record failureReason    UNLOADING
      (retry → LOADING)                              │ rollback complete
                                                     ▼
                                                   DISPOSED
                                                    (reinstall/enable → LOADING)
```

| State | Meaning |
|------|------|
| `pending` | Loading has not started. **Disabled plugins also sit at pending** — they never enter the state machine |
| `loading` | `loadPlugin` is running |
| `active` | All registrations are live and consumable |
| `unloading` | Unloading/disabling — the rollback window |
| `disposed` | Rollback complete, registrations cleared |
| `failed` | Load failed — inspectable through `failureReason` |

**A missing dependency suspends the plugin:** `loading → pending` is also a legal transition — `pendingReason` (e.g. `waiting for dependency: "a"`) records why, and the marketplace list shows "waiting for dependency".

**Transition rules (mechanically enforced):**
- **The unload side converges:** `pending/loading/failed → unloading` is always allowed — **an unload must always be able to finish at DISPOSED** (unloading while loading = race convergence; unloading a failed or never-loaded plugin = an honest clean-up), which stops plugins from getting stuck in an intermediate state.
- **The load side is strict:** illegal transitions such as `active → loading` (double load) only `console.warn` and do not take effect — this catches real bugs.
- **The state machine is a diagnostic surface, not a watchdog:** illegal transitions warn but never throw, and must never be allowed to take the load flow down. The diagnostic surface `getLoadDiagnostics(pluginId)` returns `loadState/failureReason/pendingReason/registeredEffects`.

**Three-way state boundary (do not conflate):**

| Layer | What it is | Who consumes it |
|------|------|------|
| **LoadState (this state machine)** | the diagnostic surface for "why is this plugin not active" | dev panel / diagnostic log |
| **CachedPluginMeta.status** | installation state: `installed` / `disabled` / `uninstalled` | marketplace (a disabled plugin sitting at PENDING does not conflict) |
| **PluginStateService** | plugin-private storage, not a state | the plugin itself, read/write |

---

## 4. Dependency orchestration — `requires`

**`requires: string[]` declares a plugin-level activation-order dependency** (by pluginId: the dependency must be activated before this plugin). The old `extensionDependencies` field is merged in for compatibility (deprecated — use `requires` uniformly).

```json
{
  "requires": ["file-tree", "editor"]
}
```

**Three rules at load time:**

| Case | Behavior |
|------|------|
| **Dependency already active** | load normally |
| **Missing dependency** | **suspend to PENDING** (not a failure) — `pendingReason = "waiting for dependency: "xxx""`, the manifest stays in the pending registry; once the dependency is ready a sweep loads it automatically (topological activation order, so scan order no longer affects activation order) |
| **Dependency cycle** (self-cycle + transitive cycle A→B→C→A) | **fail-loud** — toast + `markLoadFailed`. Cycle detection is graph-level, not pairwise |

**Every plugin load that completes → sweep the pending queue** (load whatever now has its dependencies). Convergence: each round of the while loop continues only if it activated at least one pending plugin; a guard of 1000 is the backstop against extreme race-condition livelocks.

**Unload cascades when a dependency disappears:** when triggered by unload, disable, or directory deletion, first cascade-unload the **active consumers** of the plugin being removed (reverse topological order — during its rollback a consumer may query the dependency's registry contributions, so the dependency must go last):

```
unload plugin A
  → cascade-unload every active plugin whose requires contains A (recursively — their consumers go first too)
  → for each consumer: roll back all registrations + drop to PENDING (waiting for the dependency to return, not unloaded) + pendingReason
  → once the dependency returns, a sweep loads them automatically (automatic revival)
```

**Explicit user disable wins:** a disabled consumer plugin is never auto-activated by a dependency-appears event (disable intent outranks dependency orchestration, which stops a disabled plugin from "coming back to life").

---

## 5. When JS loads — zero shell imports, the pool activates on demand (settled; replaces activationEvents)

> 🔴 **Retired 2026-09-09: the `activationEvents` field has been removed entirely** (the shell-side deferred activation track is fully retired — activation.ts / loader defer / `activatePlugin` / the CommandRegistry pre-activation hook are all deleted, and the field is gone from the three copies of the schema). **The shell always registers the full metadata set at startup** (`loadPlugin(pluginId, "startup")`, zero JS imports); plugin **JS is lazily loaded by the pool per URL**. There is no field to write and nothing to declare — only the two on-demand tracks below remain.

**Metadata is registered at startup:** `initPluginLoader` discovers every plugin → the shell registers manifest/contributes (command display names/menus/config schemas/icon bar metadata are all visible) — **without importing any plugin JS** (zero plugin source in the shell bundle).

**JS loading = the pool's two on-demand tracks (the plugin author's contract):**

| Track | Trigger | Mechanism | Applies to |
|------|---------|------|------|
| **① Surface mount** | a view opens (contributes.views / main-area tab) | the pool's `PluginComponent`/`PluginDetailViewHost` dynamically import the view URL through `resolvePluginViewLoader` (dev `/@fs`, prod `linkdesk://`) | plugins with views/an entry |
| **② on-command activation** | command miss — `window.linkdesk.commands.executeCommand` hits an unregistered command | the pool's preload callback calls back into the renderer → `import` the **owning plugin's entry** (top-level side effects register the command handler) → retry hits | **pure command plugins with no view to open** (the gap where the entry is never imported by any surface) |

**🔴 Contract for pure command-plugin authors: command handlers must live at the top level of the entry (module scope), not only inside a view component.** A `registerCommand` inside a view component only runs when that view mounts — if the plugin has no openable surface (or its surfaces never open), the entry is never imported and the command always misses. Top-level registration means a single import during on-command activation puts everything in place (`import()` module caching is idempotent, so repeated misses do not re-run it). View-style plugins (whose commands are mostly registered in view mount) are covered by track ① by nature and need no top-level duplicate.

**Entry import safety convention:** the entry's top level must not depend on "some DOM container already exists" in order not to crash (view rendering goes through component exports + pool mounting; do not createRoot at the entry top level) — the same as the current main-area tab behavior (the pool already imports the entry directly for main-area tabs).

> **Honest caveat:** track ② is shared by two miss paths — the pool preload's `executeLocal` (shell placeholder commands forwarded through executeRequest) and the pool's direct `executeCommand` call. After a hit it retries once; if the entry import completes and the command still misses (it really is registered only in a view component), the original semantics apply and it rejects with "command not registered in the pool". There is no event-level precision control like `activationEvents` — registering the full metadata set at startup + importing JS on demand is the current model.

---

## 6. Runtime contract — `isActive` + keep-alive + tabBehavior

**The `isActive` prop convention (entry component):**

| Scenario | `isActive` |
|------|:--:|
| Tab is in the foreground and its split panel is active | `true` |
| Tab is covered by another tab | `false` |
| The tab's panel is inactive (with a split, another panel is active) | `false` |

**keep-alive mechanism:** all tab content stays mounted; switching uses CSS `display`. Do not use conditional rendering such as `{isActive && <View/>}` — that destroys Monaco/Canvas state.

```tsx
// ✅ Correct — guard side effects with isActive (hard constraint 14)
useEffect(() => {
  if (!isActive) return;
  editorRef.current?.layout();  // re-layout Monaco
}, [isActive]);

// ❌ Wrong — destroys component state
if (!isActive) return null;
```

**`tabBehavior` (a top-level field) determines tab semantics:**

| Declaration | Behavior |
|------|------|
| default (nothing declared) | every click on the icon → creates a new tab |
| `singleton: true` | only one instance globally. Repeated clicks → focus the existing tab |
| `isFallback: true` | created automatically when no tab is open. Cannot be closed. Only the welcome page declares it |
| `confirmOnClose` | show a confirmation dialog before closing (the value = the prompt text) |
| `identityField` | tab identity field — the same name does not open twice (e.g. workspace declares `"workspaceName"`) |

```json
{
  "tabBehavior": {
    "singleton": true,
    "confirmOnClose": "Close the settings page?"
  }
}
```

> The `invokeBeforeClose` veto loop has been deactivated (that loop was deleted) — the declaration is kept for a future pool-side requests namespace; `confirmOnClose` still works.

---

## 7. Reversible registration — registrationTracker

**Every registration returns a disposer, and unload rolls back in reverse order (LIFO — whatever registered last rolls back first).**

- **Recording:** each `register()` adds its entry to the table and then calls `trackRegistration(pluginId, disposer)` to record a "delete this one entry" disposer.
- **Trigger:** when the module loads it subscribes once to `PluginLifecycle.onWillUninstall` → any plugin with registrations is **rolled back in reverse order automatically** on unload/disable — no manual unregister* clean-up is needed (every per-entry manual clean-up consumer has been removed).
- **Idempotent:** the returned disposer carries a done guard — a manual dispose and a rollback running together do not clean up twice.
- **Fault-tolerant:** one disposer throwing does not interrupt the rest of the rollback (the error goes to the ErrorService diagnostic surface).
- **Coverage:** class-based registries (RegistryBase.track) and function-based registries (Command/Keybinding/Menu/Configuration…, which call trackRegistration directly) share the same mechanism.

**Plugin authors do not have to do anything** — when your component mounts, `registerCommand`/`window.linkdesk.*` registers on the pool side; on unload the shell rolls everything back in reverse order. Unloading is atomic and never leaves ghost registrations from half a plugin behind.

---

## 8. Unload state machine — `unloadPlugin` (the single unload path)

**Three production flows share one unload entry point:** user uninstall, user disable, and the file watcher finding a deleted directory. The order is mechanically enforced by the transition graph (previously 5 lifecycle functions each maintained 5-6 side effects = 30 maintenance points, and 80 commits fixed the same missed spot):

```
unloadPlugin(pluginId, reason, displayName)
  reason = "uninstall" | "disable"
  ① idempotency guard — already unloading/disposed → skip
  ② cascade-unload consumers (cascadeDependents, reverse topological order, see §4)
  ③ clear this plugin's pending registration
  ④ transition → UNLOADING
  ⑤ notifyPluginRemoved — CustomEvent PLUGIN_REMOVED → the shell closes the related tabs + sidebar views
      🔥 must come before onWillUninstall: the shell's revert logic reads the manifest from viewRegistry,
       and the tracker rollback deletes the viewRegistry entry synchronously inside fire — fire first and the revert silently fails
  ⑥ onWillUninstall.fire — the registrationTracker's reverse rollback runs synchronously here (all registrations cleared)
  ⑦ loadedPluginIds.delete + _deferredPlugins.delete
  ⑧ transition → DISPOSED
  ⑨ onDidUninstall.fire — toast (with an "Undo" button) + view refresh + IPC plugin:uninstalled broadcast
```

**Cascade unload (orphanPlugin) follows the same sequence but lands in PENDING:** `unloading → notifyPluginRemoved → onWillUninstall [tracker rollback] → clear collections → pending` — it does not fire onDidUninstall (not a user uninstall, so it is silent; the consequence toast is aggregated by the top-level unloadPlugin: "Plugin X moved to waiting because dependency A disappeared — it will be enabled automatically once the dependency returns").

**Lifecycle event overview (`PluginLifecycle` Emitter):**

| Event | Payload | When it fires |
|------|------|------|
| `onDidInstall` | `{ pluginId, manifest, reason: install/reinstall/enable/startup }` | after all registrations are live |
| `onWillUninstall` | `{ pluginId, reason: uninstall/disable, displayName }` | before rollback (the viewRegistry entry still exists) |
| `onDidUninstall` | same as above | after rollback completes (the viewRegistry entry is gone) |

Consumers (built into the shell; plugins do not care): icon ordering (install/reinstall appends at the end; uninstall removes; disable/enable keeps the position), toasts (silent for startup), view refresh, IPC `plugin:installed`/`plugin:uninstalled` broadcasts (install/reinstall/uninstall only).

---

## 9. Lifecycle operations — install / enable / disable / uninstall / reinstall

### 9.1 Install `installPlugin(sourcePath)` (the zip distribution route)

`sourcePath` adapts to three forms (`isPackageSource`): a directory path / an `http(s)://` URL / an on-disk `.linkdesk-plugin` zip. **The primary distribution route is the zip / URL package source** (single-file zip); directory sources are only a dev convenience.

```
validating → package source: main process plugins:download / plugins:extract → validate before extracting
             (locate the top-level plugin.json in the zip + JSONC parsing + pluginId resolution + zip-slip protection — never leave a half-installed directory)
           → directory source: plugin.json exists + parses as valid JSON
           → pluginId resolution (**manifest.pluginId wins**; the zip basename / source directory name is the fallback —
              **the fallback exists only for legacy third-party plugins**; new plugins always declare it explicitly, see [16-naming-conventions](16-naming-conventions.md); it must pass the safe character set); version is required
           → the target {userData}/plugins/<id>/ already exists → compare versions from disk (resolveVersionConflict):
              same version → skip (the package source removes the duplicate source); different version → reject (upgrades go through checkUpdates/update, no overwrite)
extracting → unzip into {userData}/plugins/<id>/ (wrapper stripped)
           → sanitize the manifest: leftover `distribution` fields are always normalized to user (after the 2026-09-05 flattening there is no builtin/user directory semantics)
           → main process notifyManifestChanged (rescan the LangDef/Protocol/FileAssociation tables)
loading → loadPlugin(pluginId, "install") (the installed bundle path loads immediately)
         → success toast "Installed: name v1.0.0"
```

**Version policy (settled): no overwrite-install** — the same version is skipped (no need to reinstall), a different version is rejected (upgrades go through the update flow, see [04-distribution-format §4](04-distribution-format.md)). A real upgrade = stage → atomic replace → revert to the old version on failure (`PluginUpdateService`).

### 9.2 Enable `enablePlugin(pluginId)`

Remove from the `disabledPlugins` list → `loadPlugin(pluginId, "enable")`. Takes effect immediately for a repo source tree; for installed (userData bundle) plugins, if runtime dynamic injection is not possible it returns `needRestart: true`.

### 9.3 Disable `disablePlugin(pluginId)`

Add to the `disabledPlugins` list + persist → mark the metadata cache `disabled` → **theme/language fallback** (if the current theme/language comes from this plugin → switch to a replacement) → `unloadPlugin(pluginId, "disable")`. **The plugin files are kept** and skipped on the next startup. Disable → iconOrder keeps the position (restored when re-enabled). Comparable to VS Code's "Disable Extension".

### 9.4 Uninstall `uninstallPlugin(pluginId)`

1. `core: true` guard first — for core:true plugins the uninstall button is not shown/disabled in the UI (**a mistaken-deletion flag, not a category**: the shell depends on such a plugin for basic interactions like the settings page and the marketplace)
2. **Two branches (after the 2026-09-05 flattening)**:
   - the target lives in `{userData}/plugins/<id>/` (installed from a zip) → **really delete the directory + settle the account with `PluginInstallService.remove`** (writes a removed marker — boot sees the marker and does not restore it automatically)
   - the target lives in the repo source tree (an app plugin) → move it to the `plugins/.disabled/<id>/` graveyard + it can be reinstalled (a lesson from Windows file locks on cross-directory rename: copy+remove, not rename)
3. mark the metadata cache `uninstalled` (the marketplace can still browse details after uninstall)
4. theme/language fallback → `unloadPlugin(pluginId, "uninstall")`
5. clear the disable list (uninstall outranks disable) → sync enums → toast "Uninstalled: name" → `notifyManifestChanged`

### 9.5 Reinstall `reinstallPlugin(pluginId)`

For source-tree app plugins: copy from `plugins/.disabled/<id>/` back to `plugins/<id>/` → `loadPlugin(pluginId, "reinstall")`. Reinstalling an installed plugin = running the install flow again (9.1). Comparable to VS Code keeping a local copy after uninstall for one-click reinstall — **any plugin that can be uninstalled must restore all of its contributions in the same session when reinstalled** (see 9.6).

### 9.6 🔥 The uninstallable ⇒ reinstallable contract

**For any plugin, if it can be uninstalled, reinstalling must restore all of its contributions immediately in the same session** — regardless of the plugin's shape: repo source tree or installed state, with or without an entry, core flag or not (core is only a mistaken-deletion flag, not a category exception).

**Implementation dependency:** the normalized plugin root URL entry `resolveRuntimePluginRoot` (the same one-liner `dev ? /@fs/{abs} : linkdesk://{id}`) — for entryless plugins (pure views/commands contributions) the `views` registration fallback chain depends on it for dynamic imports. It once broke because the pluginRoot assignment was hard-tied to `manifest.entry` (view loading failed after reinstalling an entryless plugin) — now fixed.

---

## 10. Error handling

| Error | Shell behavior | Plugin's responsibility |
|------|------|------|
| malformed plugin.json | skip the plugin + toast + `markLoadFailed` | validate the format (use `$schema` in your IDE for autocomplete) |
| `minAppVersion` not satisfied | toast "requires app version ≥X" + `markLoadFailed` | declare a conservative minAppVersion |
| dependency cycle | toast + `markLoadFailed` (fail-loud) | don't create cycles — check the requires topology |
| missing dependency | **suspend to PENDING** (not a failure) — loads automatically once the dependency is ready | install the dependency first |
| entry file not found | toast + `markLoadFailed` | make sure the entry path is correct |
| runtime JS load failure (possibly not built) | toast "possibly not built" — **does not block**: contributes are still registered | build before installing |
| React component throws | ErrorBoundary catches → ""Plugin name" crashed [Retry]" | don't write code that crashes |
| a disposer throws during unload | no interruption — registrationTracker tolerates errors per entry and sends them to the diagnostic surface | — |
| concurrent loadPlugin (StrictMode double-mount) | the second waits for the first Promise (hard constraint 13) | — |

---

## 11. Comparison with VS Code

| Dimension | VS Code | LinkDesk |
|------|---------|----------|
| Activation timing | many `activationEvents` (onLanguage/onCommand/workspaceContains…) | **no event field** (retired) — the full metadata set is registered at startup; JS is loaded by the pool on demand |
| Lazy loading | extension JS imported on demand | zero JS imports at shell startup; the pool is the only JS executor — a surface mount lazily loads the URL / a command miss imports the entry (on-command activation, §5) |
| Load scanning | scan `extensions/` at startup | single-source discovery, `plugins:listAll`, scanning directly in the main process (same surface in dev/prod) + 2s polling for hot-plug |
| Dependencies | `extensionDependencies` | `requires` (string array) + suspend to PENDING / cycle fails / cascade unload |
| Uninstall | Disable / Uninstall | installed state = really delete the directory + settle the account (a removed marker, boot does not revive it); repo source-tree app plugins = move to `.disabled/` as a **same-session** undo (orphans surviving a restart are cleaned automatically at boot) |
| Clean-up | manual unregister in onWillUninstall | **registrationTracker rolls back automatically in reverse order** (zero manual clean-up) |
| core plugins | cannot be uninstalled | `core: true` plugins have no uninstall entry in the detail UI (a pure mistaken-deletion flag — the API/command layer can still uninstall and disable them; after uninstall a removed tombstone is written and they do not come back) |

---

> **← Previous:** `01-plugin-api-contract.md`
> **→ Next:** `03-contributes-spec.md`
> **→ Related:** `04-distribution-format.md` (the file shapes of install/uninstall)
> **All documentation index:** `00-readme.md`
