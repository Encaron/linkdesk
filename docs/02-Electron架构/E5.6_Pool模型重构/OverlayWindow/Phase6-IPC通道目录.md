# Phase 6 IPC 通道目录——Shell↔OverlayWindow

> 2026-08-12。E5.6#21.6。对标 #11.5（preload-pool.ts `window.linkdesk.*` 缺口——API 表面不完整导致后期补丁）的教训。
> 在写 `overlay-window.ts` 第一行代码前，先把所有 IPC 消息列清楚。

---

## 1. 架构——两条物理通道，N 种逻辑消息

### 1.1 为什么不用多通道

PROXY_CHANNELS 用独立通道（`config:get`、`tabs:create`...）因为每种通道有不同的参数/返回值/广播语义。但 OverlayWindow 的所有交互是同构的——"渲染某个浮层 → 用户操作 → 回传结果"。

加新浮层类型 = 加一个 `type` 枚举值，不是加一个 IPC channel。

### 1.2 两条物理通道

```
通道 1：overlay:render          Shell/Pool → 主进程 → OverlayWindow
  载荷：{ requestId: string, type: OverlayType, payload: unknown }
  方向：单向（fire-and-forget）

通道 2：overlay:result          OverlayWindow → 主进程 → Shell
  载荷：{ requestId: string, type: OverlayType, result: unknown }
  方向：单向（fire-and-forget）
```

`requestId` 用于关联请求和响应——和 PROXY_CHANNELS 的 `requestId` 同一模式。

### 1.3 与 PROXY_CHANNELS 的关系

PROXY_CHANNELS 不会新增 overlay 通道。`overlay:render` 和 `overlay:result` 不加入 PROXY_CHANNELS——它们不是 "Pool → Shell" 的业务请求，是 "任何渲染进程 → OverlayWindow" 的渲染命令。

主进程对 `overlay:render` 的处理：直接中继到 `overlayWindow.webContents.send()`——不经过 IpcBridgeHandler。

---

## 2. Shell → OverlayWindow（overlay:render）——渲染命令

### 2.1 OverlayType 枚举

```typescript
type OverlayType =
  // ── 瞬时浮层（用户操作后立即关闭） ──
  | "context-menu"       // 右键菜单
  | "command-palette"    // 命令面板（Ctrl+Shift+P）
  | "selectbox"          // SelectBox 下拉
  | "colorpicker"        // 取色器
  | "hamburger-menu"     // 汉堡菜单 / TitleBar 下拉
  // ── 持续浮层（需显式关闭） ──
  | "toast"              // Toast 通知（自动消失或手动关）
  | "dialog"             // Dialog 弹窗（确认/取消）
  // ── 持久容器（Modal） ──
  | "modal"              // Modal 容器——设置/市场/主题制作器
  // ── 系统（非用户触发） ──
  | "split-lines"        // 分屏/面板间分割线
  | "dismiss"            // 关闭当前 overlay（ESC / 外部点击 / 壳主动关）
```

### 2.2 每种类型的 payload

| type | payload | 说明 |
|------|---------|------|
| `context-menu` | `{ menuId: string, anchor: { x: number, y: number }, context: Record<string, unknown> }` | `menuId` 预注册菜单 ID；`anchor` 屏幕坐标；`context` 透传到命令 handler |
| `command-palette` | `{ anchor?: { x: number, y: number } }` | 可选锚点——不传则居中 |
| `selectbox` | `{ options: Array<{ label: string, value: string }>, selectedValue?: string, anchor: { x: number, y: number, width: number, height: number } }` | 下拉定位在触发元素下方 |
| `colorpicker` | `{ currentColor?: string, anchor: { x: number, y: number } }` | |
| `hamburger-menu` | `{ menuId: string, anchor: { x: number, y: number }, context?: Record<string, unknown> }` | 同 context-menu，复用 menu:registerItems |
| `toast` | `{ message: string, severity: "error" \| "warning" \| "info" \| "success", duration?: number, source?: string }` | `duration` 默认 3000ms，0 = 不自动消失 |
| `dialog` | `{ type: "confirm" \| "alert" \| "prompt", title: string, message: string, confirmLabel?: string, cancelLabel?: string }` | |
| `modal` | `{ pluginId: string, viewId?: string, title?: string, width?: number, height?: number }` | `pluginId` + `viewId` → 渲染插件视图；不传 viewId → 渲染插件默认入口 |
| `split-lines` | `{ lines: Array<{ orientation: "horizontal" \| "vertical", x: number, y: number, width: number, height: number }> }` | 壳 syncLayout 时一并推分割线位置 |
| `dismiss` | `{}` | 无参数——关闭当前活跃的 overlay |

---

## 3. OverlayWindow → Shell（overlay:result）——用户操作结果

### 3.1 ResultType 枚举

```typescript
type OverlayResultType =
  | "menu-selected"       // 用户点击了菜单项
  | "palette-selected"    // 用户选了命令面板项
  | "selectbox-selected"  // 用户选了 SelectBox 项
  | "colorpicker-selected" // 用户选了颜色
  | "dialog-result"        // Dialog 确认/取消
  | "modal-dock"          // Modal 的 "Dock to Main" 按钮
  | "dismissed"           // 用户按 ESC / 外部点击关闭
```

### 3.2 每种类型的 result

| type | result | 壳侧处理 |
|------|--------|----------|
| `menu-selected` | `{ menuId: string, commandId: string, context: Record<string, unknown> }` | `executeCommand(commandId, undefined, ...Object.values(context))` |
| `palette-selected` | `{ commandId: string }` | `executeCommand(commandId)` |
| `selectbox-selected` | `{ value: string }` | 调用方 Promise resolve |
| `colorpicker-selected` | `{ color: string }` | 调用方 Promise resolve |
| `dialog-result` | `{ confirmed: boolean, inputValue?: string }` | 调用方 Promise resolve |
| `modal-dock` | `{ pluginId: string, viewId?: string }` | `tabs:create` → MainPool docked 标签页 |
| `dismissed` | `{ type: OverlayType }` | 调用方 Promise resolve(undefined)；重新开启鼠标穿透 |

---

## 4. 主进程中继通道（E5.6#21.6c）

### 4.1 为什么需要中继

OverlayWindow 是独立 BrowserWindow。Pool 的 WebContentsView 无法直接 `postMessage` 到它。必须经过主进程。

### 4.2 中继逻辑

```typescript
// ── 壳侧 / Pool 侧 → OverlayWindow ──
// preload-shell.ts / preload-pool.ts:
ipcRenderer.send('overlay:forward-to-overlay', { requestId, type, payload });

// ipc-bridge.ts 或 main.ts:
ipcMain.on('overlay:forward-to-overlay', (_event, msg) => {
  overlayWindow.webContents.send('overlay:render', msg);
});

// ── OverlayWindow → 壳侧 ──
// preload-overlay.ts:
ipcRenderer.send('overlay:forward-to-shell', { requestId, type, result });

// ipc-bridge.ts 或 main.ts:
ipcMain.on('overlay:forward-to-shell', (_event, msg) => {
  mainWindow.webContents.send('overlay:result', msg);
});
```

两个中继通道：`overlay:forward-to-overlay` 和 `overlay:forward-to-shell`。命名区分方向，不会混淆。

### 4.3 主进程中继不经过 IpcBridgeHandler

IpcBridgeHandler 是壳侧 React 层的处理器——注册在 `initIpcBridgeHandler()` 中。OverlayWindow IPC 是纯中继——不涉及 CommandRegistry / ConfigurationService 等壳服务。直接 `webContents.send()` 即可。

---

## 5. 封装函数（E5.6#21.6d）

### 5.1 API

```typescript
// preload-shell.ts + preload-pool.ts 暴露:
linkdesk.overlay.show(type: OverlayType, payload: unknown): Promise<OverlayResult | undefined>
```

### 5.2 实现

```typescript
// preload-shell.ts overlay.show():
const _pendingOverlays = new Map<string, { resolve: Function, timer: ReturnType<typeof setTimeout> }>();

async function show(type: string, payload: unknown): Promise<unknown> {
  const requestId = `overlay-${++_overlaySeq}-${Date.now()}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pendingOverlays.delete(requestId);
      reject(new Error(`[overlay] 超时: ${type}`));
    }, 30_000); // 30s 超时——Modal 可能需要长时间打开，瞬时浮层 5s 足够但统一 30s

    _pendingOverlays.set(requestId, { resolve, timer });
    ipcRenderer.send('overlay:forward-to-overlay', { requestId, type, payload });
  });
}

// 壳侧监听 overlay:result：
ipcRenderer.on('overlay:result', (_event, { requestId, type, result }) => {
  const pending = _pendingOverlays.get(requestId);
  if (!pending) return;
  clearTimeout(pending.timer);
  _pendingOverlays.delete(requestId);
  pending.resolve({ type, ...result });
});
```

### 5.3 调用示例

```typescript
// Pool 内——右键文件树
const result = await linkdesk.overlay.show("context-menu", {
  menuId: "explorer/context",
  anchor: { x: e.screenX, y: e.screenY },
  context: { filePath: "/path/to/file.ts", isDirectory: false },
});
// result = { type: "menu-selected", commandId: "explorer.openFile", context: { filePath: "..." } }

// 壳内——Toast
linkdesk.overlay.show("toast", { message: "保存成功", severity: "success" });
// 不 await——Toast 不需要结果

// 壳内——Dialog 确认
const result = await linkdesk.overlay.show("dialog", {
  type: "confirm",
  title: "删除文件",
  message: "确定要删除吗？",
});
// result = { type: "dialog-result", confirmed: true }
```

---

## 6. 请求→渲染→回调 闭环清单

| Overlay 类型 | 打开方式 | 渲染位置 | 用户操作 | 回调 | Promise resolve |
|-------------|---------|---------|---------|------|----------------|
| context-menu | `show("context-menu", ...)` | `OverlayContextMenu.tsx` | 点击菜单项 / 外部点击 / ESC | `menu-selected` / `dismissed` | `{ commandId, context }` |
| command-palette | `show("command-palette")` | `OverlayCommandPalette.tsx` | 选命令 / ESC | `palette-selected` / `dismissed` | `{ commandId }` |
| selectbox | `show("selectbox", ...)` | `OverlaySelectBox.tsx` | 选项 / 外部点击 / ESC | `selectbox-selected` / `dismissed` | `{ value }` |
| colorpicker | `show("colorpicker", ...)` | `OverlayColorPicker.tsx` | 选色 / 外部点击 / ESC | `colorpicker-selected` / `dismissed` | `{ color }` |
| hamburger-menu | `show("hamburger-menu", ...)` | 复用 `OverlayContextMenu.tsx` | 同 context-menu | `menu-selected` / `dismissed` | 同 context-menu |
| toast | `show("toast", ...)` | `OverlayToast.tsx` | 自动消失 / 手动关 | — | `undefined`（fire-and-forget） |
| dialog | `show("dialog", ...)` | `OverlayDialog.tsx` | 确认/取消 | `dialog-result` | `{ confirmed }` |
| modal | `show("modal", ...)` | `OverlayModal.tsx` | Dock to Main / 关闭 | `modal-dock` / `dismissed` | `{ pluginId, viewId }` |
| split-lines | 壳 `syncLayout` 时自动推 | `SplitLines.tsx` | 拖拽分割线 | —（鼠标事件直连主进程 resize） | `undefined`（fire-and-forget） |
| dismiss | `show("dismiss")` | — | — | — | 关闭当前活跃 overlay |

---

## 7. 通道命名总表

| 物理通道 | 方向 | 载荷 |
|----------|------|------|
| `overlay:forward-to-overlay` | 任何渲染进程 → 主进程 → OverlayWindow | `{ requestId, type: OverlayType, payload }` |
| `overlay:forward-to-shell` | OverlayWindow → 主进程 → 壳 | `{ requestId, type: OverlayResultType, result }` |
| `overlay:render` | 主进程内部（webContents.send） | 同上 channel 1 |
| `overlay:result` | 主进程内部（webContents.send） | 同上 channel 2 |

不新增 PROXY_CHANNELS 条目。不经过 IpcBridgeHandler。

---

## 验证清单

- [ ] 13 种 OverlayType 覆盖所有浮层需求（瞬时 5 + 持续 2 + 持久 1 + 系统 2 = 10 种 type）
- [ ] 7 种 OverlayResultType 覆盖所有用户操作
- [ ] 每种 type 的请求→渲染→用户操作→回调闭环完整
- [ ] 与 PROXY_CHANNELS 无冲突（`overlay:` 前缀不重叠）
- [ ] `linkdesk.overlay.show()` 一行 API——调用方不追踪 4 跳链路
- [ ] 加新浮层类型 = 加 `type` 枚举值 + OverlayWindow 侧加一个容器组件——不加 channel
