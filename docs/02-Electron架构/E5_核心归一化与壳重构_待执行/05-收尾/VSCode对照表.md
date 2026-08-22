# LinkDesk ↔ VS Code 架构术语对照表

> 2026-08-07 E5#111。**新 AI / 新开发者（含 GPT 系 LLM）看到 LinkDesk 术语能直接定位 VS Code 对应模块。**
> VS Code 是"用熟的系统"，LinkDesk 是"看陌生的代码"。这张表是桥。

---

## 一、壳与窗口

| LinkDesk | VS Code | 说明 |
|:--|:--|:--|
| 圆形大厅 (`src/core/`) | `src/vs/workbench/` + `src/vs/platform/` | 壳基础设施——Registry/Service |
| `window.linkdesk.*` | `vscode` namespace | 插件唯一入口，禁止 import `@src/core` |
| 大厅通信 (Registry/Command) | `ICommandService` + `I*Service` | 松耦合——发布/订阅、跨插件命令 |
| 后门直连 (IPC 数据管道) | 无等价物 | 紧耦合——串口数据推流、高频实时通信 |
| 壳 WebView | `renderer` 进程 | 主渲染进程 |
| 插件 WebView | `Extension Host` 进程 | 独立 JS 堆（暂时单 WebView，资产保留） |
| `plugin-shell.html` | `workbench.html` | 壳加载入口 |

---

## 二、插件系统

| LinkDesk | VS Code | 说明 |
|:--|:--|:--|
| `plugin.json` | `package.json` | 声明文件——名称/版本/贡献点 |
| `contributes` | `contributes` | 贡献点声明——完全对标 |
| `contributes.commands` | `contributes.commands` | 命令声明 |
| `contributes.configuration` | `contributes.configuration` | 配置项声明 |
| `contributes.viewsContainers` | `contributes.viewsContainers` | 侧栏容器 |
| `contributes.views` | `contributes.views` | 往容器注册视图 |
| `contributes.themes` | `contributes.themes` | 颜色主题 |
| `contributes.languages` | `contributes.languages` | 语言包 |
| `contributes.i18n` | `l10n/` | **LinkDesk 独有**——每插件自带翻译文件 |
| `appearsIn` | `"viewsContainers": {...}` + `"views": {...}` | **LinkDesk 独有**——声明式 UI 位置 |
| `pluginRole: "view" \| "data"` | `"main"` / 无对应→自动推导 | 推导加载策略 |
| `tabBehavior` | `"activationEvents"` + 标签页行为 | 单例/保底/关闭确认 |
| `factoryRole` | 无等价物——VS Code 壳代码硬编码 | 系统槽位（settings/marketplace） |
| `core: true` | `"__$builtin"` 标志 | 不可卸载的内置插件 |
| `PluginManifest` 类型 | `IExtensionManifest` | TypeScript 类型 |
| `builtin/` | `vscode/extensions/` | 工厂内置插件 |
| `user/` | `~/.vscode/extensions/` | 用户安装插件 |

---

## 三、登记本 (Registry)

| LinkDesk | VS Code | 说明 |
|:--|:--|:--|
| `RegistryBase` | `Disposable` | 基类——自动 `unregisterAll` |
| `CommandRegistry` | `ICommandService` | 命令登记/执行 |
| `ConfigurationRegistry` | `IConfigurationService` | 配置项元数据登记 |
| `KeybindingRegistry` | `IKeybindingService` | 快捷键登记 |
| `MenuRegistry` | `IMenuService` | 菜单项登记 |
| `ThemeRegistry` | `IThemeService` / `ColorThemeRegistry` | 主题登记 |
| `LanguageRegistry` | 无等价物 | **LinkDesk 独有**——语言包元数据 |
| `IconRegistry` | Product Icon Theme | 图标登记 |
| `LangDefRegistry` | `languages.register` | 编程语言定义 |
| `FileAssociationRegistry` | `languages.register` | 文件类型→语言 |
| `ClipboardProviderRegistry` | `editor contributions` | **LinkDesk 独有**——壳统一快捷键 |
| `ViewContainerRegistry` | `IViewContainersService` | 侧栏容器登记 |

---

## 四、服务 (Service)

| LinkDesk | VS Code | 说明 |
|:--|:--|:--|
| `FileService` | `IFileService` | 文件读写（IPC 代理到 main 进程） |
| `ConfigurationService` | `IConfigurationService` | 配置读写 + 变更事件 |
| `StorageService` | `IStorageService` | 键值持久化（localStorage） |
| `ErrorService` | `IErrorHandler` | 统一错误报告（console + toast） |
| `LayoutEngine` | `layout.ts` (shell 内部) | `position:fixed` 四区域堆叠 |
| `ProfileService` | `IProfileService` | 多 Profile 切换 |
| `WorkspaceService` | `IWorkspaceService` | 工作区文件夹管理 |
| `PluginStateService` | `IStorageService` + `memento` | 插件级持久化 |
| `DialogService` | `IDialogService` | 确认弹窗 |
| `StatusBarService` | `IStatusbarService` | 动态状态栏条目 |
| `ContextKeyService` | `IContextKeyService` | when 条件上下文 |
| `AssetPathService` | `asWebviewUri` | 资产路径跨环境归一 |

---

## 五、IPC 与通信

| LinkDesk | VS Code | 说明 |
|:--|:--|:--|
| `IpcBridgeHandler` | `ipcMain` + `ipcRenderer` | 壳↔插件双向 IPC |
| `window.linkdesk.events.emit` | `commands.executeCommand` | 壳级事件广播 |
| `window.linkdesk.events.on` | `vscode.*.onDidChange*` | 事件订阅 |
| `window.linkdesk.requestToPlugin` | 无直接等价——VS Code 主→扩展走 `commands` | 壳→插件请求-响应 |
| `window.linkdesk.p2p.send/on` | 无等价物 | **LinkDesk 独有**——插件→插件直推 |
| `window.linkdesk.tabs.*` | `vscode.window.*` + `IEditorService` | 标签页操作 API |
| `window.linkdesk.menu.*` | `vscode.window.createQuickPick` | 菜单注册 API |
| `window.linkdesk.dialog.*` | `vscode.window.show*` | 弹窗 API |
| `window.linkdesk.clipboard.*` | `vscode.env.clipboard` | 剪贴板 API |
| `window.linkdesk.configuration.*` | `vscode.workspace.getConfiguration` | 配置 API |
| `window.linkdesk.filesystem.*` | `vscode.workspace.fs` | 文件操作 API |
| `window.linkdesk.workspace.*` | `vscode.workspace.workspaceFolders` | 工作区 API |
| `window.linkdesk.path.*` | `vscode.uri` | 路径归一化 API |

---

## 六、UI 组件

| LinkDesk | VS Code | 说明 |
|:--|:--|:--|
| **图标栏 (IconBar)** | **Activity Bar** | 最左 42px——图标切换侧栏 |
| **侧栏 (SidePanel)** | **Sidebar / Auxiliary Bar** | 左边查看区域 |
| **主区 (MainContent)** | **Editor Area** | 中间——标签页内容 |
| **状态栏 (StatusBar)** | **Status Bar** | 底部 24px |
| **标题栏 (TitleBar)** | （原生标题栏） | LinkDesk 自定义 HTML 标题栏 |
| **标签栏 (TabBar)** | **Editor Tabs** | 标签页头部 |
| **汉堡菜单 (HamburgerMenu)** | 菜单栏 | LinkDesk 两种菜单模式 |
| **命令面板 (CommandPalette)** | **Command Palette** | Ctrl+Shift+P |
| **右键菜单 (ContextMenu)** | **Context Menu** | 对标 `IContextMenuService` |
| **通知中心 (NotificationCenter)** | **Notifications Center** | 铃铛+下拉面板 |
| **快速选择 (QuickPick)** | **QuickPick** | 搜索/筛选下拉 |
| **设置页 (SettingsView)** | **Settings Editor** | 配置编辑 |
| **对话框 (ConfirmDialog)** | `showInformationMessage` / `showWarningMessage` | 确认/警告弹窗 |
| **Toast (ToastContainer)** | **Notifications** | 右下角提示 |
| **进度条 (ProgressBar)** | **Progress Bar** | 长时间操作进度 |

---

## 七、可复用 UI 组件

| LinkDesk | VS Code | 说明 |
|:--|:--|:--|
| `OverlayPortal` | `IContextViewService` | 通用悬浮层——portal 到 body |
| `InlineInput` | `InputBox` / `QuickInput` | 内联编辑框 |
| `SelectBox` | `SelectBox` | 下拉选择 |
| `NumberInput` | — | **LinkDesk 独有**——自定义步进按钮 |
| `FontFamilySelect` | — | **LinkDesk 独有**——等宽字体选择器 |
| `FilePathInput` | — | **LinkDesk 独有**——文件路径输入 |
| `SidebarSection` | `ViewPane` | 可折叠侧栏 section |
| `MenuRenderer` | `Menu` | 菜单渲染器（TitleBar + HamburgerMenu 共用） |
| `PluginIcon` | `ThemeIcon` | 插件图标统一渲染 |
| `ErrorBoundary` | — | **LinkDesk 独有**——插件崩溃隔离 |

---

## 八、标签页系统

| LinkDesk | VS Code | 说明 |
|:--|:--|:--|
| `useTabManager` | `IEditorService` / `IEditorGroupsService` | 标签页增删改查 |
| `tabIdentity` | `EditorInput.matches()` | 标签身份判断 |
| `splitTree` | `SplitView` / `EditorGroup` | 分屏树 |
| `keep-alive` (opacity:0) | — | **LinkDesk 独有**——所有面板平级渲染，显隐切换 |
| `pendingReveal` | `IPartService` + openEditor | F12 跨文件跳转暂存 |
| `Hot Exit` | `Hot Exit` | 未保存内容备份恢复 |

---

## 九、i18n / 主题 / 图标

| LinkDesk | VS Code | 说明 |
|:--|:--|:--|
| `t()` / `useTranslation()` | `l10n.t()` | i18next 翻译 |
| `lang-defaults` 语言插件 | Language Pack extension | 壳级通用翻译 |
| `contributes.i18n` | `l10n` 目录 | **LinkDesk 独有**——每插件自带翻译 |
| `i18n/en.json` (key=中文) | `package.nls.json` (key=英文) | **LinkDesk 独有**——中文原文即 key |
| `parseMissingKeyHandler: key→key` | — | 无翻译时 fallback 中文原文 |
| `plugin.schema.json` | `extension point schema` | plugin.json 的 JSON Schema |
| CSS 变量 `var(--*)` | VS Code theme colors | 配色系统 |
| `ThemeEngine` | `IThemeService` | 主题应用引擎 |
| `theme-defaults` 主题插件 | Built-in themes | 出厂颜色主题 |
| Lucide 图标 | Codicon | SVG 图标系统 |
| `codicon-*` | Codicon | VS Code 矢量图标字体 |

---

## 十、事件系统

| LinkDesk | VS Code | 说明 |
|:--|:--|:--|
| `ShellEvents` | `IWorkbenchLayoutService` 事件等 | 壳级事件定义 |
| `CoreEvents` | 各 Service 的 `onDidXxx` Event | 核心变更事件 |
| `onDidChange(event, cb)` | `Event<T>` 模式 | Event emitter |
| 事件缓冲回放 | 无等价物 | emit 早于 on 时缓存回放 |
| `ShellEventBus` | — | **LinkDesk 独有**——跨区域事件总线 |

---

## 十一、工程化

| LinkDesk | VS Code | 说明 |
|:--|:--|:--|
| `vite.config.ts` | `gulpfile.js` | 构建配置 |
| `rollupOptions.input` (多入口) | — | **LinkDesk 独有**——壳+插件独立 chunk |
| `dist/plugins/<id>.js` | `extensions/<id>/` | 插件编译产物 |
| `scripts/audit-i18n.mjs` | — | **LinkDesk 独有**——i18n 全量审计 |
| `shared/constants.ts` | `base/common/platform.ts` | 共享常量 |
| `public/schemas/` | `schemas/` | JSON Schema 定义 |

---

## 十二、插件通信铁律

| 规则 | 说明 |
|:--|:--|
| **禁止 import `@src/core`** | 对标 "extensions 不能 import workbench" |
| **所有通信走 `window.linkdesk.*`** | 对标 "所有 API 走 `vscode.*`" |
| **例外需记录到 `plugin-import-exceptions.md`** | 每处例外写清原因 + 替代方案 |
| **ESLint `no-core-import-in-plugin`** (error) | 机械拦截 |

---

> **← 索引：** [E5-收尾执行清单](E5-收尾执行清单.md)
> **← E5 设计：** [../00-设计.md](../00-设计.md)
