# UI 合规——z-index 分层

> 2026-08-06。E5 收尾 UI/UX 审计 P2。
> 位于 E5 收尾 → `05-收尾/UI合规/`

---

## 一、问题

~10 处硬编码 z-index 数字，不走设计 token。部分组件已使用 CSS 变量（`--z-overlay`、`--z-overlay-backdrop`、`--z-sticky`），但多数仍是裸数字。违反硬约束 #1（所有值走 token）。

加上 ContextMenu 遮挡 bug（`Bug修复/右键菜单遮挡与定位.md`），z-index 问题同时涉及**token 合规**和**层叠上下文隔离**两个维度。

---

## 二、清单

| 文件 | 裸 z-index | 用途 | 修复为 |
|------|----------|------|------|
| `IconBar.css:162` | `99999` | 拖拽线 | `var(--z-overlay)` |
| `ColorPicker.css:7` | `9998` | 取色器面板 | `var(--z-overlay)` |
| `ColorPicker.css:13` | `9999` | 取色器 backdrop | `var(--z-overlay-backdrop)` |
| `WindowControls.css:8` | `3000` | 窗口控制按钮 | 评估——可能需要独立 token |
| `HamburgerMenu.css:35` | `2550` | ☰ 菜单 | `var(--z-dropdown)` |
| `TitleBar.css:100` | `2548` | 顶栏 | `var(--z-sticky)` |
| `ProgressBar.css:14` | `2546` | 进度条 | `var(--z-overlay)` |
| `StatusBar.css:147` | `2545` | 状态栏 | `var(--z-overlay)` |
| `ToastContainer.css:19` | `2545` | Toast 通知 | `var(--z-overlay)` |
| `TabBar.css:176` | `var(--z-overlay-backdrop)` | + 菜单 backdrop | ✅ 已合规 |
| `TabBar.css:181` | `var(--z-overlay)` | + 菜单面板 | ✅ 已合规 |
| `MainContent.css:34` | `var(--z-sticky)` | 拖拽 drop zone | ✅ 已合规 |
| `App.tsx:594-621` | `1/5/10/15` | Zone wrapper | ⚠️ 不是 CSS 文件——inline style |

---

## 三、当前 token 定义

`index.css`：

```css
:root {
  --z-sidebar-sticky-header: 10;  /* SidePanel section header */
  --z-sticky: 200;                /* 拖拽 drop zone overlay */
  --z-overlay-backdrop: 500;      /* 弹窗/菜单 backdrop */
  --z-overlay: 600;               /* 弹窗/菜单面板 */
  --z-dropdown: 700;              /* 下拉/悬浮（预留） */
}
```

---

## 四、修复方案

### 纯 token 替换（直接改 CSS）

| 当前值 | → token | 原因 |
|:--|:--|:--|
| `99999` | `var(--z-overlay)` | 拖拽线=最高层 overlay |
| `9998/9999` | `var(--z-overlay)` / `var(--z-overlay-backdrop)` | 取色器=overlay |
| `2545`（Toast/StatusBar） | `var(--z-overlay)` | 通知=overlay |
| `2546`（ProgressBar） | `var(--z-overlay)` | 进度条=overlay |
| `2548`（TitleBar） | `var(--z-sticky)` | 顶栏=sticky |
| `2550`（HamburgerMenu） | `var(--z-dropdown)` | ☰ 菜单=dropdown |
| `3000`（WindowControls） | 待评估 | 覆盖标题栏之上的窗口控制——可能需要独立 token |

### 关键约束

**不可批量替换。** 当前裸数字之间有精确的相对顺序：

```
拖拽线 99999 > ColorPicker 9999 > WindowControls 3000 > Hamburger 2550 > TitleBar 2548 > ProgressBar 2546 > StatusBar/Toast 2545
```

归入 token 后：
```
--z-overlay(600) > --z-dropdown(700) ? 不对——dropdown 定义比 overlay 高
```

**需要重新排列：**

```css
:root {
  --z-sidebar-sticky-header: 10;
  --z-sticky: 200;                /* TitleBar, drop zone */
  --z-overlay-backdrop: 500;      /* 蒙层 */
  --z-overlay: 600;               /* 弹窗/Toast/ProgressBar/ColorPicker/取色器面板 */
  --z-dropdown: 650;              /* HamburgerMenu */
  --z-drag-preview: 1000;         /* 拖拽预览线（最高） */
}
```

当前 `--z-dropdown: 700` 比 `--z-overlay: 600` 高——但 HamburgerMenu(2550) 实际低于 ColorPicker(9999)。说明 dropdown 和 overlay 的层级关系在旧代码中是反的。**整理 token 时要根据实际相对顺序重新分配。**

### App.tsx zone wrapper

`App.tsx` L594-621 的 `zIndex: 1/5/10/15` 是 inline style——不受 CSS 变量影响。但 ContextMenu 的 portal 修复（`Bug修复/右键菜单遮挡与定位.md`）后不再受这些 zIndex 约束——portal 到 body 后脱离所有 zone 层叠上下文。

---

## 五、可能遇到的问题

### 1. 堆叠顺序翻转

**风险：** Token 替换后某个组件出现在不该在的位置——因为它依赖旧数字之间的比较关系。

**缓解：** 逐组件替换、逐组件验证——每改一个就跑 UI 确认一次。不改完一批才验证。

### 2. App.tsx zone wrapper 不改

**风险：** zone wrapper 的 inline zIndex 仍然裸数字。

**缓解：** 暂不改——zone wrapper 的 zIndex 关系（Main=1 < Sidebar=5 < IconBar=10 < Resize=15）是布局逻辑的一部分，改 CSS 变量不会影响 inline style。ContextMenu portal 化后不再受这些值影响。

### 3. 第三方插件的 z-index

**风险：** 插件可能有自己的 z-index 值——不受本次改动影响。

**缓解：** 本轮只改 `src/` 下。插件 z-index 是独立问题——但插件也应在自己的 scope 内使用 `var(--z-*)`。

---

## 六、涉及文件

| 文件 | 改动 |
|:--|:--|
| `src/index.css` | 调整 `--z-dropdown`/`--z-drag-preview` token 值 |
| `src/components/IconBar.css:162` | `99999` → `var(--z-drag-preview)` |
| `src/components/shared/ColorPicker.css:7,13` | `9998/9999` → `var(--z-overlay)` |
| `src/components/WindowControls.css:8` | `3000` → 评估 |
| `src/components/HamburgerMenu.css:35` | `2550` → `var(--z-dropdown)` |
| `src/components/TitleBar.css:100` | `2548` → `var(--z-sticky)` |
| `src/components/ProgressBar.css:14` | `2546` → `var(--z-overlay)` |
| `src/components/StatusBar.css:147` | `2545` → `var(--z-overlay)` |
| `src/components/ToastContainer.css:19` | `2545` → `var(--z-overlay)` |

**改动量：** ~12 行 + token 重排验证。

参考 memory：[[ui-ux-audit-todos]]

---
