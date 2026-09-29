# knip 存量死代码处置（E5.8#2）

> **对应清单任务：E5.8#2**（[../E5.8-执行清单.md](../E5.8-执行清单.md)）。
> 本档案记录 knip 入 check 时的**存量死代码处置账本**——每处要么删除，要么 `knip.json` ignore 豁免带理由，**不设基线放过**。
> 豁免理由注释写在 `knip.json` 里，本档案只记录"哪些符号怎么处置"的索引。

## 摸底与处置结论

- 摸底：**95 unused exports + 8 unused files + 5 unused deps + 1 unused binary**（knip v6.32.2 `--reporter json` 结构化报告）。
- 甄别判据：**knip AST import 图为准**（word-boundary grep 命中注释/字符串有假阳性——如 `window.linkdesk` 151 处）。`IpcBridgeHandler` 用 `case "workspace:copy"` 字符串分发——knip 能追踪 case handler 内 import 的服务函数，报 unused = IpcBridgeHandler 也没调 = 真死。
- 处置（2026-08-19）：**删除死代码/死依赖 + 豁免聚合器/API 面** → **0 输出**（`npm run knip` exit 0，check 链全绿）。

## 一、删除（真死——壳+池零 import 边）

### 1.1 死文件（git rm——E5.7 迁池后的壳残留）

| 文件 | 处置理由 |
|:--|:--|
| `src/components/shared/hamburger-menu/HamburgerMenu.tsx` + `.css` | E5.7 迁池后壳版死组件——☰ 汉堡唯一实现已在池（IconBarZone） |
| `src/components/shared/menu-renderer/MenuRenderer.tsx` | 壳菜单渲染组件版被 usePoolSync 数据化取代——池 MenuItemList 为唯一实现 |

### 1.2 死导出（整删——连定义一起）

| 文件 | 删的符号 | 理由 |
|:--|:--|:--|
| `src/constants.ts` | TITLE_BAR_HEIGHT / HANDLE_WIDTH | titlebar 是池内 zone，壳无需高度/分隔线偏移 |
| `src/hooks/useMemoryMonitor.ts` | recordMount / recordUnmount + 模块级 baselines | 记录函数零消费，统计仅靠计数 |
| `src/hooks/useIpcEvent.ts` | useIpcEventState | setter 变体零消费（useIpcEvent 保留） |
| `src/core/react/useConfigurationIpc.ts` | useConfigurationIpc | 带 setter 变体零消费（保留 useSubscribedConfigValueIpc + useConfigurationValueIpc） |
| `src/core/utils/splitTree.ts` | clampSizes / cloneTree / updateSizesInTree / findBranchByIndex / _findBranchByIndex / **LayoutDataV2** + Tab import | 6 helper 壳+池零消费（updateBranchSizesByIndex 自含同款递归）；LayoutDataV2 零引用 |
| `src/pool/hooks/tabDragTypes.ts` | DragSplitState / zoneToDirection / zoneToSide | 拖拽状态/方向映射壳+池零消费（useDragReorder 自含 DragState） |
| `src/pool/protocol/viewDragProtocol.ts` | ViewDragPayload | 载荷按 dataTransfer 协议读写方各自解析，接口零消费 |
| `src/core/utils/tabIdentity.ts` | shouldKeepSidebarOnFocus | 判定已内联 viewRegistry（manifest 直读），旧函数零消费 |
| `src/pluginLoader/viewRegistry.ts` | hasKeepSidebarOnFocus | 唯一消费方 shouldKeepSidebarOnFocus 同批删除 |

### 1.3 去 export（内部使用，不构成公共 API——保留实现仅去导出修饰）

| 文件 | 去 export 符号 | 理由 |
|:--|:--|:--|
| `src/core/commands/palette/quickPickCommand.ts` | showQuickPick / QuickPickItem | 仅被同文件 registerQuickPickCommand 内部用（coreCommands 只 import registerQuickPickCommand） |
| `src/core/services/ui/QuickPickService.ts` | QuickPickMode | 仅被 QuickPickState 内部字段用（QuickPickService 不在 core/index 桶） |
| `src/pool/hooks/useDragReorder.ts` | DragPhase | 仅被 DragState 内部字段用 |
| `src/pool/shared/menu-item-list/MenuItemList.tsx` | MenuItemListProps | 仅组件自身 props 用（default export 消费） |
| `src/components/shared/select-box/SelectBox.tsx` | SelectBoxOption | 仅组件内部用（options 联合类型） |
| `src/components/shared/sidebar-section/SidebarSection.tsx` | SidebarSectionProps | 仅组件自身 props 用 |
| `src/pluginLoader/state.ts` | CachedPluginMeta | 仅本文件缓存函数用 |
| `electron/ipc/event-system.ts` | ExtraHandlers | 仅 EventSystemOptions 内部字段用 |
| `electron/services/serial-service.ts` | PortInfo / SerialCallbacks + **删 `export type { SerialStatus }` re-export 行** | 内部用；SerialStatus re-export 无消费（消费方直引 `src/core/types/ipc/serial` 正源） |
| `electron/services/file-service.ts` | **删 `export type { FileEntry }` re-export 行** | FileEntry 定义在 `src/core/types/fileEntry`，消费方（FileService/linkdesk-api）直引正源 |
| `src/core/types/pool/poolLayout.ts` | SidebarContainerLayout / NotifAction / NotifItem / NotifGroup | 仅被同文件其他接口字段引用（无 import 边） |
| `src/core/types/pool/poolQuickPick.ts` | PoolQuickPickButton | 仅被 PoolQuickPickData.buttons 字段引用 |
| `src/core/types/pool/poolToast.ts` | PoolToastAction | 仅被 PoolToastItem.actions 字段引用 |
| `src/core/types/ipc/search.ts` | SearchWireMatch | 仅被 SearchWireResult 内部字段引用（Result 本身有消费） |
| `src/core/types/ipc/tabActions.ts` | TabSplitDirection | 仅被 TabAction.direction 字段引用 |
| `src/pool/shared/pool-plugin-icon/PoolPluginIcon.tsx` | 具名导出 `PoolPluginIcon` | default 导出保留（IconBarZone default import），具名零消费 |

### 1.4 死依赖（删 3 + 误删 1 已回滚——npm install 后 lock 同步）

| 依赖 | 类型 | 处置 | 理由 |
|:--|:--|:--|:--|
| `pyright` | devDep | 🔥 **误删已回滚（#24）** | 非死依赖——`lsp-handlers.ts` 以 **spawn 字符串路径**运行时调用（`node_modules/pyright/dist/pyright-langserver.js`），非 import 引用，knip 静态图看不见 → 误删导致 `.py` LSP 跳转回归。**已装回 + knip.json `ignoreDependencies` 豁免防复发**。教训：删依赖前须 grep spawn/exec 字符串引用 |
| `@codemirror/language` | dep | 删（真死） | serial-monitor 不消费（CodeMirror 6 包按需只留 state/view/search） |
| `@monaco-editor/react` | dep | 删（真死） | Monaco 走 @codingame 补丁直引，React 封装层零消费 |
| `@types/iconv-lite` | devDep | 删（真死） | iconv-lite 自带 `types: ./lib/index.d.ts`，@types 多余类型包（删后 tsc 验证 EncodingService 类型通过） |

## 二、豁免（knip.json ignore——带理由）

### 2.1 聚合器 + re-export 透传面（32 文件）

> `src/core/index.ts` 是插件 API 入口（@src/core 契约 + window.linkdesk），壳内按需直引具体文件，桶导出面向 plugins/ 排除域。**被 `export *` 透传的文件其 exports 全部构成公共 API 面——整文件豁免**。清单见 `knip.json` ignore 数组（含 ProtocolParser/ConfigurationRegistry/FactorySlots/ThemeEngine/api-types/IpcBridgeHandler 等 `export *` 面 + useConfiguration/usePluginIpcEvent/useSendData 等 React 插件 hook + 核心服务/注册表）。

### 2.2 池侧 dev/插件共享面（3 文件）

| 文件 | 理由 |
|:--|:--|
| `src/pool/dev/mockLinkdesk.ts` | dev 预览 side-effect 安装 window.linkdesk（preview-main 副作用导入不建"使用"边） |
| `src/pool/hooks/useClickPreview.ts` | file-tree 插件直引 @src/pool（排除域消费） |
| `src/hooks/useTabManager.ts` | 聚合器门面（E5.8#0d.10-2e 全量 re-export，外部消费方零变更） |

### 2.3 手动开发工具（1 文件）

| 文件 | 理由 |
|:--|:--|
| `scripts/audit-i18n.mjs` | node 手动跑，非门禁链 |

### 2.4 ignoreDependencies / ignoreBinaries

| 项 | 值 | 理由 |
|:--|:--|:--|
| ignoreDependencies | `monaco-languageclient` | 被 plugins/builtin/editor 直引（排除域——插件共用根 node_modules，独立 vite 构建时解析） |
| ignoreBinaries | `xdg-open` | electron/main.ts:242 Linux 分支 openInTerminal 的 exec 字符串（真实外部命令） |

## 三、附带修复

- `npm run fix` 的 `shared/` 死路径清除（`eslint src/ plugins/ electron/ --fix`）——shared/ 已随 E5.7#45.5 不存在，eslint 对不存在目录报错。

## 四、验收

- `npm run knip` exit 0（console reporter，unused 归零）。
- `npm run check` 全绿：tsc×2 + grid + pool-css + ESLint `--max-warnings 0` + duplication + **knip** + vitest 452。
- 特殊验证：删 @types/iconv-lite 后 EncodingService tsc 通过（自带类型覆盖）；删 @codemirror/language 后 serial-monitor vitest 通过。
- entry 明细：knip 6 自动识别 Vite 默认 index.html→main.tsx（手动列报 redundant）；pool.html/preview.html 非默认入口显式列 tsx（knip 不解析 `<script src="/src/...">` 带前导 `/` 的 HTML——pool.html 单作 entry 时 pool 树 34 文件全断根实测）。
