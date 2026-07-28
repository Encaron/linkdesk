# v1.3.0 — 可拖出标签页（悬浮窗类型 A）

> **类型：壳级别** | 前置：v1.2.x 最新 PATCH

---

## 做什么

对标 VS Code：把编辑器标签页拖出壳窗口 → 自动变成独立 OS 窗口 → 拖回来 → 自动并回去。

技术原理：Electron `WebContentsView` 不绑定创建它的 `BrowserWindow`——可以跨窗口转移。`webContents` 全程不变——JS 堆、IPC 通道、React 状态全部保留。

```
┌─ 壳窗口 ──────────────┐     ┌─ 独立窗口 ────────┐
│  [标签1] [标签2]      │     │  串口监视器        │
│                       │     │                    │
│  拖标签2 →            │ →  │  ┌──────────────┐  │
│  到壳外               │     │  │ 终端内容      │  │
│                       │     │  │              │  │
│                       │     │  └──────────────┘  │
└───────────────────────┘     └────────────────────┘
        拖回来 → 自动并回壳窗口
```

---

## 核心 API（WindowManager 扩展）

```typescript
// 拖出
detachPluginView(pluginId: string): BrowserWindow
// 从壳拆下 WebContentsView → 挂到新 BrowserWindow

// 拖回
attachPluginView(pluginId: string, floatWindow: BrowserWindow): void
// 从浮窗拆下 → 挂回壳 → 销毁空浮窗
```

---

## 任务清单

| # | 任务 | 行数 |
|:--:|------|:--:|
| A1 | `WindowManager.detachPluginView()` | ~60 |
| A2 | `WindowManager.attachPluginView()` | ~40 |
| A3 | 拖拽手势——边界检测 + detach 阶段 | ~50 |
| A4 | 右键菜单——"在新窗口中打开"/"并回主窗口" | ~30 |
| A5 | 浮窗生命周期——关闭浮窗不退出软件 | ~30 |
| A6 | 布局持久化——记录浮窗位置/大小 | ~50 |
| **合计** | | **~260 行** |

## 对插件的影响

**零。** 插件不知道自己在哪个窗口里渲染——还是同一个 React 组件。
