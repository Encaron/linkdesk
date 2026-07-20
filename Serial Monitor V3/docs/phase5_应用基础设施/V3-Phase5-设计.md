# Phase 5 应用基础设施层

> 2026-07-20。Phase 4 做了"插件能被加载"。
> Phase 5 做"插件能做什么"——四根柱子 + 十一个盲区。
> 核心交付：插件加载后不只是"出现一个标签页"——能注册命令、贡献设置、添加菜单、解析协议、接收数据、弹窗交互、日志诊断、跨插件通信。
> 工作台/卡片/OLED 延后到 Phase 6+，在基础设施上写。

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

### 1.5 Phase 4 vs Phase 5 vs Phase 6 的分工

```
Phase 4：插件能被加载
  - loader 检测声明 → viewRegistry → IconBar + TabContent + SidePanel + StatusBar
  - 插件"存在"了——能安装、能卸载、能出现标签页
  - 但除了"出现一个标签页"什么都做不了

Phase 5：插件能做什么（当前阶段）
  - 命令系统 → 插件注册命令 → 命令面板可执行 + 右键菜单可调用
  - 配置系统 → 插件贡献设置 → Settings Editor 自动渲染
  - 菜单系统 → 插件声明菜单项 → 右键/齿轮 动态内容
  - 协议系统 → 插件注册解析器 → 终端下拉框切换协议
  - 插件"有用"了

Phase 6：在基础设施上写功能
  - 卡片工作台 = 一个插件，用 Phase 5 的所有能力
  - OLED = 一个插件
  - 任何新功能 = plugin.json 贡献声明，基础设施全部自动接线
  - 新增功能不再改已有代码
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

**Phase 5 必须避免重演。** 命令系统、配置系统、菜单系统、协议系统四个一起规划。它们共享同一份 `contributes` 声明、同一个 `plugin.json` 入口。不给 Phase 6 留"菜单系统是 Phase 5 做的，但卡片右键菜单当时没有考虑"这种债务。

```
Phase 5 四个系统一起设计
  → 共享 contributes 声明格式
  → 共享 Registry 注册模式
  → Phase 6 卡片直接"声明 + 注册"，零额外改动
  → Phase 7 OLED 同样
```

这也是为什么现在只留终端一个实体插件做验证——改动面极小，确认框架正确后 Phase 6 直接铺开。

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
  handler: () => void;     // 执行体
  when?: string;           // context key 条件（Phase 7 启用，当前忽略）
}

// 全局注册表
CommandRegistry.register(pluginId, command)
CommandRegistry.execute(commandId)
CommandRegistry.getCommands()  // → 命令面板用
```

**消费端（哪些地方用命令）：**

| 消费端 | 说明 | Phase |
|--------|------|:--:|
| 命令面板 (Ctrl+Shift+P) | 列出所有命令 → 模糊搜索 → 执行 | 5 |
| 右键菜单 | 文件/标签页/卡片 → 出菜单 | 5 |
| 快捷键 | Ctrl+K → 触发命令 | 7 |
| 齿轮菜单 | 设置齿轮 → "配置 XXX" | 7 |

**Phase 5 做：** Registry + 命令面板消费端（复用现有的 CommandPalette 组件）
**Phase 7 做：** context key `when` 条件、快捷键绑定

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
│ 用户  工作区（Phase 7）                              │
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

**Phase 7 做：** 工作区 scope（User / Workspace 两套 settings.json）、JSON 编辑器直接打开 settings.json

### 柱子 3：菜单系统 (Menu Registry)

**对标：** `package.json contributes.menus` + `MenuId`

**解决什么问题：** 插件需要在特定位置出现操作入口——标签页右键、文件右键、齿轮菜单。当前所有菜单都是硬编码的。

**设计：**

```typescript
// 菜单注册点（核心定义——对标 VS Code MenuId）
enum MenuId {
  CommandPalette = "commandPalette",   // Ctrl+Shift+P 命令面板
  EditorContext = "editorContext",     // 标签页右键
  FileContext = "fileContext",         // 文件树右键（Phase 7）
  CardContext = "cardContext",         // 卡片右键（Phase 6）
  ExtensionGear = "extensionGear",     // 齿轮菜单
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

**Phase 6/7 做：** 文件树右键、卡片右键、context key 条件过滤

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

**Phase 6 做：** binary 模式（Rust 端解析器 + WASM）

### 柱子 5：卡片注册表 (Card Registry) —— 骨架

Phase 5 不做卡片渲染。但需要把 registry 接口留好，让 Phase 6 开箱即用。

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

**Phase 6 的场景：** 用户选了 SBQ 协议 → 解析器输出 `{ cardId: "heartbeat", value: 72 }` → 这个数据需要路由到订阅了 "heartbeat" 的卡片组件。但是没有 DataDispatch 这层桥——数据到了解析器就停了。

**如果不做：** Phase 6 卡片工作台建好了，协议解析器也注册了，但数据走不到卡片。因为 Phase 4 的管道终点是 TerminalView 的 CM6，没有"数据→卡片"的出口。

**Phase 5 就该有（~100 行）：**
```typescript
// 卡片/视图订阅数据
DataDispatch.subscribe(sourceId, cardId, (fields) => { ... })
// 协议解析器输出数据后调用
DataDispatch.dispatch(sourceId, cardId, fields)
```

### 盲区 7（P0）：插件窗口 API——QuickPick / InputBox / 确认框

**问题：** 插件没有任何方式弹出一个简单的交互 UI。`pushToast()` 已支持 action 按钮（对标 VS Code 通知卡片，如 "Yes/No/Don't show again"），但不能做选择列表或输入框。`window.confirm()` 能弹出但 UI 丑陋且阻塞。

**Phase 6 的场景：** CAD 插件"导入 DXF"需要选文件 → Tauri dialog 能做。但"导出为什么格式？PDF/DXF/STL？"——需要一个 QuickPick 选择框。协议插件"检测到 SBQ 数据，切换协议？"——需要一个确认框。

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

**Phase 6 的场景：** 用户装了 5 个协议插件，其中一个是社区写的——它的 `parseLine()` 在某行数据上崩了。如果没有错误隔离，整个串口数据管道崩溃，所有 5 个协议都收不到数据。

**如果不做：** 一个 buggy 插件拖垮整个应用。用户不知道是哪个插件崩的——只能看到一个白屏或静默失败。

**Phase 5 就该有（~40 行）：** CommandRegistry、ProtocolRegistry、EventEmitter 在调用插件代码时包 `try/catch`，捕获异常后 toast 报告"插件 XXX 出错：..."并继续运行。

### 盲区 9（P1）：跨插件命令调用

**问题：** 当前规划的命令系统只支持"命令面板搜到命令 → 用户点 → 执行"。但如果一个插件想调用另一个插件的命令（比如工作台插件想调 `terminal.clear` 清空终端），没有标准方式。

**Phase 6 的场景：** 工作台有个"重置"按钮 → 它想执行 `terminal.clear` + `workspace.resetCards`。如果只能用户手动点命令面板，体验很糟。

**如果不做：** 插件之间的协作要么走硬编码 import（紧耦合），要么完全不存在。VS Code 的做法是 `vscode.commands.executeCommand('otherPlugin.doSomething', ...args)`——任何插件可以通过命令 ID 调用任何命令。

**Phase 5 就该有（~15 行）：** `CommandRegistry.execute(commandId, ...args)` 已经规划了——只需要明确命令的 args 参数，以及文档约定命令 ID 就是插件的公共 API。

### 盲区 10（P1）：插件日志/诊断频道

**问题：** 当前 `console.log` 全进浏览器 DevTools——用户看不到，插件开发者调试时也看不到。

**Phase 6 的场景：** 一个协议插件解析数据时想打印"跳过无效帧：0x00 0xFF"——这条信息对开发者有价值，但对普通用户不重要。它应该进日志频道，不是 toast。

**如果不做：** 插件开发者在真机环境中完全无法调试。VS Code 的 Output 面板和 `vscode.window.createOutputChannel()` 解决了这个问题。

**Phase 5 就该有（~50 行）：**
```typescript
LogChannel.create(pluginId, name): { appendLine(msg: string): void; show(): void }
```
频道先建好，Output 查看器 UI 留给 Phase 7——但数据通道必须在 Phase 5 存在，插件才能往里写。

### 盲区 11（P1）：布局持久化接口——LayoutService

**问题：** Phase 5 迁移计划（§4.1）提到了 LayoutService，但只说了一句话，从未定义。

**Phase 6 的场景：** 卡片工作台需要保存每个卡片的 x/y/w/h。react-grid-layout 有自己的序列化格式。如果 Phase 5 没有留好 LayoutService 接口，Phase 6 要么自己造、要么塞进 PluginStateService——但卡片布局是工作区级数据，不是插件私有数据。

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
  │     └── MenuService 消费      → 右键菜单 / 齿轮菜单的选项
  │
  ├── contributes.configuration   → ConfigurationRegistry
  │     ├── ConfigurationService  → get / set / hook
  │     ├── Settings Editor 消费  → 搜索表单 UI
  │     └── settings.json         → 持久化存储
  │
  ├── contributes.menus           → MenuService
  │     └── 消费端：右键菜单 / 齿轮 / 命令面板
  │
  ├── mode (protocol)             → ProtocolRegistry
  │     └── 消费端：终端下拉框 / 自动检测
  │
  └── entry (view)                → viewRegistry（Phase 4 已完成）
```

**核心原则：每一项贡献独立注册，互不影响。** 终端插件可以只贡献 view + statusBar，不贡献任何设置；主题插件可以只贡献 theme，不贡献命令。Registry 只看声明，不要求完整。

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
| 工作台 / 卡片渲染 | 需要 CardRegistry 先建好，但卡片 UI 是 Phase 6 | 6 |
| OLED | 具体功能，不是基础设施 | 7 |
| 文件树 | 独立大功能，要在命令/菜单就绪后才有意义 | 7 |
| 工作区 scope（User/Workspace）| 先做全局设置，scope 层后加 | 7 |
| context key 条件系统 | 菜单/命令的 `when` 需要先建 context key 状态机 | 7 |
| 快捷键绑定 | 需要完整的 context key 系统 | 7 |
| JSON 编辑器标签页 | 用 Monaco 做，依赖 Settings Editor 稳定 | 7 |
| 设置同步 | 需要后端 | 8+ |
| 齿轮菜单完整版 | context key 驱动的动态菜单 + 设置联动 | 7 |
| 插件命令注册到命令面板之外的地方 | 右键/快捷键/齿轮 = Phase 7 context key 系统 | 7 |
| 动态 StatusBarItem（运行时创建）| 静态 manifest 声明够用，运行时 API Phase 6+ | 6 |
| 任务系统（build/flash/test）| Phase 7+，异步命令模型已预留 | 7+ |
| contributes.icons（共享图标）| 已有 codicon + manifest icon，共享图标是 polish | 7 |
| Output 查看器 UI | LogChannel 数据通道 Phase 5 建好，查看器 UI Phase 7 | 7 |
| 插件资源访问 API（getResourceUri）| P2 优先级低，~20 行，Phase 6 再加不迟 | 6 |
| 插件 i18n 注册（内联翻译）| 语言包插件已工作，内联翻译是 polish | 7 |
| 通知进度条 | Toast 组件已支持静态渲染，进度条需 ProgressBar 组件 | 6 |
| 通知来源过滤 / Do Not Disturb | 需 NotificationService 管理过滤规则 | 7 |
| "Don't show again" 持久化 | 简单 prefs 集成，~10 行，可随需要时做 | 6 |
| 完整 Notification Center 面板 | 铃铛入口已有，面板需滚动列表 + 分组 + 过滤 | 7 |
| 通知 source 归类（按插件分组）| 依赖 Notification Center 面板 | 7 |

---

## 六、Phase 6 的图景

Phase 5 建好基础设施后，Phase 6 就是**在基础设施上写功能**：

```
Phase 6 — 卡片工作台 + 数据管道
  ├── 工作台插件（所有能力来自 Phase 5）
  │   ├── commands: "workspace.newCard", "workspace.export"... → 命令面板 + 右键
  │   ├── configuration: "workspace.gridSize", "workspace.snapToGrid"... → Settings Editor
  │   └── menus: "cardContext" 菜单项
  ├── CardRegistry（Phase 5 留的骨架）→ 卡片渲染 + react-grid-layout
  └── ProtocolRegistry（Phase 5 建的）→ 协议选择下拉框 + 数据路由到卡片

Phase 7 — OLED + 设置完善 + 文件树
  ├── OLED 视图 = 一个插件
  ├── 文件树 = 一个视图 + commands + menus
  ├── Settings Editor 完善（工作区 scope + JSON 编辑器标签页）
  └── context key 系统 + 快捷键绑定
```

**不需要改任何基础设施代码。** 只是在 registry 上注册新东西。
