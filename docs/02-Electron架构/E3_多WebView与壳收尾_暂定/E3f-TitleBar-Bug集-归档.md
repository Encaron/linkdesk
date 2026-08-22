---
name: e3f-titlebar-bugs-2026-07-27
description: E3f #52 TitleBar 开发过程中的 7 个 bug——新 AI 写 TitleBar 相关代码前必读
metadata:
  type: feedback
---

# E3f TitleBar 开发 Bug 集——2026-07-27

## Bug 1：grid 布局塌陷——状态栏上顶

**现象：** `menuStyle: "hamburger"` 时 StatusBar 推上去，IconBar 被压缩。

**根因：** `app-shell` 用 `display: grid` + `grid-template-rows: auto 1fr auto`。Context Provider 不产生 DOM → 所有子元素平铺为 grid children → 隐式行机制把元素塞进错误行。

**Why 是缝 bug：** 历史 `37dbfad` 修过同款——grid 3 行→4 行。但那次是用硬编码多一行，根因未消。

**修复：** grid → flex 列。`position: fixed` 元素对 flex 透明，不需要数行数。

**如何应用：** `app-shell` 永远用 flex 列，不用 grid。如果未来需要再加层，flex 嵌套不引入隐式行问题。

---

## Bug 2：TitleBar ☰ 与 IconBar HamburgerMenu 重复

**现象：** `menuStyle: "both"` 时两个 ☰——一个在 TitleBar 左端，一个在 IconBar 图标栏顶部。打开内容完全一样。

**根因：** TitleBar 画了自己的 ☰ 按钮，和 HamburgerMenu 读同一个 `MenuId.MenuBar`。

**修复：** 删掉 TitleBar 的 ☰——TitleBar 对标 VS Code 桌面版，只渲染横排菜单按钮。☰ 只属于 IconBar。

**Why 是设计缝：** #52f 设计文档画了 `│ ☰ 文件▼ 查看▼ │`，但 ☰ 在 VS Code 桌面版的 titlebar 里不存在——VS Code 的 ☰（Manage 齿轮）在 Activity Bar 底部。

---

## Bug 3：窗口控件（─ □ ×）随 TitleBar 消失

**现象：** `menuStyle: "hamburger"` → `showTitleBar=false` → `<TitleBar />` 不渲染 → ─ □ × 消失。

**根因：** 窗口控件写在 `<TitleBar />` 组件内部。

**修复：** 提取为独立 `<WindowControls />` 组件——`position: fixed`，在 App.tsx **始终渲染**，不受 `menuStyle` 影响。

**Why 是边界 bug：** 窗口控件是壳级基础能力（对标 Electron 原生 frame），不属于"菜单栏样式"的管辖范围。放在 TitleBar 里 = 耦合了两个独立概念。

---

## Bug 4：hamburger 模式窗口无法拖拽

**现象：** 修 Bug 3 后发现 hamburger 模式整个 TitleBar 消失 → 拖拽区也消失 → 无法移动窗口。

**根因：** `showTitleBar=false` 隐藏了整个 TitleBar，但拖拽区（`-webkit-app-region: drag`）在 TitleBar 内。

**修复：** TitleBar **始终渲染**，新增 `showMenus` prop 只控制菜单按钮显隐。Logo + 拖拽区 + 窗口控件永远在。

**Why 是过度修 bug：** Bug 3 修成了"把整个组件砍掉"，没区分"菜单按钮"和"拖拽区+Logo"是两个独立部分。

---

## Bug 5：硬编码 Logo "LD"

**现象：** `<span className="titlebar-logo">LD</span>`——死文字，换 logo 要改源代码。

**根因：** AI 没找到 logo 文件就编了个占位符，而不是创造正确的引用机制。

**修复：** 
1. 创建 `public/assets/logo.svg`
2. `<img src={getAssetPath("assets/logo.svg")}>`——走硬约束第 12 条
3. 换 logo = 替换文件，零代码改动

**Why 不满足"AI 友好度"：** 硬编码文字 ≠ 声明式文件引用。AI 应该创造机制而不是编造数据。

---

## Bug 6：electron:dev 显示 Electron 默认图标

**现象：** 任务栏/窗口显示 Electron 默认图标而不是 LinkDesk 图标。

**根因：** `BrowserWindow` 没设 `icon`——`build/icon.ico` 只在 electron-builder 打包时用。dev 模式无人引用。

**修复：** `icon: path.join(__dirname, '../build/icon.ico')`

---

## Bug 7：原生标题栏显示为第二行

**现象：** 自定义 TitleBar 上方还有一行 Windows 原生标题栏（图标+名字+─□×）。

**根因：** `BrowserWindow` 默认 `frame: true`。

**修复：** `frame: false`——隐藏原生框架。

---

## 核心教训

**1. 布局用 flex 不用 grid。** grid 的隐式行对 Context Provider 透明的 DOM 结构不友好。`37dbfad` 的 3→4 行是治标不治本。

**2. 壳级基础能力不放在条件渲染组件内。** 窗口控件、拖拽区、Logo——它们不属于"菜单栏样式"，应独立渲染。

**3. 不编造数据，创造机制。** Logo 找不到文件 → 创建文件+引用路径，而不是写死文字。

**4. 两个渲染器共享同一数据源时，确保两者都声明式。** HamburgerMenu 和 TitleBar 都读 `MenuRegistry`，但 HamburgerMenu 遗留了硬编码 `GROUP_LABELS`/`GROUP_ORDER`。消掉后两个都动态。
