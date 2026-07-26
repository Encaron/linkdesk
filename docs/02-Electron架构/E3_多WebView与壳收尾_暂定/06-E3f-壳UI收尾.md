# E3f — 壳 UI 收尾

> 2026-07-24。从旧 P7d 拆分——壳的最后体验打磨：标题栏、菜单、输出面板、欢迎页、Workspace、会话持久化。
> **性质：** 纯 TS/React + Electron 窗口 API。不涉及多进程通信。
> **依赖：** E3a（多 WebView 就绪——输出面板和欢迎页跨进程可用）

---

## 一、标题栏暗色化

Electron `BrowserWindow` 的 `titleBarStyle` / `backgroundColor` → 暗色标题栏匹配 LinkDesk 暗色主题。

纯 Electron 配置，~20 行。

---

## 二、菜单栏——hamburger + menubar 双模式，同一数据源

### 2.1 为什么是双模式

**对标 VS Code 的做法。** VS Code 有两套菜单渲染：

| 平台 | 菜单位置 | 实现 |
|------|------|------|
| 桌面版（Windows/macOS/Linux） | 窗口顶部原生菜单栏——File / Edit / Selection / View / Go / Run / Terminal / Help | Electron `Menu.setApplicationMenu()` |
| 浏览器版（vscode.dev） | 标题栏左侧 ☰ 图标 → 点击弹出下拉菜单 | 纯 HTML/CSS 下拉层 |

**两套渲染共享同一份菜单数据。** VS Code 的 `MenuRegistry` 存储菜单项树（label + command + when 条件 + keybinding 提示），桌面版喂给 Electron `Menu.buildFromTemplate()`，浏览器版喂给 React `<MenuBar>` 组件。菜单项的新增/删除/显隐——改数据层，两个渲染目标自动同步。

**LinkDesk 同理。** 虽然长时间内会在桌面端（Electron），但架构不应绑死桌面。`MenuRegistry` 数据模型已在 Phase 5 建好——多级嵌套、when 条件、command 绑定、accelerator 提示——缺的只是第二个渲染目标。

### 2.2 双模式设计

```
设置项: "menuStyle": "hamburger" | "menubar"    默认 "hamburger"

              MenuRegistry (数据源——已有，不新增)
               ├── 壳级菜单：File / Edit / View / Help
               ├── 插件贡献：contributes.menus (menuBar 位置)
               └── onDidChange → 渲染目标自动同步
                      │
          ┌───────────┴───────────┐
          │                       │
    hamburger 渲染器          menubar 渲染器
    (全平台可用，默认)         (Electron 桌面端)
          │                       │
    <HamburgerMenu />        Menu.buildFromTemplate()
    position:fixed 下拉       → Menu.setApplicationMenu()
    ~90 行 React             ~20 行适配函数
```

- **hamburger**（默认）：全平台一致。Electron 桌面能用，未来浏览器版也能用。不依赖 OS 原生菜单 API——菜单颜色跟随主题，不和标题栏打架。对标 VS Code 浏览器版。
- **menubar**：桌面用户可选。Electron `Menu.buildFromTemplate()` 吃的是类似的树形结构——写一个适配函数把 `MenuRegistry` 的 menu tree 转成 Electron `MenuItem` constructor 格式。macOS 上菜单在屏幕顶部，Windows/Linux 上嵌在窗口标题栏下方。`menuService.onDidChange → Menu.setApplicationMenu()` 订阅即可。

**为什么默认 hamburger 而不是 menubar：**
1. 一套代码全平台跑——不需要为不同 OS 写不同的菜单逻辑
2. 菜单颜色跟随 LinkDesk 主题——原生菜单栏在 Windows 上不受 CSS 控制，深色主题下白菜单栏割裂
3. 插件贡献的菜单项在 ☰ 里自动出现——和原生菜单栏完全相同的可见性
4. 用户想要原生体验时切到 menubar——只是一个设置项，不是架构改动

### 2.3 菜单内容（两种模式共享）

```
  File
    ├ Open Folder…              Ctrl+K Ctrl+O
    ├ Open Recent ▼
    ├ Import Workspace…
    ├ Export Workspace…
    ├ Exit                      Alt+F4

  Edit
    ├ Undo / Redo              Ctrl+Z / Ctrl+Y
    ├ Cut / Copy / Paste / Select All

  View
    ├ Command Palette…          Ctrl+Shift+P
    ├ Toggle Sidebar            Ctrl+B
    ├ Settings…                 Ctrl+,
    ├ Theme ▼ / Language ▼

  Help
    ├ About / Open Log Folder
```

插件贡献顶级菜单组（`contributes.menus` 中 `location: "menuBar"` 的项）→ 两种模式自动多一项。~90 行（hamburger 渲染器）+ ~20 行（menubar 适配函数）+ ~10 行（menuStyle 配置项注册）= ~120 行。

---

## 三、齿轮菜单全集——四种齿轮，四个 MenuId（🔥 2026-07-26 重写）

> 齿轮菜单问题困扰已久。此处一次性理清 LinkDesk 所有齿轮——对标 VS Code 四种齿轮，每种独立 `MenuId` 互不串扰。

### 3.1 总览——LinkDesk 四种齿轮

```
┌─────────────────────────────────────────────────────────────────────┐
│ 齿轮 #1：全局左下齿轮          齿轮 #2：插件卡片齿轮                 │
│ MenuId.ExtensionGear           MenuId.MarketplaceItemGear           │
│ 位置：图标栏底部 ⚙             位置：marketplace 侧栏每个插件卡片 ⚙   │
│ 谁注册：核心 coreCommands.ts   谁注册：marketplace ensureMarketplace  │
│ 出现条件：永远可见              出现条件：非 core:true 插件            │
│ 菜单位置：IconBar.tsx          菜单位置：marketplace/sidebar.tsx      │
│ 状态：✅ 已实现                 状态：✅ 已实现（#36g 补全中）         │
├─────────────────────────────────────────────────────────────────────┤
│ 齿轮 #3：设置项齿轮            齿轮 #4：命令面板齿轮                 │
│ MenuId.SettingItemGear         MenuId.CommandPaletteItemGear        │
│ 位置：Settings Editor 每个设    位置：Ctrl+Shift+P 悬浮窗每个命令     │
│       置项 hover 时出现 ⚙            项 hover 时出现 ⚙               │
│ 谁注册：核心 coreCommands.ts   谁注册：核心 coreCommands.ts           │
│ 出现条件：hover 时可见          出现条件：hover 时可见                 │
│ 菜单位置：SettingsView.tsx     菜单位置：QuickPick.tsx               │
│ 状态：❌ #53（本文设计）         状态：❌ #53b（本文新增）            │
└─────────────────────────────────────────────────────────────────────┘
```

**四种齿轮共用同一套基础设施：**
- 菜单项注册 → 全部走 `MenuRegistry.registerMenuItems(menuId, pluginId, items)`
- 渲染 → 全部走共享 `<ContextMenu>` 组件
- 显隐过滤 → 全部走 `ContextKeyService.matches(when)`
- 命令 → 全部走 `CommandRegistry.executeCommand(id, ctx)`

**四种齿轮互不串扰——** 每个有独立的 `MenuId`，注册到不同的菜单本分区。全局齿轮的项不会出现在插件卡片齿轮里，反之亦然。

### 3.2 齿轮 #1——全局左下齿轮（`ExtensionGear`）✅

**对标 VS Code：** Activity Bar 左下角 Manage 按钮（`Settings / Keyboard Shortcuts / Themes / ...`）

**位置：** `IconBar.tsx` 图标栏底部 ⚙ 按钮。永远可见——不依赖任何插件。

**菜单项（当前）：**

| 菜单项 | 命令 | when |
|------|------|------|
| 设置 | `core.openSettings` | — |
| 命令面板 | `workbench.action.showCommandPalette` | — |
| 选择颜色主题 | `workbench.action.selectTheme` | — |
| 打开键盘快捷方式 | `workbench.action.openKeyboardShortcuts` | — |

**归属：** 核心 `coreCommands.ts` 注册到 `MenuId.ExtensionGear`。**换 marketplace 不影响此齿轮。**

### 3.3 齿轮 #2——插件卡片齿轮（`MarketplaceItemGear`）✅

**对标 VS Code：** Extensions 视图中每个扩展卡片右侧 ⚙ 按钮。

**位置：** `marketplace/sidebar.tsx` 每个插件卡片的齿轮按钮。仅非 `core: true` 插件显示。

**菜单项（声明驱动——根据 `plugin.json` `contributes` 自动显隐）：**

| 菜单项 | 命令 | when |
|------|------|------|
| 设置 | `core.openSettings` | `extensionHasConfiguration` |
| 选择颜色主题 | `workbench.action.selectTheme` | `extensionHasThemes` |
| 键盘快捷方式 | `workbench.action.openExtensionKeybindings` | `extensionHasKeybindings`（#36g2） |
| 语言入口 | （待定） | `extensionHasLanguages`（#36g3） |
| 图标主题入口 | （待定） | `extensionHasIconThemes`（#36g4） |
| 启用 | `marketplace.enable` | `pluginDisabled` |
| 禁用 | `marketplace.disable` | `!pluginDisabled` |
| 卸载 | `marketplace.uninstall` | — |

**归属：** marketplace 插件 `ensureMarketplaceCommands()` 注册到 `MenuId.MarketplaceItemGear`。**换 marketplace 不影响全局齿轮。** 加菜单项只改一个文件：`plugins/marketplace/src/sidebar.tsx`（`gear-menu-normalization.md` 机械规则）。

**声明驱动链路：**
```
点击插件齿轮
  → applyExtensionContextKeys(manifest, isDisabled)
    → c.configuration 存在 → extensionHasConfiguration = true
    → c.themes 存在       → extensionHasThemes = true
    → c.languages 存在    → extensionHasLanguages = true
    → ...
  → ContextMenu 渲染 → 逐项求值 when → 过滤 → 显示匹配项
```

**没有一行代码是 `if (pluginId === "...")`。** 分辨逻辑唯一来源 = `plugin.json` 的 `contributes` 块。

### 3.4 齿轮 #3——设置项齿轮（`SettingItemGear`）❌

**对标 VS Code：** Settings Editor 每个设置项 hover 时右侧出现齿轮，点击弹出：
```
┌──────────────────────────┐
│ 重置此设置                │  ← 仅用户改过值时显示
│ 复制设置 ID               │
│ 将设置复制为 JSON 文本     │
│ 将设置复制为 URL           │  ← Phase 6
│ ✓ 同步此设置              │  ← Phase 6
└──────────────────────────┘
```

**位置：** `SettingsView.tsx` 每个设置行 hover 时右侧出现齿轮图标。

**菜单项设计：**

| 菜单项 | 命令 | when | 说明 |
|------|------|------|------|
| 重置此设置 | `workbench.action.resetSetting` | `settingModified` | 仅用户改过值时显示——还原到 `default` 值 |
| 复制设置 ID | `workbench.action.copySettingId` | — | `navigator.clipboard.writeText(key)` |
| 复制为 JSON | `workbench.action.copySettingAsJson` | — | `JSON.stringify({key, value})` |
| 复制为 URL | `workbench.action.copySettingAsUrl` | — | Phase 6——深层链接 |
| 同步此设置 | `workbench.action.toggleSettingSync` | — | Phase 6——Profile sync |

**Context key：** 打开齿轮前设 `settingKey`（当前 hover 的设置项 key）+ `settingModified`（当前值 ≠ default 值）。

**归属：** 核心 `coreCommands.ts` 注册到 `MenuId.SettingItemGear`。菜单项对所有设置项相同——不依赖具体插件。唯一变量是 `settingModified` context key（是否显示"重置"）。

**渲染位置：** `SettingsView.tsx` 每个设置行的 JSX 中。hover → ⚙ 图标出现 → 点击 → `<ContextMenu menuId={MenuId.SettingItemGear}>`。

**与 #59a 的合并：** #59a "设置项一键恢复默认" 描述的是同一齿轮的功能。"重置此设置" 菜单项消费 `ConfigurationService.reset(key)` + `showConfirm` 防呆。

### 3.5 齿轮 #4——命令面板齿轮（`CommandPaletteItemGear`）❌

**对标 VS Code：** Ctrl+Shift+P 命令面板中，几乎每个命令项 hover 时右侧出现齿轮，点击弹出：
```
┌──────────────────────────────────────┐
│ 重置 "文件操作需要预览" 的选项        │  ← 仅 toggle 命令显示
│ ─────────────────────────────────── │
│ 帮助：报告问题...                     │
│ 帮助：报告性能问题...                 │
│ 帮助：查看许可证                      │
│ 帮助：订阅 VS Code 新闻邮件           │
│ 帮助：辅助功能入门                    │
│ 帮助：个人资料                        │
│ 帮助：关于                            │
│ 帮助：欢迎                            │
│ 帮助：键盘快捷键参考 (Ctrl+K Ctrl+R)  │
└──────────────────────────────────────┘
```

**VS Code 的齿轮内容分两组：**
- **上组：重置选项** ——仅对 toggle 类命令出现（"Reset choice for '...'"）→ 跳转到设置中的具体配置项
- **下组：帮助类** ——对所有命令都出现（"Help: Report Issue / View License / About / Welcome / ..."）

**位置：** `QuickPick.tsx` 悬浮窗每个命令项 hover 时右侧出现齿轮图标。

**菜单项设计（LinkDesk 版）：**

| 菜单项 | 命令 | when | 说明 |
|------|------|------|------|
| 重置选项 | `workbench.action.resetCommandChoice` | `commandHasSetting` | 仅 toggle 命令——跳转到设置中的对应配置项 |
| 打开插件详情 | `workbench.action.openPluginDetail` | `commandPluginId` | 跳转到命令所属插件的详情页 |
| 报告问题 | `workbench.action.reportIssue` | `commandPluginId` | Phase 6——打开 GitHub issue |
| 复制命令 ID | `workbench.action.copyCommandId` | — | `navigator.clipboard.writeText(commandId)` |

**Context key（打开齿轮前设置）：**

| key | 值 | 来源 |
|------|------|------|
| `commandId` | 当前 hover 的命令 ID | QuickPick item data |
| `commandPluginId` | 命令所属插件 | `CommandRegistry._owners.get(commandId)` |
| `commandHasSetting` | 是否为 toggle 命令（关联到某个设置项） | `CommandRegistry` 命令元数据 `configurationKey` 字段 |

**声明驱动——不硬编码命令名：**
```
QuickPick 渲染命令项
  → 从 CommandRegistry 获取 command 元数据
    → command.configurationKey 存在 → commandHasSetting = true
    → command.pluginId              → commandPluginId = "marketplace"
  → 齿轮菜单 ContextMenu
    → "重置选项" when: "commandHasSetting"
      → handler: openSettings({ pluginId: commandPluginId, scrollTo: configurationKey })
    → "打开插件详情" when: "commandPluginId"
      → handler: openOrFocusTab("plugin-detail", { detailPluginId: commandPluginId })
    → "复制命令 ID" → handlers: clipboard.writeText(commandId)
```

**没有 `if (commandId === "...")`。** 命令的类型信息（是否为 toggle、关联哪个设置项 key、属于哪个插件）全部从 `plugin.json` `contributes.commands` 的声明字段推导。`CommandRegistry` 注册时存储这些字段。

### 3.6 四种齿轮对比——一眼分清

| | 全局左下 | 插件卡片 | 设置项 ⚙ | 命令面板 ⚙ |
|------|:--:|:--:|:--:|:--:|
| `MenuId` | `ExtensionGear` | `MarketplaceItemGear` | `SettingItemGear` | `CommandPaletteItemGear` |
| 触发方式 | 点击 | 点击 | hover 出现 | hover 出现 |
| 菜单位置 | 左下角弹出 | 齿轮旁弹出 | 设置行旁弹出 | 命令项旁弹出 |
| 菜单项由谁注册 | 核心 | marketplace 插件 | 核心 | 核心 |
| context 来源 | 插件→无 | `applyExtensionContextKeys` | 设置项 key + 是否被修改 | 命令 ID + 所属插件 + 是否 toggle |
| 菜单项因插件而异？ | 否 | 是——取决于 `contributes` | 否——对所有设置项相同 | 部分——toggle 显示"重置"，其余相同 |
| 换 marketplace 后 | 不受影响 | 跟随新的 marketplace | 不受影响 | 不受影响 |

### 3.7 实现路线

| 齿轮 | 任务 | 状态 |
|------|------|:--:|
| #1 全局左下 | 已有——`coreCommands.ts` → `MenuId.ExtensionGear` | ✅ |
| #2 插件卡片 | 已有——`marketplace/sidebar.tsx` → `MenuId.MarketplaceItemGear`；#36g 补 context key | ✅ |
| #3 设置项 | #53（本文——合并 #59a） | ❌ |
| #4 命令面板 | #53b（本文新增） | ❌ |

### 3.8 任务清单

#### #53 设置项齿轮（合并 #59a，~65 行）

- **#53a** `MenuRegistry` 加 `MenuId.SettingItemGear`（1 行）
- **#53b** `registerMenuItems(MenuId.SettingItemGear, APP_PLUGIN_ID, [...])`——5 个菜单项 + when 条件（~15 行）
- **#53c** `SettingsView.tsx` 每行加 hover 齿轮图标 + `<ContextMenu menuId={MenuId.SettingItemGear}>`（~20 行）
- **#53d** 齿轮打开前设置 context key：`settingKey` + `settingModified`（~10 行）
- **#53e** `core.openSettings` handler 支持 `scrollTo` 参数——跳转到设置中的具体配置项 + 滚动定位（~20 行）

**验证：** 打开设置→hover 任意设置项→齿轮出现→点击→"重置此设置"（仅修改过的）/ "复制设置 ID" / "复制为 JSON" → 点击"重置"→确认弹窗→值回到 default

#### #53b 命令面板齿轮（新增，~50 行）

- **#53b1** `CommandRegistry` 注册时存储 `configurationKey`（toggle 命令关联的设置项 key）——从 `plugin.json` `contributes.commands[].configurationKey` 读取（~5 行）
- **#53b2** `MenuRegistry` 加 `MenuId.CommandPaletteItemGear`（1 行）
- **#53b3** `registerMenuItems(MenuId.CommandPaletteItemGear, APP_PLUGIN_ID, [...])`——4 个菜单项 + when 条件（~15 行）
- **#53b4** `QuickPick.tsx` 每个命令项行加 hover 齿轮图标 + `<ContextMenu menuId={MenuId.CommandPaletteItemGear}>`（~15 行）
- **#53b5** 齿轮打开前设置 context key：`commandId` + `commandPluginId` + `commandHasSetting`（~10 行）
- **#53b6** `plugin.schema.json` `contributes.commands` 加 `configurationKey` 字段——toggle 命令关联到哪个设置项 key（~4 行）

**验证：** Ctrl+Shift+P→hover "Toggle Terminal" 命令→齿轮出现→点击→"重置选项"（跳转到设置页对应配置项+滚动定位）/ "打开插件详情"（跳转到终端插件详情页）/ "复制命令 ID"（剪贴板="terminal.toggle"）

---

## 四、输出面板 UI

Phase 5 建了 `LogChannel` 数据通道，但查看器 UI 没做。

```
输出面板：
  ├── 频道选择器（"终端" / "协议-SBQ" / "CAD" / "通用"）
  ├── 日志列表（等宽字体、按 source 着色、自动滚动）
  └── 清空 / 导出按钮
```

对标 VS Code Output 面板。~80 行。

---

## 五、欢迎页集成

```
状态 A：未打开文件夹 → "打开文件夹" 按钮 + recentFolders 列表
状态 B：已打开文件夹 → 文件树显示内容 + 标题栏显示文件夹名
状态 C：关闭文件夹 → 回到 A
```

Phase 4 欢迎页已有 `recentViews`。加 `recentFolders`。~40 行。

---

## 六、Workspace 导入导出

导入：Electron dialog 选 `.linkdesk-workspace` → 解压到 workspace 目录 → WorkspaceService.addFolder。
导出：WorkspaceService.activeFolder → 打包 `workspace.json` + settings + 卡片数据 → 另存为。~50 行。

---

---

## 七、终端会话持久化

Phase 5.5c 的会话数据存在内存（`useTerminalSessions` 模块级单例）。加磁盘持久化：

```
软件关闭 → 最后一次 sessions 快照写入 .linkdesk/sessions.json
软件启动 → loadSessionsFromDisk() → 恢复到内存
```

消费 E2c FileService。~30 行。

---

## 八、Developer 工具

### DevTools 管理命令

E3 多 WebView 后每个插件有独立 DevTools——手动逐个右键→Inspect 不可行。提供一个壳命令：

```
Ctrl+Shift+P → "Developer: Toggle Plugin DevTools"
  → QuickPick 列出所有运行中的插件 WebView
  → 选一个 → 打开/关闭它的 DevTools（detach 模式，独立窗口）
```

底层调 `WindowManager.toggleDevTools(pluginId)`（E3a #24 新增）。只在非打包模式可用。

---

## 九、设置页增强——快捷键子栏

### 对标 VS Code

VS Code 的 Keyboard Shortcuts 页面：左侧 "User Settings" / "Keyboard Shortcuts" 两个 tab，右侧显示快捷键表格——命令名、绑定、来源、when 条件。双击改绑定，冲突红字提示。

### 实现

设置页改双 tab 结构：

```
Settings Editor
├── [设置] [快捷键]        ← 两个 tab
├── 设置 tab → 现有 GUI（下拉框/复选框/输入框）
└── 快捷键 tab → 表格视图
      ├── 搜索（实时过滤）
      ├── 列：命令名 / 快捷键 / 来源 / when 条件
      ├── 双击行 → 弹窗 "按下新快捷键" → 冲突自动高亮
      └── 右键 → 重置绑定 / 复制命令 ID
```

数据源：`KeybindingRegistry.getKeybindings()`——所有已注册快捷键（builtin + plugin + user）。用户覆盖写入 `keybindings.json`（消费 E2c #17），优先级 user > plugin > builtin 自动生效。

**这不需要新基础设施。** `KeybindingRegistry` 已就绪，`keybindings.json` 读写已就绪（E2c #17）。只差 GUI。

~60 行。

---

### 九-B、设置项一键恢复默认（防呆）

**对标 VS Code：** 每个设置项左侧有齿轮图标 → "Reset Setting"——用户改乱了直接回出厂值。

**实现：** `ConfigurationService` 已有每个 key 的 `default` 值（来自 `contributes.configuration`）。恢复默认 = 删用户值 → 重新读 → 回退到 default。

**UI：** 每个设置项右侧加一个齿轮图标（× 还原）。点击 → `showConfirm("恢复默认值？")` → 确认 → `ConfigurationService.reset(key)` → 控件值即时更新。齿轮图标始终显示（没有修改值的 gray out，用户手动设了值再改回 default 也要有这个路径）。

~15 行。

---

### 九-C、FileDecorationRegistry——文件装饰器注册中心

**对标 VS Code：** `IExplorerService` 有一个 `FileDecorationProvider` 注册中心。Git 插件注册装饰器（M/A/D），文件树渲染时调用。供需双方在两个插件里——**注册中心理应是核心服务。**

**为什么在 E3 而不是 E4：** E3 是最后一次碰核心的机会。封板后后悔就只能给 E4 打补丁了。~40 行换一个干净的架构边界。

```typescript
// src/core/FileDecorationRegistry.ts（新）
// 🔥 文件装饰器注册中心——Git 注册，文件树消费

interface FileDecoration {
  badge?: string;              // "M" "A" "D" "!"
  color?: string;              // CSS 变量
  tooltip?: string;            // 悬停提示
  propagate?: boolean;         // 是否向上传播到父目录
}

interface FileDecorationProvider {
  id: string;
  priority?: number;            // 默认 0，Git = 10。高优先级覆盖低优先级
  onDidChangeFileDecorations: Event<string[]>;  // 空数组 = 全部刷新
  provideDecoration(uri: string): FileDecoration | undefined;
}

class FileDecorationRegistry {
  private _providers: FileDecorationProvider[] = [];

  register(provider: FileDecorationProvider): IDisposable;
  unregister(id: string): void;

  getDecorations(uri: string): FileDecoration[] {
    return this._providers
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .map(p => p.provideDecoration(uri))
      .filter(Boolean) as FileDecoration[];
  }
}
```

**消费关系：**
- **Git 插件** → `fileDecorationRegistry.register({ id: 'git', provideDecoration })`
- **文件树 (E4)** → `fileDecorationRegistry.getDecorations(uri)` → 取最高优先级显示

**为什么不是 `FileDecoration[]` 返回值：** 当前取最高优先级单装饰（VS Code 行为）。v2 如果有需求横向合并多装饰，接口升级为 `FileDecoration | FileDecoration[]`——注册中心不变，调用方改合并逻辑。

~40 行。

---

### 九-D、`<SelectBox>` 归一化下拉组件——替代所有原生 `<select>`

**对标 VS Code：** VS Code 不用原生 `<select>`——自己画 `SelectBox`（`src/vs/base/browser/ui/selectBox/`）。原生 `<select>` 在 Electron 里走独立 OS 渲染通道，跟 Chromium 合成器节奏不同步，表现为无动画闪出。跟 `alert()`/`confirm()` 是同一类问题（[dialog-normalization-requirement]）。

**归一化要求：**
- 全局只有一个 `<SelectBox>` 组件——不同页面/插件传不同的 `options`、`value`、`onChange`
- UI 行为统一：动画曲线、最大高度、搜索过滤（options > 8 时自动出现）、键盘导航（↑↓Enter Esc）
- 主题色适配：下拉面板背景 `var(--bg-window)`、选中项 `var(--accent)`、分隔线 `var(--separator)`

**组件接口：**
```typescript
// src/components/shared/SelectBox.tsx（新）
interface SelectBoxProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}
```

**替换范围（grep `<select` 全项目）：**
- `plugins/terminal/src/ControlPanel.tsx`——COM/波特率/协议（3 个）
- 其他插件/组件中的 `<select>`（grep 确认）
- 替换后项目里不允许新的原生 `<select>` 出现

~100 行。

---

## 十、任务清单

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| 51 | 标题栏暗色化——Electron titleBarStyle/backgroundColor | ~20 | 标题栏颜色 = 主题色 |
| 52 | 菜单栏双模式——hamburger（默认）+ menubar（Electron 原生），共享 MenuRegistry 数据源 | ~120 | 点击 ☰ → 四组菜单；切 menubar → 原生菜单栏内容一致 |
| 53 | 齿轮菜单完整版——context key 驱动 5 项 | ~40 | 齿轮 → 配置/查看日志 跳到对应位置 |
| 54 | 输出面板 UI——频道选择器 + 日志列表 + 清空/导出 | ~80 | 切频道 → 日志内容切换 |
| 55 | 欢迎页集成——三种状态切换 + recentFolders | ~40 | 打开文件夹 → 状态 B → 关闭 → 状态 A |
| 56 | Workspace 导入导出 | ~50 | 导出 → 导入 → 布局/设置复原 |
| 57 | 终端会话持久化——sessions.json 读写 | ~30 | 关闭 → 重启 → 会话列表恢复 |
| 58 | **Developer: Toggle Plugin DevTools**——QuickPick + WindowManager.toggleDevTools | ~10 | Ctrl+Shift+P → 选插件 → DevTools 弹出/关闭 |
| 59 | **设置页快捷键子栏**——双 tab + 表格视图 + 冲突检测 | ~60 | 打开设置→快捷键 tab→所有快捷键可搜索→双击改绑定→冲突红字 |
| 59a | **设置项一键恢复默认**——每项齿轮图标 + `showConfirm` + `ConfigurationService.reset(key)`（防呆） | ~15 | 改值→齿轮亮→点击→确认→回到出厂默认 |
| 59b | **🔥 FileDecorationRegistry**——文件装饰器注册中心，Git 注册/文件树消费 | ~40 | Git 注册 provider→getDecorations(uri) 返回装饰→注销→返回空 |
| 59c | **🔥 `<SelectBox>` 归一化**——替代全项目原生 `<select>`，统一动画/搜索/键盘导航 | ~100 | ControlPanel 三个下拉→同组件；设置页/主题/语言选择器→同组件 |
| **合计** | | **~605 行** | |

---

## 十一、验证标准

```
标题栏 → 暗色背景匹配主题
☰ 菜单 → File/Edit/View/Help 四项可用 → 快捷键显示正确
齿轮菜单 → 5 项由 context key 驱动 → 禁用态正常
输出面板 → 按频道切换 → 日志着色 → 清空/导出正常
欢迎页 → 三种状态切换 → recentFolders 列表可点击
Workspace → 导出 → 导入 → 布局复原
会话持久化 → F5 刷新 → 会话名恢复
```

---

> **← 上一份：** `05-E3e-通知系统.md`
> **→ 下一份：** `07-E3g-API与V2兼容.md`
> **E3 索引：** `00-README.md`
