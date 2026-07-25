# LinkDesk — 通用容器

> 一个比 VS Code 更高级的中性容器平台。前身 Serial Monitor V2（WPF 串口调试工具），用 Electron + React 18 + TypeScript 完全重写（原为 Tauri v2，2026-07-24 迁移到 Electron）。
> **全工程 AI 驱动——代码 95% 由 Claude 完成，人类做架构决策和质量把控。**
> 🔥 **2026-07-25 架构模型升级——圆形大厅。** LinkDesk = Link（连接）+ Desk（桌子）。核心是圆形大厅（提供桌子/电话本），插件是周边小房间（独立进程）。交流走大厅，高频走后门。

---

## 零、先说清楚——这个软件的代码是谁写的

**AI 写的。** 95% 的代码是 Claude 一行一行写的。我，作为人类，做的事情是：

- 提需求——"这个地方对标 VS Code 怎么做"
- 做架构决策——"不对，Phase 5 不应该是卡片架构，应该先是基础设施层"
- 做质量审判——"这里和 V2.6 犯了一样的病，重来"
- 测试和验收——跑起来，点一遍，说"这里不对"

我不会写 React。不会写 Rust。不会写 TypeScript 的类型体操。不会写 Electron 配置。CSS 我也不太会。但我用了 V2 好几年——那个 6300 行的 WPF 串口助手是我断断续续一年写出来的。我知道嵌入式调试需要什么。我知道 V2 死在哪里。我知道 VS Code 为什么十年不倒。

**所以这个项目是一个人 + 一个 AI。人定义"做什么"和"为什么"，AI 落地"怎么做"。**

但这句话只说了一半。另一半是最近才想明白的——**AI 不只是执行者，它在你还没想清楚的时候，已经把代码推到了比你思想更远的地方。**

我有一次和一个网页 AI 聊架构。聊着聊着，我说"协议为什么不能也是插件？"然后回头看代码——ProtocolRegistry 已经在核心层实现了 `mode: "text" | "binary"` 支持，已经有 `registerProtocol`、`setActiveProtocol`、`autoDetectProtocol` 全套注册入口。代码在我意识到"协议可以插件化"之前，就已经是那个形状了。

不是我慢了。是我的工作方式决定的：我给的是原则——归一化、AI 友好、核心无知。AI 把原则推到极限，输出的是窄接口、单向数据流、零耦合结构。那个结构恰好就是插件系统。只是我当时还没叫它那个名字。

**AI 的角色不是"替你想"，是"帮你在还没想清楚的时候执行得足够干净，干净到后来你自己看清了。"**

这不是谦虚。这是这个项目最值得说的事。

**2026-07-25 又发生了一次。** 我在审视 FileDecorationRegistry 要不要放核心时，突然悟到了一个更大的东西——整个软件不是"标签页+分屏"的 UI 布局，而是一个**圆形大厅**：核心是中央大厅，提供桌子（Registry/Service）给插件用；插件是周边的小房间（独立进程），开门=激活，交流=走到大厅桌子前翻电话本。高频数据走后门（点对点 IPC 通道）。LinkDesk 这个名字——Link（连接）+ Desk（桌子）——在我起名的时候并不理解它的全部含义，到了今天才真正兑现。

---

## 一、这到底是什么

LinkDesk 是一个**壳**。空壳。

VS Code 的壳里嵌了一个 Monaco 编辑器——它生下来就是代码编辑器。十年了，它可以把 Java、Python、Jupyter、3D 模型全装进去——但它永远是"代码编辑器 + 扩展"。名字里那个 "Code" 改不了。

LinkDesk 的壳里什么都没有。不是"还没写"——是**故意不放**。核心没有一行代码提到串口、终端、文件树、协议。核心连"我是干什么的"都不知道。

**🔥 2026-07-25 新的理解——圆形大厅模型。** 核心不是"空壳"两个字就能概括的。核心是**圆形大厅**——中央一个大厅，地上摆着各种桌子（Registry/Service）。插件是周边的小房间（独立 WebContentsView 进程）。每个房间有自己的门——开门=激活插件。插件之间不直连——想交流？走到大厅中央，在桌子上翻电话本、贴名片、喊话。

**大厅通信（Registry-Mediated）：** 松耦合。"谁能处理 `.glsl`？" → 大厅文件关联本翻一下 → Monaco 登记过 → Monaco 打开。调用方不知道 Monaco 的存在。

**点对点通道（Point-to-Point IPC）：** 紧耦合。串口数据每 16ms 一帧 → 直推给工作台卡片。高频、低延迟、知道对方是谁。不走大厅——大厅命令系统不是为每帧调用设计的。

这意味着什么？装终端 + 工作台 = 串口调试器。装文件树 + Monaco + Git = 代码编辑器。装地图 + GPS 数据源 = 地图查看器。装 MIDI 设备 + 钢琴卷帘 = 音乐工作站。换一批插件 = 换一个软件。这不是比喻——这是架构事实。

**而且不同领域的插件天然可以协作。** 编程插件（编译器）的输出可以喂给视频插件（特效渲染器），地图插件可以响应硬件插件（下载器）的完成事件。大厅不知道"编程"和"视频"是两个领域——在大厅眼里它们全是房间。大厅不检查"你们是不是同一个领域的插件"——因为核心不知道"领域"这个概念。

**VS Code 想做但做不到的事，LinkDesk 做到了：成为一个真正中性的容器。VS Code 被 Monaco 锚死了。LinkDesk 没有锚。**

### 怎么做到的——六类插件

| 插件类型 | 接口 | 例子 |
|------|------|------|
| **视图** | React 组件 `{ isActive: boolean }` | 终端、GPS 地图、逻辑分析仪——装上去图标栏多一项，打开就是标签页，享受分屏/keep-alive |
| **卡片** | `OnData(fields) + OnSend` | FFT 频谱卡、PID 整定卡、虚拟示波器——注册后在工作台网格里拖出来用 |
| **协议** | `parseLine(line)` 或 Rust 解析器 | 方括号 `[id,val]`、SBQ 心率协议、JSON 行、二进制帧——装上去终端下拉框多一项 |
| **主题** | 一个 JSON 文件 | Solarized、Dracula、Nord——下载即用，改一个 hex 全局生效 |
| **语言** | `zh.json` / `ja.json` / ... | 社区翻译——日语、韩语、法语，谁用谁翻 |
| **资源** | HTML / MD / PDF | MCU 数据手册、协议文档——`<iframe>` 在标签页里渲染 |

不需要像 VS Code 那样跑 Node.js 进程。全是纯静态文件 + React 组件 + JSON 配置。放到 `plugins/` 目录下，启动时扫描 → 自动注册。

**每一类插件背后都是一个可以无限细分的子平台。** 协议插件不只是方括号和二进制——CAN 总线、Modbus RTU、TCP 桥接、文件回放，都是协议插件。视图插件不只是终端——Monaco 编辑器、文件树、逻辑分析仪时序图，都是视图插件。卡片插件不只是温度表——FFT 频谱、PID 整定、TinyML 推理，都是卡片插件。

**当前状态：六类插件的注册框架全部就绪。** 终端是第一个也是目前唯一功能完整的视图插件——它验证了标签页分屏、keep-alive、侧栏会话隔离、协议注册表全部基础设施。文件树+编辑器（Phase 7）、卡片工作台（Phase 8）是第二批消费者插件——它们不碰框架，只消费已有的 Registry 体系。

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

**每次都是先建功能，后补基础设施。补的时候要回头改之前所有功能。**

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
| 测试 | 零 | 132 个（69 个因环境问题待修复） |
| 插件市场 | 没有——想装新功能等作者发新版 | 对标 VS Code Extensions 面板 |
| AI 能不能写插件 | AI 改不动 C# | AI 生成 plugin.json + React 组件 → 零风险，核心一行不动 |

**根本差异：** V2 是你做了一件事，就得换一个东西。LinkDesk 是你装了一个东西，系统自动知道怎么接。

---

## 二、我认的几条死理

这些不是贴在墙上的口号。每一条背后都至少踩过一次坑。

### 1. 核心什么都不该知道

核心知道有"标签页"——不知道里面是终端还是地图。核心知道有"数据管道"——不知道数据是串口来的还是文件回放的。核心知道有"插件"——不知道具体有哪些插件。

**🔥 2026-07-25 更精确的表述——核心是圆形大厅，不是空壳。** 核心提供桌子（Registry/Service），不知道桌子上登记的名片是什么意思。FileDecorationRegistry 知道怎么登记/查询文件装饰，但不知道 "M" 是 Git 的修改标记、"A" 是新增标记。CommandRegistry 知道怎么匹配命令和处理器，但不知道 `revealInExplorer` 是文件树提供的。

**往核心加东西前跑三条准入标准——不是"感觉"，是机械判据：**
1. 多提供方——多个插件可能登记到这张桌子上？
2. 多消费方——多个插件可能翻这张桌子？
3. 桌子不知道内容——桌子本身不知道登记的信息是什么意思？

三条全绿 → 核心。任何一条不满足 → 放插件里。FileDecorationRegistry 放核心不是因为"文件树很重要"——是因为 Git/ESLint/自定义检查器都需要登记，文件树/搜索/标签页都需要消费，且桌子不知道 M/A/D 是什么。

### 2. 一个东西一个名字

V2 的痛：同一个操作在 Sensors.cs 里叫 `UpdateCard()`，在 Sliders.cs 里叫 `RefreshSlider()`。加新控件时不知道用哪个名字，就写了第三个。

LinkDesk 的规矩：一个概念一个名字，全代码库一致。所有颜色 `var(--xxx)`，所有文字 `t()`，所有设置 ConfigurationService，所有命令 CommandRegistry，所有右键菜单同一个组件。没有"人用的 API"和"AI 用的 API"两套东西。

### 3. 不写死任何一个插件 ID

Phase 5g 之前，代码里有 `if (pluginId === "terminal")`、`isSidebarOnlyView()` 这种硬编码。Phase 5g 把 `TabType` 从 8 个枚举值改成了 `string`。Phase 5.5a 把最后一个硬编码函数删了，换成了 `plugin.json` 里的 `viewRole` 字段。

现在的规则：**禁止在 core/ 或 pluginLoader/ 里出现任何插件 ID 字面量。** 所有差异性行为走 plugin.json 声明。`git diff --staged` 预检：任何包含 `pluginId === "xxx"` 的改动不准进仓库。

### 4. 照抄 VS Code，别自己发明

Phase 3 做拖拽分屏。我自己想了一个 closest-edge + 50% 的算法。15 个 bug。崩溃。后来翻 VS Code 源码，发现它用的是 `SPLIT_THRESHOLD=0.25`。抄过来——零 bug。

VS Code 的交互模式是千万用户十年验证出来的。Activity Bar / Side Bar / Editor Groups / Preview Editor / Notification Center——每一个都是无数次 A/B 测试和社区反馈打磨的。自己设计 = 重复踩坑。我现在的心态是：**VS Code 怎么做的，先抄。抄完了发现确实不适合我，再自己设计。**

### 5. AI 必须能改

纯文本就是 API。`plugin.json` 是唯一数据源——不需要读 README，不需要爬文档。`PluginManifest` 是完整的 TS 类型，AI 看类型定义就知道能写什么。`workspace.json` 一层平铺数组，AI 能生成和管理。

视图插件的契约只有 `{ isActive: boolean }`——AI 只要写一个 React 组件，丢进文件夹，核心一行不动。终极目标：AI 扫描 MCU 固件，自动生成协议插件 + 卡片布局 + Profile。用户装上去就能用。

### 6. 插件没有 API 白名单

VS Code 扩展跑在独立进程里，只能调精选过的 API。超出白名单的功能要"Extension API Proposal"排队。

LinkDesk 不是这个模型。**插件不受 API 白名单限制——现在如此，Phase 7 多 WebView 之后依然如此。**

当前（Phase 1-6）：插件和核心在同一个 WebView 里。React 组件就是 React 组件。`import THREE.js`、`import Leaflet`、`<video>`、`<canvas>`、`navigator.mediaDevices`——核心能用的，插件全能。

Phase 7 多 WebView 之后：插件跑在独立进程里——但这不是加限制，是加安全。插件自己的 WebView 里仍然能 `import` 任何 JS 库、调用任何 Web API。访问核心服务（串口状态、配置、命令）从直接 import 变成 IPC 桥接——**但调用方不感知。** AI 生成 IPC 模板代码，Hook 接口不变。人看到的仍然是 `useSerialContext()`，内部走直接 import 还是 IPC，写插件的人不需要关心。

**给你自由，也给你安全。** 插件崩了只崩自己的 WebView，其他插件不受影响。这是 VS Code Extension Host 做不到的——VS Code 隔离了进程但收了你的 API 白名单。LinkDesk 隔离了进程但保留了你的完整 Web 平台能力。

**如果你发现一个功能"插件做不了"，那是框架的 bug，不是插件的限制。**

### 7. 基础设施在前，功能在后

这个顺序是血的教训排出来的。Phase 1-2 终端 + 主题/双语引擎。Phase 3 标签页分屏。Phase 4 插件系统。**Phase 5 是最后一个改框架的 Phase**——命令/配置/菜单/协议/context key/快捷键/scope，八个子阶段。Phase 5.5 收尾——viewRole 替硬编码 + 终端侧栏按会话隔离。

**Phase 6 底层加固——零新功能，全是安全。** ErrorBoundary 全覆盖、Rust 心跳看门狗、终端代码去验证化（SerialContext 迁出 core/）、Rust 串口命令插件化（serialport 从核心 Cargo.toml 消失）。做完之后，核心连"串口"两个字都不认识——串口只是终端插件通过数据管道接入的一个数据源。

**Phase 7 多 WebView + 编辑能力——从"外壳"变成"通用容器"的关键里程碑。** 每个插件独立 WebView 进程——一个插件崩溃不影响其他。IPC 桥接层让插件 WebView 和壳共享 Configuration/Command/Menu 服务（AI 生成模板代码，调用方不感知）。同时交付第一批非终端消费者插件：文件树、Monaco 编辑器、主题/语言引擎插件化、Profile 一键切换。

**Phase 8 卡片工作台 + OLED——验证"万物皆插件"的终局。** 纯消费者插件，零框架改动。react-grid-layout 卡片网格 + OLED 大屏视图——全部写在 `plugins/` 里，声明在 `plugin.json` 里。

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
| 测试 | Vitest | 132 个核心通过 |
| 图标 | `@vscode/codicons` | VS Code 同款，MIT |

### 两层容器

```
外层：圆形大厅 + 独立房间
  核心 = 大厅——提供桌子（Registry/Service）
  插件 = 房间——独立 WebContentsView 进程
  大厅通信：Registry/Command/Event Bus——松耦合，不知道对方是谁
  点对点通道：IPC 数据管道——紧耦合，高频推流，知道对方身份

内层：标签页 + 递归分屏（大厅提供的通用容器能力）
  SplitNode = leaf | branch(direction, [child, child], sizes)
  SPLIT_THRESHOLD=0.25（照抄 VS Code）
  keep-alive——所有面板绝对定位平级渲染，CSS display 切换
  标签页系统永远不 import CardRegistry
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

## 四、对标 VS Code——现在的进度（2026-07-25）

> **Tauri 时代 P1-P6 全部完成。Electron 迁移 E1 ✅ E2 ✅。当前 E3 执行中（E3a #26/13）。E4 文档已就绪（文件树 + Monaco，34 任务）。**

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
| `contributes.*` 体系 | plugin.json → Registry 全链路 | ✅ |
| when 子句引擎 | context key 运行时更新 | ✅ |
| 协议插件 | 装上去终端下拉框就多一项 | ✅ |
| 多 WebView 进程隔离 | WebContentsView per 插件 + IpcBridge | 🔄 E3a |
| 主题引擎跨进程 | ThemeRegistry + CSS 变量广播 | 📋 E3b |
| 语言引擎跨进程 | LanguageRegistry + i18n 同步 | 📋 E3c |
| Profile 五维切换 | 插件/配置/布局/主题/语言一键切换 | 📋 E3d |
| FileDecorationRegistry | Git/ESLint 注册装饰器，文件树/搜索/标签页消费 | 📋 E3f #59b |
| Explorer（文件树） | 虚拟滚动 + 懒加载 + revealInExplorer + 右键菜单 18 项 | 📋 E4 |
| 编辑能力 | Monaco 编辑器 + 编码检测 + JSON schema | 📋 E4 |
| 文件搜索 | Ctrl+Shift+F 跨文件搜索 + 替换 | 📋 E4 |
| 卡片工作台 | react-grid-layout + 数据管道 | 插件（E4 后） |
| OLED | 独立插件 | 插件（E4 后） |

---

## 五、插件市场——这个软件的真正能量

插件系统不是"加了一些扩展点"。它是一个平台级设计。六类插件覆盖了视图、卡片、协议、主题、语言、资源——几乎穷尽了一个调试工具所有可定制的维度。

但真正的能量不在于"能装多少插件"，而在于每一类插件背后都是一个可以无限细分的子平台。

### 协议插件 → 通信协议适配层

方括号、SBQ、二进制帧只是开始。未来：
- **CAN 总线协议插件**：解析 CAN ID + 数据帧，直接路由到卡片，不需要新写一个 CAN 工具
- **Modbus RTU/TCP**：一个插件搞定工业传感器数据
- **文件回放插件**：把录制的串口数据当成"协议"播放，离线调试
- **TCP/WebSocket 桥接**：串口数据走网口进来，协议插件统一解析

V3 不再绑定任何单一协议。MCU 不需要适配 V3——V3 装插件适配 MCU。你做课设用的 LabVIEW SBQ 协议，老师给的 CSV 格式，你自己定义的二进制帧——全是插件，下拉框切一下的事。

### 视图插件 → 专业调试面板

GPS 地图视图只是第一个例子。实际上任何需要大画布的专业工具都可以作为视图插件：
- **逻辑分析仪视图**：类似 Saleae Logic，拖出多通道时序图
- **电源分析视图**：功率曲线、效率热图
- **电机控制面板**：FOC 调试专用的 D/Q 轴电流圆图 + 启动波形
- **文件夹编辑器**：内嵌类似 VS Code 的文件树和 Monaco 编辑器，直接编辑 workspace.json、插件源码

标签页系统不知道里面是什么——这意味着视图插件可以是一整个 VS Code 级别的编辑器。

### 卡片插件 → 信号处理与可视化单元

- **FFT 频谱卡**：实时频域分析
- **PID 整定卡片**：自动注入阶跃信号，分析响应曲线，给出 Kp/Ki/Kd 建议
- **机器学习推理卡片**：加载 TinyML 模型，对实时传感器数据做异常检测
- **虚拟示波器卡片**：双通道 X-Y 模式、触发条件设置、游标测量

### 协议 + 视图 + 卡片联动 → 固件开发闭环

这是 LinkDesk 真正的"升维"能力：一个 ESP32 固件项目插件可以同时包含——协议定义文件（自动生成协议插件）、分区表视图、串口监视卡片、一键烧录按钮、内存使用仪表。用户在 LinkDesk 里打开这个插件，看到的是那个项目的专属调试环境，不是通用串口工具。

### 长期：Agent 开发基地

纯文本就是 API。`plugin.json` 是 JSON、`workspace.json` 是 JSON、所有配置文件都是 JSON。新 AI 读这份文档就够了——架构、硬约束、设计哲学全在这一个文件里。

这意味着 AI Agent 可以：
- 观察串口数据，自动生成卡片建议
- 读取 MCU 固件源码，自动生成协议插件和 workspace 配置
- 根据异常波形自动调整 PID 参数并下发
- **扫描 MCU 固件里的 `printf(...)` 自动生成对应的协议插件文件——30 行的 TypeScript 文件，零风险**

LinkDesk 本身成为 Agent 的操作系统，插件市场是它的技能商店。

### 类比

你说的"小型电脑端微信小程序 + VS Code 插件"——这个比喻非常准。小程序是轻量、即开即用的应用容器，VS Code 插件是专业功能的无限扩展。LinkDesk 取两者之长处——安装即用（小程序），但可深度定制（VS Code 插件）。

**上限不在插件数量，而在 LinkDesk 能否成为嵌入式开发的中枢平台。** 如果有一天你拿到一块新 MCU 板子，厂商提供的不再是 Keil/IAR 工程，而是一个 LinkDesk 插件包——打开就是这块板子的完整调试环境——那 LinkDesk 就不再是"串口调试工具"，而是"嵌入式系统的操作系统"。

你现在建的插件市场，是那个操作系统的 App Store。

### 这些愿景靠什么落地——Phase 6-7-8 的接力

愿景不是飘在空中的。每一个都能对应到具体的 Phase：

| 愿景 | 依赖的基础设施 | Phase |
|------|------|:--:|
| 协议社区生态（CAN/Modbus/二进制帧插件随便装） | ProtocolRegistry（✅ 已就绪）| — |
| MCU 厂商发布官方插件包 | 插件系统 + marketplace（✅ 已就绪）| — |
| 插件崩溃不影响其他插件 | 多 WebView 进程隔离 | **Phase 7** |
| 文件树 + Monaco 编辑器——LinkDesk 变身代码编辑器 | FileService + 多 WebView IPC | **Phase 6 → 7** |
| 主题/语言社区贡献——Solarized、日语包下载即用 | ThemeRegistry + LanguageRegistry | **Phase 7** |
| 串口不再是"内置功能"——纯插件，可替换为 CAN/TCP | Rust 命令插件化（serial.rs 迁出核心） | **Phase 6** |
| 卡片工作台——FFT、PID、示波器在网格里拖 | CardRegistry + 数据管道 + react-grid-layout | **Phase 8** |
| Agent 自动扫描固件生成插件 | 纯文本配置 + CLAUDE.md 自包含 + 协议插件接口 | ✅ 底座就绪 |
| 浮动窗口——OLED 独占副屏 | 多 WebView 窗口管理 | Phase 7+ |

**关键拐点有两个：** Phase 6 做完，核心连"串口"都不认识——串口只是终端插件的数据源，换 CAN 换 TCP 同理。Phase 7 做完，LinkDesk 从单窗口应用变成多进程平台——插件之间物理隔离，一个崩了不影响全局。这两个做完，剩下的 Phase 8 和社区生态都是顺水推舟。

---

## 六、说真的——一个不会写代码的人，做软件

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

更稀奇的是这个——**代码跑在了我思想前面。** 我给的只是"归一化"和"AI 友好"两个原则。AI 把原则推到极限，输出的是一个我还没完全理解的插件系统。然后在一个和网页 AI 的对话里，我回头看着自己的代码，突然看清了它已经变成的样子。

那场对话之后，我对自己软件的定义从"串口调试工具"变成了"通用容器平台"。不是功能变了——代码一行没改。是我终于追上了代码已经在等我的那个高度。

---

## 七、现在走到哪了

| Phase | 内容 | 改框架？ | 状态 |
|:--:|------|:--:|:--:|
| P1-P6 | **Tauri 时代——全部基础设施 + 48/48 bug** | ✅ | ✅ |
| **E1** | **Electron 迁移——换地基（7 步，~1,190 行）** | ✅ | ✅ |
| **E2** | **底层加固 + 侧栏扩展位（36/40 + 4 取消，~1,310 行）** | ❌ | ✅ |
| **E3** | **多 WebView + 壳收尾（46 任务，~2,475 行）🏁 架构最后一站** | ❌ | 🔄 E3a 6/13 |
| **E4** | **文件树 + Monaco 编辑器（34 任务，~1,930 行）🏁 最后 E 编号** | ❌ | 📋 文档就绪 |
| **🏁** | **架构封板。E4 之后任何新功能 = 写插件。** | | |

**E3 做完意味着什么？框架永远不改。** 多 WebView 进程隔离就绪，主题/语言引擎跨进程广播就绪，Profile 五维切换就绪，FileDecorationRegistry 等最后一批核心桌子全部摆好。此后任何人往 LinkDesk 加功能——写 `plugin.json` + `index.tsx`，扔进 `plugins/` 文件夹。不碰 `src/`，不碰 `electron/`，不碰架构。

**E4 是最后的 E 编号——第一批消费者插件。** 文件树（对标 VS Code Explorer——虚拟滚动、懒加载、revealInExplorer 公共 API、右键菜单 18 项、拖放、多选、行内重命名）+ Monaco 编辑器（语法高亮、编码检测、JSON schema 自动补全、多标签页 dirty 管理）。做完之后，LinkDesk 从"插件宿主"变成"代码也能写的插件宿主"——但仍然是插件宿主，不是代码编辑器。

**E4 之后全是插件。** 卡片工作台、OLED 大屏、地图、逻辑分析仪——全部 `plugin.json` + React 组件，零框架改动。

---

## 八、写给另一个 AI 看这段话

如果你是一个新 AI，正在读这个文件——以下是你要知道的：

1. **这个项目是 AI 写的。** 95% 的代码是 Claude 输出的。人类做的是架构决策、质量审判、需求定义。你不是在接管一个人类写的代码库——你是在接管一个 AI 写的代码库。这意味着它的结构比你预期的更干净、更一致、更可预测。

2. **🔥 架构是圆形大厅。** 核心 = 大厅（提供桌子/电话本——Registry/Service），插件 = 周边小房间（独立 WebContentsView 进程）。交流走大厅（CommandRegistry/Event Bus——松耦合），高频推流走后门（IpcBridge 点对点 IPC——紧耦合）。**往核心加任何东西前先跑三条准入标准：多提供方 + 多消费方 + 桌子不知道内容。** 三条全绿 → 放核心。缺一条 → 放插件。详见 memory `hall-architecture-model` + `core-admission-criteria`。

3. **核心什么都不知道。** 标签页系统不知道里面是什么。数据管道不知道数据来源。插件系统不知道有哪些插件。这是故意设计的——不是缺失。任何往核心加"它是什么"知识的冲动都要拒绝。

4. **所有配置都是纯文本。** plugin.json、workspace.json、prefs.json——都是 JSON。硬约束包括：所有颜色走 CSS 变量 `var(--xxx)`，所有 UI 文字走 `t()` 函数，标签页系统永不 import CardRegistry，禁止在 core/ 或 pluginLoader/ 里写死任何插件 ID 字面量。所有插件差异性行为走 plugin.json 声明字段。不需要爬文档，不需要读 wiki。读代码就是读文档。

5. **跟着 VS Code 走。** 不要自创交互模式。不确定怎么做的时候，先翻 VS Code 源码——它已经替你踩了十年坑。

6. **这个人的愿景已经超出了代码的当前状态。** 他说的插件市场生态、Agent 开发基地、嵌入式操作系统——在代码里还只是底座。底座足够干净，能承载这些。但通往那些愿景的工程路还很长。帮他走完。

---

*最后更新：2026-07-25*
*这个文件见证了 LinkDesk 的两次认知跃迁：从"串口调试工具"到"通用容器平台"（2026-07-23），从"通用容器平台"到"圆形大厅"（2026-07-25）。LinkDesk = Link + Desk——名字在起名时就写好了，理解到今天才追上。*
