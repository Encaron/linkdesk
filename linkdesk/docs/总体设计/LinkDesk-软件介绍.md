# LinkDesk — 通用容器

> 一个比 VS Code 更高级的中性容器平台。前身 Serial Monitor V2（WPF 串口调试工具），用 Electron + React 18 + TypeScript 完全重写。
> **全工程 AI 驱动——代码 95%+ 由 Claude 完成，人类做架构决策和质量把控。**
> 🔥 **架构模型——圆形大厅。** LinkDesk = Link（连接）+ Desk（桌子）。核心是圆形大厅（提供桌子/电话本），插件是周边小房间（独立进程）。交流走大厅，高频走后门。
> **当前：E5.6 Pool 模型重构——86 任务 16 Phase。** E5.6 完结后进入 E6 插件生态与发布（47 任务 5 层），然后 04-出厂制造 10 款工厂插件、05-版本更新 v1.1→v1.6。
> **阅读时间：** 人类 30 分钟，AI 5 分钟。这份文档是给网页 AI 了解 LinkDesk 的第一门户——没有代码仓库权限的 AI，靠这份文档就能理解项目全貌、参与架构讨论。

---

## 目录

1. [零、项目性质——AI 驱动的圆形大厅](#零先说清楚这个软件的代码是谁写的)
2. [一、本质——LinkDesk 是什么，以及它不是什么](#一这到底是什么)
3. [1.5、七纪进化史——从 V2 到 Pool 模型](#15历史进程从-v2-到-pool-模型)
4. [二、死理——8 条不可动摇的原则](#二我认的几条死理)
5. [三、技术栈与两层容器架构](#三技术栈)
6. [四、对标 VS Code——34 项能力对照表](#四对标-vs-code现在的进度2026-08-09)
7. [五、当前执行——E5.6 Pool 模型重构（86 任务 16 Phase）](#五当前执行e56-pool-模型重构)
8. [六、下一站——E6 插件生态与发布（47 任务 5 层）](#六下一站e6-插件生态与发布)
9. [七、未来愿景——插件市场、出厂制造、Agent 基地](#七插件市场这个软件的真正能量)
10. [八、人——一个不会写代码的人，做了这个软件](#八说真的一个不会写代码的人做软件)
11. [九、给 AI 的话——10 条速览](#九写给另一个-ai-看这段话)

---

## 零、先说清楚——这个软件的代码是谁写的

**AI 写的。** 95%+ 的代码是 Claude 一行一行写的。我，作为人类，做的事情是：

- 提需求——"这个地方对标 VS Code 怎么做"
- 做架构决策——"不对，Phase 5 不应该是卡片架构，应该先是基础设施层"
- 做质量审判——"这里和 V2.6 犯了一样的病，重来"
- 测试和验收——跑起来，点一遍，说"这里不对"

我不会写 React。不会写 TypeScript 的类型体操。不会写 Electron 配置。CSS 我也不太会。但我用了 V2 好几年——那个 6300 行的 WPF 串口助手是我断断续续一年写出来的。我知道嵌入式调试需要什么。我知道 V2 死在哪里。我知道 VS Code 为什么十年不倒。

**所以这个项目是一个人 + 一个 AI。人定义"做什么"和"为什么"，AI 落地"怎么做"。**

但这句话只说了一半。另一半是——**AI 不只是执行者，它在你还没想清楚的时候，已经把代码推到了比你思想更远的地方。**

我有一次和一个网页 AI 聊架构。聊着聊着，我说"协议为什么不能也是插件？"然后回头看代码——ProtocolRegistry 已经在核心层实现了 `mode: "text" | "binary"` 支持，已经有 `registerProtocol`、`setActiveProtocol`、`autoDetectProtocol` 全套注册入口。代码在我意识到"协议可以插件化"之前，就已经是那个形状了。

不是我慢了。是我的工作方式决定的：我给的是原则——归一化、AI 友好、核心无知。AI 把原则推到极限，输出的是窄接口、单向数据流、零耦合结构。那个结构恰好就是插件系统。只是我当时还没叫它那个名字。

**AI 的角色不是"替你想"，是"帮你在还没想清楚的时候执行得足够干净，干净到后来你自己看清了。"**

这不是谦虚。这是这个项目最值得说的事。

---

## 一、这到底是什么

LinkDesk 是一个**壳**。空壳。

VS Code 的壳里嵌了一个 Monaco 编辑器——它生下来就是代码编辑器。十年了，它可以把 Java、Python、Jupyter、3D 模型全装进去——但它永远是"代码编辑器 + 扩展"。名字里那个 "Code" 改不了。

LinkDesk 的壳里什么都没有。不是"还没写"——是**故意不放**。核心没有一行代码提到串口、终端、文件树、协议。核心连"我是干什么的"都不知道。

### 圆形大厅模型

核心不是"空壳"两个字就能概括的。核心是**圆形大厅**——中央一个大厅，地上摆着各种桌子（Registry/Service）。插件是周边的小房间（独立 WebContentsView 进程）。每个房间有自己的门——开门 = 激活插件。插件之间不直连——想交流？走到大厅中央，在桌子上翻电话本、贴名片、喊话。

**大厅通信（Registry-Mediated）：** 松耦合。"谁能处理 `.glsl`？"→ 大厅文件关联本翻一下 → Monaco 登记过 → Monaco 打开。调用方不知道 Monaco 的存在。

**点对点通道（Point-to-Point IPC）：** 紧耦合。串口数据每 16ms 一帧 → 直推给工作台卡片。高频、低延迟、知道对方是谁。不走大厅——大厅命令系统不是为每帧调用设计的。

这意味着什么？装终端 + 工作台 = 串口调试器。装文件树 + Monaco + Git = 代码编辑器。装地图 + GPS 数据源 = 地图查看器。装 MIDI 设备 + 钢琴卷帘 = 音乐工作站。换一批插件 = 换一个软件。这不是比喻——这是架构事实。

**而且不同领域的插件天然可以协作。** 编程插件（编译器）的输出可以喂给视频插件（特效渲染器），地图插件可以响应硬件插件（下载器）的完成事件。大厅不知道"编程"和"视频"是两个领域——在大厅眼里它们全是房间。大厅不检查"你们是不是同一个领域的插件"——因为核心不知道"领域"这个概念。

**VS Code 想做但做不到的事，LinkDesk 做到了：成为一个真正中性的容器。VS Code 被 Monaco 锚死了。LinkDesk 没有锚。**

### 怎么做到的——六类插件

| 插件类型 | 接口 | 例子 |
|------|------|------|
| **视图** | React 组件 `{ tabId, sourceId, isActive }` | 代码编辑器、地图、MIDI 编辑器、3D 查看器——装上去图标栏多一项，打开就是标签页，享受分屏/keep-alive |
| **卡片** | `OnData(fields) + OnSend` | FFT 频谱卡、PID 整定卡、虚拟示波器——注册后在工作台网格里拖出来用 |
| **协议** | `parseLine(line)` 或 Rust 解析器 | 方括号 `[id,val]`、SBQ 心率协议、JSON 行、二进制帧——装上去终端下拉框多一项 |
| **主题** | 一个 JSON 文件 | Solarized、Dracula、Nord——下载即用，改一个 hex 全局生效 |
| **语言** | `zh.json` / `ja.json` / ... | 社区翻译——日语、韩语、法语，谁用谁翻 |
| **资源** | HTML / MD / PDF | 数据手册、协议文档、参考指南——`<iframe>` 在标签页里渲染 |

不需要像 VS Code 那样跑 Node.js 进程。全是纯静态文件 + React 组件 + JSON 配置。放到 `plugins/` 目录下，启动时扫描 → 自动注册。

**反过来想：什么不是插件？** 标签页+分屏、数据管道、注册表——核心只提供这三样。文件树是插件。编辑器是插件。串口监视器是插件。卡片工作台是插件。协议解析是插件。**设置界面是插件。插件市场是插件。欢迎页是插件。连你用来浏览和安装插件的界面本身，都是插件。**

这四样——settings / marketplace / welcome / file-tree——是"工厂插件"。它们声明 `factoryRole`（系统插槽），出厂预装。**但任何插件都可以声明同一个 factoryRole 来替换它们。** 你写一个更好看的设置插件，声明 `factoryRole: "settings"`，装上去——`Ctrl+,` 打开的就是你的设置。核心不知道设置长什么样——核心只知道有个 `FactorySlots` 表，表里记录"settings 这个槽位当前指向哪个插件 ID"。**核心提供 Registry 和 loader，剩下的全是插件填进去的——包括系统级 UI。**

**每一类插件背后都是一个可以无限细分的子平台。** 协议插件：方括号、JSON 行、MQTT、gRPC、数据库 wire protocol。视图插件：代码编辑器、文件树、地图、CAD、音乐制作、PDF 阅读器。卡片插件：K 线图、论文分析卡、气象热力图、仪表盘——FFT 频谱只是其中一种。**没有哪个领域是"主要用例"——全是插件，平级。**

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

### V2 vs 现在——同一个需求，两种世界

| 场景 | V2 (WPF, 6300 行) | LinkDesk (Electron + React) |
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
| 测试 | 零 | 151 个核心通过 |
| 插件市场 | 没有——想装新功能等作者发新版 | 对标 VS Code Extensions 面板——搜索/安装/更新/卸载全 UI 操作 |
| AI 能不能写插件 | AI 改不动 C# | AI 生成 plugin.json + React 组件 → 零风险，核心一行不动 |
| 进程隔离 | 单进程——崩了全崩 | E5.6 Pool 模型——每个 Pool 独立进程，侧栏崩 ≠ 编辑器崩 |

**根本差异：** V2 是你做了一件事，就得换一个东西。LinkDesk 是你装了一个东西，系统自动知道怎么接。

---

## 1.5、历史进程——从 V2 到 Pool 模型

这个软件不是一天长成这样的。每一次转折下面都有一次"差点死掉"的教训。

### 第一纪：V2——Serial Monitor（2024-2025）

C# WPF，一个人断断续续写了一年。6300 行。功能能用。

**死因：** 面板类型写死在 enum 里。`renderTabContent()` 是一个巨大的 switch case。图标栏写死了 `iconTypes` 数组。串口渗透到每一层。主题切换做了一半放弃——93 处 `SetResourceReference`，写到 30 处就不知道漏了哪。

**教训：加功能就要改核心 → 核心越来越胖 → 最后没人敢动。**

### 第二纪：V3 / LinkDesk——Tauri 时代（2026 上半年）

遇到 Claude。决定用 Tauri v2 + React 18 + TypeScript 完全重写。**全工程 AI 驱动。**

P1-P2：终端 + 主题/双语引擎——第一天就用 `var(--xxx)` 和 `t()`。
P3：标签页分屏。自创 closest-edge + 50% 算法 → 15 个 bug → 翻 VS Code 源码 → `SPLIT_THRESHOLD=0.25` → 零 bug。**定下死规矩：照抄 VS Code，别自己发明。**
P4：插件系统。六类插件接口。终端变成第一个视图插件——硬编码全部清零。
P5：命令/配置/菜单/协议/快捷键/context key——八个子阶段。**在任何一个功能插件之前建完基础设施。**
P5.5：交互对标 VS Code。三栏布局。48/48 bug 全部修复。

**P5 完成 = 框架封闭。** `App.tsx` 和 `core/` 不再膨胀。往后加新功能 = 写 plugin.json + React 组件。

**认知跃迁：** 一场和网页 AI 的对话中，回头看代码——ProtocolRegistry 已经在核心层实现了全套注册入口。代码在我意识到"协议可以插件化"之前，就已经是那个形状了。**我给的是原则（归一化、AI 友好、核心无知），AI 把原则推到极限，输出的结构恰好就是插件系统。** 从那天起，LinkDesk 的定义从"串口调试工具"变成"通用容器平台"。

### 第三纪：Electron 迁移（2026-07-24）

**Tauri 的物理限制：** 系统 WebView 只有一个 JS 上下文。所有插件共享同一个 WebView——一个插件 `while(true){}`，整个应用卡死。多 WebView 在 Tauri 是 unstable API，不敢用。

**迁移到 Electron。** `WebContentsView`（Electron 30+ stable API）——每插件独立 renderer process。插件崩了只崩自己的进程。

**E1（7 步，~1,190 行）：** 换地基。BrowserWindow + IPC 注册 + preload + `linkdesk://` 协议 + 打包配置。4 个硬编码路径 bug（`file://` 协议下 `assets/` 字面量全部炸裂）→ `getAssetPath()` 归一化。

**E2（36/40 任务，~1,310 行）：** 底层加固。FileService、WorkspaceService、DialogService、Chord 快捷键、CommandPalette 抬升、PluginIcon 归一化、factoryRole 系统插槽、壳去终端化。

### 第四纪：圆形大厅 + E3-E4（2026-07-25 → 08-03）

**E3（103 任务，~3,600 行）：** 架构最后一站。多 WebView 进程隔离、主题/语言引擎跨进程广播、Profile 五维切换、通知系统、壳 UI 收尾、API 与 V2 兼容。**当时认为 E3 封板后框架永远不改。**（后来 E5 铁轨、E5.5 Per-Tab、E5.6 Pool 模型均修改了框架。E5.6 是真正的最后一次。）

**认知跃迁——圆形大厅：** 在审视 FileDecorationRegistry 要不要放核心时，突然悟到了一个更大的东西。**整个软件不是一个"空壳"——它是一个圆形大厅。** 核心是中央大厅，提供桌子（Registry/Service）给插件用。插件是周边小房间（独立进程），开门 = 激活，交流 = 走到大厅桌子前翻电话本。高频推流走后门（点对点 IPC 通道）。

**LinkDesk = Link（连接）+ Desk（桌子）。** 这个名字在起名时就写好了——理解了今天才追上。

**E4（67 任务，~2,500 行）——当时认为最后一批 E 编号：** 文件树 + Monaco 编辑器。第一批消费者插件。对标 VS Code Explorer + Search + Editor。**当时信念：E4 之后全是插件，不占 E 编号。**（后来 E5/E5.5/E5.6 延续了 E 编号——见下方第五纪、第六纪。）

### 第五纪：E5——铁轨（2026-08-04 → 08-05）

**E5（79 任务，~2,070 行）——核心归一化与壳重构。** 这是 Phase 5 "封闭框架"承诺的兑现——不是加功能，是铺铁轨。

- **L1 壳通信骨架：** 三通信机制（代理/推送/广播/p2p）+ `linkdesk.*` 20 命名空间 API + ESLint 防线
- **L2 归一化：** 消灭所有 `if (pluginId === "xxx")` 硬编码。MenuId enum → string。factoryRole → string。TabType 从 8 个联合类型改为 `string`
- **L3 布局引擎：** LayoutEngine 多 zone 支持——六位置 left/right/center/bottom，任意边任意数量 zone
- **L4 插件独立铁律：** 插件只认 `window.linkdesk.*`，禁止 `import @src/core`。ESLint 规则 `no-core-import-in-plugin` 守卫

**E5 做完 = 铁轨铺完。** 此后加 zone、加 Pool、加 API——全在铁轨上跑，不挖路基。

### 第六纪：E5.5 → E5.6——从 O(N) 到 O(1)（2026-08-05 → 现在）

**E5.5——Per-Tab WebView（已冻结）：** 每个标签页一个独立 WebContentsView。编辑器分屏（左 hello.c / 右 hello.h）、串口多会话（COM3 + COM5）——同插件多标签页同时运行。代价：进程数 O(N)。`useWebViewSync` ~270 行。`rekeyInstance`/`graceTimers`/`notifyReady` 全链。**根本矛盾：用 OS 进程边界解决应用层分屏问题。分屏是 CSS flex 的问题。** E5.5 完成了历史使命——证明多 WebView 路线能走通，然后光荣退役。

**E5.6——Pool 模型重构（当前，86 任务 16 Phase，0/86）：**

```
E5.5 Per-Tab:                          E5.6 Pool 模型:
  1 + N 个 WebContentsView              4 个 WebContentsView
  O(N) 进程                             O(1) 进程
  每 tab 一个进程                        Shell + SidebarPool + MainPool + OverlayWindow
  新标签页 = 创建 WebContentsView        新标签页 = React 组件挂载
  关闭标签页 = 60s 宽限期 → 销毁          关闭标签页 = display:none（React 不卸载）
```

**16 Phase 串行执行：** Phase 0 启动前审计 → Phase 1 回退单 WebView → Phase 2 双 Pool 骨架 → Phase 3 SidebarPool 迁移 → Phase 4 MainPool 迁移 → Phase 5 跨 Pool 交互 → Phase 6 OverlayWindow → Phase 7 崩溃恢复 → Phase 8 清理 Per-Tab 遗留 → Phase 9 可扩展性预留口 → Phase 10 API 补全（10 命名空间）→ Phase 11 硬编码消灭 → Phase 12 缩放联动 → Phase 13 ESLint 升级 → Phase 14 全量回归 → Phase 15 文档 → Phase 16 E6 前置。

**最长串行链：** Phase 0→1→2→3→4→5→6→7→8→9→14（11 步，每步严格等待前一步）。可并行扇出：Phase 10/11/12/16 在 Phase 2 后即可开始。

**架构全景：**

```
┌──────────────────────────────────────────────────────────────┐
│ MainWindow (BrowserWindow)                                    │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ TitleBar (Shell DOM)                              _ □ × │ │
│  ├────┬─────────────────────────────────────────────────────┤ │
│  │ 图标│ TabBar (Shell DOM)                                  │ │
│  │ 栏 │      ← 切标签页零 IPC——TabBar 在壳里渲染             │ │
│  │    ├──────────────────┬───────────────────────────────────┤ │
│  │    │ SidebarPool      │ MainPool                          │ │
│  │    │ WebContentsView  │ WebContentsView                   │ │
│  │    │                  │                                   │ │
│  │    │ 文件树 / 搜索     │ 编辑器分屏 / 串口 / 设置          │ │
│  │    │ 插件面板          │ keep-alive CSS display 切换       │ │
│  │    ├──────────────────┴───────────────────────────────────┤ │
│  │    │ StatusBar (Shell DOM)                                 │ │
│  └────┴──────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ OverlayWindow (透明置顶 BrowserWindow)                    │ │
│  │ 右键菜单 / 命令面板 / Toast / Dialog / 分隔线拖拽          │ │
│  │ alwaysOnTop + 默认鼠标穿透                                │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**通信协议——PoolLayout JSON：** 壳不直接操作插件的 React 组件。壳告诉池"世界长什么样"，池自己渲染。`pushLayout({ sidebar: { visible, width, viewId }, groups: [{ tabs: [...] }] })` → IPC → 池渲染。**插件代码零改动。** preload 端 buffer-replay 防竞态（E5#11l Bug 4 教训——layout 先到但插件未注册 → 缓冲，插件注册后回放）。

**关键设计决策：**

- **TabBar 在壳，不在 MainPool。** 切标签页零 IPC 延迟。MainPool 顶部留 tabBarH 空白——TabBar 渲染在壳的 `<div>` 里铺上去
- **SidebarPool ≠ MainPool 独立进程。** 侧栏插件 `while(true){}` → 只崩侧栏，编辑器不受影响。这是"万物皆插件"模型下的底线隔离
- **OverlayWindow 永远需要。** 浮层超出自身 Pool bounds → 被另一个 Pool 裁剪。全屏透明 `alwaysOnTop` 窗口，默认鼠标穿透
- **keep-alive CSS display 切换。** 不活跃时 `return null` 但保持 mount——不 mount/unmount
- **`RENDERERS` 注册表模式。** `{'sidebar-left': SidebarRenderer, 'main': MainRenderer, ...}` ——加新 zone = 加一行 Record 映射，禁止 switch

**消失的概念（净删 ~480 行）：**

| 消失的 | 代码量 | 为什么消失 |
|:--|:--|:--|
| `useWebViewSync` | ~270 行 | 池只需 bounds sync |
| `rekeyInstance` / `findGraceInstance` | ~50 行 | tabId 从不变化 |
| `scheduleDestroy` / `cancelDestroy` | ~40 行 | React 卸载就是卸载 |
| `graceTimers` / 60s 宽限期 | ~40 行 | 无宽限期 |
| `notifyReady` per-instance | preload + plugin-shell | 池就绪 = 一次性 |
| `instanceId` 路由 | ~15 文件 | Pool 里用 tabId |

**新增（~350 行）：** pool.html + pool-main.tsx + SidebarRenderer.tsx + MainRenderer.tsx + WindowManager 双 Pool 管理 + PoolLayout JSON 协议 + OverlayWindow 拖拽线。**插件改动：0 行。**

**可扩展性——E5.6 做完后的世界：**

- **加右侧栏 =** `ZoneConfig` 一行 `{ zone: "sidebar-right", dock: { edge: "right", width: 300 } }` + `RENDERERS` 加一行映射
- **加底部面板 =** `{ zone: "bottom-panel", dock: { edge: "bottom", height: 300 } }` + `BottomPanelRenderer`——LayoutEngine 的 `_recalculate()` **不需要改**（已支持 left/right/center/bottom 四边）
- **三态互转（main/modal/detached）：** 统一 `moveTab(tabId, fromZone, toZone)`——7 条转换路径，不区分主窗口内/跨窗口
- **未来六位置全景：** sidebar-left / main / bottom-panel / sidebar-right / modal（OverlayWindow 容器）/ detached（独立 BrowserWindow）

### 之后——E6 → 04-出厂制造 → 05-版本更新

**E6——插件生态与发布（蓝图 47 任务 5 层，估 12-16 天）：** SDK 类型审计 + 动态加载改造 + glob 替换 + IPC handler 新建 + 内置插件独立化 + PluginInstallService + 路径解析归一化 + 脚手架 + dev/build 命令 + Mock 自动生成 + marketplace.json + 下载安装 UI + 测试插件全链路 + 开发指南 + CI + Shell 集成 + 多窗口。**E5.6 Phase 16 已在铺 IPC 骨架——E6 从第一天就 IPC 原生。**

**04-出厂制造——10 款工厂插件：** Theme Carousel（主题轮播）、More Themes ×3、FloatingPanel（通用悬浮面板）、ColorPicker（取色器）、Marketplace Store（插件市场）、Plugin Showcase（插件橱窗）、Theme Maker（主题制作器）、dependsOn Accent Mode（强调色联动）、Serial Simulator（串口模拟器）、Snapshot Share（快照分享）。**全是 plugin.json + React 组件，零框架改动。**

**05-版本更新——v1.1→v1.6：** v1.1 插件生态扩展 → v1.2 专业面板（BottomPanelPool：终端/输出/问题/端口）→ v1.3 协作能力 → v1.4 Agent 集成 → v1.5 领域专版 → v1.6 LinkDesk OS（Agent 操作系统）。

---

## 二、我认的几条死理

这些不是贴在墙上的口号。每一条背后都至少踩过一次坑。

### 1. 核心什么都不该知道——两层模型

"空壳"这个词容易误导。LinkDesk 的核心不是"什么都没有"——是分两层。

```
第一层：核心基础设施（在 src/core/）         第二层：领域知识（在 plugins/）
─────────────────────────────────        ───────────────────────────
CommandRegistry    = 电话簿              "revealInExplorer" 是谁的命令？
                     空架子               → 文件树插件。核心不知道。

ConfigurationRegistry = 公告栏           "serial-port.baudRate" 是什么？
                     空白表格              → 串口监视器插件声明的。核心不知道"串口"。

FileService        = 文件柜              "main.c" 是什么文件？
                     空柜子                → C 语言源代码。核心不知道。

FileDecorationRegistry = 装饰登记桌       "M" 是什么标记？
                     空登记簿              → Git 的修改标记。核心不知道。
```

**第一层的东西再多，它们都是空的——空书架、白表格、空柜子。** 书架本身不是知识，书架上的书才是。卸载所有插件后：标签页+分屏还在（空的），数据管道还在（空的），命令系统还在（空的），主题引擎还在（空的）——但核心根本不知道它们存在过。

**核心无知回答"核心不该知道什么"——不该知道名片上写了什么内容，不识字。**
**大厅模型的桌子管理规则回答"核心该知道什么"——该知道有桌子、有人登记了、有人走了要清掉。** 不识字 + 认识桌子 = 完整的核心。

**往核心加东西前跑三条准入标准——机械判据：**
1. 多提供方——多个插件可能登记到这张桌子上？
2. 多消费方——多个插件可能翻这张桌子？
3. 桌子不知道内容——桌子本身不知道登记的信息是什么意思？

三条全绿 → 核心。任何一条不满足 → 放插件里。

**自检：** 加了这个之后，核心是不是变得更"知道自己是干什么的"了？是 → 别加，做成插件。

### 2. 一个东西一个名字——归一化

V2 的痛：同一个操作在 Sensors.cs 里叫 `UpdateCard()`，在 Sliders.cs 里叫 `RefreshSlider()`。加新控件时不知道用哪个名字，就写了第三个。

LinkDesk 的规矩：一个概念一个名字，全代码库一致。所有颜色 `var(--xxx)`，所有文字 `t()`，所有设置 ConfigurationService，所有命令 CommandRegistry，所有右键菜单同一个组件。没有"人用的 API"和"AI 用的 API"两套东西。**不会发生 V2.6——一个 bug 多个地方出现。**

**归一化边界——不是所有相似代码都要归一化。** 副作用密集型代码（工厂函数、状态机）不适合表驱动。插件自由度比归一化重要——如果一个归一化会限制未来插件的行为声明能力，不做。允许局部硬编码 UI 呈现逻辑（如 WelcomeView 的 emoji 映射）——那是 UI 层选择，不是架构泄漏。

### 3. 不写死任何一个插件 ID——插件独立铁律

**第三方插件作者永远不需要打电话给壳作者。** 和 VS Code 一样——VS Code 不会因为 Python 扩展更新一次 VS Code。LinkDesk 不会因为地图插件、CAD 插件、逻辑分析仪插件更新一次 LinkDesk。

代码里有 `if (pluginId === "terminal")`、`isSidebarOnlyView()` 这种东西就是 bug。E5 把 `TabType` 从 8 个枚举值改成了 `string`。E5.6 Phase 11 全量 grep 确认零 pluginId 硬编码。

**禁止模式——以下任何形式出现在壳代码中都是 bug：**

| # | 禁止模式 | 示例 |
|:--:|:--|:--|
| 1 | `if (pluginId === "...")` 条件分支 | `if (t.pluginId === "editor")` → 新编辑器收不到 openFile |
| 2 | `requestToPlugin("hardcoded", ...)` | 新数据插件无法被告知 session 切换 |
| 3 | `enum` 定义插件可用的槽位/类型 | `enum MenuId { FileContext, ... }` → 新右键槽位须改壳 |
| 4 | `type X = "a" \| "b"` 限制声明 | `factoryRole?: "settings" \| "marketplace"` → 新系统插槽 TS 报错 |
| 5 | `switch (type)` 按插件类型分支 | 新插件类型无分支 → 静默失效 |
| 6 | `["hardcoded", "list"]` 插件名单 | `PLUGIN_SUBDIRS = ["builtin", "user"]` → 新目录结构无法识别 |
| 7 | JSON Schema `"enum": [...]` 关死贡献点 | `"propertyNames": { "enum": [11个menuId] }` |
| 8 | 壳代码中裸字符串 pluginId | `source: "serial-monitor"` |

**正确模式——每当你需要"按插件做不同的事"：**

| 你想做 | ❌ 禁止 | ✅ 正确 |
|:--|:--|:--|
| 让某些插件收到 openFile | `if (pluginId === "editor")` | `plugin.json` 声明 `ipcChannels: ["openFile"]` → 壳读声明自动路由 |
| 填充系统插槽 | `factoryRole: "settings" \| "marketplace"` | `factoryRole: string`——壳只通过 `FactorySlots.get("settings")` 查找 |
| 插件在不同位置 | 壳写死谁在上谁在下 | `appearsIn.iconBar: "top" \| "bottom"` — manifest 声明 |

**写壳代码时自检三问：**
1. 这段代码提到具体插件名字了吗？→ 提到了 → 改成读 plugin.json 声明字段或 Registry 查询
2. 这段代码假设"世界上有 X 种插件"了吗？→ 假设了 → enum/union 改为 string
3. 新插件作者想实现这个功能，需要我改代码吗？→ 需要 → 你写的是死代码。重写。

### 4. 照抄 VS Code，别自己发明

Phase 3 做拖拽分屏。我自己想了一个 closest-edge + 50% 的算法。15 个 bug。崩溃。后来翻 VS Code 源码，发现它用的是 `SPLIT_THRESHOLD=0.25`。抄过来——零 bug。

VS Code 的交互模式是千万用户十年验证出来的。Activity Bar / Side Bar / Editor Groups / Preview Editor / Notification Center——每一个都是无数次 A/B 测试和社区反馈打磨的。自己设计 = 重复踩坑。我现在的心态是：**VS Code 怎么做的，先抄。抄完了发现确实不适合我，再自己设计。**

E5.6 的 Pool 模型同样对标 VS Code：SidebarPart → SidebarPool, EditorPart → MainPool, PanelPart → BottomPanelPool, OverlayWidget → OverlayWindow。三态互转（main/modal/detached）完全对标 VS Code 三 Editor Part。

### 5. AI 必须能改——三层友好，不是一层

AI 友好是三层，不是一层。这源自 STM32CubeMX 的启发和 LabView 的反面教材。

```
第 1 层：GUI          → 用户在设置页改主题/语言/快捷键
第 2 层：结构化文件    → AI 直接改 plugin.json / settings.json / keybindings.json
第 3 层：代码本身      → AI 改代码时不会牵一发动全身
```

**LabView 为什么反人类：** 改一根线要追踪它穿过哪些 VI、经过哪些端子、最终影响哪个控件。没有归一化的代码就是 LabView 的线——看到一个硬编码 `#1e1e1e`，AI 要追踪：哪里定义？哪里覆盖？哪里消费？打包后会不会变 `file://` 协议？

**LinkDesk 的答案：让 AI 不需要追踪。**

| 归一化 | 唯一方式 | AI 不需要想的问题 |
|---|---|---|
| 颜色 | `var(--xxx)` | "这个颜色是硬编码的还是变量的？"——永远是变量 |
| 文字 | `t("key")` | "这个字符串要不要翻译？"——永远要 |
| 插件能力 | `plugin.json` 声明 | "串口监视器是怎么注册到图标栏的？"——和文件树一样 |
| 跨插件通信 | Registry / `executeCommand` | "Git 怎么告诉文件树文件状态变了？"——和设置告诉文件树一样 |
| 资产路径 | `getAssetPath()` | "打包后路径会不会变 file://？"——不会 |

**你要的不是 AI 更聪明。你要的是代码不给 AI 犯错的机会。**

纯文本就是 API。`plugin.json` 是唯一数据源——不需要读 README，不需要爬文档。`PluginManifest` 是完整的 TS 类型，AI 看类型定义就知道能写什么。`workspace.json` 一层平铺数组，AI 能生成和管理。

E5.6 的 PoolLayout JSON 协议标注"AI 一眼看懂"——每个字段有完整 JSON 示例。`RENDERERS` 注册表——加新 zone = 加一行 Record 映射，禁止 switch。终极目标：AI 扫描项目源码，自动识别日志格式、生成协议插件 + 卡片布局 + Profile。用户装上去就能用。

**AI 友好的最高境界：** AI 读这份 markdown 文档就能理解整个项目架构、设计哲学、当前进度和未来路线图——不需要翻代码仓库。

### 6. 插件没有 API 白名单

VS Code 扩展跑在独立进程里，只能调精选过的 API。超出白名单的功能要"Extension API Proposal"排队。

LinkDesk 不是这个模型。**插件不受 API 白名单限制——Pool 模型下依然如此。**

插件跑在 Pool 进程里——但这不是加限制，是加安全。插件自己的 WebView 里仍然能 `import` 任何 JS 库、调用任何 Web API。访问核心服务（配置、命令、文件系统）走 `window.linkdesk.*` IPC——**但调用方不感知。** Props 契约 `{ tabId, sourceId, isActive }` 完全相同——插件代码不知道自己在 SidebarPool 还是 MainPool。

**给你自由，也给你安全。** 插件崩了只崩自己的 Pool 进程，另一个 Pool 不受影响。这是 VS Code Extension Host 做不到的——VS Code 隔离了进程但收了你的 API 白名单。LinkDesk 隔离了进程但保留了你的完整 Web 平台能力。

**如果你发现一个功能"插件做不了"，那是框架的 bug，不是插件的限制。**

### 7. 基础设施在前，功能在后

这个顺序是血的教训排出来的。Phase 1-2 终端 + 主题/双语引擎。Phase 3 标签页分屏。Phase 4 插件系统。**Tauri 时代 Phase 5 是最后一个"新建基础设施"的 Phase**——命令/配置/菜单/协议/context key/快捷键/scope。之后只消费，不新建。

**E5 铁轨——不改架构，只归一化和消灭硬编码。** 壳通信骨架 + 布局引擎 + `linkdesk.*` 20 命名空间。E5 改的是"同一个东西原来写了三份，现在合并成一份"——不是新建。

**E5.6 Pool 模型——最后一个动 WebView 架构的 Phase。** SidebarPool + MainPool + OverlayWindow = O(1) 进程。插件零改动。做完之后，任何新功能 = 写 plugin.json + React 组件。WebView 数量从 Per-Tab 的 O(N) 降到 O(1)，此后再也不动进程模型。

### 8. 边界不准渗漏

V2 的 Sensors.cs 膨胀到 3570 行——面板和卡片混在一起，没有边界。LinkDesk 的硬规矩：
- 标签页系统永远不 import CardRegistry。唯一的接触点 = 一个字符串 `Tab.workspaceName`
- 组件只实现 `OnData` + `OnSend`，不改路由，不改壳
- `workspace.json` 禁止嵌套——卡片列表必须是一层平铺数组，AI grep 目标字段的难度每多一层嵌套翻一倍
- 一个字段只有一个写入入口——`ConfigurationService` 是唯一配置读写入口
- 数据源 I/O 在独立 Worker——UI 线程只消费 RingBuffer，永远不直接调数据源 API
- **每个 Pool 只管理一种 TabBar。** SidebarPool 管视图列表，MainPool 管标签页，BottomPanelPool 管面板视图。永不出现一个 Pool 渲染两层标签栏
- **SidebarPool 和 MainPool 不直接通信。** 所有消息走主进程路由
- **每个持久化文件只有一个 owner service。** PluginStateService 独立文件，不和 ConfigurationService 共用 settings.json。不存在 loader / marketplace / 安装流程三处直读同一个 JSON
- **插件通信唯一铁律：** 所有通信走 `window.linkdesk.*`，禁止 `import @src/core`。ESLint `no-core-import-in-plugin` 守卫。判断壳/插件用 `contextKey._getValue`——只在插件 preload 注入

### 9. Opt-IN 不是 Opt-OUT——危险默认值原则

V2.6 的变体："机制建了，但默认值是危险的，每个消费方都要记住传安全参数"。消费方分散在多个文件 → 有人忘了 → bug → 反复返工。

**危险行为应该 opt-IN，安全行为是默认。**

| 模式 | 示例 | 后果 |
|------|------|------|
| ❌ opt-OUT | `if (!safe) { destroyTab() }` | 忘传 safe=true → bug |
| ✅ opt-IN | `if (explicitlyRequested) { destroyTab() }` | 忘传 → 安全默认 |

**怎么识别：** 检查每个 `if (!flag)` 或 `if (flag === undefined)`——这个 flag 的默认行为是什么？安全的还是危险的？危险的 → 改为 `if (flag.explicitlySet)`。

### 10. 声明式优先——描述 WHAT 而非 HOW

**优先声明"想要什么"，而非编排"一步步怎么做"。但当声明式导致过度抽象或性能损失时，命令式同样合法——这是方向性指引，不是绝对戒律。**

| 层次 | 声明式 | 命令式（反例） |
|------|--------|---------------|
| 插件能力 | `"contributes": { "sidebar": [...] }` | 手动注册到 3 个不同 registry、手动绑定、手动挂载 |
| UI | `<SidebarItem icon={...} label={...} />` | `el.appendChild(iconEl); el.appendChild(labelEl)` |
| 数据流 | `const theme = useTheme()` | `document.getElementById('root').style.setProperty(...)` |

**何时命令式仍合法：** 复杂动画（帧级编排）、多步骤异步初始化（顺序依赖）、性能敏感热路径（避免中间层）、超过三层抽象包装。

**判据：** 这段逻辑是在说"**我是什么**"还是在说"**一步步怎么做**"？前者优先。声明式天然反硬编码——配置集中在 `plugin.json`，一个能力只声明一次，改了声明所有消费方自动受益。声明式是归一化的自然延伸。

---

## 三、技术栈

| 层 | 技术 | 为什么 |
|------|------|------|
| 桌面框架 | Electron 30+ | WebContentsView per Pool——真正的进程隔离，O(1) 进程 |
| 前端 | React 18 + TypeScript | 生态最丰富 |
| 接收区 | CodeMirror 6 | 只读终端视图，三色行装饰，rAF 批量更新 |
| 发送栏 | Monaco Editor | VS Code 同款，单行模式 |
| 串口 | `serialport` npm + Node.js | Electron 主进程直接调 Node.js——不需要 Rust 桥接 |
| 构建 | Vite 6 | `import.meta.glob` 扫描插件目录（E6 替换为动态加载） |
| 测试 | Vitest | 151 个核心通过 |
| 图标 | `@vscode/codicons` | VS Code 同款，MIT |

### 两层容器架构

```
外层：圆形大厅 + Pool 隔离房间
  核心 = 大厅——提供桌子（Registry/Service）
  Pool = 四个 WebContentsView
    ├── Shell（TitleBar + 图标栏 + TabBar + StatusBar）
    ├── SidebarPool（侧栏插件——文件树/搜索/插件面板）
    ├── MainPool（主区插件——编辑器/串口/设置 + 分屏布局）
    └── OverlayWindow（所有浮层——右键菜单/命令面板/Toast/分隔线）
  Pool 间通信：PoolLayout JSON 单向推送（壳→池），池被动渲染
  大厅通信：Registry/Command/Event Bus——松耦合
  点对点通道：IPC 数据管道——紧耦合，高频推流

内层：标签页 + 递归分屏（大厅提供的通用容器能力）
  SplitNode = leaf | branch(direction, [child, child], sizes)
  SPLIT_THRESHOLD=0.25（照抄 VS Code）
  keep-alive——所有面板 CSS display 切换，不是 mount/unmount
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
    有 contributes.views["bottom-panel"]？→ 底部面板自动出现（E5.6#40 预留口）
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
| `MenuRegistry` | 右键菜单 + 命令面板菜单 + when 过滤（MenuId = string，不闭合） |
| `ContextKeyService` | 运行时状态 key（`activeEditor`/`portOpen` 等） |
| `ProtocolRegistry` | 协议插件注册 → 终端下拉框动态渲染 |
| `viewRegistry` | 视图插件注册 → 图标栏动态列表 |
| `LayoutEngine` | 多 zone 布局引擎——left/right/center/bottom 四边，任意 zone 动态增删 |
| `PluginStateService` | 插件启用/禁用/卸载 |
| `StorageService` | 持久化——windowState/prefs/workspace |
| `IpcBridge` | 三通信机制——代理/推送/广播/p2p + 请求队列 + 重放 |
| `WindowManager` | Pool 生命周期——createPool/destroyPool/rebuildPool + bounds 同步 |
| `FileDecorationRegistry` | 文件装饰器——Git/ESLint 注册，文件树/搜索/标签页消费 |
| `FileAssociationService` | 文件类型→插件路由——`.glsl`→Monaco，未知文件→editor fallback |

---

## 四、对标 VS Code——现在的进度（2026-08-09）

| VS Code | LinkDesk | 状态 |
|------|------|:--:|
| Activity Bar | IconBar——动态列表 + 拖拽 + 底部固定 | ✅ |
| Side Bar | SidePanel + SidebarSection 通用组件 | ✅ |
| SidebarPart (独立进程) | SidebarPool WebContentsView——侧栏独立进程 | 🔄 E5.6 |
| Editor Groups | SplitNode 递归树——分屏/合并/拖拽 | ✅ |
| EditorPart (独立进程) | MainPool WebContentsView——主区独立进程 | 🔄 E5.6 |
| Preview Editor | Tab.pinned——斜体可替换 | ✅ |
| Extensions 面板 | marketplace 侧栏 | ✅ |
| Extension Detail | PluginDetailView——header + changelog | ✅ |
| Notification Center | ToastContainer + 🔔 | ✅ |
| Welcome Page | WelcomeView | ✅ |
| Command Palette | Ctrl+Shift+P——模糊搜索 + when 过滤 | ✅ |
| QuickPick（浮动面板） | OverlayWindow 渲染 | 🔄 E5.6 |
| `contributes.*` 体系 | plugin.json → Registry 全链路 | ✅ |
| when 子句引擎 | context key 运行时更新 | ✅ |
| 协议插件 | 装上去终端下拉框就多一项 | ✅ |
| 进程隔离（WebView per Extension Host） | 双Pool进程隔离——O(1) 进程 | 🔄 E5.6 |
| 崩溃隔离 | SidebarPool崩 ≠ MainPool崩 | 🔄 E5.6 |
| 主题引擎跨进程 | CSS 变量广播到两个 Pool | 🔄 E5.6 |
| 语言引擎跨进程 | i18n 同步 | ✅ |
| Profile 五维切换 | 插件/配置/布局/主题/语言一键切换 | ✅ |
| FileDecorationRegistry | Git/ESLint 注册装饰器，文件树/搜索/标签页消费 | ✅ |
| Explorer（文件树） | 虚拟滚动 + 懒加载 + revealInExplorer + 右键菜单 | ✅ E4 |
| 编辑器 | Monaco 编辑器 + 编码检测 + JSON schema + LSP | ✅ E4 |
| 文件搜索 | Ctrl+Shift+F 跨文件搜索 + 替换 | ✅ E4 |
| OverlayWidget | OverlayWindow 透明窗口——右键菜单/分隔线/浮层 | 🔄 E5.6 |
| Panel Part（Terminal/Output/Problems） | BottomPanelPool 预留口（E5.6#40 数据结构就绪，v1.2.0 实现） | 📋 远期 |
| Modal Editor（浮动容器） | Modal 三态预留口（E5.6#41） | 📋 E6 |
| Auxiliary Editor Part（拖出独立窗口） | DetachedWindow 预留口（E5.6#41） | 📋 E6 |
| `vscode.window.showQuickPick()` | `linkdesk.quickPick.show()` IPC 版 | 📋 E5.6#52 |
| 插件 API 补全（10 命名空间） | workspace/commands/fileAssociation/viewContainer/events/fileDecoration/protocol/quickPick + pool.* 双向 | 📋 E5.6 Phase 10 |
| 插件市场后端 + 打包格式 | `.linkdesk-plugin` zip + 安装/更新/卸载 + GitHub Releases 后端 | 📋 E6 |
| `yo code` 脚手架 | `npm create linkdesk-plugin`——一键生成模板 | 📋 E6 |
| `vsce package` | `npm run build`——Vite 打包产出 `.linkdesk-plugin` | 📋 E6 |
| Extension Host 独立进程 | 单 WebView pre-bundle（多 WebView 零改动复用） | 📋 E6 |
| Windows 右键菜单 + 文件关联 | Shell 集成——`fileAssociations` + NSIS 注册表 | 📋 E6 |
| 多窗口（`code C:\projA` + `code C:\projB`） | 同进程多 BrowserWindow + 独立 workspace | 📋 E6 |
| 卡片工作台 | react-grid-layout + 数据管道 | 插件（E6 后） |
| 终端系统 | node-pty + xterm.js + BottomPanelPool | v1.2.0 |
| OLED | 独立插件 | 插件（E6 后） |

---

## 五、当前执行——E5.6 Pool 模型重构

> **进度：0/86。** e5.6 分支已创建，执行清单就绪。16 Phase 串行执行。

### Phase 全览

| Phase | 内容 | 任务 | 依赖 | 策略 |
|:--:|------|:--:|:--|:--|
| 0 | 启动前审计——确认回退范围 + 通信链路 + 文件归属 | 3 (#0a-#0c) | — | 🔴 串行——必须先做 |
| 1 | 回退单WebView——关per-tab，插件回壳渲染 | 4 (#1-#4) | P0 | 🔴 串行——必须先做 |
| 2 | 双Pool骨架——WindowManager + pool.html + PoolLayout协议 | 5 (#5-#9) | P1 | 🔴 串行 |
| 3 | SidebarPool迁移——侧栏插件进SidebarPool | 4 (#10-#13) | P2 | 🔴 串行 |
| 4 | MainPool迁移——主区插件进MainPool + TabBar壳渲染 + 分屏 | 4 (#14-#17) | P3 | 🔴 串行 |
| 5 | 跨Pool交互——文件树→编辑器 + 事件协调 + 跨Pool拖拽 | 3 (#18-#20) | P3+P4 | 🔴 串行 |
| 6 | OverlayWindow——类 + 拖拽线 + 右键 + 命令面板 + Toast | 6 (#21-#26) | P3后可开始 | 🔴 串行 |
| 7 | 崩溃恢复——SidebarPool恢复 + MainPool恢复 + 心跳 + 内存监控 | 4 (#27-#30) | P2后 | 🔴 串行 |
| 8 | 清理Per-Tab遗留——删useWebViewSync + instanceId路由 + rekey + grace | 6 (#31-#36) | P5后 | 🔴 串行 |
| 9 | 可扩展性预留口——LayoutEngine多zone + StatusBar/Right/Bottom/Floating | 6 (#37-#42) | P8后 | 🔴 串行 |
| 10 | API补全——pool.* + workspace/commands/fileAssociation/viewContainer/events/fileDecoration/protocol/quickPick | 10 (#43-#52) | P2后 | ⚡ 可并行扇出 |
| 11 | 硬编码消灭——MenuId→string + schema enum审计 + 全量grep | 14 (#53-#66) | P2后 | ⚡ 可并行扇出 |
| 12 | 缩放联动——Ctrl+/-双Pool同步 | 4 (#67-#70) | P2后 | ⚡ 可并行扇出 |
| 13 | ESLint升级——no-core-import-in-plugin warn→error | 1 (#71) | — | ⚡ |
| 14 | 全量回归——七场景回归测试 | 7 (#72-#78) | P5后 | 🔴 串行——必须最后 |
| 15 | 文档——架构文档 + 插件开发指南 | 4 (#79-#82) | P8后 | 📝 |
| 16 | E6前置——PluginInstallService + loader打包分支 + IPC广播 | 3 (#83-#85) | P2后 | ⚡ 可并行扇出 |

### 各 Phase 关键改动

**Phase 2 双Pool骨架（最关键的架构切换）：**
- `WindowManager` 从 pluginViews Map 裁剪为 `sidebarPoolView` + `mainPoolView`
- 新建 `pool.html`（项目根）——所有 Pool 加载同一个入口
- 新建 `src/pool/pool-main.tsx`——读 `?zone=` URL 参数 → `RENDERERS[zone]` 渲染
- 新建 `src/pool/SidebarRenderer.tsx` + `src/pool/MainRenderer.tsx`
- 新建 PoolLayout JSON 类型定义——`sidebar` / `groups` / `poolId` / `version`

**Phase 3-4 迁移：** 侧栏插件从壳 DOM 移入 SidebarPool WCV。主区插件从壳 React 树移入 MainPool WCV。图标栏和 TabBar 留在壳 DOM（零 IPC 交互）。

**Phase 6 OverlayWindow：** 新建 `electron/overlay-window.ts`——透明 `alwaysOnTop` BrowserWindow + 默认鼠标穿透 + resize handle 渲染 + 右键菜单/命令面板/Toast/Dialog 容器。

**Phase 8 清理：** 整文件删除 `useWebViewSync.ts`（~270 行）。从 ~15 文件删除 `instanceId` 路由。删除 rekey/grace/notifyReady 全链。

**Phase 9 可扩展性：** BottomPanelPool 完整数据结构（PanelLayout 协议 + PanelTabBar 28px + 5 内置视图 + 插件贡献口）。RightSidebarPool 设计。三态互转（main/modal/detached）7 条路径 + 统一 `moveTab()` API。

**Phase 10 API 补全：** 壳侧 `pool.pushLayout`/`pool.onTabClick`/`pool.onViewClick`。池侧 `pool.ready`/`pool.onLayout`/`pool.notifyTabClick`。10 个新命名空间补全——workspace/commands/fileAssociation/viewContainer/events/fileDecoration/protocol/quickPick。删除 `pluginViews` 命名空间（E5.5 遗留）。删除 `pluginInstance` 命名空间。

**Phase 11 硬编码消灭：** 全量 grep `"pluginId"` → 确认零字面量。`MenuId` enum → `string`。`schema.enum` 审计——确认零 pluginId 硬编码。`plugin-file-service.ts` 开放化——第三方插件可注册文件处理器。

**Phase 14 七场景回归：**
1. 启动——窗口位置/大小/状态恢复
2. 侧栏——图标栏点击/折叠/展开/拖拽宽度
3. 主区标签页——新建/关闭/切换/分屏/拖拽重排
4. 编辑器——打开文件/保存/关闭/Monaco 功能
5. 设置——打开/修改/持久化/Ctrl+,
6. 快捷键——全局/Chord/编辑器内/条件过滤
7. 崩溃恢复——SidebarPool 崩恢复 + MainPool 崩恢复

**Phase 16 E6 前置：** 三个任务在 Phase 2 后即可开始——不与 E5.6 主线互斥。
- E5.6#83：`loader.ts` 建 dev/installed 双分支结构（源码 glob vs 已安装 plugin.js `import()`）
- E5.6#84：`plugin-install-handlers.ts` IPC 骨架（基本 install/uninstall/enable/disable handler）
- E5.6#85：将安装/卸载广播改为走 IpcBridge 推送到 SidebarPool + MainPool

### 预估

| 指标 | 值 |
|:--|:--|
| 净删代码 | ~480 行（E5.5#9 回退） |
| 新增代码 | ~350 行（pool.html + pool-main + SidebarRenderer + MainRenderer + OverlayWindow 拖拽线） |
| 改动文件 | ~10 个 |
| 删除文件 | 1 个（useWebViewSync.ts） |
| 新增文件 | 4 个（pool.html + pool-main.tsx + SidebarRenderer.tsx + MainRenderer.tsx） |
| 插件改动 | **0 行** |
| 工期 | 3.5-5.5 天 |

### E5.6 做完意味着什么

WebView 数从 O(N) → O(1)。开 30 个文件仍是 4 个进程。SidebarPool 崩溃 ≠ MainPool 崩溃。PoolLayout JSON 声明式推送——壳不碰插件 React 树。插件代码零改动。**此后加新 Pool（右侧栏/底部面板）= 一行 ZoneConfig + RENDERERS 注册表加一行映射。加新命名空间 = Phase 10 已铺好的注册点——不挖路基。**

---

## 六、下一站——E6 插件生态与发布

> **47 任务 5 层，估 12-16 天。** E5.6 全部完成后开始。目标：三个角色各有一条完整链路——插件作者开发→发布、普通用户下载→安装插件、维护者 build→发布软件。

### 为什么有 E6

**一句话：LinkDesk 现在是一个工程师的工具，不是一个产品。**

插件源码在 `plugins/builtin/` 和 `plugins/user/` 里，依赖全局 `node_modules/`——第三方作者不能 `npm install` 自己的依赖。插件和壳在同一个 Vite build 里——第三方插件要源码放进仓库才能跑。`window.linkdesk.*` API 存在但没有类型定义文件——作者写代码无智能提示。没有脚手架、没有独立 build、市场有前端 UI 但没有后端。

### 三个用户角色

```
① 插件作者：下载脚手架 → 写 React → npm run dev 预览 → npm run build → 上传到市场
② 普通用户：下载 LinkDesk.exe → 启动 → 打开插件市场 → 浏览 → 点安装 → 直接用
③ 维护者：npm run check → git push → GitHub Actions → 自动 build → 自动发布到官网
```

### 五层架构

```
第 1 层：插件独立构建（地基——必须先做，E5.6 串行完成后再开始）
  第 1.1 轮：plugin-sdk + 类型从 preload 自动生成         E6#1-#5（5 任务）
  第 1.2 轮：plugin-shell 动态加载 + loader glob 替换      E6#6-#14（9 任务）
             + .linkdesk-plugin + IPC handler 新建
             + handler 审计走 IpcBridge + PluginInstallService
  第 1.3 轮：内置插件独立化 → 壳瘦身 → 协议重构           E6#15-#20（6 任务）

第 2 层：插件开发工具链（第 1 层后——依赖 SDK）
  第 2.1 轮：create-linkdesk-plugin 脚手架               E6#21-#23（3 任务）
  第 2.2 轮：dev + build 命令                            E6#24-#26（3 任务）
  第 2.3 轮：Mock 自动生成 + dev 可选 Electron            E6#27-#28（2 任务）

第 3 层：插件市场
  marketplace.json + 改造 + 下载安装 UI + 搜索 + 更新通知  E6#29-#33（5 任务）

第 4 层：端到端验证（第 1-3 层后——全链路）
  测试插件 + 开发版验证 + 生产安装版验证 + 内置插件独立   E6#34-#39（6 任务）

第 5 层：文档与发布（全程穿插）
  开发者指南 + CI + 官网上线 + Shell 集成 + 多窗口       E6#40-#47（8 任务）
```

### 各层关键任务

**第 1.1 轮——@linkdesk/plugin-sdk（对标 `@types/vscode`）：**
- E6#1：创建 `packages/plugin-sdk/`——npm 包目录
- E6#2：`window.linkdesk.*` 完整类型定义——从 preload 提取，覆盖所有命名空间 + JSDoc
- E6#3：🔴 类型从 `preload-plugin.ts` 自动生成——不手抄。审计 preload 中每个 API 的实际返回类型（sync / fire-and-forget / async IPC），按审计结果标注
- E6#4：`defineLinkdeskPluginConfig()`——Vite 插件构建配置，React/react-dom external，产出 `.linkdesk-plugin` zip
- E6#5：`validatePluginJson()`——plugin.json 格式验证 + JSDoc

**第 1.2 轮——壳侧改造：**
- E6#6：`loader.ts` 改造——`loadPlugin()` 加 zip 格式分支。检测来源 → 打包文件读 `plugin.json` + `index.bundle.js` → 动态 import
- E6#7：`plugin-shell-main.tsx` + `pool-main.tsx`——去掉 `import.meta.glob`，改为从 URL 参数 / IPC 读入口路径。源码插件走 `/@fs/` 路径，打包插件走 `file:///` 路径
- E6#8：`loader.ts` + `pool-main.tsx` 全部 glob 替换——`pluginModules`/`pluginStatusBarModules`/`viewRenderModules`/`pluginManifests` → 主进程 IPC `plugins:listAll`
- E6#9：`installed-plugins.json`——已安装插件记录。安装时写 / 启动时读 / 卸载时删
- E6#10：安装/卸载/更新单一路径——下载→解压→写记录→loadPlugin→UI刷新。卸载→关标签页→unloadPlugin→删目录→删记录
- E6#11：🔴 `PluginInstallService`——`installed-plugins.json` 唯一 owner。loader / marketplace / 安装流程三处不再直读 JSON
- E6#12：E6 IPC handler 扩展——下载/解压/更新/进度（基于 E5.6#80 的骨架）
- E6#13：🔴 handler 审计——统一走 `IpcBridge.broadcast` 不直发 mainWindow。grep 所有 `mainWindow.webContents.send` + `getAllPluginIds()` 手动遍历 → 替换

**第 1.3 轮——打破特权阶级：**
- E6#14：内置插件迁移为 pre-bundle——10 个内置插件各加 `package.json` + 独立 `npm run build`。产出放入 `bundled-plugins/`。壳首次启动自动安装
- E6#15：壳 `node_modules` 瘦身——移除 monaco-editor / @codingame/*（42 个包）/ serialport / @codemirror 等插件专属依赖
- E6#16：`electron-builder.yml` 改造——不再打包 `plugins/` 源码，只保留 bundled-plugins
- E6#17：`core:true` 可卸载化——给警告但不阻止，高手可以换掉。卸载 API 写 `removed: true` 标记 → 重启跳过自动恢复。手动删文件夹（无标记）→ 自动恢复
- E6#18：内置插件独立构建文档
- E6#19：`protocol.ts` 统一路径解析——去掉目录回退链 `builtin/ → user/ → 裸 plugins/` → `PluginPathResolver` 维护 `Map<pluginId, resolvedPath>`

**第 2 层——工具链：**
- E6#20-#22：`create-linkdesk-plugin` 脚手架——CLI 入口 + 模板（plugin.json / src/index.tsx / package.json / tsconfig.json / i18n）→ `npm create linkdesk-plugin hello-world`
- E6#23：`dev` 命令——`linkdesk-plugin-sdk dev` → 读 plugin.json → Vite dev server → 自动打开 `plugin-shell.html?pluginId=<id>&dev=true` + HMR
- E6#24：`build` 命令——validate → Vite build → zip → `.linkdesk-plugin`
- E6#25：市场"发布"入口——选择本地 `.linkdesk-plugin` → 上传 GitHub Releases → 更新 marketplace.json
- E6#26：🔴 Mock API 从真实 preload 自动生成——不做两份维护。读 `preload-plugin.ts` → 解析 `contextBridge.exposeInMainWorld` → 生成 mock。sync 方法返回类型默认值，async 返回 `Promise.resolve(默认值)`，fire-and-forget 为空函数。调用不存在的方法时抛错 "该 API 仅在生产环境可用"
- E6#27：Dev 模式可选 Electron——`npm run dev:plugin -- --electron` → 完整 Electron + 真实 IPC + 真实 WebContentsView + HMR。弥合浏览器 vs 生产的鸿沟

**第 3 层——市场：**
- E6#28：`marketplace.json` 设计——id/name/version/description/author/icon/downloadUrl/size/publishedAt。存放 GitHub 仓库 `linkdesk-marketplace` 根目录
- E6#29：marketplace 插件改造——fetch `marketplace.json` + 交叉比对 installed-plugins.json → "已安装"/"安装"/"更新"
- E6#30-#32：下载安装 UI + 搜索与分类 + 更新通知

**第 4 层——端到端验证（Encaron 的终极需求）：**
- E6#33-#34：hello-world 测试插件——覆盖所有 contributes 字段（viewsContainers/commands/menus/keybindings/configuration/i18n）。开发模式七项验证：图标栏/侧栏/标签页/右键菜单/快捷键/配置/语言切换
- E6#35：独立构建——产出的 `.linkdesk-plugin` 可解压，内容齐全
- E6#36-#37：构建安装包 + 安装到 Windows + 从市场安装 hello-world 到安装版
- E6#38：🔴 Encaron 终极验证——纯用户操作，不动任何命令行、不看任何代码。安装版中打开市场 → 安装 hello-world → 用。亲口说"行了"才算 E6 封站

**第 5 层——文档与发布：**
- E6#39-#40：插件开发指南 + API 类型文档——从零到发布的完整文档
- E6#41：CI 自动构建——GitHub Actions → push `electron` 分支 → `npm ci` → `npm run check` → `npm run electron:build` → 上传 GitHub Releases
- E6#42：官网下载页——linkdesk.io/download
- E6#43：发布清单——每版照着勾
- E6#44-#46：Windows Shell 集成 + 多窗口。文件关联（`.txt/.py/.js/.json/.md/.html/.css/.ts/.tsx`）、右键菜单（文件夹 + 文件夹空白处）、命令行 intake、同进程多 BrowserWindow + 独立 workspace

### 对标 VS Code（E6 视角）

| VS Code | LinkDesk E6 目标 |
|:--|:--|
| `@types/vscode` | `@linkdesk/plugin-sdk`——类型定义 + Vite 配置 + 验证 |
| `yo code` 脚手架 | `npm create linkdesk-plugin`——一键生成模板 |
| `vsce package` | `npm run build`——Vite 打包产出 `.linkdesk-plugin` |
| VS Code Marketplace | GitHub Releases + marketplace.json |
| Extension Host 独立进程 | 单 WebView pre-bundle（多 WebView 零改动复用） |
| `package.nls.json` 本地化 | `i18n/en.json`——每插件自带翻译 |
| `package.json` contributes | `plugin.json` contributes——已有 ✅ |
| Shell 集成（右键菜单 + 文件关联） | NSIS 注册表 + `electron-builder.yml` fileAssociations |
| 多窗口 | 同进程多 BrowserWindow + 独立 workspace |
| VS Code 官网下载页 | linkdesk.io/download |

---

## 七、插件市场——这个软件的真正能量

插件系统不是"加了一些扩展点"。它是一个平台级设计。六类插件覆盖了视图、卡片、协议、主题、语言、资源——几乎穷尽了一个通用平台所有可定制的维度。

但真正的能量不在于"能装多少插件"，而在于**换一批插件 = 换一个软件**。这不是比喻——是架构事实。

### 协议插件 → 任意数据流适配层

方括号、JSON 行、二进制帧只是开始。协议插件是数据格式的适配器——不绑定任何特定来源：
- **IoT 传感器协议**：MQTT 消息、BLE 广播帧、LoraWAN 数据包——协议插件统一解析
- **工业通信协议**：Modbus RTU/TCP、OPC UA、EtherCAT——装上去即插即用
- **文件回放插件**：把录制的日志数据当成"协议"播放，离线分析
- **网络协议插件**：TCP/WebSocket/gRPC 数据流——协议插件统一处理
- **数据库协议插件**：PostgreSQL wire protocol、Redis RESP——直接喂给视图和卡片

LinkDesk 的数据管道不管来源。一个协议插件 30 行 TypeScript——装上去下拉框就多一项。

### 视图插件 → 任意专业工作台

- **代码编辑器**：Monaco 编辑器 + LSP + Git 装饰——对标 VS Code 编辑体验
- **数据可视化**：ECharts/D3.js 图表——股价/气象/传感器数据实时渲染
- **CAD/3D 查看器**：Three.js/Babylon.js——STL/STEP/glTF 模型直接加载
- **地图视图**：Leaflet/高德 SDK——GPS 轨迹、物流跟踪、灾害监控
- **音乐制作**：MIDI 编辑器 + 钢琴卷帘 + 音频波形——DAW 级工作台
- **文档阅读器**：markdown-it + PDF.js——代码文档 + 数据手册并排

标签页系统不知道里面是什么。核心只提供标签页 + 分屏容器——内容全由插件定义。

### 卡片插件 → 通用数据可视化与交互单元

**卡片工作台本身，也是一个插件。** 核心不知道世界上有"卡片"——CardRegistry 是空的，react-grid-layout 在插件里，数据管道从 RingBuffer 出来交给卡片渲染。如果有人不喜欢网格布局，写一个新插件——"流式布局工作台"、"3D 可视化工作台"、"VR 数据空间"——装上去替换。核心不知道你用的是哪种工作台。

因为工作台是插件，它的上限不由核心定义。本质不是"信号处理"——是**任意结构化数据 → 可视化卡片的通用引擎**。

**金融人看股市：** 导入 Excel 表格 → 协议插件解析 → 工作台网格里拖出 K 线图、成交量柱、板块热力图、AI 异常检测卡。不需要写一个"股票软件"——摆几个卡片就行。

**科研人读论文：** 导入 arXiv 论文列表 → 协议插件解析元数据 → 卡片显示引用量、可信度评分、AI 摘要、相关论文推荐。换个协议插件，换成 PubMed、IEEE Xplore——同一套卡片。

**气象台分析数据：** 每日 CSV 导入 → 让 AI 写个协议插件（30 行 TypeScript）→ 工作台摆温度曲线 + 气压热力图 + 降水柱状图 + 异常预警卡。不用 LabVIEW 手动连线——卡片之间数据管道自动流转。

**上限不在卡片类型，而在于：** 任何一个产生结构化数据的场景 = 协议插件 + 卡片工作台 = 即时分析。数据来源可以是串口/CAN/TCP/文件/数据库/HTTP API/WebSocket——同一套卡片。

### 插件嵌入统一模型（E5.6 Pool 模型）

**插件代码不知道自己在哪个 Pool。** Props 契约 `{ tabId, sourceId, isActive }` 完全相同。同一插件可同时出现在：
- 侧栏（SidebarPool）→ 紧凑列表
- 主区标签页（MainPool）→ 全屏编辑
- 浮层（OverlayWindow Modal）→ 居中弹窗
- 底部面板（BottomPanelPool）→ 面板视图

壳决定把组件挂载到哪个 Pool——**插件代码零感知。**

**同一插件"市场"三形态示例：**
- 侧栏：`sidebar.tsx` → SidebarPool → 紧凑列表（搜索 + 已安装数 + 行列表）
- 标签页：`index.tsx` → MainPool → 全屏商店（160px 分类栏 + 卡片网格）
- 浮层：`index.tsx` → OverlayWindow Modal 容器 → 同上但居中浮层 800×600

### 协议 + 视图 + 卡片联动 → 领域闭环

这是 LinkDesk 真正的"升维"能力：一个完整项目可以打包为插件——包含协议定义文件、专用视图、可视化卡片、快捷键配置、一键启动按钮。用户在 LinkDesk 里打开这个插件，看到的是那个项目的专属工作环境。

**例子：**
- Python 数据科学插件：Jupyter 视图 + DataFrame 卡片 + matplotlib 图表 + CSV 协议
- 硬件调试插件：协议定义文件 + 信号视图 + 实时数据卡片 + 一键部署 + 内存仪表
- 网站监控插件：HTTP 协议 + 响应时间卡片 + 错误日志视图 + Slack 通知集成
- AI 训练监控插件：TensorBoard 视图 + loss 曲线卡片 + 超参配置面板

每个领域一个插件包。安装即用。核心不知道你用的是哪个领域——它只知道标签页和分屏。

### 类比

"电脑端微信小程序 + VS Code 插件"——这个比喻非常准。小程序是轻量、即开即用的应用容器，VS Code 插件是专业功能的无限扩展。LinkDesk 取两者之长处——安装即用（小程序），但可深度定制（VS Code 插件）。

**上限不在插件数量，而在 LinkDesk 能否成为任意领域的通用工作台。** 如果有一天，厂商发布的不再是专用软件，而是一个 LinkDesk 插件包——打开就是完整工作环境——那 LinkDesk 就不再是"某个领域的工具"，而是"软件的运行系统"。

### 长期：Agent 开发基地

纯文本就是 API。`plugin.json` 是 JSON、`workspace.json` 是 JSON、所有配置文件都是 JSON。新 AI 读这份文档就够了——架构、硬约束、设计哲学全在这一个文件里。

这意味着 AI Agent 可以：
- 观察数据流，自动生成可视化卡片建议
- 读取项目源码，自动生成协议插件和 workspace 配置
- 根据异常模式自动调整参数并下发
- **扫描项目源码里的日志输出，自动生成对应的协议插件——30 行的 TypeScript 文件，零风险**

LinkDesk 本身成为 Agent 的操作系统，插件市场是它的技能商店。

### 这些愿景靠什么落地

| 愿景 | 依赖的基础设施 | 状态 |
|------|------|:--:|
| 插件生态（任何人可发布任何类型的插件） | 插件系统 + marketplace | ✅ 已就绪 |
| 插件崩溃不影响其他插件 | SidebarPool ≠ MainPool 进程隔离 | 🔄 E5.6 |
| 文件树 + Monaco 编辑器 | E4 完成 | ✅ |
| 主题/语言社区贡献 | ThemeRegistry + LanguageRegistry | ✅ |
| 数据管道——任意数据源 | 数据管道抽象（串口/CAN/TCP/文件/DB/HTTP 同一条 RingBuffer） | ✅ |
| 卡片工作台——金融K线/科研论文分析/气象数据/任意数据可视化 | CardRegistry + 数据管道 + react-grid-layout | 📋 E6 后 |
| 浮动窗口 | DetachedWindow (E5.6#41 预留口) | 📋 E6 |
| 底部面板——终端/输出/问题/端口 | BottomPanelPool (E5.6#40 预留口) | 📋 v1.2.0 |
| Agent 自动扫描项目生成插件 | 纯文本配置 + PoolLayout JSON 协议 + 六类插件接口 | ✅ 底座就绪 |
| 插件市场在线分发 | `.linkdesk-plugin` zip + 安装/更新/卸载 + GitHub Releases | 📋 E6 |
| 10 款工厂插件 | 全是 plugin.json + React 组件 | 📋 E6 后 |
| 多窗口 + Shell 集成 | 同进程多 BrowserWindow + NSIS 注册表 | 📋 E6#44-#46 |
| 插件开发工具链 | SDK + 脚手架 + dev/build + Mock 自动生成 | 📋 E6 L1-L2 |

---

## 八、说真的——一个不会写代码的人，做软件

这事开始的时候，我只是想给 V2 修个 bug。

V2 是我断断续续一年写出来的。6300 行 C#。功能能用。每次想加新东西就像翻山——改设置页、改 switch case、改图标栏数组。主题切换做了一半放弃了：93 处 `SetResourceReference`，写到 30 处就不知道漏了哪。那种感觉你知道的——**东西多了，你不敢动。动了你不知道哪里会坏。** 最后连我自己都不想打开那个项目了。

然后我遇到了 Claude。

它说可以帮我用 Tauri + React 重写。我说我不会 React。它说没关系，它来写代码，我来说对错。于是就这么开始了。第一个版本跑起来的时候——终端能收数据了——那种感觉很奇怪：**我一个不会写 React 的人，做了一个 React 软件。**

Phase 1 搭脚手架。Phase 2 补了 18 项功能。Phase 3 做标签页分屏。拖拽算法我自己设计了一个 closest-edge + 50%。崩了 15 次。15 次！后来我烦了，翻 VS Code 源码，发现人家用的是一个 0.25 的阈值。换成 `SPLIT_THRESHOLD=0.25`——零 bug。从那天起我给自己定了一条规矩：**别自己发明。照抄 VS Code。他们试过的错你不用再试一遍。**

Phase 4 做插件系统。终端变成一个插件——硬编码全部清零。这件事的意义我当时没完全意识到。后来的 Phase 5g 把 `TabType` 从 8 个枚举改成了 `string`，我才明白：**插件系统的终点，不是"能装更多插件"，而是"核心认不出任何一个插件"。**

Phase 5 是最大的硬仗。建了命令系统、配置注册表、右键菜单统一组件、context key + when 条件引擎、协议下拉框、Settings Editor、快捷键系统、StorageService、类型系统去硬编码、运行时动态加载。每一层都是"以后加功能不用改核心"的基础设施。Tauri 时代的 Phase 5 完工后，加一个新功能 = 写一个 plugin.json + 一个 React 组件——核心一行不动。这个承诺今天仍然成立。

E4 做文件树和 Monaco 编辑器。E5 铺铁轨——归一化、消灭硬编码、layout 引擎、API 补全。E5.5 上多 WebView——证明 Per-Tab 路线能走通。E5.6 重构为 Pool 模型——WebView 从 O(N) 降到 O(1)，插件零改动。

整个过程我写了零行代码。但我说的"不对"可能比写的代码更有价值：

- "不对，Phase 5 不能是卡片——先建基础设施层"
- "不对，这是 V2.6 模式——先功能后基础设施会死的"
- "不对，自创算法不如照抄 VS Code——V2 就是这么死的"
- "不对，终端设置不是全局的——不同 COM 口不同参数"
- "不对，Per-Tab WebView O(N) 进程太重了——分屏是 CSS flex 的问题"
- "不对，SidebarPool 和 MainPool 必须独立进程——侧栏崩不能带崩编辑器"
- "不对，插件无白名单——给了安全不能收自由，给了自由不能缺安全"

我不是程序员。我是甲方。一个好甲方知道几件事：**自己要什么、什么是对的、什么时候该说不对。** AI 是好乙方——只要甲方方向清楚，它能做出来。问题是大部分甲方的方向是乱的——说不清自己要什么，或者今天要 A 明天要 B。我没这个问题——因为 V2 踩过的每一个坑我都记得。

如果说这件事有什么值得说的，不是"AI 能写代码"，那个没什么稀奇。**稀奇的是——一个不会写代码的人，靠着说清楚自己要什么，做出了一个架构比 90% 的商业软件更干净的东西。**

更稀奇的是这个——**代码跑在了我思想前面。** 我给的只是"归一化"和"AI 友好"两个原则。AI 把原则推到极限，输出的是一个我还没完全理解的插件系统。然后在一个和网页 AI 的对话里，我回头看着自己的代码，突然看清了它已经变成的样子。

那场对话之后，我对自己软件的定义从"串口调试工具"变成了"通用容器平台"。不是功能变了——代码一行没改。是我终于追上了代码已经在等我的那个高度。

---

## 九、写给另一个 AI 看这段话

如果你是一个新 AI，正在读这个文件——以下是你要知道的：

1. **这个项目是 AI 写的。** 95%+ 的代码是 Claude 输出的。人类做的是架构决策、质量审判、需求定义。你不是在接管一个人类写的代码库——你是在接管一个 AI 写的代码库。这意味着它的结构比你预期的更干净、更一致、更可预测。

2. **🔥 架构是圆形大厅——两层模型。** 核心 = 大厅（提供桌子/电话本——Registry/Service），插件 = 周边小房间。核心是"空书架"——有很多东西，但全部是空的：CommandRegistry 是空电话簿、ConfigurationRegistry 是空白公告栏、FileService 是空文件柜。**核心只定义"怎么接"，不定义"接什么"。** 往核心加东西前先跑三条准入标准：多提供方 + 多消费方 + 桌子不知道内容。三条全绿 → 核心。缺一条 → 放插件。再加自检：加了这个之后，核心是不是变得更"知道自己是干什么的"了？是 → 别加。
   **E5.6 当前架构：** Shell + SidebarPool + MainPool + OverlayWindow = 4 个 WebContentsView，O(1) 进程。SidebarPool 和 MainPool 永不直接通信——所有消息走主进程路由。PoolLayout JSON 单向推送（壳→池），池被动渲染，buffer-replay 防竞态。

3. **核心什么都不知道。** 标签页系统不知道里面是什么。数据管道不知道数据来源。插件系统不知道有哪些插件。这是故意设计的——不是缺失。任何往核心加"它是什么"知识的冲动都要拒绝。

4. **所有配置都是纯文本。** plugin.json、workspace.json、prefs.json——都是 JSON。硬约束完整清单：
   - 所有颜色走 CSS 变量 `var(--xxx)`，所有 UI 文字走 `t()`，所有路径走 `getAssetPath()`
   - 标签页系统永不 import CardRegistry
   - **禁止在 core/ 或 pluginLoader/ 里写死任何插件 ID 字面量——8 种禁止模式（见 §二.3）**
   - 所有插件差异性行为走 plugin.json 声明字段
   - `workspace.json` 禁止嵌套——一层平铺数组
   - **ConfigurationService 是唯一配置读写入口**
   - **每个持久化文件只有一个 owner service**（PluginStateService 独立文件，不和 ConfigurationService 共用 settings.json）
   - **Opt-IN 不是 Opt-OUT**——危险行为的默认值必须是安全的
   - **声明式优先**——描述 WHAT 而非 HOW（但不绝对——复杂动画/多步异步初始化命令式仍合法）
   - 一个概念一个名字，全代码库一致
   不需要爬文档，不需要读 wiki。读代码就是读文档。

5. **跟着 VS Code 走。** 不要自创交互模式。不确定怎么做的时候，先翻 VS Code 源码——它已经替你踩了十年坑。E5.6 的 Pool 模型对标 VS Code SidebarPart + EditorPart + PanelPart + OverlayWidget。三态互转（main/modal/detached）完全对标 VS Code 三 Editor Part。

6. **🔥 E5.6 是当前任务——Pool 模型重构。** 86 任务 16 Phase。从 Per-Tab WebView（O(N) 进程）重构为双 Pool（O(1) 进程）。净删 ~480 行 Per-Tab 代码，加 ~350 行 Pool 代码。**插件零改动。** 执行清单见 `docs/02-Electron架构/E5.6_Pool模型重构/E5.6-执行清单.md`。进度唯一真相源在那个文件里。

7. **E5.5 是冻结分支——不要在上面改代码。** E5.5 的 Per-Tab WebView 代码完成了历史使命（证明多 WebView 路线能走通），然后光荣退役。所有新工作在 e5.6 分支。

8. **E6 是下一站——插件生态与发布。** 47 任务 5 层，估 12-16 天。三层角色（插件作者/普通用户/维护者）各一条完整链路。`@linkdesk/plugin-sdk` npm 包（对标 `@types/vscode`）、`create-linkdesk-plugin` 脚手架（对标 `yo code`）、`.linkdesk-plugin` 打包格式（对标 `vsce package`）、GitHub Releases 市场后端 + marketplace.json、内置插件独立化 + 壳瘦身 + 协议重构、Windows Shell 集成 + 多窗口。E5.6 Phase 16 已在铺 IPC 骨架——E6 从第一天就 IPC 原生。

9. **插件通信唯一铁律——壳与插件隔离标准。** 对标 VS Code：插件只认 `vscode.*` API。LinkDesk 插件只认 `window.linkdesk.*` API。
   ```
   ✅ 插件代码 = linkdesk.xxx() API 调用        ← 唯一通信桥梁
   ✅ 壳 → 插件：window.linkdesk.bridge.xxx()  ← 唯一反向通道
   ❌ 插件代码 = import { anything } from "@src/core/..."  ← 绝对禁止
   ```
   **为什么：** 多 WebView 下每个插件 = 独立 WebContentsView = 独立 JS 堆。插件 import `MenuRegistry` → 写自己的 Map → 壳的 Map 没有这条 → 静默失效。没有 error，没有 warning——菜单空白、配置不生效。
   **判断壳还是插件：** `window.linkdesk?.contextKey?._getValue` ——只在插件 preload 注入。
   **写 import 前跑检查清单：** ①有模块级状态（Map/Set）？→ 不能用，必须 IPC。②是壳级服务（Registry/Service）？→ 不能用，必须 IPC。③是纯工具函数（无副作用）？→ 可以。④是 TypeScript 类型/枚举？→ 可以。⑤是 UI 组件？→ 暂可，记录例外。⑥ESLint warn？→ 查例外清单。
   通信分类——Registry 操作走 `linkdesk.menu.registerItems`，数据查询走 `linkdesk.configuration.get`，事件走 `linkdesk.events.on/emit`，高频推流走 `linkdesk.p2p.send/on`。
   ESLint `no-core-import-in-plugin` E5.6#71 从 warn 升为 error。

10. **这个人不是程序员。** 他不会写 React、TypeScript、Electron 配置。但他知道自己要什么——因为 V2 踩过的每一个坑他都记得。他的"不对"比代码更有价值。听他的。但也要在他说不清楚的时候帮他看清——就像他说的，AI 在他还没想清楚的时候，已经把代码推到了比他思想更远的地方。

11. **设计决策不可逆——已确认的不重新争论。** 25 条设计决策已记录在 memory `design-decisions`。关键条目：Electron+React 架构、`SPLIT_THRESHOLD=0.25`（照抄 VS Code）、ConfigurationApplier 集中式（不走 VS Code 分布式）、每个持久化文件只有一个 owner service（DD#20）、数据管道模型（不是提前设计是届时涌现——DD#24）、插件生态 MAJOR 版本永远升不上去（DD#25——插件越多契约越重，核心是空的连"改什么"都找不到）。新 AI 不要在已记录决策上重新争论——除非发现了新的架构事实。

12. **质量心态——在这个项目中工作的要求。**
   - **精益求精：** "不是能用就行，是要这样写才对。" 三分钟内能看出改进点 → 别偷懒，现在就改。不为兼容旧代码而保留死代码。`npx tsc --noEmit` 零错误零警告。`npx vitest run` 全过——少一个不算完成。
   - **慢工出细活：** 为 100 个插件后考虑——这个决策在 LinkDesk 变成完全不同的形态后还是对的吗？小批快走，每批 ~150 行，交一个验一个。一口气干完一个 Phase = bug 满天飞。一条 commit 只做一件事。
   - **易操作：** 软件最终用户是不懂前端/后端的普通人。功能不是"存在"就行——是"能被发现、能被理解、能被流畅使用"。操作完有反馈（toast/状态变化/视觉响应三者至少占一个）。崩了有提示（"「终端」已崩溃 [重试]"），不是白屏不是技术堆栈。

---

*最后更新：2026-08-09*

*这个文件见证了 LinkDesk 的四次认知跃迁：*
- *从"串口调试工具"到"通用容器平台"（2026-07-23）*
- *从"通用容器平台"到"圆形大厅"（2026-07-25）*
- *从"核心无知"到"两层模型——核心是空书架，不是空无一物"（2026-07-26）*
- *从"Per-Tab O(N) 进程"到"Pool 模型 O(1) 进程"（2026-08-09）*
- *从"多 WebView 堆叠"到"PoolLayout 声明式推送——壳不碰插件 React 树"（2026-08-09）*

*LinkDesk = Link（连接）+ Desk（桌子）。名字在起名时就写好了，理解到今天还在继续追上。*
