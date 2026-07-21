# Phase 5 → Phase 6 通盘分析

> 2026-07-20。2026-07-21 修订：Phase 6 按 6a/6b/6c 三层组织——6a 文件树基础闭环、6b 编辑体验完整闭环、6c 主题/语言引擎升级。
> Phase 5 和 Phase 6 是通盘考虑的——Phase 5 建基础设施，Phase 6 在基础设施上写功能。
> **前提：Phase 5.5 必须先完成**（三栏交互对标 VS Code + 终端布局重新设计——`viewRole` 声明替代 `isSidebarOnlyView` 硬编码）。
> 有了 `viewRole: "sidebarPrimary"`，文件树才能作为纯侧栏视图加载，不被强制开空标签页。
> 但 Phase 4→5 有断层分析，Phase 5→6 也应该有——不是修断层，是**在动手前想清楚接口，不留债。**
> **照抄 VS Code，不自己发明。** 以下是读 VS Code 源码后的结论。
> 这份文档标注：Phase 6 要做哪些事、新出现的需求怎么承接、Phase 5 留了什么但 Phase 6 还缺什么。
>
> **Phase 6 的本质 = 编辑能力。** 文件树 + 文件操作 + 文本编辑 + 主题/语言引擎 = 完整的文件编辑基础设施。三层（6a/6b/6c）从基础到完整递进。详见 [V3-Phase6.5-抛光与补齐.md](../phase6.5_抛光/V3-Phase6.5-抛光与补齐.md) §一。

---

## 一、Phase 6 全部任务（3 层，19 + 9 = 28 项）

### 6a — 文件树基础闭环（原 Phase 6 核心）

> 对标 VS Code Explorer + Editor。文件浏览/打开/关闭 + Monaco 编辑 JSON + 文件关联。

| # | 任务 | 性质 |
|:--:|------|------|
| 1 | 文件树（📁 图标栏图标 → 侧栏/标签页，系统视图 + MenuId.FileContext） | 新视图 |
| 2 | 文件关联（contributes.fileAssociations） | 新贡献类型 |
| 3 | 文件系统访问抽象（FileService + Rust 端命令） | 新服务 |
| 4 | 工作区文件夹概念（WorkspaceService） | 新服务 |
| 5 | 系统文件拖入窗口打开 | 交互入口 |
| 6 | Reopen Closed Tab（Ctrl+Shift+T） | 壳功能 |
| 7 | JSON 编辑器标签页（Monaco 打开 settings.json） | 新标签页类型 |

### 6b — 编辑体验完整闭环（原 Phase 6 "不做" + 6.5 文件项，回归 Phase 6）

> Phase 6 本就是编辑能力——文件搜索/多选/编码/拖拽/JSON schema/多工作区/文件图标/装饰器是编辑能力的自然组成部分，不应拆到 6.5。

| # | 任务 | 性质 |
|:--:|------|------|
| 8 | 文件搜索（Ctrl+Shift+F 跨文件内容搜索） | 新功能 |
| 9 | 文件树多选/批量操作 | 交互增强 |
| 10 | 文件编码检测/切换（EncodingService） | 新服务 |
| 11 | 拖拽文件树节点到编辑区 | 交互增强 |
| 12 | Settings Editor JSON schema 提示/自动补全 | Monaco 增强 |
| 13 | 多工作区文件夹（Multi-root） | WorkspaceService 升级 |
| 14 | 文件图标主题（File Icon Theme） | 新贡献类型 |
| 15 | 文件装饰器框架（FileDecorationProvider 接口 + DecorationRegistry） | 新扩展点 |

### 6c — 主题/语言引擎 + Profile + 壳完善（原 Phase 6 其余项）

| # | 任务 | 性质 |
|:--:|------|------|
| 16 | 主题系统插件化 + 主题浏览器 UI | 引擎升级 |
| 17 | 语言系统插件化 | 引擎升级 |
| 18 | 退路系统（核心兜底主题 + 核心兜底语言） | 壳加固 |
| 19 | Profile 系统（插件集合声明式管理） | 新系统 |
| 20 | activationEvents（按需激活，和 Profile 联动） | loader 升级 |
| 21 | 插件依赖声明（extensionDependencies） | loader 升级 |
| 22 | 齿轮菜单完整版（context key 驱动） | UI 完善 |
| 23 | 输出面板 UI | 新视图 |
| 24 | 欢迎页集成（"打开文件夹"入口 + recentFolders） | UI 完善 |
| 25 | 插件资源访问 API（getResourceUri） | 新 API |
| 26 | 标题栏暗色化 + 系统菜单（文件/打开/导入/导出） | 壳功能 |
| 27 | Workspace 导入导出 | 壳功能 |
| 28 | 产品图标主题（Product Icon Theme） | 新贡献类型 |

---

## 二、Phase 6 隐藏任务——你可能没想到的

### 2.1 退路系统——主题和语言的默认值从哪来（照抄 VS Code）

**先看 VS Code 怎么做。**

**主题退路——三层：**

VS Code 源码 `workbenchThemeService.ts`：
```typescript
// 硬编码的默认主题扩展 ID——如果用户的设置指向一个不存在的主题，fallback 到这里
const defaultThemeExtensionId = 'vscode-theme-defaults';

// 按 base UI theme 映射到具体主题 ID
case ThemeTypeSelector.VS_DARK:
    return `vs-dark ${defaultThemeExtensionId}-themes-dark_vs-json`;
case ThemeTypeSelector.VS:
    return `vs ${defaultThemeExtensionId}-themes-light_vs-json`;
```

`extensions/theme-defaults/package.json`：
```json
{
  "name": "theme-defaults",
  "publisher": "vscode",
  "contributes": {
    "themes": [
      { "id": "Dark+",         "uiTheme": "vs-dark",  "path": "./themes/dark_plus.json" },
      { "id": "Light+",        "uiTheme": "vs",       "path": "./themes/light_plus.json" },
      { "id": "Dark Modern",   "uiTheme": "vs-dark",  "path": "./themes/dark_modern.json" },
      { "id": "Light Modern",  "uiTheme": "vs",       "path": "./themes/light_modern.json" },
      // ... 共 10 个内置主题
    ]
  }
}
```

`colorThemeData.ts` 有最后的硬兜底——如果连 theme-defaults 扩展都加载失败：
```typescript
const defaultThemeColors: { [baseTheme: string]: ITextMateThemingRule[] } = {
    'light': [
        { scope: 'token.info-token',  settings: { foreground: '#316bcd' } },
        { scope: 'token.warn-token',  settings: { foreground: '#cd9731' } },
        // ...
    ],
    'dark': [ /* ... */ ]
};
```

**VS Code 的三层退路：**
```
第 1 层：用户设置的 theme（settings.json 的 "workbench.colorTheme"）
第 2 层：theme-defaults 扩展的内置主题（Dark+ / Light+ 等 10 个）
第 3 层：defaultThemeColors 硬编码颜色值（代码里的 fallback 对象）
```

**语言退路——两层：**

VS Code 源码 `nls.ts`：
```typescript
// localize() 的第二个参数 message 就是英文 fallback
// 如果 NLS 翻译表里没有对应 key → 返回 message 原文
export function localize(key: string, message: string, ...args): string {
    // ...
}

function lookupMessage(index: number, fallback: string | null): string {
    const message = getNLSMessages()?.[index];
    if (typeof message !== 'string') {
        if (typeof fallback === 'string') {
            return fallback;  // ← 英文原文作为 fallback
        }
        throw new Error(`!!! NLS MISSING: ${index} !!!`);
    }
    return message;
}
```

**VS Code 的两层退路：**
```
第 1 层：语言包扩展提供的 NLS 翻译表
第 2 层：源码中 localize() 的第二个参数（英文原文）——语言包卸载了就显示这个
```

**我们的对应实现（直接照抄这个模式）：**

**主题三层退路：**

| 层 | VS Code | LinkDesk |
|------|------|------|
| 第 1 层 | `settings.json` → `workbench.colorTheme` | `settings.json` → `app.theme` |
| 第 2 层 | `theme-defaults` 扩展（10 个内置主题，可卸载）| `plugins/theme-dark/` + `plugins/theme-light/`（出厂预装，可卸载） |
| 第 3 层 | `defaultThemeColors` 硬编码对象 | `index.css` `:root` 的 21 个 CSS 变量值 |

```
#2 对应 VS Code 的 theme-defaults 扩展：
  plugins/theme-dark/plugin.json → { "contributes": { "themes": [{ "id": "dark", "uiTheme": "dark", "path": "dark.json" }] } }
  plugins/theme-light/plugin.json → 同上 light
  生命周期：出厂预装，可卸载。卸载后回退到第 3 层。

#3 对应 VS Code 的 defaultThemeColors：
  index.css :root { --bg: #1e1e1e; --fg: #cccccc; ... }
  永远存在。不依赖任何插件或 JSON 文件。
```

**语言两层退路：**

| 层 | VS Code | LinkDesk |
|------|------|------|
| 第 1 层 | 语言包扩展的 NLS 翻译表 | `plugins/lang-en/` + `plugins/lang-zh/` 语言插件 |
| 第 2 层 | `localize(key, message)` 的 `message` 参数 = 英文原文 | `t(key)` → 如果 key 不在翻译表里 → 返回 key 本身（key = 中文原文）|

```
#2 对应 VS Code 的 localize() fallback：
  i18next.init({
    fallbackLng: false,  // 不用 i18next 的 fallback 链——自己做
    parseMissingKeyHandler: (key) => key  // t("终端") → "终端"（key 本身就是中文原文）
  })

  外加 30 个壳级关键 key 的显式英文兜底（对标 VS Code 的 _defaultMessages）：
  resources: { en: { translation: { "终端": "Terminal", "设置": "Settings", ... } } }

  VS Code 的做法：localize('sayHello', 'Hello {0}', name) → 'Hello' 就是 fallback
  我们的做法：t('终端') → zh.json 有 → '终端'，zh.json 没有 → 返回 key '终端'
  差异只是：VS Code 用英文原文做 key，我们用中文原文做 key。fallback 机制完全相同。
```

---

### 2.2 文件关联系统

**问题：** 文件树双击 `demo.md` → 系统不知道用什么插件打开。

Phase 5 没有"哪种文件由哪个插件打开"的注册机制。命令系统能注册"我能干什么"，但不能声明"我对什么文件感兴趣"。

**怎么办：** `plugin.json` 新增 `contributes.fileAssociations`。

```json
{
  "contributes": {
    "fileAssociations": [
      { "extension": ".md", "command": "docReader.open", "label": "Markdown 阅读器" },
      { "extension": ".dxf", "command": "cad.openFile", "label": "CAD 查看器" }
    ]
  }
}
```

```typescript
// FileAssociationService（~60 行）
class FileAssociationService {
  private extToCommands = new Map<string, { pluginId: string; command: string }[]>()

  register(pluginId: string, associations: FileAssociation[]): void
  getCommandFor(extension: string): { pluginId: string; command: string } | undefined
  getPluginsFor(extension: string): { pluginId: string; command: string; label: string }[]
  getAllExtensions(): string[]
}

// 文件树双击/右键"打开"：
const match = FileAssociationService.getCommandFor(".md")
if (match) CommandRegistry.execute(match.command, { filePath })

// 文件树右键"打开方式…"子菜单：
const plugins = FileAssociationService.getPluginsFor(".md")
// → 动态生成子菜单，每项对应一个插件的命令
```

---

### 2.3 文件系统访问抽象

**问题：** 文件树是第一个需要访问文件系统的系统级视图。如果它直接 `invoke("list_dir")` 裸调 Tauri 命令，未来 CAD（读 DXF）、代码编辑器（读/写源文件）、PDF 查看器（读 PDF）——每个都要自己处理路径/权限/错误。和 Phase 4 的"每个组件自己调 PreferenceService"是同一种扩散。

**怎么办：** Phase 6 建 `FileService`——薄封装 Tauri fs 命令。

```typescript
// FileService（~80 行）
class FileService {
  async listDir(path: string): Promise<FileEntry[]>
  async readFile(path: string): Promise<string>
  async readBinaryFile(path: string): Promise<Uint8Array>
  async writeFile(path: string, content: string): Promise<void>
  async watch(path: string): Promise<Disposable>  // → CoreEvents.onDidChangeFileSystem
}

// Rust 端新增 Tauri 命令：
// list_dir(path) → FileEntry[]
// read_file(path) → string
// write_file(path, content)
// watch_dir(path) → stream of FileChangeEvent
```

已有基础：Phase 4 的 `PreferenceService` 已经用了 Tauri fs API（`readTextFile` / `writeTextFile`）。FileService 是把它泛化——从"只能读 prefs.json"变成"读任意路径"。

---

### 2.4 工作区文件夹概念

**问题：** 文件树以什么路径为根？整个 C 盘？

Phase 5 的 ConfigurationService 支持了 `.linkdesk/settings.json`（Workspace scope），但"工作区 = 一个文件夹"这个概念没有。文件树需要一个根路径，而这个根路径就是 workspace folder。

**怎么办：** Phase 6 建 `WorkspaceService`。

```typescript
// WorkspaceService（~80 行）
class WorkspaceService {
  private _folders: WorkspaceFolder[] = []

  get folders(): WorkspaceFolder[]       // 当前打开的工作区文件夹
  get rootPath(): string | undefined     // 第一个文件夹的路径 = 文件树根

  async openFolder(): Promise<void>      // Tauri dialog 选文件夹
  addFolder(path: string): void
  removeFolder(path: string): void

  onDidChangeFolders: Event<WorkspaceFolder[]>
}

interface WorkspaceFolder {
  uri: string        // 如 "/home/user/my-project"
  name: string       // 如 "my-project"
  index: number
}
```

**文件树消费：**
```
WorkspaceService.rootPath
  → FileService.listDir(rootPath)
    → 文件树渲染
      → CoreEvents.onDidChangeFileSystem 订阅 → 外部变动自动刷新
```

**和 Phase 5 ConfigurationService 的关联：**
```
WorkspaceService.rootPath = "/home/user/stm32-project"
  → .linkdesk/settings.json 存在于 "/home/user/stm32-project/.linkdesk/"
    → ConfigurationService.get("terminal.baudRate", Scope.Workspace)
      → 读取 workspace 级别的覆盖值
```

Phase 5 的 Workspace scope 读写接口已经就绪，Phase 6 只是把"当前 workspace 文件夹是谁"这个上下文接上。

**用户怎么访问文件树——📁 图标栏图标：**

对标 VS Code Activity Bar 最上面的 📁 Explorer 图标。文件树注册为系统视图插件：

```
plugins/file-tree/plugin.json → { "name": "文件树", "icon": "folder", "iconSource": "codicon", "sidebar": "sidebar.tsx" }
  → viewRegistry 注册 → IconBar 出现 📁 图标
    → 单击 📁 → 侧栏显示文件树（对标 VS Code Explorer 侧栏）
    → 双击 📁 → 文件树变成独立标签页（两层容器的自然能力）
```

Phase 4 的基础设施（viewRegistry + IconBar 动态化 + SidePanel 切换）已经支持这个模式——和终端插件完全相同的注册路径。文件树不需要特殊通道。

---

### 2.5 主题贡献格式 + 旧格式兼容（照抄 VS Code）

**VS Code 源码——`themeExtensionPoints.ts`：**
```typescript
ExtensionsRegistry.registerExtensionPoint<IThemeExtensionPoint[]>({
    extensionPoint: 'themes',
    jsonSchema: {
        properties: {
            id: {     // "Id of the color theme as used in the user settings."
                type: 'string'
            },
            label: {  // "Label of the color theme as shown in the UI."
                type: 'string'
            },
            uiTheme: { // vs | vs-dark | hc-black | hc-light
                enum: ['vs', 'vs-dark', 'hc-black', 'hc-light']
            },
            path: {   // "Path of the tmTheme file, relative to the extension folder"
                type: 'string'
            }
        },
        required: ['path', 'uiTheme']
    }
});
```

**LinkDesk 对应格式（字段完全对标）：**
```json
{
  "name": "Dracula",
  "contributes": {
    "themes": [
      {
        "id": "dracula",
        "label": "Dracula",
        "uiTheme": "dark",
        "path": "dracula.json"
      }
    ]
  }
}
```

**和 VS Code 的差异（有意为之）：**
- VS Code `uiTheme` 的值：`vs` / `vs-dark` / `hc-black` / `hc-light`
- LinkDesk `uiTheme` 的值：`dark` / `light` / `highContrast`（简化，不对标 VS Code 的四个值——我们没有 textmate token 渲染，不需要区分 `vs` 和 `vs-dark` 的微妙差异）
- VS Code `path` 指向 `.tmTheme` 或 `.json`（TextMate 格式），LinkDesk 指向 CSS 变量 JSON
- VS Code `id` 用于 settings.json 的 `workbench.colorTheme`，LinkDesk `id` 用于 `settings.json` 的 `app.theme`

**兼容逻辑：**
```
loader 检测主题：
  有 contributes.themes → 新格式注册
  有旧 file 字段     → 升级为 contributes.themes 等价注册（id = pluginId, uiTheme = 从 JSON 推断, path = file）
  都没有             → 不注册

出厂主题 Dark/Light → 改为 contributes.themes 格式。可卸载。
卸载后 → VS Code 的 defaultThemeColors → 我们的 index.css :root。
```

---

### 2.6 语言贡献格式 + 旧格式兼容（照抄 VS Code）

**VS Code 做法：** 语言包是包含翻译数据的普通扩展。`localize()` 的英文 fallback 机制见 2.1。VS Code 没有专门的 `contributes.languages` 用于翻译——翻译走 NLS bundle 机制。

**LinkDesk 的做法（更简单——i18next 直接能用）：**
```json
{
  "name": "日本語",
  "contributes": {
    "languages": [
      {
        "id": "ja",
        "label": "日本語",
        "path": "ja.json"
      }
    ]
  }
}
```

和主题完全对称。兼容逻辑：`contributes.languages` 优先，`file` 旧字段兼容。出厂预装 en/zh，可卸载。卸载后 `t("终端")` → key 本身 "终端" 作为显示（i18next `parseMissingKeyHandler`）。

---

### 2.7 主题浏览器 UI

**为什么在 Phase 6：** 主题变成插件后，用户需要有地方浏览/搜索/预览/切换。不等 Phase 7——这是主题插件化的天然配套。

```
Ctrl+K Ctrl+T → 主题选择器弹出
  ├── 搜索框（模糊搜索所有已安装主题）
  ├── 主题列表（名称 + 色板预览色块）
  └── 键盘上下键选择 → Enter 确认 → 即时切换
```

对标 VS Code 的 `Preferences: Color Theme`。已有基础：Phase 2 的 CommandPalette 交互模式（模糊搜索 + 键盘导航）。

**非 UI 但有的事：** 有了 ContextKeyService（Phase 5），切主题时发射 `onDidChangeTheme` 事件。IconBar / 状态栏 / 欢迎页自动刷新——不需要手动通知。

---

### 2.8 输出面板 UI

**为什么在 Phase 6：** Phase 5 的盲区 10 建了 `LogChannel` 数据通道（`appendLine / show`），但查看器 UI 是 Phase 6。文件树 + 输出面板 = VS Code 底部面板的两大标配。

```
输出面板 UI：
  ├── 频道选择器（下拉框："终端" / "协议-SBQ" / "CAD" / "通用"）
  ├── 日志列表（等宽字体、按 source 着色、自动滚动）
  └── 清空 / 导出按钮
```

对标 VS Code 的 Output 面板。Phase 5 建了管道，Phase 6 建水龙头。

---

### 2.9 "打开文件夹"入口 + 欢迎页集成

**问题：** 用户打开软件 → 没有 workspace 文件夹 → 文件树显示什么？

**三种状态：**
```
状态 A：未打开文件夹
  → 文件树区域显示 "打开文件夹" 按钮 + 最近列表
  → 欢迎页的"最近"区域同步显示

状态 B：已打开文件夹
  → 文件树显示文件夹内容
  → 标题栏显示文件夹名（对标 VS Code 窗口标题）

状态 C：用户关闭文件夹
  → 回到状态 A
```

Phase 4 的欢迎页已有 `recentViews`（最近打开的标签页）。Phase 6 加 `recentFolders`（最近打开的文件夹）。

---

### 2.10 插件资源访问 API（getResourceUri）

**为什么在 Phase 6：** P2 优先级，~20 行。插件引用自己目录下的静态资源（图片、HTML），需要标准 API 而不是手拼路径。

```typescript
// plugin.json 里声明的资源：
{
  "contributes": {
    "resources": [
      { "path": "manual.html", "label": "用户手册" },
      { "path": "icon.png" }
    ]
  }
}

// 插件代码里读：
const url = ResourceService.getResourceUri(pluginId, "manual.html")
// → "asset://plugins/doc-reader/manual.html" 或等价 blob URL
```

---

### 2.11 齿轮菜单完善——从简化版到 context key 驱动

Phase 4 的齿轮菜单是简化版（硬编码的"启用/禁用/卸载"三个按钮）。Phase 5 建了 ContextKeyService + MenuService。Phase 6 可以做完整版：

```
插件市场 → 齿轮菜单：
  ├── 启用 / 禁用         → 已有
  ├── 卸载               → 已有
  ├── 配置 [插件名]...    → 跳到 Settings Editor 的对应分组
  ├── 查看日志            → 打开 Output 面板的对应频道
  └── 重新安装            → 已有

齿轮菜单内容 = MenuService.getMenuItems(MenuId.ExtensionGear, context)
  → 不是硬编码列表，是菜单注册表驱动
```

---

### 2.12 Profile 系统——插件集合的声明式管理

**来源：** Phase 4 设计文档 §8.5。Phase 4 已留好接口：

```typescript
// 当前 Phase 4：全量加载
pluginLoader.scanAll()

// 未来：按 Profile 过滤
pluginLoader.scanAll({ filter: profile.plugins })
```

**做什么：** 一个 `.linkdesk/profile.json` 文件定义"这个场景用哪些插件 + 什么设置 + 什么主题+ 哪个 workspace"。切换 Profile = 一键切换整个软件环境。

```json
// STM32.code-profile（对标 VS Code Profile）
{
  "name": "STM32 PID 调参",
  "icon": "chip",
  "plugins": ["terminal", "protocol-bracket", "card-gauge", "card-slider"],
  "settings": {
    "app.theme": "Dark",
    "terminal.baudRate": 115200
  },
  "workspace": "pid_tuning"
}
```

**切换 Profile 时自动：**
- 禁用不在列表中的插件 → 图标栏图标消失
- 启用列表中的插件 → 图标栏图标出现
- 应用 settings → 主题、语言、串口默认值全换
- 打开对应 workspace → 布局就位

**Phase 5 已有的原材料：**
- ConfigurationService + scope → Profile 的 settings 覆盖
- CommandRegistry → "切换 Profile…" 命令
- ContextKeyService → `"profile": "STM32"` 作为 context key，插件菜单可 `when: "profile == 'STM32'"`
- ProfileService 自建 `.linkdesk/profiles/` 存储（不是 PluginStateService——Profile 是全局快照，不属于单个插件）

**Phase 6 做：** ProfileService（~80 行）。`loadProfile(name)` → 批量 enablePlugins + disablePlugins + applySettings。交互：Ctrl+Shift+P → "切换 Profile…" → QuickPick 列出所有 profile。

### 2.13 activationEvents——按需激活（和 Profile 联动）

**这是 Profile 的另一半。** Profile 决定了哪些插件"属于这个场景"。activationEvents 决定了属于这个场景的插件"什么时候真正加载代码"。

**VS Code 对标：** `package.json` 的 `activationEvents` 字段。

**LinkDesk 设计：**

```json
{
  "name": "CAD 查看器",
  "activationEvents": [
    "onCommand:cad.importDxf",
    "onFileOpen:.dxf",
    "onFileOpen:.stl"
  ]
}
```

**结合 Profile 的完整流程：**

```
用户切换到 "STM32 PID" Profile
  → Profile 声明 plugins: [terminal, protocol-bracket, card-gauge, card-slider, cad]
  → 只有这 5 个插件参与加载

加载阶段：
  terminal → activationEvents 为空 → 启动时 import()
  protocol-bracket → 同上 → 启动时 import()
  card-gauge → 同上 → 启动时 import()
  card-slider → 同上 → 启动时 import()
  cad → activationEvents: ["onFileOpen:.dxf"] → 只注册 manifest，不 import()
       → 用户双击 .dxf → FileAssociationService 匹配到 cad → 首次 import() → 注册到 Registry
       → 之后每次打开 .dxf → 已加载，直接执行
```

**实现：**

```typescript
// loader 改动（~40 行）
async function scanAll(filter?: string[]) {
  const manifests = globPluginManifests()  // 轻量：只读 plugin.json，不 import 代码
  const filtered = filter ? manifests.filter(m => filter.includes(m.id)) : manifests

  for (const manifest of filtered) {
    registerManifest(manifest)  // 注册到各 Registry（空壳：知道有这个插件，还没代码）

    if (!manifest.activationEvents || manifest.activationEvents.length === 0) {
      await loadPlugin(manifest)  // 无激活事件 → 立即 import 代码
    }
    // 有激活事件 → 等着，触发时才 import
  }
}

// 触发激活
async function activateForEvent(event: string) {
  const plugins = getPluginsWithActivationEvent(event)
  for (const p of plugins) {
    if (!isLoaded(p.id)) await loadPlugin(p)
  }
}
```

**Phase 5 已有的原材料：**
- FileAssociationService（Phase 6 建）→ `onFileOpen:.dxf` 的触发源
- CommandRegistry → `onCommand:xxx` 的触发源——命令首次被调用时激活插件
- CoreEvents → `onDidChangePortState` 等可作为激活事件

### 2.14 系统文件拖入窗口打开

**场景：** 用户从桌面拖 `board.dxf` 到软件窗口 → FileAssociationService 匹配 → 打开 CAD 插件。

Tauri v2 的 `onDragDropEvent`（window 级）支持监听文件拖入。Phase 3 拖拽已验证 window 级事件可行。

```typescript
// App.tsx 或 MainContent（~50 行）
const { listen } = await import('@tauri-apps/api/event')
listen('tauri://drag-drop', (event) => {
  const files = event.payload.paths as string[]
  for (const path of files) {
    const ext = path.substring(path.lastIndexOf('.'))
    const match = FileAssociationService.getCommandFor(ext)
    if (match) {
      CommandRegistry.execute(match.command, { filePath: path })
    }
  }
})
```

### 2.15 Reopen Closed Tab（Ctrl+Shift+T）

**对标 VS Code：** `Ctrl+Shift+T` 撤销关闭标签页。

Phase 4 的 `reduceCloseTab` 从 tabs[] 删除时，先推到 `closedTabStack`（最近 10 个）。Phase 5 的 CommandRegistry + KeybindingRegistry 让这个命令可以直接注册为 `Ctrl+Shift+T`。

```typescript
// useTabManager reducer 改动（~30 行）
case 'closeTab':
  closedTabStack.push(action.tab)
  if (closedTabStack.length > 10) closedTabStack.shift()
  // ... 原有删除逻辑

case 'reopenClosedTab':
  const last = closedTabStack.pop()
  if (last) createTab(last)  // 恢复到原来的 group
```

### 2.16 插件依赖声明（extensionDependencies）

**对标 VS Code：** `package.json` 的 `extensionDependencies`。

```json
{
  "name": "CAD 查看器",
  "extensionDependencies": ["file-tree"]
}
```

loader 检查：file-tree 没安装/被禁用 → CAD 不加载 → toast "CAD 需要文件树插件"。~40 行。

---

**为什么 2.12-2.16 一起出现在 Phase 6：** 它们不是独立功能。Profile 决定谁的 activationEvents 参与游戏。activationEvents 触发插件加载。加载后依赖检查确保不崩。文件拖入触发文件关联，文件关联激活插件。Ctrl+Shift+T 恢复被用户误关的插件标签页。**这是一套"插件集合生命周期"的完整故事——Phase 5 的单插件生命周期（install/uninstall/enable/disable/deactivate）的上一层抽象。**

### 2.17 JSON 编辑器标签页——Monaco 直接编辑 settings.json

**来源：** Memory `json-editor-tabs.md`。原标 Phase 7，现在放到 Phase 6——Phase 5 建了 Settings Editor + ConfigurationService，Phase 6 加 Monaco 标签页直接编辑 JSON 文件。

**对标 VS Code：** `Preferences: Open Settings (JSON)` + `Preferences: Open Workspace Settings (JSON)`。

```
Ctrl+Shift+P → "打开设置 (JSON)" → 新标签页 → Monaco 编辑 settings.json
Ctrl+Shift+P → "打开工作区设置 (JSON)" → Monaco 编辑 .linkdesk/settings.json

编辑 → Ctrl+S 保存 → ConfigurationService 检测文件变动
  → emit onDidChangeConfiguration → 所有 useConfiguration() 组件刷新
```

**已有基础：** Phase 2 的终端发送栏已有 Monaco 单行编辑器。扩展到多行 JSON 编辑 = 换 `language: 'json'` + readonly: false。~80 行。

**不做的事：** JSON schema 提示、自动补全、错误波浪线（Phase 7）。

### 2.18 标题栏暗色化 + ☰ 汉堡菜单

**来源：** Memory `title-bar-menu.md`。原标 Phase 7，现在放到 Phase 6——文件树 + workspace 文件夹需要"打开文件夹"等可见菜单入口。

**对标 VS Code 浏览器版：** VS Code 桌面版有完整菜单栏，浏览器版用顶栏左侧的 ☰ 图标收起来。LinkDesk 对标浏览器版—— ☰ 汉堡菜单，不占一整行。

**Phase 6 只建四个菜单——核心无知原则：**

VS Code 的八个菜单（File / Edit / Selection / View / Go / Run / Terminal / Help）是 VS Code 自己的功能决定的。LinkDesk 的核心不知道未来有没有 Run/Debug、有没有代码编辑器的 Go to File。**开空菜单等着未来功能 = V2.6 模式。**

| VS Code 有 | LinkDesk Phase 6 | 为什么 |
|------|:--:|------|
| **Terminal** | ❌ | 终端是插件，不应该在核心菜单栏占据顶级位置 |
| **Run** | ❌ | 无调试/任务系统，Phase 8 才可能有固件烧录插件 |
| **Go** | ❌ | 代码编辑器的功能，Phase 7+ 代码编辑器插件自己贡献 |
| **Selection** | ❌ | 只有 Select All——放 Edit 里就够了，不需要独立菜单 |

```
┌──────────────────────────────────────────────────┐
│ ☰  COM3 ▼  115200 ▼  [● 打开]     中/EN  ☀  ⚙  │
├────┬──────────┬─────────────────────────────────┤
│    │          │                                  │
```

点 ☰ 弹出：

```
  File
    ├ Open Folder…          Ctrl+K Ctrl+O
    ├ Open Recent ▼
    ├ ─────────────
    ├ Import Workspace…
    ├ Export Workspace…
    ├ ─────────────
    ├ Exit                  Alt+F4

  Edit
    ├ Undo                  Ctrl+Z
    ├ Redo                  Ctrl+Y
    ├ ─────────────
    ├ Cut                   Ctrl+X
    ├ Copy                  Ctrl+C
    ├ Paste                 Ctrl+V
    ├ Select All            Ctrl+A

  View
    ├ Command Palette…      Ctrl+Shift+P
    ├ Toggle Sidebar        Ctrl+B
    ├ Settings…             Ctrl+,
    ├ ─────────────
    ├ Theme ▼
    │   ├ Dark
    │   ├ Light
    │   └ Browse Themes…

  Help
    ├ About
    ├ Open Log Folder
```

**以后能加新菜单吗？能。** ☰ 菜单和右键菜单走同一套 `MenuService`，不存在"写死"：

```typescript
// ☰ 只是一个多了一层分组的 ContextMenu 消费端
<HamburgerMenu />
  → MenuService.getMenuItems("menuBar")
    → 核心注册了 File / Edit / View / Help 四个组
      → Phase 7 终端插件贡献 submenu：
        { "submenus": [{ "id": "terminalMenu", "label": "终端" }],
          "menus": { "menuBar": ["terminalMenu"], "terminalMenu": ["terminal.new"] } }
        → ☰ 自动多出"终端"顶级菜单，一行代码不改
```

**关键：** ☰ 只是一个消费端，底层和 ContextMenu、齿轮菜单共享完全相同的 `MenuService.getMenuItems()`。右键加新项不需要改框架，菜单栏加新组也不需要。

**实现——消费 Phase 5 的 CommandRegistry + MenuService：**

```typescript
// 菜单结构声明（不是硬编码——每一项引用 CommandRegistry 里的命令）
const MENU_BAR = [
  {
    id: "File",
    items: [
      { command: "workbench.action.openFolder" },
      { command: "workbench.action.openRecent" },
      { separator: true },
      { command: "workbench.action.importWorkspace" },
      { command: "workbench.action.exportWorkspace" },
      { separator: true },
      { command: "workbench.action.exit" },
    ]
  },
  {
    id: "Edit",
    items: [
      { command: "editor.action.undo" },
      { command: "editor.action.redo" },
      { separator: true },
      { command: "editor.action.cut" },
      { command: "editor.action.copy" },
      { command: "editor.action.paste" },
    ]
  },
  { id: "View", items: [...] },
  { id: "Help", items: [...] },
]

// ☰ 组件渲染（~80 行）
// 每个 item → CommandRegistry.get(item.command)
//   → 拿 title → 显示菜单文字
//   → 拿 keybinding → 显示快捷键提示（Ctrl+K Ctrl+O）
//   → 点击 → CommandRegistry.execute(item.command)
```

**为什么是 Phase 6 而不是 Phase 5：** Phase 5 建好了 CommandRegistry + KeybindingRegistry，但菜单里的"打开文件夹""导入导出"等命令的 handler 依赖 Phase 6 的 WorkspaceService + FileService。Phase 5 只有命令注册表，没有这些命令的实际执行逻辑。

**标题栏暗色化：** Tauri v2 的 `tauri.conf.json` 支持窗口主题暗色 → Windows 11 标题栏变暗。独立于 ☰ 汉堡菜单。

**未来扩展（memory 预留）：** 设置中加 `"menuStyle": "hamburger" | "menubar"`。默认 `hamburger`，后期可实现 Tauri 原生菜单栏替代 ☰。两个模式共享同一份菜单结构声明，切换只改渲染方式。

### 2.19 Workspace 导入导出

**来源：** Memory `workspace-import-export.md`。原标"Phase 5 卡片架构完成后"，现在放到 Phase 6——有了 WorkspaceService + workspace 文件夹概念，导入导出就是文件操作。

**导入：** Tauri dialog 选 `.linkdesk-workspace` 文件（实际是 zip/JSON）→ 解压到 workspace 目录 → WorkspaceService.addFolder → 文件树刷新。

**导出：** WorkspaceService.activeFolder → 打包 `workspace.json` + `.linkdesk/settings.json` + 卡片数据 → 另存为。~50 行。

**为什么不是 Phase 5：** 需要 WorkspaceService 先建好（Phase 6 做），否则不知道"导出什么 workspace"。

---

## 三、Phase 5→6 新增需求的承接链

```
Phase 5 已经建好的                     Phase 6 新建或扩展
─────────────────────────           ─────────────────────
ConfigurationService + scope        WorkspaceService（文件夹管理）
                                     ↕ scope 的上下文来源
                                     ProfileService（settings 覆盖）

CoreEvents + EventEmitter            + onDidChangeFileSystem
                                     + onDidChangeWorkspaceFolders
                                     + onDidChangeProfile

CommandRegistry                      FileAssociationService
                                      ↕ 文件→命令的映射
                                     "workbench.action.reopenClosedTab"
                                     "workbench.action.switchProfile"

KeybindingRegistry                   Ctrl+Shift+T → reopenClosedTab
                                     拖入文件 → 开对应插件

MenuService + MenuId                 + MenuId.FileContext
                                     + "打开方式…"子菜单

ContextKeyService                    齿轮菜单完整版
                                     "activeWorkspace" / "fileTreeHasSelection"
                                     "profile" 等新 context key

LogChannel（Phase 5 盲区 10）        输出面板 UI（查看器）

ThemeEngine（Phase 3）               ThemeRegistry + ThemeBrowser UI
                                     出厂 Dark/Light → contributes.themes
                                     对标 VS Code theme-defaults 扩展

i18next（Phase 2）                   LanguageRegistry
                                     出厂 en/zh → contributes.languages
                                     对标 VS Code NLS bundle + localize() fallback

PluginStateService（Phase 5 盲区 4）  用不到——主题和语言不需要私有存储

loader + viewRegistry（Phase 4）      loader 升级：
                                      + parseContributions(themes/languages/fileAssociations/resources)
                                      + activationEvents 处理
                                      + extensionDependencies 检查
                                      + scanAll({ filter: profile.plugins })

PreferenceService（Phase 4）         ProfileService（插件集合 + 设置 + workspace 快照）
                                     对标 VS Code Profile
                                     ⚠️ 5f 后剩 2 个字段未迁：window（窗口位置）+ pluginsInstallPath
                                     全迁完后 PreferenceService 可整体删除

Monaco Editor（Phase 2 终端已有）     JSON 编辑器标签页
                                     Monaco 打开 settings.json / profile.json
                                     对标 VS Code "Open Settings (JSON)"

Tauri window API                   标题栏暗色化 + 系统菜单（文件/打开/导入/导出）
                                     对标 VS Code 标题栏 File 菜单
```

**关键：Phase 6 不新增 Registry 类型。** 全都是拿 Phase 5 的 Registry 模式、Phase 4 的 loader 模式、Phase 3 的引擎模式——套用到主题/语言/文件/Profile/激活事件/编辑器/标题栏这些新领域。框架零改动。

**关键：Phase 6 不新增 Registry 类型。** 全都是拿 Phase 5 的 Registry 模式、Phase 4 的 loader 模式、Phase 3 的引擎模式——套用到主题/语言/文件这三个新领域。框架零改动。

---

## 四、实施顺序

> 2026-07-21 更新：Phase 5h（运行时动态加载）插入 5g 和 5.5 之间。5h 是最后一个"改框架"的 Phase——之后 5.5 是桥，Phase 6 是纯消费者。
> 整体链路：5f（持久化归一化）→ 5g（类型系统去硬编码）→ 5h（运行时动态加载）→ 5.5（三栏交互对标）→ Phase 6（零框架改动）。
> Phase 6 本身分三层：6a（文件树基础闭环）→ 6b（编辑体验完整闭环）→ 6c（主题/语言引擎 + 壳完善）。

**第 -1 步：Phase 5h — 运行时动态加载（Phase 6 的前提—— ~400 行）**

5h 解决架构级根因：`import.meta.glob({ eager: true })` 是 Vite 构建时解析——新插件文件在磁盘上，但 JS bundle 不知道 → 必须刷新页面。替换为运行时动态加载后，插件安装/卸载/启用/禁用全部即时生效。

详见 [V3-Phase5-设计.md §9.2](./V3-Phase5-设计.md) — 5h 章。

```
  ├── 插件独立构建脚本（Vite library mode，~100 行）
  ├── Tauri 自定义 "plugin://" 协议（Rust ~50 行）
  ├── 运行时加载器——替换 import.meta.glob（~150 行）
  ├── 插件注册契约——window.__v3_registerPlugin()（~30 行接口）
  ├── 安装/卸载即时生效——不刷新页面
  └── React 单例保证——插件和核心共用 React 实例
```

**5h 依赖 5g：** 5g 把 TabType 从联合类型改为 `string`、硬编码判断改为 plugin.json 声明——5h 的 loader 才能完全声明驱动，不需要 switch 插件 ID。

**5.5 受益于 5h：** 新插件安装后 viewRole 声明立即被读取 → 图标点击行为自动正确（sidebarPrimary/tabPrimary/tabOnly）→ 不需要改 App.tsx。

**第 0 步：Phase 5.5 — 三栏交互对标 VS Code（~150 行）**

详见 [V3-Phase5.5-三栏交互对标.md](../phase5.5_交互对标/V3-Phase5.5-三栏交互对标.md)。

```
  ├── PluginManifest 加 viewRole 字段（types.ts +3 行）
  ├── viewRegistry 存 viewRole（+1 行）
  ├── App.tsx handleIconClick 改用 viewRole switch（~20 行）
  ├── 删 tabIdentity.ts 的 isSidebarOnlyView 硬编码（-5 行）
  ├── marketplace → "sidebarPrimary"
  ├── terminal → "tabPrimary"（行为不变）
  ├── settings → "tabOnly"
  └── workspace → "tabPrimary"
```

**然后 Phase 6——3 层递进。每层都先加新的，验证通过后再切旧的：**

```
第 1 层：6a — 文件树基础闭环
  ├── CoreEvents 加 onDidChangeFileSystem + onDidChangeWorkspaceFolders
  ├── FileService（封装 Tauri fs）+ Rust 端 list_dir / read_file / write_file / watch_dir 命令
  ├── FileAssociationService（后缀→命令反向索引）
  ├── WorkspaceService（单文件夹管理）
  ├── 文件树组件（系统视图，走 viewRegistry + WorkspaceService + FileService）
  ├── Monaco JSON 编辑器标签页（打开 settings.json）
  ├── 系统文件拖入窗口 → Tauri onDragDropEvent → FileAssociationService
  ├── Ctrl+Shift+T → Reopen Closed Tab
  └── 验证：打开文件夹 → 文件树渲染 → 双击文件 → 关联插件打开 ✅

第 2 层：6b — 编辑体验完整闭环
  ├── SearchService（Ctrl+Shift+F 跨文件内容搜索）
  ├── 文件树 Ctrl/Shift 多选 + 批量操作右键菜单
  ├── EncodingService（编码检测/切换）
  ├── 拖拽文件树节点到编辑区
  ├── Settings Editor JSON schema 自动补全（Monaco + ConfigurationRegistry 动态生成）
  ├── 多工作区文件夹（WorkspaceService.addFolder / removeFolder）
  ├── 文件图标主题（IconThemeRegistry + contributes.iconThemes）
  ├── 文件装饰器框架（FileDecorationProvider 接口 + DecorationRegistry）
  └── 验证：Ctrl+Shift+F 搜索 → 多选文件 → 拖拽打开 → 编码切换 ✅

第 3 层：6c — 主题/语言引擎 + Profile + 壳完善
  ├── 主题系统插件化（ThemeRegistry + contributes.themes + 出厂 Dark/Light 迁移 + 退路）
  ├── 语言系统插件化（LanguageRegistry + contributes.languages + 出厂 en/zh 迁移 + 退路）
  ├── 主题浏览器 UI（Ctrl+K Ctrl+T）
  ├── Profile 系统（ProfileService + loadProfile / switchProfile）
  ├── activationEvents + extensionDependencies（loader 升级）
  ├── 齿轮菜单完整版（context key 驱动）
  ├── 输出面板 UI（LogChannel 消费端）
  ├── 标题栏暗色化 + 系统菜单（文件/打开/导入/导出）+ ☰ 基础四组
  ├── Workspace 导入导出 + 欢迎页集成 + recentFolders
  ├── 插件资源访问 API（getResourceUri）+ ResourceService
  └── 验证：卸载全部主题 → 退路生效 → 切 Profile → 批量换插件+设置+主题 ✅
```

**验证路径：** 每一个 Step 都产出可运行的软件。先建暗线（Rust 命令 + Service 层），再接明线（UI 视图 + 交互入口），最后打通循环（Profile 切换 → 批量启用/禁用 → activationEvents 按需加载 → 文件关联 → 拖入 → 全部串起来）。

---

## 五、Phase 6 之后——6.5 抛光

Phase 6 建了文件世界的**基础闭环**。Phase 5 和 Phase 6 各自留了一批"不做"——不是不重要，是当时不属于最小闭环。Phase 6.5 把这些抛光项聚拢：19 项，拆 4 批（6.5a-6.5d），在 Phase 7 第一个消费者插件之前补齐。

详见 [V3-Phase6.5-抛光与补齐.md](../phase6.5_抛光/V3-Phase6.5-抛光与补齐.md)。

---

## 六、Phase 6 不做的东西

> 2026-07-21 修订：文件搜索/多选/编码/拖拽/JSON schema/多工作区/文件图标/装饰器/产品图标已回归 Phase 6b——这些是编辑能力的自然组成部分。

| 不做 | 理由 | 以后 |
|------|------|:--:|
| 卡片工作台 / 卡片渲染 | CardRegistry 骨架在 P5，渲染 P7 | 7 |
| OLED | 独立插件 | 8 |
| 文件装饰器——Git 状态实现 | `FileDecorationProvider` 接口在 6b 建，Git 集成 P7+ | 7+ |
| 文件搜索——替换（replace in files）| 6b 只做搜索，替换是独立的命令系统功能 | 7 |
| 文件编码——BOM 自动检测（UTF-16LE/BE）| 6b 做基础编码检测，BOM P7+ | 7 |
| 标题栏汉堡菜单 ☰ 完整版 | 6c 做基础四组；快捷键提示/插件顶级菜单 → 6.5c | 6.5 |
| V2 配置导入 | → 6.5c | 6.5 |
| 完整代码编辑器（Go to Definition / 重构 / IntelliSense） | 属于具体插件——不是基础设施 | 7+ |
