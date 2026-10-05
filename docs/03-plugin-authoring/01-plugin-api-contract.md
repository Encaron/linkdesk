# 01 — Plugin API Contract

> 2026-08-04. **`window.linkdesk.*` — the complete set of system-level capabilities a plugin developer can call.** Web platform capabilities (Canvas/WebGL/WebRTC/fetch, etc.) are unrestricted — only system-level capabilities go through this API.
>
> **Update:** after the single-WebView rollback, the `linkdesk.*` API is the only sanctioned way for plugins to reach the shell. ESLint blocks direct imports of `ConfigurationService/FileService/pathUtils` at `error` level.
>
> **Update:** this document has changed from a "hand-written namespace table (a second source of truth)" into a **pointer** — method details are no longer hand-written; the single source of truth = the **generated contract file** `contracts/linkdesk.d.ts` (see §3). The principles and navigation remain.
>
> **VS Code analogue:** the `vscode` namespace.

---

## 1. Design Principles

| Principle | How it shows up |
|------|------|
| **Core knows nothing** | The shell doesn't recognize any plugin's pluginId |
| **Contract first** | Plugins go through `window.linkdesk.*`, not `import @src/core` |
| **Sync first** | APIs that can be synchronous aren't wrapped asynchronously (`path` is pure functions, no IPC) |
| **Security** | The plugin preload is narrower than the shell's — **the only missing namespaces are `bridge` and `storage`** (shell-main-control only: the envelope for plugin IPC requests that the main process forwards to shell-side services); and the preload sandbox has zero Node capability (no `require`/`fs`/`child_process`) |

---

## 2. Shell vs Plugin — API Differences

Plugins and the shell run in the same renderer process, but the injected namespace surfaces differ. **Which process each surface is available in, and how the pool/shell/mock coverage works — the single source of truth is [Namespace Matrix §2 coverage table](../02-Electron架构/归一化基建/契约生成/命名空间矩阵.md#2-命名空间--四面覆盖矩阵)**; no second list is hand-written here.

A few key points (a summary of Matrix §2; the matrix wins on details):

| Fact | Explanation |
|------|------|
| **The contract has 47 namespaces** | The pool injects 45 (shell-only faces `bridge` and `storage` are not injected into the pool); the shell injects 26; mock injects 13 — **the live readings of the `check-namespace-matrix` gate are authoritative** (this row is mechanically reconciled by it; ⛔ do not copy the comment in `surfaces.ts` — that one drifts too) |
| **Pool = the plugin runtime source of truth** | Plugins run in the pool preload — namespaces injected by the pool are **required**; `bridge` is real-shell-only |
| **"Shell-only" ≠ plugins can't call it** | `window.*`/`shell.*`/`hotExit.*`/`getFilePath` **are actually injected in the pool** — the older version's ❌ shell-only marking for those surfaces was wrong |
| **Contract required-surface drift is now zero** | `env.get(pluginId)` forwarding, `clipboard.readText` shell completion, `dialog.openFile` shell completion — all three are implemented, with no `?` degradation |

> **That table only says which surfaces are callable — not what can be read.** Read surfaces (reading "what is open right now / what is waiting on the user") get their own section — see §3.3: **an API with an operation surface but no read surface is half-finished** (you can open a tab, yet you cannot read which tabs are open).

---

## 3. Complete API Definition → Pointer

### 3.0 The Single Source of Truth

**Every method signature, parameter, return value, and payload type for `window.linkdesk.*` = [contracts/linkdesk.d.ts](../../contracts/linkdesk.d.ts)** (auto-generated; do not hand-edit).

- **Generation sources:** `src/core/api/linkdesk-api.ts` + `linkdesk-api/` (16 domain interfaces) + `src/core/types/ipc/*` + `src/core/types/pool/*` (wire payload types)
- **Generator:** `scripts/generate-contract.mjs` (Route C — the contract type file is the source; pure types bundled into a single file)
- **Mechanical gate:** the preload on both sides `satisfies` the contract surface types → tsc drift gate; `contracts:check` byte-compares hashes inside `npm run check`
- **Coverage matrix:** every namespace × pool/shell/mock coverage → [Namespace Matrix §2](../02-Electron架构/归一化基建/契约生成/命名空间矩阵.md#2-命名空间--四面覆盖矩阵)

### 3.1 How Plugins Consume It

**Path A — repo tsconfig alias (plugins inside this repo):** the root `tsconfig.json` already configures `"@linkdesk/contracts": ["./contracts/linkdesk.d.ts"]`, so type imports go straight to the contract file:

```typescript
// Types — the named surface interfaces in the contract file (`import type`, zero runtime coupling)
import type { FileEntry, PluginStateChangedPayload } from "@linkdesk/contracts";

// Runtime — ambient types come straight out (the file declares global Window.linkdesk; no import needed)
async function list(): Promise<FileEntry[]> {
  return window.linkdesk.filesystem.listDir("/workspace");
}
```

**Path B — standalone npm package (third-party plugins):** after `npm i -D @linkdesk/contracts`, use the same `import type { ... } from "@linkdesk/contracts"`.

> **Package shape (built):** `contracts/` is the npm package root (`@linkdesk/contracts`, its `types` entry points straight at `linkdesk.d.ts`, zero build, and the `files` allowlist contains only the d.ts). **Independent version axis (decoupled 2026-09-06; the version no longer follows the shell):** the package version **no longer follows the shell** — a software upgrade (the user axis) ≠ a contract upgrade (the author axis); the version only bumps and publishes when the `window.linkdesk.*` API surface changes. **Content detection is not withdrawn**: d.ts/runtime-shapes are compared byte-for-byte against the shell source, and any drift turns `contracts:check` red (change the API and forget to regenerate = your commit is stuck); **shelf cadence = the check-npm-release yellow light gate** (author-facing content changed + version untouched → a reminder to bump+publish). **Consumption-shape acceptance:** `contracts-example/` at the repo root — a standalone tsconfig + local `file:../contracts` reference, `npx tsc --noEmit` reporting zero errors, and zero `@src/core` throughout (`npm pack` produces a tarball → the real npm package path passes too). **Release state:** ✅ genuinely published `@linkdesk/contracts@0.1.0` (2026-09-04) + `@linkdesk/contracts@0.1.1` (2026-09-06, the first independent-axis version after decoupling) + `@linkdesk/contracts@0.1.2` (same day, 2026-09-06; 0.1.1 shipped with the stale "version linkage" README → README fixed and republished, d.ts unchanged) — third parties can `npm i -D @linkdesk/contracts` to install the real package straight from the registry; real-package tsc acceptance has passed. plugin-sdk and `@linkdesk/ui` were genuinely published in the same period.

**Path C — copy the file:** copy `contracts/linkdesk.d.ts` into your plugin project and reference it from tsconfig. The contract file is self-contained (94 declarations, zero import dependencies), so copying just works.

> **Pick any one of the three paths; `import type { ... } from "@src/core"` is forbidden** — that's stealing shell source types (see §5).

### 3.2 Runtime Semantic Conventions (the things a d.ts can't express live here)

> Method signatures follow the contract file; below are the **behavior contracts** that don't fit into types — plugins must code to them.

| Namespace | Runtime convention |
|------|------|
| **events** | Channel naming `<plugin id>:<data name>` (e.g. `serial:rawData`, `sbq-protocol:parsed`). The shell broadcast event table is below |
| **quickPick** | The Promise resolves a **structured copy** (contextBridge structured-clones across worlds, so `===` against the original object won't work); Escape / clicking the scrim / blur / being displaced by a new `show()` → resolves `undefined` (last-wins); a non-array `opts.items` → reject. Shell overlays take priority. **Make the call inside a component effect** — the shell-side execution half calls `show` without this API and is a no-op |
| **viewContainer** | **Metadata flows one way**: view registration follows plugin.json `contributes.views`; `registerView` on an existing view only overwrites metadata, while `render` keeps the original component; a `descriptor` carrying `render`/`actions`/`pinnedContent` is stripped by the pool-side allowlist (it can't cross IPC); querying a nonexistent container/view → `undefined`/`[]` |
| **decorations** | **Synchronous contract**: `provideDecoration` returns `FileDecoration \| null \| undefined` and **must not return a Promise** (async providers are skipped); a repeated `registerProvider` for the same pluginId idempotently overwrites; unregister/register automatically fires a full refresh notification `onDidChange([])`; if a provider throws, that entry is self-healed away |
| **filesystem** | Plugin permissions: read/write its own data directory, read the workspace directory, **other plugins' directories are off-limits** |
| **configuration** | Config key naming rule `<pluginId>.<property>` (e.g. `editor.fontSize`, `serial-monitor.baudRate`) |
| **pool (shell×pool intent channels)** | Pool→shell **upward intent** has only two umbrella methods (`pool.sidebarAction(action)` / `pool.tabAction(action)`), dispatched by their `action` payload. Four of those are the equivalent of "**just drag it**" (all four registered in this document; ①–③ each also has a **non-mouse command counterpart**, so an AI/script never has to drag): ① `sidebarAction({ action: "setSidebarWidth", width })` — the same path the main-sidebar divider drag commits through (shell `useSubscriptions` → `LayoutEngine.resizeZone`, clamped by the dock declaration, 170–600) → commands `workbench.action.setSidebarWidth(width)` / `…resetSidebarWidth` (back to the 280 default); ② `tabAction({ action: "updateSplitSizes", branchIndex, sizes })` — where a split divider drag commits (shell `useTabManager.updateSplitSizes` → the SplitNode tree) → command `workbench.action.resetSplitSizes` (**every** branch back to 50/50); ③ the event `events.emit("panel:resize", { height })` — where dragging the bottom panel's top handle commits (the shell consumer routes **axis-aware**: for a panel with `edge ∈ {left,right}` it uses the width axis `resizeZone`, for `top/bottom` the height axis `resizeZoneHeight`) → commands `workbench.action.setPanelSize(size)` / `…resetPanelSize`; ④ `sidebarAction({ action: "reorder", containerId, viewId, newIndex })` — the same path a sidebar-view drag-reorder commits through (the shell reorders containers/views and persists it — **pool API outlet only, no host command**: usable from pool-side code, not yet reachable by an external AI (CLI/MCP)). ⚠️ The first three are **pool infrastructure** (used by the Zone dividers themselves), **not** a linkage mechanism plugins should call — to change the layout, use the commands above (`window.linkdesk.commands.executeCommand`) and ⛔ do not emit the pool-internal channels directly (the event names carry no plugin prefix, and how the shell routes them is an implementation detail). |
| **serial** | **Multi-port routing:** the `portName` of the open/close/action-targeting interfaces is **optional** — omitted = the single open port (0 ports throws "serial port not open"; ≥2 ports throws "multiple serial ports open, please specify portName"; **failures are visible, never silent**). The three streaming channels (`onData`/`onStats`/`onSystem`) carry **object** payloads with a `portName` routing key (`SerialDataPayload`/`SerialStatsPayload`/`SerialSystemPayload`) — subscribers filter by **their session's port** (key=portName is the generic routing-key pattern: whoever consumes filters; the shell does not collect on their behalf). Each tab is still single-port, and the session-to-port binding lives on the plugin side |
| **panel** | `panel.reveal(viewId)` focuses a Bottom Panel view through declarative addressing — panel hidden → expand it and switch to that view (the same mechanism as Ctrl+J); already shown → switch and focus; **viewId not in the panel container → no-op** (no error). **`panel.moveToEditor` has been removed** (deprecated content migration — moving position is the job of the layout command). `panel.revealFloating(viewId)` pops a view out as an in-shell Floating Panel (type B) — declared addressing. Declarative addressing = the ViewContainerService global view index (`contributes.views` registers a view in **any container**, not just panel — plugins declare `contributes.floatingPanel.viewId` to reference it). **Identity toggle key**: no panel → open; same view → close (toggle); another panel → replace; **viewId undeclared / declaring plugin not installed → no-op** (no crash). Default panel actions = "Open in main window" (appears only when the declaring plugin can open as a tab) + maximize toggle + close. **`panel.setFloatingBounds({ top, left, width, height } | null)`** — the **non-mouse path** for floating-panel geometry: set position/size precisely (omitted fields keep their current value, `null` resets to the default centered card; no-op when no panel is open). Out-of-range values are clamped by **the same bounds as dragging** (`MIN_HEIGHT` / right-edge limit / 6 px inset). Read back via the command `workbench.action.getFloatingPanelBounds` (returns the last settled geometry). |
| **hotExit** | Crash recovery only — dirty content is written to disk at `%APPDATA%/linkdesk/hot-exit/` (a single-source path convention owned by the main process; plugins never write there directly); after saving/closing a tab, call `clear` to delete the backup |
| **shell** | Shell-level OS actions: `showItemInFolder(p)` highlights a single file in Explorer / `openInTerminal(dirPath, terminalExe?, customCommand?)` opens an external terminal / `startDrag(filePath, iconPath?)` drags out to the desktop. **`pluginLocation(pluginId)` / `openPluginFolder(pluginId, kind)` are the plugin-disk-location pair** — the former returns `{ installDir, dataDir } | null` (**it hands over identity, not the right to assemble paths**: the main process resolves paths and the plugin takes the result; not found on disk → `null`; `dataDir` is non-`null` only once the plugin has **actually written to disk**, and empty/absent means that row shouldn't be drawn); the latter's `kind: "install" \| "data"` opens the directory **contents** in Explorer (the same feel as `appearance.revealStorage`, not `showItemInFolder`'s single-file highlight) — the `install` directory not being on disk throws, while `data` creates an empty directory first, then opens. **`relaunch` genuinely restarts the app** (quits and relaunches the process) — ⚠️ **injected by the shell preload only (the contract marks it `?` optional)**, so pool-side callers must check existence first (`window.linkdesk.shell.relaunch?.`). The difference from `window.location.reload` is **whether the pool survives**: the pool is a separate `WebContentsView` that a shell reload does not rebuild, so after updating a view-type plugin a reload only shows the old bundle; after `relaunch` the current process terminates immediately, so **don't rely on its return value** (the Promise never settles). **`openExternal(url)` is the controlled external-link face** — it hands a URL to the system's default program (four whitelisted protocols; anything else is refused on the spot); see the "External links" paragraph at the end of this section |
| **appearance** | `revealStorage` opens the appearance storage directory (`userData/appearance`) — the main process resolves the path and uses `shell.openPath` to open the Explorer **contents** (not `showItemInFolder`'s single-file highlight); a missing directory is created as well (opening it shows the storage location, and an empty directory is legal), while an `openPath` failure throws and fails loud. Returns `Promise<void>` |
| **app** | `app.getVersion` = the host software version (`Promise<string>`, read-only) — the only runtime source = Electron `app.getVersion` (a single point in `package.json`, 02 §2.3); **the entry point for comparing the main software version** (consumed by marketplace minAppVersion and the update check). The shell also has a private `getProductInfo` extension (the data source for the about page's 8 fields — not in the contract, so pool plugins can't call it) |
| **tabs** | **Cross-window resource event wiring:** `updateLabelBySourceId(sourceId, label)` / `closeBySourceId(sourceId)` = **whole-window broadcast semantics** — the resource holder's tab updates/closes in the main window and in every detached window; `sourceId` is the globally unique resource identity (file path/session id), and a change to it is a global fact (the wiring **does not require the caller to be in the same window as the tab** — a detached window's tab updates the moment the sidebar renames or deletes the resource, matching VS Code). `focusBySourceId(sourceId)` = **routed by originating window** (a view action that focuses one specific window, not a global fact). **No new APIs** — it reuses existing surfaces; this behavior contract is guaranteed by the whole-window broadcast |
| **notifications** | **The only notification surface is the wide status bar bell panel** (the narrow bottom-right toast path was deleted wholesale) — no cards popping up, no focus stealing, no blocking; the unread count increments and the user only sees it after clicking. **Don't treat it as a "must be seen" channel**: when the user has to decide right now → `dialog.confirm`. **`show` always returns a handle** (`{ update, finish, cancel }` — **and not only when `progress:true`**); **a notification can only be updated/removed by the handle that created it**, and a `show` with the same text elsewhere = a different notification. `progress:true` turns on a real progress bar: `update(msg, percent?)` gives a determinate 0-100 bar, while omitting percent = an indeterminate animation; `finish(msg?)` closes it and optionally adds a completion notification; `cancel` just closes it with nothing added. `persistent:true` = stays put and doesn't auto-dismiss (for error diagnostics), waiting for the user to click ×. **The persistent quota is bucketed by `source`, 5 each**; overflow evicts the oldest from that same source and shows a summary hint (persistent ≠ archived — write your own file if you want a record). `source` = **the machine-read attribution key, containing no human copy** (the shell resolves the human-readable name) — ⚠️ **it cannot be injected automatically**: the pool is a single-process shared realm and all plugins share one `window.linkdesk`, so the preload has no way to know which plugin's tree issued this `show` ⇒ **only the author can explicitly report their own plugin id** (the shell's own domains use `app.<domain>`); **omit it → everything lands in the "Other" group**. `actions` clicks go through the shell's `executeCommand(command, args)`, with the handler self-registered by the plugin |
| **dialog** | `confirm`/`alert`/`open`/`openFile` = shell-rendered modal dialogs (they take focus, with a focus lock). **`confirmContent(options)`** = **rich-content confirmation** — the dialog is still the shell (centered/scrim/Esc/focus lock/click-scrim-to-cancel) while **the content = a plugin-drawn view** (`pluginId` + `viewId` declarative addressing + an opaque `payload`, matching VS Code's "the dialog is the shell, the content is the plugin's"). **How the content side reads it**: once the view mounts, get data through `dialogHost.current?.content?.payload` (`open !== true` → `null`, defensive so you don't get a blank screen); **there are only two settlement paths, `dialogHost.confirm` / `dialogHost.cancel`** (don't close the dialog yourself — the shell won't recognize it). **The fallback is hard**: if `viewId` can't be resolved (undeclared / declaring plugin not installed) → the shell **falls back to a plain text confirmation** (using `title`/`message`); the dialog still appears and never dies silently ⇒ so don't omit `title`/`message`. `payload` crosses IPC by structured clone ⇒ only cloneable data can go in it |
| **search** | Full-text search/replace — `searchFiles(opts)` is a single call-and-response executed by the shell/main process over IPC (zero local scanning on the plugin side); the request/result shapes follow the contract's `SearchWireOptions`/`SearchWireResult` |
| **encoding** | The encoding detect/convert quartet (handled by the main process EncodingService): `detect(buffer)` guesses the encoding name / `decode(buffer, encoding)` bytes→text / `encode(text, encoding)` text→bytes / `isBinary(buffer)` decides whether the bytes are binary (`Promise<boolean>`) — `Uint8Array` in and out. **Binary detection belongs to the shell, a single source of truth**: a plugin that reads a file and intends to render it as text asks `isBinary` before calling `decode` instead of guessing from the extension (extensions lie, content does not). `isBinary` is a **later addition**: older hosts don't have it, so feature-detect before calling (`lk.encoding?.isBinary`) and fall back to the plain-text path when it is missing |
| **update** | **Read-only update state**: `getState()` returns the host's full update state-machine snapshot (a nine-state discriminated union — `uninitialized`/`disabled`/`idle`/`checking`/`available`/`downloading`/`downloaded`/`updating`/`ready`; the payloads follow the contract's `UpdateState`); it **never throws** (the service always has a state). For "About"-style plugins to display version/update progress — **read-only**: triggering download/install is the shell's own business (the host's `update.*` command segment; plugins don't add commands to it) |

**Shell broadcast events (plugins can subscribe via `events.on`):**

| Channel | payload | When it fires |
|------|------|------|
| `theme:changed` | `{ themeId, themeType, variables }` | The user switches theme (CSS variables are injected automatically; no manual subscription needed). **The `variables` payload includes the font-size variables `--font-size-*` + `--ui-scale`** (global font scaling rides the existing theme channel, with **no new event**; see 05-ui-conventions §10 for font-size consumption tokens) |
| `iconTheme:changed` | `{ iconThemeId, mappings, fontFaces?, glyphCss? }` | The user switches icon theme (the `app.iconTheme` setting). `iconThemeId` = the chosen icon theme id; `mappings` = that theme's mapping table (an `IconThemeMappings` shape, with image assets already resolved to `linkdesk://` absolute URLs), or `undefined` when it is `"default"` (consumers fall back to codicons as a safety net). `fontFaces`/`glyphCss` = the @font-face specs and glyph class CSS source when the theme declares a custom font (the `font` section at the top level of the mappings JSON) — the pool preload already injects them into the pool document automatically (custom icon font rendering; consumers don't need to handle it); absent when there is no font section or it is `"default"`. The top level of `mappings` may declare 5 default icons `file`/`folder`/`folderExpanded`/`rootFolder`/`rootFolderExpanded` (single entries, matching VS Code iconTheme top-level keys) — when nothing matches the table (ordinary folders/new files/root folder) consumers use the theme's default icon instead of a codicon; absent = codicon safety net. **Only the mapping itself doesn't take effect automatically — plugins that need custom file icon visuals subscribe manually** (e.g. a file tree swapping icons per `mappings`, matching VS Code `onDidChangeProductIconTheme`) |
| `lang:changed` | `{ lang, resources }` | The user switches language |
| `workspace:changed` | `{ rootPath }` | The user opens/switches a folder |
| `plugin:installJobs` | `{ jobs: InstallJob[] }` (**a full snapshot, not a delta**) | The shell-side install/uninstall queue changes (added: stage and percent; added: `kind`·`cancellable`). `InstallJob` = `{ jobId, pluginId, origin: "user"\|"dependency", kind: "install"\|"uninstall", cancellable: boolean, displayName, state: "queued"\|"running"\|"settled", terminal?: "success"\|"failed"\|"parked", error?, stage?, percent?, message? }` — **every broadcast is the whole table**, so consumers **replace their local mirror outright** instead of merging deltas. **Late subscribers get the latest full table**: the pool preload caches one at the top level and replays it synchronously on subscribe (a remounted view never gets stuck on an old snapshot). ⚠️ This is a **public event surface**, not a marketplace-private pipe — any plugin can subscribe and build its own progress UI; ⚠️ **`stage`/`percent`/`message`/`kind`/`cancellable` are additive-only fields**, so older consumers can simply ignore them. ⚠️ `origin: "dependency"` = a dependency some plugin dragged in, nested inside the row that initiated it (`origin: "user"`) |

**External links (`shell.openExternal`)** — when a plugin wants the user's browser / mail client / some registered-protocol desktop app to open a URL, call `window.linkdesk.shell.openExternal(url)` (returns `Promise<void>`). ⛔ **Don't use `window.open`**: inside the pool, `window.open` is denied across the board by the shell — whitelisted protocols are handed to the system, everything else never creates a window, and a bare Electron window is never produced. **Only four protocols can be opened**: `http:`, `https:`, `mailto:`, `vscode:` (`vscode:` is the sample of a "constant-registered protocol" — VS Code writes that protocol into the registry at install time, and the host merely **hands it over**; it does not know whether the other side is installed, and when it isn't, Windows itself offers "How do you want to open this?"). **Anything else is refused** — `file:` (pointing external input at an arbitrary local path) and `javascript:` / `data:` (executing external input as a script) are explicitly refused; a refusal means this Promise **rejects** (it is not silent), so callers should catch it and tell the user something. To read or write local files, use `workspace` / `filesystem` — ⛔ don't route around through the OS shell. The complete whitelist lives in [16-naming-conventions](16-naming-conventions.md) §7, row "Allowed external protocols (openExternal)" — adding a protocol is a **public-surface decision** (change the host constant and regenerate the ledger); it is not something a plugin can open up by itself.

### 3.3 Read Surfaces — the machine-readable outlet for "what is open / what is waiting"

§3.1/§3.2 describe the **operation surfaces** (what a plugin can do); this section describes the **read surfaces** (what a plugin/AI can **read**).

**Why it gets its own section:** a complete operation surface does not add up to automation. If you can open tabs and raise notifications but cannot read "which tabs are open / what is stacked in the notification panel / whether a dialog is waiting on the user", an external driver (AI, scripts, remote control) can only guess — and **a guessed state that disagrees with the screen becomes a false source of truth**, which is worse than having no read surface at all.

| Read surface | Method | What you get |
|:--|:--|:--|
| **Notifications** | `notifications.list()` | The state of the bell's wide notification panel — count, unread count, each entry's text and buttons, wake and persistence criteria. The return value **is the panel's own DTO** (`NotifLayout`, produced by the same `buildNotif` as `pool.onLayout`'s `statusBar.notif`) |
| **Notification changes** | `notifications.subscribe(cb)` | A "**it changed just now**" signal (added/updated/dismissed/acknowledged, panel opened/closed). 🔴 **The callback carries no payload** — call `list()` again for the answer (the same "state push + pull on demand" split as `events.on`) |
| **Tabs** | `tabs.list()` | The tab listing for **all** windows (`TabsSnapshot`: `windowId`/`mode`/`ready`/`activeGroupId`/`root`/`groups`, each group carrying `activeTabId`). Produced by the **same `serializeGroups`** as the layout tree pushed to the pool ⇒ the listing's `label`/`icon` necessarily match the tab drawn on screen |
| **Layout** | `pool.getLayout()` | The snapshot body of the **most recent** `onLayout` in this window (tree `root` + groups `groups`). No push has arrived yet → `null` (⛔ never invent an empty layout) |
| **Dialogs in flight** | `dialogHost.pending()` | The confirm/alert currently on screen waiting for the user (`options` verbatim + `kind` + button labels + rich-content view identity). An empty array = nothing is open right now |
| **Command metadata** | `commands.getCommands()` | Every command's `id`/`title`/`category`/**`description`**/**`params`** (the latter two exist since M1; `params[i]` corresponds positionally to the handler's argument) — the command list itself is a structure you can **feed straight to a large model as a tool list (function calling)** |

> Method signatures follow [contracts/linkdesk.d.ts](../../contracts/linkdesk.d.ts); the table above only answers "which ones exist and what they read".

**Three rules for read surfaces (for implementers and consumers alike):**

1. **A read surface ≡ the screen, one single ruler.** It must return **the DTO that the screen is drawn from**, ⛔ never a separately computed summary — two rulers inevitably disagree: if the grouping/unread count/text you read differs from what is painted, the read surface has become a false source of truth.
2. **Signals and answers are separate.** A subscription only answers "**it changed**" (no payload); answers always come from `list()`. Put data in the signal and someone will stop asking the authority, and a second ruler grows back.
3. **Text is already resolved — display it as-is.** Text fields such as `bellTitle`/`panelTitle`/group labels/`timeLabel` are **already resolved by the shell with `t()` in the current language** (the display-text rule) — display them verbatim; do not run i18n again.

**Boundaries (all of them "honestly report not knowing", not defects):**

- In a **detached window**, `pool.getLayout()` returns a strategy subset (`WINDOW_MODE_STRATEGIES`: `detached` = `titleBar`+`groups`; `drift` = `titleBar`+`panel`) — `statusBar`/`sidebar`/`iconBar` do not exist there. To see the whole picture across windows, use `tabs.list()` (ask the shell).
- `tabs.list()` returns **all windows in one shot**: the shell has no "current window" source of truth ⇒ filter by `windowId` yourself (⛔ do not expect the shell to guess which window you mean).
- `notifications.list()` asks the **shell** via `plugins:call` (the shell holds the full state) — so it **also works in a detached window** (reading this window's layout subset would answer "no notifications").
- In `dialogHost.pending()`, `buttons` is **in declaration order** (`[confirm, cancel]`), **not the left/right positions on screen** (measured: the screen paints cancel on the left and confirm on the right). To act, call `dialogHost.confirm()`/`cancel()` by index, ⛔ never by visual position.
- **Pool-side only, not implemented in the shell:** `tabs.list()` / `pool.getLayout()` **do not exist** in `preload-shell` (the shell already holds that state in hand and will not ask itself over IPC). Shell views that need them should go through the shell's own services.

**Adding a read surface later:** the criterion is one sentence — **"if it is on screen, the machine must be able to read it."** Before adding one, ask three questions: ① does it return the DTO the screen is drawn from? ② does it spawn a second piece of state / a second ruler? ③ does a consumer have a workaround that does not need it (if not ⇒ it is a gap, not an optional extra)?

### 3.4 Differences from the Old Hand-Written Version (note for readers)

The old §3.x per-namespace method list has been deleted (= a hand-written second source of truth, guaranteed to drift). The generated contract resolved several places where **the old docs disagreed with the implementation**:

| Point | Old hand-written version | Contract/implementation reality |
|------|------|------|
| `serial.listPorts()` | Written as `getPorts()` | The contract says `listPorts()` — the implementation always used that name; the old doc had a typo |
| `serial.onData/onStats/onSystem` | `cb: (d: any)` / string | **Object payloads**: `onData(p: SerialDataPayload)` / `onStats(p: SerialStatsPayload)` / `onSystem(p: SerialSystemPayload)` — all three channels carry a `portName` routing key (`SerialStats` was deleted; no dead type tail) |
| `decorations.provideDecoration` | Written as possibly returning `Promise<FileDecoration>` | The contract is **sync only** (providers that return a Promise are skipped) |
| `pluginState.onChange` | Comment said "available once multi-WebView is restored" | The pool already injects onChange — subscribing works; subscribe to the wildcard key name via `events.on("plugin-state:changed")` (re-exports `PluginStateChangedPayload`) |

---

## 4. IPC Reliability Conventions

1. **Every invoke has a 10s timeout.** A timeout throws an `Error`
2. **Return values can be falsy.** `""`/`0`/`false` are legitimate values. Use `isNaN(n) ? default : n`, not `n || default`
3. **Use a ref bridge when an IPC callback needs React state**
4. **The `onChange` callback pattern** (configuration/language) — returns an unsubscribe function; call it on component unmount to clean up

---

## 5. Prohibited

| ❌ | ✅ Instead |
|---|---|
| `import { normalizePath } from "@src/core/pathUtils"` | `lk.path.normalize(p)` |
| `import { getConfigurationValue } from "@src/core/ConfigurationService"` | `lk.configuration.get(key)` |
| `import { listDir } from "@src/core/FileService"` | `lk.filesystem.listDir(p)` |
| `import { getWorkspaceFolders } from "@src/core/WorkspaceService"` | `lk.workspace.getFolders()` |
| `import type { FileEntry } from "@src/core/types/fileEntry"` | `import type { FileEntry } from "@linkdesk/contracts"` |

**ESLint `error` (`noCoreImportInPlugin`, tightened to include `import type`):** `import { ... } from "@src/core/..."` **and** `import type { ... } from "@src/core/..."` → 🚫 compile failure. Test files are no longer exempt (the vitest single-process rationale no longer holds).

**Allowed imports (shared controls come from the `@linkdesk/ui` npm package; the full `@src/core` exception allowlist lives in `eslint-local-rules.js` PLUGIN_IMPORT_WHITELIST):**
- `@linkdesk/contracts` **types** (`import type`, zero runtime coupling) — the real registry package (see §3.1)
- `@linkdesk/ui` **shared controls / shared hooks** (ContextMenu / InlineInput / SelectBox / Toggle / ColorPicker / FormRow / ThemePicker, etc., consolidated) — **declare it explicitly in your own project's `dependencies`**, with the same version number as the shell you support (shell `0.2.13` ⇒ `"@linkdesk/ui": "^0.2.13"`; see [19-Component Cheatsheet §2.1](19-component-cheatsheet.md) for the version line) and build against the published package. ⛔ **Do not import its css** (styles are supplied by the shell pool; an SDK lint leg fails it — see [05-UI Conventions §12.4](05-ui-conventions.md)). 🔴 After that, **official plugins and third-party plugins share one project shape** (the six official ones already have the explicit declaration added); the only exception is those two **dev fixtures** inside the shell repo (still hoisted via the root workspaces). **Never import from `@src/components/shared/*`** (the second entry point for shared controls has been deleted)
- **Pure-utility allowlist (`@src/core` exceptions)**: `@src/core/pipeline/*` (DataConverter / DataDispatch / RingBuffer / ProtocolParser) + `@src/core/utils/CancellationToken` + `@src/core/registry/commands/MenuRegistry` (the MenuId type/enum only) and so on — treat `eslint-local-rules.js` as the only authority for the full table; don't copy a second one here
  - 🔴 **Review conclusion**: this allowlist **is in practice used only by shell-repo fixtures** — after the official plugins moved out of the shell repo, their source has zero `@src` hits (at runtime everything goes through `window.linkdesk.*`; measured). The allowlist **stays** (the fixtures are still inside `plugins/` and still guarded by that same eslint rule), but **third-party authors should pretend it doesn't exist**: the only three things you can use are `@linkdesk/contracts` / `@linkdesk/ui` / `window.linkdesk.*`
- **Exception registry**: imports outside the allowlist must be registered before they are permitted (an audit item of the plugin-independence iron rule)

> **Shell hooks/services such as `useConfiguration` / `useSendData` / `ViewContainerService` are forbidden to import** (they hold module-level state → the shell process can't see the caller's changes) — plugins read configuration through `window.linkdesk.configuration` and sync state through `window.linkdesk.events` (subscription broadcast) / `serial.onData` and other data pipelines (see `07-plugin-to-plugin-communication.md`).

---

## 6. Device Channel Boundaries

> Continuing from "2. Shell vs Plugin" — **how far a device-plugin author can get on their own, and what the platform commits to.** The basis is one shell boundary discipline: **the shell only provides generic channels; it does not build in device business.**

**In one sentence: parsing is yours, the channels already exist — no need to ask the shell authors, no need to wait for a shell release.** Channel types are converged by the shell (enumerable); devices are unbounded and belong to plugins.

| Layer | Device example | Channel | Author status |
|:--|:--|:--|:--|
| **Serial family** (the biggest chunk) | USB-CAN adapters (CH340/CP210x virtual serial), GPS modules (NMEA), USB-TTL, cheap logic analyzers | `linkdesk.serial.*` (after its Phase 6 generalization) | ✅ **Write it today, zero shell dependency**; multi-port/multi-plugin coexistence works |
| **Custom USB** | Professional logic analyzers (Saleae-class, custom USB endpoints) | A future `usb` channel | ⏳ A versioned evolution after launch adds one generic channel (one-off, isomorphic to serial); **devices of this kind have to wait until it lands** |
| **Vendor-proprietary DLLs** | High-end devices (vendor SDK/DLL only) | A native channel | ⚠️ A separate architecture topic (the renderer sandbox has no Node permissions); out of current scope |

**The platform's responsibility boundary (authors can rely on this):**
- **Channel correctness + a stable API promise** — the platform authors own the channel (open → streaming read/write → close/errors/multiple instances/resource reclamation); changing the API after launch = versioned evolution (an `engines` declaration) — additions don't break the contract and don't affect existing plugins.
- **Device protocol correctness belongs to the author** — CAN frames/NMEA/sample parsing are all the plugin's job; the shell doesn't recognize any device.
- **One physical port has a single consumer** — the OS driver is exclusive (a port opened by `serial-monitor` cannot be opened at the same time by another plugin or tab; multiple plugins coexisting = each opens its own port).

> To confirm the ready-made `linkdesk.serial.*` capabilities → the `Serial` domain in [contracts/linkdesk.d.ts](../../contracts/linkdesk.d.ts). For custom USB/native channels → raise it with the platform authors — that's the "add a channel" category (converged, enumerable, one-off), not doing bespoke work for one plugin.

---

> **Next:** `02-plugin-lifecycle.md`
> **Index:** `00-readme.md`
