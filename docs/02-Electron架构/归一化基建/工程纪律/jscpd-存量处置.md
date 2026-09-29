# jscpd 存量重复处置（E5.8#1）

> **对应清单任务：E5.8#1 子步 1b/1c/1d**（[../E5.8-执行清单.md](../E5.8-执行清单.md)）。
> 本档案记录 jscpd 入 check 时的**存量重复处置账本**——每处要么修复合并，要么 `/* jscpd:ignore-start */` 豁免带理由注释，**不设基线放过**。
> 豁免理由注释写在代码里（ignore 块外），本档案只记录"哪些文件怎么处置"的索引。

## 摸底与处置结论

- 摸底（2026-08-17 审视期）：101 clones（ts 54 / tsx 33 / css 14，重复行 2.18%，317 文件）。
- 配置收紧后检测域（`.jscpd.json`：minTokens 60 / minLines 6 / mode mild / ignore `node_modules,dist,release`）：**29 对克隆**。
- 处置（2026-08-19）：**修复合并 9 处克隆对 + 豁免 20 处结构性克隆** → **0 clones**（`npm run duplication` exit 0，check 链全绿）。

## 一、修复合并（9 处克隆对消除——提取共用 helper / 委托归口）

| 文件 | 克隆对 | 处置 |
|:--|:--|:--|
| `electron/preload-pool/commands.ts` | executeCommand ↔ executeLocal / execute 别名 | 提取 `callPoolHandler`（查池侧 handler 统一执行），executeCommand/executeLocal/execute 三方委托 |
| `src/core/registry/commands/KeybindingRegistry/dispatch.ts` | handleKeyEvent ↔ handleKeyInput 分发 | 提取 `shouldDispatchKey` + `runWinner` + `tryExecute` 三 helper，两入口共用 |
| `src/App/persistence.ts` | beforeunload ↔ 100ms 防抖保存的序列化 | 提取 `serializeGroups`（三参签名，effect 依赖精确） |
| `src/core/react/useConfiguration.ts` + `useConfigurationIpc.ts` | 订阅配置值 hook 双实现 | 提取 `useSubscribedConfigValue` 共用 |
| `src/pluginLoader/lifecycle-ops.ts` | manifest 可变拷贝 | 提取 `getMutableManifest` |
| `src/hooks/usePoolSync/titlebar.ts` | 菜单栏组收集 | 提取 `collectMenuBarGroups` |
| `src/hooks/useTabManager.ts` | 强制关闭路径 | 提取 `commitForceClose` |
| `src/core/services/layout/ViewContainerService.ts` | 折叠状态顺序恢复 | 提取 `restoreOrder` |
| `src/pluginLoader/loader.test.ts` | 主题色提取测试断言 | `extractThemeColors` 提为具名 import |
| `electron/preload-pool/namespaces-data.ts` + `src/core/api/linkdesk-api/workspace.ts` | searchFiles 双端签名 | wire 契约归口 `src/core/types/ipc/search.ts`（SearchWireOptions/Result） |
| `src/core/utils/keybindingNormalization.ts` | 键位归一化双实现 | `keyboardInputToKeyString`/`keyboardEventToKeyString` 集中单一权威源（1b，防 E5.7#79 漂移） |

> 注：dispatch/commands 修复后原 #23/#24/#1 克隆归零；keybindingNormalization 归口（1b）先于 1c 提交。

## 二、ignore 豁免（20 处克隆——结构性克隆，无法合并，加 `/* jscpd:ignore-start */` 带理由）

> 豁免只包克隆对**任一侧**——一律包在"复制方"（池侧），"原方"（壳侧/参考实现）保持不动供对照。

### 2.1 preload 镜像（9 处）——壳/池双 preload 各持 `window.linkdesk.*` 契约，无法共享

| 文件 | ignore 块 | 理由 |
|:--|:--|:--|
| `electron/preload-pool/namespaces-data.ts` | `buildSerial` 返回值 / `buildFilesystem` 的 `watch` | IPC 薄转发面结构性复制（壳 preload-shell 镜像） |
| `electron/preload-pool/namespaces-plugin.ts` | `buildPluginManager` / `buildKeybindings` / `buildPluginState` / `buildShell` | 同上（pluginManager/keybindings/pluginState/shell 命名空间） |
| `electron/preload-pool/namespaces-workspace.ts` | `buildTabs` / `buildP2p` | 同上（tabs/p2p 命名空间） |

### 2.2 pool-css gate（5 处）——禁池 CSS @import，池 zone CSS 自包含壳同款块

| 文件 | ignore 块 | 理由 |
|:--|:--|:--|
| `src/pool/zones/icon-bar/IconBarZone.css` | ☰ 汉堡菜单整段（123-281） | pool-css gate（禁 @import）→ 自包含壳 HamburgerMenu.css 同款块 |
| `src/pool/zones/title-bar/TitleBarZone.css` | 下拉菜单整段 | 同上（titlebar-item/right/chevron） |
| `src/pool/zones/right-sidebar/RightSidebarZone.css` | 基础面板类整段（.side-panel*） | pool-css gate → 自包含 SidebarZone.css 同源拷贝 |

### 2.3 Path B（2 处）——池不 import 壳组件，孪生实现

| 文件 | ignore 块 | 理由 |
|:--|:--|:--|
| `src/pool/shared/menu-item-list/MenuItemList.tsx` | `scheduleHover` | 壳 MenuRenderer 孪生（hover 子面板时序） |
| `src/pool/floating/dialog/DialogHost.tsx` | Tab 焦点陷阱 handler | 壳 OverlayPortal 孪生（focus trap） |

### 2.4 池内 zone 孪生（3 处）——resize 骨架/拖拽提交结构性重复

| 文件 | ignore 块 | 理由 |
|:--|:--|:--|
| `src/pool/zones/panel/PanelZone.tsx` | clamp→finishDrag→onMove/onUp 整段 | PanelZone↔RightSidebarZone 垂直/水平 resize 孪生 |
| `src/pool/zones/right-sidebar/RightSidebarZone.tsx` | handleSidebarAction→clamp→finishDrag→onMove→handleResizeStart 整段 | RightSidebarZone↔SidebarZone resize 骨架孪生 |

### 2.5 测试叙述重复（1 处）

| 文件 | ignore 块 | 理由 |
|:--|:--|:--|
| `src/pool/hooks/useDragReorder.test.tsx` | split 用例 setup 样板 | split/Shift 用例共享拖拽序列样板（测试叙述重复） |

## 三、验收

- `npm run duplication` exit 0（console reporter，`exitCode: 1` 时克隆>0 即 fail）。
- `npm run check` 全绿：tsc×2 + grid + pool-css + ESLint `--max-warnings 0` + **duplication** + vitest。
- 无未豁免重复：`grep` 全仓无裸重复块（豁免必带 `jscpd:ignore-start/end`）。
