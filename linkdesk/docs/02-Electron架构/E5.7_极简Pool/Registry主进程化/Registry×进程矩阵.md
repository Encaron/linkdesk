# Registry×进程 矩阵（E5.7#46 审计产出）

> 2026-08-15 全量摸底。方法：`src/core/registry/` 16 文件 + `src/core/services/FileAssociationService.ts` 的模块级可变状态 → 写入方/读取方逐个 grep 追踪 → 按进程分类（壳渲染进程 / 池渲染进程 / 主进程）→ 跨进程通路核实。
> 本表是 Phase 11（Registry 主进程化）的设计输入——[Registry主进程化设计.md](Registry主进程化设计.md) §3 的迁移范围表以本矩阵为准。

---

## 关键发现（摘要）

1. **设计稿"已知 bug"（langDef/protocol 主进程空表）已缓解但补丁形态仍在**：池侧经 `plugins:call` 代理到壳（E5.6#14-fix），功能可用。但主进程两个 handler 文件是**读自己空实例的死 handler**：`langDef:get` 通道全仓零调用（preload-pool 实走 `plugins:call 'getLangDef'`）、`protocol:listProtocols` 三通道只有 preload-pool 走 `plugins:call`（protocol-handlers.ts 头注释自封"已废弃 fallback"）。两个文件都在 main.ts:85-86 活着注册——**#51 删除前提成立，且有实证**。
2. **marketplace 池内直 import `registerCommand`（index.tsx:15）是活 bug**：写入池进程自己的空实例，壳注册表不可见——已在 Phase 12 #56 登记（`MenuId` 是类型导入，无害）。
3. **FileDecorationRegistry 全链无注册方**：消费端就位（池 FileTreeDecoration 经 `lk.decorations` 代理查询），但全仓零 `registerProvider` 调用 → 壳侧代理目标恒空。**✅ 2026-08-16 已修（E5.7#60）：注册表池内化——preload-pool 池内本地注册表（registerProvider/unregisterProvider/getDecoration/onDidChange 四方法，零 IPC），壳侧恒空注册表 + `decorations:getDecoration` 代理通道 + `decorations:changed` 广播 + 源文件全部整删（API 契约 §3.24）。**
4. **CardRegistry + DataDispatch 是遗留空壳**：零写入方（lifecycle 只有 unregisterPluginCards），零消费者——卡片工作台未实现时代的骨架。**✅ 2026-08-15 用户拍板整删（E5.7#45.7）：CardRegistry 是 Phase 5 柱子 5 骨架（卡片工作台随 Tauri 时代消亡，20+ commit 只搬家）；DataDispatch 被"独立 RingBuffer 多消费者"设计决策取代（串口数据是流不是事件）。git 历史佐证：a3cfb9c8 创建后零功能演进。**
5. **StatusBarService 动态 API 零调用**：`createStatusBarItem` 全仓无调用方；静态状态栏走 plugin.json `statusBar` 声明 + viewRegistry，工作正常。动态面属 E6 API 表面。

---

## 矩阵总表

| Registry | 模块级状态 | 写入方（进程） | 读取方（进程） | 跨进程通路 | 状态 |
|:--|:--|:--|:--|:--|:--|
| **LangDefRegistry** | `_extMap` | loader.ts:613（壳） | 池编辑器 EditorView → `lk.langDef.get` → `plugins:call 'getLangDef'` → 壳 IpcBridgeHandler:521 | ✅ 已代理（2 跳）。主进程 lang-def-handlers `langDef:get` **零调用死 handler**（读主进程空实例，头注释与事实相反） |
| **ProtocolRegistry** | `_protocols` / `_activeProtocolId` | App.tsx:218 ensureBuiltinProtocols（壳）——**勘误：矩阵初版记"loader 写入"有误，loader 零协议注册（grep 实证）；协议唯一注册方是内置方括号协议，无插件 plugin.json 注册协议** | 池 ControlPanel → `lk.protocol.*` → `plugins:call` → 壳:537-552（壳 DataDispatch/CardRegistry 遗留已随 #45.7 整删） | ✅ 已代理。主进程 protocol-handlers **自封废弃 fallback**（3 handler 读主进程空实例，零直调） |
| **FileAssociationService** | `_associations` | loader.ts:594（壳） | 池 FoldersView:376 / SearchView:139 → `lk.fileAssociation` → `fileAssociation:getPluginFor` 代理（PROXY_CHANNELS:79）→ 壳:187 | ✅ 已代理。主进程无实例（设计稿"文件打开路由主进程决策"与现状不符——路由在壳 tabs:create） |
| **CommandRegistry** | `_commands` / `_pluginCommands` / `_poolRuntimeCommands` / `_poolPending` | loader + 壳命令模块 + 池 meta 回传（commands:register，Bug C 补全） | 壳（面板/菜单/执行）+ 池执行（Bug C 转发桥 executeInPool） | ✅ 已代理 + 转发桥（真相源声明已写入三处注释）。**漏网：marketplace/index.tsx:15 池内直 import registerCommand → 写池空实例（活 bug，#56 修）** |
| **MenuRegistry** | `_menus` / `_titleBar` | loader + 壳 coreCommands/shellMenus 等 | 壳 MenuRenderer/pushLayout；池经 `menu:getItems` 代理（壳侧 when+翻译一站式） | ✅ 已代理（#14 聪慧→哑桥） |
| **KeybindingRegistry** | `_bindings` / `_chordState` | loader:432 + 壳 | 壳 resolver + 主进程 keyboard-router（经 IPC 序列化收取，零 import——attachKeyboardRouting 通道） | ✅ 已代理（plugins:call 8 个方法） |
| **ConfigurationRegistry** | `_contributions` / `_configKeyOwner` / `_configurationDefaults` | loader:393/438（壳） | 池设置页 → `plugins:call getSchema/getConfigurationContributions/inspectConfiguration` → 壳 | ✅ 已代理（onApply 函数剥壳） |
| **ContextKeyService** | 单例 `_state` | 壳（App effect）+ 池经 `contextKey:set` 代理:265 | 壳 when 求值（菜单过滤/usePoolSync）；preload-shell 同步 store（键盘竞态防线） | ✅ 已代理 + 双向（壳→池 store 同步、池→壳 set） |
| **~~FileDecorationRegistry~~** | ~~`_providers`（JS 函数）~~ | — | — | ✅ **已删（E5.7#60）**——注册表池内化：provider 是 JS 函数不可跨进程，真源与消费方同池 → preload-pool 池内本地注册表（`lk.decorations.*` 四方法，零 IPC）。壳侧恒空实例 + 代理通道 + 广播全链整删 |
| **IconRegistry** | 4 个 Map | loader:461（壳） | 壳（PluginIcon 解析）；池 FileIconResolver 仅注释提及、零 import（文件图标自解） | ✅ 壳内自足，池零消费 |
| **LanguageRegistry** | `languages` | loader registerLanguageBundle（壳） | 壳 LanguagePicker/i18n；池经 `plugins:call getAvailableLanguages` | ✅ 已代理 + 壳内自足 |
| **ThemeRegistry** | `themes` | loader:871/1010（壳） | 壳 ThemeEngine/ThemeBrowser | ✅ 壳内自足 + `plugins:call getAvailableThemes/getCurrentTheme` 代理 |
| ~~**CardRegistry**~~ | ~~`_cards`~~ | — | — | ✅ **已删（E5.7#45.7）**——Phase 5 柱子 5 骨架，registerCard 零调用，卡片工作台插件从未存在 |
| **StatusBarService** | `_items` | **动态 API 零调用**（createStatusBarItem 全仓无调用方）；静态走 plugin.json `statusBar` 声明 | 壳 usePoolSync（getStatusBarContributions + getDynamicStatusBarItems 恒空）→ pushLayout → 池哑渲染 | ✅ 静态贡献正常；动态面属 E6 API 表面 |
| **ClipboardProviderRegistry** | 单例实例 | coreCommands（壳） | coreCommands（壳） | ✅ 壳内自足（E5 归一化产物） |
| **QuickPickService** | `_state` 单例 | 壳（commandPalette/settingsCommands/LanguagePicker/ThemeBrowser 动态 import） | 壳；池 QuickPickHost 收 PoolQuickPickData DTO（#15 聪慧→哑，注释级零 import） | ✅ 已桥接 |
| **ViewContainerService**（RegistryBase 子类） | 实例 | lifecycle（壳） | 壳 + 池经 events 广播 `view-container:changed`（剥离 render 后序列化） | ✅ 已广播；`lk.viewContainer.registerView/getView` 池侧是 no-op 桩（Phase 12 #58） |

---

## 三进程数据流图

```
主进程（main.ts）
  ├─ ipc-bridge PROXY_CHANNELS 36 通道 → 壳渲染进程 IpcBridgeHandler（真数据所在）
  ├─ lang-def-handlers 'langDef:get'      🔴 死 handler（读主进程空实例，零调用）
  ├─ protocol-handlers 3 通道            🔴 死 fallback（读主进程空实例，零直调）
  └─ keyboard-router                      ✅ 经 IPC 序列化收 keybindings（零 registry import）

壳渲染进程（index.html → App.tsx）＝ 静态声明表 + 命令/菜单/快捷键/配置的现真相源
  loader.ts 写入：LangDef/Protocol/FileAssociation/Command/Menu/Keybinding/Configuration/Theme/Language/Icon/ViewContainer
  IpcBridgeHandler：36 代理 case 的服务端

池渲染进程（pool.html → 插件）
  全部经 window.linkdesk.*（preload-pool）——lk.langDef/lk.protocol/lk.fileAssociation/lk.commands/…
  违例：marketplace index.tsx:15 直 import registerCommand（写池空实例）
```

---

## 对 #47 设计的影响

1. **三个迁移表（LangDef/Protocol/FileAssociation）现状全是"代理到壳"形态**——#47 的"主进程预加载 + 直接 IPC"就是把这 2 跳代理拉直为 1 跳直连，且顺带删掉两个读空实例的死 handler（#51 证据充分）。
2. **写入方唯一性在壳**（loader）——迁移 = 把 loader 的这三张表注册收敛到主进程扫盘，池侧 API 面（lk.langDef.get 等）签名不变，插件零改动。
3. **不迁清单维持设计稿**：CommandRegistry/MenuRegistry/KeybindingRegistry/ConfigurationRegistry/ContextKeyService（已有代理+桥，且壳执行逻辑依赖）；FileDecorationRegistry（JS 函数，同进程原则）——**已随 E5.7#60 池内化整删（2026-08-16）**。
4. **意外发现入其他 Phase**：marketplace 直 import → #56 已有；CardRegistry/DataDispatch 遗留空壳 → **已登记 #45.7 并于 2026-08-15 执行整删**；StatusBar 动态 API 零调用 → E6 面。
