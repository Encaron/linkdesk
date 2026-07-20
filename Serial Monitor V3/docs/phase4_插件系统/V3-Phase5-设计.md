# Phase 5 应用基础设施层

> 2026-07-20。Phase 4 做了"插件能被加载"。
> Phase 5 做"插件能做什么"——命令、设置、菜单、协议四根柱子。
> 工作台/卡片/OLED 延后到 Phase 6+，在基础设施上写。

---

## 一、为什么 Phase 5 必须是基础设施

### Phase 4 结束时的真实状态

```
✅ 能做的：加载插件 → 出现图标 → 打开标签页 → 渲染 React 组件
❌ 不能做的：
   - 插件注册一个"打开预览"命令 → 没地方注册
   - 插件贡献一个设置项 → 设置系统是硬编码的全局 Prefs
   - 插件在右键菜单加一项 → 菜单系统不存在
   - 插件注册一个协议解析器 → 没有 ProtocolRegistry
   - 终端设置（时间戳/编码）→ 硬编码在全局 Prefs.preferences 里
```

**Phase 4 让插件"出现"了。Phase 5 让插件"有用"。**

### VS Code 的设计顺序

```
VS Code 01-0.5：Editor (Monaco)
VS Code 0.5-0.9：Extension Host + contributes 框架 ← 所有 UI 扩展点在此建成
VS Code 0.9-1.0：Extensions Marketplace
VS Code 1.0+：  具体功能（Debug、Terminal、SCM、Notebook...）
```

**关键：** VS Code 在 1.0 之前就把扩展框架建好了。之后所有功能（包括终端）都是扩展自己贡献的。我们的顺序是反的——先做了终端插件，现在要回头补框架。

---

## 二、Phase 5 四根柱子

### 柱子 1：命令系统 (Command Registry)

**对标：** `vscode.commands` + `package.json contributes.commands`

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

**设计：**

```typescript
// 配置声明——插件在 plugin.json 里写
// terminal/plugin.json
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

// 核心自己也有配置——也用同样的格式
// 内置 core config（在代码中声明）
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

V2 对标：prefs.json 是扁平 JSON，改为 settings.json 同格式。
```

**配置消费端：**

```typescript
// 读配置（React hook）
const [value, setValue] = useConfiguration("terminal.timestampFormat")

// 程序化读写
ConfigurationService.get("terminal.timestampFormat")  // → "HH:mm:ss:fff"
ConfigurationService.set("terminal.timestampFormat", "HH:mm:ss")
```

**Settings Editor（UI 组件）：**

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
│ 功能       │                                        │
│ 扩展       │ Editor: Font Family                    │
│            │ 控制字体系列。                          │
│            │ [Consolas, 'Courier New'               │
└────────────┴────────────────────────────────────────┘

左侧树：按 configuration.title 分组（每个插件的 configuration 贡献自动成为一组）
右侧：当前分组的 properties，每项 = description + 对应控件
搜索：过滤所有分组的所有 properties
```

**Phase 5 做：**
- ConfigurationRegistry：启动时收集所有 `contributes.configuration` → 合并成一个 schema
- ConfigurationService：`get` / `set` / `onDidChange`（默认从 settings.json 读写）
- Settings Editor：左侧树 + 右侧表单 + 搜索框
- 迁移：现有的 `PreferenceService.preferences` → 新 ConfigurationService

**Phase 7 做：** 工作区 scope（User / Workspace 两套 settings.json）、JSON 编辑器直接打开 settings.json

### 柱子 3：菜单系统 (Menu Registry)

**对标：** `package.json contributes.menus` + `MenuId`

**设计：**

```typescript
// 菜单注册点（核心定义）
enum MenuId {
  CommandPalette = "commandPalette",   // Ctrl+Shift+P 命令面板
  EditorContext = "editorContext",     // 标签页右键
  FileContext = "fileContext",         // 文件树右键（Phase 7）
  CardContext = "cardContext",         // 卡片右键（Phase 6）
  ExtensionGear = "extensionGear",     // 齿轮菜单
}

// 插件声明菜单项——当前在 plugin.json，对标 VS Code contributes.menus
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
- CommandPalette 从 CommandRegistry 拿命令（不限于菜单注册的命令）
- `ExtensionGear` 齿轮菜单 → 从 MenuService 动态拿，不再硬编码

**Phase 6/7 做：** 文件树右键、卡片右键、context key 条件过滤

### 柱子 4：协议注册表 (Protocol Registry)

**对标：** 无 VS Code 对标（VS Code 不做硬件协议解析）

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

// 消费端
const protocols = ProtocolRegistry.list()
// → [{ id: "bracket", name: "方括号协议" }, { id: "sbq", name: "SBQ 心率" }]

// 终端下拉框
<select>
  {protocols.map(p => <option value={p.id}>{p.name}</option>)}
</select>
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

## 三、四根柱子的连接关系

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
PreferenceService（现状）→ 拆分为：
  ├── ConfigurationService   → 所有设置类数据的读写（替代 Prefs.preferences）
  ├── LayoutService          → 标签页布局持久化（替代 Prefs.layout）
  └── PluginStateService     → 插件状态（disabledPlugins, iconOrder 等——已经直接在 Prefs 里）
```

### 4.2 终端设置迁移

```
旧：terminalPrefs = { timestampFormat, showEcho, ... }  ← 在 React Context 里
新：terminal/plugin.json 声明 configuration
   → ConfigurationRegistry 注册
   → TerminalView 里用 useConfiguration("terminal.timestampFormat")
   → 终端侧栏直接用 Settings Editor 渲染，不再手写 settings UI
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

---

## 六、Phase 6 的图景

Phase 5 建好基础设施后，Phase 6 就是**在基础设施上写功能**：

```
Phase 6 — 卡片工作台 + 数据管道
  ├── 工作台插件（所有能力来自 Phase 5）
  │   ├── commands: "workspace.newCard", "workspace.export"... → 命令面板 + 右键
  │   ├── configuration: "workspace.gridSize", "workspace.snapToGrid"... → Settings Editor
  │   └── menus: "cardContext" 菜单项
  ├── CardRegistry（Phase 5 留的骨架）→ 卡片渲染
  └── ProtocolRegistry（Phase 5 建的）→ 协议选择下拉框 + 数据路由
```

**不需要改任何基础设施代码。** 只是在 registry 上注册新东西。
