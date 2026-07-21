# LinkDesk — 通用调试容器

> 一个对标 VS Code 架构哲学的通用调试工作台。
> 前身 Serial Monitor V2（WPF 串口调试工具），V3 用 Tauri v2 + React 18 + TypeScript 完全重写。
> **全工程 AI 驱动——代码 95% 由 Claude 完成，人类做架构决策和质量把控。**
> 当前 Phase 4 完工，Phase 5 设计就绪。

---

## 零、诚实前置——谁写的这个软件

这个软件是 **AI 写的**。我说清楚：95% 的代码是 Claude（Anthropic 的 AI）一行一行写的。我，作为人类，扮演的角色是：

- 提需求——"这个地方对标 VS Code 怎么做"
- 做架构决策——"不对，Phase 5 不应该是卡片架构，应该先是基础设施层"
- 做质量审判——"这里和 V2.6 犯了一样的病，重来"
- 测试和验收——跑起来，点一遍，说"这里不对"

我不会写 React。不会写 Rust。不会写 TypeScript 类型体操。不会写 Tauri 配置。我甚至不太会写 CSS。但我用了 V2（WPF 串口助手）好几年，我知道嵌入式调试需要什么。我知道 V2 死在哪里。我知道 VS Code 为什么十年不倒。

**所以这个项目是一个人 + 一个 AI，人定义"做什么"和"为什么"，AI 落地"怎么做"。** 这不是谦虚——这是事实。如果你想嘲笑"AI 写的代码能看吗"，请先看一遍源码再说话。AI 的代码质量不取决于 AI，取决于提要求的人有多清楚自己要什么。

---

## 一、这是什么软件

LinkDesk 是一个**通用调试容器**。

它的核心是一套标签页管理 + 递归分屏 + 数据管道 + 插件运行时。**核心不知道软件是干什么的。** 核心没有一行代码提到"串口"、"嵌入式"、"MCU"、"UART"。核心只定义"怎么接"，不定义"接什么"。

所有面向用户的功能——终端、工作台、仪表盘、地图、OLED 虚拟屏、摄像头预览、CAN 总线分析、逻辑分析仪——全部是插件。

如果你熟悉 VS Code：VS Code 核心不知道你是写 Python 还是 C++，核心只提供编辑器组、扩展宿主、命令面板。LinkDesk 完全对标这个模型——但应用领域是硬件/数据调试，不是代码编辑。

### 前身 V2 的死因

V2 是 6300 行 C# WPF 桌面软件，功能完整但架构被判了死刑：

- 面板类型是硬编码的 enum
- `renderTabContent()` 是一个巨大的 switch case
- 图标栏写死了 `iconTypes` 数组
- 加一个视图 → 改 5 个文件
- 串口假设渗透到核心每一层
- 主题系统和双语系统在所有功能写完后再补 → 93 处 `SetResourceReference` + 515 条 `EnMap`

**V2 不是功能不够——是加功能就要改核心。** 每加一个面板，核心就胖一圈。最后变成没人敢动的巨石。

V3 不是"换个技术栈重写一遍"。V3 是设计哲学的根本转变——**软件不知道自己是什么，所以它可以成为任何东西。**

### V2.6 的教训——整个 LinkDesk 的指导思想

V2 经历了 2.0 → 2.3 → 2.4 → 2.5 → 2.6 的迭代。每次迭代，用户说"加个卡片系统"→ 改设置页。说"加个 OLED"→ 再改设置页。说"主题/双语统一补"→ 93 处硬编码手术。

**这不是功能 bug——是架构模式：先建具体功能，后补基础设施，每次补都要回头改之前的功能。**

LinkDesk 从 Phase 1 就内置了主题引擎和双语引擎。Phase 3 建标签页时，拖拽分屏照抄 VS Code（`SPLIT_THRESHOLD=0.25`，不自创算法）。Phase 4 建插件时，四个出厂插件和用户装的插件走完全相同的注册路径。Phase 5 建命令/配置/菜单/协议——在任何一个功能插件之前。

**VS Code 在 1.0 之前就把 `contributes` 框架建好了。之后 Debug、Terminal、Source Control 全部是扩展自己贡献。LinkDesk 走同样的路。**

---

### V2 vs V3——同一个需求，两种实现

| 场景 | V2 (WPF, 6300 行 C#) | V3 (Tauri + React) |
|------|------|------|
| **换主题** | 93 处 `SetResourceReference` + 5 个面板注册回调（V2.6 统一手术） | CSS 变量 `var(--xxx)`，从第一天就在用。切主题 = 改 `data-theme` 一个属性 |
| **换语言** | 515 条 `EnMap` 翻译表 + 14 个 ComboBox 双语化（V2.6 统一手术） | `t("中文")`——写第一行 UI 文字就在用。切语言 = `i18n.changeLanguage()` |
| **加新视图** | 改 5 个文件：enum 定义、switch case、图标栏数组、侧栏路由、菜单项 | 写 `plugin.json` + 一个 React 组件，丢进 `plugins/` 文件夹 |
| **换协议** | 方括号写死在 `ProtocolParser.cs`——换协议 = 改 C# 源码 + 重新编译 | 协议插件 30 行 TS，装上去 → 终端下拉框多一项，选它就切 |
| **串口假设** | 渗透到核心每一层——所有数据假定来自串口 | 数据管道 source-agnostic：串口、CAN、TCP、文件回放——同一条 RingBuffer |
| **面板和卡片** | `Sensors.cs` 膨胀到 3570 行——面板逻辑和卡片逻辑混在一个文件 | 标签页系统不 import CardRegistry，两层容器之间只有 `Tab.workspaceName: string` |
| **设置系统** | 全局扁平 key-value，每次加功能往同一个结构体塞字段 | `contributes.configuration`——插件声明设置，Settings Editor 自动渲染 |
| **右键菜单** | WPF ContextMenu——Popup 里找不到 DynamicResource，点击外部不消失的 bug 反复出现 | 一个共享 `<ContextMenu>` 组件——backdrop + Escape + window.blur + scroll capture，四种失焦统一 |
| **拖拽** | WPF 布局系统不支持卡片自由拖拽重排 | react-grid-layout，Phase 7 开箱即用 |
| **图标栏** | Button 控件——悬停出现系统蓝框，不支持运行时动态增减 | viewRegistry 动态列表——装插件图标自动出现，卸载自动消失 |
| **测试** | 零 | 109 个单元测试 |
| **插件市场** | 无——想装新功能 = 等作者发新版本 | 对标 VS Code Extensions 面板——安装/卸载/禁用/启用，齿轮菜单 |
| **AI 生成插件** | AI 改不动 C# 源码——太危险 | AI 生成 30 行 `plugin.json` + React 组件 → 零风险 |
| **标签页分屏** | 无——单窗口单面板 | SplitNode 递归树——任意分屏排列，对标 VS Code 编辑器组 |

**根本差异：** V2 是"你做了一件事，就得换个东西"。V3 是"你装了一个东西，系统自动知道怎么接"。V2 的核心越来越知道自己是串口助手。LinkDesk 的核心从头到尾不知道自己在调试什么——这正是它的力量。

---

## 二、设计哲学

这些不是贴在墙上的口号——每一个都来自具体的技术决策和多次返工后的总结。

### 1. 核心无知原则

**核心不知道软件是干什么的。只定义"怎么接"，不定义"接什么"。**

核心知道有"标签页"这个东西，不知道标签页里的内容是终端还是地图。核心知道有"数据管道"，数据从一头进一头出，不知道数据是串口来的还是 CAN 来的还是文件回放来的。核心知道有"插件"，插件声明自己能贡献什么，不知道具体有哪些插件。

每当想往核心加东西，自我审查：加了之后核心变得更"知道自己是干什么的"了吗？是 → 别加，做成插件。

这和 VS Code 完全同构——VS Code 核心不知道 Python 扩展、Git 扩展、Docker 扩展具体做什么，只知道"扩展贡献了什么"。这是 VS Code 十年没被框死的根本原因。

### 2. 归一化——同名同义，同义同名

V2 的痛：同一个功能在 Sensors.cs 里叫 `UpdateCard()`，在 Sliders.cs 里叫 `RefreshSlider()`。加新控件时不知道用哪个名字，写了第三个名字。

LinkDesk 的硬规：一个概念一个名字，全文档全代码一致。所有颜色走 CSS 变量 `var(--xxx)`，所有文字走 `t()`，所有设置走 ConfigurationService，所有命令走 CommandRegistry，所有右键菜单走同一个 `<ContextMenu>` 组件。不存在"人用的 API"和"AI 用的 API"两套东西。

### 3. 照抄 VS Code，不自己设计

这不是懒惰——是教训。Phase 3 的拖拽分屏，自创 closest-edge+50% 算法 → 15 个 bug → 崩溃 → 翻 VS Code 源码 → 抄 `SPLIT_THRESHOLD=0.25` → 0 个 bug。

VS Code 的交互模式经过千万用户十年验证。Activity Bar / Side Bar / Editor Groups / Preview Editor / Notification Center / Extension Panel——每一个都是无数 A/B 测试和社区反馈打磨出来的。自己设计 = 重复踩坑。

**什么时候自己设计？** 当 VS Code 的模型和 LinkDesk 的需求有根本冲突时。VS Code 的终端是底部面板，LinkDesk 的终端是标签页——因为 LinkDesk 里终端是主工作视图，用户要拖拽分屏。这是正确偏离，不是投降。

### 4. AI 友好——纯文本就是 API

人和 AI 改同一份 JSON 文件。`plugin.json` 是插件唯一数据源——不需要读 README、不需要爬文档。`PluginManifest` 是完整的 TypeScript 类型，AI 看类型定义就知道能写什么字段。`workspace.json` 一层平铺数组，AI 能生成。`settings.json` 是纯 JSON，用户和 AI 都能改。

视图插件的契约只有 `{ isActive: boolean }`。AI 生成一个 React 组件，丢进 `plugins/` 文件夹，不改核心一行代码。插件没有 API 白名单——核心能 import 的 JS 库，插件全能 import。

**终极目标：** AI 扫描 MCU 固件 → 发现 `printf("[chip_temp, %f]")` → 自动生成协议插件 + 卡片布局 + Profile → 用户装上去，一键切到调试环境。

### 5. 插件自由——没有 API 白名单

这和 VS Code 根本不同。VS Code 扩展跑在独立进程 Extension Host 里，只能调 `vscode.window.createTerminal` 等精选 API。超出白名单的功能需要"Extension API Proposal"排队。

LinkDesk 不是这个模型。插件代码和核心代码在同一个 WebView 里运行。React 组件就是 React 组件，`invoke("send_data")` 就是 `invoke("send_data")`。`import Leaflet`、`import THREE.js`、`<iframe>`、`<video>`、`navigator.mediaDevices.getUserMedia()`——任何核心能用的 Web API，插件全能。

**这意味着你不应该听到"这个功能插件做不了"。** 如果一个功能插件做不了，那是框架的 bug，不是插件的限制。

### 6. 基础设施先于功能——防 V2.6

Phase 的顺序不是按"用户最想要什么"排的——是按"什么必须先建好，才不会让后面的事变成 V2.6"排的。

Phase 1-2 建终端和主题/双语引擎。Phase 3 建标签页分屏（照抄 VS Code）。Phase 4 建插件系统（加载/生命周期/市场）。Phase 5 建应用基础设施（命令/配置/菜单/协议/context key/快捷键/scope）——**这是最后一个改框架的 Phase。** Phase 5.5 修复交互模型（图标=侧栏入口，不是标签页入口）。Phase 6 建文件树和主题/语言插件化。Phase 7 卡片工作台——第一个纯插件功能，零框架改动。

Phase 5 之前，加功能要改框架。Phase 5 之后，加功能 = 写一个 plugin.json + 注册到已有 Registry。这就是 VS Code 0.9→1.0 的拐点。

### 7. 边界不渗漏——硬约束

V2 的 Sensors.cs 膨胀到 3570 行——因为面板和卡片逻辑混在一起，没有边界。LinkDesk 的硬约束：
- 标签页系统永不 import CardRegistry。唯一接触点 = `Tab.workspaceName: string`
- 组件只实现 `OnData(fields)` + `OnSend`，不改路由、不改壳、不改其他组件
- `workspace.json` 禁止嵌套——一层平铺数组
- `ProtocolParser` 是独立可替换模块，RingBuffer 接口 `{ cardId, value }` 是硬边界

---

## 三、技术栈与架构

### 技术栈

| 层 | 技术 | 为什么选它 |
|------|------|------|
| 桌面框架 | Tauri v2 | Rust 后端 + 系统 WebView2，打包体积小，不用绑 Electron 的 Chromium |
| 前端 | React 18 + TypeScript | 严格模式，社区生态最丰富 |
| 接收区 | CodeMirror 6 | 只读终端视图，三色行装饰系统，rAF 批量更新 |
| 发送栏 | Monaco Editor | VS Code 同款，语法高亮，单行模式 |
| 串口 | Rust `serialport` + tokio | 异步读线程，100ms 超时拆行，和 UI 线程物理隔离 |
| 构建 | Vite 6 | `import.meta.glob` 扫描插件目录，独立打包 |
| 测试 | Vitest | 109 个单元测试 |
| 图标 | `@vscode/codicons` | VS Code 同款，MIT 许可证 |

### 两层容器

```
外层：标签页 + 递归分屏（VS Code 编辑器组模型）
  SplitNode = leaf | branch(direction, [child, child], sizes)
  拖拽分屏 SPLIT_THRESHOLD=0.25（照抄 VS Code）
  keep-alive：所有面板绝对定位平级渲染，CSS display 切换
  硬边界：标签页系统永不 import CardRegistry

内层：卡片网格（Phase 7）
  react-grid-layout 拖拽重排
  workspace.json 一层平铺数组
```

### 插件加载

```
启动 → import.meta.glob 扫描 plugins/*/plugin.json
  → 逐字段检测（不 switch type）：
    有 entry？→ 视图插件 → viewRegistry
    有 mode？→ 协议插件 → ProtocolRegistry
    有 contributes.commands？→ CommandRegistry
    有 contributes.configuration？→ Settings Editor 自动出现
    有 contributes.menus？→ 右键菜单自动出现
  → 完成。IconBar 从 viewRegistry 动态读取图标列表。
```

---

## 四、对标 VS Code（已落地 + 规划中）

| VS Code | LinkDesk | 状态 |
|------|------|:--:|
| Activity Bar | IconBar——动态列表 + 拖拽 + 底部固定 | ✅ |
| Side Bar | SidePanel——sidebarView 解耦 + 插件侧栏组件 | ✅ |
| Editor Groups | SplitNode 递归树——分屏/合并/拖拽移动 | ✅ |
| Preview Editor | Tab.pinned——斜体可替换，每组一个 | ✅ |
| Extensions 面板 | marketplace 侧栏——搜索 + 已安装/已禁用/待安装 | ✅ |
| Extension Detail | PluginDetailView——header + 推荐/依赖 + changelog | ✅ |
| Notification Center | ToastContainer + 🔔——severity/source/action 按钮 | ✅ |
| Welcome Page | WelcomeView——viewRegistry 投影 + 最近列表 | ✅ |
| Command Palette | Ctrl+Shift+P——模糊搜索命令 | Phase 5 |
| `contributes.commands` | plugin.json 注册命令 | Phase 5 |
| `contributes.configuration` + Settings Editor | 插件声明设置 → 自动渲染表单 | Phase 5 |
| `contributes.menus` + context key | 右键菜单 + when 条件 | Phase 5 |
| `contributes.keybindings` | 键盘快捷键 | Phase 5 |
| Explorer（文件树） | 文件树系统视图 + 文件关联 | Phase 6 |
| Color Theme | 主题插件化 + 主题浏览器 UI | Phase 6 |
| Language Pack | 语言包插件化 | Phase 6 |
| Profile | 一键切换插件+设置+主题+workspace | Phase 6 |
| 卡片/工作台 | 纯插件——react-grid-layout + 数据管道 | Phase 7 |
| OLED | 独立插件 | Phase 8 |

---

## 五、我的感受——一个不会写代码的人，做一个软件

这件事开始的时候，我只是想给 V2 修个 bug。V2 是一个 6300 行的 WPF 串口助手，我断断续续写了一年，功能能用，但每次想加新东西都要翻山越岭。主题切换实现了一半就放弃了——93 处 `SetResourceReference`，写到 30 处就不知道漏了哪。

然后我遇到了 Claude。

它说可以帮我用 Tauri + React 重写。我说我不会 React。它说没关系，它来写代码，我来说对错。于是 V3 就这么开始了。

Phase 1 脚手架搭起来，终端能收发了。Phase 2 补了 18 项功能——搜索、暂停、HEX、编码、过滤、导出。Phase 3 做了标签页分屏，拖拽分屏自创算法崩了 15 次，最后翻 VS Code 源码抄了 `SPLIT_THRESHOLD=0.25`——零 bug。Phase 4 做了插件系统，终端变成插件，硬编码清零，通知系统对标 VS Code。

整个过程我写了零行代码。但我做了很多"不"的决定：
- "不对，Phase 5 不应该是卡片架构，应该先是基础设施层"
- "不对，这里是 V2.6 模式，不能先建功能后补配置系统"
- "不对，照抄 VS Code，别自己发明"
- "不对，这个放到 Phase 5.5，别塞 Phase 6"

我不是程序员。我是甲方。一个好甲方知道自己要什么，知道什么是对的，知道什么时候该说"不对"。AI 是好乙方——只要甲方方向清楚，它能把东西做出来。

如果这件事有什么值得分享的，那就是：**做一个好软件，不一定要会写代码。但一定要清楚你要做什么，以及——什么不该做。**

---

## 六、当前状态与路线图

| Phase | 内容 | 状态 |
|:--:|------|:--:|
| 1-4 | 终端 + 标签页分屏 + 插件系统 + 通知 + 市场 | ✅ 完成 |
| 5 | 命令/配置/菜单/协议 + context key + 快捷键 + scope | 🔜 设计就绪 |
| 5.5 | 三栏交互对标 VS Code + 终端布局重新设计 | 📋 设计完成 |
| 6 | 文件树 + 主题插件化 + 语言插件化（19 项） | 📋 设计完成 |
| 7 | 卡片工作台 + 数据管道（纯插件） | 📋 规划 |
| 8 | OLED（独立插件） | 📋 规划 |

---

*文档随工程进展持续更新。最后更新：2026-07-20。*
*这个文件是写给另一个 AI 看的——让它评价这个项目的设计和哲学。*
