# @linkdesk/plugin-sdk

LinkDesk 插件作者 SDK——对标 `@types/vscode`：装一个包，拿到 **`window.linkdesk.*` 类型提示 + 一键构建 `.linkdesk-plugin` + plugin.json 验证**。零壳源码依赖。

> 类型真相源 = `@linkdesk/contracts`（本包依赖转发，不复制生成物——契约漂移 → 你的 tsc 立即红）。
> 插件作者写代码一律走 `window.linkdesk.*`（preload 注入），**禁止 `import @src/core`**。

## 安装

```bash
npm install -D @linkdesk/plugin-sdk
```

## API 速查表

<!-- BEGIN API-CHEATSHEET -->

> 自动生成，**勿手改**——由 `scripts/generate-api-cheatsheet.mjs` 从 `@linkdesk/contracts` 的 `linkdesk.d.ts` 现读产出，
> `npm run check` 机械盯漂。完整签名与逐方法说明见 `linkdesk.d.ts` 本体（IDE 里可直接跳转）。

**15 个域接口 → 46 个命名空间 / 243 个方法**，全部经 `window.linkdesk.<命名空间>.<方法>` 调用。（另含 1 个废弃别名 `config`，方法不重复计入）

| 命名空间 | 方法数 | 方法 | 说明 |
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
| `getFilePath` | 0 | （顶层函数）`getFilePath: (file: File) => string;` | OS 拖入文件路径获取——双端注入 |
| `panel` | 2 | `reveal` `revealFloating` | —— |
| `settings` | 3 | `list` `getActive` `setActive` | —— |
| `factorySlots` | 4 | `listRoles` `list` `getActive` `setActive` | —— |
| `app` | 1 | `getVersion` | app 命名空间——只读产品身份 |
| `update` | 1 | `getState` | update 命名空间——只读更新状态（供「关于」类插件读宿主版本/更新态） |

⚠️ = 契约可选命名空间（只在一侧注入）：`bridge` `hotExit`——调用前先判断是否存在，另一侧为 `undefined`。
° = 契约标 `?` 的成员：只在一侧 preload 注入（绝大多数是壳侧独有），**插件跑在池里**——调用前先判存在。

<!-- END API-CHEATSHEET -->

## 使用

### 1. tsconfig——让 `window.linkdesk.` 有类型

```jsonc
{
  "compilerOptions": {
    "types": ["@linkdesk/plugin-sdk"], // 全局 window.linkdesk 声明随契约注入
    "jsx": "react-jsx"
  }
}
```

不建任何 global.d.ts。`.ts/.tsx` 里 `window.linkdesk.tabs.create({...})` 直接有参数类型与返回类型检查。

### 2. plugin.json——声明插件（必填 `name`+`version`，可注释/尾逗号）

```jsonc
{
  "name": "My Plugin",        // 显示名
  "version": "1.0.0",
  "entry": "src/index.tsx",   // view/card/protocol 型插件必需
  "contributes": { "i18n": { "en": "i18n/en.json" } }
}
```

### 3. 构建——产出 `.linkdesk-plugin` 分发文件

```bash
npm run build   # 包自带 bin，等价 linkdesk-plugin-sdk build
```

构建自动完成：**validate plugin.json → Vite 打包 `src/index.tsx` 为 `index.bundle.js` → 收拢 manifest/图标/i18n/README 进 `dist/<id>.linkdesk-plugin/` → zip 成项目根 `<id>.linkdesk-plugin`**。

- `react` / `react-dom` / `react-i18next` / `i18next` 由壳提供，**不打包**——其他依赖全部 inline，插件自包含。
- 插件 id = `plugin.json` 的 `pluginId` 字段；不声明则以**项目目录名**兜底（对齐壳加载契约）。
- 想自定义入口/输出目录/额外 external：
  ```js
  // vite.config.ts
  import { defineLinkdeskPluginConfig } from "@linkdesk/plugin-sdk";
  export default defineLinkdeskPluginConfig({ entry: "src/index.tsx", outDir: "dist" });
  ```

### 单独校验

```bash
npm run validate          # 或 linkdesk-plugin-sdk validate ./plugin.json
```

### 主题/图标数据文件 schema（E6#60——主题/图标作者 npm 通道）

`schemas/theme.schema.json` + `schemas/icon-theme.schema.json` 随包分发（与仓库 `public/schemas/` live 字节同步，漂移由 `check-plugin-schema-sync` 守卫）。主题/图标作者在数据 JSON 首行引 `$schema` 拿 IntelliSense：

```jsonc
// themes/my-glass.json（相对插件根）
{
  "$schema": "./node_modules/@linkdesk/plugin-sdk/schemas/theme.schema.json",
  // …
}
```

数据文件**非 JSONC**（严格 JSON，同引擎加载）。构建期/CI 可用 validate 家族拦格式错（与仓库 `check-theme-schema.mjs` 同一 schema 文件，规则永不漂移）：

```js
import { validateThemeJson, validateIconThemeJson } from "@linkdesk/plugin-sdk";

validateThemeJson("themes/my-glass.json");      // theme.schema.json
validateIconThemeJson("icons/my-icons.json");   // icon-theme.schema.json（匹配表双形态契约）
```

### index.bundle.js 约定

打包产物 `export default` 一个 React 组件——壳以 `{ isActive }` 渲染它：

```tsx
export default function MyView({ isActive }: { isActive: boolean }) {
  return <div>Hello LinkDesk</div>;
}
```

## 限制

- **dev 预览**（壳内源码 glob 加载）对 plugin.json 走严格 JSON 解析；本 SDK validate 容忍注释/尾逗号是发布向能力——若插件要在 dev 预览跑，plugin.json 请保持无注释。
- plugin.json 若带注释直接放进壳 `plugins/` dev 目录，预览加载会崩（壳侧 jsonc 支持是后续轮）。
