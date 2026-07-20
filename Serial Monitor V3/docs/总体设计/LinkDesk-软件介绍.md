# LinkDesk — 通用调试容器：完整介绍

> 一个对标 VS Code 架构哲学的通用调试工作台。前身 Serial Monitor V2（WPF 串口调试工具），V3 用 Tauri v2 + React 18 + TypeScript 完全重写。当前 Phase 4 完成，109 个测试全过，33 commits。

---

## 一、这是什么软件

LinkDesk 是一个**通用调试容器**。它的核心是一套标签页管理 + 卡片网格 + 数据管道 + 插件运行时，不预设任何具体功能。所有面向用户的功能——终端、工作台、仪表盘、地图、OLED 虚拟屏、摄像头预览——全部是插件。

它不是"串口助手"。串口只是出厂预装的第一个数据源插件。它可以是 CAN 总线分析仪、GPS 轨迹查看器、声卡频谱仪、摄像头预览器、TCP 桥接调试器。核心不知道你接的是什么——核心只管理窗口、标签页、卡片网格和数据流转。

如果你熟悉 VS Code：VS Code 核心不知道你是写 Python 还是 C++，核心只提供编辑器组、扩展宿主、命令面板。LinkDesk 完全对标这个模型——但应用领域是硬件/数据调试，不是代码编辑。

### 前身与重架构

V2 是 6300 行 C# WPF 桌面软件，功能完整但架构僵化：

- 面板类型是硬编码的 enum（terminal / workspace / settings / oled）
- `renderTabContent()` 是一个巨大的 switch case
- 图标栏写死了 `iconTypes` 数组
- 加一个新视图要改 5 个文件：enum 定义、switch case、图标栏数组、侧栏路由、菜单项
- 串口假设写死在核心——所有数据都假定来自串口

V3 重架构不只是技术换底盘（WPF → Tauri + React），而是设计哲学的根本转变。对标 VS Code 的扩展系统，但应用于硬件调试场景。

---

## 二、核心理念

### 核心无知原则

**核心代码里没有一行提到"串口"、"嵌入式"、"MCU"、"UART"。**

```
核心只定义：
- 标签页怎么管理（SplitNode 递归树 + keep-alive）
- 卡片怎么排列（react-grid-layout 网格）
- 插件怎么加载（import.meta.glob → import() → viewRegistry）
- 数据怎么流转（RingBuffer + emit → rAF 消费）
- 主题怎么应用（JSON → CSS 变量 → document.documentElement）
- 语言怎么切换（i18next.addResourceBundle）

核心不定义：
- 串口是什么（那是 terminal 插件的事）
- 协议怎么解析（那是 protocol 插件的事）
- 卡片长什么样（那是 card 插件的事）
- OLED 怎么渲染（那是 oled 插件的事）
```

这和 VS Code 的扩展架构完全同构——VS Code 核心不知道 Python 扩展、Git 扩展、Docker 扩展具体做什么，只知道"扩展贡献了什么"。

### 归一化原则

**一个概念只有一种实现方式，不存在"人用的 API"和"AI 用的 API"两套东西。**

- 所有颜色走 CSS 变量 `var(--xxx)`，不硬编码 hex。切主题 = 改 `data-theme` 一个属性。
- 所有 UI 文字走 `t()` 国际化函数，不硬编码中文。切语言 = `i18n.changeLanguage()`。
- 设置页和插件市场操作同一份注册表。两个入口，一份数据。
- 标签名从 `plugin.json` 的 `manifest.name` 读，不在代码里 switch case。
- 预览模式 (`Tab.pinned`) 是全局规则，不是只对某类标签页生效。

### AI 友好设计

- `plugins/` 下的 `plugin.json` 是插件唯一数据源——不需要读 README、不需要爬文档。
- `PluginManifest` 是完整的 TypeScript 类型，AI 看类型定义就知道能写什么字段。
- 视图插件的契约只有 `{ isActive: boolean }`，AI 生成一个 React 组件就能跑。
- 新视图 = 写一个 `plugin.json` + 一个 React 组件，丢进 `plugins/` 文件夹。不改核心代码。
- 未来 AI 扫描 MCU 固件 → 发现 `[chip_temp, %f]` → 自动生成 workspace.json + Profile → 一键切到调试环境。

---

## 三、技术栈

| 层 | 技术 | 备注 |
|------|------|------|
| 桌面框架 | Tauri v2 | Rust 后端 + 系统 WebView2，打包体积 < 5MB |
| 前端 | React 18 + TypeScript | 严格模式，`npx tsc --noEmit` 零错误 |
| 接收区编辑器 | CodeMirror 6 | 只读模式，三色行装饰系统，rAF 批量更新 |
| 发送栏编辑器 | Monaco Editor | 语法高亮（Monarch tokenizer），Enter 发送 |
| Rust 串口 | `serialport` crate + tokio | 异步读线程，100ms 超时拆行，emit 到前端 |
| 构建 | Vite 6 | `import.meta.glob` 扫描插件，独立打包 |
| 测试 | Vitest | 109 个单元测试（7 个测试文件） |
| 持久化 | Tauri fs API + localStorage fallback | 双重路径，浏览器 dev 模式也持久化 |
| 图标 | `@vscode/codicons` + 自绘 SVG/PNG | Activity Bar / 通知 / 折叠箭头等 UI 控件 |
| 品牌 | LinkDesk | 色调 `#0078D4`，图标 NodeDesk 六边形三节点 |

---

## 四、架构详解

### 两层容器模型

```
┌─────────────────────────────────────────────────┐
│ 外层：标签页 + 递归分屏                            │
│   SplitNode = leaf | branch(direction, [L,R], sz) │
│   └── 标签页拖拽/分屏/合并/复制                      │
│   └── keep-alive：所有面板平级渲染，CSS display 切换   │
│   └── 硬边界：标签页系统永不 import 卡片系统           │
├─────────────────────────────────────────────────┤
│ 内层：卡片网格（Phase 7）                           │
│   └── react-grid-layout 拖拽重排                   │
│   └── workspace.json 一层平铺数组                   │
│   └── 卡片组件壳分离（CardShell + CardComponent）    │
└─────────────────────────────────────────────────┘
```

两层之间的唯一接触点：`Tab.workspaceName: string`。标签页系统只知道"这个标签页关联了哪个 workspace"，不知道 workspace 里面有什么卡片。

### 插件加载流程

```
应用启动
  → initPrefs() → 加载 prefs.json
  → initPluginLoader() → Vite import.meta.glob 扫描 plugins/*/plugin.json
  → 读每个 plugin.json → 校验（7 种错误类型）
  → 按 type 分发注册：
      type: "view"       → registerViewPlugin() → viewRegistry Map
      type: "card"       → CardRegistry（Phase 7）
      type: "theme"      → ThemeEngine.registerTheme()
      type: "language"   → i18next.addResourceBundle()
      type: "protocol"   → 协议下拉列表
      type: "resource"   → 资源浏览器
  → IconBar 从 viewRegistry 动态读取图标列表
  → 完成。应用就绪。
```

### 六类插件接口

| 类型 | plugin.json 关键字段 | 加载后去哪里 | 契约 |
|------|---------------------|-------------|------|
| `view` | entry, sidebar, tabBehavior, statusBar | viewRegistry → renderTabContent + IconBar | `{ isActive: boolean }` |
| `card` | entry | CardRegistry（Phase 7） | `{ cardId, value, config }` |
| `theme` | file / themes[] | ThemeEngine.registerTheme() | JSON 颜色表 |
| `language` | file / languages[] | i18next.addResourceBundle() | JSON 翻译表 |
| `protocol` | entry, detect() | 协议下拉列表（Phase 5） | `parseLine(raw: string) => ParsedLine` |
| `resource` | docs, screenshots | 资源浏览器 | 静态文件 |

**插件没有 API 白名单。** 插件和核心在同一个 WebView 里运行。核心能 import 的 JS 库（Leaflet、THREE.js、ECharts），插件全能用。视图插件只有一个契约 `{ isActive: boolean }`，之外是完整的 React 自由发挥。

### plugin.json 完整字段

```json
{
  "type": "view",
  "name": "终端",
  "version": "1.0.0",
  "icon": "terminal",
  "iconSource": "codicon",
  "description": "串口数据收发——接收区（CM6）+ 发送栏（Monaco）+ 侧栏设置",
  "author": "官方",
  "core": false,
  "entry": "index.tsx",
  "sidebar": "sidebar.tsx",
  "tabBehavior": {
    "singleton": false,
    "isFallback": false,
    "confirmOnClose": "关闭此标签页将断开串口连接"
  },
  "statusBar": [
    { "id": "connection", "icon": "circle-filled", "label": "", "align": "left" },
    { "id": "stats", "label": "TX:0  RX:0", "align": "left" }
  ],
  "recommends": [{ "plugin": "workspace", "reason": "配合卡片可视化串口数据" }],
  "suggests": [{ "plugin": "protocol-bracket", "reason": "协议解析" }],
  "changelog": [{ "version": "1.0.0", "date": "2026-07-19", "changes": ["初始发布"] }],
  "minAppVersion": "3.0.0",
  "permissions": ["serial", "filesystem"],
  "i18n": { "zh": "zh.json", "en": "en.json" },
  "cssVars": { "--my-color": { "dark": "#111", "light": "#eee" } }
}
```

`plugin.json` 是唯一数据源。插件详情页、插件市场侧栏、连锁推荐、状态栏贡献——所有 UI 都从这一份 JSON 渲染。

### 标签页系统

```
SplitNode 递归树——对标 VS Code 编辑器组
  leaf: { type: "leaf", groupId: "main" }
  branch: { type: "branch", direction: "horizontal"|"vertical",
            children: [left, right], sizes: [0.5, 0.5] }

MAX_TREE_DEPTH = 4

分屏操作：
  splitTab(tabId, "horizontal") → 拖标签到边缘 → 分裂
  moveTab(tabId, targetGroupId) → 拖标签到中间 → 合并
  unsplit(groupId) → 关闭分屏面板

keep-alive 平铺渲染：
  TabPanePositioner 组件——所有 tab pane 平级渲染（key=tabId 永远不变）
  移动标签页 → 只改 CSS left/top → React 树不变 → 零 unmount
  这是 5 次尝试才找到的解（isConnected → 模块缓存 → portal ×3 → 绝对定位）
```

### 预览模式（Preview Editor）

对标 VS Code preview editor。每个编辑器组只有一个预览标签页。

```
Tab.pinned: false → 斜体标签、单击可替换
Tab.pinned: true  → 正常字体、不会被替换

交互：
  侧栏单击插件 → preview 打开 → 下次侧栏点别的 → 替换内容
  侧栏双击插件 → pinned 打开 → 下次侧栏点别的 → 新建标签页（双屏对比）
  标签栏双击标签 → 切换 pinned/unpinned
```

### 数据管道

```
STM32 / MCU
  → UART / USB
    → Rust serialport 读线程（100ms 超时）
      → \n 拆行
        → emit("serial-data", payload)
          → React useTauriEvent 监听
            → RingBuffer.write({ text, type: "received" })
              → requestAnimationFrame drainAll()
                → CM6 appendLine（三色行 + 时间戳前缀灰色 + 裁剪 2000→500）
                  → 暂停 / 搜索 / 导出 / 筛选 / 关键字过滤
```

关键约束：
- 每个终端标签页有独立的 RingBuffer——多消费者互不干扰
- RingBuffer 容量 512，暂停缓冲 2000
- 消费端主动声明数据源（`sourceId`），卡片不认串口只认 cardId
- RUST_BACKTRACE 保护——串口关闭 → buffer 清空，不崩

### 主题系统

```
themes/dark.json → ThemeEngine.loadTheme() → applyTheme()
→ for [key, value] of theme.colors:
     document.documentElement.style.setProperty(`--${key}`, value)
→ document.documentElement.setAttribute("data-theme", theme.type)
→ 全界面即时换色，零重绘

CSS 变量 30+ 色：
  --bg-window, --bg-card, --bg-input, --bg-icon-bar, --bg-status
  --text-primary, --text-secondary, --text-muted
  --accent, --accent-hover
  --border, --separator
  --error, --warning, --badge-text
  --status-connected, --status-disconnected
  --sent-echo, --system-log, --dirty-dot
  --scrollbar-thumb, --scrollbar-thumb-hover
  --tab-hover-bg, --drop-indicator
  --drag-preview-shadow, --context-menu-shadow
```

插件可以声明自定义 CSS 变量：`"cssVars": { "--map-water": { "dark": "#1a5276", "light": "#85c1e9" } }`。ThemeEngine 切主题时一起注入。无对应主题值 → fallback 到 `--accent`。

### 持久化系统

```
PreferenceService——唯一配置入口。同步读缓存 + 异步写文件。

读取：启动时 initPrefs() → Tauri fs 读 appDataDir()/prefs.json
       → 文件不存在？查 localStorage 迁移
       → 全失败？返回 DEFAULT_PREFS

写入：savePrefs(prefs)
       → _cache = prefs（同步更新缓存）
       → saveToLocalStorage（同步，总是安全）
       → 如果有 Tauri → await writeTextFile（异步）

localStorage 兜底：npm run dev（纯浏览器）和 Tauri init 未完成时都能持久化。
```

---

## 五、UI 布局

对标 VS Code 三栏布局：

```
┌────┬──────────┬──────────────────────────────────────┐
│    │          │ TabBar：[📟 COM3] [📊 PID] [+]        │
│ 📟  │  侧栏    ├──────────────────────────────────────┤
│ 📊  │  220px  │                                      │
│ 🧩  │  可拖拽  │  主内容区                              │
│    │  可折叠  │  ┌─ 终端插件 ────────────────────────┐ │
│    │          │  │ COM3 ▼ 115200 ▼ [● 已连接]       │ │
│    │          │  ├─────────────────────────────────┤ │
│    │          │  │ 接收区（CM6）                     │ │
│    │          │  │ 发送栏（Monaco）                  │ │
│    │          │  └──────────────────────────────────┘ │
├────┴──────────┴──────────────────────────────────────┤
│ ● COM3 已连接 │ TX:1.2K RX:56.8K │ 🔔 │ 中:EN │ ☀  │
└──────────────────────────────────────────────────────┘
```

### 图标栏（Activity Bar）

- 动态列表：从 `viewRegistry.getViewPlugins()` 读取
- 拖拽换位：window 级 mousemove + portal 半透明拖影跟随鼠标 + 蓝色横线指示
- 底部固定：⚙ 设置永远在左下角，对标 VS Code Manage 齿轮
- 单一光标：始终只有一个蓝色指示条，侧栏模式优先
- `BOTTOM_ICONS` Set 控制哪些图标在底部——加个人中心只需 Set.add("account")

### 侧栏（Side Panel）

- 内容由 `sidebarView` 和 `activeTabType` 共同决定
- `sidebarView` 非 null 时（如 marketplace）→ 侧栏独立于标签页
- 对标 VS Code Extensions 面板：点 🧩 → 侧栏切为插件列表，主区不动
- 插件可以提供 `sidebar.tsx` 作为侧栏组件

### 状态栏（Status Bar）

- 22px 高度，对标 VS Code
- 左区：插件贡献项（从 `getStatusBarContributions()` 读取，按加载顺序排列）
- 右区：核心全局项（通知铃铛 🔔 + 语言切换 + 主题切换）
- 通知面板：fixed 定位右下角，header 35px 大写标题，hover 显现关闭按钮

### 标签栏（Tab Bar）

- 每个编辑器组独立标签栏
- VS Code tab sizing：fit 120px → shrink 80px → overflow scroll
- 双层拖拽：组内重排 + 组间移动/分屏
- 文件夹区分同名标签页：`终端 (介绍)` 区分于 `终端`
- 斜体预览 + 双击固定

---

## 六、UX 对标 VS Code（完整清单）

| VS Code 功能 | LinkDesk 实现 | 方式 |
|-------------|-------------|------|
| Activity Bar | IconBar | viewRegistry 动态 + 拖拽 + 底部固定 |
| Side Bar | SidePanel | sidebarView 解耦 + 插件侧栏组件 |
| Editor Groups | SplitNode 递归树 | 分屏/合并/复制/拖拽移动 |
| Preview Editor | Tab.pinned | 斜体可替换，每组一个 |
| Extensions 面板 | marketplace 侧栏 | 侧栏列表+主区不动+单击预览双击固定 |
| Extension Detail | PluginDetailView | header 96px icon + NavBar 标签 + 推荐/依赖 |
| Status Bar | StatusBar | 插件贡献点框架 |
| Notification Center | ToastContainer + 🔔 | fixed 定位 + 堆叠 + 铃铛徽章 |
| Welcome Page | WelcomeView | viewRegistry 投影快捷入口 + 最近列表 |
| Tab Sizing | fit 120→shrink 80→scroll | flex-shrink + min-width |
| Codicons | @vscode/codicons | bell/chevron/info 等 UI 控件 |
| Command Palette | Ctrl+Shift+P | 模糊搜索终端命令 |

---

## 七、当前出厂插件

| 插件 | pluginId | 类型 | 核心？ | 可卸载？ | 功能 |
|------|----------|------|:--:|:--:|------|
| 终端 | terminal | view | | ✅ | CM6 接收+Monaco 发送+侧栏设置+快捷发送+搜索+暂停+导出 |
| 工作台 | workspace | view | | ✅ | 卡片网格（Phase 7 实现，当前占位） |
| 设置 | settings | view | ✅ | | 设置页（Phase 5 实现） |
| 插件市场 | marketplace | view | ✅ | | 浏览/搜索已安装插件，侧栏+详情页 |

---

## 八、当前状态与路线图

### 已完成（Phase 1-4）

- 标签页系统 + 递归分屏 + keep-alive
- 终端插件化（CM6 + Monaco + 串口工具栏）
- 插件加载器（Vite 独立打包 + import() 运行时 + 6 类接口）
- 欢迎页 + 插件市场 + 插件详情页
- 预览模式 + IconBar 拖拽 + 通知系统
- 持久化（Tauri fs + localStorage 双路径）
- 109 个单元测试全过
- 46 个 bug 修复（B1-B48）

### Phase 5：应用基础设施层（即将开工——最后一个改框架的 Phase）

- CommandRegistry + KeybindingRegistry + CommandPalette 消费
- ConfigurationRegistry + Settings Editor + User/Workspace scope
- MenuService + context key when 条件过滤
- ProtocolRegistry + 终端下拉框动态切换
- ContextKeyService + CoreEvents 事件总线
- DataDispatch / DialogService / PluginStateService / deactivate 生命周期

### Phase 6：文件树 + 主题/语言插件化

- 文件树系统视图 + MenuId.FileContext 锚点
- 主题成为插件一等公民
- 语言包成为插件一等公民

### Phase 7：卡片工作台 + 数据管道（纯插件）

- react-grid-layout 卡片网格 + CardRegistry 渲染
- ProtocolRegistry → DataDispatch → 卡片消费端
- workspace.json 读写 + 多 workspace 切换

### Phase 8：OLED（独立插件）

- OLED 视图 + DataDispatch 订阅 + Settings Editor 配置

### AI 工作流（远期）

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

### 其他

- **Git 插件**：独立于终端，调 Rust `std::process::Command` 执行 git
- **插件社区**：在线搜索/安装/评分（需服务端）
- **Profile 切换**：一键切换全套插件+主题+设置+workspace（对标 VS Code Profile）
- **个人中心**：账户同步（图标栏底部位置已预留）
- **iframe 沙箱**：第三方插件进程隔离（接口已留好）

---

## 九、开发环境

| 工具 | 版本 |
|------|------|
| Node.js | v24.16.0 |
| Rust | 1.97.1 |
| Tauri CLI | v2（npx） |

```
npm run dev          # 纯前端预览（浏览器 dev 模式，localStorage 持久化）
npx tauri dev        # 完整桌面应用（Tauri + WebView2，文件系统持久化）
npx tsc --noEmit     # TypeScript 检查
npx vitest run       # 109 个单元测试
```

---

*文档随工程进展持续更新。最后更新：2026-07-20。*
