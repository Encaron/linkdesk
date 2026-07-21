# Phase 5g — 类型系统去硬编码：深度分析

> 2026-07-21。
> Phase 5g 是整个 Phase 5 中最特殊的一个批次——它不建新设施，而是拆掉 Phase 3 留下的最后一道围墙。
> 这道围墙在 Phase 3 是必要的保护，在 Phase 4 变成了不便，在 Phase 5 变成了束缚。
> 拆掉它之后，插件才真正获得了"不需要核心知道我是谁"的自由。
> 但拆墙也有代价——失去编译期穷举检查、失去"改一个类型名 IDE 就告诉我所有引用"的安全感。
> 这份文档把来龙去脉、每一处硬编码的根因、VS Code 的做法、以及利弊权衡全部说清楚。

---

## 〇、一句话总结

**Phase 3 把插件 ID 写死在类型系统里——因为那时候插件 = 手写的几个视图，union type 是最佳选择。Phase 5 插件系统建好了，但类型系统还在用 Phase 3 的假设。5g 把类型系统从"核心知道所有插件"改为"核心只知道有插件这个概念，具体是谁由 plugin.json 说"。**

---

## 一、来龙去脉——为什么会有这些东西

### 1.1 Phase 3：类型系统是正确的

2026 年 7 月初，Phase 3 建标签页+分屏系统。那时候整个软件只有 5 种标签页：

```
终端 | 工作台 | 设置 | 插件市场 | 欢迎页
```

没有插件系统。每个标签页类型都是手写的 React 组件，通过 `switch(tab.type)` 来路由渲染。

**当时的代码——完全合理的做法：**

```typescript
// useTabManager.ts:26
export type TabType = "terminal" | "workspace" | "oled" | "settings"
                    | "editor" | "welcome" | "plugin-detail" | "marketplace";

// tabIdentity.ts:38-55 —— 每种类型一行，所有行为写在一起
const TAB_IDENTITY: Record<string, TabIdentityMeta> = {
  terminal:    { singleton: false, confirmOnClose: "...", ... },
  workspace:   { singleton: false, identityField: "workspaceName", ... },
  settings:    { singleton: true, ... },
  marketplace: { singleton: true, ... },
  "plugin-detail": { ... },
  welcome:     { isFallback: true, ... },
  oled:        { ... },
  editor:      { ... },
};
```

**这在 Phase 3 是完全正确的设计：**
- TypeScript 穷举检查——`switch(tab.type)` 漏一个分支 IDE 就标红
- `TAB_IDENTITY` 是一张集中的元数据表——每种类型的行为一目了然
- 类型联合 = 编译期安全网——改一个 type 名，所有引用自动标红

**当时的约束：每加一个新标签页类型，改 3 处：**
1. `TabType` 联合类型加一个字面量
2. `TAB_IDENTITY` 表加一行
3. `renderTabContent` switch 加一个 case

这 3 处在代码上很近，而且当时标签页类型很少变化——可以接受。

### 1.2 Phase 4：插件来了，但类型没改

Phase 4 建了插件系统。`terminal` 从"手写的核心视图"变成了"一个安装在 `plugins/` 下的插件"。但 `TabType` 联合类型没变——因为：

1. **已有插件数量确定。** 就 4 个：terminal / workspace / settings / marketplace。加上欢迎页和 OLED 预留，正好 8 个。全在 union 里。
2. **Phase 4 的首要任务是"让插件能被加载"。** 类型系统的灵活化是 polish，不是 blocker。
3. **改类型系统风险大。** `TabType` 被 10+ 个文件引用。Phase 4 的 loader/viewRegistry/IconBar 全是新建的，不想再加一个"改类型"的变量。

**Phase 4 做了一个妥协——`legacyPluginId` 映射：**

```typescript
// tabIdentity.ts:39
terminal: { ..., legacyPluginId: "terminal" },
// 旧布局 JSON 不含 pluginId——用 type 反查
```

这允许 Phase 4 的 loader 用 `pluginId` 来识别插件，但旧的 `TabType` union 继续工作。两套系统并存——`pluginId` 是新的动态世界，`TabType` 是旧的静态世界。它们在"terminal = terminal"这个巧合下相安无事。

### 1.3 Phase 5a-5e：基础设施全建好了，类型还在 Phase 3

Phase 5 建了命令系统、配置系统、菜单系统、context key、协议下拉框——**每一个都是声明驱动的**。插件在 `plugin.json` 里声明自己能做什么，核心不再 switch 插件 ID。

但 `TabType` 还是那个 union。问题变尖锐了：

```
命令系统：plugin.json 声明 → CommandRegistry 动态收集 ✅
配置系统：plugin.json 声明 → ConfigurationRegistry 动态收集 ✅
菜单系统：plugin.json 声明 → MenuService 动态收集 ✅
协议系统：plugin.json 声明 → ProtocolRegistry 动态收集 ✅

类型系统：useTabManager.ts:26 —— 8 个硬编码字面量 ❌
```

**Phase 5 的所有 Registry 都说"我不知道有哪些插件"——唯独类型系统还在说"我知道——就这 8 个"。**

这就是 5g 要拆的墙。

### 1.4 为什么到 5g 才拆——不是忘了，是等前置条件

拆类型系统不是孤立操作。它被放在 5f 之后，因为：

1. **5f 先拆终端专用通道。** App.tsx 里 `setPluginStateValue("terminal", ...)` 和 `setConfigurationValue("terminal.timestampFormat", ...)` 这种硬编码——必须在类型系统松绑之前清干净。否则 `TabType` 改成 `string` 后，`"terminal"` 这个字符串出现在 App.tsx 里就再也找不到是谁写的了。

2. **5a-5e 验证了声明驱动模型的可行性。** 如果连命令/配置/菜单都没跑通，贸然把类型系统打开 = 自毁安全网。

3. **5g 之后紧接着 5h（运行时动态加载）。** 类型系统打开 + 加载系统动态化 = 新插件从磁盘 → 被加载 → 获得完整身份，全链路零硬编码。

**链路逻辑：**
```
5f：拆终端专用通道（核心不再知道"terminal"这个具体插件）
  ↓
5g：拆类型硬编码（核心不再知道"一共有哪些插件"）
  ↓
5h：拆 import.meta.glob（核心不再在构建时就决定"加载哪些插件"）
  ↓
5.5：viewRole 声明（核心不再决定"插件怎么和壳交互"）
```

**5f→5g→5h→5.5 是一条线：每一步都在把"核心知道的东西"往外剥。** 剥到 Phase 6，核心只剩一件事：提供 Registry + 渲染壳。所有内容——视图、命令、配置、菜单、主题、语言、协议——全是插件声明的。

---

## 二、每一处硬编码——在哪、为什么在那、怎么改

### 2.1 `TabType` 联合类型 → `string`

**位置：** [useTabManager.ts:26](Serial Monitor V3/src/hooks/useTabManager.ts#L26)

```typescript
// 现在（Phase 3 遗留）：
export type TabType = "terminal" | "workspace" | "oled" | "settings"
                    | "editor" | "welcome" | "plugin-detail" | "marketplace";

// 5g 之后：
export type TabType = string;
```

**为什么在这：** Phase 3 标签页系统刚建好时，类型联合是最好的方式。TypeScript 的 exhaustiveness check 确保 `switch(tab.type)` 不遗漏任何类型。

**不改会怎样：** 每加一个新插件 → 必须改这行 → git 冲突 + 需要改核心代码。AI 写插件时不知道要改 `useTabManager.ts`。

**改后会怎样（利）：** 任何插件都可以定义自己的 type。核心零改动。

**改后会怎样（弊）：** TypeScript 不再能检查 `switch(tab.type)` 的穷举性。如果某处代码真的需要为每种类型做不同处理（如 `renderTabContent`），漏了一种不会编译报错——运行时才能发现。

**缓解措施：** `renderTabContent` 本身已经是 fallthrough→兜底的模式（找不到插件就显示错误信息）。不是每个 `switch(tab.type)` 都需要穷举。

### 2.2 `TAB_IDENTITY` 硬编码表 → viewRegistry + plugin.json 推导

**位置：** [tabIdentity.ts:38-55](Serial Monitor V3/src/hooks/tabIdentity.ts#L38)

```typescript
// 现在：
const TAB_IDENTITY: Record<string, TabIdentityMeta> = {
  terminal:    { singleton: false, confirmOnClose: "...", ... },
  workspace:   { singleton: false, ... },
  settings:    { singleton: true, ... },
  // ... 8 行
};
```

**为什么在这：** Phase 3 时每种标签页类型的身份逻辑（单例？可关闭？身份字段？）需要一张集中表。这也是合理的——当时标签页类型是代码的一部分。

**但在 Phase 4 已经重复了：** `plugin.json` 里已经有 `tabBehavior`：

```json
// plugins/terminal/plugin.json
{ "tabBehavior": { "singleton": false, "confirmOnClose": "关闭此标签页将断开串口连接" } }
```

**两张表说同一件事：** `TAB_IDENTITY` 表和 `plugin.json tabBehavior` 描述的是同一组属性。如果 plugin.json 改成 singleton: true，但 TAB_IDENTITY 没改——行为不一致，难以调试。

**不改会怎样：** 每个新插件都要在 `TAB_IDENTITY` 加一行。而且终端插件改名（`"terminal"` → `"serial-monitor"`）时，两处都要改。

**怎么改：**
```
TAB_IDENTITY 表的 singleton / confirmOnClose / isFallback / fallbackLabel:
  → 从 viewRegistry.getViewPlugin(pluginId)?.manifest.tabBehavior 动态读取
  → 没有 tabBehavior → 走默认值（singleton: false, 无 confirmOnClose）

TAB_IDENTITY 只保留纯标签页逻辑：
  → identityField（身份字段——每个标签页身份由哪个字段决定）
  → generateId（生成标签页唯一 ID 的策略）
  
  这两个是标签页系统的内部逻辑，和插件无关——不是"插件声明自己是什么"，
  而是"标签页系统用什么字段区分两个标签页是否相同"。
```

### 2.3 `isShellRenderedTab` / `isSidebarOnlyView` / `shouldKeepSidebarOnFocus` → plugin.json 字段

**位置：** [tabIdentity.ts:162-175](Serial Monitor V3/src/hooks/tabIdentity.ts#L162)

```typescript
// 现在——三个判断函数，每个都硬编码了特定插件 ID：
export function isShellRenderedTab(type: string): boolean {
  return type === "plugin-detail" || type === "welcome";
}
export function isSidebarOnlyView(pluginId: string): boolean {
  return pluginId === "marketplace";
}
export function shouldKeepSidebarOnFocus(tab: { type: string }): boolean {
  return tab.type === "plugin-detail";
}
```

**为什么在这：** Phase 3 时这几个特殊行为确实是个例。欢迎页和插件详情页是壳自己渲染的（不是插件视图）。marketplace 是唯一"纯侧栏"的视图。plugin-detail 聚焦时不需清除侧栏。

**不改会怎样：** 这就是 V2.6 模式的最典型症状——每次有插件需要特殊行为，就在这些函数里加一行 `|| pluginId === "xxx"`。10 个插件后变成一长串硬编码。

**怎么改：** 特殊行为用 plugin.json 字段声明：

```json
// plugins/welcome/plugin.json — 壳渲染，不走插件路由
{ "shellRendered": true }

// plugins/marketplace/plugin.json — 纯侧栏，图标点击不创建标签页
// 注意：5.5 的 viewRole: "sidebarPrimary" 会替代 isSidebarOnlyView
// 5g 先把字段加到 plugin.json，5.5 消费它

// plugins/plugin-detail/plugin.json — 聚焦时保留侧栏
{ "keepSidebarOnFocus": true }
```

**和 5.5 的分工：** `isSidebarOnlyView` 在 5.5 被 `viewRole` 彻底替代。5g 先给 plugin.json 加字段（让新插件能声明），5.5 再让 App.tsx 消费这些字段。两步分开——5g 管数据层，5.5 管交互层。

### 2.4 `BOTTOM_ICONS` 硬编码 Set → plugin.json `iconLocation`

**位置：** [IconBar.tsx:28](Serial Monitor V3/src/components/IconBar.tsx#L28)

```typescript
// 现在：
const BOTTOM_ICONS = new Set(["settings"]);
```

**为什么在这：** Phase 4 时设置是唯一一个固定在底部的图标。对标 VS Code Activity Bar 底部齿轮。当时一个 Set 就够。

**不改会怎样：** 如果市场插件也想放底部（对标 VS Code Extensions 在 Activity Bar 的位置——但 VS Code 是顶部，只有齿轮在底部），或者未来有"账户"插件放底部——每次加一个就要改 `BOTTOM_ICONS` Set。

**怎么改：** plugin.json 加字段：

```json
// plugins/settings/plugin.json
{ "iconLocation": "bottom" }
```

IconBar 渲染时读 `manifest.iconLocation ?? "top"` 来决定分组。

### 2.5 终端插件改名——`"terminal"` → `"serial-monitor"`

**为什么改名：** 当前 `pluginId: "terminal"` 占据了"终端"这个名字。但未来 Phase 8+ 可能引入真终端（PowerShell / Git Bash / WSL 终端）作为视图插件——那时"terminal"这个名字应该给真终端，而不是串口监视器。

**前置依赖：** 5f 拆了 App.tsx 里的 `setConfigurationValue("terminal.timestampFormat", ...)` 等硬编码 + 5g 前两项（类型不再硬编码插件 ID）→ 改名只需要改 `plugins/terminal/` 目录名和 plugin.json 里的 id 字段。不会出现"改了 pluginId 但某处代码还在用字符串 `"terminal"` 找东西"。

**注意——这不是 5g 的交付物，是 5g 验证项：** "如果把 terminal 改名，软件还能跑吗？"如果答案是"需要改 8 个文件"，说明 5g 前 6 项没做完。

### 2.6 `coreCommands.ts` 硬编码 pluginId

**位置：** [coreCommands.ts:48](Serial Monitor V3/src/core/coreCommands.ts#L48)

```typescript
// 现在：
window.dispatchEvent(new CustomEvent("v3-open-view", {
  detail: { pluginId: "settings", asSidebar: true }
}));
```

**为什么在这：** "打开设置"是核心内置命令。但"设置"本身是一个插件。如果用户卸载了设置插件（虽然它标记为 core），这个命令会指向一个不存在的 pluginId。

**怎么改：** 从 viewRegistry 动态查找——找 `viewRole: "tabOnly"` 且 `core: true` 的插件（对标 VS Code 的 Settings Editor 是内置的）。或者更简单：给 core 命令一个参数化方式——不写死 `pluginId: "settings"`，而是通过配置或注册表查找。

### 2.7 `workspace.schema.json` enum → 接受任意字符串

**位置：** [workspace.schema.json:19](Serial Monitor V3/public/schemas/workspace.schema.json#L19)

```json
// 现在：
"type": { "enum": ["terminal", "workspace", "settings", "marketplace", ...] }

// 5g 后：
"type": { "type": "string" }
```

**不改会怎样：** JSON Schema 的 `enum` 会拒绝任何不在列表中的 type 值。但未来插件的 type 就是它的 pluginId——schema 不可能预知所有 pluginId。

---

## 三、"单线程→多线程"——这个比喻到底在说什么

用户提了一个精辟的比喻：**5g 是把类型系统从"单线程"改成"多线程"。**

### 3.1 比喻的对应关系

| | Union Type（单线程） | Dynamic String（多线程） |
|------|------|------|
| **路径数** | 1 条——8 个已知值排成一列 | N 条——每个插件一条路 |
| **TypeScript 的角色** | 编译期警察——每条路都检查 | 运行时观察者——不检查具体值 |
| **加新路径** | 改核心代码（改 union 定义） | 不改核心（插件声明即可） |
| **安全性** | 编译期保证不漏分支 | 依赖运行时 fallback + 约定 |
| **并发** | 不存在——就一种 type 在跑 | 理论上 N 个插件同时定义新 type |

### 3.2 "单线程"的好处——为什么 Phase 3 用了它

```typescript
function renderTab(tab: Tab) {
  switch (tab.type) {
    case "terminal":     return <TerminalView />;
    case "workspace":    return <WorkspaceView />;
    case "settings":     return <SettingsView />;
    case "marketplace":  return <MarketplaceView />;
    case "welcome":      return <WelcomeView />;
    // 如果漏了一种 → TypeScript 报错
  }
}
```

**编译期保证：** 加一个新类型 → 所有 switch 处 IDE 自动标红 → 绝对不会漏处理。这是 TypeScript 联合类型最强大的能力——discriminated union 的 exhaustiveness checking。

**重构安全：** 把 `"terminal"` 改成 `"serial-terminal"` → 所有引用处 IDE 自动标红 → 双击改名 → 全项目更新。零漏网。

### 3.3 "多线程"的代价——为什么 5g 被放到最后

拆掉 union type 意味着**放弃 TypeScript 的 exhaustiveness check**。这不是语法糖——是安全网的拆除。

```typescript
// 5g 之后：
type TabType = string;

function renderTab(tab: Tab) {
  // tab.type 现在是 string——TypeScript 不知道有哪些可能值
  // switch 不再提供 exhaustiveness check
  // 如果某个插件没注册它的视图组件 → 运行时才知道
}
```

**具体失去的东西：**

1. **编译期穷举检查没了。** `switch(tab.type)` 漏了一种 → 编译不报错 → 运行时用户看到空白或错误。
2. **"Find All References" 不再完整。** 搜 `"terminal"` 字符串引用 → 找不全（因为类型现在是 `string`，IDE 不知道谁在用 `"terminal"`）。
3. **重构工具失效。** 原来 `F2` 重命名 `TabType` 的 `"terminal"` → 全项目更新。现在是纯字符串 → `F2` 只改当前文件。
4. **新 AI 接手时理解成本更高。** 原来打开 `useTabManager.ts:26` 看到 8 个字面量 → 立刻知道"哦，一共就这 8 种标签页"。现在是 `string` → 需要去 `viewRegistry` 或 `plugins/` 目录才能知道有哪些插件。

### 3.4 为什么还是要拆——"单线程"的代价更大

```
不改 5g 的话，加一个新插件的流程：

  ① 写 plugin.json + index.tsx → 放到 plugins/my-plugin/
  ② 改 TabType 联合类型 → 加 "my-plugin"
  ③ 改 TAB_IDENTITY 表 → 加一行
  ④ 改 workspace.schema.json enum → 加 "my-plugin"
  ⑤ 如果插件图标在底部 → 改 BOTTOM_ICONS Set
  ⑥ 如果插件有特殊行为 → 改 isShellRenderedTab / isSidebarOnlyView / shouldKeepSidebarOnFocus
  ⑦ 改 renderTabContent → 加 case "my-plugin"
  
  这 7 步中 ②-⑦ 都是改核心代码。这不是"插件"——这是"在核心里加了新功能"。
```

**VS Code 不加一个 enum 值就能安装新扩展。** V3 的插件系统已经做到了：命令/配置/菜单/协议都是声明驱动的。类型系统是最后一道没拆的墙。

**"多线程"的安全网替代方案：**

| 失去的 | 替代的 |
|--------|--------|
| 编译期穷举检查 | `renderTabContent` 的 fallback → `getViewPlugin(type)` 找不到 → 显示"未知视图类型" |
| "Find All References" | 约定：所有对 pluginId 的判断走 `viewRegistry.getViewPlugin()` 而不是字符串比较 |
| 重构工具 | 约定：改插件 ID = 改 `plugins/<id>/plugin.json` + 目录名。不改代码中的字符串。 |
| 理解成本 | `plugins/` 目录本身就是插件的完整列表。不需要读类型定义。 |

---

## 四、VS Code 对照——它怎么做

### 4.1 VS Code 没有 `EditorType` union

VS Code 支持几十种编辑器：TextEditor、WebviewEditor、NotebookEditor、ExtensionEditor、SettingsEditor、KeybindingEditor、TerminalEditor……没有一个是 union type。

**VS Code 的编辑器识别机制：**

```typescript
// VS Code 源码 src/vs/workbench/common/editor.ts
abstract class EditorInput {
  abstract readonly typeId: string;       // 字符串，不是 enum
  abstract matches(other: EditorInput): boolean;
  abstract getResource(): URI | undefined;
}

// 每个编辑器类型继承 EditorInput
class TextFileEditorInput extends EditorInput {
  override typeId = 'workbench.editors.files.textFileEditorInput';
  override matches(other: EditorInput): boolean {
    return other instanceof TextFileEditorInput
        && this.resource.toString() === other.resource.toString();
  }
}
```

**关键动作：`instanceof` 而不是 `===`。**

- `editor instanceof TextFileEditorInput` —— 检查"你是不是这类编辑器"
- 不是 `editor.type === "text"` —— 不是一个字符串比较

**新编辑器类型 = 新建一个 `EditorInput` 子类。** 不改任何核心文件。不碰任何 enum。

### 4.2 VS Code 的编辑器发现机制

```
扩展声明 contributes.customEditors：
  → 注册 CustomEditorInput 子类
  → 文件打开时：遍历所有注册的编辑器 → editor.matches(resource) → 选第一个匹配的
  → 核心没有"一共有哪些编辑器类型"的列表
```

**LinkDesk 的对标：**

```
插件声明 plugin.json：
  → viewRegistry 注册 ViewPluginEntry
  → 标签页打开时：viewRegistry.getViewPlugin(pluginId) → 拿到组件
  → 核心不关心 pluginId 是什么——只关心 viewRegistry 里有没有
```

### 4.3 VS Code 的 Activity Bar 图标定位

VS Code 的 Activity Bar 图标位置由 `contributes.viewsContainers.activitybar` 决定。没有硬编码的 `BOTTOM_ICONS` Set。

```json
// VS Code package.json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        { "id": "explorer", "title": "Explorer", "icon": "...", "order": 1 },
        { "id": "search", "title": "Search", "icon": "...", "order": 2 }
      ]
    }
  }
}
```

**Settings 齿轮是特殊的——** 它不是通过 `contributes` 注册的，而是 VS Code 内核硬编码的 `activitybar/manage` 图标。但它是一个布局规则（"始终在底部"），不是类型定义（"pluginId === 'settings'"）。

**LinkDesk 的对标：** 5g 把 `BOTTOM_ICONS` Set 改为 `plugin.json` 字段 `iconLocation: "bottom"`。和 VS Code 的区别是 LinkDesk 允许多个底部图标（通过声明），而 VS Code 只有齿轮一个——这是正确的设计偏离：LinkDesk 的硬件调试场景可能有多个"管理类"图标需要放在底部。

### 4.4 VS Code 的经验——为什么他们一开始就没用 enum

VS Code 从 0.1 开始就是 Extension Host 架构——扩展可以定义新的编辑器类型。如果用了 `EditorType` enum，每加一个新编辑器就要改 VS Code 核心代码。**十年的代码库里没有一行 `EditorType = "text" | "settings" | "keybindings" | ...`。**

这不是 VS Code 1.0 才做的。是 0.1 就定下来的。LinkDesk Phase 3 没有插件系统，用 union 是正确的。Phase 5 插件系统就绪了，union 变成束缚——现在拆，和 VS Code 0.1 的设计对齐。

---

## 五、利弊权衡总表

| | Union Type（Phase 3 遗留） | Dynamic String（5g 目标） |
|------|------|------|
| **加新插件** | 改 7 处核心代码 | 不改核心，只写 plugin.json |
| **编译期安全** | ✅ 穷举检查，漏分支 = 编译错 | ❌ 运行时 fallback 兜底 |
| **重构工具** | ✅ F2 改名 → 全项目更新 | ❌ 改 pluginId = 手动检查 |
| **AI 写插件** | ❌ AI 需要知道改 useTabManager.ts | ✅ AI 只需写 plugin.json + 组件 |
| **代码可读性** | ✅ 打开 TabType 看到完整列表 | ⚠️ 需要去 plugins/ 目录查看 |
| **插件改名** | ❌ 改 8 个文件 | ✅ 改目录名 + plugin.json |
| **VS Code 对标** | ❌ VS Code 没有 EditorType union | ✅ 对标 VS Code EditorInput |
| **未来束缚** | ❌ 不改核心 = 加不了新插件类型 | ✅ 核心零改动 |

**结论：编译期安全换来的代价太大了——每个新插件都要改核心。这不是"保护"，是"枷锁"。**

---

## 六、和相邻 Phase 的接口

### 6.1 5g 依赖 5f

5f 清理了以下代码中的 `"terminal"` 硬编码：
- App.tsx `setConfigurationValue("terminal.timestampFormat", ...)` → 5f 迁移到 onApply
- App.tsx `setPluginStateValue("terminal", "lastPort", ...)` → 5f 迁移到插件内部
- ConfigurationService 的 12 个 `terminal.*` 硬编码 fellback → 5f 改为从 plugin.json 提取

**如果 5f 没做，5g 会把"terminal"改成 `string`，但 App.tsx 里仍然有 `setConfigurationValue("terminal.xxx")`——这个字符串现在 TypeScript 不再检查了，出问题更难发现。**

### 6.2 5h 依赖 5g

5h 替换 `import.meta.glob` 为运行时动态加载。新 loader 的核心逻辑：

```typescript
// 5h 的运行时加载器
for (const pluginId of fsInstalled) {
  const manifest = await readPluginJson(pluginId);      // 读 plugin.json
  const entry = await dynamicLoad(`plugin://${pluginId}/index.js`); // 动态加载 JS
  window.__v3_registerPlugin(manifest, entry);          // 注册到核心
}
```

**如果 5g 没做，5h 加载新插件后，`TabType` union 不包含新插件的 type → TypeScript 类型报错 → 加载失败。** 5g 把 `TabType` 改成 `string` 后，5h 加载的任何 pluginId 都是合法的 type。

### 6.3 5.5 依赖 5g

5.5 引入 `viewRole` 字段（`sidebarPrimary` / `tabOnly`，默认 `sidebarPrimary`）。`tabPrimary` 不再需要——终端和所有插件统一为侧栏入口模式。`isSidebarOnlyView` 等硬编码函数被 plugin.json 字段替代。

5g 把"数据在哪"建好了（plugin.json 字段），5.5 把"逻辑怎么用"建好了（App.tsx `viewRole` switch）。

---

## 七、实施策略——先加后删，验证通过再切

遵循 Phase 4→5 断层分析的第 4 步模式"每一步都先加新的，验证通过后再删旧的"：

```
第 1 步：plugin.json 字段先加（不改核心逻辑）
  ├── 5 个现有插件的 plugin.json 加 viewRole / iconLocation / shellRendered / keepSidebarOnFocus
  ├── 字段加了但核心不消费 → 不影响现有行为
  └── 验证：软件正常运行，无回归

第 2 步：建 viewRegistry 查询层
  ├── viewRegistry 新增 getViewRole(pluginId) / getIconLocation(pluginId) / isShellRendered(pluginId)
  ├── 内部先读 plugin.json 字段，没有 → fallback 回旧硬编码
  └── 验证：新查询函数返回值 = 旧硬编码行为

第 3 步：消费端逐个切换
  ├── IconBar.tsx → BOTTOM_ICONS 改为 getIconLocation()
  ├── tabIdentity.ts → isShellRenderedTab / isSidebarOnlyView / shouldKeepSidebarOnFocus 改为读 viewRegistry
  ├── useTabManager.ts → TabType → string
  ├── TAB_IDENTITY → 动态合并 plugin.json tabBehavior + 标签页逻辑字段
  └── 每个消费端切换后 → 验证行为不变

第 4 步：清理旧代码
  ├── 删 BOTTOM_ICONS Set
  ├── 删 isShellRenderedTab / isSidebarOnlyView / shouldKeepSidebarOnFocus（5.5 彻底删 isSidebarOnlyView）
  ├── 删 TAB_IDENTITY 中的 plugin.json 重复字段
  ├── 删 workspace.schema.json enum
  └── 验证：npx tsc --noEmit 零错误 + npx vitest run 全过 + 终端收发正常
```

---

## 八、不做的事——和 5.5 / Phase 6 的边界

| 5g 做 | 5.5 做 | Phase 6 做 |
|--------|--------|-----------|
| `viewRole` 字段加入 plugin.json | App.tsx 消费 `viewRole`，switch 替代 isSidebarOnlyView | 文件树用 `viewRole: "sidebarPrimary"` |
| `iconLocation` 字段加入 plugin.json | — | — |
| `shellRendered` / `keepSidebarOnFocus` 字段加入 plugin.json | — | 新插件声明自己的特殊行为 |
| `TabType` = `string` | — | — |
| `TAB_IDENTITY` 动态化（合并 plugin.json tabBehavior） | — | — |
| workspace.schema.json enum → string | — | — |
| — | 终端侧栏从设置表单改为控制面板 | 终端侧栏的完整交互 |
| — | — | 文件树 / 主题 / 语言 全部声明驱动 |

---

## 九、风险——实话实说

这不是一个零风险的改动。TypeScript 的 discriminated union 是它最强大的功能之一——把它改成 `string` 是反向操作。大部分 TypeScript 项目在**把 `string` 收紧为 union**，LinkDesk 在**把 union 放宽为 `string`**。

**为什么 LinkDesk 逆潮流是正确的：**

1. **插件系统是运行时动态的。** TypeScript 的 union 是编译期静态的。两者根本上冲突。要么放弃动态插件，要么放弃静态 union。LinkDesk 选择了动态插件——这是 V3 的核心价值。

2. **替代安全网已就绪。** Phase 4-5 建了 viewRegistry / CommandRegistry / ConfigurationRegistry 等运行时注册表。`switch(tab.type)` 的 exhaustiveness check 被 `viewRegistry.getViewPlugin(type)` 的运行时查找替代。

3. **VS Code 没有 union type 仍然稳定运行了十年。** 这不是理论推断——是已验证的实践。

4. **Phase 5 是最后一个改框架的 Phase。** 如果现在不拆，以后再拆代价更大（Phase 6-8 的代码都会写在对 union type 的假设上）。

---

## 相关文档

- [V3-Phase5-设计.md §9.2](V3-Phase5-设计.md)——5g 交付清单（7 项）+ 验证标准
- [V3-Phase5-Phase4断层分析.md](V3-Phase5-Phase4断层分析.md)——Phase 4→5 的断裂点和迁移策略
- [V3-Phase5.5-三栏交互对标.md](../phase5.5_交互对标/V3-Phase5.5-三栏交互对标.md)——viewRole 的消费端实现
- [V3-Phase5-Phase6-通盘分析.md](V3-Phase5-Phase6-通盘分析.md)——Phase 5→6 的完整承接链
- [[core-ignorance-principle]]——5g 是这个原则在类型系统上的应用
- [[plugin-system]]——插件系统的自由模型
- [[design-decisions]]——决策 #22（5h 安置位置）
