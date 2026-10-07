# @linkdesk/plugin-sdk

The LinkDesk plugin author SDK — the counterpart to `@types/vscode`: install one package and get **`window.linkdesk.*` type hints + one-command builds of `.linkdesk-plugin` + plugin.json validation**. Zero dependency on the shell source.

> The source of truth for types = `@linkdesk/contracts` (this package re-exports it and does not copy the generated artifact — contract drift → your tsc turns red immediately).
> Plugin authors always write code against `window.linkdesk.*` (injected by the preload); **`import @src/core` is forbidden**.

## Installation

```bash
npm install -D @linkdesk/plugin-sdk
```

## API cheat sheet

<!-- BEGIN API-CHEATSHEET -->

> Auto-generated, **do not edit by hand**—produced live by `scripts/generate-api-cheatsheet.mjs` reading `linkdesk.d.ts` from `@linkdesk/contracts`;
> `npm run check` mechanically watches for drift. For full signatures and per-method notes see `linkdesk.d.ts` itself (jump to it straight from the IDE).

**16 domain interfaces → 47 namespaces / 260 methods**, all invoked via `window.linkdesk.<namespace>.<method>`. (plus 1 deprecated alias/es `config`, not counted twice)

| Namespace | Methods | Method | Notes |
|:--|:--:|:--|:--|
| `commands` | 5 | `execute` `executeCommand` `registerCommand` `unregisterCommands` `getCommands` | Commands — modeled after VS Code vscode.commands |
| `configuration` | 15 | `get` `set` `getSchema` `onChange` `getConfigurationContributions` `inspectConfiguration` `getUserSettings` `onDidChangeConfiguration` `onPluginLifecycleChange` `consumeSettingsGroup` `onRequestSettingsGroup` `consumeScrollToSetting` `onRequestScrollToSetting` `consumeOpenKeybindings` `onRequestOpenKeybindings` | Configuration — the new name — modeled after VS Code vscode… |
| `config` | 15 | (deprecated alias → `configuration`) | @deprecated  — backward-compatibility alias |
| `theme` | 11 | `getCurrent` `getAvailable` `apply` `listRecipes` `getActive` `getEffectiveTokens` `setRecipe` `setColorway` `resetAppearance` `resetMix` `getBaselineSeeds` | —— |
| `language` | 5 | `getCurrent` `getAvailable` `set` `getInitial` `onChange` | —— |
| `appearance` | 2 | `importImage` `revealStorage` | appearance assets — locally picked images are copied into m… |
| `storage` ⚠️ | 2 | `revealCache` `cacheDir` | —— |
| `tabs` | 9 | `create` `openOrFocus` `focus` `close` `focusBySourceId` `updateLabelBySourceId` `closeBySourceId` `onDidChangeActiveTab` `list` | —— |
| `keybindings` | 13 | `getKeybindings` `getConflicts` `registerKeybinding` `saveUserKeybindings` `removeKeybindingForCommand` `resetKeybindingToDefault` `clearKeybindingForCommand` `findKeybindingForCommand` `setKeybindingCaptureActive` `keyboardEventToKeyString` `onChange` `syncToMainProcess`° `onForwardedEvent`° | —— |
| `notifications` | 3 | `show` `list` `subscribe` | Notifications — plugins raise notifications ( the only noti… |
| `menu` | 2 | `registerItems` `getItems` | Menus — declarative read/write for plugins |
| `contextKey` | 1 | `set` | ContextKey — plugins SET state for the shell's when clauses… |
| `dialog` | 5 | `confirm` `alert` `open` `openFile` `confirmContent` | Dialogs — confirm/alert/file selection |
| `quickPick` | 1 | `show` | plugin quickPick picker — local bridge inside the pool (zer… |
| `quickPickHost` | 6 | `registerHost` `onShow` `select` `highlight` `close` `itemAction` | QuickPick host rendering bridge — consumed by the pool's Qu… |
| `dialogHost` | 5 | `onShow` `current` `pending` `confirm` `cancel` | Dialog dumb-render subscription — consumed by the pool's Di… |
| `floatingPanelHost` | 4 | `onShow` `action` `registerBoundsHost` `getBounds` | (type B): floating panel dumb-render subscription — consume… |
| `serial` | 11 | `listPorts` `getStatus` `openPort` `closePort` `sendData` `sendText` `setDtr` `setRts` `onData` `onStats` `onSystem` | Serial — read/write/listen, modeled after VS Code SerialPor… |
| `clipboard` | 3 | `readText` `writeText` `writeFileList` | Clipboard — read/write the system clipboard |
| `p2p` | 2 | `send` `on` | p2p targeted inter-plugin push — same pattern as bridge.bro… |
| `events` | 4 | `on` `emit` `heartbeat`° `notifyTheme`° | Generic event subscribe + publish — the inter-plugin data p… |
| `pluginState` | 3 | `get` `set` `onChange` | plugin persistent storage — centralized cache + file persis… |
| `workspace` | 8 | `getFolders` `getActive` `setActive` `openFolder` `addFolder` `removeFolder` `onDidChangeFolders` `onDidChangeActiveWorkspace` | Workspace — injected by the pool preload (the shell side us… |
| `filesystem` | 12 | `readTextFile` `writeTextFile` `exists` `createDir` `copy` `rename` `remove` `listDir` `readBinaryFile` `writeBinaryFile` `watch` `readdir`° | Filesystem — plugin read/write (path validation is performe… |
| `path` | 6 | `appDataDir`° `normalize` `join` `basename` `dirname` `extname` | Path utilities — injected on both shell/pool ends (in-pool … |
| `env` | 1 | `get` | Environment info — modeled after VS Code ExtensionContext |
| `search` | 1 | `searchFiles` | file search — full-text search/replace (executed via IPC in… |
| `encoding` | 4 | `detect` `decode` `encode` `isBinary` | encoding detection/conversion (main-process EncodingService) |
| `decorations` | 4 | `registerProvider` `unregisterProvider` `getDecoration` `onDidChange` | file decorations — a local in-pool registry (zero IPC). Sha… |
| `fileAssociation` | 4 | `getPluginFor` `listHandlersFor` `setDefault` `setDefaultBulk` | file associations — extension→plugin ID (answered directly … |
| `langDef` | 1 | `get` | langDef — language definition registry (answered directly b… |
| `lsp` | 4 | `spawn` `write` `dispose` `onData` | LSP bridge — autocompletion/F12/diagnostics/rename |
| `protocol` | 3 | `listProtocols` `getActiveProtocolId` `setActiveProtocolId` | protocol — protocol registry (answered directly by the main… |
| `viewContainer` | 4 | `getViewContainer` `getViews` `getView` `registerView` | viewContainer — real IPC query/update (asks the shell-side … |
| `plugins` | 14 | `resolvePath` `resolveEntry`° `getCompatibility`° `listDirs`° `listAll`° `listDisabledDirs`° `readManifest`° `readAllManifests`° `packageDownload`° `packageExtract`° `packageCancel`° `packageUpdateCheck`° `packageStageUpdate`° `packageCommitUpdate`° | Plugin discovery — injected on both ends: resolvePath exist… |
| `pluginManager` | 13 | `list` `enable` `disable` `uninstall` `install` `installWithProgress`° `reinstall` `getDisabled` `getUninstalled` `isDisabled` `update`° `checkUpdates`° `notifyManifestChanged`° | Plugin management — bridges IpcBridgeHandler → loader funct… |
| `bridge` ⚠️ | 4 | `onRequest` `respond` `broadcast` `notifyConfigChanged` | Shell↔plugin communication relay — shell preload only |
| `pool` | 32 | `pushLayout` `onReady` `toggleDevTools` `onSidebarAction` `onTabAction` `onTabBarRects` `onDragPosition` `pushAdsorbHint` `onAdsorbIndex` `pushQuickPick` `onQuickPickAction` `pushDialog` `onDialogAction` `pushFloatingPanel` `onFloatingPanelAction` `onMemoryPressure` `createWindow` `closeWindow` `onWindowClosed` `onWindowBoundsChanged` `getLayout` `onLayout` `ready` `sidebarAction` `tabAction` `tabBarRects` `dragPosition` `onAdsorbHint` `adsorbIndex` `registerBeforeClose` `unregisterBeforeClose` `beforeClose` | Pool control — shell preload: pushes layout + registers poo… |
| `window` | 11 | `minimize` `maximize` `unmaximize` `close` `setZoom` `toggleDevTools` `isMaximized` `onMaximizeChange` `setAlwaysOnTop` `isAlwaysOnTop` `onAlwaysOnTopChange` | Window control — TitleBar button mapping, injected on both … |
| `shell` | 7 | `showItemInFolder` `openInTerminal` `pluginLocation` `openPluginFolder` `startDrag` `relaunch`° `openExternal` | Shell-level commands — revealInOS / openInTerminal / startD… |
| `hotExit` ⚠️ | 3 | `save` `load` `clear` | Hot exit staging — persists unsaved editor content to disk … |
| `getFilePath` | 0 | (top-level function)`getFilePath: (file: File) => string;` | Get the paths of files dragged in from the OS — injected on… |
| `panel` | 3 | `reveal` `revealFloating` `setFloatingBounds` | —— |
| `settings` | 3 | `list` `getActive` `setActive` | —— |
| `factorySlots` | 4 | `listRoles` `list` `getActive` `setActive` | —— |
| `app` | 1 | `getVersion` | The app namespace — read-only product identity. The only ru… |
| `update` | 1 | `getState` | The update namespace — read-only update state (for "About"-… |

⚠️ = optional namespace in the contract (injected on one side only): `storage` `bridge` `hotExit` — check for existence before calling; on the other side it is undefined.
° = member marked `?` in the contract: injected in one side's preload only (almost always shell-side). **Your plugin runs in the pool** — check for existence before calling.

<!-- END API-CHEATSHEET -->

## Usage

### 1. tsconfig — give `window.linkdesk.` its types

```jsonc
{
  "compilerOptions": {
    "types": ["@linkdesk/plugin-sdk"], // the global window.linkdesk declarations come in with the contracts
    "jsx": "react-jsx"
  }
}
```

Create no global.d.ts at all. In `.ts`/`.tsx`, `window.linkdesk.tabs.create({...})` gets parameter and return type checking directly.

### 2. plugin.json — declare the plugin (required `name` + `version`; comments and trailing commas allowed)

```jsonc
{
  "name": "My Plugin",        // display name
  "version": "1.0.0",
  "entry": "src/index.tsx",   // required for view/card/protocol plugins
  "contributes": { "i18n": { "en": "i18n/en.json" } }
}
```

#### `minAppVersion` — the oldest shell your plugin runs on

**One rule**: if your plugin consumes `@linkdesk/ui`, the gate checks `minAppVersion` — `npm run lint` tells you the floor to declare, and `build` / `publish` refuse to produce an artifact while the declaration is below it.

**One why**: the shell supplies those components at runtime (this package externalizes `@linkdesk/ui`), so a **static** import of an export an older shell does not have makes the **whole plugin fail to load** — not just that one component.

**One pointer**: semantics, the "which shell first shipped it" table and the traps → **`docs/03-plugin-authoring/04-distribution-format.md` §minAppVersion** (+ `19-component-cheatsheet.md` §2.1) in the LinkDesk repository.

### 3. Build — produce the `.linkdesk-plugin` distributable

```bash
npm run build   # the package ships its own bin; equivalent to linkdesk-plugin-sdk build
```

The build does all of this automatically: **validate plugin.json → Vite bundles `src/index.tsx` into `index.bundle.js` → gather manifest/icons/i18n/README into `dist/<id>.linkdesk-plugin/` → zip it into `<id>.linkdesk-plugin` at the project root**.

- `react` / `react-dom` / `react-i18next` / `i18next` are provided by the shell and are **not bundled** — every other dependency is inlined, so plugins are self-contained.
- Plugin id = the `pluginId` field of `plugin.json`; if it is not declared, the **project directory name** is used as a fallback (matching the shell's loading contract).
- To customize the entry, output directory, or extra externals:
  ```js
  // vite.config.ts
  import { defineLinkdeskPluginConfig } from "@linkdesk/plugin-sdk";
  export default defineLinkdeskPluginConfig({ entry: "src/index.tsx", outDir: "dist" });
  ```

### Standalone validation

```bash
npm run validate          # or linkdesk-plugin-sdk validate ./plugin.json
```

### Theme/icon data file schemas (the npm channel for theme and icon authors)

`schemas/theme.schema.json` + `schemas/icon-theme.schema.json` ship with the package (kept byte-synced with the repository's `public/schemas/`; drift is caught by `check-plugin-schema-sync`). Theme and icon authors reference `$schema` on the first line of their data JSON to get IntelliSense:

```jsonc
// themes/my-glass.json (relative to the plugin root)
{
  "$schema": "./node_modules/@linkdesk/plugin-sdk/schemas/theme.schema.json",
  // …
}
```

Data files are **not JSONC** (strict JSON, loaded by the same engine). At build time or in CI, the validate family can catch format errors (the same schema files the repository's `check-theme-schema.mjs` uses, so the rules never drift):

```js
import { validateThemeJson, validateIconThemeJson } from "@linkdesk/plugin-sdk";

validateThemeJson("themes/my-glass.json");      // theme.schema.json
validateIconThemeJson("icons/my-icons.json");   // icon-theme.schema.json (dual-form contract for the match table)
```

### index.bundle.js conventions

The bundle `export default`s a React component — the shell renders it with `{ isActive }`:

```tsx
export default function MyView({ isActive }: { isActive: boolean }) {
  return <div>Hello LinkDesk</div>;
}
```

## Limitations

- **dev preview** (source glob loading inside the shell) parses plugin.json as strict JSON; this SDK's validate tolerating comments/trailing commas is a publish-time capability — if a plugin needs to run in dev preview, keep plugin.json free of comments.
- Dropping a commented plugin.json straight into the shell's `plugins/` dev directory breaks preview loading (jsonc support on the shell side is still to come).

## Maintaining this package (LinkDesk maintainers)

This package is **one of the five author axes** (the others: `@linkdesk/contracts` / `create-linkdesk-plugin` / `@linkdesk/ui` / `@linkdesk/plugin-docs`) and has its own version axis — **publishing it does not bump the application, and the application does not bump it**.

Its surface is `src/**` + `schemas/**` + `dev-host/**` + this README: change any of them and the version must be bumped and published, otherwise plugin authors keep building against the old CLI/schemas.

```bash
# 1. bump  packages/plugin-sdk/package.json  version   (0.x backward-compatible → patch)
# 2. build the dist the publish channel ships  (npm run build, inside the package)
# 3. publish
npm publish --registry=https://registry.npmjs.org     # 🔴 the registry flag is mandatory — the machine default is a read-only mirror
# 4. record the baseline (run in the LinkDesk repo root)
npm run release:mark
```

> 🔴 The shelf read has a **~3 minute replication delay** (`contracts` is visible within seconds, `plugin-sdk` takes minutes) — do **not** re-publish on a 404, npm will reject the duplicate version.
> Full procedure + all three measured pitfalls → the author-axis npm release dossier in the LinkDesk repository (Chinese docs tree, publishing-management series).
