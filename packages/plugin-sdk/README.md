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

> 自动生成，**勿手改**——由 `scripts/generate-api-cheatsheet.mjs` 从 `@linkdesk/contracts` 的 `linkdesk.d.ts` 现读产出，
> `npm run check` 机械盯漂。完整签名与逐方法说明见 `linkdesk.d.ts` 本体（IDE 里可直接跳转）。

**15 个域接口 → 46 个命名空间 / 243 个方法**，全部经 `window.linkdesk.<命名空间>.<方法>` 调用。 (plus 1 deprecated alias/es `config`, not counted twice)

| Namespace | Methods | Method | Notes |
|:--|:--:|:--|:--|
| `commands` | 5 | `execute` `executeCommand` `registerCommand` `unregisterCommands` `getCommands` | 命令——对标 VS Code vscode.commands |
| `configuration` | 15 | `get` `set` `getSchema` `onChange` `getConfigurationContributions` `inspectConfiguration` `getUserSettings` `onDidChangeConfiguration` `onPluginLifecycleChange` `consumeSettingsGroup` `onRequestSettingsGroup` `consumeScrollToSetting` `onRequestScrollToSetting` `consumeOpenKeybindings` `onRequestOpenKeybindings` | 配置—新名——对标 VS Code vscode.workspace.getConfiguration |
| `config` | 15 | （废弃别名 → `configuration`） | @deprecated E3j #75——向后兼容别名，新代码用 configuration |
| `theme` | 11 | `getCurrent` `getAvailable` `apply` `listRecipes` `getActive` `getEffectiveTokens` `setRecipe` `setColorway` `resetAppearance` `resetMix` `getBaselineSeeds` | —— |
| `language` | 5 | `getCurrent` `getAvailable` `set` `getInitial` `onChange` | —— |
| `appearance` | 2 | `importImage` `revealStorage` | E5.8#50.11：外观资产——本地选图拷贝入库（受控来源——用户任选路径不能 file:// 直读） |
| `tabs` | 8 | `create` `openOrFocus` `focus` `close` `focusBySourceId` `updateLabelBySourceId` `closeBySourceId` `onDidChangeActiveTab` | —— |
| `keybindings` | 12 | `getKeybindings` `getConflicts` `registerKeybinding` `saveUserKeybindings` `removeKeybindingForCommand` `resetKeybindingToDefault` `findKeybindingForCommand` `setKeybindingCaptureActive` `keyboardEventToKeyString` `onChange` `syncToMainProcess`° `onForwardedEvent`° | —— |
| `notifications` | 1 | `show` | 通知——插件弹通知（E6#72：唯一通知面 = 铃铛宽通知面板，右下窄卡链路已整删），对标 VS Code vscod… |
| `menu` | 2 | `registerItems` `getItems` | E5#69：菜单——插件声明式读写 |
| `contextKey` | 1 | `set` | E5#70：ContextKey——插件 SET 状态供壳 when 子句读 |
| `dialog` | 5 | `confirm` `alert` `open` `openFile` `confirmContent` | E5#67：弹窗——确认/提示/文件选择 |
| `quickPick` | 1 | `show` | E5.7#63：插件 quickPick 选择器——池内本地桥（零 IPC，QuickPickHost 渲染） |
| `quickPickHost` | 6 | `registerHost` `onShow` `select` `highlight` `close` `itemAction` | E5.7#63：QuickPick 宿主渲染桥——池 QuickPickHost 消费（壳 preload 无此面） |
| `dialogHost` | 4 | `onShow` `current` `confirm` `cancel` | E5.7#17：Dialog 哑渲染订阅——池 DialogHost 消费（壳 preload 无此面） |
| `floatingPanelHost` | 2 | `onShow` `action` | E5.8#37（Phase 8 类型 B）：悬浮面板哑渲染订阅——池 FloatingPanelHost 消费（壳 p… |
| `serial` | 11 | `listPorts` `getStatus` `openPort` `closePort` `sendData` `sendText` `setDtr` `setRts` `onData` `onStats` `onSystem` | 串口——读/写/监听，对标 VS Code SerialPort API |
| `clipboard` | 3 | `readText` `writeText` `writeFileList` | 剪贴板——读/写系统剪贴板 |
| `p2p` | 2 | `send` `on` | E5#65：p2p 插件间定向推流——和 bridge.broadcast 同模式（fire-and-forget） |
| `events` | 4 | `on` `emit` `heartbeat`° `notifyTheme`° | 通用事件订阅 + 发布——插件间数据管道 |
| `pluginState` | 3 | `get` `set` `onChange` | E5#71：插件持久化存储——集中缓存 + 文件持久化 |
| `workspace` | 8 | `getFolders` `getActive` `setActive` `openFolder` `addFolder` `removeFolder` `onDidChangeFolders` `onDidChangeActiveWorkspace` | 工作区——池 preload 注入（壳侧经 WorkspaceService 直用） |
| `filesystem` | 12 | `readTextFile` `writeTextFile` `exists` `createDir` `copy` `rename` `remove` `listDir` `readBinaryFile` `writeBinaryFile` `watch` `readdir`° | 文件系统——插件读写（路径校验由主进程执行） |
| `path` | 6 | `appDataDir`° `normalize` `join` `basename` `dirname` `extname` | 路径工具——壳/池双端注入（editor/file-tree 池插件消费 normalize/join 等） |
| `env` | 1 | `get` | 环境信息——对标 VS Code ExtensionContext |
| `search` | 1 | `searchFiles` | E5.6#11.5a：文件搜索——全文搜索/替换（IPC 到壳/主进程执行） |
| `encoding` | 3 | `detect` `decode` `encode` | E5.6#11.5a：编码检测/转换（主进程 EncodingService） |
| `decorations` | 4 | `registerProvider` `unregisterProvider` `getDecoration` `onDidChange` | E5.7#60：文件装饰——池内本地注册表（零 IPC） |
| `fileAssociation` | 1 | `getPluginFor` | E5.7#50：文件关联——扩展名→插件 ID（主进程 FileAssociationService 直答） |
| `langDef` | 1 | `get` | E5.7#49：langDef——语言定义注册表（主进程直答） |
| `lsp` | 4 | `spawn` `write` `dispose` `onData` | E5.6#14-lsp：LSP 桥——自动补全/F12/诊断/重命名 |
| `protocol` | 3 | `listProtocols` `getActiveProtocolId` `setActiveProtocolId` | E5.7#49：protocol——协议注册表（主进程直答） |
| `viewContainer` | 4 | `getViewContainer` `getViews` `getView` `registerView` | E5.7#58：viewContainer——真 IPC 查询/更新（问壳侧注册表） |
| `plugins` | 13 | `resolvePath` `resolveEntry`° `listDirs`° `listAll`° `listDisabledDirs`° `readManifest`° `readAllManifests`° `packageDownload`° `packageExtract`° `packageCancel`° `packageUpdateCheck`° `packageStageUpdate`° `packageCommitUpdate`° | 插件发现——双端注入：resolvePath 双端同面 |
| `pluginManager` | 13 | `list` `enable` `disable` `uninstall` `install` `installWithProgress`° `reinstall` `getDisabled` `getUninstalled` `isDisabled` `update`° `checkUpdates`° `notifyManifestChanged`° | 插件管理——桥接 IpcBridgeHandler → loader 函数 |
| `bridge` ⚠️ | 4 | `onRequest` `respond` `broadcast` `notifyConfigChanged` | 壳↔插件通信中继——壳 preload 独有 |
| `pool` | 31 | `pushLayout` `onReady` `toggleDevTools` `onSidebarAction` `onTabAction` `onTabBarRects` `onDragPosition` `pushAdsorbHint` `onAdsorbIndex` `pushQuickPick` `onQuickPickAction` `pushDialog` `onDialogAction` `pushFloatingPanel` `onFloatingPanelAction` `onMemoryPressure` `createWindow` `closeWindow` `onWindowClosed` `onWindowBoundsChanged` `onLayout` `ready` `sidebarAction` `tabAction` `tabBarRects` `dragPosition` `onAdsorbHint` `adsorbIndex` `registerBeforeClose` `unregisterBeforeClose` `beforeClose` | 池控制——壳 preload：推送布局 + 注册池→壳动作回调 |
| `window` | 11 | `minimize` `maximize` `unmaximize` `close` `setZoom` `toggleDevTools` `isMaximized` `onMaximizeChange` `setAlwaysOnTop` `isAlwaysOnTop` `onAlwaysOnTopChange` | 窗口控制——TitleBar 按钮映射，双端注入（11 方法同通道，共享模块 electron/window-name… |
| `shell` | 6 | `showItemInFolder` `openInTerminal` `pluginLocation` `openPluginFolder` `startDrag` `relaunch`° | 壳级命令——revealInOS / openInTerminal / startDrag / relaunch，双端… |
| `hotExit` ⚠️ | 3 | `save` `load` `clear` | 热退出暂存——编辑器未保存内容落盘（E5.7#53） |
| `getFilePath` | 0 | (top-level function)`getFilePath: (file: File) => string;` | OS 拖入文件路径获取——双端注入 |
| `panel` | 2 | `reveal` `revealFloating` | —— |
| `settings` | 3 | `list` `getActive` `setActive` | —— |
| `factorySlots` | 4 | `listRoles` `list` `getActive` `setActive` | —— |
| `app` | 1 | `getVersion` | app 命名空间——只读产品身份 |
| `update` | 1 | `getState` | update 命名空间——只读更新状态（供「关于」类插件读宿主版本/更新态） |

⚠️ = optional namespace in the contract (injected on one side only): `bridge` `hotExit` — check for existence before calling; on the other side it is undefined.
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
> Full procedure + all three measured pitfalls → **`docs/06-发布管理/作者轴npm发版.md`** in the LinkDesk repository.
