# OverlayPortal——通用悬浮层组件

> 2026-08-06。建议——不只是修 ContextMenu，是所有 overlay 的根本解。
> 位于 E5 收尾 → `05-收尾/架构债/`

---

## 一、问题

App.tsx 的 5 个 zone wrapper（L594-621）全是 `position: fixed` + inline zIndex：

```
Main:       zIndex: 1
Sidebar:    zIndex: 5
IconBar:    zIndex: 10
StatusBar:  zIndex: 10
Resize:     zIndex: 15
```

每个创建独立层叠上下文。**任何悬浮层**（ContextMenu、Toast、ConfirmDialog、ColorPicker、SelectBox 下拉、未来 FloatingPanel、tooltip）只要渲染在 zone 内部 → 被分割线/图标栏/状态栏盖住。

`Bug修复/右键菜单遮挡与定位.md` 修 ContextMenu 一个 → portal 到 body。但问题不只 ContextMenu——目前存在或规划中的 overlay 组件有：

| 组件 | 当前渲染位置 | 是否受影响 |
|:--|:--|:--|
| ContextMenu | 调用方组件内 | ✅ 会被遮挡 |
| ToastContainer | App.tsx 内 | ✅ 在主区 zIndex:1 内 |
| ConfirmDialog | App.tsx 内 | ✅ 同上 |
| ColorPicker | 调用方组件内 | ✅ 同上 |
| SelectBox 下拉 | 调用方组件内 | ✅ 同上 |
| FloatingPanel (未来) | 待定 | 🔮 会被遮挡 |
| Tooltip (未来) | 待定 | 🔮 会被遮挡 |
| 标签页拖拽预览 | TabBar → portal body | ✅ 已正确 |

---

## 二、方案

**新建 `<OverlayPortal>` 组件——所有 overlay 的统一 portal 容器：**

```typescript
// src/components/shared/OverlayPortal.tsx
import { createPortal } from "react-dom";

interface OverlayPortalProps {
  children: React.ReactNode;
  /** 可选——指定挂载目标，默认 document.body */
  container?: HTMLElement;
}

export default function OverlayPortal({ children, container }: OverlayPortalProps) {
  return createPortal(children, container ?? document.body);
}
```

**原则：**
1. **所有 overlay 组件走 OverlayPortal**——ContextMenu、Toast、Dialog、ColorPicker、SelectBox、FloatingPanel、Tooltip
2. **z-index 统一走 CSS 变量**——`var(--z-overlay)` / `var(--z-overlay-backdrop)` / `var(--z-dropdown)`
3. **不改各组件定位逻辑**——`position: fixed` 相对 viewport，portal 后坐标不变
4. **一个新 overlay 默认就应该 portal**——不要等到被遮挡才修

---

## 三、迁移顺序

| 优先级 | 组件 | 原因 |
|:--|:--|:--|
| 🔴 | ContextMenu | 已知遮挡 bug |
| 🟡 | ToastContainer | 已有 `var(--z-overlay)`，但 parent zIndex 封死 |
| 🟡 | ConfirmDialog | 同上 |
| 🟡 | ColorPicker | 侧栏内的取色器会被分割线遮挡 |
| 🟢 | SelectBox 下拉 | 设置页内的下拉可能被侧栏分割线截断 |

---

## 四、可能遇到的问题

### 1. 事件冒泡——和 ContextMenu 一样

所有 overlay 的关闭逻辑走 window 级事件（`mousedown`/`wheel`/`Escape`）→ portal 不影响。

### 2. 多个 overlay 同时开

**风险：** Menu → 点其中一项 → 弹 ConfirmDialog。两个都在 body 下——z-index 只靠 CSS token。

**缓解：** `var(--z-overlay-backdrop)` 500 < `var(--z-overlay)` 600。规则：backdrop 永远比面板低 100。多个面板同时开时用 z-index 递增或后开的盖前面的。

### 3. OverlayPortal 本身太简单——为什么要抽象

**风险：** `createPortal(children, document.body)` 只有一行——值得一个组件吗？

**理由：** 组件是**命名决策**。`<OverlayPortal>` 告诉下一个开发者："这是 overlay，应该在 body 下，不走 zone 层叠上下文"。如果未来需要加 overlay 计数器、焦点陷阱、ESC 栈管理——全在 OverlayPortal 里，不用追到 10 个组件的 return。

---

## 五、涉及文件

| 文件 | 改动 |
|:--|:--|
| `src/components/shared/OverlayPortal.tsx` | **新建**——`createPortal` 包装 |
| `src/components/shared/ContextMenu.tsx` | `return` → `<OverlayPortal>` |
| `src/components/ToastContainer.tsx` | `return` → `<OverlayPortal>` |
| `src/components/shared/ConfirmDialog.tsx` | `return` → `<OverlayPortal>` |
| `src/components/shared/ColorPicker.tsx` | `return` → `<OverlayPortal>` |
| `src/components/shared/SelectBox.tsx` | 下拉部分 → `<OverlayPortal>` |

**改动量：** ~8 行新组件 + ~5 处替换。

---
