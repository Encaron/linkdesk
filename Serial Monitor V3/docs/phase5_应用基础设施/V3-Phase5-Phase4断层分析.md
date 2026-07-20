# Phase 4 → Phase 5 断层分析

> 2026-07-20。
> Phase 5 是在 Phase 4 做完后才想到要调整的，所以 Phase 4 的代码有一些"假设"——这些假设在 Phase 4 是对的，但在 Phase 5 会被推翻。
> 这份文档标注每一处断层，让实施的人（人也好 AI 也好）知道：
> **这儿看似没问题，但其实后面要变——现在别写死。**

---

## 1. 全局配置对象（PreferenceService）→ 插件各自声明配置

### 原因

Phase 4 没有配置系统。所有"设置"都塞进一个大 JSON 对象 `PreferenceService.preferences`。因为那时候只有终端有设置，所以「设置 = 终端的设置」。

### 后果

如果不改，Phase 6 卡片插件也有设置（网格大小、吸附开关），Phase 7 OLED 也有设置——全部都要往这个全局对象里塞。和 V2.3→V2.5 一模一样：每次新加一个功能，就要修改这个全局配置的结构体。

### 怎么办

Phase 5 建 ConfigurationService。插件在 `plugin.json` 里声明自己有哪些设置项，Settings Editor 自动渲染。终端原有的设置值迁移过去，配置文件从 `prefs.json` 变为 `settings.json`。**迁移期间新老系统共存——ConfigurationService 内部先包 PreferenceService，逐个迁移 consumer。**

---

## 2. 终端设置用 React Context 传递 → 改用配置 Hook

### 原因

Phase 4 里终端设置通过 `<TerminalPrefsContext.Provider>` 在 React 组件树里传。这是 React 的标准做法——组件在 Provider 里才能读设置。但它的前提是："设置只有终端有，而且只用 React Context 传就够"。

### 后果

Phase 5 有了 `useConfiguration()` hook 之后，TerminalPrefsContext 变成多余的一层。更严重的是：非 React 组件（协议解析器、数据源）根本用不了 React Context——它们读不到任何配置。

### 怎么办

**不删 TerminalPrefsContext**。改它的内部实现：从读 PreferenceService 改为调 `useConfiguration()`。对外接口不变（TerminalView、TerminalSidebar 不改代码）。等 Settings Editor 替代 TerminalSidebar 后，整个 Context 可以退休。

---

## 3. 终端侧栏是手写表单 → Settings Editor 自动生成

### 原因

Phase 4 的 `TerminalSidebar.tsx` 是手工搭建的——每一行配置项都是手写的 `<Toggle>` / `<Select>` / `<FormRow>`。因为那时候只有终端一个插件有设置，手写 85 行代码是最快的做法。

### 后果

Phase 6 卡片插件需要自己的设置界面、Phase 7 OLED 又需要——如果继续手写，每个插件都要写一个自己的设置表单。而且除了插件作者，谁也不知道某个插件有哪些设置项。AI 更不可能知道——设置项藏在代码里，不是数据。

### 怎么办

Phase 5 建 Settings Editor——它是一个通用表单引擎，读 `plugin.json` 里的 `contributes.configuration`，自动生成表单。TerminalSidebar 暂时保留，等 Settings Editor 稳定后切过去。

---

## 4. 命令面板的命令是硬编码数组 → CommandRegistry 统一收集

### 原因

Phase 4 的 CommandPalette 是终端视图内部的一个组件。它的命令列表是 TerminalView 里的一个硬编码数组：
```
"清空接收区" → handleClear
"暂停接收" → handlePause
...
```
因为那时候终端是唯一的实体插件，命令就等于是终端的命令。

### 后果

Phase 5 有了 CommandRegistry——插件可以在 `plugin.json` 里声明自己的命令。但 CommandPalette 还在读 TerminalView 里的硬编码数组。其他插件的命令（工作台的"新卡片"、文档阅读器的"打开预览"）都无法出现在命令面板里。

### 怎么办

Phase 5 把 CommandPalette 改为从 CommandRegistry 读取命令列表。终端的 7 个现有命令注册到 CommandRegistry，然后删掉 TerminalView 里的硬编码数组。

---

## 5. 右键菜单是硬编码组件 → MenuService 动态生成

### 原因

Phase 4 的终端右键菜单是 TerminalView 里的 `<ReceiveContextMenu>` 组件——四个按钮（复制/全选/清空/暂停）写死在 JSX 里。因为只有终端有右键菜单。

### 后果

Phase 5 有了 MenuService——插件声明菜单项，右键自动出现。但终端的右键还是硬编码的 `<ReceiveContextMenu>`。其他标签页（工作台、文档阅读器）右键没反应——因为没有人给它们写菜单组件。

### 怎么办

Phase 5 建通用的 `<ContextMenu>` 组件——从 MenuService 读当前右键位置（MenuId）和上下文，动态生成菜单项。终端插件的菜单项声明在 plugin.json 里，核心的内置项（关闭、分屏）也注册到 MenuService。

---

## 6. 串口状态用 React Context 传 → 加框架级事件总线

### 原因

Phase 4 的串口状态（是否打开、端口名、波特率）通过 `<SerialContext.Provider>` 传递。React 组件用 `useSerialContext()` 读取。这是 React 的标准做法。

### 后果

非 React 插件（协议解析器、数据源）根本用不了 `useSerialContext()`——它们是纯函数，不在 React 组件树里。一个 SBQ 协议解析器想知道"串口开了没"，做不到。

### 怎么办

**两者共存，不是替代。** 建 CoreEvents 事件总线，串口状态变化时发射事件。SerialContext 的 Provider 内部订阅 CoreEvents 来同步状态（React 组件继续用 SerialContext 不变）。非 React 插件直接订阅 CoreEvents。不删 SerialContext——它是 React 友好的封装层。

---

## 7. 快捷发送存在全局配置里 → 插件各自的私有存储

### 原因

Phase 4 的快捷发送（AT 命令、AT+CWLAP 等预设按钮）存在 `PreferenceService.quickSends` 里。因为它是"终端的配置"，而终端配置 = 全局配置。

### 后果

这个后果不严重——只是一个数据归属的问题。快捷发送是终端的私有数据，不是全局设置。放在全局 Prefs 里会让配置文件变乱（未来 10 个插件都有私有数据时更严重）。

### 怎么办

Phase 5 建 PluginStateService——每个插件有自己的 key-value 存储（底层在 `settings.json` 的 `pluginStates` 段）。快捷发送迁移到 `PluginStateService.set("terminal", "quickSends", data)`。低优先级，不影响 Phase 5 核心功能。

---

## 8. 终端 plugin.json 没有声明配置/命令/菜单 → 加 contributes 段

### 原因

Phase 4 的 `plugin.json` 格式是 Phase 4 设计的，那时候不需要命令、配置、菜单。字段是平铺的：`entry`、`sidebar`、`statusBar`、`tabBehavior`。

### 后果

Phase 5 新增的 CommandRegistry、ConfigurationRegistry、MenuRegistry 都需要从 `plugin.json` 读数据。如果新字段的格式和原有字段冲突，解析会出错。

### 怎么办

**原有字段不动，新增 `contributes` 段。**
```json
{
  "name": "终端",
  "entry": "index.tsx",        ← 不变
  "sidebar": "sidebar.tsx",    ← 不变
  "statusBar": [...],          ← 不变
  
  "contributes": {              ← Phase 5 新增
    "commands": [...],
    "menus": {...},
    "configuration": {...}
  }
}
```
两条线互不干扰。loader 原有检测逻辑（检测 `entry` / `mode` / `themes`）不动，新加对 `contributes` 的解析。

---

## 实施顺序

共 4 步。每一步都**先加新的，验证通过后再删旧的**：

```
第 1 步：建基础设施（不删任何旧代码）
  ├── CoreEvents（事件总线）       ← 独立模块，不影响现有代码
  ├── PluginStateService          ← 独立模块
  ├── CancellationToken           ← 独立模块
  └── CommandRegistry（骨架）     ← 先建注册表，不接通

第 2 步：逐个接消费端
  ├── ConfigurationService        ← 内部包 PreferenceService，共存
  ├── CommandRegistry → CommandPalette  ← 终端的 7 个命令先注册
  ├── MenuService → 终端右键      ← 新 ContextMenu + 旧 ReceiveContextMenu 共存
  └── Settings Editor             ← 先渲染终端分组，TerminalSidebar 保留

第 3 步：迁移终端（唯一实体插件做验证）
  ├── terminal/plugin.json 加 contributes 段
  ├── TerminalPrefsContext 内部切到 useConfiguration
  ├── CommandPalette 切到 CommandRegistry
  ├── 右键菜单切到 MenuService
  └── Settings Editor 替代 TerminalSidebar

第 4 步：清理旧代码
  ├── 删 TerminalView 里的 paletteCommands 数组
  ├── 删 TerminalView 里的 ReceiveContextMenu 组件
  ├── 删 PreferenceService 旧的 preferences 字段
  └── 删 TerminalPrefsContext.Provider（如果不再需要）
```

**为什么这个顺序：** 每个 Step 都产出可运行的软件。每一步验证通过才做下一步。不会出现"改了一半，软件跑不起来"——因为旧的始终在，直到新的确认 OK 才切。
