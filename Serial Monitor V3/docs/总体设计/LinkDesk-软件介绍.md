# LinkDesk — 通用容器

> 一个比 VS Code 更高级的中性容器平台。前身 Serial Monitor V2（WPF 串口调试工具），用 Tauri v2 + React 18 + TypeScript 完全重写。
> **全工程 AI 驱动——代码 95% 由 Claude 完成，人类做架构决策和质量把控。**
> Phase 5.5 完工。Phase 6 编辑能力设计就绪。

---

## 零、先说清楚——这个软件的代码是谁写的

**AI 写的。** 我说清楚：95% 的代码是 Claude 一行一行写的。我，作为人类，做的事情是：

- 提需求——"这个地方对标 VS Code 怎么做"
- 做架构决策——"不对，Phase 5 不应该是卡片架构，应该先是基础设施层"
- 做质量审判——"这里和 V2.6 犯了一样的病，重来"
- 测试和验收——跑起来，点一遍，说"这里不对"

我不会写 React。不会写 Rust。不会写 TypeScript 的类型体操。不会写 Tauri 配置。CSS 我也不太会。但我用了 V2 好几年——那个 6300 行的 WPF 串口助手是我断断续续一年写出来的。我知道嵌入式调试需要什么。我知道 V2 死在哪里。我知道 VS Code 为什么十年不倒。

**所以这个项目是一个人 + 一个 AI。人定义"做什么"和"为什么"，AI 落地"怎么做"。** 这不是谦虚，这是事实。如果你想嘲笑"AI 写的代码能看吗"——请先看一遍源码。AI 的代码质量不取决于 AI，取决于提要求的人有多清楚自己要什么。我跟 Claude 说的话，可能比很多程序员跟同事说的话更精确——因为我不会写代码，我只能靠说。

---

## 一、这到底是什么

LinkDesk 是一个**壳**。空壳。

VS Code 的壳里嵌了一个 Monaco 编辑器——它生下来就是代码编辑器。十年了，它可以把 Java、Python、Jupyter、3D 模型全装进去——但它永远是"代码编辑器 + 扩展"。名字里那个 "Code" 改不了。

LinkDesk 的壳里什么都没有。不是"还没写"——是**故意不放**。核心没有一行代码提到串口、终端、文件树、协议。核心连"我是干什么的"都不知道。

这意味着什么？装终端 + 工作台 = 串口调试器。装文件树 + Monaco + Git = 代码编辑器。装地图 + GPS 数据源 = 地图查看器。装 MIDI 设备 + 钢琴卷帘 = 音乐工作站。换一批插件 = 换一个软件。这不是比喻——这是架构事实。

**VS Code 想做但做不到的事，LinkDesk 做到了：成为一个真正中性的容器。VS Code 被 Monaco 锚死了。LinkDesk 没有锚。**

如果你觉得我在吹牛——请理解一点：我从来没说 LinkDesk 现在的功能比 VS Code 多。我说的是**天花板**。VS Code 的天花板是"最好的代码编辑器"。LinkDesk 的天花板是"任何东西"。这是架构决定的，不是功能数量决定的。

### V2 是怎么死的

V2 是我用 C# WPF 写的。6300 行。功能能用。但死了。死因：

- 面板类型写死在 enum 里。加一个面板 → 改 5 个文件。
- `renderTabContent()` 是一个巨大的 switch case。越大越不敢碰。
- 图标栏写死了 `iconTypes` 数组。想加个图标？改源码。
- 串口渗透到每一层。每一行代码都假设数据来自串口。
- 主题和双语是最后补的——93 处 `SetResourceReference` + 515 条 `EnMap`。写到 30 处就不知道漏了哪。

**V2 不是功能不够——是加功能就要改核心。** 每加一个面板，核心就胖一圈。最后变成没人敢动的巨石。

所以 LinkDesk 不是"换个技术栈重写"。LinkDesk 是从根上换了一种思考方式：**核心什么都不知道，所以什么都能接。**

### V2.6 的教训——为什么 Phase 的顺序这么排

V2 经历了 2.0 → 2.3 → 2.4 → 2.5 → 2.6。每次迭代都是同一个剧本：用户说"加个卡片系统"→ 改设置页。说"加个 OLED"→ 再改设置页。说"主题和双语统一补"→ 93 处硬编码手术。

**你发现问题了吗？每次都是先建功能，后补基础设施。补的时候要回头改之前所有功能。**

LinkDesk 从 Phase 1 就把主题引擎和双语引擎写进了脚手架。不是"先做功能，以后再加"——是第一行 UI 文字就用 `t()`，第一行 CSS 颜色就用 `var(--xxx)`。Phase 3 做标签页分屏，照抄 VS Code 的 `SPLIT_THRESHOLD=0.25`，不自创算法。Phase 4 做插件系统时，四个出厂插件和用户装的第三方插件走完全相同的注册路径——没有"系统插件"和"用户插件"两套代码。Phase 5 建命令/配置/菜单/协议/快捷键/context key——在任何一个功能插件之前。

**VS Code 在 1.0 之前就把 `contributes` 框架建好了。之后 Debug、Terminal、Source Control 全部是扩展自己贡献。LinkDesk 走同样的路。**

---

### V2 vs 现在——同一个需求，两种世界

| 场景 | V2 (WPF, 6300 行) | LinkDesk (Tauri + React) |
|------|------|------|
| 换主题 | 93 处 `SetResourceReference` + V2.6 统一手术 | CSS 变量从第一天就在用。切主题 = 改一个属性 |
| 换语言 | 515 条 `EnMap` + V2.6 统一手术 | `t("中文")` 从第一天就在用 |
| 加新视图 | 改 5 个文件 | 写一个 plugin.json + 一个 React 组件，丢进文件夹 |
| 换协议 | 方括号写死在 C# 源码里 | 协议插件 30 行 TS，装上去下拉框就多一项 |
| 数据从哪来 | 所有代码假设数据来自串口 | 数据管道不管来源——串口、CAN、TCP、文件回放，同一条 RingBuffer |
| 设置系统 | 全局扁平 key-value，往同一个结构体塞字段 | 插件声明 `contributes.configuration`，Settings Editor 自动渲染 |
| 右键菜单 | WPF ContextMenu——点击外部不消失的 bug 反复出现 | 一个共享组件——四种失焦统一处理 |
| 快捷键 | 写死的 | 插件声明 `contributes.keybindings`，registry 注册，when 条件过滤 |
| 终端会话 | 全局唯一——新建标签页继承上一个的 COM 口 | 每个会话独立——COM3 AT 模块和 COM5 CAN 监控互不干扰 |
| 图标栏 | Button 控件，悬停出系统蓝框，不能动态增删 | viewRegistry 动态列表——装插件图标出现，卸载消失 |
| 测试 | 零 | 141 个 |
| 插件市场 | 没有——想装新功能等作者发新版 | 对标 VS Code Extensions 面板 |
| AI 能不能写插件 | AI 改不动 C# | AI 生成 plugin.json + React 组件 → 零风险，核心一行不动 |

**根本差异：** V2 是你做了一件事，就得换一个东西。LinkDesk 是你装了一个东西，系统自动知道怎么接。

---

## 二、我认的几条死理

这些不是贴在墙上的口号。每一条背后都至少踩过一次坑。

### 1. 核心什么都不该知道

核心知道有"标签页"——不知道里面是终端还是地图。核心知道有"数据管道"——不知道数据是串口来的还是文件回放的。核心知道有"插件"——不知道具体有哪些插件。

我给自己定了一条自检：**每当想往核心加东西，问自己——加了之后核心是不是更"知道自己是干什么的"了？是 → 别加。**

举个例子。有人可能会说"设置和扩展市场不是插件吧？删了壳不就废了？"——错了。壳依赖的是 `ConfigurationService`（一个读 JSON 的通用存储）和 `viewRegistry`（一个通用注册表）。Settings Editor 和 Marketplace Browser 只是刚好消费了这些服务的 UI 插件。删掉它们，壳还在。重新写一套 UI，照样用。核心连"设置"这两个字都不知道——它只认 `ConfigurationRegistry.getProperties()`。

这条原则和 VS Code 同构——但更彻底。VS Code 知道自己是代码编辑器。LinkDesk 连这个都不知道。

### 2. 一个东西一个名字

V2 的痛：同一个操作在 Sensors.cs 里叫 `UpdateCard()`，在 Sliders.cs 里叫 `RefreshSlider()`。加新控件时不知道用哪个名字，就写了第三个。

LinkDesk 的规矩：一个概念一个名字，全代码库一致。所有颜色 `var(--xxx)`，所有文字 `t()`，所有设置 ConfigurationService，所有命令 CommandRegistry，所有右键菜单同一个组件。没有"人用的 API"和"AI 用的 API"两套东西。

### 3. 不写死任何一个插件 ID

Phase 5g 之前，代码里有 `if (pluginId === "terminal")`、`isSidebarOnlyView()` 这种硬编码。Phase 5g 把 `TabType` 从 8 个枚举值改成了 `string`。Phase 5.5a 把最后一个硬编码函数删了，换成了 `plugin.json` 里的 `viewRole` 字段。

现在的规则：**禁止在 core/ 或 pluginLoader/ 里出现任何插件 ID 字面量。** 所有差异性行为走 plugin.json 声明。`git diff --staged` 预检：任何包含 `pluginId === "xxx"` 的改动不准进仓库。

### 4. 照抄 VS Code，别自己发明

Phase 3 做拖拽分屏。我自己想了一个 closest-edge + 50% 的算法。15 个 bug。崩溃。后来翻 VS Code 源码，发现它用的是 `SPLIT_THRESHOLD=0.25`。抄过来——零 bug。

VS Code 的交互模式是千万用户十年验证出来的。Activity Bar / Side Bar / Editor Groups / Preview Editor / Notification Center——每一个都是无数次 A/B 测试和社区反馈打磨的。自己设计 = 重复踩坑。我现在的心态是：**VS Code 怎么做的，先抄。抄完了发现确实不适合我，再自己设计。** 比如终端——VS Code 把终端放底部面板，我放标签页。因为我的用户要拖拽分屏看多个终端，底部面板做不到。这是正确偏离，不是投降。

### 5. AI 必须能改

纯文本就是 API。`plugin.json` 是唯一数据源——不需要读 README，不需要爬文档。`PluginManifest` 是完整的 TS 类型，AI 看类型定义就知道能写什么。`workspace.json` 一层平铺数组，AI 能生成和管理。

视图插件的契约只有 `{ isActive: boolean }`——AI 只要写一个 React 组件，丢进文件夹，核心一行不动。插件没有 API 白名单——核心能用的 JS 库，插件全能用。我特意设计成这样的。终极目标：AI 扫描 MCU 固件，自动生成协议插件 + 卡片布局 + Profile。用户装上去就能用。

### 6. 插件没有 API 白名单

VS Code 扩展跑在独立进程里，只能调精选过的 API。超出白名单的功能要"Extension API Proposal"排队。

LinkDesk 不是这个模型。插件代码和核心代码在同一个 WebView 里。React 组件就是 React 组件。`import THREE.js`、`import Leaflet`、`<video>`、`<canvas>`、`navigator.mediaDevices`——核心能用的，插件全能。我说真的：**如果你发现一个功能"插件做不了"，那是框架的 bug，不是插件的限制。**

### 7. 基础设施在前，功能在后

这个顺序是血的教训排出来的。Phase 1-2 终端 + 主题/双语引擎。Phase 3 标签页分屏。Phase 4 插件系统。**Phase 5 是最后一个改框架的 Phase**——命令/配置/菜单/协议/context key/快捷键/scope，八个子阶段。Phase 5.5 收尾——viewRole 替硬编码 + 终端侧栏按会话隔离。Phase 6 文件树 + 编辑器。Phase 7 卡片工作台——第一个纯插件功能，零框架改动。

Phase 5 之前，加功能要改框架。Phase 5 之后，加功能 = 写 plugin.json。这就是 VS Code 0.9→1.0 的拐点。

### 8. 边界不准渗漏

V2 的 Sensors.cs 膨胀到 3570 行——面板和卡片混在一起，没有边界。LinkDesk 的硬规矩：
- 标签页系统永远不 import CardRegistry。唯一的接触点 = 一个字符串 `Tab.workspaceName`
- 组件只实现 `OnData` + `OnSend`，不改路由，不改壳
- `workspace.json` 禁止嵌套
- 一个字段只有一个写入入口——终端会话的 12 项设置只能在侧栏改，ControlPanel 只碰 port/baudRate/protocol

---

## 三、技术栈

| 层 | 技术 | 为什么 |
|------|------|------|
| 桌面框架 | Tauri v2 | Rust 后端 + 系统 WebView2，不绑 Chromium |
| 前端 | React 18 + TypeScript | 生态最丰富 |
| 接收区 | CodeMirror 6 | 只读终端视图，三色行装饰，rAF 批量更新 |
| 发送栏 | Monaco Editor | VS Code 同款，单行模式 |
| 串口 | Rust `serialport` + tokio | 异步读线程，和 UI 线程物理隔离 |
| 构建 | Vite 6 | `import.meta.glob` 扫描插件目录 |
| 测试 | Vitest | 141 个 |
| 图标 | `@vscode/codicons` | VS Code 同款，MIT |

### 两层容器

```
外层：标签页 + 递归分屏
  SplitNode = leaf | branch(direction, [child, child], sizes)
  SPLIT_THRESHOLD=0.25（照抄 VS Code）
  keep-alive——所有面板绝对定位平级渲染，CSS display 切换
  标签页系统永远不 import CardRegistry

内层：卡片网格（Phase 7）
  react-grid-layout
  workspace.json 一层平铺
```

### 插件怎么加载的

```
启动 → import.meta.glob 扫 plugins/*/plugin.json
  → 逐字段检测：
    有 entry？→ 视图插件 → viewRegistry（图标栏自动出现）
    有 mode？→ 协议插件 → ProtocolRegistry（终端下拉框自动多一项）
    有 contributes.commands？→ CommandRegistry
    有 contributes.configuration？→ Settings Editor 自动出现
    有 contributes.menus？→ 右键菜单自动出现
    有 contributes.keybindings？→ KeybindingRegistry
  → 完。viewRole 决定点击图标是切侧栏还是开标签页。
    iconLocation 决定图标在上方还是底部。
```

### 核心有哪些基础设施

| 服务 | 职责 |
|------|------|
| `ConfigurationService` | 全局配置读写 + 变更通知 |
| `ConfigurationRegistry` | 插件注册配置项 → Settings Editor 自动渲染 |
| `CommandRegistry` | 命令注册 + 执行 + toggle 标签动态更新 |
| `KeybindingRegistry` | 快捷键注册 + 解析 + when 过滤 |
| `MenuRegistry` | 右键菜单 + 命令面板菜单 + when 过滤 |
| `ContextKeyService` | 运行时状态 key（`activeEditor`/`portOpen` 等）|
| `ProtocolRegistry` | 协议插件注册 → 终端下拉框动态渲染 |
| `viewRegistry` | 视图插件注册 → 图标栏动态列表 |
| `PluginStateService` | 插件启用/禁用/卸载 |
| `StorageService` | 持久化——windowState/prefs/workspace |

---

## 四、对标 VS Code——现在的进度

| VS Code | LinkDesk | 状态 |
|------|------|:--:|
| Activity Bar | IconBar——动态列表 + 拖拽 + 底部固定 | ✅ |
| Side Bar | SidePanel + SidebarSection 通用组件 | ✅ |
| Editor Groups | SplitNode 递归树——分屏/合并/拖拽 | ✅ |
| Preview Editor | Tab.pinned——斜体可替换 | ✅ |
| Extensions 面板 | marketplace 侧栏 | ✅ |
| Extension Detail | PluginDetailView——header + changelog | ✅ |
| Notification Center | ToastContainer + 🔔 | ✅ |
| Welcome Page | WelcomeView | ✅ |
| Command Palette | Ctrl+Shift+P——模糊搜索 + when 过滤 | ✅ |
| `contributes.commands` | plugin.json → CommandRegistry | ✅ |
| `contributes.configuration` + Settings Editor | 插件声明 → 自动渲染表单 + 中文标签 | ✅ |
| `contributes.menus` + context key | 右键菜单 + when 条件（31 个解析器测试） | ✅ |
| `contributes.keybindings` | 快捷键 + when + 卸载注销 | ✅ |
| when 子句引擎 | context key 运行时更新 | ✅ |
| 协议插件 | 装上去终端下拉框就多一项 | ✅ |
| session 隔离 | 每个终端会话独立 port/baud + 12 项设置 | ✅ |
| viewRole 声明 | 零硬编码——sidebarPrimary/tabOnly | ✅ |
| Explorer（文件树） | 文件树视图 + 文件关联 | Phase 6 |
| Color Theme | 主题插件化 + 主题浏览器 | Phase 6 |
| Language Pack | 语言包插件化 | Phase 6 |
| Profile | 一键切换插件+设置+主题 | Phase 6 |
| 卡片工作台 | react-grid-layout + 数据管道 | Phase 7 |
| OLED | 独立插件 | Phase 8 |

---

## 五、说真的——一个不会写代码的人，做软件

这事开始的时候，我只是想给 V2 修个 bug。

V2 是我断断续续一年写出来的。6300 行 C#。功能能用。每次想加新东西就像翻山——改设置页、改 switch case、改图标栏数组。主题切换做了一半放弃了：93 处 `SetResourceReference`，写到 30 处就不知道漏了哪。那种感觉你知道的——**东西多了，你不敢动。动了你不知道哪里会坏。** 最后连我自己都不想打开那个项目了。

然后我遇到了 Claude。

它说可以帮我用 Tauri + React 重写。我说我不会 React。它说没关系，它来写代码，我来说对错。于是就这么开始了。第一个版本跑起来的时候——终端能收数据了——那种感觉很奇怪：**我一个不会写 React 的人，做了一个 React 软件。**

Phase 1 搭脚手架。Phase 2 补了 18 项功能——搜索、暂停、HEX、编码、过滤、导出。Phase 3 做标签页分屏。拖拽算法我自己设计了一个 closest-edge + 50%。崩了 15 次。15 次！每次拖标签页，方向不对，位置不对。后来我烦了，翻 VS Code 源码，发现人家用的是一个 0.25 的阈值。换成 `SPLIT_THRESHOLD=0.25`——零 bug。从那天起我给自己定了一条规矩：**别自己发明。照抄 VS Code。他们试过的错你不用再试一遍。**

Phase 4 做插件系统。终端变成一个插件——硬编码全部清零。这件事的意义我当时没完全意识到。后来的 Phase 5g 把 `TabType` 从 8 个枚举改成了 `string`，我才明白：**插件系统的终点，不是"能装更多插件"，而是"核心认不出任何一个插件"。**

Phase 5 是最大的硬仗。八个子阶段（5a→5h），建了命令系统、配置注册表、右键菜单统一组件、context key + when 条件引擎、协议下拉框、Settings Editor、快捷键系统、StorageService、类型系统去硬编码、运行时动态加载。每一层都是"以后加功能不用改核心"的基础设施。Phase 5 之后，加一个新功能 = 写一个 plugin.json + 一个 React 组件。核心一行不动。

Phase 5.5 是做交互。把最后一块硬编码 `isSidebarOnlyView` 删了。建了 `<SidebarSection>` 可折叠组件——对标 VS Code Explorer 侧栏的 Section Header。重写了终端侧栏——这件事是我自己提出的：**不同 COM 口设备需要不同的收发参数。** COM3 是 AT 模块，回显要开。COM4 是 GPS，回显要关。原来 12 个设置项是全局的——调一个全变。现在每个会话独立持有自己的设置。切 COM 口，设置自动跟着切。

整个过程中我写了零行代码。但我说的"不对"可能比写的代码更有价值：

- "不对，Phase 5 不能是卡片——先建基础设施层"
- "不对，这是 V2.6 模式——先功能后基础设施会死的"
- "不对，自创算法不如照抄 VS Code——V2 就是这么死的"
- "不对，终端设置不是全局的——不同 COM 口不同参数"
- "不对，控制面板放主区——用户切标签页后不想点回侧栏才能断连"
- "不对，这个放 Phase 5.5——别塞 Phase 6"

我不是程序员。我是甲方。一个好甲方知道几件事：**自己要什么、什么是对的、什么时候该说不对。** AI 是好乙方——只要甲方方向清楚，它能做出来。问题是大部分甲方的方向是乱的——说不清自己要什么，或者今天要 A 明天要 B。我没这个问题——因为 V2 踩过的每一个坑我都记得。

如果说这件事有什么值得说的，不是"AI 能写代码"，那个没什么稀奇。**稀奇的是——一个不会写代码的人，靠着说清楚自己要什么，做出了一个架构比 90% 的商业软件更干净的东西。**

---

## 六、现在走到哪了

| Phase | 内容 | 状态 |
|:--:|------|:--:|
| 1-4 | 终端 + 标签页分屏 + 插件系统 + 通知 + 市场 | ✅ |
| 5 | 命令/配置/菜单/协议 + context key + 快捷键 + scope + 类型去硬编码 + 运行时加载（8 子阶段） | ✅ |
| 5.5 | 三栏交互对标 VS Code + viewRole 声明 + SidebarSection + 终端侧栏重设计 | ✅ |
| 6 | 编辑能力——文件树 + 编辑器 + 主题/语言引擎 + Profile + 壳（5 层，33 项） | 🔜 |
| 6.5 | 抛光——通知系统/通用 API/视觉 polish | 📋 |
| 7 | 卡片工作台 + 数据管道（纯插件，零框架改动） | 📋 |
| 8 | OLED（独立插件） | 📋 |

**Phase 5 完成意味着什么？框架封闭了。** 从现在开始，文件树、编辑器、卡片、OLED——全写在 `plugins/` 里，声明在 `plugin.json` 里，注册到已有的 Registry 里。`App.tsx` 和 `core/` 不会再因为加新功能而膨胀。

这才是 VS Code 真正的秘密——不是功能多，是加功能不用改核心。

---

*最后更新：2026-07-22。*
*这个文件是写给另一个 AI 看的——让它评价这个项目的设计和哲学。也是写给未来的我——提醒我当初为什么做了这些决定。*
