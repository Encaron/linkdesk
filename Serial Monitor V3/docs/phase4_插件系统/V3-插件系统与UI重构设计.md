# V3 插件系统与 UI 重构设计

> 2026-07-19。基于插件系统讨论的综合设计文档——核心瘦身、UI 重构、插件市场、连锁推荐。
> 关联：memory `plugin-system.md` / `design-decisions.md` / `two-layer-container-architecture.md` / `card-promote-to-tab.md`
>
> **⚠️ Phase 4 不会简单。** 涉及 UI 布局变更（TopBar 移除、图标栏动态化、欢迎页），不是纯逻辑层的改动。**三栏布局（图标栏+侧栏+主区）是 Phase 3 的战果，不动。** 好在 `.claude/skills/` 下有 impeccable / ui-ux-pro-max / web-design-guidelines 三个前端 skill（71 文件，2.3MB），审计/设计/交付检查全链路覆盖。
>
> **子文档（对标 Phase 3 的 `标签页设计/` 拆分模式）：**
> - [V3-Phase4-欢迎页设计.md](V3-Phase4-欢迎页设计.md) — 欢迎页数据模型 + 状态流转 + UI + 边界情况
> - [V3-Phase4-终端插件化设计.md](V3-Phase4-终端插件化设计.md) — TerminalView 迁移：依赖分析 + 5 步迁移 + 风险表
> - [V3-Phase4-数据迁移.md](V3-Phase4-数据迁移.md) — prefs.json 自动迁移 + 布局恢复 + 向前兼容
> - [V3-Phase4-测试策略.md](V3-Phase4-测试策略.md) — 旧测试保护 + 新测试 + 手动验证清单

---

## 目录

1. [软件新定位与命名](#1-软件新定位与命名)
2. [核心瘦身架构](#2-核心瘦身架构)
3. [UI 重新设计](#3-ui-重新设计)
   - [3.1 TopBar 移除](#31-topbar-移除)
   - [3.2 图标栏动态化](#32-图标栏动态化)
   - [3.3 多终端场景](#33-多终端场景)
   - [3.4 欢迎页](#34-欢迎页对标-vs-code-welcome)
   - [3.5 状态栏通知](#35-状态栏通知对标-vs-code-右下角弹窗)
   - [3.6 状态栏动态化](#36-状态栏动态化对标-vs-code-status-bar-contributions)
   - [3.7 数据源面板](#37-数据源面板未来可选)
4. [插件加载器](#4-插件加载器)（含文件监听 + 热加载）
5. [插件管理 UI](#5-插件管理-ui)（本地管理，不是社区商店）
6. [插件连锁推荐](#6-插件连锁推荐)（对标 VS Code 详情页——不是弹窗）
7. [数据源插件（第七类）](#7-数据源插件第七类)
8. [插件安全模型](#8-插件安全模型)
   - [8.5 Profile 配置文件](#85-profile-配置文件远期对标-vs-code-profile)（远期，对标 VS Code Profile）
9. [潜在 Bug 与边界情况](#9-潜在-bug-与边界情况)
10. [Phase 4 实施规划](#10-phase-4-实施规划)
11. [相关](#11-相关)

---

## 1. 软件新定位与命名

### 当前名称的问题

"Serial Monitor V3"——当软件能接 CAN、摄像头、GPS、声卡之后，"Serial" 已经不能描述它了。"Monitor" 暗示被动观察，但用户可以发控制指令、调滑杆、烧录固件。

### 新定位

**通用调试容器。** 核心管理标签页 + 卡片 + 数据管道 + 插件运行时。串口是第一个数据源，不是唯一数据源。所有功能——终端、工作台、OLED、地图、摄像头——全部是插件。出厂预装一组核心插件，用户和社区扩展其余的。

### 候选名称

| 名称 | 含义 | 特点 |
|---|---|---|
| **LinkDesk** | Link（连接/链路）+ Desk（工作台） | 通用——串口、CAN、TCP、文件回放，万物可连接 |
| **PinDesk** | Pin（引脚/图钉）+ Desk | 弱硬件隐喻——引脚+图钉卡片，但不绑定嵌入式 |
| **NodeDesk** | Node（节点）+ Desk | 抽象——数据节点、插件节点、设备节点 |
| **WireDesk** | Wire（连线）+ Desk | 调试就是和线打交道——UART 线、CAN 线、逻辑分析仪线 |

> **当前暂用 V3。** 最终名称在正式发布时确定。需满足：不绑定串口、不绑定嵌入式、简短、对标 VS Code 的"Code"。

---

## 2. 核心瘦身架构

### 原则

**V3 核心只留不可删的东西。其余全是插件。**

### 核心（不可删，~500KB）

```
核心/
├── 标签页管理器    SplitNode 树 + 平铺渲染 + 拖拽状态机 + keep-alive
├── 卡片管理器      CardRegistry + react-grid-layout + 壳/组件分离（⚠️ Phase 5 实现，Phase 4 只留接口）
├── 数据管道        Rust 串口后端 + RingBuffer + emit 事件 + 数据源抽象
├── 插件加载器      扫描 plugins/ → 读 plugin.json → 注册到对应注册表
├── 设置引擎        PreferenceService + prefs.json（唯一配置入口）
├── 主题引擎        ThemeEngine（JSON → CSS 变量）
├── 双语引擎        i18next（动态加载语言包）
├── 插件市场 UI     浏览/搜索/安装/卸载插件（核心不可删——没有它怎么装插件？）
└── 图标栏框架      渲染图标按钮（哪些图标 = 插件注册的）
```

### 出厂插件——分两层

**核心控制面（不可删——连删除按钮都没有）：**

```
plugins/
├── settings/       ⚙ 设置       type: "view"   core: true
└── marketplace/    🧩 插件市场   type: "view"   core: true
```

没有设置 → 无法切主题/语言/Profile。没有插件市场 → 卸载终端后无法重装 → 软件残了。**核心控制面不提供卸载入口。**

**出厂预装（可删——卸载后可在插件市场重装）：**

```
plugins/
├── terminal/       📟 终端       type: "view"
└── workspace/      📊 工作台     type: "view"
```

预装只是默认带着方便。用户可以卸载——不需要串口功能的凭什么强迫留着。卸载后在插件市场"可安装"组 → 绿色 `[安装]` 按钮秒恢复。

**主题和语言——内置，但仍是插件概念：**

| 资源 | 位置 | 插件化方式 |
|---|---|---|
| 暗色主题 / 亮色主题 | `themes/*.json`，ThemeEngine 内置注册 | 安装新主题插件 → `plugins/theme-dracula/` → ThemeEngine 注册。内置和插件共享同一份主题列表，设置页和插件市场都能切 |
| 中文 / 英文 | `src/i18n/*.json`，i18next 内置注册 | 安装新语言插件 → `plugins/lang-jp/` → `i18next.addResourceBundle()`。内置和插件共享同一份语言列表 |

**一个插件可以包多个子主题/子语言（对标 VS Code）：**

```
plugins/theme-dracula/
├── plugin.json           → { "type": "theme", "name": "Dracula" }
├── dark.json             → "Dracula" 暗色
├── soft.json             → "Dracula Soft" 暗色柔和
└── light.json            → "Dracula Light" 亮色

plugins/lang-jp/
├── plugin.json           → { "type": "language", "name": "日本語" }
├── ja.json               → 標準日本語
└── ja-kansai.json        → 関西弁
```

`plugin.json` 声明子条目的两种方式：

```json
// 单主题（简写，和单文件等效）
{ "type": "theme", "name": "Solarized Dark", "file": "theme.json" }

// 多主题（一个插件包多个子主题）
{
  "type": "theme",
  "name": "Dracula Official",
  "themes": [
    { "id": "dracula",      "name": "Dracula",      "file": "dark.json" },
    { "id": "dracula-soft", "name": "Dracula Soft",  "file": "soft.json" },
    { "id": "dracula-day",  "name": "Dracula Light", "file": "light.json" }
  ]
}
```

加载器处理：安装一个插件 → 注册 N 个子主题 → 设置页主题列表多出 N 个选项。和内置主题（暗色/亮色）在同一个下拉框里，不区分来源。

**协议（方括号）——内置，Phase 5 卡片就绪后插件化：**

| 资源 | 位置 | 插件化方式 |
|---|---|---|
| 方括号协议 | `src/core/ProtocolParser.ts` | 安装新协议 → `plugins/protocol-xxx/index.ts` → 协议下拉框多一项。Phase 5 卡片就绪后打通 |

**归一化原则：** 设置页和插件市场操作同一份注册表。用户在设置页切主题 = 插件市场那边也显示当前主题已选中。用户在插件市场装新语言 = 设置页语言列表自动多一项。两个入口，一份数据。

### 后续插件化（Phase 5+）

```
plugins/
└── oled/          🎨 OLED 虚拟屏幕  type: "view"
```
协议、主题、语言——等真有第二个再插件化。现在保持内置。

### 关键变化

| 原来 | 变为 |
|---|---|
| `Tab.type` 是 enum（写死 terminal/workspace/settings/oled） | `type` 保留为**逻辑角色**（`"terminal" | "workspace" | "settings" | "welcome"`），新增 `pluginId` 字段指定哪个插件实现。规则判断走 `type`（保底/单例/去重），渲染走 `pluginId` |
| `renderTabContent()` 是硬编码 switch case | 调加载器：`getViewPlugin(tab.pluginId).component` |
| `IconBar.tsx` 硬编码 `iconTypes` 数组 | 从加载器动态读：遍历已安装视图插件 → 各贡献一个图标 |
| 终端保底（终端标签页不可关闭） | 欢迎页保底——永远至少一个标签页。启动时默认打开欢迎页（对标 VS Code Welcome——软件入口，不是串口入口）。关闭最后一个非欢迎页标签页 → 自动显示欢迎页 |
| TopBar 全局串口控制 | 顶栏消失——对标 VS Code 无独立工具条。串口控制移入终端内部。主题/语言切换到状态栏右下角，设置/插件市场入口在图标栏 |

### 为什么设置和插件市场留在核心

设置 = `PreferenceService` + `prefs.json`。没有它，插件无法持久化配置。插件市场 = 插件的安装/卸载入口。删了它等于锁死生态。这两样是**控制面**，不是功能模块。

### 项目图标资源

**文件清单：**

| 文件 | 标准路径 | 用途 |
|---|---|---|
| `icon.ico` | `src-tauri/icons/icon.ico` | Windows 应用图标（窗口标题栏 + exe + 任务栏） |
| `icon.png` | `src-tauri/icons/icon.png` | 源图（1024×1024，供 `tauri icon` 命令自动生成全部 ico 尺寸） |
| `extensions.svg` | `public/assets/icons/extensions.svg` | 插件市场按钮图标（32×32，VS Code Codicons 风格） |

**应用图标规格：**

| 尺寸 | 用途 |
|---|---|
| 16×16 | 窗口标题栏左上角、任务栏小图标 |
| 32×32 | 任务栏、桌面快捷方式 |
| 48×48 | 文件资源管理器"详细信息"视图 |
| 256×256 | 大图标视图、开始菜单 |

`icon.ico` 内含以上全部尺寸。`tauri icon icon.png` 命令从 1024×1024 源图自动生成。**当前已就绪**——`嵌入式-_1_.ico` 已重命名为 `icon.ico`，`嵌入式 (1).png` 已重命名为 `icon.png`。

**插件/扩展图标规范：**

- **首选 SVG**（缩放无损，1KB 量级）。`plugin.json` 中 `"icon": "icon.svg"` 指向插件目录下 SVG 文件
- VS Code Codicons 内建图标可直接引用 codicon 名称：`"icon": "terminal"`, `"iconSource": "codicon"`
- 第三方 PNG 做 fallback：至少 16×16 + 32×32 双尺寸

> **⚠️ V2 教训：** V2 曾因 `icon.ico` 路径错误（文件名拼成 `icon.ioc`、或放错目录）导致软件无法启动。Tauri 同理——`tauri.conf.json` 中 `"icon"` 字段引用 `icons/icon.ico`，文件不在预期路径则 **Rust 层 panic，窗口直接消失，无前端报错**。和 `tauri-config-pitfall.md` 同模式——改图标路径后先 `cargo check` 再 `tauri dev`。

---

## 3. UI 重新设计

> **核心约束：三栏布局保留。** 图标栏（42px）+ 侧栏（220px）+ 主区——Phase 3 的战果，对标 VS Code Activity Bar + Side Bar + Editor。只改三样：① 顶栏消失（串口→终端内部，主题/语言→状态栏）② 图标栏+侧栏从窗口顶部开始 ③ 图标栏内容动态化。标签栏、keep-alive、CSS 变量、i18n——全部不动。

### 3.1 TopBar 移除

**现状（V3 Phase 3.5）：**

```
┌──────────────────────────────────────────────────────┐
│ TopBar：COM3 ▼ 115200 ▼ [● 打开]  中/EN  ☀  ?  ⚙    │  ← 36px 全局顶栏
├────┬──────────┬──────────────────────────────────────┤
│    │          │ TabBar：[📟 终端] [📊 PID]  [+]       │
│ 📟  │  侧栏    ├──────────────────────────────────────┤
│ 📊  │  220px  │                                      │
│ ⚙   │  可拖拽  │  主内容区                             │
│    │  可折叠  │                                      │
│    │  一通到底 │                                      │
├────┴──────────┴──────────────────────────────────────┤
│ ● 已连接 │ TX:1,234  RX:56,789                        │
└──────────────────────────────────────────────────────┘
```

**设计（Phase 4）：**

```
┌────┬──────────┬──────────────────────────────────────┐
│    │          │ TabBar：[📟 COM3] [📊 PID]  [+]       │  ← 标签栏不动
│ 📟  │  侧栏    ├──────────────────────────────────────┤
│ 📊  │  220px  │                                      │
│ ⚙   │  可拖拽  │  ┌─ 终端插件内嵌 ──────────────────┐ │
│ 🧩  │  可折叠  │  │ COM3 ▼ 115200 ▼ [●] TX RX      │ │  ← 串口控制在终端内部
│    │  一通到底 │  ├─────────────────────────────────┤ │
│    │          │  │ 接收区                            │ │
│    │          │  │ 发送栏                            │ │
│    │          │  └──────────────────────────────────┘ │
├────┴──────────┴──────────────────────────────────────┤
│ ● COM3 已连接 │ TX:1,234  RX:56,789  │  中:EN  │  ☀  │
└──────────────────────────────────────────────────────┘
```

**对标 VS Code：** 无独立顶栏。Activity Bar 从窗口顶部直达底部。语言和主题在状态栏右下角——对标 VS Code 的 `language mode` 和 `feedback` 按钮。

**变化要点：**
- **顶栏消失。** 对标 VS Code——没有全局工具条。串口控制移入终端内部工具栏
- **三栏布局保留。** 图标栏（42px）+ 侧栏（220px）+ 主区——从窗口顶部直达状态栏
- **标签栏不动。** Phase 3 的 TabBar 位置、标签行高、拖拽行为、关闭动画——全部保留
- **侧栏一通到底不动。** 现在是从顶栏下开始，Phase 4 改为从窗口最顶部开始——对标 VS Code Side Bar
- 主题切换 & 语言切换 → 状态栏右下角。点击弹出选择面板或打开对应设置标签页
- 图标栏内容动态化——`🧩` 新增（插件市场入口），所有图标从插件注册表读取

### 3.2 图标栏动态化

**图标栏保留（42px 垂直条，最左侧）。** 不再硬编码 `iconTypes` 数组——从插件加载器的视图注册表动态读取。

每个视图插件在 `plugin.json` 声明图标：

```json
{
  "type": "view",
  "name": "高德地图",
  "icon": "map",
  "iconSource": "codicon",      // codicon | url | svg
  "tabType": "amap"              // 插件 ID
}
```

`IconBar.tsx` 渲染逻辑（伪代码）：

```typescript
function IconBar() {
  const views = usePluginLoader().getViewPlugins()
  return views.map(v => (
    <IconButton
      key={v.pluginId}
      icon={v.icon}
      iconSource={v.iconSource}
      tooltip={v.name}
      active={currentTabType === v.tabType}
      onClick={() => openOrFocusTab(v.tabType)}
    />
  ))
}
```

- 出厂自带：📟 终端 / 📊 工作台 / ⚙ 设置 / 🧩 插件市场（4 个）
- 安装新视图插件 → 图标栏自动多一个图标
- 卸载视图插件 → 图标自动消失
- 选中态、悬停态、左侧蓝色指示条——全部保留现有 CSS 动效

### 3.3 多终端场景

终端变成插件后，用户可以有多个终端标签页：

```
[📟 COM3] [📟 COM4] [📊 工作台]
```

每个终端标签页独立管理自己的串口连接。关闭终端标签页 → 自动关对应串口 → 所有订阅该串口数据的卡片变灰（"无数据源"）。关闭最后一个终端 → 工作台卡片全部变灰，但系统不崩溃。

**串口生命周期规则：**
- 打开终端标签页 → 用户手动选 COM 口 + 打开
- 关闭终端标签页 → **弹出确认对话框**（"关闭此标签页将断开 COM3 连接，工作台卡片将停止更新"）→ 用户确认 → 自动关串口
- 关闭最后一个终端 → 核心发出 `datasource-lost` 事件 → 卡片进入"等待数据源"状态
- 重新打开终端 → 选 COM 口 → 数据恢复，卡片自动恢复活跃

### 3.3.1 数据管道绑定模型

> Phase 4 预留接口，Phase 5+ 实现。但设计现在就要定——不然 Phase 5 的 AI 面对"卡片跨工作台移动"时没有参照。

**核心设计：`cardId` 和 `sourceId` 分离。**

| 概念 | 谁负责 | 举例 |
|---|---|---|
| `cardId` — 我显示什么数据 | 卡片自己 | `"adc"`, `"temp"`, `"pid_p"` |
| `sourceId` — 数据从哪来 | 标签页/工作台 | `"terminal-tab-A"`, `"terminal-tab-B"` |
| `{ cardId, value }` — 数据本身 | RingBuffer（数据管道层） | `{ cardId: "temp", value: 36.5 }` |

卡片不认数据源，数据源不认卡片。两者通过 `cardId` 在 RingBuffer 里汇合。`Tab.sourceId` 字段（Phase 4 预留）承载消费端到数据源的绑定。

**场景 1：消费者主动声明绑哪个源。**

```
terminal-tab-A (COM3) → RingBuffer A ─┬→ workspace-tab-X (sourceId: terminal-tab-A)
terminal-tab-B (COM4) → RingBuffer B ─┼→ oled-tab-Z    (sourceId: terminal-tab-A)
                                      └→ workspace-tab-Y (sourceId: terminal-tab-B)
```

- 工作台/OLED 的标签页工具栏有数据源下拉框，列出所有活跃终端
- 未绑定 → 内容区显示"等待数据源"占位

**场景 2：卡片晋升为独立标签页——继承 sourceId。**

```
[📊 工作台 (sourceId: terminal-tab-A)]
    └── 📈 波形卡 (cardId: "adc")

用户拖出 → [📈 波形 (sourceId: terminal-tab-A, cardId: "adc")]
```

新标签页自动继承原工作台的 `sourceId`——用户不需要重新选择。卡从哪来，数据就从哪来。

**场景 3：跨工作台复制卡片——cardId 跟卡片走，sourceId 不跟。**

```
工作台A (sourceId: 绑 COM3) → 🌡️ temp → 显示 COM3 设备的温度
工作台B (sourceId: 绑 COM4) → 🌡️ temp → 显示 COM4 设备的温度
```

同一 `cardId`，不同 `sourceId`，显示各自设备的值。数据天然隔离——每个工作台有自己的 RingBuffer。目标工作台的数据源从来不发送该 `cardId` → 卡片显示"无数据"，不崩。

**约束推导：** 这三条事实在代码中可见（TerminalView 的实例级 RingBuffer + Tab.sourceId 注释 + Card 只认 cardId），任何 AI 实现"卡片移动"时都会自然推到同一套方案。见 memory `code-self-documenting.md`。

### 3.4 欢迎页（对标 VS Code Welcome）

> 完整设计：[V3-Phase4-欢迎页设计.md](V3-Phase4-欢迎页设计.md)

**设计原则：数据驱动渲染。** 快捷入口 = 插件注册表的投影（`getViewPlugins()`），最近 workspace = `prefs.json` 的 `recentWorkspaces` 字段。欢迎页不存储任何自有数据——不新建 welcome.json。安装新视图插件 → 欢迎页自动出现新入口，零行改动。

**触发规则：**
- 启动时若没有恢复的标签页 → 打开欢迎页
- 用户关闭最后一个标签页 → 自动打开欢迎页（欢迎页本身不可关闭——标签页保底）
- 用户创建任意标签页 → 欢迎页可以关闭或保留（用户决定）

**布局：**

```
┌──────────────────────────────────────────────────┐
│ [🏠 Welcome]                                       │
├──────────────────────────────────────────────────┤
│                                                  │
│   Serial Monitor V3                              │
│   通用调试容器                                    │
│                                                  │
│   ┌─ 开始 ──────────────────────────────────┐    │
│   │                                          │    │
│   │  📟 打开串口终端        ⚙ 设置            │    │
│   │  📊 新建工作台          🧩 插件市场        │    │
│   │  📂 打开 workspace                       │    │
│   │                                          │    │
│   └──────────────────────────────────────────┘    │
│                                                  │
│   ┌─ 最近 ──────────────────────────────────┐    │
│   │  heart_rate                    📂     │    │
│   │  pid_tuning                    📂     │    │
│   │  distance_alarm                📂     │    │
│   └──────────────────────────────────────────┘    │
│                                                  │
│   ┌─ 帮助 ──────────────────────────────────┐    │
│   │  📖 使用文档          ⌨ 键盘快捷键        │    │
│   └──────────────────────────────────────────┘    │
│                                                  │
└──────────────────────────────────────────────────┘
```

**设计要点：**
- 欢迎页是普通标签页（`type: "welcome"`），渲染为 `WelcomeView` 组件。和其他视图插件一样走 `{ isActive: boolean }` 契约
- 欢迎页不可被用户关闭——这是新的"标签页保底"规则（替代旧"终端保底"）
- **没有发送栏。** 发送栏属于终端视图。欢迎页是软件的导航入口，对标 VS Code "Get Started"，不承载串口功能
- "打开串口终端" → 创建新终端标签页，效果同 [+] → 终端
- "打开 workspace" → 文件选择器 → 加载 workspace → 创建对应标签页
- 最近列表从 `workspaces/` 目录读取，点击直接打开
- Phase 4 第一阶段：快捷入口 + 最近列表。帮助链接和插件入口后续迭代

### 3.5 状态栏通知（对标 VS Code 右下角弹窗）

**用途：** 插件安装/更新/新增主题/语言变化等非阻塞消息。多条消息堆叠显示——新消息顶到最上面。

**位置：** 状态栏右侧，语言/主题按钮左边。消息在状态栏上方弹出，不遮挡收发区。

```
┌──────────────────────────────────────────────────────┐
│                              ┌──────────────────────┐│
│                              │ 新增主题：Monokai      ││  ← 最新消息在最上
│                              │ [应用] [×]            ││
│                              ├──────────────────────┤│
│                              │ 日语语言包已安装       ││
│                              │ [切换] [×]            ││
│                              ├──────────────────────┤│
│                              │ Dracula 已更新        ││
│                              │ [重载] [×]            ││
├──────────────────────────────┴──────────────────────┤│
│ ● COM3 已连接 │ TX:1,234  │ 中:EN │ ☀  │ 🔔 (3)    │  ← 状态栏
└──────────────────────────────────────────────────────┘
```

**行为：**

| 规则 | 说明 |
|---|---|
| 堆叠 | 新消息出现在已有消息上方。最多同时显示 3 条，超出 → 最早那条自动消失 |
| 自动消失 | 无操作的 toast 5 秒后淡出。有 `[应用]` / `[重载]` 等操作按钮的 → 用户操作后消失 |
| 铃铛图标 | 状态栏右侧 🔔 显示未读条数。点击 → 弹出近期通知历史（最近 20 条）。对标 VS Code 通知铃铛 |
| 不遮挡内容 | toast 浮动在状态栏上方，不属于主区——不抢收发区的视觉焦点 |

**实现：**

```typescript
// toast 队列——纯逻辑，不依赖 DOM 层级
interface Toast {
  id: string
  message: string
  actions?: { label: string; onClick: () => void }[]  // [应用] [重载] 等
  ttl?: number  // 默认 5000ms，0 = 不自动消失
}

// 使用（插件加载器、主题引擎、语言监听等任何模块均可调用）
toastQueue.push({ message: "新增主题：Monokai", actions: [{ label: "应用", onClick: apply }] })
toastQueue.push({ message: "日语语言包已安装", actions: [{ label: "切换", onClick: switch }] })
```

**和 Phase 2 的区别：** Phase 2 的 toast 是单条的——后一条覆盖前一条。Phase 4 改为队列堆叠。改动：`toast()` 函数内部加队列，CSS 加堆叠动画（150ms slide-up）。

### 3.6 状态栏动态化（对标 VS Code Status Bar Contributions）

**状态栏不是核心写死的——是插件注册的贡献点。** 每个插件在 `plugin.json` 里声明状态栏条目，加载器收集后从左到右排列。

```
┌──────────────────────────────────────────────────────────────┐
│ ● COM3 已连接 │ TX:1,234  RX:56,789 │ 方括号协议 │ 中:EN │ ☀ │ 🔔 (3) │
│  ↑ 终端贡献       ↑ 终端贡献          ↑ 协议贡献    ↑ 语言   ↑ 主题  ↑ 通知  │
└──────────────────────────────────────────────────────────────┘
```

**插件声明状态栏条目：**

```json
{
  "statusBar": [
    { "id": "connection", "icon": "circle-filled", "label": "COM3 已连接", "align": "left", "onClick": "openTerminalSettings" },
    { "id": "stats", "label": "TX:1,234  RX:56,789", "align": "left" }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `id` | 唯一标识，插件内不重复 |
| `icon` | codicon 名称或 SVG 路径（可选） |
| `label` | 显示文字（支持动态更新——如 TX 计数实时变化） |
| `align` | `"left"`（默认）或 `"right"`（语言/主题/通知等全局项） |
| `onClick` | 点击行为——命令名或回调（可选）。不设 = 纯显示 |

**状态栏渲染顺序：**

```
[左对齐项...按插件加载顺序]  ───弹性空间───  [右对齐项...按插件加载顺序]
```

**交互：**
- 有 `onClick` 的条目 hover 高亮，点击触发行为
- 对标 VS Code：CMake 的 `🔨 Build` 可点击触发编译，语言模式 `中:EN` 可点击切语言，分支名 `main` 可点击切换分支

**出厂自带（核心注册的全局项，总是存在）：**

| 条目 | 来源 | 行为 |
|---|---|---|
| `中:EN` | 核心 i18n 引擎 | 点击 → 弹出语言选择面板 |
| `☀` | 核心 ThemeEngine | 点击 → 弹出主题选择面板 |
| `🔔 (N)` | 核心通知队列 | 点击 → 弹出通知历史面板 |
| 连接状态 + TX/RX | 终端插件（安装时） | 纯显示 + 点击打开终端设置 |

### 3.7 数据源面板（未来可选）

类似 VS Code 底部面板——显示当前活跃的数据源（COM3 / CAN0 / 摄像头 / 文件回放），允许独立管理。这不是 Phase 4 的必需项——多终端已经覆盖了主要场景。

---

## 4. 插件加载器

### 加载流程

```
应用启动
  → 插件加载器启动
    → Vite 构建阶段：扫描 plugins/ 目录，每个插件独立打包为 dist/plugins/<pluginId>.js
    → 运行时：import() 加载插件模块 → React 组件
    → 读每个子目录下的 plugin.json
    → 校验 plugin.json（JSON Schema 验证）
    → 按 type 分类注册：
        type: "view"      → 注册到 renderTabContent 映射 + 图标栏
        type: "card"      → 注册到 CardRegistry
        type: "theme"     → 注册到 ThemeEngine 主题列表（纯 JSON，文件监听热加载）
        type: "language"  → 注册到 i18next（addResourceBundle，纯 JSON，文件监听热加载）
        type: "protocol"  → 注册到协议下拉框列表
        type: "resource"  → 注册到资源浏览器
    → 完成。应用就绪。
```

### 构建与加载方案

**Vite 独立打包（Phase 4 实施）：**

```typescript
// vite.config.ts —— 核心和插件分开打包
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        // 扫描 plugins/ 下所有视图/卡片/协议插件的入口
        ...scanPluginEntries('plugins/'),
      },
    },
  },
})
```

- 每个含 `.tsx`/`.ts` 的插件编译为独立 JS 文件（`dist/plugins/<pluginId>.js`）
- React、i18next 等公共库 external 共享，不重复打包
- 开发阶段：Vite HMR 即时热更新。改终端插件代码 → 保存即生效
- 生产构建：插件代码随 `vite build` 打包

**运行时加载：**

```typescript
// src/pluginLoader/runtimeLoader.ts
// 构建产物直接 import
async function loadViewPlugin(pluginId: string) {
  const module = await import(`/plugins/${pluginId}.js`)
  return module.default  // React 组件
}
```

**新增插件的加载行为（对标 VS Code）：**

| 插件类型 | 新装后需要重启？ | 机制 |
|---|---|---|
| 含 `.tsx`/`.ts`（视图/卡片/协议） | ✅ 需要——构建时打包 | 对标 VS Code 装含代码的扩展后 Reload Window |
| 纯 `.json`（主题/语言） | ❌ 不需要 | Tauri fs watch → 热注册 → 即时生效。对标 VS Code 装主题即装即用 |

### plugin.json 规范

```json
{
  "$schema": "https://embeddesk.app/schemas/plugin.schema.json",
  "type": "view",
  "name": "高德地图",
  "version": "1.0.0",
  "icon": "map",
  "iconSource": "codicon",
  "description": "交互式高德地图视图，支持搜索和标记",
  "author": "社区",
  "entry": "index.tsx",
  "sidebar": "sidebar.tsx",
  "tabBehavior": {},
  "statusBar": [],
  "recommends": [
    { "plugin": "bracket", "reason": "需要协议解析串口数据" }
  ],
  "suggests": [
    { "plugin": "gps-nmea", "reason": "GPS NMEA 协议可驱动地图标记" }
  ],
  "changelog": [
    { "version": "1.0.0", "date": "2026-07-19", "changes": ["初始发布"] }
  ],
  "screenshots": [],
  "minAppVersion": "3.0.0"
}
```

### plugin.json 字段说明

| 字段 | 必需 | 说明 |
|---|---|---|
| `type` | ✅ | `view` / `card` / `theme` / `language` / `protocol` / `resource` / `datasource` |
| `core` | | `true` = 核心控制面，不可卸载（设置、插件市场）。默认 `false` |
| `name` | ✅ | 显示名称 |
| `version` | ✅ | 语义化版本 |
| `icon` | ✅ | 图标标识（codicon 名称或路径） |
| `iconSource` | | `codicon`（默认）/ `url` / `svg` |
| `description` | | 一句话描述 |
| `author` | | 作者名 |
| `entry` | ✅ | 主入口文件（相对插件目录）。view/card/protocol 必需 |
| `sidebar` | | 侧栏组件（仅 view 类型有效） |
| `tabBehavior` | | 标签页行为声明 `{ singleton?: boolean, isFallback?: boolean, confirmOnClose?: string }`。核心读此字段决定去重/保底/关闭确认，不硬编码 switch pluginId。见 [设计评审](V3-Phase4-设计评审与改进.md#4-问题-3tabtype-泄漏核心概念) |
| `statusBar` | | 状态栏贡献条目 `[{ id, icon?, label, align?, onClick? }]`。加载器收集后从左到右排列。仅 view 类型有效，见 §3.6 |
| `file` | | 单文件入口——theme 类型的单 theme.json / language 类型的单 lang.json。和 `themes`/`languages` 二选一 |
| `themes` | | 多主题数组 `[{id, name, file}]`——一个插件包多个子主题。仅 theme 类型 |
| `languages` | | 多语言数组 `[{code, name, file}]`——一个插件包多个语种/方言。仅 language 类型 |
| `recommends` | | 推荐同时安装的插件（默认勾选） |
| `suggests` | | 可选相关插件（默认不勾选） |
| `changelog` | | 更新日志 `[{ version, date, changes: string[] }]`。插件详情页渲染。`plugin.json` 是详情页唯一数据源——不引入 README 等第二种格式 |
| `screenshots` | | 截图 URL 数组（预留，Phase 5+ 插件市场上线时启用）。加载器目前忽略 |
| `minAppVersion` | | 最低版本要求 |
| `docs` | | 附带文档路径（资源插件联动） |
| `cardDocMap` | | 卡片 ID → 文档锚点映射 |
| `i18n` | | 插件自带翻译 `{ "zh": "zh.json", "en": "en.json", "ja": "ja.json" }`。加载器在 i18next 初始化时注册。切语言 → 插件 UI 跟随。无对应翻译 → fallback 到插件声明的默认语言 → 再 fallback 到 `en` → 最后显示 key 原文 |
| `cssVars` | | 插件自定义 CSS 变量 `{ "--map-water": { "dark": "#1a5276", "light": "#85c1e9" } }`。ThemeEngine 在切主题时一起注入。无对应主题值 → 用 fallback → 最后用核心 `--accent` |

### 主题/语言切换对插件的影响（对标 VS Code）

| 切换 | 影响 | 兜底 |
|---|---|---|
| 切主题 | 插件组件自动跟随——所有颜色走 CSS 变量 `var(--xxx)`。插件自定义变量（如 `--map-water`）在 `plugin.json` 声明双主题值 | 变量缺失 → ThemeEngine 注入 fallback → 最后用 `--accent` |
| 切语言 | 核心 UI 全变。插件 UI 跟随——加载器在 i18next 初始化时注册所有插件的 `i18n` 翻译 | 当前语言无翻译 → fallback 到插件默认语言 → fallback 到 `en`（i18next 默认） → 显示 key 原文 |

**VS Code 做法：** 扩展自带 `package.nls.json` 和 `package.nls.ja.json`。切语言 → VS Code 加载对应 locale 的扩展翻译。没找到 → 显示英文原文。V3 完全对标——插件自带翻译文件，i18next 统一管理，切换语言时自动 fallback。

### 校验与错误处理

```
插件加载器错误处理：

1. plugin.json 不存在 → 跳过该子目录，日志记录
2. plugin.json 格式错误 → 跳过，toast 通知用户
3. entry 文件不存在 → 跳过，toast 通知
4. type 未知 → 跳过（向后兼容——未来新增类型旧核心忽略）
5. 版本不兼容（minAppVersion > 当前版本）→ 跳过，标记"需升级"
6. 同名插件重复 → 优先高版本，toast "已使用 v2.0.0 替代 v1.0.0"
7. 插件目录为空 → 静默跳过
```

### 文件监听与热加载（对标 VS Code Reload）

插件文件变化不需要重启 V3。Phase 3.5 的 PreferenceService 已验证 Tauri fs watch 模式。

**监听范围：** `plugins/` 目录（一级子目录），和启动扫描同路径。

| 变化类型 | 插件类型 | 行为 |
|---|---|---|
| `plugin.json` 的 `themes`/`languages` 数组新增条目 | 主题/语言（纯 JSON） | 即时生效。ThemeEngine / i18next 注册 → 设置页列表刷新 → 状态栏右下角 toast |
| 新增/修改 `.json` 主题文件或语言文件 | 主题/语言 | 即时生效。用户可选择立即应用或忽略 |
| `plugin.json` 版本号变更、description 变更 | 全部 | 即时更新注册表元数据，不重载组件 |
| 新增插件文件夹（拖入 `plugins/`） | 全部 | 启动加载流程（同启动扫描），toast 通知 |
| `index.tsx` / `index.ts` 变更 | 视图/卡片/协议（含 React 组件） | 状态栏提示"XXX 已更新，点击重载"。需要组件重新加载，但**不关软件、不丢状态**——keep-alive 天然支持重载后恢复 |

**状态栏 toast（对标 VS Code 右下角通知）：**

```
新增主题：Dracula Monokai          [应用] [忽略]

GPS 地图插件已更新，点击重载        [重载] [稍后]

日语语言包已安装                    [切换] [忽略]
```

**用户控制：** 插件管理 → ⚙ 设置图标 → "更新通知"：开/关（对标 VS Code `extensions.autoUpdate`）。

### 下载即用——完整生命周期

**一句话：插件丢进 `plugins/` → 加载器即时识别 → 图标栏/主题列表/语言列表即时刷新 → 点击即用。不重启，不刷新，不等。**

**安装流程（拖 `.v3p` 或复制文件夹）：**

```
用户拖 theme-dracula.v3p 到 V3 窗口
  → V3 检测到 .v3p 文件（Tauri拖放事件 或 HTML5 drop）
  → 解压到 plugins/theme-dracula/
  → 文件监听器检测到新目录
  → 加载器读 plugin.json → type: "theme"
  → ThemeEngine 注册 "Dracula" / "Dracula Soft" / "Dracula Light"
  → 状态栏 toast：
      ┌──────────────────────────────────────────────┐
      │ 已安装 Dracula——3 个主题           [应用] [×] │
      └──────────────────────────────────────────────┘
  → 设置页主题列表即时出现 Dracula 系列
  → 用户点 [应用] → 切到 Dracula 暗色 → 全界面即时换色
```

**视图插件安装——图标栏即时更新：**

```
用户复制 plugins/view-gps-map/ 到 plugins/
  → 文件监听器检测到新目录
  → 加载器读 plugin.json → type: "view", icon: "map"
  → viewRegistry 注册 "gps-map"
  → IconBar 重新渲染 → 🗺️ 图标出现（选中态/悬停态/CSS 动效全有）
  → 状态栏 toast：
      ┌──────────────────────────────────────────────┐
      │ 已安装 GPS 地图                  [打开] [×]  │
      └──────────────────────────────────────────────┘
  → 用户点 🗺️ → createTab("gps-map") → 插件渲染 → 即刻使用
```

**全局链路：**

```
文件系统变化（拖.v3p / 复制文件夹 / 删文件夹 / 改plugin.json）
  → Tauri fs watch 或 polling（2秒间隔，和当前 COM 口热插拔同机制）
  → 加载器增量更新（只处理变化的插件，不重扫全部）
  → React state 变更：viewRegistry / themeList / languageList
  → UI 自动刷新：IconBar / 设置页主题列表 / 设置页语言列表 / 状态栏语言选项
```

**卸载和禁用的即时性：**

| 操作 | 即时效果 |
|---|---|
| 卸载（移到 `.disabled/`） | 图标栏对应图标消失 → 该插件所有已打开的标签页变为占位 UI。1 秒内完成 |
| 禁用（不移文件） | 图标栏对应图标变灰（或消失）→ 已打开标签页提示"插件已禁用"。即时 |
| 重新安装（从 `.disabled/` 移回） | 所有效果逆恢复。图标栏图标回来 → 已打开的占位标签页恢复。即时 |
| 彻底删除（移到 `.trash/`） | 等同卸载。30 天后文件清空 |

**不需要的技术：** WebSocket 推送、插件商店 API、后台下载管理器。本地文件操作 + React state = 天然即时。

> **这是个人软件的本地插件管理器，不是社区商店。** 下载量/评分/评论——只在将来上架应用商店时有意义。现在只做两件事：管理本地已安装插件 + 安装新插件。

### 入口

图标栏 🧩 → 侧栏切换为插件管理（对标 VS Code 的 Extensions 图标在 Activity Bar）。顶栏已不存在。

### 界面布局

**对标 VS Code：** 点 Extensions 图标 → 侧栏变插件列表，主区不动。当前活跃的标签页（终端/工作台/设置）不受影响。

```
点击 🧩 前（终端标签页活跃）               点击 🧩 后（侧栏切换，主区不变）
┌────┬──────────┬──────────────┐         ┌────┬──────────┬──────────────┐
│    │ 终端设置  │              │         │    │ 插件管理  │              │
│ 📟  │ 时间戳    │  接收区       │         │ 📟  │ ● 已安装  │  接收区       │
│ 📊  │ 回显     │  发送栏       │         │ 📊  │   terminal │  发送栏    │
│ ⚙   │ 编码     │              │         │ ⚙   │   workspace│           │
│ 🧩  │          │              │         │ 🧩  │   settings │           │
│    │          │              │         │    │ ● 可更新  │              │
│    │          │              │         │    │   (空)     │              │
└────┴──────────┴──────────────┘         └────┴──────────┴──────────────┘
```

侧栏内的插件列表——每行：图标 + 名称 + 版本 + 作者 + 右侧按钮。点击某行 → **主区**新标签页打开插件详情。

**插件列表三种状态（对标 VS Code）：**

```
侧栏插件管理
├── ● 已安装 (3)
│   ┌──────────────────────────────────────┐
│   │ ⚙ 设置   v1.0.0  V3 官方    核心     │  ← 核心控制面：无删除按钮
│   │ 🧩 插件市场 v1.0.0 V3 官方  核心     │  ← 核心控制面：无删除按钮
│   │ 📟 终端  v1.0.0  V3 官方    [卸载]   │  ← 出厂预装：可卸载
│   │ 📊 工作台 v1.0.0  V3 官方    [卸载]   │  ← 出厂预装：可卸载
│   │ 🎨 Dracula v1.0 社区       [禁用]    │  ← 禁用：整行灰色
│   └──────────────────────────────────────┘
│
├── ● 可安装 (2)
│   ┌──────────────────────────────────────┐
│   │ 🎨 OLED   v1.0.0  V3 官方  [安装]    │  ← 绿色按钮
│   │ 📡 方括号 v1.0.0  V3 官方  [安装]    │
│   └──────────────────────────────────────┘
```

| 状态 | 文件位置 | UI 外观 | 右侧按钮 | 行为 |
|---|---|---|---|---|
| **启用** | `plugins/` | 正常 | `[卸载]` | 加载器扫描生效 |
| **禁用** | `plugins/` 原位 | **灰色** | `[启用]` | 加载器跳过，文件不动 |
| **卸载** | `plugins/.disabled/` | 正常 | `[安装]`（绿色） | 移到"可安装"组。点安装 → 移回 `plugins/` |

**和对标 VS Code 的一致：** 卸载后的插件不是灰色残废品——它和从来没装过的插件一样，显示在"可安装"组，绿色 `[安装]` 按钮。只有被禁用（文件在原位但不加载）的才是灰色。

### 交互

| 操作 | 行为 |
|---|---|
| 核心控制面 | 设置、插件市场——`"core": true`。**无卸载/禁用/删除按钮。** 对标 VS Code Extensions 面板 |
| 点插件卡片 | 新标签页打开插件详情——介绍/推荐勾选/依赖/更新日志。对标 VS Code 扩展详情页——不是弹窗 |
| 点"安装"（详情页内） | 下载主插件 + 所有 ☑ 勾选的推荐/可选插件 → 逐个解压到 `plugins/` → 加载器热加载 |
| 点"取消"（详情页内） | 关闭详情标签页，不安装任何东西 |
| 点"卸载"（已安装插件） | 弹窗确认 → 移到 `plugins/.disabled/`。插件从"已安装"组消失，出现在"可安装"组——绿色 `[安装]` 按钮。对标 VS Code——卸载不丢文件 |
| 点"安装"（已卸载插件） | 从 `.disabled/` 移回 `plugins/` → 加载器热加载 → 秒恢复，零下载 |
| 点"禁用"（已安装插件） | 不移除文件，加载器跳过。保留在 `plugins/` 原位 |
| 点"彻底删除"（已卸载插件） | 从 `.disabled/` 移到 `.trash/`（二次确认，30 天自动清） |
| 搜索 | 实时过滤——已安装 + 已卸载（`.disabled/`）+ `plugins/` 下未注册的插件 |

### 离线安装

两种方式：
1. **拖 `.v3p` 文件到 V3 窗口**（`.v3p` = zip，内含 `plugin.json` + entry + 资源）
2. **手动复制文件夹到 `plugins/`** → 重启 V3 → 加载器自动识别

### 未来扩展（上架应用商店时激活）

以下功能在 `plugin.json` 和接口中预留字段，但不实现：
- `downloads` / `rating` / `reviews` — `plugin.json` 预留，加载器忽略。市场服务端上线后启用
- 在线搜索 / 浏览社区插件 — 需要服务端 API
- 评论系统 — 需要用户系统 + 数据库

**现在不做，但接口不挡路。**

---

## 6. 插件连锁推荐

> **对标 VS Code 扩展详情页。** 不是弹窗——推荐/依赖在插件详情标签页内以勾选框形式展示。

### 6.1 交互流程

```
插件管理中点"终端"插件卡片
  → 创建新标签页（type: "plugin-detail", pluginId: "terminal"）
    → 加载插件详情（从 plugin.json 读取）
      ┌──────────────────────────────────────────────────────────┐
      │ [🧩 终端]                                          [×]  │
      ├──────────────────────────────────────────────────────────┤
      │                                                          │
      │  📟  终端  v1.0.0                                        │
      │      作者：V3 官方                                        │
      │                                                          │
      │  [安装]  [取消]                                           │
      │                                                          │
      │  ───────────────────────────────────────────────         │
      │                                                          │
      │  串口数据收发视图——接收区（CM6）+ 发送栏（Monaco）+        │
      │  侧栏设置（时间戳/编码/换行符）。                            │
      │                                                          │
      │  ── 推荐同时安装 ──                                        │
      │  ☑ 方括号协议 (bracket)                                 │
      │    终端需要协议解析——不装则只能在原始 hex 模式下使用           │
      │  ☑ 工作台 (workspace)                                  │
      │    配合使用卡片可视化                                       │
      │                                                          │
      │  ── 可选 ──                                               │
      │  ☐ OLED 虚拟屏幕 (oled)                                │
      │    独立显示区域，不依赖终端                                   │
      │                                                          │
      │  ── 依赖 ──                                               │
      │  ✅ datasource-core (v1.0+) — 已安装                    │
      │                                                          │
      │  ── 更新日志（从 plugin.json changelog 字段）──             │
      │  v1.0.0 — 初始发布                                         │
      │                                                          │
      └──────────────────────────────────────────────────────────┘
```

> **去掉的：** 安装量、评分、截图——这些是社区商店的东西，个人软件没有意义。将来上架时在 `plugin.json` 中加 `screenshots: string[]` 字段即可。更新日志从 `plugin.json` 的 `changelog` 字段读取（纯文本数组），不依赖服务端。

### 6.2 按钮行为

| 按钮 | 行为 |
|---|---|
| **安装** | 下载主插件 → 下载所有 ☑ 勾选的推荐/可选插件 → 逐个解压到 `plugins/` → 加载器热加载 → toast "已安装 终端 + 2 个推荐插件" → 标签页按钮变为 [已安装] [禁用] [卸载] |
| **取消** | 关闭详情标签页，不安装任何东西 |

### 6.3 推荐规则

| 关系 | plugin.json 字段 | 默认状态 | 行为 |
|---|---|---|---|
| **推荐** | `recommends` | ☑ 默认勾选 | 用户可取消勾选 |
| **可选** | `suggests` | ☐ 默认不勾选 | 用户可主动勾选 |
| **硬依赖** | `requires` | 🔒 锁定已勾选，不可取消 | 未满足 → 安装按钮禁用，提示"需要先安装 XXX" |

### 6.4 卸载时的推荐警告

用户卸载插件 B 时，如果其他已安装插件声明了 `recommends: B`：
- 弹出确认对话框（这里弹窗是合理的——卸载是破坏性操作）：
```
┌──────────────────────────────────────┐
│ 卸载"方括号协议"                       │
│                                      │
│ 以下插件推荐此插件：                    │
│ • 终端 (terminal)                  │
│ • SBQ 心率协议 (protocol-sbq)         │
│                                      │
│ 卸载后这些插件可能功能受限。             │
│                                      │
│ [取消]              [强制卸载]         │
└──────────────────────────────────────┘
```

### 6.5 循环推荐处理

A recommends B → B recommends C → C recommends A：加载器检测循环，安装详情页中标记"⚠ 检测到循环推荐"，默认仅勾选直接推荐项，不展开递归。

---

## 7. 数据源插件（第七类）

### 为什么需要

当前 V3 假设数据一定来自串口。但摄像头、CAN、声卡、文件回放——它们的数据来源不是串口。需要一个新的插件类型来抽象"数据从哪来"。

### 接口定义

```typescript
interface DatasourcePlugin {
  type: 'datasource';
  name: string;
  mode: 'stream' | 'poll' | 'replay';
  
  // 生命周期
  open(config: DatasourceConfig): Promise<void>;
  close(): Promise<void>;
  
  // 数据事件由 Rust 端 emit 到前端 RingBuffer
  // 前端组件通过 cardId 订阅，不关心数据源类型
}
```

### 数据源类型

| 数据源 | mode | 实现位置 |
|---|---|---|
| 串口 | stream | Rust（已有） |
| CAN | stream | Rust socketcan crate |
| 摄像头 | stream | Rust v4l crate → emit 帧事件 |
| TCP 桥接 | stream | Rust tokio::net |
| 声卡 | stream | Rust cpal crate |
| 文件回放 | replay | Rust fs → 按时间戳回放 |
| 模拟器 | poll | 纯前端脚本（不需要 Rust） |

### 和多终端的关系

每个终端标签页绑定一个数据源实例。终端 A 绑定串口 COM3，终端 B 绑定 CAN0。关闭终端 → 自动关对应数据源。

### 数据源面板（未来）

VS Code 底部面板风格——显示所有活跃数据源（COM3 ● 115200 / CAN0 ● 500kbps / 📷 OV5640 ● 30fps），允许独立关闭。Phase 8+ 可选。

---

## 8. 插件安全模型

### 当前风险

插件是纯静态文件——`index.tsx` 是 React 组件，可以执行任意 JavaScript。恶意插件可以：
- 读 `prefs.json`（包含串口配置和文件路径）
- 调 `invoke` 发送任意串口数据
- 通过 `fetch` 发送数据到外部服务器
- 无限循环消耗 CPU

### Phase 4 防护措施

| 措施 | 实现 |
|---|---|
| **安装前审查** | 插件市场显示插件请求的权限（`permissions` 字段）：文件读写/网络/串口/Tauri invoke |
| **权限声明** | `plugin.json` 加 `permissions: ["serial", "filesystem", "network"]` |
| **用户确认** | 安装时弹窗显示权限列表，用户确认后才能装 |
| **安全提示** | 未声明权限的插件标记为"未经审核" |
| **来源标识** | 官方签名插件 / 社区已验证 / 未验证 |

### 沙箱（Phase 8+ 远期）

纯静态文件的沙箱能力有限。若生态发展到需要沙箱，可考虑将插件 `<iframe>` 隔离 + `postMessage` 通信。但代价是性能损失——Canvas/WebGL 在 iframe 里受限。Phase 4 不做，先用权限声明 + 社区审核。

---

## 8.5 Profile 配置文件（远期——对标 VS Code Profile，如 `.code-profile`）

> **用户场景：** STM32 项目需要 STM32CubeIDE 插件包 + 暗色主题 + CMake 路径 + 调试设置。切到心率课设项目需要 SBQ 协议 + OLED + 亮色主题。**一键切换整个软件环境，不只是插件列表。**

### 对标 VS Code Profile

VS Code 的 Profile 文件是一个完整的快照——里面打包了 settings、extensions、globalState、theme：

```json
// STM32.code-profile（简化示意）
{
  "name": "STM32",
  "icon": "settings-view-bar-icon",
  "settings": { "workbench.colorTheme": "GitHub Dark Default", ... },
  "extensions": [
    "stmicroelectronics.stm32-vscode-extension",
    "stmicroelectronics.stm32cube-ide-core",
    "ms-vscode.cpp-devtools",
    ...
  ],
  "globalState": { ... }
}
```

选择 Profile → VS Code 一键替换 settings + extensions + 布局。切回默认 Profile → 恢复。

### V3 的设计

V3 的 Profile 文件（`.v3profile`）——纯 JSON，人或 AI 都能改：

```json
{
  "name": "STM32 PID 调参",
  "plugins": ["terminal", "protocol-bracket", "card-gauge", "card-slider", "card-plot"],
  "prefs": {
    "theme": "Dark",
    "lastPort": "COM3",
    "preferences": { "timestampFormat": "HH:mm:ss:fff", "lineEnding": "\\r\\n" }
  },
  "workspace": "pid_tuning"
}
```

**切换 Profile 时 V3 自动：**
- 禁用不在列表中的插件 → 图标栏图标消失
- 启用列表中的插件 → 图标栏图标出现
- 应用 `prefs` 设置 → 主题、语言、串口默认值全换
- 打开对应 workspace → 卡片布局就位

**对标你的 STM32 Profile：**

| VS Code STM32 Profile | V3 对标 |
|---|---|
| 30 个 STM32 扩展 | `plugins: ["terminal", "protocol-sbq", ...]` |
| GitHub Dark Default 主题 | `prefs.theme: "Dark"` |
| 中文语言包 | `prefs.locale: "zh"` |
| CMake 路径 / 调试设置 | `prefs.preferences: { ... }` |
| 侧栏布局 | 未来 `layout` 字段 |

### 交互

```
设置页 → "Profile" → 选择 profile 文件
  → 状态栏 toast "已切换到 STM32 Profile——3 个插件启用，2 个禁用"
  → 图标栏刷新，插件加载器按新列表启用/禁用
  → 主题/语言/设置生效
```

### 和 AI 工作流的衔接

AI 生成的不只是 workspace.json——可以生成完整的 `.v3profile`：

```
AI 扫描 MCU 固件
  → 发现 printf("[chip_temp, %f]")、printf("[pid_p, %f]")
  → 推断：需要 Gauge 卡 + Slider 卡 + 方括号协议
  → 生成 STM32_PID.v3profile：
      plugins: [terminal, protocol-bracket, card-gauge, card-slider]
      prefs: { theme: "Dark" }
      workspace: pid_tuning
  → 用户导入 → 一键切到 PID 调参环境
```

**纯文本、可版本管理、AI 可生成、一个文件打包全部环境。**

### Phase 4 接口预留

> **⏳ 设置页（Phase 7）时加入。** Profile 切换入口在设置页——和主题切换、语言切换、插件管理一起构成设置页的四大模块。现在记住，Phase 7 做设置页时一并实现。

Profile 在 Phase 4 不实现（依赖卡片系统 Phase 5 + 设置页 Phase 7），但加载器的插件启用/禁用接口现在就支持。

```typescript
// 当前：加载全部插件
pluginLoader.scanAll()

// 未来：按 Profile 过滤
pluginLoader.scanAll({ filter: profile.plugins })
```

**Phase 4 的插件管理器已有"禁用"功能——就是为 Profile 切换预留的。** 禁用插件 ≠ 删除插件。Profile 切换 = 批量启用/禁用的自动化。

---

## 9. 潜在 Bug 与边界情况

### 9.1 插件加载器

| # | 场景 | 预期行为 |
|---|---|---|
| L1 | `plugin.json` JSON 格式错误 | 跳过该插件，toast 通知，不阻断其他插件加载 |
| L2 | 两个插件声明相同的 `tabType` | 按版本号优先，低版本被覆盖，toast 通知 |
| L3 | 插件被外部删除（用户手动删文件夹） | 下次启动检测到缺失，从注册表注销，toast |
| L4 | 插件更新中 V3 退出 | 下次启动加载器检测残留（`.tmp` 文件），回滚到旧版本 |
| L5 | 插件 minAppVersion 高于当前版本 | 跳过加载，标记"需升级核心"，toast |
| L6 | 插件目录为空（只有 plugin.json 没有 entry） | 跳过，toast "插件 xxx 缺少入口文件" |
| L7 | 插件 entry 文件有 TypeScript 编译错误 | Vite HMR 报错（和普通源码错误一样处理） |
| L8 | `Tab.type` 只保留 `pluginId`，丢失逻辑角色 | 🔴 致命——保底/单例/去重/图标栏聚焦全部依赖 `type === "terminal"` 等判断。**设计约束：** `type` 必须保留为逻辑角色（`"terminal" | "workspace" | "settings" | "welcome"`），新增 `pluginId` 字段。规则走 `type`，渲染走 `pluginId` |

### 9.2 终端变插件

| # | 场景 | 预期行为 |
|---|---|---|
| T1 | 用户删了 `terminal` 插件 | 所有终端标签页 → 变为"未知视图"占位，提示重新安装终端插件 |
| T2 | 关闭最后一个终端标签页 | 串口自动关闭，workspace 卡片变灰"无数据源"。状态栏显示"未连接" |
| T3 | 两个终端标签页同时连同一个 COM 口 | Rust 端拒绝——端口已占用。Toast 提示 |
| T4 | 终端插件被禁用（不是删除） | 所有终端标签页保留但无法连接新串口，提示"终端插件已禁用" |
| T5 | 用户同时装了两个终端插件（terminal + community-terminal） | 图标栏出现两个 📟（不同 tooltip），各自独立管理串口 |
| T6 | 终端插件升级导致持久化数据不兼容 | 插件 `version` 变更 → 检测旧数据格式 → 自动迁移或提示用户 |
| T7 | TerminalView 的 `handleSend` 逻辑与 Monaco/CM6 耦合过深，无法抽离 | 🟡 Phase 2.5 已尝试拆分 SendBar → 放弃。`handleSend` 同时碰 7 样东西（编码/HEX/Monaco/历史/定时/CM6 回显/Rust invoke）。Phase 4 欢迎页不需要发送栏（见 §3.4），规避了此问题。**后续卡片需要 OnSend 时，需要单独的 `useSend` 解耦设计文档** |

### 9.3 图标栏动态化

| # | 场景 | 预期行为 |
|---|---|---|
| I1 | 安装了 20 个视图插件 | 图标栏垂直排列，20 个图标 ~720px 高度——超出窗口高度时图标栏内部垂直滚动。对标 VS Code Activity Bar（图标多了自然溢出滚动） |
| I2 | 卸载正在显示的视图插件 | 关闭该插件的所有标签页，toast |
| I3 | 插件不提供 icon | 使用默认图标（🧩），tooltip 显示插件名 |

### 9.4 TopBar 移除

| # | 场景 | 预期行为 |
|---|---|---|
| B1 | 串口控制移入终端后，终端被分屏缩到 200px 宽 | 串口工具栏响应式折叠——端口/波特率压缩为图标+tooltip，打开按钮保留 |
| B2 | 语言/主题从顶栏迁移到状态栏 | 状态栏右下角新增 `中:EN` 和 `☀` 两个小按钮。点击 → 弹出选择面板或打开对应设置标签页。对标 VS Code 状态栏语言/反馈按钮 |
| B3 | 用户习惯旧 TopBar | Phase 4 不保留旧顶栏。对标 VS Code——没有全局工具条，Activity Bar 从窗口顶部开始 |

### 9.5 插件管理

| # | 场景 | 预期行为 |
|---|---|---|
| M1 | 离线安装大插件（.v3p 文件 > 100MB） | 显示解压进度条。解压失败可重试。磁盘空间不足 → 拒绝 + 提示剩余空间 |
| M2 | `plugins/` 目录被用户手动删了文件夹 | 下次启动加载器检测到注册表中有但目录不存在的插件 → 从注册表注销，toast |
| M3 | 插件依赖的硬件/外部资源不可用（串口被占用、文件路径失效） | 插件内部处理——V3 不干预。插件自己的错误在标签页内显示 |
| M4 | 没有安装任何插件（`plugins/` 为空或只含出厂预装） | 插件管理页侧栏"已安装"列出厂预装插件。"可更新"为空 |
| M5 | 插件安装包被篡改 | 校验 hash（`plugin.json` 里声明 `checksum`）。不匹配 → 拒绝安装，toast |

### 9.6 插件连锁推荐

| # | 场景 | 预期行为 |
|---|---|---|
| R1 | A recommends B，但 B 已安装 | 详情页推荐区域 B 显示"已安装 ✅"，默认不勾选 |
| R2 | A recommends B，但 B 的版本不兼容当前 A | 详情页显示"B v2.0（需升级到 v3.0）"，勾选框禁用 + tooltip 说明 |
| R3 | 卸载 B 时，A 的 recommends 列表中有 B | 卸载确认弹窗警告"A 推荐 B，卸载可能影响 A 的功能"，允许强制卸载 |
| R4 | 循环推荐（A→B→C→A） | 加载器检测循环，详情页仅显示直接推荐项，不展开递归。标记"⚠ 检测到循环推荐" |
| R5 | 用户在详情页勾选 3 个推荐插件后点"安装" | 串行下载 4 个插件（主插件 + 3 推荐），逐个解压。任一失败 → 已下载的保留，失败的 toast 提示。不整体回滚（已经解压的已经可用） |
| R6 | 详情页打开期间，推荐列表中的某个插件被外部卸载 | 详情页实时刷新推荐列表状态（走插件注册表），已卸载的恢复为未安装状态 |

---

## 10. Phase 4 实施规划

### 前置依赖

- ✅ Phase 3：标签页系统（SplitNode 树 + keep-alive + 拖拽）
- ✅ Phase 3.5：品质打磨（无障碍/主题/i18n/ESLint）

### ═══════════════════════════════════════

## ▼ 现在就能做——Phase 4 基础设施（~600 行）

> **Phase 4 的职责不是"凑合把终端搬过去"，而是把插件系统的基础设施建好。** 终端是第一个用户，但每一项基础设施都按所有未来插件的标准建。

### Step 1: Vite 独立打包 + 插件加载器（~200 行）

- Vite 配置：`plugins/` 下每个视图/卡片/协议插件独立打包为 `dist/plugins/<pluginId>.js`
- React/i18next 等公共库 external 共享，不重复打包
- 运行时 `import()` 加载器：加载插件 React 组件 → 注册到 `viewRegistry`
- 开发阶段 Vite HMR 热更新，生产构建随 `vite build` 打包
- 扫描 `plugins/` → 按 `plugin.json` 的 `type` 分类注册：
  - `type: "view"` → `viewRegistry`（`renderTabContent` 动态化，去 switch case）
  - `type: "theme"` → `ThemeEngine.register()`（纯 JSON，文件监听热加载）
  - `type: "language"` → `i18next.addResourceBundle()`（纯 JSON，文件监听热加载）
- `plugin.json` 校验 + 7 种错误处理
- 文件监听（Tauri fs watch）：新增/修改 JSON 插件即时生效，`.tsx` 插件 toast 提示重启
- Phase 4 出厂不附带独立的主题/语言插件文件夹。暗色/亮色主题和 zh/en 语言保持内置。但加载器支持 `type: "theme"` 和 `type: "language"`——用户丢一个主题 JSON 到 `plugins/` 下就能用

### Step 2: 欢迎页 + 终端插件化 + TopBar 移除（~250 行）

- 终端迁移为第一个视图插件（验证整套加载器）
- **同步解耦 `handleSend`**：提取 `useSendData` 到 `src/core/useSendData.ts`——搬家不改逻辑，但发送管道从此独立于 TerminalView，Phase 5 卡片直接复用
- **`tabBehavior` 行为声明**：核心不再 switch on `TabType`，改为读 `viewRegistry` 的 `tabBehavior`（`isFallback` / `singleton` / `confirmOnClose`）。`Tab.type` 保留为过渡字段
- **欢迎页组件**（`WelcomeView.tsx`）——快捷入口（从 `viewRegistry` 动态渲染）+ `recentViews` 列表
- 欢迎页保底（`useTabManager` 中三处修改，走 `tabBehavior.isFallback` 而非 `type === "welcome"`）
- 顶栏消失——TopBar.tsx 移除。串口控制移入终端内部工具栏。主题/语言按钮移到状态栏右下角
- 图标栏 + 侧栏从窗口顶部开始，对标 VS Code Activity Bar + Side Bar
- 标签栏不动——Phase 3 的 TabBar 位置、行为、动画全部保留
- `sourceId` 字段预留：每个终端标签页分配 `sourceId = tab.id`，Phase 5 卡片绑定数据源时用

### Step 3: 插件详情页 + 状态栏框架（~150 行）

- **插件详情页组件**（`PluginDetailView.tsx`）：`plugin.json` 是详情页唯一数据源——图标 + 名称 + 版本 + 作者 + 描述（多行） + 推荐列表 + 更新日志 + 安装/卸载按钮。不引入 README 等第二种格式
- **状态栏贡献点框架**：状态栏从左到右渲染——核心全局项（`中:EN`、`☀`、`🔔`）→ 插件贡献项（按加载顺序）。Phase 4 只有终端插件贡献：连接状态 + TX/RX
- **toast 通知队列**：堆叠显示（最多 3 条），插件安装/更新/语言变化时触发

### Step 4: 插件开发文档 + JSON Schema（不占代码行，文档产出）

- `docs/插件开发/plugin.json规范.md` — 所有字段定义、示例、必需/可选
- `docs/插件开发/plugin.schema.json` — JSON Schema，`plugin.json` 的 `$schema` 引用
- `docs/插件开发/视图插件开发.md` — `{ isActive }` 契约、keep-alive 机制、可用 hooks
- `docs/插件开发/协议插件开发.md` — `parseLine()` / `detect()` 签名 + SBQ 完整示例

### ▲ 做完 Step 1-4 的成果

```
✅ Vite 独立打包 + import() 运行时加载——和 VS Code 同样模式，新装 .tsx 插件重启即用
✅ JSON 插件热加载——主题/语言即拖即用，对标 VS Code 装主题
✅ 插件加载器就绪——新视图 = plugins/ 下丢文件夹 + 写 plugin.json + React 组件
✅ 终端是第一个视图插件——和未来社区插件走同一套加载机制
✅ handleSend 解耦为 useSendData——Phase 5 卡片拿起来就用
✅ tabBehavior 行为声明——核心不认插件名，新插件零核心改动
✅ 欢迎页替代终端保底——启动/关闭最后一个标签页时自动显示
✅ 顶栏消失——对标 VS Code。图标栏+侧栏从窗口顶部开始。三栏布局结构不动
✅ 状态栏贡献点框架——未来插件声明 statusBar 即可，核心零改动
✅ 插件详情页——plugin.json 是唯一数据源，AI 友好（一份 JSON = 一个插件）
✅ 插件开发文档——社区开发者对着文档就能写插件
✅ 加新视图的复杂度从"改 5 个文件"降到"写一个 plugin.json + 一个 React 组件"
```

---

## ▼ 依赖 Phase 5（卡片架构就绪后才能做）

### Step 5: 卡片 + 协议插件加载（~80 行）

- CardRegistry 就绪后加卡片插件加载——复用同一套 Vite 打包 + `import()` 运行时加载
- 协议切换机制 → 加载器提供协议列表。方括号协议从 `src/core/ProtocolParser.ts` 移出，变为内置协议插件

### Step 6: 插件市场 UI（~400 行）

- 侧栏：全部/已安装/可安装 分类
- 搜索 + 列表 + 安装/卸载 + 详情页（Step 3 已建好组件）
- 离线安装（拖 `.v3p` 文件）
- 文件监听已就绪——拖入 `.json` 插件即时生效，`.tsx` 插件 toast 提示重启

### Step 7: 插件连锁推荐（~100 行）

- `plugin.json` 的 recommends/suggests/requires 字段（Phase 4 已定义在规范和 Schema 中）
- 详情页内勾选框 + 安装/卸载时推荐警告
- 循环推荐检测

### Step 8: 数据源插件（~200 行，Rust 侧重构 + Phase 6+）

- 数据源抽象接口（`DatasourcePlugin`）
- 串口数据源重构为第一个数据源插件
- 多终端各自绑定数据源（`sourceId` 已在 Phase 4 预留）
- Binary 协议插件：WASM 方案（Phase 6+），Phase 4 已留好 `mode: "binary"` 字段

### Step 9: 插件安全（~80 行，Phase 5+）

- permissions 声明 + 安装时权限确认 + checksum 校验

### 估行

| 分组 | Step | 估行数 | 阻塞？ |
|---|---|---|---|
| **Phase 4 做** | 1-4 | **~600 行** | 否 |
| 依赖 Phase 5 | 5-7 | ~580 行 | 是 |
| 依赖 Phase 6+ | 8-9 | ~280 行 | 是 |
| **总计** | 1-9 | **~1460 行** | |

---

## 11. 相关

- memory `plugin-system.md` — 插件系统完整设计
- memory `design-decisions.md` — §15 workspace 隔离 / §16 不换 flexlayout / §17 协议层可替换
- memory `card-promote-to-tab.md` — 卡片晋升标签页（Phase 6+ 打通两层容器）
- memory `ai-workflow-target.md` — AI 自动生成协议插件 + workspace
- memory `two-layer-container-architecture.md` — 两层容器
- memory `hard-constraints.md` — V3 硬约束
- docs `../开发管理/V3开发计划.md` — 总开发计划（Phase 4 已写入）
- docs `../标签页设计/V3-Phase3-标签页分屏设计.md` — Phase 3 设计
