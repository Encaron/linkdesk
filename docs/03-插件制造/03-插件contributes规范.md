# 03 — 插件 contributes 规范

> 2026-07-24 · E5.8 全量重写 2026-08-21。**plugin.json `contributes` 字段——插件声明"我能做什么"。** 对标 VS Code `package.json` contributes。壳自动接线——不改任何核心代码。
> 真相源：`src/pluginLoader/contributions.ts`（parseContributions——壳侧 13 个消费点）+ `electron/plugins/plugin-manifest-loader.ts`（主进程 2 个消费点）+ `public/schemas/plugin.schema.json`（IDE 校验）。

---

## 一、核心原则

**插件声明 → 壳自动接线。** 你声明 `contributes.configuration`，Settings Editor 自动多一个分组。你声明 `contributes.commands`，Ctrl+Shift+P 自动多一项。

**不让壳知道你的插件是干什么的。** 壳只知道"有插件注册了这些命令/菜单/快捷键/配置项"，不知道"这是 CAD 插件还是地图插件"。

---

## 二、全部贡献点

> 消费端分两处：**壳侧**（`parseContributions`，插件代码跑的地方）与**主进程**（`plugin-manifest-loader`，启动扫盘 + 装卸重扫三表）。

### 壳侧消费（14 个）

| 贡献点 | 状态 | 说明 | 壳消费方 |
|------|:--:|------|------|
| `commands` | ✅ | 注册命令 → 命令面板/右键菜单/快捷键 | CommandRegistry |
| `menus` | ✅ | 注册菜单项 → 右键菜单/齿轮菜单/菜单栏 | MenuRegistry |
| `keybindings` | ✅ | 注册快捷键 | KeybindingRegistry |
| `configuration` | ✅ | 注册设置项 → Settings Editor 自动渲染 | ConfigurationRegistry |
| `configurationDefaults` | ✅ | 弱默认值——用户手动设置优先 | ConfigurationRegistry |
| `themes` | ✅ | 注册主题 → 主题浏览器/外观 | ThemeRegistry（数据异步加载） |
| `iconThemes` | ✅ | 注册图标主题 → 用户切换图标集 | IconRegistry |
| `icons` | ✅ | 共享图标——插件 A 贡献、插件 B 引用 | IconRegistry |
| `languages` | ✅ | 注册 UI 语言包 | LanguageRegistry（数据异步加载） |
| `titleBar` | ✅ | 顶栏左右槽位按钮 | MenuRegistry |
| `viewsContainers` | ✅ | 声明侧栏/面板容器 | ViewContainerService |
| `views` | ✅ | 往容器注册视图——任何插件可往任意容器注册 | ViewContainerService |
| `floatingPanel` | ✅ | 声明某视图可在壳内悬浮面板显示（E5.8#39.5 类型 B）——viewId 引用已注册视图；未声明则无「在悬浮面板中打开」右键（I8-3） | 声明寻址 → FloatingPanelService |
| `i18n` | ✅ | 插件自带翻译文件 | i18nResources（i18next 命名空间） |

### 主进程消费（2 个）

| 贡献点 | 状态 | 说明 | 消费方 |
|------|:--:|------|------|
| `langDefs` | ✅ | **编程语言声明**（ID/扩展名/语法高亮/LSP）——主进程唯一写入方 | 主进程 LangDefRegistry（E5.7#49 壳侧注册已删） |
| `fileAssociations` | ✅ | 文件扩展名 → 插件路由 | 主进程 FileAssociationService（E5.7#50 壳侧注册已删） |

### 顶层字段（不是 contributes，但常被误认）

| 字段 | 说明 |
|------|------|
| `statusBar` | **状态栏条目——顶层字段**，不是 contributes.statusBar（对标 VS Code `contributes.views` 之外的状态栏扩展点） |
| `tabBehavior` | 标签页行为（singleton/isFallback/confirmOnClose/identityField）——见 `02 §六` |
| `appearsIn` | 插件 UI 出现位置（iconBar/sidePanel/tabBar/statusBar）——替代旧 iconLocation/viewRole |
| `requires` | 插件级激活顺序依赖（string 数组）——见 `02 §四` |
| `factoryRole` | 系统插槽（settings=设置页 / marketplace=插件市场）——**填 = 形态二（替换/进槽位切换）；不填 = 形态一（普通视图插件并存）**，详见 `06 §factoryRole 字段详解`。**E5.8 方案A 已落地（#41.11-#41.18）**：同角色多插件合法并存（一对多），默认 core:true 优先，设置页角色分组 + 切换按钮 + 图标激活套占槽，活动套持久化重启保持 |
| `pluginRole` | 加载策略（view/data）——不填自动推导，见 `02 §二.1` |

### ❌ 不存在 / 已删的假点

| 贡献点 | 现状 |
|------|------|
| `cards` | **已删**——CardRegistry 随 E5.7#45.7 整删，卡片工作台是插件（硬约束 #3）。**写了不生效** |
| `protocols` | **假点**——`contributes.protocols` 无消费方。协议解析走 `serial.onData` 数据管道 + `ProtocolParser`（白名单工具），不是 contributes 声明 |
| `aiFunctions` | 从未实现 |

---

## 三、各贡献点详述

### 3.1 `contributes.commands`——命令

```json
{
  "contributes": {
    "commands": [
      {
        "id": "cad.importDxf",
        "title": "导入 DXF…",
        "category": "CAD",
        "when": "activeEditor == 'cad'"
      }
    ]
  }
}
```

| 字段 | 必需 | 说明 |
|------|:--:|------|
| `id` | ✅ | 命令 ID。命名：`<pluginId>.<action>`，如 `terminal.copy` |
| `title` | ✅ | 显示名称（i18n key——中文原文） |
| `category` | ❌ | 命令面板分组——"CAD" / "终端" / "文件" |
| `when` | ❌ | context key when 条件。不加 `when` = 任何上下文可见 |

**声明即注册元数据（placeholder）：** `contributes.commands` 只注册命令元数据（id/title/category/when），**真实 handler 在池侧注册**（E5.7 Bug C——池侧 `_poolCommands` 优先）。不注册 handler 的命令被调用 → no-op（诊断 warn）。

```typescript
// 池侧注册真实 handler（组件 mount 时）
useEffect(() => {
  window.linkdesk.commands.registerCommand("cad.importDxf", async () => {
    const paths = await window.linkdesk.dialog.openFile({ filters: [{ name: "DXF 文件", extensions: ["dxf"] }] });
    // ...
  });
}, []);
```

### 3.2 `contributes.menus`——菜单项

```json
{
  "contributes": {
    "menus": {
      "editorContext": [
        "cad.importDxf",
        { "command": "cad.exportPdf", "when": "activeEditor == 'cad'", "group": "edit" }
      ],
      "tabContext": [
        { "command": "cad.closeAll", "when": "activeEditor == 'cad'" }
      ]
    }
  }
}
```

**MenuId 是开放 string（`MenuRegistry` `type MenuId = string`）——插件声明任意字符串即契约，无需壳加代码。** 壳内置注册点（MENU_SLOTS 常量表，14 槽）：

| MenuId | 场景 |
|------|------|
| `commandPalette` | Ctrl+Shift+P 命令面板 |
| `tabContext` | 标签栏标签右键 |
| `panelViewContext` | 面板标签栏右键（位置/对齐子菜单 + 视图显隐列表） |
| `editorContext` | 标签页主内容区右键 |
| `extensionGear` | 底部齿轮菜单（设置/命令面板/主题选择器） |
| `marketplaceItemGear` | 插件市场条目齿轮（启用/禁用/卸载） |
| `menuBar` | ☰ 汉堡菜单栏 |
| `panel` | 菜单栏「面板」组归并（E5.8#148 壳招牌已删——插件 `group:"panel"` 项仍归并入菜单栏独立成组） |
| `fileContext` | 文件树右键 |
| `cardContext` | 卡片右键 |
| `quickSendContext` | 快捷发送药丸右键 |
| `iconBar` | 图标栏右键 |
| `settingItemGear` | 设置项齿轮（Settings Editor 行 hover） |
| `viewTitleContext` | 侧栏视图 title 右键（折叠/重置位置/视图同组） |

**菜单项字段：**

| 字段 | 必需 | 说明 |
|------|:--:|------|
| `command` | ✅ | 命令 ID——有 `children` 时可为空字符串（父菜单项不执行命令，展开子菜单） |
| `label` | ❌ | 显示标签——有值时覆盖命令标题 `getCommand(id).title`；父菜单项（无 `command`）必填 |
| `group` | ❌ | 分组——同组内聚在一起，组间有分隔线。如 `"navigation"` / `"edit"` / `"delete"` |
| `when` | ❌ | context key when 条件 |
| `order` | ❌ | 排序权重——同组内越小越靠前 |
| `children` | ❌ | 嵌套子菜单——**任意深度递归**（E5.8#148/#149，对标 VS Code `SubmenuAction`）；子项同构（`children` 内可再嵌 `children`） |

**简写：** 只填命令 ID 的字符串 = `{ "command": "<id>" }`

**嵌套子菜单示例（任意深度）：**
```json
{
  "contributes": {
    "menus": {
      "menuBar": [
        { "command": "", "label": "查看", "group": "view", "children": [
          { "command": "cad.importDxf", "group": "view" },
          { "command": "", "label": "界面", "group": "view", "children": [
            { "command": "cad.togglePanel", "label": "面板", "group": "view" }
          ] }
        ] }
      ]
    }
  }
}
```

### 3.3 `contributes.keybindings`——快捷键

```json
{
  "contributes": {
    "keybindings": [
      { "command": "cad.importDxf", "key": "ctrl+shift+i", "when": "activeEditor == 'cad'" },
      { "command": "cad.exportPdf",  "key": "ctrl+shift+e", "when": "activeEditor == 'cad'" }
    ]
  }
}
```

| 字段 | 必需 | 说明 |
|------|:--:|------|
| `command` | ✅ | 命令 ID |
| `key` | ✅ | 键序列——`"ctrl+k"` / `"ctrl+shift+p"` / `"ctrl+k ctrl+o"`（Chord） |
| `when` | ❌ | context key when 条件 |

**⚠️ 轨道选择（`05 §4`）：** 只把**非文本键**写进 `contributes.keybindings`。`ctrl+c` / `ctrl+v` / `f2` 等文本编辑键写这里 = 主进程 `before-input-event` 无条件吞全池输入框。文本键/焦点绑定键正解 = 池侧容器 `onKeyDown`（DOM 焦点天然分区）。

### 3.4 `contributes.configuration`——设置项

```json
{
  "contributes": {
    "configuration": {
      "title": "CAD 查看器",
      "properties": {
        "cad.gridSize": {
          "type": "number",
          "default": 10,
          "description": "网格大小 (mm)"
        },
        "cad.units": {
          "type": "string",
          "default": "mm",
          "enum": ["mm", "cm", "inch"],
          "enumDescriptions": ["毫米", "厘米", "英寸"],
          "description": "单位"
        },
        "cad.autoSave": {
          "type": "boolean",
          "default": true,
          "description": "自动保存"
        },
        "cad.showGrid": {
          "type": "object",
          "default": { "enabled": true, "color": "#555" },
          "description": "网格外观（对象）"
        },
        "cad.exportFormats": {
          "type": "array",
          "default": ["dxf", "stl"],
          "description": "可导出的格式列表"
        }
      }
    }
  }
}
```

**支持的类型（schema 全量）：** `"string"` | `"number"` | `"boolean"` | `"object"` | `"array"`

> **注意：** 没有 `"integer"`——用 `"number"`。`minimum`/`maximum` 运行时类型支持，但 schema 暂未声明（IDE 会提示）——高级用法可写，加载不校验。

**字段：**

| 字段 | 必需 | 说明 |
|------|:--:|------|
| `type` | ✅ | string/number/boolean/object/array |
| `default` | ✅ | 默认值 |
| `description` | ✅ | 说明——Settings Editor 渲染为提示 |
| `enum` | ❌ | 下拉选项（string 类型时可选） |
| `enumDescriptions` | ❌ | 选项说明——和 enum 一一对应 |
| `uiHint` | ❌ | 渲染提示——SettingsView 按 hint 选择控件（已知值 `"color"`/`"fontFamily"`/`"fontSize"`/`"file"`/`"directory"`/`"slider"`/`"segmented"`/`"image"` 等，开放 string——未知 hint 降级回 type 默认渲染）。`"segmented"` = 分段单选（ghost 双轨制，配合 `enum` + `enumDescriptions` 声明，短标签 = enumDescription `—` 前段、tooltip = 全句） |

**安装后效果：** Settings Editor 左侧导航树自动出现 "CAD 查看器" 分组 → 右侧自动渲染表单——不需要手写设置界面。

**Key 命名规则：** `<pluginId>.<property>`，如 `cad.gridSize`、`terminal.baudRate`

**插件读设置（插件通信铁律——只走 `window.linkdesk.configuration`）：**
```typescript
const gridSize = await window.linkdesk.configuration.get<number>("cad.gridSize");
// 或订阅变化
useEffect(() => {
  return window.linkdesk.configuration.onChange<number>("cad.gridSize", (val) => {
    // 用户在 Settings Editor 改值 → 自动通知
  });
}, []);
```

### 3.5 `contributes.configurationDefaults`——弱默认值

```json
{
  "contributes": {
    "configurationDefaults": {
      "terminal.baudRate": 115200,
      "terminal.encoding": "utf-8"
    }
  }
}
```

和 `configuration` 的区别：`configuration` 定义了**自己的**设置项。`configurationDefaults` 给**别人的**设置项提供建议值。用户手动设置优先——弱默认只在用户从未设置过该 key 时生效。

### 3.6 `contributes.themes`——主题

```json
{
  "contributes": {
    "themes": [
      { "id": "my-theme-dark", "label": "My Theme Dark", "uiTheme": "dark", "path": "themes/my-dark.json" }
    ]
  }
}
```

| 字段 | 必需 | 说明 |
|------|:--:|------|
| `id` | ✅ | 主题 ID |
| `label` | ✅ | 显示名称 |
| `uiTheme` | ✅ | `"dark"` \| `"light"` \| `"highContrast"` |
| `path` | ✅ | 主题定义 JSON 文件路径（含 `colors` 映射）——**相对插件目录** |

声明是 metadata-only；主题颜色数据在加载时异步 fetch。旧格式顶层 `themes` 字段自动归一化（见 `02 §二.1`）。

### 3.7 `contributes.iconThemes`——图标主题

```json
{
  "contributes": {
    "iconThemes": [
      { "id": "my-icons", "label": "My Icons", "path": "icons/icon-theme.json" }
    ]
  }
}
```

对标 VS Code `productIconThemes`。字段同 themes（id/label/path）。**mappings JSON 双形态（E5.8#133 ④ 拍板）**——每条目二选一：

```json
{
  "files": {
    "readme.md": { "class": "codicon codicon-markdown" },
    "main.rs":  { "class": "myfont myfont-rust", "color": "#dea584" },
    "logo.svg": { "imagePath": "icons/logo.svg" }
  },
  "extensions": { ".ts": { "class": "codicon codicon-typescript" } },
  "folders":   { "src": { "class": "codicon codicon-folder" } },
  "foldersExpanded": { "src": { "class": "codicon codicon-folder-opened" } }
}
```

| 形态 | 字段 | 渲染 | 说明 |
|------|------|------|------|
| **字体 glyph** | `class`（必）+ `color?`（可选） | `<span>` | 单色/带色字体 glyph（seti/material 即此类，每图标一色）；自定义字体走 `@font-face`（见下方 `font` 段） |
| **图像资产** | `imagePath` | `<img>` | 任意多色（拟物化/贴图）；相对路径 → 壳加载时解析为 `linkdesk://{pluginId}/{path}` 绝对 URL（消费方零解析负担） |

同一主题可混用两形态。**选择器 = 设置 `app.iconTheme`**（壳声明，默认 `"default"` = 内置 codicon 保底，零图标主题插件也成立；枚举 = 已登记图标主题 + default，装/卸动态刷新）。切换经事件 `iconTheme:changed` 广播（载荷 + 契约见 `01-插件API契约.md` §3.2 壳广播事件表）——**需要自定义文件图标视觉的插件手动订阅应用**。

**可选顶层 `font` 段（E5.8#133.4 自定义图标字体）**——`class` 引用自定义字体 glyph 时声明；壳生成 @font-face 广播进池 + 注入 glyph 类 CSS，作者零 @font-face 负担：

```json
{
  "font": {
    "path": "icons/fonts/my-icons.woff2",
    "family": "my-icons",
    "glyphs": "icons/my-icons.css"
  },
  "files": { "main.rs": { "class": "my-icons my-icons-rust", "color": "#dea584" } }
}
```

| `font` 字段 | 类型 | 说明 |
|------|------|------|
| `path` | string（必） | 字体资产相对路径（或绝对 URL）——壳解析 `linkdesk://` + 生成 `@font-face` |
| `family` | string（必） | 字体族名——glyph CSS 里 `font-family` 写它 |
| `glyphs` | string（选） | glyph 类 CSS 文件相对路径（`@font-face` **不要**写在里面——壳已生成；只写 `.my-icons-x::before{content:"…"}`） |

无 `font` 段 → 零自定义字体（codicon 保底 / 纯图像资产主题）。字体注入对消费方透明（preload 机械层处理），无需手动订阅。

### 3.8 `contributes.icons`——共享图标

```json
{
  "contributes": {
    "icons": {
      "stm32-chip": {
        "description": "STM32 芯片图标",
        "default": { "fontPath": "icons.woff", "fontCharacter": "\\e001" }
      }
    }
  }
}
```

插件 A 贡献、插件 B 引用（`"icon": "stm32-chip"` + `"iconSource": "shared"`）。

### 3.9 `contributes.languages`——UI 语言包 + `contributes.i18n`——插件自带翻译

**两条翻译管道，别混：**

| 管道 | 声明位置 | 作用 | 例子 |
|------|------|------|------|
| **UI 语言包** | `contributes.languages` | 换整个界面的语言（全局） | 中文/English/日本語 |
| **插件自带翻译** | `contributes.i18n` | 本插件文字的多语言翻译（按语言代码声明文件） | `{ "en": "i18n/en.json" }` |

```json
{
  "contributes": {
    "languages": [
      { "id": "zh", "label": "中文", "path": "lang/zh.json" },
      { "id": "en", "label": "English", "path": "lang/en.json" }
    ],
    "i18n": { "en": "i18n/en.json" }
  }
}
```

- `contributes.i18n` 的 key = 语言代码，value = JSON 翻译文件路径（key = 中文原文，value = 译文）。**不需要 zh.json**——中文 key 自带兜底。
- 翻译文件经 `fetchPluginDataFile` 加载（绕开 Vite glob 缓存——新装插件目录的 JSON 实时发现）。
- 插件文字铁律：**所有 UI 文字走 `t()`**，i18n key = 中文原文（`05 §6`）。

### 3.10 `contributes.titleBar`——顶栏按钮

```json
{
  "contributes": {
    "titleBar": {
      "right": [
        { "command": "myPlugin.openPanel", "icon": "codicon-graph-line", "when": "myContext" }
      ]
    }
  }
}
```

| 字段 | 必需 | 说明 |
|------|:--:|------|
| `command` | ✅ | 点击执行的命令 ID |
| `icon` | ❌ | codicon 图标名或图片路径 |
| `when` | ❌ | context key when 条件——不满足时按钮隐藏 |

槽位：`left`（标题栏左侧）/ `right`（右侧）。

### 3.11 `contributes.viewsContainers` + `contributes.views`——视图容器

> **完整 API 文档：`08-ViewContainer-视图容器API.md`**（含 titleActions 声明制、panel.reveal、运行时元数据更新）。这里只给字段总表。

**viewsContainers——声明侧栏/面板频道：**

```json
{
  "contributes": {
    "viewsContainers": {
      "explorer": {
        "title": "资源管理器",
        "location": "sidebar",
        "hideIfEmpty": false
      }
    }
  }
}
```

| 字段 | 必需 | 说明 |
|------|:--:|------|
| `title` | ✅ | 侧栏 header 显示的名称 |
| `location` | ❌ | `"sidebar"` \| `"panel"` \| `"auxiliarybar"`。默认 `"sidebar"`（sidebar=左/auxiliarybar=右/panel=底部面板标签栏） |
| `hideIfEmpty` | ❌ | 无活跃 view 时自动隐藏容器 |
| `order` | ❌ | 同位置排序。小值靠前 |
| `icon` | ❌ | 覆盖插件自身图标 |
| `mergeHeaderWhenSingle` | ❌ | 容器内只有一个 view 时隐藏 view header——标题合并到容器 header |

**views——往容器注册内容：**

```json
{
  "contributes": {
    "views": {
      "explorer": [
        { "id": "folders", "title": "", "render": "src/views/FoldersView.tsx", "order": 0 },
        { "id": "search", "title": "搜索", "render": "src/views/SearchView.tsx", "order": 1 }
      ]
    }
  }
}
```

| 字段 | 必需 | 说明 |
|------|:--:|------|
| `id` | ✅ | View 唯一 ID |
| `render` | ✅ | 组件模块路径——**相对插件目录** |
| `title` | ❌ | SidebarSection 折叠头标题。空字符串 = 不渲染折叠头 |
| `role` | ❌ | `"toolbar"` \| `"section"`——toolbar 粘顶不被 section 覆盖 |
| `order` | ❌ | 容器内排序。小值在上 |
| `collapsed` | ❌ | 初始折叠 |
| `when` | ❌ | context key 条件——满足时才显示 |
| `canToggleVisibility` | ❌ | ✅ 已实现——用户可在面板切换器/侧栏「视图」子菜单切换可见性 |
| `canMoveView` | ❌ | ✅ 已实现——用户可拖放此 view 到其他容器 |
| `hideByDefault` | ❌ | ✅ 已实现——默认隐藏，用户需手动开启 |
| `singleViewPaneContainerTitle` | ❌ | 单 view 且容器 `mergeHeaderWhenSingle` 时替代容器 title |
| `titleDescription` | ❌ | 标题旁的副文字——如 `(5 files)` |
| `showActions` | ❌ | `"always"` \| `"whenExpanded"` \| `"default"`——动作区显隐时机 |
| `titleTooltip` | ❌ | 标题 hover tooltip——标题截断时显示完整文字 |
| `minHeight` | ❌ | 拖拽 resize 最小高度（px）。默认 100 |
| `titleActions` | ❌ | **视图动作区声明制**——见下方小节 |

**关键特性：任何插件** 都能往别人的容器注册 view：
```json
// Git 插件——往 file-tree 的 explorer 容器注册 TIMELINE
{ "contributes": { "views": { "explorer": [{ "id": "timeline", ... }] } } }
```
文件树插件零改动。

#### titleActions——视图 header 右侧动作区（E5.8#36.5/36.6）

**对标 VS Code 视图 header 右侧的 `[+][🔄][⊟]` / 终端 `[+][▾]`。** 三 widget 形态：

| 类型 | 形态 | 点击行为 |
|------|------|------|
| `icon` | 单图标按钮 | 执行 `command` |
| `dropdown` | 纯下拉（chevron） | 展开 `items` 列表，点条目执行对应 `command` |
| `split` | 主按钮 + 下拉复合 | 主按钮执行 `command`（默认动作），右侧 chevron 展开 `items` |

**widget 字段：** `id`（唯一）、`command`（点击执行的命令 ID）、`args`（可选——`executeCommand(command, args)` 单个位置参数透传）、`icon`（codicon 类名）、`title`（tooltip/aria-label）、`items`（dropdown/split 备选条目 `{ label, command, args }`）。**label/title 为 i18n key（中文原文）**。

```json
{
  "id": "demo-output",
  "title": "输出",
  "render": "src/views/DemoOutputView.tsx",
  "order": 0,
  "titleActions": [
    {
      "type": "split",
      "id": "add-log",
      "command": "panel-demo.addLog",
      "icon": "codicon-add",
      "title": "添加演示日志",
      "args": { "level": "info" },
      "items": [
        { "label": "添加信息", "command": "panel-demo.addLog", "args": { "level": "info" } },
        { "label": "添加警告", "command": "panel-demo.addLog", "args": { "level": "warn" } }
      ]
    },
    { "type": "icon", "id": "clear-log", "command": "panel-demo.clearLog", "icon": "codicon-clear-all", "title": "清空输出" }
  ]
}
```

**命令注册（titleActions 的 command 执行真相源 = 池侧命令注册表）：**
```typescript
useEffect(() => {
  window.linkdesk.commands.registerCommand("panel-demo.addLog", (args) => { addLine(args.level, args.text); });
}, []);
```
> **`when: "false"` = 纯程序化命令不进命令面板**——titleActions 专属命令都这样声明，防止在 Ctrl+Shift+P 里刷屏。壳统一渲染器 `ViewTitleActions.tsx` 两处消费：面板标签栏（活动视图）+ 侧栏 section 折叠头。真实示例见 `08 §三`。

### 3.12 `contributes.langDefs`——编程语言声明（主进程）

> **E5.7#49：唯一写入方是主进程** `plugin-manifest-loader`（启动扫盘 + 装卸重扫）。壳侧 `parseContributions` 不消费。插件侧不用管加载——声明即可。

```json
{
  "contributes": {
    "langDefs": [
      {
        "id": "cpp",
        "extensions": [".cpp", ".cxx", ".h"],
        "aliases": ["C++", "C"],
        "monarch": { "tokenizer": { } },
        "lsp": { "command": "node_modules/pyright/dist/pyright-langserver.js --stdio", "args": [] }
      }
    ]
  }
}
```

| 字段 | 必需 | 说明 |
|------|:--:|------|
| `id` | ✅ | 语言 ID——如 cpp / python / rust |
| `extensions` | ✅ | 扩展名列表——如 `['.cpp', '.cxx', '.h']` |
| `aliases` | ❌ | 别名——如 `['C++', 'C']` |
| `monarch` | ❌ | Monarch tokenizer 定义（Monaco 内建语法高亮） |
| `lsp` | ❌ | LSP 语言服务器配置（command/args） |

### 3.13 `contributes.fileAssociations`——文件关联（主进程）

> **E5.7#50：唯一写入方是主进程**。扩展名指给壳——由插件自己处理打开。

```json
{
  "contributes": {
    "fileAssociations": [
      { "extension": "dxf", "command": "cad.openFile", "displayName": "DXF 图纸" },
      { "extension": "stl" },
      { "extension": "step" }
    ]
  }
}
```

| 字段 | 必需 | 说明 |
|------|:--:|------|
| `extension` | ✅ | 文件扩展名——**不含点**，如 dxf / stl / step |
| `command` | ❌ | 打开该扩展名文件时执行的命令 ID |
| `displayName` | ❌ | "打开方式…"选择器中的显示名 |

> **pluginId 不用声明**——主进程用目录名（与壳 loader 约定一致）。schema 已收录（E5.8#37.9.3.4 补录——此前 IDE 会报 additionalProperties）。

### 3.14 `statusBar`——状态栏条目（顶层字段）

```json
{
  "statusBar": [
    { "id": "units", "label": "mm", "align": "right" },
    { "id": "zoom", "label": "100%", "align": "right", "onClick": "cad.zoomFit" },
    { "id": "lock", "icon": "codicon-lock", "configurable": true }
  ]
}
```

| 字段 | 必需 | 说明 |
|------|:--:|------|
| `id` | ✅ | 唯一标识 |
| `label` | ❌ | 显示文字 |
| `icon` | ❌ | codicon 名称或 SVG 路径 |
| `align` | ❌ | `"left"` \| `"right"` |
| `onClick` | ❌ | 点击行为——命令名 |
| `configurable` | ❌ | 声明 `true` → 壳自动注册配置项 + 注入 visible prop。插件作者只写一行 JSON，零代码 |

**注意：** `statusBar` 是**顶层**字段，不是 `contributes.statusBar`。组件放 `statusBar.tsx` / `src/statusBar.tsx` / `src/components/statusBar.tsx`（运行时自动尝试三条路径）。

### 3.15 `contributes.floatingPanel`——悬浮面板声明（E5.8#39.5）

> **壳内悬浮面板（类型 B）**——插件声明某视图可在悬浮面板显示。壳以声明寻址解析视图（pluginId/renderPath/title），零硬编码插件 ID（硬约束 10/11 同款消费）。

```json
{
  "contributes": {
    "floatingPanel": { "viewId": "settings" }
  }
}
```

| 字段 | 必需 | 说明 |
|------|:--:|------|
| `viewId` | ✅ | **contributes.views 中已注册的视图 ID**——声明寻址解析出插件/renderPath/title |

**声明即消费，四件事自动出现：**

| 声明后效果 | 机制 |
|------|------|
| 标签页右键出现「在悬浮面板中打开」 | I8-3——未声明不出现（按声明过滤） |
| 打开后面板内三动作（在主窗口中打开 / 最大化 / 关闭） | I8-4/I8-9——「在主窗口中打开」落点 = 当前活动 group 尾部（复用文件树打开落点规则） |
| `linkdesk.panel.revealFloating(viewId)` 可编程弹面板 | I8-2 面板身份开关键——无面板→开；同视图→关；他面板→替换 |
| 卸载声明插件 → 右键条目消失 + revealFloating no-op 不崩 | 声明随插件生命周期卸载 |

**首批声明者 = settings**（`core.openSettings` Ctrl+, 弹面板）；**第二声明者验证载体 = `floating-panel-demo`** 测试插件（标签页型视图，端到端验证替换 + 右键回程 + 卸载 no-op）。

---

## 四、Context Key when 条件

菜单项和命令的 `when` 字段用 ContextKeyService 表达式：

| 运算符 | 示例 | 含义 |
|------|------|------|
| 裸 key | `portOpen` | key 值为 truthy → true |
| `!` | `!portOpen` | 取反 |
| `&&` | `activeEditor == 'cad' && portOpen` | 逻辑与 |
| `\|\|` | `activeEditor == 'a' \|\| activeEditor == 'b'` | 逻辑或 |
| `==` | `activeEditor == 'cad'` | 等于 |
| `!=` | `editorCount != 0` | 不等于 |
| `in` | `activeEditor in ['cad', 'terminal']` | 集合成员 |
| `()` | `!(portOpen \|\| editorCount > 1)` | 分组 |

**可用的 Context Key（壳写入）：**

| Key | 类型 | 写入者 |
|------|------|------|
| `activeEditor` | `string \| null` | 标签页切换时——当前聚焦标签页的 pluginId |
| `portOpen` | `boolean` | 串口开关时 |
| `portName` | `string \| null` | 串口开关时 |
| `editorCount` | `number` | 标签页增删时 |
| `editorHasSelection` | `boolean` | 编辑器有选中文本时（预留） |

---

## 五、完整 plugin.json 示例——CAD 插件（字段全对齐真实消费面）

```json
{
  "$schema": "plugin.schema.json",
  "name": "CAD 查看器",
  "version": "1.0.0",
  "icon": "PencilRuler",
  "iconSource": "lucide",
  "description": "DWG/DXF/STL 文件查看器",
  "author": "社区",
  "entry": "src/index.tsx",
  "appearsIn": { "iconBar": "top", "tabBar": true },
  "tabBehavior": {
    "singleton": true,
    "confirmOnClose": "未保存的修改将丢失"
  },
  "requires": ["file-tree"],
  "statusBar": [
    { "id": "units", "label": "mm", "align": "right" }
  ],
  "activationEvents": ["*"],
  "contributes": {
    "i18n": { "en": "i18n/en.json" },
    "commands": [
      { "id": "cad.importDxf", "title": "导入 DXF…", "category": "CAD" },
      { "id": "cad.zoomFit", "title": "适应窗口", "category": "CAD", "when": "activeEditor == 'cad'" }
    ],
    "menus": {
      "editorContext": [
        { "command": "cad.importDxf", "group": "navigation" },
        { "command": "cad.zoomFit", "group": "view" }
      ],
      "commandPalette": [
        { "command": "cad.importDxf" },
        { "command": "cad.zoomFit", "when": "activeEditor == 'cad'" }
      ]
    },
    "keybindings": [
      { "command": "cad.zoomFit", "key": "ctrl+0", "when": "activeEditor == 'cad'" }
    ],
    "configuration": {
      "title": "CAD 查看器",
      "properties": {
        "cad.gridSize": { "type": "number", "default": 10, "description": "网格大小" },
        "cad.units": { "type": "string", "default": "mm", "enum": ["mm", "cm", "inch"], "description": "单位" },
        "cad.autoSave": { "type": "boolean", "default": true, "description": "自动保存" }
      }
    },
    "viewsContainers": {
      "cad": { "title": "CAD 查看器", "location": "sidebar" }
    },
    "views": {
      "cad": [
        { "id": "layers", "title": "图层", "render": "src/views/LayersView.tsx", "order": 0 }
      ]
    },
    "fileAssociations": [
      { "extension": "dxf", "command": "cad.openFile", "displayName": "DXF 图纸" },
      { "extension": "dwg" },
      { "extension": "stl" }
    ]
  }
}
```

---

## 六、与 VS Code contributes 对照

| VS Code contributes | LinkDesk | 差异 |
|------|------|------|
| `commands` | ✅ | 同——元数据声明 + 池侧注册 handler |
| `menus` | ✅ | LinkDesk 多 `quickSendContext` / `cardContext` / `viewTitleContext` 等（MenuId 开放 string） |
| `keybindings` | ✅ | 同——但文本键走池侧 onKeyDown（`05 §4`） |
| `configuration` | ✅ | 同——类型含 object/array |
| `configurationDefaults` | ✅ | 同 |
| `themes` | ✅ | 同 |
| `productIconThemes` | ✅ `iconThemes` | 同 |
| `icons` | ✅ | 同（共享图标，iconSource:shared） |
| `languages`（编程语言） | ✅ `langDefs` | **主进程**消费——语法高亮/LSP |
| `languages`（翻译包） | ✅ `languages` | LinkDesk 的 `languages` = UI 语言包（i18n）；VS Code 用 l10n 体系 |
| `views` / `viewsContainers` | ✅ | 同 + LinkDesk 多 `titleActions` 声明制 + 显隐/迁移/panel.reveal |
| `titleBar` | ✅ | 顶栏左右按钮 |
| `viewsWelcome` | ⏳ | 欢迎内容——未来 |
| `fileAssociations` | ✅ | **主进程**——VS Code 由操作系统管理文件关联，LinkDesk 内置 |
| `extensionDependencies` | ✅ `requires` | string 数组（`02 §四`） |
| `activationEvents` | ✅ | 顶层字段（`02 §五`） |
| `snippets` / `problemMatchers` | ❌ 不在规划 | Monaco/LSP 插件自带 |
| `breakpoints` / `debuggers` | ❌ 不在规划 | 调试器——当前不需要 |

---

> **← 上一份：** `02-插件生命周期.md`
> **→ 下一份：** `04-插件分发格式.md`
> **→ 相关：** `08-ViewContainer-视图容器API.md`（views 完整语义）
> **→ 真相源：** `src/pluginLoader/contributions.ts` / `public/schemas/plugin.schema.json`
> **全部文档索引：** `00-README.md`
