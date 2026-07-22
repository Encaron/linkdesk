# Phase 4 欢迎页设计

> 2026-07-19。对标 VS Code Welcome——软件入口，不是串口入口。
> 关联：[V3-Phase4-插件系统与UI重构设计.md](V3-Phase4-插件系统与UI重构设计.md) §3.4 / memory `two-layer-container-architecture.md`

---

## 目录

1. [设计原则](#1-设计原则)
2. [数据模型](#2-数据模型)
3. [状态流转](#3-状态流转)
4. [UI 布局](#4-ui-布局)
5. [边界情况](#5-边界情况)
6. [实施清单](#6-实施清单)

---

## 1. 设计原则

| 原则 | 说明 |
|---|---|
| **数据驱动渲染** | 欢迎页不硬编码任何入口。快捷入口 = 插件注册表的投影，最近列表 = `prefs.json` 的 `recentViews` 投影。加新视图插件 → 欢迎页自动多一个入口，零行改动 |
| **归一化** | 一个概念一个名字。欢迎页的"视图入口"和插件加载器的 `viewRegistry` 是同一份数据。"最近"和 `prefs.json` 共享 `recentViews` 字段 |
| **AI 友好** | 所有可改的东西背后有纯文本入口。欢迎页本身的配置 = 零——不需要专门的欢迎页 JSON 文件。所有内容从已有数据源派生 |
| **不做新概念** | 欢迎页不引入新的数据类型、新的存储文件、新的注册机制。它只是已有数据的另一种渲染方式 |
| **壳的兜底，不是插件** | 欢迎页是核心壳的兜底 UI，不是插件。对标浏览器 `chrome://newtab`——关闭所有标签页后自动显示的"新标签页"。不在 `viewRegistry` 中，不在图标栏上，不可卸载。职责：① 无标签页时自动显示 ② 提供快捷入口（数据来自插件注册表） |

---

## 2. 数据模型

### 2.1 欢迎页消费的数据——全部派生，零存储

```typescript
// WelcomeView 的数据来源
// 注意：WelcomeView 自己不存储任何数据。所有数据从已有机制派生。

interface WelcomeData {
  // 从插件加载器派生：所有 type === "view" 的已安装插件
  shortcuts: ViewShortcut[]
  
  // 从 prefs.json 派生：最近打开的视图（不只是 workspace）
  recentViews: RecentViewEntry[]
}

interface ViewShortcut {
  pluginId: string       // "terminal"
  tabType: string        // "terminal" — 传给 createTab() 的 type 参数
  name: string           // "终端" — 显示名称
  icon: string           // "terminal" — codicon 名称
  iconSource: "codicon" | "svg" | "url"
  description: string    // "串口数据收发" — tooltip
}

interface RecentViewEntry {
  pluginId: string       // "terminal"
  label: string          // "终端"
  workspaceName?: string // workspace 类型才有
}

// 派生逻辑（纯函数，不存状态）：
//   shortcuts = pluginLoader.getViewPlugins()
//     .filter(p => p.type === "view")
//     .map(p => ({ pluginId: p.id, tabType: p.tabType, ... }))
//
//   recentViews = prefs.recentViews ?? []
```

### 2.2 prefs.json 扩展

```json
{
  "window": { "left": 100, "top": 50, "width": 960, "height": 640 },
  "theme": "Dark",
  "lastPort": "COM3",
  "preferences": { "...": "..." },
  "quickSends": { "AT": "AT\r\n" },
  "layout": { "groups": [...], "root": {...} },
  
  "recentViews": [
    { "pluginId": "terminal", "label": "终端" },
    { "pluginId": "workspace", "label": "PID 调参", "workspaceName": "pid_tuning" }
  ]
}
```

**字段规范：**
- `recentViews` — `{ pluginId: string, label: string, workspaceName?: string }[]`，最多 10 条
- AI 可 grep：`grep "recentViews" prefs.json` 直接定位
- 空数组 `[]` = 无最近记录，欢迎页"最近"区域不渲染
- **Phase 4 就有数据：** 用户打开终端 → 记录到 `recentViews`；下次启动 → 欢迎页"最近"区域出现终端入口
- Phase 4 阶段此字段始终为空——workspace 功能在 Phase 5。字段现在建好，Phase 5 接入后自然有数据

### 2.3 为什么不新建 welcome.json

| 方案 | 问题 |
|---|---|
| 新建 `welcome.json` | 多一个 AI 需要知道的文件。快捷入口和插件注册表不同步——两处维护同一份列表 |
| 全部派生 | 一处修改（装插件 / 改 prefs.json）→ 欢迎页跟随变化。零同步 |

---

## 3. 状态流转

### 3.1 欢迎页的创建与销毁

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  V3 启动                                                     │
│    │                                                        │
│    ├─ 恢复布局（prefs.json layout）                           │
│    │   ├─ 有标签页 → 正常恢复，不创建欢迎页                    │
│    │   └─ 无标签页 → createTab({ type: "welcome" })           │
│    │                                                        │
│    └─ 无布局文件（首次启动）                                   │
│        → createTab({ type: "welcome" })                      │
│                                                             │
│  用户关闭最后一个非欢迎页标签页                                 │
│    → reduceCloseTab 检测: allTabs.length === 1                 │
│      && tab.type === "welcome"                                │
│    → 拒绝关闭（标签页保底）                                    │
│                                                             │
│  用户创建任意标签页（terminal / workspace / settings）          │
│    → 新标签页聚焦                                             │
│    → 欢迎页保留（用户可手动关闭）                               │
│      - 如果用户关闭了欢迎页 → 又有其他标签页，正常                │
│      - 如果之后用户关闭了所有其他标签页 → 欢迎页自动重建          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 快捷入口点击

```
用户在欢迎页点"📟 打开串口终端"
  → createTab("terminal")          // type = "terminal"
  → 加载器查 viewRegistry["terminal"]
    → 有注册 → 渲染对应 React 组件
    → 无注册 → toast "终端插件未安装，请在插件市场搜索'终端'"

用户在欢迎页点"📊 新建工作台"
  → createTab("workspace")         // type = "workspace"
  → Phase 4: WorkspaceView 仍是占位 UI（"卡片架构将在 Phase 5 实现"）
  → 聚焦新标签页

用户在欢迎页点"⚙ 设置"
  → createTab("settings")          // type = "settings"，单例去重
  → 聚焦设置标签页

用户在欢迎页点"🧩 插件市场"
  → createTab("plugin-market")     // type = "plugin-market"
  → 渲染 PluginMarketView
```

### 3.3 最近视图交互

```
用户在欢迎页点"终端"
  → createTab("terminal")
  → prefs.recentViews 中该项移到头部

用户在欢迎页点"PID 调参"（workspace 条目）
  → 检查 workspaces/pid_tuning.workspace.json 是否存在
    ├─ 存在 → createTab("workspace", { workspaceName: "pid_tuning" })
    │         → prefs.recentViews 中该项移到头部
    └─ 不存在 → toast "workspace 文件已不存在"
                → 从 prefs.recentViews 中移除该项

用户通过任何方式打开视图（图标栏 / [+] 菜单 / 命令面板）
  → createTab(pluginId, ...)
  → prefs.recentViews 头部插入 { pluginId, label, workspaceName? }
  → 去重：同一 pluginId + workspaceName 已存在 → 移到头部

recentViews 超过 10 条
  → 保留前 10 条，砍掉尾部
```

---

## 4. UI 布局

### 4.1 整体布局

```
┌────┬──────────┬──────────────────────────────────┐
│    │          │ [🏠 Welcome]                      │  ← 标签栏（仅覆盖主区）
│ 📟  │  侧栏    ├──────────────────────────────────┤
│ 📊  │  220px  │                                  │
│ ⚙   │  可折叠  │  Serial Monitor V3               │
│ 🧩  │         │  通用调试容器                     │
│    │         │                                  │
│    │         │  ┌─ 开始 ────────────────────┐   │
│    │         │  │ 📟 终端  📊 工作台          │   │
│    │         │  │ ⚙ 设置   🧩 插件市场        │   │
│    │         │  └───────────────────────────┘   │
│    │         │                                  │
│    │         │  ┌─ 最近 ────────────────────┐   │
│    │         │  │ 📟 终端                  │   │
│    │         │  │ 📊 PID 调参           📂  │   │
│    │         │  └───────────────────────────┘   │
│    │         │                                  │
│    │         │  ┌─ 帮助 ────────────────────┐   │
│    │         │  │ 📖 使用文档  ⌨ 键盘快捷键   │   │
│    │         │  └───────────────────────────┘   │
├────┴──────────┴──────────────────────────────────┤
│                                       中:EN │ ☀  │  ← 状态栏右下角
└──────────────────────────────────────────────────┘
```

### 4.2 快捷入口卡片——从插件注册表动态渲染

```typescript
// WelcomeView.tsx 渲染逻辑（伪代码）

function WelcomeView({ isActive }: { isActive: boolean }) {
  const shortcuts = usePluginLoader().getViewPlugins()
  const recentViews = usePrefs().recentViews ?? []
  
  return (
    <div className="welcome-page">
      <header className="welcome-hero">
        <h1>{APP_NAME}</h1>
        <p>{t("通用调试容器")}</p>
      </header>
      
      <section className="welcome-section">
        <h2>{t("开始")}</h2>
        <div className="welcome-card-grid">
          {shortcuts.map(p => (
            <WelcomeCard
              key={p.pluginId}
              icon={p.icon}
              iconSource={p.iconSource}
              label={p.name}
              description={p.description}
              onClick={() => createTab(p.tabType)}
            />
          ))}
        </div>
      </section>
      
      {recentViews.length > 0 && (
        <section className="welcome-section">
          <h2>{t("最近")}</h2>
          <RecentList items={recentViews} onOpen={handleOpenRecent} />
        </section>
      )}
      
      <section className="welcome-section">
        <h2>{t("帮助")}</h2>
        <HelpLinks />
      </section>
    </div>
  )
}
```

**关键约束：`shortcuts` 是 `getViewPlugins()` 的返回值——不是硬编码数组。** 安装 `view-gps-map` 插件 → 欢迎页自动出现 🗺️ 地图入口。卸载 → 自动消失。零行改动。

### 4.3 WelcomeCard 组件

```typescript
// 复用 .setting-group 的视觉模式——同一套 CSS 变量，不发明新样式

interface WelcomeCardProps {
  icon: string
  iconSource: "codicon" | "svg" | "url"
  label: string          // "终端"
  description: string    // "串口数据收发"
  onClick: () => void
}
```

- 背景 `var(--bg-card)`、圆角 6px、padding 16px
- 图标在上（32px）、标题在下（13px/600）、描述在标题下（11px/`--text-muted`）
- hover: `background: var(--tab-hover-bg)`、cursor pointer
- 所有颜色走 CSS 变量，所有文字走 `t()`

### 4.4 最近列表组件

```typescript
// 每行：workspace 名称 + hover 出现的 📂 打开图标
// 数据源：prefs.recentViews（和 workspace 切换器共享）

interface RecentListProps {
  items: string[]              // workspace 名称，不含后缀
  onOpen: (name: string) => void
}
```

- 每行 28px 高，和标签栏行高一致（归一化）
- hover: 背景 `var(--tab-hover-bg)`、右侧浮现 📂 图标（150ms fade-in）
- 点击整行 = 打开

---

## 5. 边界情况

| # | 场景 | 行为 |
|---|---|---|
| W1 | 零个视图插件（plugins/ 目录为空或全是非 view 类型） | "开始"区域显示空状态："暂无可用视图，请在插件市场搜索安装" + 插件市场入口链接 |
| W2 | 只有出厂预装的视图插件（终端/工作台/设置/插件市场，4 个） | 显示 4 张 WelcomeCard。Phase 4 初始状态 |
| W3 | 安装了 15 个视图插件 | WelcomeCard grid 自动换行，每行 3-4 张，超出垂直滚动 |
| W4 | recentViews 中某个文件已被外部删除 | 点击 → toast "workspace 文件已不存在" → 从 recentViews 移除 → 保存 prefs.json |
| W5 | recentViews 为空或字段不存在 | "最近"区域不渲染，不显示空状态文字 |
| W6 | 用户关闭欢迎页后关闭了所有其他标签页 | 自动重建欢迎页（和首次启动同逻辑） |
| W7 | 用户在欢迎页输入 URL/命令（未来） | 顶部可加一个迷你输入条——对标 VS Code 的 `> ` 命令输入。Phase 4 先用命令面板 Ctrl+Shift+P 覆盖 |
| W8 | 最小窗口尺寸（720×560）下的欢迎页 | WelcomeCard 不重叠，"最近"和"帮助"区域均可见。必要时缩小 hero 区域的垂直留白 |
| W9 | 亮色/暗色主题 | 全部颜色走 `var(--xxx)`，零硬编码 hex。欢迎页出生就支持双主题 |
| W10 | 中/英文切换 | 全部文字走 `t()`。`ViewShortcut.name` 来自插件注册表（已随 i18next 切换）。欢迎页不持有文字 |
| W11 | 安装了 10+ 视图插件导致"开始"区域卡片过多 | grid 自动换行，垂直滚动。`WelcomeCard` 的 grid 容器设 `max-height` + `overflow-y: auto` |

## 6. 实施清单

### 6.1 数据层

- [ ] `prefs.json` schema 加 `recentViews: string[]`（可选，默认 `[]`）
- [ ] `PreferenceService` 类型定义加 `recentViews` 字段
- [ ] `useTabManager`：
  - `createInitialTabState()` → 改为一律创建 `type: "welcome"` 标签页（不再创建 terminal）
  - `reduceCloseTab()` → 全局唯一标签页是 welcome 时拒关（替代旧 terminal 检查）
  - `reduceRestoreLayout()` → 无标签页时补 welcome（替代旧 terminal 补丁）
  - 任何 `createTab(...)` 成功后 → 递增 `prefs.recentViews`（仅 workspace 类型）

### 6.2 UI 层

- [ ] `WelcomeView.tsx` — 主组件（~100 行）
- [ ] `WelcomeCard.tsx` — 快捷入口卡片（~30 行）
- [ ] `RecentList.tsx` — 最近 workspace 列表（~40 行）
- [ ] `WelcomeView.css` — 样式（~60 行，全部走 `var(--xxx)`）
- [ ] `MainContent.tsx` — `renderTabContent()` 改为 `viewRegistry.get(tab.pluginId)` 统一查注册表。WelcomeView 和其他视图插件一样走加载器——无特殊 case
- [ ] `TabBar.tsx` — 终端保底 [×] 清空逻辑迁移到 welcome 保底

### 6.3 i18n

- [ ] `zh.json` / `en.json` 加 key：
  - `"开始"` / `"Start"`
  - `"最近"` / `"Recent"`
  - `"帮助"` / `"Help"`
  - `"嵌入式通用调试容器"` / `"Embedded Universal Debug Console"`
  - `"暂无可用视图"` / `"No views available"`
  - `"workspace 文件已不存在"` / `"Workspace file no longer exists"`
  - 等等

### 6.4 测试

- [ ] `useTabManager.test.ts`：welcome 保底替代 terminal 保底的测试用例更新
  - 初始状态 = 1 个 welcome 标签页（不是 terminal）
  - 全局唯一 welcome 不能关
  - 创建 terminal 后，welcome 可被关闭
  - 关闭所有非 welcome 标签页 → reduceCloseTab 拒关最后一个 welcome

---

*欢迎页的复杂度和 Phase 3 的标签页系统不在一个量级——~200 行。但"归一化"和"AI 友好"的原则一个不少。*
