# OverlayWindow 设计——E5.5#26-#40

> 📖 **对标：** VS Code 三层窗口模型——MainWindow（编辑器/侧栏/面板）+ OverlayWindow（quick pick/command palette/notifications）+ AuxiliaryWindow（浮动编辑器窗口）。
> LinkDesk 只需要两层：MainWindow + OverlayWindow。

## 问题

WebContentsView 的 z-order 是 OS 级别的位图叠加。插件的任何 CSS z-index（哪怕 99999）都无法越过壳 WebContentsView 显示。

```
┌──────────────────────┐ ← 壳 WebContentsView (z: 0)
│  [标签栏] [工具栏]    │
│  ┌────────────────┐  │ ← 插件 WebContentsView (z: 1, 在壳下面)
│  │ 插件内容        │  │
│  │  ┌─────────┐   │  │    ContextMenu 被壳的位图覆盖
│  │  │ContextMenu│   │  │    ← 看不到！
│  │  └─────────┘   │  │
│  └────────────────┘  │
└──────────────────────┘
```

## OverlayWindow 方案

创建一个**透明无框 BrowserWindow**，`alwaysOnTop`，精确叠在 MainWindow 上方。所有 HTML 悬浮层（ContextMenu/Dialog/Toast/SelectBox/OverlayPortal/毛玻璃）由 OverlayWindow 渲染。

```
┌──────────────────────┐ ← OverlayWindow (z: topmost, alwaysOnTop, transparent)
│  ┌─────────┐         │
│  │ContextMenu│        │    透明背景——只有悬浮层内容可见
│  │          │         │    毛玻璃覆盖整个窗口区域 ✅
│  └─────────┘         │
│  ┌─────────────────┐ │
│  │  Dialog 确认删除  │ │
│  └─────────────────┘ │
└──────────────────────┘
┌──────────────────────┐ ← MainWindow (z: normal)
│ 壳 + 插件 WebViews   │
└──────────────────────┘
```

## 技术实现

### 配置参数

| 参数 | 值 | 原因 |
|:--|:--|:--|
| `type` | `'overlay'` | `BrowserWindow` constructor option |
| `transparent` | `true` | 背景透明——只显示悬浮层内容 |
| `frame` | `false` | 无标题栏 |
| `resizable` | `false` | 和 MainWindow 同步尺寸 |
| `alwaysOnTop` | `true` | OS 级——在 MainWindow 上方 |
| `skipTaskbar` | `true` | 不在任务栏显示为独立窗口 |
| `focusable` | `true` | 可以接收键盘/鼠标事件（但见焦点管理） |
| `hasShadow` | `false` | 透明窗口不需要系统阴影 |
| `backgroundColor` | `#00000000` | 完全透明 |
| `webPreferences` | 同壳 preload | 访问 `window.linkdesk.*` API |

### 位置同步（E5.5#28-#29）

OverlayWindow 必须和 MainWindow 保持像素级对齐：

```typescript
mainWindow.on('move', () => {
  const [x, y] = mainWindow.getPosition();
  overlayWindow.setPosition(x, y);
});
mainWindow.on('resize', () => {
  const [w, h] = mainWindow.getSize();
  overlayWindow.setSize(w, h);
});
// 同步最小化/最大化/恢复
mainWindow.on('minimize', () => overlayWindow.minimize());
mainWindow.on('restore', () => overlayWindow.restore());
```

**Linux 注意：** `move` 事件在 Wayland 下可能不触发。需要 `setInterval` 轮询补漏。

### 坐标换算（E5.5#28）

**问题：** 插件 WebView 中 `getBoundingClientRect()` 返回相对于 WebContentsView edge 的坐标，不是相对于 MainWindow client area。应用层看到的是 WebView 内部坐标系，OverlayWindow 需要的是屏幕坐标系。

**三步换算——写死到代码注释里：**

```
步骤 1：插件 WebView 中的 getBoundingClientRect()
  → 坐标原点 = WebContentsView 的左上角 (0,0)
  → 结果：(rectX, rectY) 相对于 WebView 内部

步骤 2：WebView 内部坐标 → MainWindow client area 坐标
  → mainX = webViewBounds.x + rectX   // webViewBounds = setBounds 时传入的 x,y
  → mainY = webViewBounds.y + rectY
  → 坐标原点 = MainWindow client area 左上角 (0,0)

步骤 3：MainWindow client area → OverlayWindow 内部绝对坐标
  → OverlayWindow bounds = MainWindow.getPosition() + client area offset
  → 壳 TitleBar 拖拽区高度 = 30px（`-webkit-app-region: drag`）
  → overlayX = mainX （MainWindow 和 OverlayWindow 等大等位置——水平直接对应）
  → overlayY = mainY + 30   // 🔥 关键：OverlayWindow 包含 TitleBar 区域！
  → 坐标原点 = OverlayWindow HTML body 左上角
```

**常见错误：**
- 忘记 TitleBar 30px 偏移 → overlay 整体上移 30px
- 用 `webView.getBounds()` 而非 `setBounds` 传入的值 → WebContentsView 实际 bounds 可能有 OS 级微调
- DPI 缩放——`getBoundingClientRect` 返回 CSS 像素，`getPosition` 返回屏幕像素 → 在 devicePixelRatio ≠ 1 时需换算：`screenX = mainX * devicePixelRatio`

### 焦点管理（E5.5#31-#32）

**核心原则：OverlayWindow 只在有悬浮层时获取焦点。**

```typescript
// 状态机
type OverlayState = 'idle' | 'active' | 'hiding';

class OverlayWindowManager {
  private _state: OverlayState = 'idle';
  private _activeOverlays: Set<string> = new Set();

  // 显示弹窗时
  showOverlay(type: string, props: any) {
    this._activeOverlays.add(generateId());
    if (this._state === 'idle') {
      overlayWindow.show();        // 显示（但不 steal focus）
      overlayWindow.focus();       // OverlayWindow 获取焦点
      mainWindow.blur();           // MainWindow 失去焦点
      this._state = 'active';
    }
    // 发送 IPC 到 OverlayWindow 的 preload
    overlayWindow.webContents.send('overlay:show', { type, props });
  }

  // 弹窗关闭时
  hideOverlay(id: string) {
    this._activeOverlays.delete(id);
    if (this._activeOverlays.size === 0) {
      this._state = 'hiding';
      overlayWindow.webContents.send('overlay:hideAll');
      // 短暂延迟后隐藏窗口
      setTimeout(() => {
        if (this._activeOverlays.size === 0) {
          overlayWindow.hide();
          mainWindow.focus();      // 焦点回到 MainWindow
          this._state = 'idle';
        }
      }, 100);
    }
  }
}
```

**关键 bug 防御：** OverlayWindow 的 `blur` 事件 → 所有悬浮层关闭（点击 OverlayWindow 外的桌面区域时）。

### 点击穿透 vs 事件处理

OverlayWindow 的 HTML body 需要特殊处理：

```css
/* OverlayWindow 的 CSS——仅由 OverlayWindow 预加载 */
html, body {
  background: transparent !important;
  pointer-events: none;  /* 透明区域不响应点击——让事件透过到下层 */
}

.overlay-container {
  pointer-events: auto;  /* 弹窗区域响应点击 */
}
```

`pointer-events: none` 让点击透明区域的事件透过到 MainWindow。
- ✅ 悬浮层外的点击 → 穿过 OverlayWindow → 到达 MainWindow
- ✅ 悬浮层内的点击 → 由 OverlayWindow 处理
- ✅ 毛玻璃（`.overlay-backdrop`）→ 全屏 `pointer-events: auto` → 点击关闭

### 分屏拖拽毛玻璃（E5.5#35-#36）

拖拽标签页/分屏时显示的半透明占位：

```typescript
// 壳 WebView 开始拖拽 → IPC 到 OverlayWindow
ipcBridge.sendToOverlay('overlay:dragGhost', {
  bounds: { x, y, width, height },
  opacity: 0.5,
  pluginId: 'my-plugin',
});
```

OverlayWindow 在指定位置绘制半透明矩形。

**60fps 策略——不是每帧发 IPC：**
Electron IPC 序列化往返 ~1-3ms。`mousemove` 事件 ~60-120Hz。每帧都发 IPC = 主进程积压。

```typescript
// 壳侧——拖拽时（requestAnimationFrame 节流 + 跳过重复坐标）
let _lastSentCoord = '';
let _rafPending = false;
const onDragMouseMove = (e: MouseEvent) => {
  const key = `${Math.round(e.clientX)},${Math.round(e.clientY)}`; // 取整——像素级够用
  if (key === _lastSentCoord) return;          // 跳过重复帧（鼠标静止）
  _lastSentCoord = key;
  if (_rafPending) return;                      // 跳过——等上一帧 IPC 返回
  _rafPending = true;
  requestAnimationFrame(() => {
    _rafPending = false;
    overlayWindow.webContents.send('overlay:dragGhost', {
      x: Math.round(e.clientX),                 // 整数坐标——减少序列化开销
      y: Math.round(e.clientY),
    });
  });
};
```

**效果：** 实际 IPC 频率 ~30-60fps（取决于 rAF 节奏 + 跳过重复帧），视觉流畅不拖尾。

**OverlayWindow 侧——不要用 React setState 每帧重渲染：** 用 DOM 直操作 `style.left/top` 避免 React diff 开销。毛玻璃是纯 `<div>` 定位，不需要 React 生命周期。

### 跨平台适配（E5.5#34）

| 平台 | 注意事项 |
|:--|:--|
| **Windows** | 透明窗口性能好。`alwaysOnTop: 'screen-saver'` 级别防止被其他应用覆盖 |
| **macOS** | `transparent: true` + `frame: false` → 需要 `titleBarStyle: 'hidden'`。`alwaysOnTop: 'floating'` 级别。⚠️ `setIgnoreMouseEvents(true, { forward: true })` 需要 `com.apple.security.cs.disable-library-validation` entitlement + `webPreferences: { sandbox: false }`，否则 `forward: true` 静默失效——鼠标事件不穿透到 MainWindow |
| **Linux** | 透明窗口在 X11/Wayland 间差异大。Wayland 不支持 `setAlwaysOnTop`。降级方案：右键菜单回退到 `Menu.buildFromTemplate().popup()`（Electron 原生 API，零额外依赖） |

## E5.5 任务分解

| 任务 | 内容 | 行数 |
|:--|:--|:--|
| E5.5#26 | 创建 OverlayWindow + 基础配置 | ~80 |
| E5.5#27 | OverlayWindow preload 脚本（同壳 preload） | ~30 |
| E5.5#28 | 位置同步——move/resize 事件监听 | ~40 |
| E5.5#29 | 最小化/最大化/恢复同步 | ~20 |
| E5.5#30 | pointer-events CSS 策略（穿透/响应） | ~15 |
| E5.5#31 | 焦点状态机——OverlayWindowManager | ~80 |
| E5.5#32 | blur 事件→关闭所有悬浮层 | ~15 |
| E5.5#33 | OverlayWindow React 渲染入口（壳级组件） | ~40 |
| E5.5#34 | 跨平台适配——Windows/macOS/Linux | ~30 |
| E5.5#35 | 分屏拖拽毛玻璃 IPC | ~25 |
| E5.5#36 | 拖拽坐标换算（OverlayWindow 坐标系 vs MainWindow 坐标系） | ~15 |
| E5.5#37 | 迁移 ContextMenu → OverlayWindow（从壳 WebView 切到 OverlayWindow） | ~20 |
| E5.5#38 | 迁移 Dialog → OverlayWindow | ~15 |
| E5.5#39 | 迁移 Toast → OverlayWindow | ~15 |
| E5.5#40 | 迁移 SelectBox/OverlayPortal → OverlayWindow | ~20 |

**总计：~460 行**

## 风险和降级

### 风险 1：性能——透明窗口渲染
- Windows 透明窗口性能好（Aero Glass 合成器）
- macOS 透明窗口正常
- Linux 降级：Wayland 可能不支持透明窗口 → 不透明白色窗口 + 提示用户

### 风险 2：焦点竞争
- OverlayWindow 获取焦点 → MainWindow 失去焦点 → 编辑器光标闪烁停止
- **缓解：** 只在有悬浮层时 OverlayWindow 获取焦点；悬浮层关闭立即归还

### 风险 3：alwaysOnTop 被其他应用覆盖
- Windows: `alwaysOnTop: 'screen-saver'` 级别（最高）
- macOS: `alwaysOnTop: 'floating'` 级别
- 如果另一个应用也是 `alwaysOnTop` → z-order 竞争，无完美解法

### 风险 4：Linux Wayland
- Wayland 窗口协议不支持 `setAlwaysOnTop`
- **降级方案：** 回到 `setVisible(false)` 临时方案（E5.5#5）

## 相关

- VS Code `src/vs/platform/window/electron-main/window.ts` — `IWindowService`
- [WindowManager.ts](linkdesk/electron/window-manager.ts) — 现有窗口管理
- [IpcBridge.ts](linkdesk/electron/ipc-bridge.ts) — IPC 通信
