# E3f — 壳 UI 收尾

> 2026-07-24。从旧 P7d 拆分——壳的最后体验打磨：标题栏、菜单、输出面板、欢迎页、Workspace、会话持久化。
> **性质：** 纯 TS/React + Electron 窗口 API。不涉及多进程通信。
> **依赖：** E3a（多 WebView 就绪——输出面板和欢迎页跨进程可用）

---

## 一、标题栏暗色化

Electron `BrowserWindow` 的 `titleBarStyle` / `backgroundColor` → 暗色标题栏匹配 LinkDesk 暗色主题。

纯 Electron 配置，~20 行。

---

## 二、自定义标题栏 + 菜单栏——HTML/CSS 渲染，插件可扩展顶级菜单（🔥 2026-07-27 第三次重写）

> **前两版为什么放弃：**
> - 第一版（Electron 原生 Menu）：Windows 上原生菜单白色/系统灰，字体/颜色由 OS 决定，跟 LinkDesk 暗色主题完全割裂。菜单内容硬编码在 `menu-builder.ts`。
> - 第二版（汉堡在图标栏）：桌面软件不应该把菜单藏在二级面板里。对标 VS Code **桌面版**——File/Edit/View 横排在窗口顶部，一目了然。
>
> **第三版：对标 VS Code 桌面版标题栏。** 自己画 HTML/CSS 标题栏 + 菜单栏，数据来自 `MenuRegistry`。
> 插件可扩展顶级菜单（终端、运行、帮助...），加 `group` + `children` 声明即可——**零硬编码，零 TitleBar 代码改动。**
>
> VS Code 源码依据：`src/vs/workbench/browser/parts/titlebar/titlebarPart.ts`

### 2.1 为什么不用 Electron 原生菜单

| | Electron 原生 Menu | 自定义 HTML/CSS TitleBar |
|------|:--:|:--:|
| 颜色 | OS 决定——Windows 白色/灰色，深色主题下割裂 | CSS 变量——跟随 LinkDesk 主题 |
| 字体 | OS 决定——无法控制大小/字重 | 由 LinkDesk 主题控制 |
| 扩展性 | 必须硬编码——`Menu.buildFromTemplate` 需要完整模板 | 声明式——插件注册 `MenuId.MenuBar` + `group` + `children` |
| 未来加"终端"菜单 | 改 `menu-builder.ts` 硬编码 | 插件注册 `{ group: "terminal", label: "终端", children: [...] }` → 自动出现 |

### 2.2 布局——对标 VS Code 桌面版，不是 web 版

```
┌──────────────────────────────────────────────────────────┐
│ ☰  文件 ▼  编辑 ▼  查看 ▼  终端 ▼  帮助 ▼     ─  □  ×  │  ← TitleBar（新组件）
├──────┬───────────────────────────────────────────────────┤
│ ☐    │ 侧栏              │  编辑器                       │  ← app-body（现有）
│ ☐    │                   │                               │
│ ⚙    │                   │                               │
├──────┴───────────────────────────────────────────────────┤
│ 状态栏                                                   │
└──────────────────────────────────────────────────────────┘
```

- **TitleBar**：30px 高，暗色背景 `var(--bg-titlebar)`，整个条 `-webkit-app-region: drag`（拖拽移动窗口）
- **☰**：最左侧——点击弹出菜单面板（和之前汉堡菜单内容完全一样，hover 展开子菜单）。对标 VS Code 左上角应用图标
- **文件 ▼ / 编辑 ▼ / 查看 ▼ / ...**：横排菜单按钮——点击弹出下拉面板，已在打开状态的按钮 hover 时自动切换
- **声明式扩展**：未来"终端"插件注册 `MenuId.MenuBar` + `group: "terminal"` → TitleBar 不做任何代码改动，自动多一个"终端 ▼"按钮
- **窗口控制**：─ □ × 在右上角，由 Electron 原生渲染（不自己画——避免跨平台一致性问题，对标 VS Code 的做法）

### 2.3 声明式菜单——零硬编码

**错的（硬编码）：**
```typescript
const GROUP_LABELS: Record<string, string> = {
  file: "File", edit: "Edit", view: "View", help: "Help",
  // 每次加新菜单都要改这里 ← 硬编码
};
```

**对的（声明式——从注册数据动态读取）：**
```typescript
// coreCommands.ts 注册时已经带了 label：
registerMenuItems(MenuId.MenuBar, APP_PLUGIN_ID, [
  { command: "", group: "file", label: "文件", children: [
    { command: "core.openSettings" },
  ]},
  { command: "", group: "view", label: "查看", children: [
    { command: "workbench.action.showCommands" },
    { command: "workbench.action.selectTheme" },
  ]},
]);

// 未来插件注册（不需要改 TitleBar 任何代码）：
registerMenuItems(MenuId.MenuBar, "terminal-plugin", [
  { command: "", group: "terminal", label: "终端", children: [
    { command: "terminal.newTerminal" },
    { command: "terminal.splitTerminal" },
  ]},
]);

// TitleBar 渲染逻辑（零硬编码）：
//   1. getMenuItems(MenuId.MenuBar) → 按 group 分组
//   2. 每个 group 的第一项的 label = 菜单按钮文字
//   3. 每个 group 的所有项 = 下拉面板内容
//   4. 任何插件注册新 group → 自动出现新按钮
```

**`group` 字段控制排序——越小组越靠左：**

```typescript
const GROUP_ORDER: Record<string, number> = {
  file: 0, edit: 1, view: 2,
  // 插件注册 group: "terminal" 时声明 order: 3 → 排在 View 后面
  // 不声明 order → 默认 99 → 排在最后
};
```

### 2.4 交互——对标 VS Code 菜单行为

1. **点击菜单按钮** → 下方弹出下拉面板（跟之前汉堡下拉同款样式）
2. **在已打开的菜单上移动鼠标到另一个按钮** → 自动切换展开（对标 VS Code——不用重新点击）
3. **hover 有 children 的项** → 右侧弹出子菜单（同 #52d 的逻辑）
4. **点击叶子项** → `executeCommand` + 关闭面板
5. **点击菜单外部** → 关闭面板
6. **☰ 始终在左上角** → 点击弹出完整的菜单面板（跟之前汉堡菜单一样），方便只有一个入口时快速访问

### 2.5 数据流——MenuRegistry 是唯一真源

```
MenuRegistry.getMenuItems(MenuId.MenuBar)
        │
        ├──→ TitleBar 渲染（HTML/CSS 菜单按钮 + 下拉面板）
        │      │
        │      └──→ 插件注册新 group → 自动出现新按钮
        │
        └──→ （不再需要原生 menubar——删除 menu-builder.ts）
```

**一份数据，一种渲染。** 桌面版 = 浏览器版——同一个 TitleBar 组件。不区分 hamburger/menubar 模式。

### 2.6 配置项驱动——用户自选菜单模式

**对标 VS Code 的 `window.menuBarVisibility` 设置项。**

注册配置项 `app.menuStyle`，三个选项：

| 值 | 效果 | TitleBar | 图标栏汉堡 |
|------|------|:--:|:--:|
| `"titlebar"` | 只显示顶部菜单栏（默认） | ✅ | ❌ |
| `"hamburger"` | 只显示图标栏汉堡 | ❌ | ✅ |
| `"both"` | 两者都显示 | ✅ | ✅ |

**用户记忆：** `app.menuStyle` 走 `ConfigurationService`——改一次，持久化，重启保留。

**渲染逻辑（声明式——不写 `if (menuStyle === "...")` 在组件里）：**

```tsx
// App.tsx
const menuStyle = getConfigurationValue<string>("app.menuStyle") ?? "titlebar";
const showTitleBar = menuStyle !== "hamburger";   // titlebar 或 both → 显示
const showHamburger = menuStyle !== "titlebar";   // hamburger 或 both → 显示

// TitleBar + HamburgerMenu 各自从同一个 MenuRegistry 读数据
```

**设置页 UI：**
```
菜单栏样式    [标题栏 ▼]
               ├ 标题栏     ← 默认
               ├ 汉堡菜单
               └ 两个都显示
```

### 2.7 子任务——逐条可验证

#### #52f — 创建 TitleBar 组件（~60 行，新文件）

**文件：** `src/components/TitleBar.tsx`（新）+ `src/components/TitleBar.css`（新）

**做什么：**
1. 从 `MenuRegistry.getMenuItems(MenuId.MenuBar)` 读取所有菜单项
2. 按 `group` 字段分组——每个 group 一个菜单按钮
3. 每个按钮显示该 group 第一个 item 的 `label`（如"文件"、"查看"）
4. 点击按钮 → 该按钮下方弹出下拉面板（同之前汉堡下拉样式）
5. 已打开一个菜单时鼠标移到另一个按钮 → 自动切换展开
6. 下拉面板内：hover 有 `children` 的项 → 右侧弹出子菜单
7. 点击叶子项 → `executeCommand(item.command)` → 关闭面板
8. ☰ 按钮在最左侧——点击始终弹出完整的菜单面板
9. 整个 TitleBar 是 `-webkit-app-region: drag`——可拖拽移动窗口
10. 菜单按钮是 `-webkit-app-region: no-drag`——可点击

**CSS 关键参数（对标 VS Code TitleBar + 匹配 LinkDesk 设计系统）：**

```
┌──────────────────────────────────────────────────────────────┐
│ ☰ 标  文件 ▼  编辑 ▼  查看 ▼  终端 ▼  帮助 ▼    ─   □   ×  │ 30px
│ 志                                                        │
├──────────────────────────────────────────────────────────────┤
│ 菜单下拉面板（点击弹出）：                                    │
│ ┌──────────┬──────────┐                                    │
│ │ 设置     │ Ctrl+,   │  ← 同现 HamburgerMenu 下拉样式     │
│ │ 退出     │ Alt+F4   │                                    │
│ └──────────┴──────────┘                                    │
└──────────────────────────────────────────────────────────────┘
```

| 元素 | 规格 | 对标 |
|------|------|------|
| 整体高度 | 30px | VS Code TitleBar 30px |
| 背景色 | `var(--bg-titlebar)` → 新增 CSS 变量，默认 `#252526`（比 `--bg-window` `#1e1e1e` 稍亮——区分标题栏和编辑区） | VS Code `TITLE_BAR_ACTIVE_BACKGROUND`: `#252526`（暗色）|
| ☰ 按钮 | 左侧 36×30px，图标 `codicon-menu` 14px，颜色 `var(--text-secondary)` | VS Code 左上角 logo |
| ☰ 按钮 hover | 背景 `rgba(255,255,255,0.05)` | 同现 HamburgerMenu hover |
| 应用 Logo/名 | ☰ 右侧：LinkDesk 文字 11px `var(--text-muted)`，不可点击 | VS Code 标题栏中间的窗口标题 |
| 菜单按钮 | padding 4px 10px，font-size 12px，颜色 `var(--text-secondary)`，border-radius 3px | VS Code 菜单栏按钮 |
| 菜单按钮 hover | 背景 `rgba(255,255,255,0.06)`，颜色 `var(--text-primary)` | 120ms transition |
| 菜单按钮 open | 背景 `rgba(255,255,255,0.08)`（比 hover 稍亮——"按下去"的感觉） | 120ms transition |
| 菜单按钮间距 | 2px gap | 紧凑但不拥挤 |
| 下拉面板 | `bg-card` 背景，1px `separator` 边框，border-radius 4px，阴影 `0 4px 16px rgba(0,0,0,0.3)` | 同现 HamburgerMenu |
| 下拉面板定位 | 菜单按钮正下方，left 对齐 | VS Code |
| 子菜单面板 | 父面板右侧弹出，left 对齐父项，跟 #52d 逻辑一致 | VS Code |
| 菜单项 | 同现 HamburgerMenu——12px 字体，24px 行高，hover `accent` 高亮 | |
| 拖拽区 | 整个 TitleBar `-webkit-app-region: drag`，按钮/☰ `no-drag` | VS Code |
| z-index | TitleBar: auto（正常流），下拉面板: 2548（Dialog 下方，Notification 上方） | |

**新增 CSS 变量——`index.css` 或 `ThemeEngine` 注册：**
```css
:root {
  --bg-titlebar: #252526;  /* 比 --bg-window 稍亮，区分标题栏 */
}
```

**暗色/亮色主题跟随——和 LinkDesk 其他 UI 一样走 CSS 变量，零硬编码颜色。**

**验证：** 顶部出现 30px 暗色标题栏 → ☰ + 文件 ▼ + 查看 ▼ 按钮 → 点击弹出菜单

#### #52g — App.tsx 布局 + `app.menuStyle` 配置项注册（~20 行）

**文件：** `src/App.tsx`

**做什么：**
1. 在 `registerConfiguration` 块中注册 `app.menuStyle` 配置项（enum: `["titlebar", "hamburger", "both"]`，默认 `"titlebar"`）
2. 读取配置值 → `showTitleBar` / `showHamburger` 布尔值
3. 条件渲染 `<TitleBar />` 和 `<HamburgerMenu />`

```tsx
const menuStyle = getConfigurationValue<string>("app.menuStyle") ?? "titlebar";

{/* TitleBar——titlebar 或 both 模式显示 */}
{menuStyle !== "hamburger" && <TitleBar />}

<div className="app-body">
  <IconBar
    showHamburger={menuStyle !== "titlebar"}  {/* hamburger 或 both */}
    ...
  />
  ...
</div>
```

**验证：** 默认看到顶部 TitleBar → 设置里切到"汉堡菜单" → TitleBar 消失 + 图标栏出现汉堡

#### #52h — IconBar 接收 `showHamburger` prop（~5 行）

**文件：** `src/components/IconBar.tsx`

**做什么：**
1. `IconBarProps` 加 `showHamburger?: boolean`
2. 条件渲染 `<HamburgerMenu />`

```tsx
interface IconBarProps {
  showHamburger?: boolean;  // E3f #52h
  ...
}

// icon-bar-top 里：
{showHamburger && <HamburgerMenu />}
```

**验证：** `showHamburger=true` → 图标栏顶部有 ☰。`false` → 没有。

#### #52i — 删除原生 menubar 代码（HamburgerMenu 保留，浏览器版需要）（~-60 行）

**保留：**
- `src/components/HamburgerMenu.tsx` + `.css` —— 浏览器版的菜单入口
- `src/core/coreCommands.ts` 的 `MenuId.MenuBar` 注册 —— 两份渲染的数据源

**删除：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `electron/menu-builder.ts` | **删除整个文件** | 不再需要原生菜单 |
| `electron/main.ts` | 删除：`import { buildAppMenu }`、`import { Menu }`、`menu-bar-data` handler（3 行）、`set-menu-style` handler（8 行）、`_menuData` / `_menuStyle` 变量、`Menu.setApplicationMenu(null)`（这一行保留——清默认菜单） | 主进程不管菜单 |
| `electron/preload-shell.ts` | 删除 `events` 中的 `notifyMenuBarData` + `setMenuStyle` + `menu:command` IPC listener（4 行） | 不再需要 IPC |
| `src/core/coreCommands.ts` | 删除 `syncMenuBarToMain()` 函数（15 行）+ 调用（1 行） | 不再发 IPC |
| `src/App.tsx` | 删除 `import { executeCommand }`（如果仅用于 native-menu）、删除 `native-menu-command` useEffect（8 行） | 原生菜单已删除 |

**验证：** `grep -r "menu-builder\|menu-bar-data\|set-menu-style\|native-menu-command\|syncMenuBarToMain\|notifyMenuBarData" src/ electron/` **零结果**（HamburgerMenu 不在此列——保留）

#### #52j — coreCommands.ts 菜单注册声明式（~15 行）

**文件：** `src/core/coreCommands.ts`

**做什么：**
1. 在 `ensureCoreCommands()` 里，保留 `MenuId.MenuBar` 注册——数据不变
2. 删除 `syncMenuBarToMain()`（已在 #52i 中做）
3. `GROUP_ORDER` 改为从注册数据的 `order` 字段读取——不硬编码映射表
4. 确保每个 group 的父菜单项有 `label` 字段（TitleBar 用它当按钮文字）

**注册数据示例（保持不变）：**
```typescript
registerMenuItems(MenuId.MenuBar, APP_PLUGIN_ID, [
  {
    command: "", label: i18n.t("文件"), group: "file", order: 0,
    children: [{ command: "core.openSettings" }],
  },
  {
    command: "", label: i18n.t("查看"), group: "view", order: 2,
    children: [
      { command: "workbench.action.showCommands" },
      { command: "workbench.action.selectTheme" },
      { command: "workbench.action.selectLanguage" },
      { command: "workbench.action.openKeybindingsSettings" },
    ],
  },
]);
```

**验证：** 未来任何插件注册 `{ command: "", label: "终端", group: "terminal", order: 3, children: [...] }` → TitleBar 自动出现"终端"按钮——不改 TitleBar 任何代码

### 2.9 旧代码清理对照表——新 AI 进场必读

| 文件 | 删什么 | 为什么删 |
|------|------|------|
| `menu-builder.ts` | **整个文件** | 不再用 Electron 原生 Menu API |
| `main.ts` | `import { Menu }` / `import { buildAppMenu }` / `menu-bar-data` handler / `set-menu-style` handler / `_menuData` / `_menuStyle` | 主进程不管菜单——纯粹窗口管理 |
| `preload-shell.ts` | `notifyMenuBarData` / `setMenuStyle` / `menu:command` listener | 菜单数据不再需要 IPC |
| `coreCommands.ts` | `syncMenuBarToMain()` 函数 + 调用 | 不再往主进程发数据 |
| `App.tsx` | `import { executeCommand }`（如果仅用于 native-menu） / `native-menu-command` useEffect | 不再有原生菜单命令 |

**保留：**
| 文件 | 保留原因 |
|------|------|
| `HamburgerMenu.tsx` + `.css` | `app.menuStyle: "hamburger"` 或 `"both"` 时在图标栏显示 |
| `MenuRegistry` + `MenuId.MenuBar` | 唯一真源——TitleBar 和 HamburgerMenu 共享 |
| `coreCommands.ts` 菜单注册 | 菜单内容——声明式，不改 TitleBar/Hamburger 代码 |

### 2.8 后续可扩展（不在此任务范围）

- 用户通过 `plugin.json` `contributes.menus` 注册到 `MenuId.MenuBar` → TitleBar 自动显示
- `group` 的 `order` 支持插件声明排序优先级
- TitleBar 右侧可加自定义区域（通知铃铛、账号头像等）
- 窗口控制按钮可改为自定义（对标 VS Code `window-controls-overlay`）

```
VS Code 源码结构：
  ActivitybarPart.createContentArea(parent)
    → this.content = $('.content')                         ← 图标栏内容容器
    → PaneCompositeBar → CompositeBar.create(parent)        ← 视图图标列表（activity bar items）
    → GlobalCompositeBar.create(parent)                     ← 汉堡菜单（在视图图标之前）

  GlobalCompositeBar：
    → this.element = $('div')                               ← 只能装两个 action 的容器
    → this.globalActivityActionBar = new ActionBar(...)      ← 垂直 ActionBar
      → actionViewItemProvider:
          if action.id === GLOBAL_ACTIVITY_ID:
            return GlobalActivityActionViewItem              ← ☰ 按钮
          if action.id === ACCOUNTS_ACTIVITY_ID:
            return AccountsActivityActionViewItem            ← 账号按钮
    → push(globalActivityAction)                            ← 推入汉堡 action
```

**关键点：**

1. **位置：图标栏第一个** — `GlobalCompositeBar` 创建后 `append` 到 activity bar 内容区，在视图图标列表**之前**
2. **只有两个 action** — 汉堡（必显）+ 账号（可选），不是通用视图列表。两个 action 都在同一个垂直 `ActionBar` 里
3. **不可拖拽** — `draggable: false`，不在 `CompositeDragAndDrop` 里
4. **独立颜色** — `ICompositeBarColors` 参数传入，不跟视图图标共享颜色
5. **点击=展开上下文菜单** — `AbstractGlobalActivityActionViewItem.run()` → `contextMenuService.showContextMenu({ getActions: () => menu.getActions() })`
6. **菜单数据来自 MenuId.GlobalActivity** — 不是 `MenuId.MenuBar`。`MenuId.GlobalActivity` 里的菜单项通过 `getActionBarActions()` 转为 `IAction[]`，支持 `SubmenuAction` 嵌套

**LinkDesk 当前实现的问题：**

| | VS Code | LinkDesk 当前 |
|------|------|------|
| 位置 | 图标栏第一个 item | App.tsx 里独立 `<HamburgerMenu />` |
| 不可移动 | `draggable: false` | 在 IconBar 外面，无所谓 |
| 独立颜色 | `ICompositeBarColors` 单独传入 | 自己写了 `.hamburger-btn` 样式 |
| 菜单层级 | `SubmenuAction` — File → 子菜单 | 平级命令列表 |
| 原生 menubar | 读 MenuRegistry | `menu-builder.ts` 硬编码菜单内容 |

### 2.2 改造方案——子任务拆分

**不新增 `MenuId.GlobalActivity`——复用已有的 `MenuId.MenuBar`。** 语义相同，够用。以后如果 LinkDesk 需要区分"汉堡底部菜单"和"窗口顶部菜单栏"，再拆。

#### #52a MenuRegistry 加 submenu 类型（~25 行）

`MenuItem` 目前是 `{ command, group, when, order }`——只支持平级命令。
加 `children?: MenuItem[]` 字段——有 children 时无视 command，渲染为嵌套子菜单。

```typescript
// src/core/MenuRegistry.ts

export interface MenuItem {
  command: string;
  group?: string;
  when?: string;
  order?: number;
  /** E3f #52a：嵌套子菜单——有 children 时无视 command，渲染为可展开子菜单 */
  children?: MenuItem[];
}

// 注册时支持 children
export function registerMenuItems(
  menuId: MenuId,
  pluginId: string,
  items: ManifestMenuItem[]
): void {
  // ManifestMenuItem 也加 children 支持
}

export type ManifestMenuItem = 
  | string 
  | { command: string; when?: string; group?: string; children?: ManifestMenuItem[] };
```

验证：注册带 children 的菜单项 → `getMenuItems()` 返回的 item 包含 children

#### #52b 汉堡移入 IconBar 第一个位置（~40 行）

对标 VS Code `GlobalCompositeBar`——在 `IconBar.tsx` 里，视图图标列表**之前**渲染一个独立的 `HomeIndicator`（汉堡 + 可选账号）。

```tsx
// src/components/IconBar.tsx
<div className="icon-bar">
  {/* E3f #52b：汉堡——图标栏第一个位置，固定不可移动 */}
  <HamburgerMenu />
  
  {/* 分隔线——汉堡和视图图标之间 */}
  <div className="icon-bar-separator" />
  
  {/* 视图图标列表（可拖拽排序） */}
  {orderedIds.map(id => <IconBarItem ... />)}
  
  {/* 底部齿轮 */}
  <GearMenu />
</div>
```

- 汉堡在图标栏**里面**，不是 App.tsx 里的独立元素
- 不参与 `orderedIds` 排序——永远在第一
- 颜色走 `ICompositeBarColors`（同一个参数控制 active/inactive）
- 大小、间距跟其他图标一致——但因为颜色不同，视觉上"不一样"

验证：汉堡在图标栏最顶部 → 不能拖拽移动 → 点击弹出菜单

#### #52c 注册菜单栏内容——File/Edit/View/Help（~35 行）

在 `coreCommands.ts` 注册到 `MenuId.MenuBar`，带嵌套 children：

```typescript
// src/core/coreCommands.ts —— ensureCoreCommands() 追加

// E3f #52c：菜单栏内容——File 组（含子菜单）
registerMenuItems(MenuId.MenuBar, APP_PLUGIN_ID, [
  {
    command: '',  // 父项——无 command
    group: 'file',
    children: [
      { command: 'core.openSettings', group: 'file' },
      // ... 更多 File 子项
    ],
  },
  {
    command: 'workbench.action.showCommands',  // 平级——无子菜单
    group: 'view',
  },
  ...
]);
```

菜单内容设计（对标 VS Code，前期精简）：

```
File                    group: file
  ├─ 设置       Ctrl+,    → core.openSettings
  └─ 退出       Alt+F4    → core.exit

View                    group: view
  ├─ 命令面板  Ctrl+Shift+P   → workbench.action.showCommands
  ├─ 选择颜色主题             → workbench.action.selectTheme
  ├─ 选择语言                → workbench.action.selectLanguage
  └─ 打开键盘快捷方式          → workbench.action.openKeybindingsSettings
```

验证：汉堡 → 弹出菜单 → File 展开 → 子菜单项

#### #52d 汉堡渲染嵌套菜单（~50 行）

`HamburgerMenu.tsx` 改为读 `MenuId.MenuBar`，支持嵌套 children：

```tsx
function renderMenuItem(item: MenuItem) {
  if (item.children && item.children.length > 0) {
    // 嵌套子菜单——hover 或点击展开
    return <SubmenuItem item={item}>
      {item.children.map(child => renderMenuItem(child))}
    </SubmenuItem>;
  }
  // 叶子——点击执行命令
  return <CommandItem item={item} />;
}
```

- 子菜单展开方式：hover 时右侧弹出二级菜单（对标 VS Code）
- 叶子项：点击 → `executeCommand(item.command)` → 关闭菜单
- 快捷键显示：从 `KeybindingRegistry.getKeybindings()` 查找

验证：汉堡 → File → hover → 右侧弹出子菜单 "设置" / "退出"

#### #52e 原生 menubar 适配器改读 MenuRegistry（~30 行）

`electron/menu-builder.ts` 不再硬编码——改为从渲染进程读取 `MenuId.MenuBar` 的菜单数据，转成 Electron `MenuItem` 格式。

```typescript
// electron/menu-builder.ts
// Phase 1（本任务）：从渲染进程一次性获取菜单数据
export function buildAppMenuFromRegistry(
  mainWindow: BrowserWindow,
  menuData: MenuItemTree[]  // 通过 IPC 从渲染进程传来
): Menu {
  return Menu.buildFromTemplate(convertToTemplate(menuData, mainWindow));
}

function convertToTemplate(items: MenuItemTree[], mainWindow: BrowserWindow): any[] {
  return items.map(item => {
    if (item.children?.length) {
      return { label: item.label, submenu: convertToTemplate(item.children, mainWindow) };
    }
    return {
      label: item.label,
      accelerator: item.keybinding,
      click: () => mainWindow.webContents.send('menu:command', item.command),
    };
  });
}
```

获取 menuData 的方式：渲染进程 `ensureCoreCommands()` 之后，`ipcRenderer.send('menu-bar-data', menuItems)` → 主进程收到后构建原生菜单。

验证：切换到 menubar → 原生菜单栏出现 → 内容跟汉堡一致 → 点击 File → 子菜单一致

### 2.3 任务汇总

| # | 任务 | 文件 | 行数 | 独立验证 |
|:--:|------|------|:--:|------|
| 52a | MenuRegistry 加 submenu 类型 | `MenuRegistry.ts` | ~25 | `getMenuItems()` 返回带 children 的 item |
| 52b | 汉堡移入 IconBar 第一个位置 | `IconBar.tsx` + `App.tsx` | ~40 | 汉堡在图标栏顶部，不能拖拽 |
| 52c | 注册菜单栏内容 File/Edit/View/Help | `coreCommands.ts` | ~35 | 汉堡 → 弹出 → File 展开子菜单 |
| 52d | 汉堡渲染嵌套菜单 | `HamburgerMenu.tsx` | ~50 | hover File → 右侧弹出二级菜单 |
| 52e | 原生 menubar 适配器改读 MenuRegistry | `menu-builder.ts` | ~30 | 切 menubar → 原生菜单内容跟汉堡一致 |
| **合计** | | | **~180 行** | |

---

## 三、齿轮菜单全集——四种齿轮，四个 MenuId（🔥 2026-07-26 重写）

> 齿轮菜单问题困扰已久。此处一次性理清 LinkDesk 所有齿轮——对标 VS Code 四种齿轮，每种独立 `MenuId` 互不串扰。

### 3.1 总览——LinkDesk 四种齿轮

```
┌─────────────────────────────────────────────────────────────────────┐
│ 齿轮 #1：全局左下齿轮          齿轮 #2：插件卡片齿轮                 │
│ MenuId.ExtensionGear           MenuId.MarketplaceItemGear           │
│ 位置：图标栏底部 ⚙             位置：marketplace 侧栏每个插件卡片 ⚙   │
│ 谁注册：核心 coreCommands.ts   谁注册：marketplace ensureMarketplace  │
│ 出现条件：永远可见              出现条件：非 core:true 插件            │
│ 菜单位置：IconBar.tsx          菜单位置：marketplace/sidebar.tsx      │
│ 状态：✅ 已实现                 状态：✅ 已实现（#36g 补全中）         │
├─────────────────────────────────────────────────────────────────────┤
│ 齿轮 #3：设置项齿轮            齿轮 #4：命令面板齿轮                 │
│ MenuId.SettingItemGear         MenuId.CommandPaletteItemGear        │
│ 位置：Settings Editor 每个设    位置：Ctrl+Shift+P 悬浮窗每个命令     │
│       置项 hover 时出现 ⚙            项 hover 时出现 ⚙               │
│ 谁注册：核心 coreCommands.ts   谁注册：核心 coreCommands.ts           │
│ 出现条件：hover 时可见          出现条件：hover 时可见                 │
│ 菜单位置：SettingsView.tsx     菜单位置：QuickPick.tsx               │
│ 状态：❌ #53（本文设计）         状态：❌ #53b（本文新增）            │
└─────────────────────────────────────────────────────────────────────┘
```

**四种齿轮共用同一套基础设施：**
- 菜单项注册 → 全部走 `MenuRegistry.registerMenuItems(menuId, pluginId, items)`
- 渲染 → 全部走共享 `<ContextMenu>` 组件
- 显隐过滤 → 全部走 `ContextKeyService.matches(when)`
- 命令 → 全部走 `CommandRegistry.executeCommand(id, ctx)`

**四种齿轮互不串扰——** 每个有独立的 `MenuId`，注册到不同的菜单本分区。全局齿轮的项不会出现在插件卡片齿轮里，反之亦然。

### 3.2 齿轮 #1——全局左下齿轮（`ExtensionGear`）✅

**对标 VS Code：** Activity Bar 左下角 Manage 按钮（`Settings / Keyboard Shortcuts / Themes / ...`）

**位置：** `IconBar.tsx` 图标栏底部 ⚙ 按钮。永远可见——不依赖任何插件。

**菜单项（当前）：**

| 菜单项 | 命令 | when |
|------|------|------|
| 设置 | `core.openSettings` | — |
| 命令面板 | `workbench.action.showCommandPalette` | — |
| 选择颜色主题 | `workbench.action.selectTheme` | — |
| 打开键盘快捷方式 | `workbench.action.openKeyboardShortcuts` | — |

**归属：** 核心 `coreCommands.ts` 注册到 `MenuId.ExtensionGear`。**换 marketplace 不影响此齿轮。**

### 3.3 齿轮 #2——插件卡片齿轮（`MarketplaceItemGear`）✅

**对标 VS Code：** Extensions 视图中每个扩展卡片右侧 ⚙ 按钮。

**位置：** `marketplace/sidebar.tsx` 每个插件卡片的齿轮按钮。仅非 `core: true` 插件显示。

**菜单项（声明驱动——根据 `plugin.json` `contributes` 自动显隐）：**

| 菜单项 | 命令 | when |
|------|------|------|
| 设置 | `core.openSettings` | `extensionHasConfiguration` |
| 选择颜色主题 | `workbench.action.selectTheme` | `extensionHasThemes` |
| 键盘快捷方式 | `workbench.action.openExtensionKeybindings` | `extensionHasKeybindings`（#36g2） |
| 语言入口 | （待定） | `extensionHasLanguages`（#36g3） |
| 图标主题入口 | （待定） | `extensionHasIconThemes`（#36g4） |
| 启用 | `marketplace.enable` | `pluginDisabled` |
| 禁用 | `marketplace.disable` | `!pluginDisabled` |
| 卸载 | `marketplace.uninstall` | — |

**归属：** marketplace 插件 `ensureMarketplaceCommands()` 注册到 `MenuId.MarketplaceItemGear`。**换 marketplace 不影响全局齿轮。** 加菜单项只改一个文件：`plugins/marketplace/src/sidebar.tsx`（`gear-menu-normalization.md` 机械规则）。

**声明驱动链路：**
```
点击插件齿轮
  → applyExtensionContextKeys(manifest, isDisabled)
    → c.configuration 存在 → extensionHasConfiguration = true
    → c.themes 存在       → extensionHasThemes = true
    → c.languages 存在    → extensionHasLanguages = true
    → ...
  → ContextMenu 渲染 → 逐项求值 when → 过滤 → 显示匹配项
```

**没有一行代码是 `if (pluginId === "...")`。** 分辨逻辑唯一来源 = `plugin.json` 的 `contributes` 块。

### 3.4 齿轮 #3——设置项齿轮（`SettingItemGear`）❌

**对标 VS Code：** Settings Editor 每个设置项 hover 时右侧出现齿轮，点击弹出：
```
┌──────────────────────────┐
│ 重置此设置                │  ← 仅用户改过值时显示
│ 复制设置 ID               │
│ 将设置复制为 JSON 文本     │
│ 将设置复制为 URL           │  ← Phase 6
│ ✓ 同步此设置              │  ← Phase 6
└──────────────────────────┘
```

**位置：** `SettingsView.tsx` 每个设置行 hover 时右侧出现齿轮图标。

**菜单项设计：**

| 菜单项 | 命令 | when | 说明 |
|------|------|------|------|
| 重置此设置 | `workbench.action.resetSetting` | `settingModified` | 仅用户改过值时显示——还原到 `default` 值 |
| 复制设置 ID | `workbench.action.copySettingId` | — | `navigator.clipboard.writeText(key)` |
| 复制为 JSON | `workbench.action.copySettingAsJson` | — | `JSON.stringify({key, value})` |
| 复制为 URL | `workbench.action.copySettingAsUrl` | — | Phase 6——深层链接 |
| 同步此设置 | `workbench.action.toggleSettingSync` | — | Phase 6——Profile sync |

**Context key：** 打开齿轮前设 `settingKey`（当前 hover 的设置项 key）+ `settingModified`（当前值 ≠ default 值）。

**归属：** 核心 `coreCommands.ts` 注册到 `MenuId.SettingItemGear`。菜单项对所有设置项相同——不依赖具体插件。唯一变量是 `settingModified` context key（是否显示"重置"）。

**渲染位置：** `SettingsView.tsx` 每个设置行的 JSX 中。hover → ⚙ 图标出现 → 点击 → `<ContextMenu menuId={MenuId.SettingItemGear}>`。

**与 #59a 的合并：** #59a "设置项一键恢复默认" 描述的是同一齿轮的功能。"重置此设置" 菜单项消费 `ConfigurationService.reset(key)` + `showConfirm` 防呆。

### 3.5 齿轮 #4——命令面板齿轮（`CommandPaletteItemGear`）❌

**对标 VS Code：** Ctrl+Shift+P 命令面板中，几乎每个命令项 hover 时右侧出现齿轮，点击弹出：
```
┌──────────────────────────────────────┐
│ 重置 "文件操作需要预览" 的选项        │  ← 仅 toggle 命令显示
│ ─────────────────────────────────── │
│ 帮助：报告问题...                     │
│ 帮助：报告性能问题...                 │
│ 帮助：查看许可证                      │
│ 帮助：订阅 VS Code 新闻邮件           │
│ 帮助：辅助功能入门                    │
│ 帮助：个人资料                        │
│ 帮助：关于                            │
│ 帮助：欢迎                            │
│ 帮助：键盘快捷键参考 (Ctrl+K Ctrl+R)  │
└──────────────────────────────────────┘
```

**VS Code 的齿轮内容分两组：**
- **上组：重置选项** ——仅对 toggle 类命令出现（"Reset choice for '...'"）→ 跳转到设置中的具体配置项
- **下组：帮助类** ——对所有命令都出现（"Help: Report Issue / View License / About / Welcome / ..."）

**位置：** `QuickPick.tsx` 悬浮窗每个命令项 hover 时右侧出现齿轮图标。

**菜单项设计（LinkDesk 版）：**

| 菜单项 | 命令 | when | 说明 |
|------|------|------|------|
| 重置选项 | `workbench.action.resetCommandChoice` | `commandHasSetting` | 仅 toggle 命令——跳转到设置中的对应配置项 |
| 打开插件详情 | `workbench.action.openPluginDetail` | `commandPluginId` | 跳转到命令所属插件的详情页 |
| 报告问题 | `workbench.action.reportIssue` | `commandPluginId` | Phase 6——打开 GitHub issue |
| 复制命令 ID | `workbench.action.copyCommandId` | — | `navigator.clipboard.writeText(commandId)` |

**Context key（打开齿轮前设置）：**

| key | 值 | 来源 |
|------|------|------|
| `commandId` | 当前 hover 的命令 ID | QuickPick item data |
| `commandPluginId` | 命令所属插件 | `CommandRegistry._owners.get(commandId)` |
| `commandHasSetting` | 是否为 toggle 命令（关联到某个设置项） | `CommandRegistry` 命令元数据 `configurationKey` 字段 |

**声明驱动——不硬编码命令名：**
```
QuickPick 渲染命令项
  → 从 CommandRegistry 获取 command 元数据
    → command.configurationKey 存在 → commandHasSetting = true
    → command.pluginId              → commandPluginId = "marketplace"
  → 齿轮菜单 ContextMenu
    → "重置选项" when: "commandHasSetting"
      → handler: openSettings({ pluginId: commandPluginId, scrollTo: configurationKey })
    → "打开插件详情" when: "commandPluginId"
      → handler: openOrFocusTab("plugin-detail", { detailPluginId: commandPluginId })
    → "复制命令 ID" → handlers: clipboard.writeText(commandId)
```

**没有 `if (commandId === "...")`。** 命令的类型信息（是否为 toggle、关联哪个设置项 key、属于哪个插件）全部从 `plugin.json` `contributes.commands` 的声明字段推导。`CommandRegistry` 注册时存储这些字段。

### 3.6 四种齿轮对比——一眼分清

| | 全局左下 | 插件卡片 | 设置项 ⚙ | 命令面板 ⚙ |
|------|:--:|:--:|:--:|:--:|
| `MenuId` | `ExtensionGear` | `MarketplaceItemGear` | `SettingItemGear` | `CommandPaletteItemGear` |
| 触发方式 | 点击 | 点击 | hover 出现 | hover 出现 |
| 菜单位置 | 左下角弹出 | 齿轮旁弹出 | 设置行旁弹出 | 命令项旁弹出 |
| 菜单项由谁注册 | 核心 | marketplace 插件 | 核心 | 核心 |
| context 来源 | 插件→无 | `applyExtensionContextKeys` | 设置项 key + 是否被修改 | 命令 ID + 所属插件 + 是否 toggle |
| 菜单项因插件而异？ | 否 | 是——取决于 `contributes` | 否——对所有设置项相同 | 部分——toggle 显示"重置"，其余相同 |
| 换 marketplace 后 | 不受影响 | 跟随新的 marketplace | 不受影响 | 不受影响 |

### 3.7 实现路线

| 齿轮 | 任务 | 状态 |
|------|------|:--:|
| #1 全局左下 | 已有——`coreCommands.ts` → `MenuId.ExtensionGear` | ✅ |
| #2 插件卡片 | 已有——`marketplace/sidebar.tsx` → `MenuId.MarketplaceItemGear`；#36g 补 context key | ✅ |
| #3 设置项 | #53（本文——合并 #59a） | ❌ |
| #4 命令面板 | #53b（本文新增） | ❌ |

### 3.8 任务清单

#### #53 设置项齿轮（合并 #59a，~65 行）

- **#53a** `MenuRegistry` 加 `MenuId.SettingItemGear`（1 行）
- **#53b** `registerMenuItems(MenuId.SettingItemGear, APP_PLUGIN_ID, [...])`——5 个菜单项 + when 条件（~15 行）
- **#53c** `SettingsView.tsx` 每行加 hover 齿轮图标 + `<ContextMenu menuId={MenuId.SettingItemGear}>`（~20 行）
- **#53d** 齿轮打开前设置 context key：`settingKey` + `settingModified`（~10 行）
- **#53e** `core.openSettings` handler 支持 `scrollTo` 参数——跳转到设置中的具体配置项 + 滚动定位（~20 行）

**验证：** 打开设置→hover 任意设置项→齿轮出现→点击→"重置此设置"（仅修改过的）/ "复制设置 ID" / "复制为 JSON" → 点击"重置"→确认弹窗→值回到 default

#### #53b 命令面板齿轮（新增，~50 行）

- **#53b1** `CommandRegistry` 注册时存储 `configurationKey`（toggle 命令关联的设置项 key）——从 `plugin.json` `contributes.commands[].configurationKey` 读取（~5 行）
- **#53b2** `MenuRegistry` 加 `MenuId.CommandPaletteItemGear`（1 行）
- **#53b3** `registerMenuItems(MenuId.CommandPaletteItemGear, APP_PLUGIN_ID, [...])`——4 个菜单项 + when 条件（~15 行）
- **#53b4** `QuickPick.tsx` 每个命令项行加 hover 齿轮图标 + `<ContextMenu menuId={MenuId.CommandPaletteItemGear}>`（~15 行）
- **#53b5** 齿轮打开前设置 context key：`commandId` + `commandPluginId` + `commandHasSetting`（~10 行）
- **#53b6** `plugin.schema.json` `contributes.commands` 加 `configurationKey` 字段——toggle 命令关联到哪个设置项 key（~4 行）

**验证：** Ctrl+Shift+P→hover "Toggle Terminal" 命令→齿轮出现→点击→"重置选项"（跳转到设置页对应配置项+滚动定位）/ "打开插件详情"（跳转到终端插件详情页）/ "复制命令 ID"（剪贴板="terminal.toggle"）

---

## 四、输出面板 UI

Phase 5 建了 `LogChannel` 数据通道，但查看器 UI 没做。

```
输出面板：
  ├── 频道选择器（"终端" / "协议-SBQ" / "CAD" / "通用"）
  ├── 日志列表（等宽字体、按 source 着色、自动滚动）
  └── 清空 / 导出按钮
```

对标 VS Code Output 面板。~80 行。

---

## 五、欢迎页集成

```
状态 A：未打开文件夹 → "打开文件夹" 按钮 + recentFolders 列表
状态 B：已打开文件夹 → 文件树显示内容 + 标题栏显示文件夹名
状态 C：关闭文件夹 → 回到 A
```

Phase 4 欢迎页已有 `recentViews`。加 `recentFolders`。~40 行。

---

## 六、Workspace 导入导出

导入：Electron dialog 选 `.linkdesk-workspace` → 解压到 workspace 目录 → WorkspaceService.addFolder。
导出：WorkspaceService.activeFolder → 打包 `workspace.json` + settings + 卡片数据 → 另存为。~50 行。

---

---

## 七、终端会话持久化

Phase 5.5c 的会话数据存在内存（`useTerminalSessions` 模块级单例）。加磁盘持久化：

```
软件关闭 → 最后一次 sessions 快照写入 .linkdesk/sessions.json
软件启动 → loadSessionsFromDisk() → 恢复到内存
```

消费 E2c FileService。~30 行。

---

## 八、Developer 工具

### DevTools 管理命令

E3 多 WebView 后每个插件有独立 DevTools——手动逐个右键→Inspect 不可行。提供一个壳命令：

```
Ctrl+Shift+P → "Developer: Toggle Plugin DevTools"
  → QuickPick 列出所有运行中的插件 WebView
  → 选一个 → 打开/关闭它的 DevTools（detach 模式，独立窗口）
```

底层调 `WindowManager.toggleDevTools(pluginId)`（E3a #24 新增）。只在非打包模式可用。

---

## 九、设置页增强——快捷键子栏

### 对标 VS Code

VS Code 的 Keyboard Shortcuts 页面：左侧 "User Settings" / "Keyboard Shortcuts" 两个 tab，右侧显示快捷键表格——命令名、绑定、来源、when 条件。双击改绑定，冲突红字提示。

### 实现

设置页改双 tab 结构：

```
Settings Editor
├── [设置] [快捷键]        ← 两个 tab
├── 设置 tab → 现有 GUI（下拉框/复选框/输入框）
└── 快捷键 tab → 表格视图
      ├── 搜索（实时过滤）
      ├── 列：命令名 / 快捷键 / 来源 / when 条件
      ├── 双击行 → 弹窗 "按下新快捷键" → 冲突自动高亮
      └── 右键 → 重置绑定 / 复制命令 ID
```

数据源：`KeybindingRegistry.getKeybindings()`——所有已注册快捷键（builtin + plugin + user）。用户覆盖写入 `keybindings.json`（消费 E2c #17），优先级 user > plugin > builtin 自动生效。

**这不需要新基础设施。** `KeybindingRegistry` 已就绪，`keybindings.json` 读写已就绪（E2c #17）。只差 GUI。

~60 行。

---

### 九-B、设置项一键恢复默认（防呆）

**对标 VS Code：** 每个设置项左侧有齿轮图标 → "Reset Setting"——用户改乱了直接回出厂值。

**实现：** `ConfigurationService` 已有每个 key 的 `default` 值（来自 `contributes.configuration`）。恢复默认 = 删用户值 → 重新读 → 回退到 default。

**UI：** 每个设置项右侧加一个齿轮图标（× 还原）。点击 → `showConfirm("恢复默认值？")` → 确认 → `ConfigurationService.reset(key)` → 控件值即时更新。齿轮图标始终显示（没有修改值的 gray out，用户手动设了值再改回 default 也要有这个路径）。

~15 行。

---

### 九-C、FileDecorationRegistry——文件装饰器注册中心

**对标 VS Code：** `IExplorerService` 有一个 `FileDecorationProvider` 注册中心。Git 插件注册装饰器（M/A/D），文件树渲染时调用。供需双方在两个插件里——**注册中心理应是核心服务。**

**为什么在 E3 而不是 E4：** E3 是最后一次碰核心的机会。封板后后悔就只能给 E4 打补丁了。~40 行换一个干净的架构边界。

```typescript
// src/core/FileDecorationRegistry.ts（新）
// 🔥 文件装饰器注册中心——Git 注册，文件树消费

interface FileDecoration {
  badge?: string;              // "M" "A" "D" "!"
  color?: string;              // CSS 变量
  tooltip?: string;            // 悬停提示
  propagate?: boolean;         // 是否向上传播到父目录
}

interface FileDecorationProvider {
  id: string;
  priority?: number;            // 默认 0，Git = 10。高优先级覆盖低优先级
  onDidChangeFileDecorations: Event<string[]>;  // 空数组 = 全部刷新
  provideDecoration(uri: string): FileDecoration | undefined;
}

class FileDecorationRegistry {
  private _providers: FileDecorationProvider[] = [];

  register(provider: FileDecorationProvider): IDisposable;
  unregister(id: string): void;

  getDecorations(uri: string): FileDecoration[] {
    return this._providers
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .map(p => p.provideDecoration(uri))
      .filter(Boolean) as FileDecoration[];
  }
}
```

**消费关系：**
- **Git 插件** → `fileDecorationRegistry.register({ id: 'git', provideDecoration })`
- **文件树 (E4)** → `fileDecorationRegistry.getDecorations(uri)` → 取最高优先级显示

**为什么不是 `FileDecoration[]` 返回值：** 当前取最高优先级单装饰（VS Code 行为）。v2 如果有需求横向合并多装饰，接口升级为 `FileDecoration | FileDecoration[]`——注册中心不变，调用方改合并逻辑。

~40 行。

---

### 九-D、`<SelectBox>` 归一化下拉组件——替代所有原生 `<select>`

**对标 VS Code：** VS Code 不用原生 `<select>`——自己画 `SelectBox`（`src/vs/base/browser/ui/selectBox/`）。原生 `<select>` 在 Electron 里走独立 OS 渲染通道，跟 Chromium 合成器节奏不同步，表现为无动画闪出。跟 `alert()`/`confirm()` 是同一类问题（[dialog-normalization-requirement]）。

**归一化要求：**
- 全局只有一个 `<SelectBox>` 组件——不同页面/插件传不同的 `options`、`value`、`onChange`
- UI 行为统一：动画曲线、最大高度、搜索过滤（options > 8 时自动出现）、键盘导航（↑↓Enter Esc）
- 主题色适配：下拉面板背景 `var(--bg-window)`、选中项 `var(--accent)`、分隔线 `var(--separator)`

**组件接口：**
```typescript
// src/components/shared/SelectBox.tsx（新）
interface SelectBoxProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}
```

**替换范围（grep `<select` 全项目）：**
- `plugins/terminal/src/ControlPanel.tsx`——COM/波特率/协议（3 个）
- 其他插件/组件中的 `<select>`（grep 确认）
- 替换后项目里不允许新的原生 `<select>` 出现

~100 行。

---

### 九-E、`dependsOn`——配置项声明式条件显隐（🔥 基础设施）

**对标 VS Code：** `package.json` `when` 条件。VS Code 设置页里关掉 `editor.minimap.enabled`，下面 `minimap.maxColumn`、`minimap.renderCharacters` 等子设置全部消失。没人觉得跳不好看——因为这是**语义分组**："不启用小地图"意味着"小地图参数不需要存在"。

**问题：** 当前强调色只有一个选项——用户设一个颜色，永远显示这个颜色。加上 `app.accentMode`（跟随主题 vs 自定义）后，选"跟随主题"时 `app.accentColor` 色块不应该出现——用户不需要自己选颜色了。

#### 设计决策：隐藏 vs 灰色禁用

```
❌ 灰色禁用（不用这个方案）：
   强调色模式 [自定义 ▼]
   强调色     [#f077ee] [■]    ← 可见但灰了
   
   用户困惑："为什么灰了？我怎么才能点它？"

✅ 条件隐藏（对标 VS Code）：
   强调色模式 [跟随主题 ▼]     ← 切换为跟随主题
   （强调色行消失）              ← 语义：不需要自己选颜色

   强调色模式 [自定义 ▼]        ← 切换为自定义
   强调色     [#f077ee] [■]     ← 出现：现在需要自己选颜色
```

#### 数据结构——`ConfigurationProperty` 加一个字段

```typescript
// src/core/ConfigurationRegistry.ts

interface ConfigurationProperty {
  // ...existing fields...
  
  /**
   * 🔥 声明式条件显隐——父配置项满足此值时才渲染本行。
   * 对标 VS Code package.json 的 "when" 条件。
   * 
   * 只支持 == 判断（足够覆盖当前需求。未来需要 != / in / regex → 升级为 when 表达式字符串）。
   */
  dependsOn?: {
    key: string;       // 父配置项 key，如 "app.accentMode"
    value: unknown;    // 期望值，如 "custom"
  };
}
```

#### 渲染逻辑——5 行，一次写完

```typescript
// src/components/views/SettingsView.tsx —— 渲染每行前加一行判断

// 条件不满足 → 整行不渲染
const hidden = prop.dependsOn 
  && getConfigurationValue(prop.dependsOn.key) !== prop.dependsOn.value;
if (hidden) return null;
```

**不是为强调色写死代码——是给整个配置系统加了一个声明式条件显隐能力。** 5 行代码，一次写完，所有配置项通用。以后任何设置需要"选了 A 才出现 B"——加一行 `dependsOn` 声明就行。

#### 第一个消费方——强调色

```
        跟随主题：                      自定义：
  配色主题  [Dark ▼]            配色主题  [Dark ▼]
  强调色模式 [跟随主题 ▼]         强调色模式 [自定义 ▼]
  界面语言  [中文 ▼]             强调色    [#f077ee] [■]  ← 多出一行
  字体大小  [14]                界面语言  [中文 ▼]
                                字体大小  [14]

  语义：主题自带强调色 →            语义：用户要自己选颜色 →
  不需要颜色选择器                  颜色选择器出现
  dependsOn 不满足 → return null   dependsOn 满足 → 正常渲染
```

#### 未来——任意插件可用

```json
// 以后随便哪个插件的 plugin.json：
{
  "contributes": {
    "configuration": {
      "properties": {
        "myPlugin.mode": { 
          "type": "string", 
          "enum": ["simple", "advanced"] 
        },
        "myPlugin.advancedOption": { 
          "type": "string",
          "dependsOn": { "key": "myPlugin.mode", "value": "advanced" }
        },
        "myPlugin.extraOption": {
          "type": "number",
          "dependsOn": { "key": "myPlugin.mode", "value": "advanced" }
        }
      }
    }
  }
}
```

选 "simple" → `advancedOption` 和 `extraOption` 同时消失。选 "advanced" → 两行同时出现。

#### 与其他机制的关系——各管各的，不冲突

| 机制 | 管什么 | 位置 |
|------|------|------|
| `dependsOn` | 这行该不该存在？ | `ConfigurationProperty` → `SettingsView.tsx` 渲染前过滤 |
| #53 齿轮菜单 | 存在的行 hover 齿轮显示什么？ | `MenuId.SettingItemGear` → `<ContextMenu>` |
| `when` (context key) | 齿轮菜单中的某个菜单项该不该出现？ | `ContextKeyService.matches(when)` |

**不满足 `dependsOn` 的行根本不渲染 → 齿轮菜单自然不存在 → 三个机制各管各的，不冲突。**

#### 为什么是基础设施而不是强调色专用代码

```
强调色场景：app.accentMode → app.accentColor           ✓ 第一个消费方
未来场景：   myPlugin.mode → myPlugin.advancedOption     ✓ 声明式复用
未来场景：   editor.minimap → editor.minimapSize          ✓ 声明式复用
未来场景：   terminal.type → terminal.baudRate            ✓ 声明式复用
```

**写 5 行通用代码，而不是为强调色写 15 行专用 `if (key === "app.accentColor")`。** 前者是归一化基础设施，后者是硬编码债务。

---

## 十、任务清单

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| 51 | 标题栏暗色化——Electron nativeTheme + backgroundColor | ~25 | 标题栏颜色 = 主题色 |
| 52a | MenuRegistry 加 `children` 嵌套 | — | ✅ 保留——TitleBar + HamburgerMenu 共用 |
| 52b | 汉堡移入 IconBar 第一个 | — | ✅ 保留——`menuStyle: "hamburger"` 模式用 |
| 52c | 注册 File/View 菜单内容 | — | ✅ 保留——两份渲染的共同数据源 |
| 52d | hover 展开子菜单 | — | ✅ 保留——两份渲染共用交互逻辑 |
| 52e | 原生 menubar 适配器 | — | ❌ 废弃——被 TitleBar 替代（#52i 清理） |
| 52f | 🔥 TitleBar 组件——横排菜单 + 下拉面板 + 拖拽区 | ~60 | 顶部暗色标题栏，☰+文件▼+查看▼ |
| 52g | 🔥 `app.menuStyle` 配置项 + App.tsx 条件渲染 | ~20 | 设置里切换 → TitleBar/Hamburger 显隐 |
| 52h | IconBar 接收 `showHamburger` prop | ~5 | prop 控制图标栏汉堡显隐 |
| 52i | 删除原生 menubar 代码——5 文件（HamburgerMenu 保留） | ~-60 | `grep` 零残留 |
| 52j | coreCommands 菜单注册声明式——label + group + order | ~15 | 加 group="terminal"→自动出现 |
| 53 | 齿轮菜单完整版——context key 驱动 5 项 | ~40 | 齿轮 → 配置/查看日志 跳到对应位置 |
| 54 | 输出面板 UI——频道选择器 + 日志列表 + 清空/导出 | ~80 | 切频道 → 日志内容切换 |
| 55 | 欢迎页集成——三种状态切换 + recentFolders | ~40 | 打开文件夹 → 状态 B → 关闭 → 状态 A |
| 56 | Workspace 导入导出 | ~50 | 导出 → 导入 → 布局/设置复原 |
| 57 | 终端会话持久化——sessions.json 读写 | ~30 | 关闭 → 重启 → 会话列表恢复 |
| 58 | **Developer: Toggle Plugin DevTools**——QuickPick + WindowManager.toggleDevTools | ~10 | Ctrl+Shift+P → 选插件 → DevTools 弹出/关闭 |
| 59 | **设置页快捷键子栏**——双 tab + 表格视图 + 冲突检测 | ~60 | 打开设置→快捷键 tab→所有快捷键可搜索→双击改绑定→冲突红字 |
| 59a | **设置项一键恢复默认**——每项齿轮图标 + `showConfirm` + `ConfigurationService.reset(key)`（防呆） | ~15 | 改值→齿轮亮→点击→确认→回到出厂默认 |
| 59b | **🔥 FileDecorationRegistry**——文件装饰器注册中心，Git 注册/文件树消费 | ~40 | Git 注册 provider→getDecorations(uri) 返回装饰→注销→返回空 |
| 59c | **🔥 `<SelectBox>` 归一化**——替代全项目原生 `<select>`，统一动画/搜索/键盘导航 | ~100 | ControlPanel 三个下拉→同组件；设置页/主题/语言选择器→同组件 |
| 59d | **🔥 强调色模式——跟随主题 vs 自定义**——`dependsOn` 基础设施 + 强调色逻辑 | ~80 | 选"跟随主题"→强调色行消失；选"自定义"→强调色行出现+色块 |
| 59e | **🔥 `<ColorPicker>` 归一化**——替代 `<input type="color">`，饱和度面板+色相条+hex输入+预设色 | ~200 | SettingsView 色块→弹出浮层→拖动取色→Enter 确认；Esc 取消恢复旧值 |
| **合计** | | **~885 行** | |

---

## 十一、验证标准

```
标题栏 → 暗色背景匹配主题
☰ 菜单 → File/Edit/View/Help 四项可用 → 快捷键显示正确
齿轮菜单 → 5 项由 context key 驱动 → 禁用态正常
输出面板 → 按频道切换 → 日志着色 → 清空/导出正常
欢迎页 → 三种状态切换 → recentFolders 列表可点击
Workspace → 导出 → 导入 → 布局复原
会话持久化 → F5 刷新 → 会话名恢复
```

---

> **← 上一份：** `05-E3e-通知系统.md`
> **→ 下一份：** `07-E3g-API与V2兼容.md`
> **E3 索引：** `00-README.md`
