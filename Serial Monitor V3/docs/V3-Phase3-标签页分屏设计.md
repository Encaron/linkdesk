# Phase 3：主区标签页 + 分屏系统

> 2026-07-19 v4——分屏模型改为 VS Code 风格（每个面板独立标签栏 + TabGroup）。v3 的"全局标签栏+split.tabIds"作废。
> 关联：[V3设计方案.md §3](V3设计方案.md) / [V3开发计划.md](V3开发计划.md)

---

## 目录

1. [为什么在卡片之前做](#1-为什么在卡片之前做)
2. [交互设计](#2-交互设计)
   - [基准状态](#21-基准状态单标签页)
   - [标签栏视觉布局](#22-标签栏视觉布局)
   - [标签页内容区域](#23-标签页内容区域)
   - [分屏模式](#24-分屏模式)
   - [分屏拖拽过程](#25-分屏拖拽过程)
   - [标签栏内拖拽重排](#标签栏内拖拽重排)
   - [终端形态：标签页 vs 卡片](#26-终端形态标签页-vs-卡片)
   - [分屏时顶栏的行为](#27-分屏时顶栏的行为)
   - [设置视图的行为变化](#28-设置视图的行为变化)
   - [主题归一化：CSS 变量映射](#29-主题归一化css-变量映射)
3. [状态架构](#3-状态架构)
4. [Keep-alive 机制](#4-keep-alive-机制)
   - [为什么需要 Keep-alive](#41-为什么需要-keep-alive)
   - [渲染策略](#42-渲染策略)
   - [重新激活：CM6 / Monaco / ECharts 布局修复](#43-重新激活cm6--monaco--echarts-布局修复)
   - [rAF 循环在隐藏标签页中的行为](#44-raf-循环在隐藏标签页中的行为)
   - [View 组件契约](#45-view-组件契约)
5. [RingBuffer 多消费者](#5-ringbuffer-多消费者)
6. [图标栏角色变化](#6-图标栏角色变化)
7. [侧栏联动规则](#7-侧栏联动规则)
8. [多 workspace = 多标签页](#8-多-workspace--多标签页)
9. [拖拽分屏：drop zone 检测](#9-拖拽分屏drop-zone-检测)
10. [标签页生命周期](#10-标签页生命周期)
   - [创建](#101-创建)
   - [关闭](#102-关闭)
   - [终端保底规则](#103-终端保底规则)
   - [右键菜单](#104-标签页右键菜单)
   - [键盘快捷键](#105-键盘快捷键)
   - [关闭后的焦点](#106-关闭后的焦点)
11. [布局持久化](#11-布局持久化)
   - [存储格式](#111-存储格式)
   - [保存时机](#112-保存时机)
   - [恢复时的错误处理](#113-恢复时的错误处理)
   - [AI 友好评估](#114-ai-友好评估)
12. [技术选型](#12-技术选型)
13. [实施顺序](#13-实施顺序)
   - [workspace 占位内容](#131-phase-3-期间-workspace-标签页的占位内容)
   - [测试策略](#132-每步的测试策略)
14. [风险表](#14-风险表)
15. [对现有代码的改动清单](#15-对现有代码的改动清单)
16. [方案 §3 设计更新](#16-方案-3-设计更新)

---

## 1. 为什么在卡片之前做

Phase 2 只做完终端视图。当前主区一次只能显示一个视图（终端 / 工作台 / OLED）。进卡片开发后会出现两个问题：

1. **切来切去**——调 PID 想看串口原始输出 → 得从 📊 切回 📟，看完再切回去
2. **多 workspace 没法同时看**——心率和车距两个 workspace 各有一组卡片，想对比只能切换

方案：把主区升级为 **VS Code 编辑器区域模型**——标签页 + 拖拽分屏。先有容器，再放卡片。

---

## 2. 交互设计

### 2.1 基准状态（单标签页）

默认打开一个终端标签页。行为上和现在完全一致：

- 标签栏在顶部显示所有打开的标签页
- 点击标签页切换显示
- 当前活跃标签页高亮，其余为背景色

### 2.2 标签栏视觉布局

**单面板模式：**

```
[📟 终端] [📊 心率检测] [📊 PID调参]      [+]   ← 一个标签栏，所有标签页
──────────────────────────────────────────────────
                                                  ← 活跃标签页内容填满下方
  📟 终端接收区
```

**分屏模式——每个面板有自己的标签栏：**

```
[📟 终端] [+]                    [📊 心率检测] [📊 PID调参] [+]
──────────────────────────────┬─────────────────────────────
                              │
  📟 终端接收区                │  📊 心率检测卡片
```

- 标签栏 `display: flex; overflow-x: auto`，滚轮横向滚动
- 每个标签页最窄 80px，最宽 200px，超出省略号截断
- 每个标签页右侧 [×] 关闭按钮（hover 可见，最后一个终端标签页除外——见 §10）
- 每个标签栏最右侧 [+] 按钮——弹出菜单：新建终端 / 新建工作台 / 打开 workspace 文件

### 2.3 标签页内容区域

**关键约束：所有标签页的内容组件同时挂载，CSS 控制显隐——不是条件渲染。**

```
所有 tabs → 全部 mount → display: none/block 切换
                      → 切换标签页不丢状态（CM6 内容、滚动位置、波形历史）
```

详细机制见 [§4 Keep-alive](#4-keep-alive-机制)。

### 2.4 分屏模式

拖拽标签页到主区边缘 → 左右或上下分屏。**Phase 3 限制：仅 2-pane 分屏，不支持 3-pane 嵌套。**

**每个面板有自己的标签栏——标签页属于特定面板，拖拽到另一个面板 = 移动。** 对标 VS Code 的编辑器组模型。

左右分屏：

```
┌───────────┬──────────────────────────────────────────────┐
│ [📟 终端]  │ [📊 心率检测] [📊 PID调参]    ← 每个面板独立标签栏 │
├───────────┼──────────────────────────────────────────────┤
│           │                                               │
│  📟 终端   │  📊 心率检测（当前活跃）                        │
│  接收区    │  或切换到 PID调参                             │
│           │                                               │
└───────────┴──────────────────────────────────────────────┘
```

- **左面板的标签栏**里只有"终端"——它属于左面板
- **右面板的标签栏**里有"心率检测"和"PID调参"两个标签页——点击切换
- 标签页可以被拖到另一个面板的标签栏 → **移动**到那个面板
- 顶部**不再有全局标签栏**——标签页显示在它所属面板的标签栏中
- 两个面板之间是 draggable 分割条（allotment）
- 活跃标签页所属的面板 = 焦点面板（activeGroupId）→ 侧栏跟随焦点面板的 activeTabId

**标签页"属于哪个面板"的规则：**
- 拖标签页到另一个面板的标签栏 → 标签页从原面板移除，加入目标面板
- 拖标签页到分割条 → 创建新面板（替换语义）
- 关闭面板中最后一个标签页 → 面板消失（unsplit），终端保底规则适用

### 2.5 分屏拖拽过程（对标 VS Code 视觉）

1. mousedown 标签页 → 标签页"被拎起来"——`opacity: 0.7` + 轻微 `scale(1.02)`，跟随鼠标
2. mousemove → 半透明标签页预览跟随（`position: fixed; transform: translate()`，GPU 合成线程）
3. **拖到分屏 drop zone：** 鼠标进入主区边缘 → 目标区域出现**毛玻璃高亮**（`--drop-indicator` + `backdrop-filter: blur(4px)`）→ 持续显示"标签页放这里会变成什么样子"
4. **拖到另一个面板的标签栏：** 目标标签栏出现插入指示线（竖线夹在相邻标签页之间）→ 标签页会被**移动**到那个面板
5. **拖出所有 drop zone：** 取消拖拽（ESC 或拖到窗口外）→ 标签页飞回原位，200ms 回弹动画
6. mouseup → 在 drop zone → 执行分屏或移动；不在任何 zone → 取消

**已分屏时拖标签页到另一个面板的标签栏 → `moveTab()` 移动，不替换。** 这就是标签页"属于某个面板"的实现——拖过去就换家了。

#### 标签栏内拖拽重排

除了拖到主区形成分屏，标签页还应支持**在标签栏内拖拽重排**——对标浏览器和 VS Code 的标准行为。

**触发条件：** mousedown 标签页 → 水平拖动 → 鼠标仍在标签栏范围内。

**交互过程：**
1. mousedown → 记录标签页在 `tabs[]` 中的原始位置
2. mousemove（水平）→ 半透明预览跟随 → 其他标签页滑动让位（200ms CSS transition）
3. mousemove（垂直，拖出标签栏范围）→ 切换到分屏模式（§2.5 的 drop zone 检测）
4. mouseup → 插入新位置，更新 `tabs[]` 顺序
5. 标签页被拖出标签栏后又在标签栏范围内松开 → 放回最近的位置

**实现：** ~40 行。在 TabBar 的 mousedown 处理中，检测拖拽方向——水平为主 = 重排，垂直为主 = 分屏。重排不需要 drop zone 检测，只是交换 `tabs[]` 中的顺序。

### 2.6 终端形态：标签页 vs 卡片

V3 设计中，终端可以出现在两种容器里：

| 形态 | 容器 | 大小 | Phase |
|------|------|------|:--:|
| **终端标签页** | 主区标签栏 | 填满面板块 | Phase 3 |
| **终端卡** | 工作台卡片网格 | 卡片尺寸（和 gauge/switch/plot 同级） | Phase 4 |

它们**共用同一套 TerminalComponent 代码**（设计方案 §7）。区别只是壳不同——标签页的壳是标签栏，终端卡的壳是 Card Shell。

#### 架构决策：独立实例模型

CM6 EditorView 只能绑定一个 DOM 父节点，所以不可能"一个终端实例、多个视口"。**每个终端形态都是独立的实例——各自 RingBuffer + CM6 + 过滤设置。**

```
串口数据 → Tauri emit("serial-data")
                    ↓
        ┌──────────┼──────────┐
        ↓          ↓          ↓
   终端标签页   终端卡 A    终端卡 B
  (RingBuffer  (RingBuffer  (RingBuffer
   + CM6)       + CM6)       + CM6)
   全部数据     仅协议帧     仅纯文本
```

独立实例不是缺陷——**不同过滤规则让它们有差异化价值：**
- 终端标签页：filter = 全部 → 看所有原始数据
- 终端卡 A：filter = 协议帧 → 只看 `[xxx, ...]`
- 终端卡 B：filter = 纯文本 → 只看 debug printf

#### 约束

1. **默认只有一个终端标签页。** 启动 V3 → 一个终端标签页。不自动创建多个。
2. **终端卡是用户显式创建的。** 编辑模式 → [+] → 选"终端" → 命名 → 确定。不自动生成。
3. **终端卡创建时不影响已有终端。** 它们是独立实例。RingBuffer、CM6、暂停状态、导出——各自独立。

#### 终端卡和终端标签页的交互场景（含 Phase 4）

| # | 场景 | 行为 |
|:--:|------|------|
| 1 | 分屏 [工作台 \| 终端]，在工作台里加一张终端卡 | 创建独立的终端实例。3 个终端共存（1 tab + 1 card + 分屏面板的终端 tab）。各自独立 |
| 2 | 关闭终端标签页（分屏中） | unsplit → 工作台占满全部空间 → 工作台里的终端卡不受影响 |
| 3 | 关闭工作台里的终端卡 | 终端标签页不受影响 |
| 4 | 关闭工作台标签页（里面有终端卡） | 终端卡随之销毁。其他终端标签页保留 |
| 5 | 有两个终端标签页（terminal-1, terminal-2） | 各自独立。一个设 HEX 模式、一个设文本模式 |
| 6 | 终端卡在工作台 hidden 标签页里 | keep-alive：CM6 继续接收数据但不渲染。切回来时 `requestMeasure` |
| 7 | 终端卡在工作台内被拖拽重排（Phase 4 卡片拖拽） | 正常拖拽——终端卡和其他卡片（gauge/switch/plot）一样可以重排 |
| 8 | 拖终端卡到标签栏（Phase 4） | 终端卡消失 → 创建新的终端标签页。**新标签页的 RingBuffer + CM6 重创建，历史数据丢失**——MCU 几十 ms 一帧，几秒内填满 |
| 9 | 拖终端标签页到工作台（Phase 4） | 终端标签页关闭 → 工作台新建终端卡。同上，历史数据丢失但秒级恢复 |
| 10 | 终端卡 + 终端标签页同时暂停 | 独立暂停——一个暂停不影响另一个 |
| 11 | 终端卡 + 终端标签页同时导出 | 两个独立导出文件，各自的时间戳/编码设置 |
| 12 | 关闭所有终端标签页，只剩工作台（含终端卡） | 工作台的终端卡依然接收数据。不自动创建终端标签页——用户有终端卡可以看到数据。只有关闭最后一个终端卡时才触发保底（见 §10.3） |

**Phase 3 只管场景 1-2、5。** 其余是 Phase 4 的事，但 Phase 3 的 keep-alive 机制和独立实例模型已经为它们铺好了路——终端卡只是 TerminalComponent 外面套一个 Card Shell，数据管道完全复用。

### 2.7 分屏时顶栏的行为

顶栏包含串口选择、波特率、打开按钮、workspace 下拉框、语言/主题切换。这些是**全局共享的**——只有一个串口连接、一套主题设置。

但在分屏模式下，有些顶栏元素会出现歧义：

| 顶栏元素 | 分屏时行为 | 原因 |
|------|------|------|
| 串口选择 / 波特率 / 打开按钮 | **正常——全局唯一** | 串口只有一个连接。两个面板看到的数据来自同一个串口 |
| TX/RX 计数 | **正常——全局累计** | 计数来自所有标签页的数据流总和（Tauri 事件维度） |
| workspace 下拉框 | **显示 activeTabId 对应 workspace 的名称** | 下拉框显示"哪个 workspace 是当前上下文"。未选中时显示 activeTabId 的 workspace |
| 语言 / 主题切换 | **正常——全局** | 和现在一样 |
| 中/EN | **正常——全局** | 和现在一样 |

**分屏 + workspace 下拉框的交互：**
- 左面板 = workspace"心率检测"，右面板 = 终端
- 点击终端的接收区 → activeTabId = 终端 → **顶栏 workspace 下拉框显示空白或禁用**（终端不属于任何 workspace）
- 点击工作台的卡片 → activeTabId = 心率检测 → 顶栏显示"心率检测 ▼"
- **用户切换下拉框选择"PID调参" → 替换当前 activeTabId 所在的 workspace 标签页？还是创建新标签页？**
- **决策：切换下拉框 = 和现在一样——替换当前活跃 workspace 标签页。** 如果 activeTabId 是终端（不是 workspace），则创建新的 workspace 标签页并聚焦

### 2.8 设置视图的行为变化

**当前行为（Phase 2）：** 点 ⚙ → `activeView = "settings"` → MainContent 渲染 SettingsView。但 `contentView` 保留上一次的视图（terminal 或 workspace），用于侧栏显示和"退出设置后回到哪个视图"。

```ts
// App.tsx 当前逻辑
const handleViewChange = (view: ViewId) => {
  if (view === "settings") {
    setActiveView("settings");
  } else {
    setLastContentView(view);
    setActiveView(view);
  }
};
const contentView = activeView === "settings" ? lastContentView : activeView;
```

**Phase 3 行为：** 设置就是一个标签页。点 ⚙ → `openTab("settings")` → settings 标签页被激活。`activeTabId = "settings"` → 侧栏显示导航菜单。"退出设置" = 切换到另一个标签页（点标签栏或图标栏）。

**不再需要 `contentView` / `lastContentView`。** 标签页模型天然处理"我在看什么、设置关了回哪"。所有打开的标签页都在标签栏里，不需要额外记"上一个视图"。

**设置标签页可以在分屏中显示：** 左边设置 + 右边终端。用户边改串口参数边看终端反馈——这在旧的"设置替换视图"模型下做不到。

### 2.9 主题归一化

Phase 3 引入的标签页系统有多个 Phase 2 不存在的视觉元素。**所有颜色必须走 CSS 变量——不硬编码 hex。**

#### 主题架构：JSON 是源，CSS 变量是渲染层

```
themes/dark.json   →   ThemeEngine   →   CSS 变量   →   组件 var(--xxx)
themes/light.json        applyTheme()      setProperty      只知道变量名
```

用户和 AI 都改 JSON 文件。ThemeEngine 把 JSON 翻译成 CSS 变量。详见 [[theme-system]]。

#### Phase 3 新增变量

以下 4 个变量加入 `themes/dark.json` 和 `themes/light.json`：

| CSS 变量 | Dark 值 | Light 值 | 用途 |
|------|------|------|------|
| `--tab-hover-bg` | `#353535` | `#E8E8E8` | 非活跃标签页 hover 背景 |
| `--drop-indicator` | `rgba(14,99,156,0.20)` | `rgba(0,120,212,0.15)` | 拖拽分屏 drop zone 高亮 |
| `--dirty-dot` | `#CCA700` | `#D4A017` | 未保存修改圆点 ● |
| `--context-menu-shadow` | `0 4px 12px rgba(0,0,0,0.3)` | `0 4px 12px rgba(0,0,0,0.12)` | 右键菜单阴影 |

#### 复用现有 CSS 变量

以下 Phase 3 视觉元素直接用已有变量，**不需要新增：**

| 视觉元素 | 使用变量 | 说明 |
|------|------|------|
| 活跃标签页背景 | `--bg-window` | 和主区背景同色——标签页"融入"内容区 |
| 非活跃标签页背景 | `--bg-card` | 和卡片背景同色——标签页"缩回" |
| 活跃标签页文字 | `--text-primary` | |
| 非活跃标签页文字 | `--text-secondary` | |
| 标签页关闭按钮 [×] | `--text-muted`（常态）/ `--text-primary`（hover） | |
| 标签栏 [+] 按钮 | 同上 | |
| 标签栏底部边框 | `--separator` | 分隔标签栏和内容区 |
| 右键菜单背景 | `--bg-card` | |
| 右键菜单文字 | `--text-primary` | |
| 右键菜单位分隔线 | `--separator` | |
| 右键菜单 hover 项 | `--tab-hover-bg` | 复用新变量的值 |
| 占位 UI 文字 | `--text-muted` | |
| 占位 UI 按钮 | `--accent`（背景）/ `--text-primary`（文字） | 和现有按钮一致 |
| 分屏 resize 手柄 | `--separator`（常态）/ `--accent`（hover） | |

#### i18n 归一化：Phase 3 新增 UI 文字

V2.6 的教训：所有 UI 文字必须走 `t()` 函数，不硬编码中文字符串。以下是在现有 `en.json` 基础上 Phase 3 需要新增的 key：

| i18n key | 中文 | English |
|------|------|------|
| `tab.newTerminal` | 新建终端 | New Terminal |
| `tab.newWorkspace` | 新建工作台 | New Workspace |
| `tab.openWorkspace` | 打开 workspace 文件 | Open Workspace File |
| `tab.close` | 关闭 | Close |
| `tab.closeOthers` | 关闭其他 | Close Others |
| `tab.closeRight` | 关闭右侧 | Close to Right |
| `tab.splitDown` | 向下分屏 | Split Down |
| `tab.splitRight` | 向右分屏 | Split Right |
| `tab.noWorkspace` | 点击标签栏 [+] 新建工作台 | Click tab bar [+] to create workspace |
| `tab.dirtyConfirm` | 「{name}」有未保存的修改，确定关闭？ | "{name}" has unsaved changes. Close anyway? |
| `workspace.placeholder` | 卡片架构将在 Phase 4 实现 | Card architecture coming in Phase 4 |
| `workspace.openFile` | 打开 workspace 文件 | Open Workspace File |
| `workspace.new` | 新建 workspace | New Workspace |
| `workspace.waiting` | 等待卡片数据... | Waiting for card data... |

#### 主题/双语违规检查清单

实施 Phase 3 时，每次提交前自查：

| 检查项 | 怎么查 |
|------|------|
| 无硬编码 hex | `grep -rE '#[0-9a-fA-F]{3,8}' src/components/TabBar* src/components/views/*` 返回空 |
| 无硬编码中文 | `grep -rE '[\\u4e00-\\u9fff]' src/components/TabBar* src/components/views/*.tsx` 返回空（注释除外） |
| 所有 `t()` 的 key 在 JSON 中存在 | `tsc --noEmit` + i18next 类型校验 |
| CSS 中只用 `var(--xxx)` | `grep -rE 'color:\s*#[0-9a-fA-F]' src/**/*.css` 返回空 |

> **向前兼容：** 上表中所有 CSS 变量都支持 Phase 6 的运行时覆盖（`document.documentElement.style.setProperty()`）。用户将来选自定义强调色时，`--accent` / `--sent-echo` / `--dirty-dot` 等变量的值可以被 JavaScript 动态替换——优先级高于 `:root` 中的 CSS 静态默认值。不需要在 Phase 3 做任何特殊处理。详见 [[custom-accent-colors]]。

---

## 3. 状态架构

原设计文档（v1）的 Tab 接口过于简化。且 v3 初期采用了"全局标签栏 + 面板只显示两个标签页"的简化模型。**v4 改为 VS Code 模型——每个面板独立标签栏 + 标签页属于特定面板。**

### 3.1 核心数据结构

```ts
// ── 标签页 ──

interface Tab {
  id: string;                    // 唯一标识，规则见 §8.2
  type: "terminal" | "workspace" | "oled" | "settings" | "editor";
  label: string;                 // 标签页标题（显示在标签栏）
  workspaceName?: string;        // workspace 类型才有——对应的 workspace 文件名
  filePath?: string;             // editor 类型才有——文件路径（Phase 6）
  dirty: boolean;                // 有未保存修改 → 标签页标题前显示 ●。创建时初始值 = false
}

// ── 标签组（每个面板一个组，组有自己的标签栏）──

interface TabGroup {
  id: string;                    // 组唯一标识——"main" / "left" / "right" 等
  tabs: Tab[];                   // 该组拥有的标签页，按打开顺序排列
  activeTabId: string;           // 该组中当前活跃的标签页
}

// ── 分屏布局 ──

interface SplitLayout {
  direction: "horizontal" | "vertical";
  groupIds: [string, string];    // 精确 2 个——左/上、右/下
  sizes: [number, number];       // 百分比，如 [50, 50]。运行时由 allotment 维护
}

// ── 顶层状态 ──

interface TabState {
  groups: TabGroup[];            // 始终至少 1 个组。单面板 → [{id:"main", tabs:[...], ...}]；分屏 → 2 个组
  activeGroupId: string;         // 最后被用户交互的组——决定侧栏内容
  split: SplitLayout | null;     // null = 单面板模式
}
```

**和 v3 简化模型的区别：**
- 旧：`tabs[]` 全局 + `split.tabIds` 指向当前可见的两个 → 标签页"漂浮"，不"归属"
- 新：标签页属于特定 `TabGroup`。拖到另一个面板 = **从 groups[0].tabs 移除，加入 groups[1].tabs**
- 换组通过 `moveTab(tabId, targetGroupId)`，不是 `splitTab`

```ts
// 创建标签页时的默认值
function createTabDefaults(type: string, overrides?: Partial<Tab>): Tab {
  return {
    id: generateTabId(type, overrides?.workspaceName ?? overrides?.filePath),
    type,
    label: overrides?.label ?? getDefaultLabel(type, overrides?.workspaceName),
    workspaceName: overrides?.workspaceName,
    filePath: overrides?.filePath,
    dirty: false,
  };
}
```

### 3.2 TabState 管理

`useTabManager` hook，放在 App.tsx 中：

```ts
function useTabManager(): {
  tabState: TabState;

  // 标签页操作
  openOrFocusTab: (type: string) => void;            // 图标栏用——只聚焦不创建
  createTab: (type: string, opts?: {                // [+] 按钮 / 设置页用——显式创建
    workspaceName?: string; filePath?: string; label?: string;
    targetGroupId?: string;                         // 指定加入哪个组（默认 activeGroupId）
  }) => string;                                      // 返回新标签页 ID
  closeTab: (tabId: string) => void;                 // 关闭，含边界处理
  focusTab: (tabId: string) => void;                 // 切换活跃标签页
  moveTab: (tabId: string, targetGroupId: string) => void;  // 移动标签页到另一个组

  // 分屏操作
  splitTab: (tabId: string, direction: "left" | "right" | "up" | "down") => void;
  unsplit: () => void;
  updateSplitSizes: (sizes: [number, number]) => void;

  // 持久化
  restoreLayout: (layout: LayoutData) => void;
  toLayoutData: () => LayoutData;
}
```

### 3.3 状态流转规则

| 调用方法 | 条件 | 结果 |
|------|------|------|
| `openOrFocusTab("terminal")` | 已有终端标签页 | 在任意组中找到最近的终端标签页 → 聚焦 |
| `openOrFocusTab("terminal")` | 全局无终端标签页 | 在 `activeGroupId` 组中创建 `terminal-1`，聚焦 |
| `createTab("workspace", { workspaceName })` | 已有同名 workspace | 聚焦已有的 |
| `createTab("workspace", { workspaceName })` | 不存在 | 在 `targetGroupId` 组（默认 activeGroupId）中创建，聚焦 |
| `openOrFocusTab("workspace")` | 有工作台标签页 | 聚焦最近活跃的 |
| `openOrFocusTab("workspace")` | 无工作台标签页 | **不创建。** 触发 tooltip（§6.2） |
| `closeTab(id)` | 全局标签页数 > 1 | 从所属组移除。若该组变空 → unsplit。若 split 且只剩另一组 → unsplit |
| `closeTab(id)` | 全局最后一个标签页 | 忽略（终端保底） |
| `moveTab(tabId, targetGroupId)` | — | 从原组移除 → 加入目标组 → 聚焦。拖标签页到另一个面板的标签栏调用此方法 |
| `splitTab(tabId, direction)` | split === null | 创建新组 → 把 tabId 移到新组 → 形成分屏 |
| `splitTab(tabId, direction)` | split !== null | **忽略。** 2-pane 限制。拖拽到已有分屏时用 `moveTab` |
| 点击组内标签页（调用 `focusTab`） | — | 设置该组的 `activeTabId` + 设置 `activeGroupId` |
| `createTab(type, opts)` | 未指定 targetGroupId | 在 activeGroupId 所在组创建 |

### 3.4 派生值（不在 state 中存储，useMemo 派生）

```ts
// 全局所有标签页（扁平化）
const allTabs = tabState.groups.flatMap(g => g.tabs);

// 活跃标签页——侧栏内容跟随这个
const activeGroup = tabState.groups.find(g => g.id === tabState.activeGroupId);
const activeTab = activeGroup?.tabs.find(t => t.id === activeGroup.activeTabId);
```

### 3.4 TabManager 的可访问性

`useTabManager` hook 放在 App.tsx 中。但 View 组件内部也需要调用 `createTab`：

| 谁调用 | 调用什么 | 场景 |
|------|------|------|
| IconBar | `openOrFocusTab()` | 图标栏点击 |
| TabBar 的 [+] 按钮 | `createTab()` | 新建标签页 |
| SettingsView | `createTab("editor", { filePath })` | "以 JSON 编辑 prefs.json" |
| WorkspaceView | `createTab("workspace", { workspaceName })` | 打开新的 workspace |
| 顶栏 workspace 下拉框 | `createTab("workspace", ...)` | 选择 workspace 文件 |

**传递方式：** `useTabManager` 返回的方法通过 **React Context** 向下传递（`TabManagerContext`），或者通过 props 逐层传。推荐 Context——避免 props 穿透多层组件。和 Phase 2 已有的 `TerminalPrefsContext` 同模式。

---

## 4. Keep-alive 机制

### 4.1 为什么需要 Keep-alive

当前代码 [MainContent.tsx:15](src/components/MainContent.tsx#L15)：

```tsx
{activeView === "terminal" && <TerminalView />}
```

这是**条件渲染**——切换视图时 React unmount 整个 TerminalView：
- CM6 EditorView → `destroy()`
- RingBuffer → GC
- Tauri event listener → `unlisten()`
- Monaco Editor → dispose

Phase 3 要求"切换标签页不丢状态"。**所有标签页必须同时挂载，只用 CSS 控制显隐。**

### 4.2 渲染策略

**每个 TabGroup 渲染自己的标签栏 + 内容区。** 标签页属于特定组，不在组间共享。

```tsx
function MainContent({ tabState }: { tabState: TabState }) {
  const { groups, activeGroupId, split } = tabState;

  // 一个 TabGroup 渲染一个面板（标签栏 + 内容区）
  const renderGroup = (group: TabGroup) => {
    const activeTab = group.tabs.find(t => t.id === group.activeTabId);
    return (
      <div className="tab-group" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {/* 该组的独立标签栏 */}
        <TabBar
          group={group}
          isActiveGroup={group.id === activeGroupId}
          onTabClick={...}
          onTabClose={...}
          onTabDrag={...}
        />
        {/* 标签页内容池——keep-alive：CSS 控制显隐 */}
        <div className="tab-content-pool" style={{ flex: 1, position: "relative" }}>
          {group.tabs.map(tab => (
            <div
              key={tab.id}
              style={{
                display: tab.id === group.activeTabId ? "flex" : "none",
                flex: 1, minHeight: 0, overflow: "hidden",
              }}
            >
              <TabContent
                tab={tab}
                isActive={tab.id === group.activeTabId && group.id === activeGroupId}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (split) {
    const [g1, g2] = split.groupIds.map(id => groups.find(g => g.id === id)!);
    return (
      <Allotment onChange={(sizes) => updateSplitSizes(sizes as [number, number])}>
        <Allotment.Pane preferredSize={`${split.sizes[0]}%`}>
          {renderGroup(g1)}
        </Allotment.Pane>
        <Allotment.Pane preferredSize={`${split.sizes[1]}%`}>
          {renderGroup(g2)}
        </Allotment.Pane>
      </Allotment>
    );
  }

  // 单面板——只有 main 组
  return <div className="main-content">{renderGroup(groups[0])}</div>;
}
```

**关键点：**
- 每个组有独立的 `TabBar` 组件实例——标签页不会"漂浮"在全局标签栏中
- 标签页内容仍用 keep-alive（CSS display 切换），但可见性只看**该组**的 activeTabId
- 分屏时渲染两个 `renderGroup()`，各自带自己的标签栏和内容
- 拖标签页到另一个面板 → `moveTab(tabId, targetGroupId)` → 标签页从 groups[0].tabs 消失，出现在 groups[1].tabs 中

### 4.3 重新激活：CM6 / Monaco / ECharts 布局修复

当标签页从 `display:none` 变为 `display:flex` 时，之前缓存的布局测量（容器尺寸为 0×0）失效。每个 View 组件接收 `isActive` prop，内部处理重新激活：

```ts
// TerminalView 内部
function TerminalView({ isActive }: { isActive: boolean }) {
  // ...

  useEffect(() => {
    if (isActive && cmView.current) {
      // display:none → flex 后，CM6 缓存了 0×0 的 viewport 测量
      // 需要等 CSS 生效（下一帧）再触发重排
      requestAnimationFrame(() => {
        cmView.current?.requestMeasure();
      });
    }
  }, [isActive]);

  // Monaco 同理
  useEffect(() => {
    if (isActive && monacoRef.current) {
      requestAnimationFrame(() => {
        monacoRef.current?.layout();
      });
    }
  }, [isActive]);
}
```

**适用组件列表：**

| 组件 | 重新激活操作 | 备注 |
|------|------|------|
| TerminalView | `cmView.requestMeasure()` + `monacoEditor.layout()` | CM6 + Monaco 各调一次 |
| WorkspaceView | 每张卡的 `chart.resize()`（Phase 4） | ECharts 实例遍历 |
| OLED | Canvas resize（Phase 5） | 重设 canvas 尺寸 |
| Settings | 无需操作 | 纯 DOM，CSS 自动处理 |

### 4.4 rAF 循环在隐藏标签页中的行为

当前 TerminalView 的 rAF 循环：

```ts
// TerminalView.tsx L342-373
useEffect(() => {
  const drain = () => {
    const items = ringBuffer.current.drainAll();
    for (const item of items) {
      appendLine(item.text, item.type);  // → CM6 dispatch
    }
    rafId = requestAnimationFrame(drain);
  };
  rafId = requestAnimationFrame(drain);
  return () => cancelAnimationFrame(rafId);
}, [appendLine, paused]);
```

**隐藏标签页的 rAF 行为：** `display: none` 元素中的 rAF 仍然正常执行。CM6 `dispatch()` 仍然更新内部文档。**没有性能问题**——CM6 在不可见时不做 layout/paint，只更新数据结构。

**结论：Phase 3 不需要对隐藏标签页的 rAF 做任何特殊处理。** 如果后续发现 CPU 占用高（5+ 标签页），可以加 `isVisible` 条件跳过 `appendLine`，数据暂存 RingBuffer。但 Phase 3 不需要这个优化。

### 4.5 View 组件契约

所有需要在标签页系统中渲染的 View 组件**必须**实现以下接口。这是标签页系统与内容之间的唯一接触点——加新视图类型不需要改标签页系统代码。

```ts
// 每个 View 组件必须接收的唯一 prop
interface ViewComponentProps {
  isActive: boolean;  // 当前标签页是否是活跃标签页
                      // - false → true: 刚被激活 → 应在下一帧调 requestMeasure/layout
                      // - true → false: 变为不活跃 → 无需操作（keep-alive 保留状态）
                      // - 在分屏中两个面板都可见时，只有被点击的面板 isActive = true
}

// TabContent —— 标签页类型到组件的映射（MainContent 内部，唯一位置）
function renderTabContent(tab: Tab, isActive: boolean): JSX.Element {
  switch (tab.type) {
    case "terminal":   return <TerminalView isActive={isActive} />;
    case "workspace":  return <WorkspaceView isActive={isActive} workspaceName={tab.workspaceName} />;
    case "settings":   return <SettingsView isActive={isActive} />;
    case "oled":       return <OLEDView isActive={isActive} />;    // Phase 5
    case "editor":     return <EditorTab isActive={isActive} filePath={tab.filePath} />;  // Phase 6
  }
}
```

**`isActive` 的精确语义：**

| 场景 | tab.id === activeTabId | isActive prop |
|------|:--:|:--:|
| 单面板，此标签页正在显示 | true | true |
| 单面板，此标签页被其他标签页覆盖 | false | false |
| 分屏，此标签页在左面板，用户刚点击了左面板 | true | true |
| 分屏，此标签页在右面板，用户刚点击了左面板 | false | false |
| 分屏，此标签页不在任何面板中（隐藏） | false | false |

**`isActive` 和 `requestMeasure` 的关系：** `isActive` 同时承担两个职责——控制 `requestMeasure` 和决定侧栏内容。在分屏中，非活跃面板的标签页仍然可见但 `isActive = false`，这不会导致 `requestMeasure` 重复调用（CM6 对多余调用是 no-op），同时正确地让侧栏跟随焦点。

---

## 5. RingBuffer 多消费者

原设计文档（v1）§8 风险表写了一句：

> "Phase 3 先不改 RingBuffer，两个面板各自创建独立 RingBuffer，从不同的 `listen()` 消费"

这句话**方向对，但没说清楚为什么能工作。** 两个面板"各自创建独立 RingBuffer"听起来像 workaround，需要论证它为什么不是 hack、什么时候会真的出问题。

### 5.1 为什么"独立 RingBuffer"能工作

当前数据流：

```
Rust serialport → emit("serial-data", line)
                      ↓
TerminalView: useTauriEvent("serial-data", cb)
  → cb(line) → ringBuffer.write(line) → rAF → drainAll → CM6
```

**Tauri 事件系统本身是多 listener 的。** 每个 `listen("serial-data", cb)` 都注册了独立的回调。所有回调被逐一调用，互不干扰。

Phase 3 多标签页时的数据流：

```
Rust serialport → emit("serial-data", line)
                      ↓
          ┌───────────┼───────────┐
          ↓           ↓           ↓
    Terminal Tab 1   Workspace   Terminal Tab 2
    ringBuffer_A     ringBuffer_B  ringBuffer_C
    → CM6            → Cards       → CM6
```

每个标签页各自调用 `useTauriEvent("serial-data", cb)` → 各自 `ringBuffer.write()` → 各自 `drainAll()` → 各自消费。**没有竞争，不需要 Pub/Sub 重构。**

### 5.2 资源消耗分析

| 标签页数 | listener 数 | RingBuffer 内存 | 每条数据开销 | 评估 |
|:--:|:--:|:--:|:--:|------|
| 1 | 1 | 512 条 | 1 次回调 | 基准 |
| 3 | 3 | 1536 条 (~150KB) | 3 次回调 | ✅ 无感知 |
| 5 | 5 | 2560 条 (~250KB) | 5 次回调 | ✅ 无感知 |
| 10 | 10 | 5120 条 (~500KB) | 10 次回调 + 字符串分配 ×10 → GC 频率轻微上升 | ⚠️ 仍可用 |

**Phase 3 预期 2-5 个标签页，独立 RingBuffer 完全可接受。**

### 5.3 升级路径：何时需要 Pub/Sub

当标签页数 > 10 或数据频率 > 10kHz 时：改用**单一 listener + fan-out**：

```ts
// 理想的 pub/sub——Phase 3 不需要，留给未来
class SerialDataBus {
  private listeners = new Set<(line: string) => void>();

  constructor() {
    listen("serial-data", (event) => {
      this.listeners.forEach(fn => fn(event.payload));
    });
  }

  subscribe(fn: (line: string) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
```

---

## 6. 图标栏角色变化

原设计（设计方案 §3.2）的定义很简单："图标栏就是视图切换器。没有标签页。" 点 📟 → 主区显示终端；点 📊 → 主区显示工作台；点 ⚙ → 主区显示设置。一个图标对应一个视图，互斥。

引入标签页后，图标栏的语义必须改变——不再"切换视图"，而是"打开和聚焦某类标签页"。原因是：标签页可以同时存在多个（两个终端标签页 + 三个工作台标签页），"切换"变成了模糊的概念——切换到哪个终端？哪个工作台？

### 6.1 新语义

| 图标 | 原设计 | Phase 3 新设计 |
|------|------|------|
| 📟 | 切换到终端视图 | 打开/聚焦终端标签页 |
| 📊 | 切换到工作台视图 | 打开/聚焦工作台标签页 |
| ⚙ | 切换到设置视图 | 打开/聚焦设置标签页 |

图标栏不再"切换视图"——它**只聚焦标签页**。不创建、不循环。如果需要新建标签页，通过标签栏的 [+] 按钮（对标 VS Code 的 Ctrl+N），而不是图标栏隐式创建。

### 6.2 点击行为精确规格

**📟 终端图标：**

| 当前状态 | 点击行为 |
|------|------|
| 有终端标签页 | 聚焦最近活跃的终端标签页 |
| 无终端标签页 | 创建一个（终端保底：启动时自动建，关闭最后一个时也自动建） |

**📊 工作台图标：**

| 当前状态 | 点击行为 |
|------|------|
| 有工作台标签页 | 聚焦最近活跃的工作台标签页 |
| 无工作台标签页 | **不创建。** 弹出 tooltip："点击标签栏 [+] 新建工作台" |

**⚙ 设置图标：**

| 当前状态 | 点击行为 |
|------|------|
| 有设置标签页 | 聚焦它（设置是单例，不创建第二个） |
| 无设置标签页 | 创建并聚焦（设置也是隐式创建——用户预期点 ⚙ 就能看到设置，这和 📊 不同） |

**为什么 📟/⚙ 保留隐式创建，📊 不保留：**
- 📟 终端是核心功能——串口助手的根。启动时必须有一个，关闭最后一个时必须补一个（终端保底）。隐式创建和保底逻辑一致。
- ⚙ 设置是用户的基本预期——点齿轮就打开设置，所有软件都是这样的。而且设置只有一个，没有歧义。
- 📊 工作台在 Phase 3 没有内容——隐式创建只是打开一个占位 UI，用户得不到任何价值。Phase 4 卡片上线后再评估是否需要恢复隐式创建（如果 workspace 模板足够智能的话）。

**为什么去掉"循环"：**
- 循环行为下，同一个操作（点 📊）每次产生不同结果——用户必须记住"现在是第几个、下一个是什么"
- tabs[] 的顺序随着打开/关闭标签页变化 → 循环目标不稳定
- 有 5 个标签页时，循环到目标要 3-4 次点击 → 比直接点标签页更慢
- 相比之下，"聚焦最近的" 永远是同一个结果——操作可预测

### 6.3 图标栏高亮

保留当前选中蓝条 + 光晕。高亮条件：`activeTabId` 对应的标签页类型和图标匹配。

---

## 7. 侧栏联动规则

### 7.1 联动规则

| activeTabId 的标签页类型 | 侧栏显示 |
|------|------|
| terminal | 收发设置（和现在一样：时间戳/回显/行号/编码...） |
| workspace | 卡片属性编辑器（选中卡时）/ 卡片概览列表（未选中时） |
| oled | 图形属性面板 |
| settings | 导航菜单 |

### 7.2 分屏时的焦点规则

**两个面板都可见时，`activeTabId` 是最后被用户交互的标签页。** 侧栏跟随 `activeTabId`。

```
场景：左边终端 + 右边工作台（分屏）
  1. 用户点击左面板的终端 → activeTabId = 终端 → 侧栏 = 收发设置
  2. 用户点击右面板的工作台 → activeTabId = 工作台 → 侧栏 = 卡片属性
```

### 7.3 SidePanel 改动

[SidePanel.tsx](src/components/SidePanel.tsx) 当前接收 `activeView: ViewId`。改为接收 `activeTabType: TabType`，由 TabState 推导。

---

## 8. 多 workspace = 多标签页

### 8.1 标签页和工作台的关系

- 每个 workspace 文件（如 `workspace_heart_rate.json`）= 一个 📊 标签页
- 标签页标题 = workspace 名称（"心率检测"、"PID调参"）
- 多个 workspace 标签页同时存活——各自独立消费 RingBuffer 数据、各自卡片注册表

### 8.2 标签页身份（ID）规则

| 类型 | ID 模式 | 单例？ | 示例 |
|------|------|:--:|------|
| terminal | `"terminal-{n}"` | 否——允许多个终端标签页 | `"terminal-1"` |
| workspace | `"workspace-{文件名}"` | 是——按文件名去重 | `"workspace-heart_rate"` |
| settings | `"settings"` | 是——只能有一个 | `"settings"` |
| oled | `"oled"` | 是——只能有一个 | `"oled"` |

**去重逻辑：**
- `openTab("workspace", "heart_rate")` → 检查 `tabs[]` 中是否已有 `"workspace-heart_rate"` → 有则聚焦，无则新建
- `openTab("terminal")` → 不按 ID 去重——每次可创建新的。首次创建 `terminal-1`，再次创建 `terminal-2`

### 8.3 workspace 标签页的 dirty 标记

| 触发 dirty = true | 触发 dirty = false |
|------|------|
| 卡片属性修改（颜色/标题/单位/范围） | 手动保存（Ctrl+S） |
| 卡片增删 | 自动保存（如果开启） |
| 卡片位置变更（拖拽） | — |

dirty 标记显示为标签页标题前的 **● 圆点**（对标 VS Code 的 unsaved 圆点）。

### 8.4 顶栏 workspace 下拉框共存

顶栏的 workspace 下拉框和标签页可以共存：
- **下拉框** = "加载已有的 workspace 文件"（打开文件 → 创建标签页）
- **📊 图标** = "打开/聚焦工作台标签页"

---

## 9. 拖拽分屏：drop zone 检测

### 9.1 5-zone 检测算法

将主区划分为 5 个区域进行 drop zone 检测：

```
┌─────────────────────────────────┐
│          上 25%                 │  → 上下分屏（标签页放到上方）
├────────┬────────────┬──────────┤
│        │            │          │
│ 左 25% │  中 50%    │ 右 25%   │
│        │  (标签堆叠) │          │
│        │            │          │
├────────┴────────────┴──────────┤
│          下 25%                 │  → 上下分屏（标签页放到下方）
└─────────────────────────────────┘
```

```ts
type DropZone = "left" | "right" | "up" | "down" | "center" | null;

function detectDropZone(
  mouseX: number, mouseY: number,
  rect: DOMRect
): DropZone {
  const relX = (mouseX - rect.left) / rect.width;
  const relY = (mouseY - rect.top) / rect.height;

  // 边沿区域优先检测
  if (relY < 0.25) return "up";
  if (relY > 0.75) return "down";
  if (relX < 0.25) return "left";
  if (relX > 0.75) return "right";
  // 中心
  if (relX >= 0.25 && relX <= 0.75 && relY >= 0.25 && relY <= 0.75) return "center";

  return null;
}
```

### 9.2 各 drop target 的行为

V3 的拖拽有三个合法目标区域：

| Drop Target | 检测方式 | 行为 |
|------|------|------|
| **主区边缘** (left/right/up/down) | 5-zone 算法检测主区 rect | 未分屏 → `splitTab(tabId, direction)`；已分屏 → 忽略（2-pane 限制） |
| **另一个面板的标签栏** | `TabBar` 组件自身的 `onDragOver` | `moveTab(tabId, targetGroupId)`——标签页**换面板** |
| **同面板标签栏** | `TabBar` 自身检测 | 重排——交换 `tabs[]` 中位置（§2.5 标签栏内拖拽重排） |
| **null**（拖到窗口外 / ESC） | — | 取消，预览飞回原标签栏 |

### 9.3 已分屏时的拖拽行为

已分屏时拖标签页到另一个面板的标签栏 → **移动，不是替换：**

```
当前：[终端] | [工作台A]
拖 "终端" 到右面板标签栏 → 终端从 groups[0].tabs 移除 → 加入 groups[1].tabs
结果：[空] | [工作台A] [📟 终端]
      → groups[0] 变空 → unsplit → 只剩一个面板
```

**关键区别：** v3 的"替换"（旧标签页回全局标签栏隐藏）不再存在——因为没有全局标签栏了。标签页只存在于某个组的标签栏中。

### 9.4 实现方式

**自定义 mousedown/mousemove/mouseup**——不用 HTML5 Drag and Drop API。

原因：
- HTML5 DnD 的拖拽预览由浏览器控制，无法自定义外观
- `dragover` 事件在 Windows 上频率不稳定
- 无法在拖拽过程中显示自定义 drop indicator

核心步骤：
1. `mousedown` 标签页 → 记录起始位置，创建半透明预览 clone（`position: fixed` + `transform: translate()`）
2. `mousemove` → 更新预览位置 + 调用 `detectDropZone()` + 更新 drop indicator CSS
3. `mouseup` → 在 drop zone → 执行对应操作；不在 → 取消动画
4. `keydown Escape` → 取消拖拽

**预览性能：** `transform: translate()` 在 GPU 合成线程执行，不触发 layout/paint，16ms 一帧稳定。

### 9.5 取消分屏

拖拽面板中的唯一标签页回到标签栏 → 分屏取消，另一个面板占满全部空间。

关闭面板中的标签页（[×]）→ 同上，分屏取消。

### 9.6 未来扩展：工作台卡片网格作为 drop target（Phase 4）

Phase 4 卡片架构完成后，主区会出现第三种 drop target——**工作台的卡片网格**。拖拽方向不同，语义不同：

| 拖拽方向 | 行为 |
|------|------|
| 标签页 → 主区边缘（left/right/up/down） | **分屏**（Phase 3 已有）——创建第二个面板 |
| 终端标签页 → 工作台卡片网格 | **终端标签页变成终端卡**——标签页关闭，工作台里新建一张终端卡 |
| 工作台里的终端卡 → 标签栏 | **终端卡变成终端标签页**——卡片删除，新建终端标签页 |

**历史数据丢失是可接受的。** 标签页 ↔ 终端卡互转时，RingBuffer + CM6 重创建，历史数据清空。但 MCU 每几十毫秒发一帧数据，新实例在几秒内就被填满。这和设计方案 §2.4 的设计原则一致：组件替换的简洁性 > 跨类型数据迁移的复杂性。

**Phase 3 不需要实现这些 drop target。** 但 drag 系统应预留扩展点——`detectDropZone()` 返回的 zone 类型是可扩展的 union，未来加 `"card-grid"` 不破坏现有逻辑。

---

## 10. 标签页生命周期

### 10.1 创建

| 触发方式 | 行为 |
|------|------|
| 点 📟 图标 | 聚焦已有终端标签页。无则自动创建（终端保底：启动时建、关闭最后一个时补） |
| 点 📊 图标 | **仅聚焦，不创建。** 聚焦最近活跃的工作台标签页。无则 tooltip 提示 |
| 点 ⚙ 图标 | 聚焦已有设置标签页。无则创建（隐式创建——用户预期点齿轮就能看到设置） |
| 标签栏 [+] 按钮 | 弹出菜单：新建终端 / 新建工作台 / 打开 workspace 文件 |
| 顶栏 workspace 下拉框选文件 | 创建对应 workspace 标签页（按文件名去重），聚焦 |
| Ctrl+T | 新建终端标签页（最常用） |

### 10.2 关闭

| 条件 | 行为 |
|------|------|
| 关闭普通标签页（不是最后一个） | 关闭。若被关的是分屏面板 → unsplit |
| 关闭分屏面板中的标签页 | 面板消失 → 另一个面板占满全部 → 被关的标签页从 tabs[] 移除 |
| 关闭有 dirty 标记的 workspace 标签页 | **弹出确认框**："「{名称}」有未保存的修改，确定关闭？" |
| 关闭唯一的标签页 | **忽略。** 终端标签页是保底——清空接收区 + 重置状态，不关闭标签页本身 |
| 关闭最后一个非终端标签页，只剩终端 | 正常关闭，终端保留 |

### 10.3 终端保底规则

- 标签栏**始终至少有一个终端标签页**
- 关闭终端时：若还有其他标签页 → 终端正常关闭。若只剩终端 → [×] 变成"清空接收区"而非"关闭"，或直接隐藏 [×]
- 所有其他标签页关闭后 → 自动创建终端标签页（如果不存在）

**为什么不像 VS Code 那样允许关闭所有标签页、显示空窗口？** VS Code 的空窗口有意义——它是一个通用编辑器，空窗口可以打开文件、克隆仓库、新建项目。V3 的空窗口只有一个答案——打开串口开始收发。终端保底就是这个答案的强制体现：不让用户进入"不知道该干什么"的空白状态。这里不照搬 VS Code。

**实现方式：** 在 `closeTab()` 中判断：
```ts
function closeTab(tabId: string) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  
  // 检查是否可以关闭
  if (tabs.length === 1 && tab.type === "terminal") {
    // 清空接收区，不关闭
    clearTerminalContent(tabId);
    return;
  }
  
  if (tab.dirty) {
    showConfirmDialog(`「${tab.label}」有未保存的修改，确定关闭？`, () => {
      actuallyCloseTab(tabId);
    });
    return;
  }
  
  actuallyCloseTab(tabId);
}
```

### 10.4 标签页右键菜单

右击标签页弹出上下文菜单。对标 VS Code 的标签页右键菜单，V3 需要的选项：

| 菜单项 | 条件 | 行为 |
|------|------|------|
| **关闭** | 始终可用 | 同点击 [×]（含边界处理：dirty 确认、终端保底） |
| **关闭其他** | 有 ≥2 个标签页 | 关闭除当前标签页外的所有标签页。每个关闭走 `closeTab()` 的完整逻辑 |
| **关闭右侧** | 当前标签页不是最右边 | 关闭标签栏中当前标签页右侧的所有标签页 |
| **向下分屏** | split === null（未分屏） | `splitTab(activeTabId, "vertical")` |
| **向右分屏** | split === null（未分屏） | `splitTab(activeTabId, "horizontal")` |

**不在 Phase 3 菜单中的项：**
- "复制标签页"——workspace 标签页的复制语义模糊（复制文件？还是复制视图？），留给以后
- "固定标签页"——V3 没有 VS Code 的 pin 语义，暂时不需要
- "移动到侧栏"——VS Code 概念，V3 没有

**实现：** `TabBar.tsx` 中每个标签页监听 `onContextMenu`。菜单用 `position: fixed` 定位在鼠标位置，点击外部或 Escape 关闭。

### 10.5 键盘快捷键

标签页系统的键盘快捷键——**不是打磨，是核心交互。** 对标 VS Code：

| 快捷键 | 行为 | 备注 |
|------|------|------|
| `Ctrl+W` | 关闭当前标签页 | 含 dirty 确认 + 终端保底 |
| `Ctrl+Tab` | 切换到下一个标签页 | 按 tabs[] 顺序循环 |
| `Ctrl+Shift+Tab` | 切换到上一个标签页 | 反向循环 |
| `Ctrl+\` | 向右分屏当前标签页 | 如果已分屏 → unsplit（toggle） |
| `Ctrl+1` ~ `Ctrl+9` | 切换到第 N 个标签页 | 对应 tabs[] 索引 0-8 |

**实现位置：** 在 `App.tsx` 的 `useEffect` 中注册全局 `keydown` 监听。理由：快捷键是全局行为，不在 TabBar 组件内处理（TabBar 可能因为 keep-alive 逻辑而存在多个实例的错觉，但键盘快捷键应该只注册一次）。

```ts
// App.tsx
useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      closeTab(tabState.activeTabId);
    }
    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault();
      const idx = tabs.findIndex(t => t.id === tabState.activeTabId);
      const next = e.shiftKey ? idx - 1 : idx + 1;
      focusTab(tabs[(next + tabs.length) % tabs.length].id);
    }
    if (e.ctrlKey && e.key === '\\') {
      e.preventDefault();
      if (tabState.split) unsplit();
      else splitTab(tabState.activeTabId, "right");
    }
    // Ctrl+1~9
    const num = parseInt(e.key);
    if (e.ctrlKey && num >= 1 && num <= 9 && tabs[num - 1]) {
      e.preventDefault();
      focusTab(tabs[num - 1].id);
    }
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [tabState, closeTab, focusTab, splitTab, unsplit]);
```

### 10.6 关闭后的焦点

关闭标签页后，焦点转移到：
1. 分屏中另一个面板的标签页（如果之前是分屏）
2. 标签栏中右侧相邻的标签页
3. 最右边的标签页（如果被关的是最右边的）

---

## 11. 布局持久化

### 11.1 存储格式

在 `prefs.json` 中增加 `layout` 字段：

```json
{
  "window": { "left": 100, "top": 50, "width": 960, "height": 640 },
  "theme": "Dark",
  "lastPort": "COM3",
  "preferences": { ... },
  "quickSends": { ... },
  "layout": {
    "tabs": [
      { "id": "terminal-1", "type": "terminal", "label": "终端" },
      { "id": "workspace-heart_rate", "type": "workspace", "label": "心率检测", "workspaceName": "heart_rate" }
    ],
    "activeTabId": "terminal-1",
    "split": null
  }
}
```

### 11.2 保存时机

| 事件 | 操作 |
|------|------|
| 标签页打开/关闭 | 立即保存 tabs[] |
| 活跃标签页切换 | 防抖 500ms 保存 activeTabId |
| 分屏创建/取消 | 立即保存 split |
| 分屏 resize | 防抖 1s 保存 split.sizes（allotment onChange 每像素触发） |
| 应用退出前 | 保存全部 layout |

**⚠️ 异步写入时序：** PreferenceService（Step 0 已完成 Tauri fs 迁移）采用「缓存先更新 + 异步写文件」模式——`savePrefs()` 立即更新内存缓存 `_cache`，然后 await 写文件。这意味着：

- **会话内一致性**：`loadPrefs()` 从缓存读，始终是最新状态。两次快速 `savePrefs()` 之间没有竞态——缓存是同步更新的。
- **跨会话持久化**：两次快速 `savePrefs()` 的异步写入可能同时进行（如「关闭标签页 → 立即保存」和「切换标签页 → 500ms 防抖保存」）。极端情况下后启动的写入可能先完成，被先启动的写入覆盖。但由于每次 `savePrefs()` 写入的是**完整 prefs 对象**（含最新的 `layout`），且覆盖的是上一次写入的结果，最终文件状态 = 最后一次 `savePrefs()` 调用的状态——这正是用户最后一次操作的正确状态。
- **崩溃场景**：如果 V3 在两次快速保存之间崩溃，文件可能处于中间状态。但 `restoreLayout()` 的 try-catch + 默认单终端保底逻辑保证不会因此无法启动。

**结论：不需要写队列。** 缓存优先模式对 Phase 3 的布局持久化场景是安全的。

```ts
function restoreLayout(): TabState {
  try {
    const prefs = PreferenceService.loadPrefs();
    const layout = (prefs as any).layout;
    if (!layout) throw new Error("无布局数据");

    // 校验 tabs
    const validTabs = layout.tabs.filter((t: any) => {
      if (!t.id || !t.type || !t.label) return false;
      // workspace 标签页检查文件是否存在
      if (t.type === "workspace" && t.workspaceName) {
        // Phase 3: workspace 文件可能还不存在（Phase 4 才实现）
        // 先保留标签页，Phase 4 再加文件检查
        return true;
      }
      return true;
    });

    // 校验 activeTabId
    const activeTabId = validTabs.some((t: any) => t.id === layout.activeTabId)
      ? layout.activeTabId
      : validTabs[0]?.id;

    // 校验 split
    let split = null;
    if (layout.split) {
      const [id1, id2] = layout.split.tabIds;
      if (validTabs.some((t: any) => t.id === id1) && validTabs.some((t: any) => t.id === id2)) {
        split = layout.split;
      }
      // 否则 split 无效 → 忽略，单面板启动
    }

    // 保底：至少一个终端标签页
    if (validTabs.length === 0 || !validTabs.some((t: any) => t.type === "terminal")) {
      validTabs.push({ id: "terminal-1", type: "terminal", label: "终端" });
    }

    return { tabs: validTabs, activeTabId, split };
  } catch {
    // 任何异常 → 回到默认单终端
    return {
      tabs: [{ id: "terminal-1", type: "terminal", label: "终端", dirty: false, closable: false }],
      activeTabId: "terminal-1",
      split: null,
    };
  }
}
```

### 11.4 AI 友好评估

Phase 3 的标签页/分屏布局是否需要支持"AI 运行时修改"——对标设计方案 §1.5 的标准："所有 GUI 可改的东西，背后有一个纯文本入口"？

**不需要。** 原因：

| | Phase 4（卡片） | Phase 3（标签页/分屏） |
|------|:--:|:--:|
| AI 需要控制吗 | ✅ 需要——AI 扫 MCU 固件生成 workspace.json | ❌ 不需要——标签页排列是用户的个人偏好 |
| 类比 | VS Code 的 tasks.json | VS Code 的编辑器标签页布局 |
| VS Code 支持文件监听吗 | ✅ 是 | ❌ 不是——编辑器布局存内部 SQLite，无 JSON 入口 |

VS Code 的编辑器标签页布局没有 `"openEditors": [...]` 这样的用户可编辑 JSON。没人抱怨——因为"AI 帮我排编辑器标签页"不是实际需求。标签页怎么排、分不分屏，是用户的个人工作习惯，AI 不应该也不需要插手。

**Phase 3 的设计决策：`prefs.json` 中的 `layout` 字段只在启动时读取、退出时保存。** 不提供运行时文件监听同步。AI 不需要控制它，用户不需要 AI 控制它。

AI 真正需要控制的是 workspace.json 的内容（Phase 4）——哪些卡片、什么类型、什么参数。这是纯文本 JSON，文件监听实时生效。

---

## 12. 技术选型

### 12.1 方案：allotment + React state（确认）

| 组件 | 实现方式 | 估行数 |
|------|------|:--:|
| 标签栏 UI | React state + CSS flex | ~120 |
| 标签页内容池（keep-alive） | CSS display 切换 + `isActive` prop | ~50 |
| 分屏容器 | allotment（仅 split !== null 时渲染） | ~30 |
| 拖拽预览 + drop zone | mousedown/move/up + 5-zone 算法 | ~200 |
| 布局持久化 | prefs.json layout 字段 | ~50 |
| `useTabManager` hook | 上述全部逻辑的 hook 封装 | ~150 |
| **合计** | | **~600** |

> 相比原稿 ~390 行有所上调——主要是拖拽预览（200 行而非 150 行）和 useTabManager hook（150 行未计入原稿）。

### 12.2 为什么不是 dockview

- dockview 的"拖出独立窗口"功能 V3 不需要
- dockview 的 API 侵入性强——强制使用其 Panel 组件体系，和 V3 的 View 组件整合成本高
- allotment 只做一件事（分割条 + resize），其余的 React state 管理全部可控

---

## 13. 实施顺序

```
Step 1: useTabManager hook（~150 行）
  - TabState 数据结构 + 所有操作方法
  - 纯逻辑，可独立测试
  - 此时 MainContent 还没改——hook 写好但不用

Step 2: TabBar 组件（~120 行）
  - TabBar.tsx：接收 tabs + activeTabId + split + on* 回调
  - 渲染所有标签页：[图标] 标题 [×]
  - overflow-x 滚轮横向滚动
  - dirty 标记 ●
  - 每个标签页最小/最大宽度 + 文字溢出省略

Step 3: MainContent 改造——单面板 keep-alive（~50 行）
  - 替换条件渲染为 CSS display 切换
  - 所有 tabs 全部挂载
  - TerminalView 接收 isActive prop → requestMeasure
  - 本 Step 结束时：用户看到标签栏 + 一个面板，外观和现在一样

Step 4: 图标栏适配 + 打开多标签页
  - IconBar：onViewChange → onOpenOrFocus
  - 点击 📟/📊/⚙ → openOrFocusTab() → 标签页聚焦（📟/⚙ 无则创建，📊 不创建）
  - 侧栏联动：SidePanel 改为接收 activeTabType
  - 本 Step 结束：能开多个标签页，点击切换

Step 5: allotment 分屏（~30 行）
  - npm install allotment
  - MainContent：split !== null → 渲染 Allotment 容器
  - 本 Step 结束：能左右/上下分屏（手动设 split state 测试）

Step 6: 拖拽标签页形成分屏（~200 行）
  - mousedown → 追踪鼠标 → 半透明预览
  - mousemove → 5-zone 检测 → drop indicator 高亮
  - mouseup → 更新 split state
  - ESC → 取消

Step 7: 关闭标签页边界情况
  - 关闭最后一个 → 终端保底
  - 关闭分屏中的 → unsplit
  - 关闭 dirty workspace → 确认框
  - [×] 按钮 hover 显示

Step 8: 布局持久化（~50 行）
  - prefs.json layout 字段
  - 恢复时的错误处理 + 保底逻辑
  - PreferenceService 的 Tauri fs API 已在 Step 0 完成迁移。Step 8 只关注布局数据的读写正确性
  - ⚠️ 注意：`savePrefs()` 是异步的。布局保存调用（§11.2 的 5 种时机）需处理 Promise 但不阻塞 UI

Step 9: 右键菜单 + 键盘快捷键
  - 标签页右键菜单（§10.4）：关闭/关闭其他/关闭右侧/分屏
  - 全局键盘快捷键（§10.5）：Ctrl+W / Ctrl+Tab / Ctrl+\ / Ctrl+1~9
  - App.tsx 注册 keydown 监听

Step 10: 打磨
  - 拖拽动画（CSS transition）
  - 分屏 resize 时 CM6 requestMeasure
  - 最小面板宽度 200px
  - 终端保底交互（[×] → 清空而非关闭）
  - 标签页创建/关闭动画（opacity + transform）
  - 中键关闭标签页（TabBar onMouseDown → e.button === 1 → closeTab）

### 13.1 Phase 3 期间 workspace 标签页的占位内容

Phase 3 没有卡片架构（Phase 4 的事）。workspace 标签页打开时，WorkspaceView 里没有卡片可显示。**需要一个占位 UI，不能是空白页。**

```
┌──────────────────────────────────────────┐
│                                          │
│           📊 工作台                       │
│                                          │
│      卡片架构将在 Phase 4 实现             │
│                                          │
│    [打开 workspace 文件]  [新建 workspace] │
│                                          │
└──────────────────────────────────────────┘
```

**占位 UI 功能：**
- 显示当前 workspace 名称（如"心率检测"）
- 两个按钮：打开已有 workspace 文件 / 新建空白 workspace
- 如果 workspace 标签页是从顶栏下拉框创建的（已关联文件），显示"等待卡片数据..."
- Phase 4 接入卡片架构后，这个占位 UI 被 CardGrid 替换

**Phase 3 → 4 过渡的隐式耦合：** `Tab.workspaceName` 是标签页系统和卡片架构的唯一接触点。WorkspaceView 接收 `workspaceName` prop → Phase 3 无视它（显示占位 UI）→ Phase 4 用它加载对应的 `CardRegistry` 实例。**标签页系统不碰 CardRegistry——** 它只管"哪个 workspace 标签页是活跃的"，WorkspaceView 自己决定怎么渲染。这是松耦合，Phase 4 不需要改标签页系统的任何代码。

> ⚠ **硬约束（Phase 3→4 边界）：** 标签页系统永远不持有、不访问、不导入 `CardRegistry` 或任何卡片相关类型。`Tab.workspaceName: string | undefined` 是标签页系统对卡片架构的**唯一认知**。违反此规则 = V2 的 Sensors.cs 膨胀到 3570 行的根因重演。

**这个占位 UI 不是浪费——** 它验证了标签页创建、切换、关闭的完整流程，以及 keep-alive 机制在 workspace 标签页上的正确性。Phase 4 只需替换 WorkspaceView 的内部实现，标签页基础设施不动。

### 13.2 每步的测试策略

| Step | 测什么 | 怎么测 |
|:--:|------|------|
| 1 | `useTabManager` hook | 单元测试：openTab/closeTab/focusTab/splitTab 的状态转换。mock PreferenceService |
| 2 | TabBar 渲染 | 手动：打开 3 个标签页 → 检查 title/× 显示 → 缩小窗口 → 确认横向滚动 |
| 3 | keep-alive 正确性 | 手动：终端标签页切换到工作台 → 切回终端 → CM6 内容保留（不闪烁/不重加载） |
| 4 | 图标栏联动 | 手动：点 📟 → 终端标签页聚焦 → 点 📊 → 工作台打开/聚焦 → 点 ⚙ → 设置打开 |
| 5 | allotment 分屏 | **先验证 StrictMode 兼容**（React 18 dev 模式 double-mount 不破坏 allotment 布局状态，两个 Pane 尺寸正确）→ 改代码设 split state → 确认两个面板都显示 → 拖分割条 → 确认 resize |
| 6 | 拖拽分屏 | 手动：拖终端标签页到右半区 → 确认分屏 → ESC 取消 → 确认不分 |
| 7 | 关闭边界 | 手动：关闭分屏中的标签页 → unsplit / 关闭 dirty workspace → 确认框 / 关闭最后一个 → 保底 |
| 8 | 布局持久化 | 手动：打开 2 标签页 + 分屏 → 关窗口 → 重开 → 布局恢复。再删 prefs.json → 重开 → 回默认 |
| 9 | 快捷键 | 手动：Ctrl+Tab 切换 → Ctrl+W 关闭 → Ctrl+\ 分屏 → Ctrl+1 定位 |
| 10 | 打磨 | 目视：拖拽动画流畅 / 分屏 resize 无 CM6 闪烁 / 终端保底 [×] 行为正确 |
```

---

## 14. 风险表

| # | 风险 | 概率 | 影响 | 对策 |
|:--:|------|:--:|:--:|------|
| 1 | **CM6 在 display:none 后布局缓存失效** | 高 | 中 | 标签页变可见后 `requestAnimationFrame` → `cmView.requestMeasure()` |
| 2 | **Monaco 在 display:none 后 layout 失效** | 高 | 中 | 同上：`monacoEditor.layout()` |
| 3 | **allotment 和 React 18 StrictMode 兼容** | 中 | 中 | 测试：分屏 → StrictMode 卸载重挂载 → 布局是否丢失 |
| 4 | **分屏 resize 时 CM6 行宽闪烁** | 中 | 低 | resize 中 CM6 容器设 `overflow: hidden`，mouseup 后调 `requestMeasure()` 再解除 |
| 5 | **allotment 对子元素 cloneElement 破坏 key 去重** | 低 | 高 | 见 §4.2 备选方案——在 MainContent 层做 flat pool + CSS grid 模拟 split |
| 6 | **标签页拖拽在 Windows 上的性能** | 低 | 低 | 预览用 `transform: translate()`——GPU 合成线程，不触发 layout/paint |
| 7 | **多个 CM6 实例 + 终端标签页的内存** | 低 | 低 | 每个 CM6 ~5-10MB。3 个标签页 ~30MB，桌面应用可接受 |
| 8 | **多标签页 RingBuffer 独立消费的 GC 压力** | 低 | 低 | 5 个标签页以内无影响。超过后升级为 Pub/Sub（§5.3） |
| 9 | **workspace 标签页引用的文件被外部删除** | 低 | 低 | 恢复布局时检查文件存在性，缺失则跳过 + 系统消息提示 |
| 10 | **拖拽时 drop zone 检测在 Windows 高 DPI 下偏移** | 低 | 中 | `getBoundingClientRect()` 返回 CSS 像素，不受 DPI 影响。用 `clientX/clientY` 保持一致 |
| 11 | **ECharts 在 display:none 后 resize 得 0×0** | 中 | 中 | Phase 4 处理——切回可见后调 `chart.resize()`。和 CM6 的 requestMeasure 同模式 |
| 12 | **分屏 resize 拖拽中发送区 Monaco 高度塌陷** | 低 | 低 | allotment 提供 `onResize` 回调，mouseup 时调 `monaco.layout()` |

---

## 15. 对现有代码的改动清单

### App.tsx

| 改动 | 说明 |
|------|------|
| `activeView: ViewId` → `tabState: TabState` | 引入 `useTabManager` hook |
| `handleViewChange()` → `openOrFocusTab()` | 图标栏回调改为打开/聚焦标签页 |
| `contentView` 逻辑移除 | 不再需要"设置不改变内容视图"——设置就是一个标签页 |
| `MainContent activeView={...}` → `MainContent tabState={...}` | 传 TabState |
| `IconBar onViewChange={...}` → `IconBar onOpenOrFocus={...}` | 图标栏 prop 改名 |
| `SidePanel activeView={...}` → `SidePanel activeTabType={...}` | 侧栏 prop 改为标签页类型 |

### MainContent.tsx

| 改动 | 说明 |
|------|------|
| 条件渲染 `{activeView === "x" && <X />}` → CSS display 切换 | 所有标签页同时挂载 |
| 单面板 → Allotment 分屏 | split !== null 时渲染 allotment |
| 所有 View 组件接收 `isActive` prop | 用于 requestMeasure/layout |
| 引入 allotment 依赖 | `npm install allotment` |

### TerminalView.tsx

| 改动 | 说明 |
|------|------|
| 接收 `isActive: boolean` prop | 监听变化 → requestMeasure / layout |
| 组件函数签名 | `function TerminalView({ isActive }: { isActive: boolean })` |

### IconBar.tsx

| 改动 | 说明 |
|------|------|
| `onViewChange` → `onOpenOrFocus` | 语义变更 |
| 图标按钮高亮逻辑 | 从 `activeView === id` 改为 `activeTabType === id` |

### SidePanel.tsx

| 改动 | 说明 |
|------|------|
| `activeView: ViewId` → `activeTabType: TabType` | 跟随活跃标签页的类型 |
| `contentView` 移除 | 不再需要——设置标签页的侧栏就是导航，和工作台不冲突 |

### PreferenceService.ts

| 改动 | 说明 |
|------|------|
| ~~`localStorage` → Tauri fs API~~ | ✅ Step 0 已完成——`isTauri()` 检测 + `fsApi` 动态 import + 内存缓存层 + Vite dev fallback |
| Prefs 接口增加 `layout?` 字段 | 布局持久化——Step 8 实现 |

---

## 16. 方案 §3 设计更新

Phase 3 的标签页+分屏模型替换了原设计方案 §3.2 的"图标栏=视图切换器"：

**原设计（作废）：**
> 图标栏就是视图切换器。没有标签页。

**新设计：**
> 图标栏打开/聚焦标签页。主区顶部标签栏 + 可拖拽分屏（2-pane）。默认打开终端标签页（和原设计一致——"打开软件默认进入终端视图"）。

**三栏骨架不变。** 图标栏仍是 42px 左列，侧栏仍是 220px 可拖拽，主区仍是 flex:1。变化的只是主区内部——从"单视图切换"变成"标签页+分屏"。

**设计决策更新：** `design-decisions.md` 第 4 条（"图标栏 = 视图切换器。没有标签页"）需更新为——

> 4. **图标栏打开/聚焦标签页。** 📟 终端 / 📊 工作台 / 🎨 OLED / ⚙ 设置。主区顶部标签栏 + 2-pane 拖拽分屏。

---

*文档更新于 2026-07-18 v3。*
