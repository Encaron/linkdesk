# Z-order 弹窗与毛玻璃——E5.5#5-#6

> 📖 **来源：** [[e5-multi-webview-abandoned]] Bug 1 & Bug 2 (z-order) + Bug 7 (毛玻璃)
> [[ipc-bridge.ts:PROXY_CHANNELS]] 43 个代理通道，ContextMenu/Dialog 已在其中。

## Bug 描述

多 WebView 下，每个插件是独立的 `WebContentsView`，各自有独立的 z-order。当插件需要显示弹窗时：

1. **插件的弹窗（React 组件渲染的 HTML）被 WebContentsView 的 z-order 限制在壳之下**——用户看不到
2. **毛玻璃背景（`backdrop-filter: blur()`）只覆盖插件 WebContentsView 的区域**，不是整个壳窗口，视觉断裂

```
┌──────────────────────┐ ← 壳 WebContentsView (z: 0)
│                      │
│  ┌────────────┐      │     ← 插件 WebContentsView (z: 1)
│  │ 插件内容    │      │        被壳覆盖住——即使 CSS z-index: 9999
│  │ [弹窗] ←──看不到   │        <—— Bug 1 & 2: 弹窗在壳下面
│  │ (毛玻璃仅覆盖插件区) │        <—— Bug 7: 毛玻璃只覆盖插件 WebView 区域
│  └────────────┘      │
└──────────────────────┘
```

**根因：** WebContentsView 是 OS 级视图（Chromium 渲染后的位图），不是 HTML DOM 元素。CSS z-index 无法跨越 WebContentsView 叠加。插件弹窗的 `z-index: 9999` 只在插件自己的 WebContentsView 内部有效，对壳 WebContentsView 的位图无效。

## 方案：分两阶段

### 第 1 层——临时方案（E5.5#5）

**hack：** 弹窗打开时，把插件 WebContentsView `setVisible(false)`，让壳的同功能弹窗接管。

```typescript
// 插件弹窗打开时
window.linkdesk.contextMenu.show(items, anchor);
// ↓ IpcBridge → 壳进程
// ↓ 壳的 React 渲染壳自己的 ContextMenu 组件（z-index 壳内正常）
// ↓ 同时 setPluginViewVisible(pluginId, false) 隐藏插件 WebView
// ↓ 弹窗关闭时 setPluginViewVisible(pluginId, true) 恢复

// 优点：立即可用，代码量 ~30 行
// 缺点：切换可见性时有短暂闪烁（插入一帧黑/白）
```

### 第 2 层——OverlayWindow 根治（E5.5#26-#28）

见 [`OverlayWindow/OverlayWindow设计.md`](../OverlayWindow/OverlayWindow设计.md)。

```
┌──────────────────────┐ ← OverlayWindow (z: topmost, alwaysOnTop, transparent)
│  [ContextMenu]        │     z-order: OS 级，在所有 WebContentsView 之上
│  [Dialog]             │     透明无框——只有悬浮层内容可见
│  [毛玻璃 全屏覆盖]     │     毛玻璃覆盖整个屏幕 ✅
└──────────────────────┘
┌──────────────────────┐ ← MainWindow (z: normal)
│ 壳 + 插件 WebViews   │
└──────────────────────┘
```

## E5.5#13——对号弹窗组件也走 IPC

有些插件的**自身 UI 组件**（非 ContextMenu/Dialog 标准弹窗）需要悬浮在壳之上的场景：

- 串口监视器的浮动工具栏
- 编辑器的自动补全弹窗（Monaco 自带的 suggest widget 在插件 WebView 内，但可能被壳截断）
- 文件树的右键菜单（已走 ContextMenu IPC ✅）

**方案：**

E5.5#14-#15 逐步将 ContextMenu → Dialog → Toast → SelectBox → 其他 HTML 悬浮层全部迁移 IPC，由 OverlayWindow 渲染。

## E5.5#6——毛玻璃问题

毛玻璃是 CSS 特性（`backdrop-filter: blur()`），但只在有背景的 WebContentsView 上生效。OverlayWindow 透明无框→所有弹窗的毛玻璃在 OverlayWindow 中渲染→覆盖整个桌面区域。

**验证：**
- [ ] 弹窗/Dialog 的毛玻璃覆盖整个 MainWindow 区域（在 OverlayWindow 尺寸内）
- [ ] 点击毛玻璃区域正确关闭弹窗
- [ ] 无视觉接缝——OverlayWindow 和 MainWindow 对齐

## 验证场景

| 场景 | E5.5#5 临时 | E5.5#38-#40 OverlayWindow |
|:--|:--|:--|
| 文件树右键菜单 | ✅ 工作，有闪烁 | ✅ 无闪烁 |
| 编辑器右键菜单 | ✅ 工作，有闪烁 | ✅ 无闪烁 |
| 设置页弹窗 | ✅ 工作，有闪烁 | ✅ 无闪烁 |
| Dialog 确认框 | ✅ 工作，有闪烁 | ✅ 无闪烁 |
| 串口浮动工具栏 | 🔴 不工作——不是标准弹窗 | ✅ |
| 快速打开面板 | 🔴 不工作——需要持续显示 | ✅ |
| 拖拽到桌面 | 🔴 多 WebView 不支持 | ✅ OS 级拖拽 |

## 相关

- [[multi-webview-root-causes]] z-order 根因
- [[e5-multi-webview-abandoned]] Bug 1, 2, 7
- `electron/window-manager.ts` `setVisible` API
