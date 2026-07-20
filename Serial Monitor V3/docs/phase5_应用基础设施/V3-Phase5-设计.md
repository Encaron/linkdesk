# Phase 5 应用基础设施层

> 2026-07-20。Phase 4 做了"插件能被加载"。
> Phase 5 做"插件能做什么"——四根柱子 + context key/快捷键/scope 下半身 + 十一个盲区。
> 核心交付：插件加载后不只是"出现一个标签页"——能注册命令、贡献设置、添加菜单、解析协议、绑定快捷键、条件过滤（when）、User/Workspace 分层、接收数据、弹窗交互、日志诊断、跨插件通信。
> Phase 5 是最后一个"改框架代码"的 Phase——之后 Phase 6/7/8 全是插件声明 + 注册，零框架改动。

---

## 一、为什么 Phase 5 必须是基础设施

### 1.1 五个真实插件场景——哪些能做到、哪些不能

这是判断 Phase 4 是否完整的试金石。用五个覆盖全范围的插件场景来测：

**高德地图（view，纯软件，新标签页）✅**
```
plugin.json: { "entry": "index.tsx" } → loader 识别 → viewRegistry 注册
→ IconBar 出现图标 → 点击打开标签页 → React 渲染高德地图 SDK
→ 所有 JS 库都能 import，Leaflet / 高德 / Three.js 随便用
```
✅ 完全可行。不需要任何新东西。

**文档阅读器（view，需要右键"打开预览"）⚠️**
```
plugin.json: { "entry": "index.tsx" } → 基本视图 ✅
但是：用户在文件树右键 demo.md → 菜单出现 "文档阅读器：打开预览"
     → 点击 → 命令触发 → createTab("doc-reader", { filePath })
```
❌ 走不通。没有命令系统、没有右键菜单扩展点、也没有文件树。
基本渲染能做，但入口不存在。

**SBQ 协议解析（protocol，不直接对应标签页）⚠️**
```
plugin.json: { "mode": "text", "entry": "index.ts" }
  → loader 检测 mode → 识别为协议 → 打印日志 → 结束
                                         ↑
                              没有 ProtocolRegistry 消费
```
❌ 走不通。loader 现在认得它了（不再 `default → 跳过`），但没有注册表、没有下拉框、现有的方括号 ProtocolParser 是硬编码的。

**逻辑分析仪（datasource + protocol + card，USB 连接硬件）❌**
```
需要三个子系统联动：
  - type: "datasource" — USB 连接逻辑分析仪，注册数据源
  - mode: "binary" — 二进制帧解析，注册协议
  - card — 波形卡片组件，注册卡片
```
❌ 全走不通。三种贡献类型都能被 loader 识别，但三个 registry 全没有。

**CAD（view，复杂交互、文件导入导出、右键菜单）⚠️**
```
plugin.json: { "entry": "index.tsx" } → 视图 ✅
但是：
  - 右键 .dxf → "打开方式 → CAD"     → ❌ 无文件关联
  - 文件 → 导入 .dxf / 导出 .pdf     → ⚠️ Tauri dialog API 能做文件操作，
                                          但没有"导入/导出"命令入口
  - 属性面板 → 侧栏复杂 UI           → ✅ sidebar.tsx 能做
```
⚠️ 渲染能做。但每个交互入口都要硬编码，每个新入口都要改 CAD 插件和外层框架。

**共性结论：** 五个场景，只有一个（高德地图）真正能跑通。不是某个功能的缺失——是插件加载后，除了"变成一个标签页"，**没有任何与应用框架交互的能力**。

### 1.2 V2 的血泪教训：先建功能 → 后补框架 → 次次改

用户 V2 的经历（原话）：

> "V2.3 结束后就做好了设置系统，结果没几天冒出 V2.4 卡片系统的想法，设置页面全要重做；后面冒出 V2.5 OLED，又要多更新一个设置。"

**这不是一个功能 bug——是一种架构模式：**

```
V2.3：建设置页（硬编码的配置界面）
  ↓
V2.4：加卡片 → 改设置页（加卡片相关配置项）
  ↓
V2.5：加 OLED → 改设置页（加 OLED 相关配置项）

每次新增功能，设置页都要改。
因为设置页"知道"有哪些设置项。
```

**和 Phase 4 当前的问题是同一种病：**

```
Phase 3-4：终端设置硬编码在 PreferenceService.preferences 里
Phase 4：图标映射硬编码在 PLUGIN_ICON_PATH 里
Phase 4：状态栏渲染硬编码在 if (pluginId === "terminal") 里
Phase 4：type 分类硬编码在 switch(manifest.type) 里（后已修复）
```

新增功能 = 找到所有硬编码点 → 逐个加 case。这是 V2 模式。V3 必须避免。

### 1.3 为什么原计划"Phase 5 = 卡片架构"必须调整

原计划 Phase 5 直接做卡片工作台。但它有一个隐含前提：**插件系统的其余部分已经就绪，卡片只是"又一个视图插件"。**

实际状态：命令、菜单、配置、协议——四个基础系统全都没有。如果按原计划做卡片：

```
Phase 5：做卡片工作台
  → 卡片右键菜单？→ 硬编码
  → 卡片设置（网格大小、吸附等）？→ 塞进全局 Prefs（和 V2 一样）
  → 卡片注册命令（新建卡片、导出卡片）？→ 没地方注册
  → 协议插件的数据路由到卡片？→ 没有 ProtocolRegistry
  → 卡片组件（波形/仪表/开关）的注册？→ 没有 CardRegistry

Phase 6：突然需要做 OLED
  → 又要硬编码右键菜单？
  → 又要往全局 Prefs 塞 OLED 配置？

Phase 7：终于做设置系统
  → 这时卡片、OLED、终端的所有设置都已经以硬编码方式散落在 Prefs 和各个组件里
  → 拆 Prefs = 改卡片 + 改 OLED + 改终端
  → 和 V2.3→V2.5 完全一样的重演
```

**这就是 V2.6 模式——先建具体功能，后补基础设施，每次补都要回头改之前的功能。**

### 1.4 VS Code 走过的路——验证了这个顺序

```
VS Code 0.1-0.5：Editor (Monaco)  ← 一个编辑器而已
VS Code 0.5-0.9：Extension Host + contributes 框架
                  包括：commands, menus, keybindings, configuration, views
                  ↑ 所有 UI 扩展点在此建成——应用框架先于具体功能
VS Code 0.9-1.0：Extensions Marketplace
VS Code 1.0+：  具体功能（Debug、Terminal、SCM、Notebook...）
                  ↑ 这些全是扩展自己贡献的，不改框架一行代码
```

**关键启示：VS Code 在 1.0 之前就把 `contributes` 框架建好了。** 之后 Debug、Terminal、Source Control 全部是扩展自己贡献 commands + views + menus + configuration。不是"先做 Terminal 插件，以后再补配置系统"——是反过来的。

### 1.5 Phase 4 vs Phase 5 vs Phase 6/7/8 的分工

```
Phase 4：插件能被加载
  - loader 检测声明 → viewRegistry → IconBar + TabContent + SidePanel + StatusBar
  - 插件"存在"了——能安装、能卸载、能出现标签页
  - 但除了"出现一个标签页"什么都做不了

Phase 5：插件能做什么 + 系统基础闭环（当前阶段——最后一个改框架的 Phase）
  - 命令系统 → 插件注册命令 → 命令面板/右键菜单/快捷键 三条触发路径
  - 配置系统 → 插件贡献设置 → Settings Editor 自动渲染 + User/Workspace scope 分层
  - 菜单系统 → 插件声明菜单项 → 右键/齿轮 动态内容 + context key when 条件过滤
  - 协议系统 → 插件注册解析器 → 终端下拉框切换协议
  - context key 系统 → 全局状态机 → 命令/菜单的 when 条件引擎 + 键盘快捷键绑定
  - 插件"有用"了——框架代码扩展点封板，后续 Phase 只消费不扩展

Phase 6：系统视图 + 引擎插件化（纯消费者——不改框架）
  - 文件树 = 系统视图，注册 MenuId.FileContext 锚点
  - 主题系统插件化 → 主题成为一等公民插件类型
  - 语言系统插件化 → 语言包成为一等公民插件类型
  - 全部是 plugin.json 声明 + 注册到已有 Registry

Phase 7：卡片工作台 + 数据管道（纯插件——第一个在地基上写的功能）
  - CardRegistry 渲染 + react-grid-layout 工作台
  - ProtocolRegistry → DataDispatch → 卡片消费端数据管道打通
  - 全部是 plugin.json 声明 + 注册，零框架改动

Phase 8：OLED（独立插件）
  - 和卡片工作台同样的模式——plugin.json 声明 + 注册
```

**Phase 5 不是"做设置页面"——是建贡献点系统。** 设置页面只是 Configuration Registry 的一个消费端。命令面板只是 Command Registry 的一个消费端。右键菜单只是 Menu Registry 的一个消费端。所有消费端共享同一套贡献声明体系。

### 1.6 Phase 4 归一化的教训——为什么这次要一起规划

Phase 4 花了四个阶段做归一化（4.4 消硬编码 → 4.5 tabIdentity → 4.6 singleton+ID+语义 → 4.7 删 type+图标归一）。不是我们喜欢归一化——是被迫的。根源是 Phase 3 和 Phase 4 的脱节：

```
Phase 3：做标签页系统、图标栏、状态栏、侧栏
         当时没有插件概念，一切都用 tab.type 字符串硬编码
         ↓
Phase 4：嫁接插件系统
         → 图标 mapping 是 Phase 3 写死的（PLUGIN_ICON_PATH）
         → 状态栏渲染是 Phase 3 写死的（if pluginId === "terminal"）
         → 侧栏 fallback 是 Phase 3 写死的（import TerminalSidebar）
         → 标签名 switch 是 Phase 3 写死的（getDefaultLabel）
         → 预览/pin 逻辑是 Phase 3 写死的（tab.pinned 没有持久化）
         ↓
Phase 4.4-4.7：四轮归一化——修的是同一个问题：
         Phase 3 的假设和 Phase 4 的现实不一致
```

**VS Code 没有这个问题。** Activity Bar、Editor Tabs、Status Bar、Extensions 一开始就共享 `contributes` 这一套抽象。不存在"先做的图标栏不知道后面会有插件"——因为图标栏本身就是 `contributes.viewsContainers` 的消费者，它生来就吃注册表数据。

**Phase 5 必须避免重演。** 命令系统、配置系统、菜单系统、协议系统四个一起规划。它们共享同一份 `contributes` 声明、同一个 `plugin.json` 入口。不给 Phase 7 留"菜单系统是 Phase 5 做的，但卡片右键菜单当时没有考虑"这种债务。

```
Phase 5 四个系统一起设计
  → 共享 contributes 声明格式
  → 共享 Registry 注册模式
  → Phase 7 卡片直接"声明 + 注册"，零额外改动
  → Phase 8 OLED 同样
```

这也是为什么现在只留终端一个实体插件做验证——改动面极小，确认框架正确后 Phase 6/7 直接铺开。

---

## 二、Phase 5 四根柱子

### 柱子 1：命令系统 (Command Registry)

**对标：** `vscode.commands` + `package.json contributes.commands`

**解决什么问题：** 插件需要"可执行的操作"——文档阅读器的"打开预览"、CAD 的"导入 DXF"、终端的"清空接收区"。这些操作需要能被命令面板搜到、能被右键菜单引用、未来能被快捷键绑定。

**设计：**

```typescript
// 命令注册
interface Command {
  id: string;              // "docReader.openPreview"
  title: string;           // "打开预览"
  category?: string;       // "文档阅读器"（用于命令面板分组）
  handler: (token?: CancellationToken) => Promise<void>;  // 异步签名——Phase 5 从第一天就用 async
  when?: string;           // context key 条件（Phase 5 实现，见柱子 6）
}

// 全局注册表
CommandRegistry.register(pluginId, command)
CommandRegistry.execute(commandId, ...args)      // async——内部先触发 activationEvents 钩子再执行
CommandRegistry.getCommands()                    // → 命令面板用
CommandRegistry.onWillExecuteCommand             // Event<{ commandId, args }>——Phase 6 activationEvents 的钩子点
```

**消费端（哪些地方用命令）：**

| 消费端 | 说明 | Phase |
|--------|------|:--:|
| 命令面板 (Ctrl+Shift+P) | 列出所有命令 → 模糊搜索 → 执行 | 5 |
| 右键菜单 | 文件/标签页/卡片 → 出菜单 | 5 |
| 快捷键 | Ctrl+K → 触发命令 | 7 |
| 齿轮菜单 | 设置齿轮 → "配置 XXX" | 7 |

**Phase 5 做：** Registry + 命令面板消费端（复用现有的 CommandPalette 组件）
**Phase 5 做：** context key `when` 条件、快捷键绑定——见柱子 6（命令/菜单/配置的下半身）

### 柱子 2：配置系统 (Configuration Registry + Settings Editor)

**对标：** `vscode.workspace.getConfiguration()` + `package.json contributes.configuration` + Settings Editor

**解决什么问题：** V2 式设置系统——硬编码配置界面，新增功能要改设置页。VS Code 式——插件声明配置项 → Settings Editor 自动生成表单，不需要改 UI 代码。

**设计：**

```typescript
// 配置声明——插件在 plugin.json 里写
// terminal/plugin.json（示例）
{
  "name": "终端",
  "contributes": {
    "configuration": {
      "title": "终端",
      "properties": {
        "terminal.timestampFormat": {
          "type": "string",
          "default": "HH:mm:ss:fff",
          "enum": ["无", "HH:mm:ss", "HH:mm:ss:fff"],
          "description": "接收区时间戳格式"
        },
        "terminal.showEcho": {
          "type": "boolean",
          "default": true,
          "description": "显示已发送消息的回显"
        }
      }
    }
  }
}

// 核心自己也有配置——也用同样的格式（内置 core config）
{
  "configuration": {
    "title": "通用",
    "properties": {
      "app.theme": { "type": "string", "default": "Dark", "enum": ["Dark", "Light"] },
      "app.language": { "type": "string", "default": "zh", "enum": ["zh", "en"] }
    }
  }
}
```

**底层存储：**

```
settings.json（单一 JSON 文件，用户和 AI 都可以编辑）
  {
    "terminal.timestampFormat": "HH:mm:ss:fff",
    "terminal.showEcho": true,
    "app.theme": "Dark",
    "app.language": "zh"
  }

对标：prefs.json 是扁平 JSON，改为 settings.json 格式相同但语义更清晰。
```

**配置消费端：**

```typescript
// React hook
const [value, setValue] = useConfiguration("terminal.timestampFormat")

// 程序化读写
ConfigurationService.get("terminal.timestampFormat")  // → "HH:mm:ss:fff"
ConfigurationService.set("terminal.timestampFormat", "HH:mm:ss")
```

**Settings Editor（UI 组件，对标 VS Code）：**

```
┌─────────────────────────────────────────────────────┐
│ 设置                          🔍 搜索设置            │
│ 用户  工作区                                        │
├────────────┬────────────────────────────────────────┤
│ 常用设置    │ Editor: Font Size                     │
│ 文本编辑器  │ 控制字体大小 (像素)。                   │
│ 终端       │ [14                    ]               │
│   - 格式   │                                        │
│   - 回显   │ Files: Auto Save                       │
│   - 编码   │ 控制自动保存。                          │
│ 窗口       │ [afterDelay           ▼]               │
│ 扩展       │ ...                                    │
└────────────┴────────────────────────────────────────┘

左侧树：按 configuration.title 分组（每个插件的 configuration 自动成为一组）
右侧：当前分组的 properties，每项 = description + 对应控件（输入框/下拉/复选框）
搜索：过滤所有分组的所有 properties
```

**Phase 5 做：**
- ConfigurationRegistry：启动时收集所有 `contributes.configuration` → 合并成一个 schema
- ConfigurationService：`get` / `set` / `onDidChange`（默认从 settings.json 读写）
- Settings Editor：左侧树 + 右侧表单 + 搜索框（基础版，对标 VS Code 设置页结构）
- 迁移：现有的 `PreferenceService.preferences` → 新 ConfigurationService
- **自定义强调色：** 第一个非终端插件的配置项，验证 Settings Editor 多分组渲染。`"app.accentColor"` 配置项 → JS `setProperty` 动态算 `--accent-hover` / `--accent-light`。~30 行。Memory `custom-accent-colors.md` 原标 P7，随着配置系统 P5 建好，顺手做

**Phase 5 做：** User/Workspace scope 三层合并——见柱子 6。JSON 编辑器直接打开 settings.json 留给 Phase 6

### 柱子 3：菜单系统 (Menu Registry)

**对标：** `package.json contributes.menus` + `MenuId`

**解决什么问题：** 插件需要在特定位置出现操作入口——标签页右键、文件右键、齿轮菜单。当前所有菜单都是硬编码的。

**设计：**

```typescript
// 菜单注册点（核心定义——对标 VS Code MenuId）
// 这是唯一权威的 MenuId 定义。Phase 6 只在此列表上追加，不修改已有值。
enum MenuId {
  CommandPalette = "commandPalette",   // Ctrl+Shift+P 命令面板
  TabContext = "tabContext",           // 标签栏右键
  EditorContext = "editorContext",     // 标签页内容区右键
  ExtensionGear = "extensionGear",     // 插件市场齿轮菜单
  MenuBar = "menuBar",                // ☰ 汉堡菜单栏（Phase 6 消费）
  FileContext = "fileContext",         // 文件树右键（Phase 6 消费）
  CardContext = "cardContext",         // 卡片右键（Phase 7 消费）
  QuickSendContext = "quickSendContext", // 快捷发送右键
  IconBar = "iconBar",                // 图标栏右键
}

// 插件声明菜单项——对标 VS Code contributes.menus
// terminal/plugin.json
{
  "contributes": {
    "commands": [
      { "id": "terminal.configure", "title": "配置终端" }
    ],
    "menus": {
      "extensionGear": ["terminal.configure"],
      "editorContext": ["terminal.clear", "terminal.export"]
    }
  }
}

// 消费端
MenuService.getMenuItems(MenuId.EditorContext, contextKeys)
  → [{ id: "terminal.clear", title: "清空接收区", handler: ... }, ...]
```

**Phase 5 做：**
- MenuId 定义 + MenuService：注册菜单项、查询菜单
- CommandPalette 从 CommandRegistry 拿命令（不限于菜单注册的命令——所有命令都在命令面板出现）
- `ExtensionGear` 齿轮菜单 → 从 MenuService 动态拿，不再硬编码"启用/禁用/卸载"

**Phase 6 做：** 文件树右键（MenuId.FileContext）。**Phase 7 做：** 卡片右键（MenuId.CardContext）。context key 条件过滤 Phase 5 已做。

### 柱子 4：协议注册表 (Protocol Registry)

**对标：** 无 VS Code 对标（VS Code 不做硬件协议解析）。这是 V3 独有的基础设施。

**解决什么问题：** 当前 ProtocolParser 是硬编码的方括号解析器。换协议 = 改源码或写 if/else。协议插件加载了但不能注册解析函数。

**设计：**

```typescript
// 协议插件声明
{
  "mode": "text",           // "text"（前端 TS 解析）或 "binary"（Rust 端解析）
  "entry": "index.ts"      // 导出 parseLine(line) → { cardId, value }[]
}

// 注册（loader 自动调用）
ProtocolRegistry.register({
  id: "sbq",
  name: "SBQ 心率协议",
  mode: "text",
  parseLine: (line) => { ... },
  detect: (rawBytes) => rawBytes[0] === 0x73,  // 可选：自动检测
})

// 消费端（终端下拉框）
const protocols = ProtocolRegistry.list()
// → [{ id: "bracket", name: "方括号协议" }, { id: "sbq", name: "SBQ 心率" }]

// 用户选 "SBQ 心率" → ProtocolRegistry.setActive("sbq")
// 之后所有串口数据走 SBQ 的 parseLine
```

**Phase 5 做：**
- ProtocolRegistry：文本模式（text）的注册/查询/切换
- 终端下拉框：从 ProtocolRegistry 动态生成协议列表
- 现有方括号解析器迁移到 ProtocolRegistry（作为内置 "bracket" 协议）

**Phase 7 做：** binary 模式（Rust 端解析器 + WASM）

### 柱子 5：Card Registry —— 骨架

Phase 5 不做卡片渲染。但需要把 registry 接口留好，让 Phase 7 开箱即用。

```typescript
// loader 检测到 card 贡献 → 注册
CardRegistry.register({
  id: "waveform",
  name: "波形图",
  component: React.lazy(() => import("...")),
  acceptsFields: ["amplitude", "frequency"],  // 它能消费哪些 cardId
})
```

---

### 柱子 6：Context Key + 快捷键 + Scope —— 命令/菜单/配置的下半身

**为什么必须在 Phase 5 做：** 命令系统的 `when` 条件、配置系统的 User/Workspace scope、菜单/命令的键盘快捷键——如果留到 Phase 6/7，会出现"先建功能，后补基础设施"的 V2.6 模式。

具体风险：Phase 5 注册了大量命令/菜单，`when` 条件全部空着。Phase 7 context key 系统来了 → 回头翻每一个插件声明补 `when`。每个快捷键绑定也是如此——先空着，后面补。

**Phase 5 一次做完：命令系统注册时 `when` 就生效，`keybinding` 就可用，ConfigurationService 从第一天就支持 scope。**

#### 6.1 Context Key 系统

**对标：** VS Code `when` clause context keys + `setContext`

**设计：**

```typescript
// 全局 context key 状态机
// 对标 VS Code 的 context key——只是 VS Code 的叫 "context key"，我们同名
interface ContextKeyState {
  // 编辑器状态
  "activeEditor": string | null;        // 当前活动标签页 pluginId
  "editorHasSelection": boolean;        // 标签页内有选中内容
  "editorCount": number;                // 打开的标签页数量

  // 端口/硬件状态
  "portOpen": boolean;                  // 串口是否打开
  "portName": string | null;            // 当前端口名

  // 插件状态
  [key: `plugin.${string}.${string}`]: unknown;  // 插件自定义 context key
}

// 消费方式 1：命令声明 when 条件
// plugin.json
{
  "contributes": {
    "commands": [
      {
        "id": "terminal.clear",
        "title": "清空接收区",
        "when": "portOpen"              // 只有串口打开时才可用
      }
    ]
  }
}

// 消费方式 2：菜单声明 when 条件
{
  "contributes": {
    "menus": {
      "editorContext": [
        { "command": "docReader.openPreview", "when": "activeEditor == 'doc-reader'" }
      ]
    }
  }
}

// 消费方式 3：运行时查询
if (ContextKeyService.matches("portOpen && editorHasSelection")) {
  // ...
}

// ContextKeyService 内部
// 表达式引擎：支持 && / || / ! / == / != / in（对标 VS Code when clause 语法）
class ContextKeyService {
  private state: Map<string, unknown> = new Map()

  setValue(key: string, value: unknown): void {
    this.state.set(key, value)
    this.onDidChange.fire(key)
  }

  matches(expression: string): boolean {
    // 解析 expression → AST → 对 state 求值 → boolean
  }

  getValue<T>(key: string): T | undefined {
    return this.state.get(key) as T
  }

  onDidChange: Event<string>  // 用 CoreEvents.EventEmitter
}
```

**实现体量：** ~120 行。表达式解析器约 60 行（合法 token：`&& || ! == != =~ in true false`，对标 VS Code when clause parser），状态机约 40 行，CoreEvents 集成约 20 行。

#### 6.2 快捷键绑定（KeybindingRegistry）

**对标：** VS Code `contributes.keybindings` + `keybindings.json`

**设计：**

```typescript
// 插件声明快捷键——plugin.json
{
  "contributes": {
    "keybindings": [
      {
        "command": "terminal.clear",
        "key": "ctrl+k",
        "when": "portOpen"         // 可选：仅在 portOpen 时响应
      },
      {
        "command": "terminal.sendBreak",
        "key": "ctrl+shift+b",
        "when": "activeEditor == 'terminal'"
      }
    ]
  }
}

// KeybindingRegistry——启动时收集所有 contributes.keybindings
class KeybindingRegistry {
  private bindings: Keybinding[] = []

  register(pluginId: string, keybinding: Keybinding): void

  // 键盘事件 → 匹配 key → 检查 when → 执行命令
  handleKeyEvent(event: KeyboardEvent): void {
    const matched = this.bindings.find(b => matchesKey(b.key, event))
    if (matched && ContextKeyService.matches(matched.when)) {
      CommandRegistry.execute(matched.command)
    }
  }
}
```

**优先级：** 用户 > 插件。用户在 `keybindings.json` 里的定义覆盖插件默认。Phase 5 只做全局 `keybindings.json`，不区分 scope。

**实现体量：** ~80 行。KeybindingRegistry ~40 行，全局 `keydown` 监听 ~20 行，序列化/反序列化 ~20 行。

#### 6.3 User / Workspace Scope

**对标：** VS Code User vs Workspace settings

**问题：** Phase 4 的 PreferenceService 只有一个全局 `prefs.json`。但如果用户有一个"PID 调参"工作台和一个"蓝牙调试"工作台——两个工作台对终端波特率、协议选择的需求不同。全局设置不够用。

**设计：**

```typescript
// 三层 scope 优先级（对标 VS Code）
// Workspace > User > Default
enum ConfigurationScope {
  Default = 1,     // plugin.json 里写的 default 值
  User = 2,        // 全局 settings.json
  Workspace = 3    // .linkdesk/settings.json（项目级）
}

// ConfigurationService——从第一天支持 scope
class ConfigurationService {
  // 读：自动合并三层优先级
  get<T>(key: string, scopeHint?: ConfigurationScope): T {
    // 1. 先查 settings.json
    // 2. 如果关联了 workspace 且 workspace 有覆盖 → 用 workspace 的值
    // 3. 都没有 → 回退 ConfigurationRegistry 的 default
  }

  // 写：明确写哪个 scope
  set(key: string, value: unknown, scope: ConfigurationScope): Promise<void>

  // 检查某个 key 是否被 workspace 覆盖
  inspect<T>(key: string): {
    key: string;
    defaultValue: T;
    userValue?: T;
    workspaceValue?: T;
    effectiveValue: T;
  }
}

// settings.json（全局 User scope）
{
  "terminal.timestampFormat": "HH:mm:ss:fff",
  "app.theme": "Dark"
}

// .linkdesk/settings.json（Workspace scope——可选，Phase 5 接口支持但 Phase 7 才建 workspace 管理 UI）
{
  "terminal.timestampFormat": "无"     // 这个工作台不要时间戳
}

// 此时 ConfigurationService.get("terminal.timestampFormat")
// → 返回 "无"（Workspace 覆盖了 User）
```

**Phase 5 做：** ConfigurationService 的三层读/写/inspect 接口、`settings.json`（User scope）、`.linkdesk/settings.json`（Workspace scope——读写能力完整，UI 管理留给 Phase 7）。

**实现体量：** ~100 行。三层合并逻辑 ~40 行，inspect 方法 ~20 行，序列化 ~20 行，`onDidChange` 通知 ~20 行。

---

### 柱子之外：VS Code 审计发现的盲区

> 2026-07-20。对照 VS Code 的 `contributes` 全部清单和 `vscode.d.ts` 完整 API 审计后发现的缺失项。
> 不加进 Phase 5 的话，Phase 6/7 需要回头拆框架。

### 盲区 1（P0）：异步命令 + 取消令牌

**问题：** 当前计划的 `CommandRegistry.execute(commandId)` 是同步的 `() => void`。够用于"清空接收区"，但未来 CAD 的"导出 PDF"要跑 30 秒、用户想中途取消——同步签名不支持。

**VS Code：** 所有命令 handler 返回 `Promise<void>`，自动支持暂停/进度/取消。

**Phase 5 就该用：**
```typescript
type CommandHandler = (token?: CancellationToken) => Promise<void>

// 使用
await CommandRegistry.execute("cad.exportPdf", token)
// CAD 插件内部周期性检查 token.isCancelled → 提前返回
```

**影响：** 如果 Phase 5 用同步签名，Phase 7 加任务系统时所有插件的 handler 签名都要改。用异步签名一天都不用等任务系统——现在就用。`CancellationToken` 只是一个 `{ isCancelled: boolean }` 对象，连 20 行代码都不用。

### 盲区 2（P0）：`configurationDefaults`——插件的弱默认值

**问题：** 一个工作台插件想建议"终端默认时间戳格式 = HH:mm:ss"，但如果用户已经在 settings.json 里手动设了别的——用户的手动值应该赢。

**如果没有 configurationDefaults：** 插件只能在启动时调 `ConfigurationService.set("terminal.timestampFormat", "HH:mm:ss")` 硬写——会覆盖用户的手动修改。

**VS Code 做法：**
```json
"contributes": {
  "configurationDefaults": {
    "terminal.timestampFormat": "HH:mm:ss",
    "[workspace:pid-tuning]": {
      "terminal.showEcho": false
    }
  }
}
```
优先级：`用户手动设置 > configurationDefaults（插件建议）> 插件 default > 系统 fallback`

**Phase 5 就该有：** ConfigurationRegistry 注册时区分 `default`（插件自己的硬默认）和 `configurationDefaults`（插件给其他配置项的弱建议）。~50 行。

### 盲区 3（P1）：核心事件系统——插件能订阅什么

**问题：** Phase 5 的插件只有 React 组件的 props（`{ isActive }`）。非 React 插件（协议解析器、数据源）没有任何方式感知系统状态变化。就算是 React 组件，也无法知道"串口被其他插件关掉了"。

**VS Code：** `onDidChangeConfiguration` / `onDidChangeActiveEditor` / `onDidChangeTheme`……所有插件订阅同一套事件。

**Phase 5 就该有（<80 行）：**
```typescript
// 通用事件类型
class EventEmitter<T> {
  private listeners = new Set<(data: T) => void>()
  on(fn: (data: T) => void): Disposable { ... }
  fire(data: T): void { ... }
}

// 核心事件（启动时挂上 5 个）
CoreEvents.onDidChangeConfiguration: Event<{ key: string; value: unknown }>
CoreEvents.onDidChangePortState:      Event<{ isOpen: boolean; portName: string }>
CoreEvents.onDidChangeTheme:          Event<{ theme: "Dark" | "Light" }>
CoreEvents.onDidChangeActiveTab:      Event<{ tabId: string; pluginId?: string }>
CoreEvents.onDidReceiveData:          Event<{ sourceId: string; raw: string }>

// 插件使用
CoreEvents.onDidChangePortState.on(({ isOpen, portName }) => {
  if (isOpen) startMyLogic()
  else stopMyLogic()
})
```

**为什么必须在 Phase 5：** 没有事件系统，插件要么用 React Context（限制在 React 组件）、要么做轮询、要么根本感知不到。当真的要加事件系统时（Phase 7），所有依赖"感知系统状态"的插件都要重写集成代码。

### 盲区 4（P1）：PluginStateService——插件的私有存储

**问题：** CAD 插件想存"最近打开的文件列表"。终端插件想存"上次用的波特率"。没有一个统一的"插件私有存储"机制。

**如果没有：** 每个插件自己管理 JSON 文件用 Tauri fs。每个插件重复造轮子，而且文件路径/格式各不同。

**Phase 5 就该有：**
```typescript
PluginStateService.get(pluginId, key): Promise<unknown>
PluginStateService.set(pluginId, key, value): Promise<void>
PluginStateService.getAll(pluginId): Promise<Record<string, unknown>>

// 底层：settings.json 的 pluginStates 段
// {
//   "pluginStates": {
//     "terminal": { "lastBaudRate": "115200", "lastPort": "COM3" },
//     "cad": { "recentFiles": ["/path/to/board.dxf"] }
//   }
// }
```
~60 行。

### 盲区 5（P1）：deactivate 生命周期

**问题：** 终端插件卸载时刚好开着串口？CAD 插件监听了一个文件变化事件？当前卸载只是 `unregisterViewPlugin`——插件没机会清理。串口连接变成野连接，文件监听器泄漏。

**VS Code：** `export function deactivate() { /* cleanup */ }`

**Phase 5 就该有：**
```typescript
// 插件可选导出
export function deactivate(): void | Promise<void> {
  // 关闭连接、移除监听、保存状态
}

// loader 卸载前调用
await pluginModule.deactivate?.()
// 然后再 unregister
```
~15 行。在 loader.ts 里改一处。

### 盲区 6（P0）：数据分发层——协议输出 → 卡片消费

**问题：** Phase 4 的数据管道是硬编码的：`串口 → RingBuffer → TerminalView`。ProtocolRegistry 定义了"用哪个解析器"，但没有定义"解析后的数据去哪"。

**Phase 7 的场景：** 用户选了 SBQ 协议 → 解析器输出 `{ cardId: "heartbeat", value: 72 }` → 这个数据需要路由到订阅了 "heartbeat" 的卡片组件。但是没有 DataDispatch 这层桥——数据到了解析器就停了。

**如果不做：** Phase 7 卡片工作台建好了，协议解析器也注册了，但数据走不到卡片。因为 Phase 4 的管道终点是 TerminalView 的 CM6，没有"数据→卡片"的出口。

**Phase 5 就该有（~100 行）：**
```typescript
// 卡片/视图订阅数据
DataDispatch.subscribe(sourceId, cardId, (fields) => { ... })
// 协议解析器输出数据后调用
DataDispatch.dispatch(sourceId, cardId, fields)
```

### 盲区 7（P0）：插件窗口 API——QuickPick / InputBox / 确认框

**问题：** 插件没有任何方式弹出一个简单的交互 UI。`pushToast()` 已支持 action 按钮（对标 VS Code 通知卡片，如 "Yes/No/Don't show again"），但不能做选择列表或输入框。`window.confirm()` 能弹出但 UI 丑陋且阻塞。

**Phase 5+ 的场景：** CAD 插件"导入 DXF"需要选文件 → Tauri dialog 能做。但"导出为什么格式？PDF/DXF/STL？"——需要一个 QuickPick 选择框。协议插件"检测到 SBQ 数据，切换协议？"——需要一个确认框。

**如果不做：** 每个插件自己画选择框/输入框/确认框——UI 碎片化，每个插件一套交互模式。VS Code 的做法是 `vscode.window.showQuickPick / showInputBox / showInformationMessage`——统一 API，统一 UI。

**Phase 5 就该有（~150 行）：**
```typescript
DialogService.showQuickPick(items: { label: string; description?: string }[]): Promise<string | undefined>
DialogService.showInputBox(options: { prompt: string; value?: string }): Promise<string | undefined>
DialogService.showConfirm(message: string): Promise<boolean>
```
底层是 React 组件 + Promise。对标 VS Code `vscode.window.*`。

### 盲区 8（P1）：插件错误隔离——非 React 代码

**问题：** 当前 `ErrorBoundary.tsx` 只保护 React 渲染。协议解析器的 `parseLine()`、命令处理器、事件回调——如果抛出异常，会直接崩掉整个管道或命令面板。

**Phase 5+ 的场景：** 用户装了 5 个协议插件，其中一个是社区写的——它的 `parseLine()` 在某行数据上崩了。如果没有错误隔离，整个串口数据管道崩溃，所有 5 个协议都收不到数据。

**如果不做：** 一个 buggy 插件拖垮整个应用。用户不知道是哪个插件崩的——只能看到一个白屏或静默失败。

**Phase 5 就该有（~40 行）：** CommandRegistry、ProtocolRegistry、EventEmitter 在调用插件代码时包 `try/catch`，捕获异常后 toast 报告"插件 XXX 出错：..."并继续运行。

### 盲区 9（P1）：跨插件命令调用

**问题：** 当前规划的命令系统只支持"命令面板搜到命令 → 用户点 → 执行"。但如果一个插件想调用另一个插件的命令（比如工作台插件想调 `terminal.clear` 清空终端），没有标准方式。

**Phase 7 的场景：** 工作台有个"重置"按钮 → 它想执行 `terminal.clear` + `workspace.resetCards`。如果只能用户手动点命令面板，体验很糟。

**如果不做：** 插件之间的协作要么走硬编码 import（紧耦合），要么完全不存在。VS Code 的做法是 `vscode.commands.executeCommand('otherPlugin.doSomething', ...args)`——任何插件可以通过命令 ID 调用任何命令。

**Phase 5 就该有（~15 行）：** `CommandRegistry.execute(commandId, ...args)` 已经规划了——只需要明确命令的 args 参数，以及文档约定命令 ID 就是插件的公共 API。

### 盲区 10（P1）：插件日志/诊断频道

**问题：** 当前 `console.log` 全进浏览器 DevTools——用户看不到，插件开发者调试时也看不到。

**Phase 5+ 的场景：** 一个协议插件解析数据时想打印"跳过无效帧：0x00 0xFF"——这条信息对开发者有价值，但对普通用户不重要。它应该进日志频道，不是 toast。

**如果不做：** 插件开发者在真机环境中完全无法调试。VS Code 的 Output 面板和 `vscode.window.createOutputChannel()` 解决了这个问题。

**Phase 5 就该有（~50 行）：**
```typescript
LogChannel.create(pluginId, name): { appendLine(msg: string): void; show(): void }
```
频道先建好，Output 查看器 UI 留给 Phase 6——但数据通道必须在 Phase 5 存在，插件才能往里写。

### 盲区 11（P1）：布局持久化接口——LayoutService

**问题：** Phase 5 迁移计划（§4.1）提到了 LayoutService，但只说了一句话，从未定义。

**Phase 7 的场景：** 卡片工作台需要保存每个卡片的 x/y/w/h。react-grid-layout 有自己的序列化格式。如果 Phase 5 没有留好 LayoutService 接口，Phase 7 要么自己造、要么塞进 PluginStateService——但卡片布局是工作区级数据，不是插件私有数据。

**如果不做：** PreferenceService 拆不掉。`Prefs.layout`（标签页布局）和卡片布局混在一起。Phase 7 更难彻底迁移。

**Phase 5 就该有（~50 行）：**
```typescript
LayoutService.saveWorkspaceLayout(name: string, cards: CardLayout[]): Promise<void>
LayoutService.loadWorkspaceLayout(name: string): Promise<CardLayout[]>

// CardLayout = { id: string; cardId: string; x: number; y: number; w: number; h: number }
```
格式是平铺数组（遵守设计方案 §1.5 硬约束）。

---

## 三、四根柱子的连接关系（更新）

```
plugin.json
  ├── contributes.commands        → CommandRegistry
  │     ├── CommandPalette 消费    → Ctrl+Shift+P 搜索执行
  │     ├── MenuService 消费      → 右键菜单 / 齿轮菜单的选项
  │     ├── KeybindingRegistry    → 键盘快捷键触发（带 when 条件）
  │     └── ContextKeyService     → when 条件求值
  │
  ├── contributes.keybindings     → KeybindingRegistry
  │     └── 消费端：全局 keydown → 匹配 when → 执行命令
  │
  ├── contributes.configuration   → ConfigurationRegistry
  │     ├── ConfigurationService  → get/set/inspect + User/Workspace scope
  │     ├── Settings Editor 消费  → 搜索表单 UI
  │     └── settings.json         → 持久化存储（多层：User + .linkdesk/Workspace）
  │
  ├── contributes.menus           → MenuService
  │     ├── ContextKeyService     → when 条件过滤
  │     └── 消费端：右键菜单 / 齿轮 / 命令面板
  │
  ├── mode (protocol)             → ProtocolRegistry
  │     └── 消费端：终端下拉框 / 自动检测
  │
  └── entry (view)                → viewRegistry（Phase 4 已完成）

全局系统状态（独立于插件）：
  ContextKeyService     → 实时追踪 activeEditor / portOpen / editorHasSelection 等
  KeybindingRegistry    → 全局键盘事件监听 → 分发到匹配的命令
  CoreEvents.EventEmitter → 所有系统的通知总线（context key 变更 / 配置变更 / 端口状态 / 主题切换）
```

**核心原则：每一项贡献独立注册，互不影响。** 终端插件可以只贡献 view + statusBar，不贡献任何设置；主题插件可以只贡献 theme，不贡献命令。Registry 只看声明，不要求完整。**Phase 5 后 Registry 接口封板——后续 Phase 只调 `register()`，不扩展接口签名。**

**parseContributions() 设计约束：**
- 按 key 逐项检测（`if (contributes.commands) { ... }`）——不 switch，不 reject
- 不认识的 key → 静默跳过（Phase 6 加 `contributes.themes` 时 Phase 5 的 loader 不崩）
- `PluginManifest.contributes` 类型使用宽松索引签名 `[key: string]: unknown`，Phase 6 在此之上加具体类型

**ContextKeyState 设计约束：**
- Phase 5 初始化 5 个 key：`activeEditor / editorHasSelection / editorCount / portOpen / portName`
- 运行时动态，`setValue(key, value)` 接受任意 key——Phase 6 加 `activeWorkspace / fileTreeHasSelection / profile` 零改动
- TypeScript 接口标注：`// Phase 6 将添加：activeWorkspace, fileTreeHasSelection, profile`

**ConfigurationService.setWorkspaceRoot(path)：**
- Phase 6 的 WorkspaceService 调此方法告知配置系统"当前 workspace 文件夹路径"
- Workspace scope 的 `.linkdesk/settings.json` 相对于此路径解析
- Phase 5 定义接口签名，Phase 6 传参消费

---

## 四、Phase 5 迁移清单

### 4.1 彻底拆掉 PreferenceService

```
PreferenceService（现状——一块大杂烩）→ 拆分为：
  ├── ConfigurationService   → 所有设置类数据的读写（替代 Prefs.preferences）
  ├── LayoutService          → 标签页布局持久化（替代 Prefs.layout）
  └── PluginStateService     → 插件状态（disabledPlugins, iconOrder 等）
```

### 4.2 终端设置迁移

```
旧：terminalPrefs = { timestampFormat, showEcho, ... }  ← 在 React Context 里
新：terminal/plugin.json 声明 configuration
   → ConfigurationRegistry 注册
   → TerminalView 里用 useConfiguration("terminal.timestampFormat")
   → 终端侧栏用 Settings Editor 渲染，不再手写 TerminalSidebar.tsx
```

### 4.3 全局设置迁移

```
旧：
  theme: "Dark"     ← App.tsx 的 useState
  language: "zh"    ← App.tsx 的 useState

新：
  app.theme:     ← 内置 core configuration
  app.language:  ← 内置 core configuration
  → useConfiguration("app.theme") 替代 useState
```

---

## 五、Phase 5 不做的东西（明确边界）

| 不做 | 理由 | 以后 |
|------|------|:--:|
| 工作台 / 卡片渲染 | 需要 CardRegistry 先建好，但卡片 UI 是 Phase 7 | 7 |
| OLED | 具体功能，不是基础设施 | 8 |
| 文件树 | 系统视图，Phase 5 基础设施就绪后 Phase 6 建 | 6 |
| 主题系统插件化 | 引擎已有（ThemeEngine），插件化是 Phase 6 | 6 |
| 语言系统插件化 | 引擎已有（i18next），插件化是 Phase 6 | 6 |
| JSON 编辑器标签页 | 用 Monaco 做，依赖 Settings Editor 稳定 | 6 |
| 设置同步 | 需要后端 | 8+ |
| 齿轮菜单完整版 | context key 驱动的动态菜单 + 设置联动 UI | 6 |
| 动态 StatusBarItem（运行时创建）| 静态 manifest 声明够用，运行时 API Phase 6+ | 6 |
| 任务系统（build/flash/test）| Phase 8+，异步命令模型已预留 | 8+ |
| contributes.icons（共享图标）| 已有 codicon + manifest icon，共享图标是 polish | 6 |
| Output 查看器 UI | LogChannel 数据通道 Phase 5 建好，查看器 UI Phase 6 | 6 |
| 插件资源访问 API（getResourceUri）| P2 优先级低，~20 行，Phase 6 再加不迟 | 6 |
| 插件 i18n 注册（内联翻译）| 语言包插件已工作，内联翻译是 polish | 6 |
| 通知进度条 | Toast 组件已支持静态渲染，进度条需 ProgressBar 组件 | 7 |
| 通知来源过滤 / Do Not Disturb | 需 NotificationService 管理过滤规则 | 7 |
| "Don't show again" 持久化 | 简单 prefs 集成，~10 行，可随需要时做 | 7 |
| 完整 Notification Center 面板 | 铃铛入口已有，面板需滚动列表 + 分组 + 过滤 | 7 |
| 通知 source 归类（按插件分组）| 依赖 Notification Center 面板 | 7 |

---

## 六、Phase 6-8 的图景

Phase 5 建好基础设施后，Phase 6 起就是**在基础设施上写功能**——不改框架代码，只声明 + 注册。

```
Phase 6 — 系统视图 + 引擎插件化
  ├── 文件树（系统视图）
  │   ├── 注册 MenuId.FileContext 锚点 → 其他插件的菜单项可挂到文件树右键
  │   ├── 命令面板可搜索文件操作 → CommandRegistry（Phase 5 建的）
  │   └── 设置（自动隐藏/排除模式）→ ConfigurationRegistry（Phase 5 建的）
  │
  ├── 主题系统插件化
  │   ├── theme 贡献类型升级 → 和 view/protocol 同等的插件一等公民
  │   ├── 主题选择器 UI（搜索/预览/切换）→ view + commands
  │   └── ThemeEngine 消费 extends 链 → 已有机制，插件化包装
  │
  └── 语言系统插件化
      └── language 贡献类型升级 → 和 view/protocol 同等的插件一等公民

Phase 7 — 卡片工作台 + 数据管道（第一个纯插件功能）
  ├── 工作台插件（所有能力来自 Phase 5）
  │   ├── commands: "workspace.newCard", "workspace.export"... → 命令面板 + 右键 + 快捷键
  │   ├── configuration: "workspace.gridSize", "workspace.snapToGrid"... → Settings Editor
  │   └── menus: "cardContext" 菜单项（when 条件从第一天生效）
  ├── CardRegistry（Phase 5 留的骨架）→ 卡片渲染 + react-grid-layout
  └── ProtocolRegistry（Phase 5 建的）→ 协议选择下拉框 + DataDispatch → 卡片消费端

Phase 8 — OLED（独立插件）
  ├── view: OLED 视图插件
  ├── receives: DataDispatch 订阅数据管道
  └── configuration: OLED 设置项 → Settings Editor 自动渲染
```

**Phase 5 之后零框架改动。** 文件树、卡片工作台、OLED——每个都是 `plugin.json` 声明 + Registry 注册。框架不再因为"新加了一个功能"而改一行代码。这就是 VS Code 0.9→1.0 的拐点。

---

## 九、实施批次——拆分 Phase 5 为 6 个小批次

> 2026-07-20。Phase 5 体量过大（~1,800 行 + 四处 UI 改造 + 迁移 + 回归），一口气做完风险高——命令、配置、菜单、context key、快捷键每个都是 VS Code 花了好几个 milestone 打磨的子系统。拆成 6 个小批次，每批交一个可用软件。

### 9.1 批次总览

| 批次 | 内容 | 行数 | 风险 | 状态 |
|:--:|------|:--:|:--:|:--:|
| **5a** | Registry 暗线 + 迁移双写 + Settings Editor 骨架 | ~1,800 | 低 | ✅ 完成 |
| **5b** | 右键菜单归一化——`<ContextMenu>` 统一组件 | ~150 | 低 | 🔜 |
| **5c** | 命令面板 + 齿轮菜单走 Registry | ~120 | 中 | 📋 |
| **5d** | context key + when 条件打通 | ~80 | 中 | 📋 |
| **5e** | 协议下拉框 + 终端设置迁移到 Settings Editor | ~80 | 低 | 📋 |
| **5f** | StorageService 归一化 + PreferenceService 删旧 + 全量回归 | ~200 | 中 | 📋 |

### 9.2 每批交付物 + 验证标准

**5a — Registry 暗线（已完成 ✅）：**
- 交付：14 个新 core 模块（CommandRegistry / ConfigurationRegistry + Service / MenuRegistry / ProtocolRegistry / CardRegistry / ContextKeyService / KeybindingRegistry / CoreEvents / DataDispatch / DialogService / LogChannel / LayoutService / PluginStateService / useConfiguration hook）
- 验证：`npx tsc --noEmit` 零错误 + `npx vitest run` 109/109 全过 + `npx tauri dev` 窗口正常打开 + 终端收发正常。所有新代码双写（新旧路径并行），旧 Prefs 路径不删不改。

**5b — 右键菜单归一化：**
- 交付：`shared/ContextMenu.tsx` + `.css`——统一的 backdrop + 三种失焦（Escape + window.blur + scroll capture）+ MenuService 驱动内容。替换 TabBar / ReceiveContextMenu / terminal/index.tsx / 齿轮菜单 四处现有右键实现。
- 验证：四处右键菜单外观一致、失焦行为一致、同时只能弹一个。菜单内容正确（不同位置不同菜单项）。
- 依赖：MenuRegistry（5a 已建）。

**5c — 命令面板 + 齿轮菜单走 Registry：**
- 交付：CommandPalette 命令列表从 `CommandRegistry.getCommands()` 动态获取（替代硬编码数组）。齿轮菜单从 `MenuService.getMenuItems(MenuId.ExtensionGear, context)` 动态获取（替代硬编码"启用/禁用/卸载"）。
- 验证：Ctrl+Shift+P → 终端命令出现。齿轮菜单内容由插件 contributes.menus 声明决定。
- 依赖：CommandRegistry + MenuRegistry（5a 已建）。

**5d — context key + when 条件打通：**
- 交付：ContextKeyService 挂上 5 个核心 key（activeEditor / editorHasSelection / editorCount / portOpen / portName）。串口开关时更新 context key。菜单/命令的 when 条件过滤生效。
- 验证：串口未打开 → 终端右键菜单"暂停"不出现。串口打开 → "暂停"出现。非终端标签页聚焦 → 终端专属菜单项不出现。
- 依赖：5c（菜单走 Registry 后 when 才有消费端）。

**5e — 协议下拉框 + 终端设置迁移：**
- 交付：终端工具栏新增协议下拉框（ProtocolRegistry.list() 动态生成）。方括号解析器迁移到 ProtocolRegistry（内置 "bracket" 协议）。终端 plugin.json 的 12 个配置项通过 Settings Editor 自动渲染。
- 验证：下拉框默认选中"方括号协议"。切换协议后解析方式变化。Settings Editor 打开 → 终端分组出现 → 12 个设置项可调。
- 依赖：ProtocolRegistry + ConfigurationService + Settings Editor（5a 已建）。

**5f — 归一化清旧债 + 全量回归：**

> Phase 5f 的任务都有一个共同模式：Phase 3-4 时期终端是唯一插件、通用基础设施尚未建立，
> 不得不在 core 里写专用通道。Phase 5a-e 建好了通用设施，5f 统一清债。

- 交付：
  1. **StorageService 归一化**——统一的持久化原语（`read(key)` / `write(key, data)`）。底层封装 Tauri fs + localStorage 兜底 + `beforeunload` 同步写入。解决 ConfigurationService / LayoutService / PluginStateService / PreferenceService 四套代码各自实现文件 I/O 的重复劳动。四个服务改为调 `StorageService`，删除各自的 `ensureTauri()` + `readTextFile()` + `writeTextFile()` + `localStorage.setItem()` 自研逻辑。
  2. **PreferenceService 删旧**——删除所有 `PreferenceService.loadPrefs()` 双写兼容代码。Phase 5a 引入 ConfigurationService 后一直双写，5a 设计时就规划了 5f 删旧路径。
  3. **终端插件解耦**——`"terminal"` 作为 pluginId 硬编码在 4 处不该出现的位置：`TabType` 联合类型、`TAB_IDENTITY` 表、`TerminalPrefsContext`+`TerminalSidebar` 专用组件、`App.tsx` 直接写 `"terminal"` 做 setConfigurationValue / setPluginStateValue。根因同上——Phase 3 做标签页时还没有插件系统，Phase 4 终端是最早的插件但配置/状态通用设施还没建。5f 拆掉这些专用通道，为未来引入真终端（powershell/git bash）清出命名空间。
  4. **全量回归**——`验证清单.md` 所有 checkbox 通过。终端旧功能全量回归（12 项）。F5 刷新后主题/语言/布局/图标排序全部保留。
- 为什么都集中在 5f：持久化 bug 反复出现（快捷发送、图标排序、主题语言、标签栏布局——四轮，同一个模式：写了没读 / 读了没写 / 写A读B / 异步落盘 F5 竞态）。不是代码写得差——是四个服务各自实现 I/O，修一个学到的教训不会传播到另外三个。归一成一个 `StorageService` 后，"持久化 bug"不再是一个 bug 类别。终端耦合同理——不是某处代码写坏了，是 Phase 3-4 缺乏通用设施，专用通道是当时唯一的可行方案。现在设施齐了，统一拆除。
- 验证：`验证清单.md` 所有 checkbox 通过。F5 刷新后主题/语言/布局/图标排序全部保留。终端改名不影响任何功能。

### 9.3 批次依赖链

```
5a（Registry 暗线）✅ ── 基础，所有后续批次依赖它
  │
  ├── 5b（右键归一化）── 独立，无其他批次依赖
  │
  ├── 5c（命令面板+齿轮）── 依赖 5a（CommandRegistry + MenuRegistry）
  │     │
  │     └── 5d（when 条件）── 依赖 5c（菜单走 Registry 后 when 才有消费端）
  │
  └── 5e（协议+设置迁移）── 依赖 5a（ProtocolRegistry + ConfigurationService）
        │
5f（删旧+回归）── 依赖 5a-5e 全部完成
```

**5b 和 5e 互不依赖，可并行。** 建议串行——每批交一个用户验证一个，防止多线并进出问题难以定位。

### 9.4 每批停止标准

每批做完后：
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全部通过
- [ ] `npx tauri dev` 窗口正常打开
- [ ] 终端收发正常
- [ ] 本批特定验证项通过
- [ ] git commit——一个批次一个 commit

满足以上六条才进入下一批。不满足 → 修 bug → 重跑六条。
