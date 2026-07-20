# Phase 4 → Phase 5 断层分析

> 2026-07-20。Phase 4 的代码做了一些假设，Phase 5 会打破它们。
> 本文标注每一处冲突 + 迁移路径 + 实施顺序。
> **目的：** Phase 5 实施时不重演 Phase 3→4 的归一化灾难。

---

## 断层总览

```
Phase 4 假设                              Phase 5 现实                    冲突级别
────────────────────────────────────────────────────────────────────────────────
PreferenceService 是唯一配置入口           ConfigurationService 替代它         🔴 高
TerminalPrefsContext (React Context)       useConfiguration() hook              🔴 高
TerminalSidebar 手写表单                   Settings Editor 自动渲染             🟡 中
CommandPalette 硬编码在 TerminalView       CommandPalette 读 CommandRegistry      🟡 中
右键菜单硬编码在 TerminalView              MenuService.getMenuItems()            🟡 中
SerialContext (React Context)              CoreEvents (框架级 EventBus)          🟡 中
quickSends 存在全局 Prefs                  PluginStateService 每个插件私有       🟢 低
iconOrder 存在全局 Prefs                   保持不变（UI 布局规则，不是设置）      🟢 低
终端 settings 和 plugin.json 无关          终端 plugin.json 声明 configuration   🟡 中
```

---

## 1. PreferenceService → ConfigurationService（🔴 高）

### 当前代码分布

```
PreferenceService.loadPrefs() / savePrefs() 被 4 个文件调用：
  App.tsx           — theme、language、terminalPrefs、layout、lastPort
  IconBar.tsx       — iconOrder
  loader.ts         — disabledPlugins
  TerminalView.tsx  — quickSends（间接通过 TerminalPrefsContext）
```

### Phase 5 后的目标

```
ConfigurationService.get("terminal.timestampFormat")  ← 替代 Prefs.preferences.*
ConfigurationService.get("app.theme")                   ← 替代 Prefs.theme
LayoutService.save(layout)                              ← 替代 Prefs.layout
PluginStateService.get("terminal", "quickSends")        ← 替代 Prefs.quickSends
PluginStateService.get("core", "iconOrder")              ← 替代 Prefs.iconOrder
PluginStateService.get("core", "disabledPlugins")        ← 替代 Prefs.disabledPlugins
```

### 迁移顺序（关键——不能一次性全换）

**第 1 步：** ConfigurationService 内部先包装 PreferenceService
```typescript
// ConfigurationService 初始化时读 PreferenceService 的旧 prefs
// get() 优先读 settings.json，fallback 读 Prefs.preferences
// 这样迁移期间两边都能工作
```

**第 2 步：** 逐个迁移 consumer
```
顺序：
  1. app.theme / app.language（最简单，只是读一个值）
  2. terminal.*（终端的所有设置项）
  3. 其他全局设置（lastPort 等）
```

**第 3 步：** 删除 PreferenceService 旧的 preferences 字段

### ⚠️ 关键约束

**迁移期间 App.tsx 的 `terminalPrefs` state 不能突然消失。** TerminalView 用了 `useTerminalPrefs()` hook，这个 hook 要改为内部调 `useConfiguration()`，但对外接口不变——过渡期零破坏。

---

## 2. TerminalPrefsContext → useConfiguration()（🔴 高）

### 当前

```typescript
// App.tsx
<TerminalPrefsContext.Provider value={{ prefs: terminalPrefs, setPrefs: setTerminalPrefs }}>
  <MainContent />  ← TerminalView 用 useTerminalPrefs() 读
</TerminalPrefsContext.Provider>
```

### Phase 5 后

```typescript
// TerminalView 里
const [timestampFormat, setTimestampFormat] = useConfiguration("terminal.timestampFormat")
// 不再需要 TerminalPrefsContext.Provider
```

### 迁移方案

**不删 TerminalPrefsContext。** 改为：
```typescript
// TerminalPrefsContext.ts 内部改为
export function useTerminalPrefs() {
  const [ts, setTs] = useConfiguration("terminal.timestampFormat")
  const [echo, setEcho] = useConfiguration("terminal.showEcho")
  // ... 所有终端设置项
  return { prefs: { timestampFormat: ts, showEcho: echo, ... }, setPrefs }
}
```
外部调用方（TerminalView、TerminalSidebar）不改一行代码。内部实现从 Prefs 切换到 ConfigurationService。

---

## 3. TerminalSidebar → Settings Editor（🟡 中）

### 当前

```
TerminalSidebar.tsx（85 行）：
  .setting-group × 3（显示 / 发送 / 编码）
  Toggle / Select / FormRow 手写表单
```

### Phase 5 后

```
Settings Editor 读 terminal/plugin.json 的 contributes.configuration
  → 自动生成左侧树"终端"分组
  → 自动生成右侧表单（时间戳下拉 + 回显开关 + 行号开关 + ...）
  → TerminalSidebar.tsx 可以删除
```

### 迁移方案

**先让两者共存。** 建 Settings Editor 的同时保留 TerminalSidebar。验证 Settings Editor 渲染正确后，切 TerminalView 的侧栏指向 Settings Editor。
TerminalSidebar.tsx 变为弃用——不删，但不再调用。

---

## 4. CommandPalette 硬编码 → CommandRegistry（🟡 中）

### 当前

```typescript
// TerminalView.tsx
const paletteCommands = [
  { id: "clear", label: "清空接收区", action: handleClear },
  { id: "pause", label: "暂停接收", action: handlePause },
  { id: "export", label: "导出日志", action: handleExport },
  // ... 7 个硬编码命令
]
<CommandPalette commands={paletteCommands} />
```

### Phase 5 后

```typescript
// terminal/plugin.json
{ "contributes": { "commands": [
  { "id": "terminal.clear", "title": "清空接收区" },
  { "id": "terminal.pause", "title": "暂停接收" },
]}}

// CommandPalette 改为
const commands = CommandRegistry.getAll()  // 从所有插件 + 核心收集
<CommandPalette commands={commands} />
```

### 迁移方案

1. 建 CommandRegistry（核心注册 + 插件注册）
2. 终端 7 个命令注册到 CommandRegistry（`registerCommand` 调同 handler）
3. CommandPalette 改为从 CommandRegistry 读取
4. TerminalView 删 `paletteCommands` 数组

---

## 5. 右键菜单 → MenuService（🟡 中）

### 当前

```typescript
// TerminalView.tsx
<ReceiveContextMenu
  paused={paused}
  onCopy={...} onSelectAll={...} onClear={...} onTogglePause={...}
/>
// 硬编码的菜单项
```

### Phase 5 后

```typescript
const items = MenuService.getMenuItems(MenuId.EditorContext, { pluginId: "terminal" })
<ContextMenu items={items} />  // 通用右键菜单组件，消费 MenuService
```

### 迁移方案

1. 建 MenuService + 核心注册（关闭、关闭其他、分屏等内置项）
2. 通用 `<ContextMenu>` 组件（消费 MenuService）
3. TerminalView 的 `<ReceiveContextMenu>` 改为 `<ContextMenu menuId="editorContext">`
4. 终端插件注册自己的菜单项（清空/暂停/导出 → `contributes.menus.editorContext`）

---

## 6. SerialContext → CoreEvents（🟡 中）

### 当前

```typescript
// 只能用 React Context——只有 React 组件在 Provider 内才能读
const { state: { isOpen, portName } } = useSerialContext()
```

### Phase 5 后

```typescript
// 任何地方（React 组件、协议解析器、数据源、普通函数）都能订阅
CoreEvents.onDidChangePortState.on(({ isOpen, portName }) => { ... })
```

### 迁移方案

**两者共存——不是替代关系。**
- SerialContext 保留给 React 组件用（不改 TerminalToolbar、TerminalStatusBar 等）
- CoreEvents 作为底层事件总线，SerialContext 的 Provider 内部订阅 CoreEvents 来同步状态
- 非 React 插件用 CoreEvents，React 组件继续用 SerialContext（或两者都可用）

顺序：
1. 建 CoreEvents
2. SerialContext.Provider 订阅 CoreEvents → setState
3. Non-React consumers 直接订阅 CoreEvents
4. 不删 SerialContext——它是 React 友好的封装

---

## 7. quickSends → PluginStateService（🟢 低）

### 当前

```typescript
// PreferenceService
export interface Prefs {
  quickSends: Record<string, string>  // 全局：{ "AT": "AT\r\n", "查询WiFi": "AT+CWLAP\r\n" }
}
```

### Phase 5 后

```typescript
PluginStateService.get("terminal", "quickSends")  // → { "AT": "AT\r\n", ... }
PluginStateService.set("terminal", "quickSends", { ... })
```

### 迁移方案

低优先级——不是基础设施。Phase 5 可以不做，TerminalView 继续用 PreferenceService 读写 quickSends。等 PluginStateService 建好后迁移。

---

## 8. 终端 plugin.json 改造（🟡 中）

### 当前

```json
// terminal/plugin.json —— Phase 4 格式（声明字段在顶层）
{
  "name": "终端",
  "entry": "index.tsx",
  "sidebar": "sidebar.tsx",
  "statusBar": [...],
  "tabBehavior": { "confirmOnClose": "..." }
}
```

### Phase 5 后

```json
// 新增 contributes 段——和原有顶层字段共存
{
  "name": "终端",
  "entry": "index.tsx",
  "sidebar": "sidebar.tsx",
  "statusBar": [...],
  "tabBehavior": { "confirmOnClose": "..." },
  
  // Phase 5 新增
  "contributes": {
    "commands": [
      { "id": "terminal.clear", "title": "清空接收区" },
      { "id": "terminal.pause", "title": "暂停接收" },
      { "id": "terminal.export", "title": "导出日志" },
      { "id": "terminal.search", "title": "搜索" },
      { "id": "terminal.hexMode", "title": "切换 HEX 模式" },
      { "id": "terminal.echo", "title": "切换消息回显" },
      { "id": "terminal.lineNumbers", "title": "切换行号" }
    ],
    "menus": {
      "editorContext": [
        { "command": "terminal.clear" },
        { "command": "terminal.pause" },
        { "command": "terminal.export" }
      ]
    },
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
        },
        "terminal.showLineNumbers": {
          "type": "boolean",
          "default": true,
          "description": "显示行号"
        },
        "terminal.separateSystemLog": {
          "type": "boolean",
          "default": true,
          "description": "系统消息独立显示"
        },
        "terminal.lineEnding": {
          "type": "string",
          "default": "\r\n",
          "enum": ["\\r\\n", "\\n", "\\r"],
          "description": "发送换行符"
        },
        "terminal.autoRepeat": {
          "type": "boolean",
          "default": false,
          "description": "定时发送"
        },
        "terminal.repeatInterval": {
          "type": "number",
          "default": 1000,
          "description": "定时发送间隔 (ms)"
        },
        "terminal.autoClear": {
          "type": "boolean",
          "default": false,
          "description": "发送后清空发送区"
        },
        "terminal.receiveMode": {
          "type": "string",
          "default": "text",
          "enum": ["text", "hex"],
          "description": "接收模式"
        },
        "terminal.receiveCoding": {
          "type": "string",
          "default": "UTF-8",
          "enum": ["UTF-8", "GBK", "ASCII", "Latin-1"],
          "description": "接收编码"
        },
        "terminal.sendMode": {
          "type": "string",
          "default": "text",
          "enum": ["text", "hex"],
          "description": "发送模式"
        },
        "terminal.sendCoding": {
          "type": "string",
          "default": "UTF-8",
          "enum": ["UTF-8", "GBK", "ASCII", "Latin-1"],
          "description": "发送编码"
        }
      }
    }
  }
}
```

### 迁移方案

**原有顶层字段不动——它们是 Phase 4 的 API，loader 已经认得。**
`contributes` 段是新增的，和原有字段共存。
- `entry` / `sidebar` / `statusBar` → 原样保留，loader 检测机制不变
- `contributes.commands` → CommandRegistry 读取
- `contributes.menus` → MenuRegistry 读取
- `contributes.configuration` → ConfigurationRegistry 读取

---

## 实施顺序（关键——避免回归）

```
Step 1：建核心基础设施（零破坏——只加不删）
  ├── EventBus（CoreEvents）        ← ~80 行，独立模块
  ├── PluginStateService            ← ~60 行，独立模块
  ├── CancellationToken             ← ~20 行，独立模块
  └── CommandRegistry（骨架）       ← 先建注册表，不接 CommandPalette

Step 2：接消费端（逐个替换，每个可验证）
  ├── ConfigurationService（先包 PreferenceService，共存）
  ├── CommandRegistry → CommandPalette（先只加终端 7 个命令，旧 paletteCommands 保留）
  ├── MenuService → 终端右键菜单（新 ContextMenu 组件 + 旧 ReceiveContextMenu 保留）
  └── Settings Editor（先只渲染终端分组，TerminalSidebar 保留）

Step 3：迁移终端（唯一实体插件验证）
  ├── terminal/plugin.json 加 contributes 段
  ├── TerminalPrefsContext 内部切换到 useConfiguration
  ├── CommandPalette 切到 CommandRegistry（删旧 paletteCommands）
  ├── 右键菜单切到 MenuService（删旧 ReceiveContextMenu）
  └── Settings Editor 替代 TerminalSidebar

Step 4：清理
  ├── 删 PreferenceService 旧 preferences 字段
  ├── 删 TerminalPrefsContext.Provider
  └── 删硬编码的 paletteCommands、ReceiveContextMenu
```

**核心原则：每一步都先加新的，验证通过后再删旧的。绝不同时删旧加新。**
