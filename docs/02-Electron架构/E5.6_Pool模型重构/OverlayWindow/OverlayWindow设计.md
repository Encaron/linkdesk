# OverlayWindow 设计

> 📖 架构全景：[01-Pool模型设计.md](../01-Pool模型设计.md)
> 📖 执行清单：[E5.6#21-#26](../E5.6-执行清单.md)——Phase 6：OverlayWindow

---

## 1. 概述

OverlayWindow = **全屏透明 BrowserWindow，z-index 最高，默认鼠标穿透**。所有浮层 UI 的宿主。

| 属性 | 值 |
|:--|:--|
| 窗口类型 | `BrowserWindow`（不是 WebContentsView——必须置顶于所有 WCV 之上） |
| 大小 | 全窗口尺寸——跟随主窗口 resize |
| z-index | 最高——高于 Shell DOM、SidebarPool、MainPool、BottomPanelPool |
| 透明 | `transparent: true` |
| 鼠标 | **默认穿透** `setIgnoreMouseEvents(true, { forward: true })` |
| 进程 | 1 个 |

---

## 2. 为什么永远需要

SidebarPool 和 MainPool 是平级 WebContentsView。**一个 Pool 的任何 DOM 元素超出自己的矩形 bounds → 被另一个 Pool 裁剪。**

```
错误做法：右键菜单在 SidebarPool 里
  SidebarPool [260px]  |  MainPool
  ┌─────────┬──────────┐
  │ 文件树   │ 编辑器    │
  │ 右键 ─→ │ ← 被 MainPool WCV 边界截断，只显示一半
```

OverlayWindow = 独立 BrowserWindow 覆盖全窗口。**它的渲染不在任何 Pool 的bounds 内——不会被裁剪。**

```
正确做法：右键菜单在 OverlayWindow 里
  ┌──────────────────────────────────┐
  │ OverlayWindow (透明, z-index 最高) │
  │   ┌──────┐                        │
  │   │ 打开  │  ← 浮在一切之上        │
  │   │ 复制  │                        │
  │   │ 粘贴  │                        │
  │   └──────┘                        │
  │ Shell / SidebarPool / MainPool 的  │
  │ 内容在 OverlayWindow 下面           │
  └──────────────────────────────────┘
```

---

## 3. 渲染内容

### 3.1 常规浮层（常驻能力）

| 内容 | 触发 | 实现 |
|:--|:--|:--|
| 右键菜单 | 任何 Pool 的 `window.linkdesk.menu.show()` | 菜单组件 + `position: fixed` 在鼠标位置 |
| 命令面板 | Ctrl+Shift+P | 居中 `position: fixed` + 模糊遮罩 |
| Toast 通知 | 插件调 `window.linkdesk.dialog.toast()` | 右上角 fixed，自动消失 |
| Dialog 弹窗 | 插件调 `window.linkdesk.dialog.show()` | 居中 fixed + 半透明遮罩 |
| SelectBox 下拉 | 插件调 `window.linkdesk.quickPick.show()` | `position: absolute` 紧贴触发元素 |
| Tooltip | hover | `position: absolute` 在目标元素附近 |

### 3.2 分割线（池间拖拽手柄）

| 分割线位置 | 拖拽方向 | 调整 |
|:--|:--|:--|
| SidebarPool ↔ MainPool | 水平 | sidebar 宽度 |
| MainPool ↔ BottomPanelPool | 垂直 | bottom-panel 高度 |
| MainPool 内分屏组间 | 水平 | 组 flex 比例 |

分割线 = 4px 宽的 `<div>` + `cursor: col-resize / row-resize`。拖拽时 OverlayWindow `setIgnoreMouseEvents(false)` 接管鼠标。松手后恢复穿透。

### 3.3 Modal 容器（未来）

浮层容器——设置/市场全屏/主题制作器的大窗口：

- `position: absolute`，居中，可 resize
- 最小 400×300，默认 800×600
- Header toolbar 带 "Dock to Main" 按钮
- 约束在主窗口 bounds 内——不拖出窗口边缘

---

## 4. 鼠标穿透机制

```
OverlayWindow 生命周期:

默认 (idle):
  setIgnoreMouseEvents(true, { forward: true })
  → 鼠标事件穿透 OverlayWindow → 下层 Shell DOM + Pool WCV 正常工作

浮层弹出 (active):
  setIgnoreMouseEvents(false)
  → OverlayWindow 接管鼠标 → 用户在菜单/对话框/Tooltip 上交互

浮层关闭 (back to idle):
  setIgnoreMouseEvents(true, { forward: true })
  → 恢复穿透
```

**`forward: true` 参数确保鼠标事件转发到下层窗口**——如果 OverlayWindow 上的某个像素是透明的，点击会穿透到下面的内容。

---

## 5. z-index 分层

```
OverlayWindow DOM 内部:
  z-index: 1    → Tooltip
  z-index: 10   → 分割线拖拽手柄
  z-index: 100  → 右键菜单 / SelectBox 下拉
  z-index: 500  → Dialog 遮罩
  z-index: 501  → Dialog 弹窗
  z-index: 1000 → 命令面板
  z-index: 2000 → Toast 通知（最高——不挡操作）
```

**所有组件用 CSS 变量**：`--z-tooltip`、`--z-menu`、`--z-dialog`、`--z-toast`。禁止硬编码 z-index 数字。

---

## 6. 通信

```
SidebarPool / MainPool 需要弹右键菜单:
  1. 插件调 window.linkdesk.menu.show(items, { x, y })
  2. IPC → 主进程
  3. 主进程 → Shell webContents.send('overlay:show-context-menu', items, pos)
  4. Shell → OverlayWindow webContents.send('overlay:render', { type: 'context-menu', ... })
  5. OverlayWindow 渲染菜单 + setIgnoreMouseEvents(false)

用户点击菜单项:
  1. OverlayWindow → Shell webContents.send('overlay:menu-selected', itemId)
  2. Shell → 主进程 → 原始 Pool 的 webContents.send('menu:callback', itemId)
  3. 插件收到回调
  4. OverlayWindow setIgnoreMouseEvents(true)
```

---

## 7. 窗口同步

- 主窗口 resize → OverlayWindow 同步 resize（`mainWindow.on('resize', ...)` 或 `setBounds`）
- 主窗口 move → OverlayWindow 同步 move
- OverlayWindow **永远不获得焦点**——`focusable: false`。主窗口焦点不丢失

---

> **← 架构全景：** [01-Pool模型设计.md](../01-Pool模型设计.md)
> **→ 崩溃恢复：** [崩溃恢复设计.md](../崩溃恢复/崩溃恢复设计.md)
> **→ 执行清单：** [E5.6#21-#26](../E5.6-执行清单.md)
