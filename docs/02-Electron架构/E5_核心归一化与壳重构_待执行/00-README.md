# E5 — 核心归一化与壳重构

> 2026-08-02。**E4 文件树+编辑器完工后发现的结构性裂缝。**
> E4 让 LinkDesk 能工作了——文件树、编辑器、搜索。但 14 项待办指向同一个根因：
> **每件事有 N 种做法，壳内部高耦合，加新功能要改旧代码。**
>
> E5 不做新功能——E5 是让后续所有功能快 3-4 倍的结构性手术。

---

## 零、为什么有 E5——从一句"侧栏换到右边要改几个文件"说起

### 0.1 触发点——E4 完工后的代码审查

E4 于 2026-08-02 基本完工。LinkDesk 现在有文件树、Monaco 编辑器（LSP 桥接 40+ 语言）、文件搜索、多根工作区。**软件能工作了。**

但 Encaron 审查代码时提出了一个问题：**"侧栏换到右边，要改几个文件？"**

答案是 6 个——App.tsx 的 CSS flex、IconBar 的 onIconClick、SidePanel 的动画方向、MainContent 的分屏基准、StatusBar 的 left/right 对齐……**改一个布局要炸 6 个文件。**

这就是 E5 的起点。

### 0.2 深层对话——和另一个 AI 的讨论

Encaron 和 AI 进行了一次深度对话（2026-08-02），探讨了：

- **壳内低耦合**——IconBar 不应该知道 SidePanel 的存在。四个区域应该像硬件模块一样，通过 BNC 线（Events）连接，而不是把连接线焊死在板子上。
- **声明式布局**——侧栏在左边还是右边，应该是一行布局配置，不是 6 个文件各自写 CSS。
- **多 WebView 感觉没做完**——插件代码双份渲染，壳控制台是大杂烩，React fallback 从未退役。
- **插件加载三条路径**——Python 语言插件被迫写空 `index.tsx`，因为 `langDefs` 解析寄生在 `loadViewPlugin` 里。
- **Ctrl+C 碎片化**——每个插件各自声明同一个快捷键。Encaron 说："一个 bug 不会多处出现"。
- **抽象平台 vs 具体应用**——LinkDesk 不是"串口工具"，是通用容器。壳不知道软件是干什么的。但壳内部自己还是高耦合的——加一个新区域要改 4+ 个文件。这违背了"核心无知原则"在 UI 层的应用。
- **转 Tauri 的代价**——壳内低耦合之后，转框架只需换 EventBus 底层实现，壳组件一行不改。高耦合时要把 App.tsx 的胶水层全重写。
- **精益求精**——"低耦合，高内聚，保证无错，归一化，无硬编码，AI 友好，插件自由化，声明式"——这些不是口号，是需要系统性手术才能达到的状态。

对话结论：**E4 后真正的任务不是修 14 个独立 bug——是让 LinkDesk 从"能工作的软件"完成到"能演化的平台"的最后一跃。**

### 0.3 关键矛盾——04/05 出厂制造在前，还是 E5 在前？

LinkDesk 的路线图上有两个后续：

| 目录 | 内容 | 例子 |
|------|------|------|
| **04-出厂制造** | 马上能做的 UI 改进 | FloatingPanel 通用悬浮面板（#03） |
| **05-版本更新** | E4 后的壳版本升级 | v1.2 终端系统、v1.3 可拖出标签页、v1.4 项目管理器 |

**如果先做 04/05：**

```
加 FloatingPanel → App.tsx 加状态管理 → MainContent 知道面板是否打开
→ Sidebar z-index 调 → StatusBar 跟着动 → 4 个文件连锁改动

加终端系统 → App.tsx 改布局 → MainContent 高度减 Panel 高度
→ StatusBar 上移 → Sidebar 高度不撑底 → 又是 4+ 个文件

加可拖出标签页 → WindowManager 扩展 → MainContent 的 WebView 逻辑
→ TabBar 的拖拽手势 → SidePanel 的 resize → 又是 3+ 个文件
```

**三个功能 = 12+ 文件改动 = 累积的技术债。**

**如果先做 E5：**

```
加 FloatingPanel → 新 FloatingPanel.tsx + 1 行布局配置
加终端系统    → 新 TerminalPanel.tsx + 1 行布局配置
加可拖出标签页 → WindowManager.detachPluginView()——不改壳组件
```

**三个功能 = 3 个文件 = 加代码，不改代码。**

**结论：E5 必须先做。不先铺铁轨就加火车 = 每辆火车多 3-4 倍轨道铺设费。**

### 0.4 为什么 E5 不是过度设计

有人会说"YAGNI"（You Ain't Gonna Need It）。但在平台级软件里，不抽象的代价不是现在看不到——是等你看到的时候已经改不动了。

- E5 的 ShellEvents 类型系统——是让 AI 写壳组件时有编译期安全网。没有它，Events 解耦会导致运行时 bug 爆炸。
- E5 的布局引擎——不是在为"侧栏换右边"这个功能做。是在为"将来用户想怎么排列都可以"这个可能性做。对标 STM32 HAL——接口比实现活得久。
- E5 的插件加载归一化——不是在修 3 条路径。是在确保"以后加第 4 种插件类型时不用开第 4 条路径"。

**E5 的成本是一次性 2-3 周。收益是 LinkDesk 余生每个功能都快 3-4 倍。净赚。**

---

## 一、前因——E4 后的 14 项待办指向同一个问题

E4 完工后，代码审查和对话中浮现了 14 项待办：

| # | 项目 | 表面问题 | 深层根因 |
|---|------|---------|---------|
| 1 | 插件加载归一化 | loadViewPlugin/loadThemePlugin/loadLanguagePlugin 三条独立路径 | **多路径 = 多 bug 温床** |
| 2 | iconLocation opt-IN | 未声明默认显示图标 | **opt-OUT 违背声明式原则** |
| 3 | 数据插件类型 | Python 插件被迫写空 index.tsx | **插件角色无显式声明** |
| 4 | 壳内低耦合 | App.tsx 直接 import 四个区域、互相传 props | **壳组件耦合 = 改一炸四** |
| 5 | ShellEvents 类型系统 | events payload 是 any | **无编译期检查 = AI 必踩坑** |
| 6 | 壳布局引擎 | CSS flex 写死谁在左谁在右 | **布局和渲染耦合** |
| 7 | React Fallback 退役 | 插件代码双份运行，console.log 进壳控制台 | **多 WebView 未真正完成** |
| 8 | 剪贴板归一化 | Ctrl+C/V/X 每个插件各自声明 | **一个操作 N 处注册** |
| 9 | InlineInput 归一化 | 文件树/串口/设置各写各的 input | **无共享组件** |
| 10 | 设置 object 编辑器 | files.exclude 显示 [object Object] | **缺类型编辑器** |
| 11 | openInTerminal 配置化 | 硬编码 PowerShell | **无配置项** |
| 12 | FileService API 命名 | mkdir/listDir/deleteEntry 不统一 | **命名碎片化** |
| 13 | FileEntry 类型双定义 | 前后端各定义一份 | **无共享类型来源** |
| 14 | DnD Twistie 不同步 | 拖放后 twistie 状态错乱 | **模型状态清理不完整** |

**14 项不是 14 个独立任务——是一个问题（多路径+高耦合+缺声明）的 14 个症状。** E5 按根因分组，每组一次手术消灭一批症状。

---

## 二、三层架构——E5 做什么

```
┌─────────────────────────────────────────────────────────┐
│ 第一层：壳通信骨架                                         │
│ ShellEvents 类型系统 → 四个区域只通过桌子通信               │
│ 壳布局引擎 → 加区域 = 一行配置                              │
│ React Fallback 退役 → 多 WebView 真正完成                   │
│                                                          │
│ 第二层：归一化——每件事只有一种做法                           │
│ 插件加载归一化 → parseContributions 是唯一入口              │
│ 插件角色系统 → view / data 声明式区分                        │
│ iconLocation opt-IN → 不声明 = 不显示                       │
│ 剪贴板 Provider → Ctrl+C 只在一处注册                       │
│ InlineInput 共享组件 → 所有行内编辑同组件                    │
│ FileService API 命名统一                                   │
│                                                          │
│ 第三层：功能补全 + 技术债                                   │
│ 设置 object 编辑器 / openInTerminal 配置化                  │
│ FileEntry 类型合并 / Twistie 修复                          │
└─────────────────────────────────────────────────────────┘
```

### 执行顺序

**第一层必须最先做。** 壳内低耦合是地基——后续所有壳级功能（终端系统、悬浮窗、可拖出标签页）都在这个地基上建。不先铺铁轨就加火车 = 每个功能多 3-4 倍工作量。

**第二层在第一层之后做。** 归一化依赖类型系统——没有 ShellEvents 类型约束，剪贴板 Provider 的 API 设计就没有编译期保证。

**第三层最后做。** 功能补全不阻塞 04/05 出厂制造——可以在 04 进行中穿插。技术债不阻塞任何功能。

---

## 三、为什么在 04/05 之前做

04-出厂制造（FloatingPanel/终端系统/可拖出标签页）和 05-版本更新（v1.2-v1.6）里的壳级功能——**每加一个区域就要改 App.tsx + MainContent + Sidebar + StatusBar。** 现在壳内高耦合时做：

```
加 FloatingPanel → 改 4 文件
加终端系统     → 改 5 文件
加可拖出标签页  → 改 3 文件
────────────────────────────
合计：12+ 文件改动，30+ 场景测试
```

壳内低耦合后做：

```
加 FloatingPanel → 1 新文件 + 1 行布局配置
加终端系统     → 1 新文件 + 1 行布局配置
加可拖出标签页  → 1 新文件 + 1 行布局配置
────────────────────────────
合计：3 文件，3 场景测试
```

**先重构，再做功能 = 净省 9+ 文件改动 = 不在耦合代码上堆功能。**

---

## 四、对标 VS Code

| VS Code | LinkDesk E5 目标 |
|---------|-----------------|
| `IEventBus` + typed events | ShellEvents 类型系统 |
| Workbench layout (Grid) | 壳布局引擎 |
| Extension host 独立进程 | 插件 WebView 真独立（React Fallback 退役） |
| `vscode.commands` 统一命名空间 | 剪贴板 Provider / InlineInput 归一化 |
| `contributes` 声明式 | iconLocation opt-IN / 数据插件角色 |
| `IFileService` 统一接口 | FileService API 命名归一化 |

---

## 五、完工标准

- 加新壳区域（底部面板/右侧属性面板）→ 不改已有区域代码
- 换布局（侧栏换右边）→ 只改布局配置
- 加新语言插件（Rust/Go）→ 零代码，只声明 plugin.json
- 插件 console.log → 进自己的 WebView 控制台，不进壳控制台
- Ctrl+C 在任何焦点上下文 → 走到同一个核心 handler
- 所有行内编辑 → 用同一个 InlineInput 组件
- FileService API 命名一致——AI 和人不用猜该用哪个
- 转 Tauri 框架 → 壳组件代码零改动

---

## 六、涉及文件概览

| 层级 | 文件 | 改动性质 |
|------|------|----------|
| 核心 | 新 `src/core/ShellEvents.ts` | ShellEvents 类型表——壳内通信唯一类型定义 |
| 核心 | 新 `src/core/ClipboardProviderRegistry.ts` | 剪贴板 Provider 桌子 |
| 核心 | 新 `src/core/PluginRole.ts` | 插件角色类型 + 自动推导 |
| 核心 | `src/core/FileService.ts` | API 重命名 |
| 核心 | `src/core/types.ts` | PluginManifest 加 pluginRole / FileEntry 合并 |
| 核心 | 新 `src/core/LayoutEngine.ts` | 布局引擎——壳区域可排列 |
| 壳 | `src/App.tsx` | 解耦——去除直接 import 四个区域 |
| 壳 | `src/components/IconBar.tsx` | 只 emit 事件，不 import 邻居 |
| 壳 | `src/components/SidePanel.tsx` | 只订阅事件，不 import 邻居 |
| 壳 | `src/components/MainContent.tsx` | 只管理标签页+分屏，不 import 邻居 |
| 壳 | `src/components/StatusBar.tsx` | 只渲染条目，不 import 邻居 |
| 壳 | 新 `src/components/shared/InlineInput.tsx` | 归一化行内编辑组件 |
| 加载器 | `src/pluginLoader/loader.ts` | parseContributions 归一化 + pluginRole 推导 |
| 加载器 | `src/pluginLoader/viewRegistry.ts` | iconLocation 默认值改为 null |
| 插件 | `plugins/builtin/file-tree/plugin.json` | 补 iconLocation 声明 |
| 插件 | `plugins/builtin/marketplace/plugin.json` | 补 iconLocation 声明 |
| 插件 | `plugins/user/python/` | 删空 index.tsx，加 pluginRole |
| Electron | `electron/main.ts` | openInTerminal 读配置 |
| 共享 | 新 `shared/types.ts` | FileEntry 归一定义 |

---

## 文档导航

| 文档 | 内容 |
|:--|------|
| `05-执行清单.md` | **🔥 唯一真相源。** 4 层 15 轮 ~50 任务，进度追踪 |
| `01-壳通信骨架/ShellEvents类型系统.md` | ShellEvents 接口 + 事件追踪 + ErrorBoundary |
| `01-壳通信骨架/壳布局引擎.md` | LayoutEngine + 区域可排列 |
| `01-壳通信骨架/React-Fallback退役.md` | 多 WebView 真完成——时序修复 |
| `02-归一化/插件加载归一化.md` | parseContributions 统一入口 |
| `02-归一化/插件角色系统.md` | pluginRole: view/data 声明式 |
| `02-归一化/剪贴板Provider.md` | ClipboardProviderRegistry |
| `02-归一化/InlineInput组件.md` | 归一化行内编辑 |
| `02-归一化/FileService-API命名.md` | API 重命名方案 |
| `02-归一化/IPC与API命名归一化.md` | 🆕 IPC channel 命名归一化 + clipboard handler 补全 + 类型补全 |
| `02-归一化/插件安装单一路径.md` | 🆕 插件安装/卸载双路径归一化为 bridge 唯一入口 |
| `02-归一化/插件目录结构规范.md` | 🆕 标准插件模板 + editor/file-tree/marketplace/serial-monitor 迁移方案 |
| `03-功能补全/设置object编辑器.md` | 对标 VS Code settings object widget |
| `03-功能补全/openInTerminal配置化.md` | terminal.external.windowsExec |
| `04-技术债/FileEntry类型合并.md` | shared/types.ts |
| `04-技术债/Twistie不同步修复.md` | 模型状态同步 |

---

> **← 上一 Phase：** `../E4_文件树与编辑器_暂定/`
> **→ 下一 Phase：** `../../04-出厂制造/`（FloatingPanel / 终端系统 / 可拖出标签页）
