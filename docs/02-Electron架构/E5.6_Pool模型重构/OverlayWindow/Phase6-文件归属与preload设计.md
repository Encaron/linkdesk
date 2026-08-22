# Phase 6 文件归属 + preload 设计

> 2026-08-12。E5.6#21.5。在写第一行代码前定文件位置——对标 #36k（core/data/ 拆分前未定目录→后期大规模迁移）的教训。

---

## 1. 文件归属（E5.6#21.5a）

### 1.1 新建文件清单（11 个文件）

```
主进程（electron/，3 个）：
  electron/overlay-window.ts          — OverlayWindow 类——create/destroy/sync/manage
  electron/preload-overlay.ts         — OverlayWindow preload——最小 API 表面
  overlay.html                        — OverlayWindow HTML 壳（项目根目录，对标 pool.html）

OverlayWindow React 应用（src/overlay/，8 个）：
  src/overlay/overlay-main.tsx        — React 入口（对标 src/pool/pool-main.tsx）
  src/overlay/components/
    OverlayContextMenu.tsx             — 右键菜单渲染
    OverlayCommandPalette.tsx          — 命令面板渲染
    OverlayToast.tsx                   — Toast 通知渲染
    OverlayDialog.tsx                  — Dialog 弹窗渲染
    OverlaySelectBox.tsx               — SelectBox 下拉渲染
    OverlayModal.tsx                   — Modal 容器（#24.5）
    SplitLines.tsx                     — 分屏/面板间分割线渲染
```

### 1.2 不新建的文件——复用已有机制

| 需求 | 实现位置 | 说明 |
|------|----------|------|
| 壳侧 overlay 请求入口 | `preload-shell.ts` 加 `overlay` 命名空间 | `linkdesk.overlay.show(type, payload)`——不是 React 组件，是 API 调用 |
| Pool 侧 overlay 请求入口 | `preload-pool.ts` 加 `overlay` 命名空间 | 同 API，Pool 内调 `linkdesk.overlay.show()` → IPC → 壳中继 → OverlayWindow |
| 壳侧 IPC 中继 | `ipc-bridge.ts` 加 `overlay:*` 通道 | 对标已有 PROXY_CHANNELS 30 个通道——加 `overlay:forward` |

### 1.3 `src/overlay/` 目录定义

对标 `src/pool/`：
- `pool-main.tsx` 是 Pool WebContentsView 的 React 入口 → `overlay-main.tsx` 是 OverlayWindow BrowserWindow 的 React 入口
- 两者都是壳代码，都在各自的独立 JS 上下文中运行
- 壳目录规范新增条目（见 §4）

### 1.4 Vite 构建变更

`vite.config.ts` `rollupOptions.input` 加一行：
```typescript
overlay: resolve(__dirname, "overlay.html"),
```

---

## 2. 命名冲突——OverlayPortal.tsx（E5.6#21.5a 末尾）

### 现状

| 文件 | 机制 | 解决的问题 |
|------|------|-----------|
| E5#96 `src/components/shared/OverlayPortal.tsx` | React `createPortal` → `document.body` | 同一 DOM 内 z-index 层叠上下文 |
| Phase 6 OverlayWindow | 独立透明 BrowserWindow | 跨 WebContentsView 裁剪 |

**同名不同物，分属不同架构层。**

### 决策：重命名 E5#96 OverlayPortal → ShellPortal

```
src/components/shared/OverlayPortal.tsx  →  src/components/shared/ShellPortal.tsx
```

理由：
1. `ShellPortal` 准确描述其功能——portal 到壳 DOM 的 `document.body`
2. 释放 `Overlay*` 前缀给 Phase 6 专用（`OverlayWindow` / `OverlayContextMenu` / `OverlayModal`）
3. 3 处 import 需更新（grep 确认）

### ShellPortal 的最终命运

Phase 6 完成后（#24.6），所有浮层迁入 OverlayWindow。此时 grep `ShellPortal` import——如果只剩 0 处引用 → 删除文件。如果仍有同 Pool 内 z-index 场景（不跨进程的 tooltip 等）→ 保留。

---

## 3. preload-overlay.ts API 设计（E5.6#21.5b）

### 3.1 设计原则

**OverlayWindow = 哑渲染器。** 对标 Pool 的 Path B 哲学——不执行业务逻辑，不知道渲染的内容是什么。

### 3.2 暴露的 API（contextBridge 白名单）

```typescript
// ── 生命周期 ──
overlay.ready()                                      // 就绪信号。调用前所有命令入缓冲

// ── Shell → OverlayWindow 渲染命令 ──
overlay.onCommand(cb: (cmd: OverlayCommand) => void)  // 接收渲染命令
//   OverlayCommand = { type: "context-menu" | "command-palette" | "toast" | "dialog"
//                           | "selectbox" | "colorpicker" | "modal" | "split-lines"
//                           | "dismiss",
//                      payload: unknown }

// ── 主题 / 语言（只读——OverlayWindow 被动接收） ──
events.on("theme:changed", cb)                       // CSS 变量注入（对标 preload-pool）
events.on("lang:changed", cb)                        // i18n 语言切换
```

### 3.3 不需要的 API

| 不需要 | 理由 |
|--------|------|
| `filesystem` | OverlayWindow 不读写文件 |
| `tabs` | OverlayWindow 没有标签页 |
| `commands` | OverlayWindow 不执行命令——它只渲染菜单项，点击回传 `commandId` |
| `workspace` | 不需要知道工作区状态 |
| `clipboard` | 不需要 |
| `serial` / `configuration` / `keybindings` | 不需要 |

### 3.4 缓冲回放——防 IPC 早于 React mount 竞态

对标 `preload-pool.ts` 的 `_layoutBuffer` + `onLayout` 模式：

```typescript
// preload-overlay.ts
const _commandBuffer: OverlayCommand[] = [];
let _onCommandCallback: ((cmd: OverlayCommand) => void) | null = null;
let _ready = false;

// overlay.onCommand(cb)——React mount 时注册
// 如果已有缓冲命令 → 立即回放
// overlay.ready()——标记就绪，之后命令直接推 cb，不入缓冲
```

未来 → E5.6#67 `IpcRelay<T>` 归一化。

---

## 4. 壳侧 overlay 桥设计（E5.6#21.5c）

### 4.1 不是 React 组件

壳侧 overlay 桥 = `linkdesk.overlay.show()` API——在 `preload-shell.ts` 和 `preload-pool.ts` 中暴露。不是新的 React 组件。

### 4.2 调用链路

```
Pool/Shell 代码:
  linkdesk.overlay.show("context-menu", { menuId, anchor, context })
    ↓
preload-shell.ts overlay.show():
  ipcRenderer.invoke('overlay:forward', { type, payload })
    ↓
ipc-bridge.ts:
  overlayWindow.webContents.send('overlay:render', { type, payload })
    ↓
preload-overlay.ts:
  _onCommandCallback({ type, payload })
    ↓
overlay-main.tsx:
  setOverlayState({ type, payload })  → 渲染对应容器 + setIgnoreMouseEvents(false)
```

### 4.3 与 E5#96 ShellPortal 的关系

```
E5#96 ShellPortal.tsx（原 OverlayPortal.tsx）
  → React createPortal 到 document.body
  → Phase 6 过渡期仍有用：同 Pool 内的 tooltip/小浮层不需要跨进程
  → 长远看大部分场景被 OverlayWindow 覆盖，#24.6 决定去留

Phase 6 linkdesk.overlay.show()
  → IPC → OverlayWindow BrowserWindow
  → 所有跨 Pool 边界 + 壳级浮层的唯一入口
  → 归一化：加新 overlay 类型 = 加 type 枚举值 + OverlayWindow 侧加一个容器组件
```

---

## 5. 壳目录规范更新

`docs/开发管理/壳目录规范.md` 新增 `src/overlay/` 条目：

```markdown
## 5. `src/overlay/`——OverlayWindow 渲染层（BrowserWindow 内）

| 子目录 | 语义 | 放什么 |
|--------|------|--------|
| 根目录 | 入口 | `overlay-main.tsx`——接收 overlay:render IPC 命令，渲染对应浮层容器 |
| `components/` | OverlayWindow 专属渲染组件 | OverlayContextMenu, OverlayCommandPalette, OverlayToast, OverlayDialog, OverlaySelectBox, OverlayModal, SplitLines |

**原则：OverlayWindow 是哑渲染器——不执行业务逻辑，不知道渲染的内容是什么意思。对标 Pool 的 Path B。**
```

---

## 验证清单

- [ ] 所有 11 个文件位置已定，不出现"写到一半不知道放哪"
- [ ] `src/overlay/` 加入壳目录规范
- [ ] 命名冲突已解决——`OverlayPortal.tsx` → `ShellPortal.tsx`
- [ ] `preload-overlay.ts` API 清单完整——最小表面，不含不需要的命名空间
- [ ] 壳侧 overlay 桥不是新 React 组件——是 `linkdesk.overlay.show()` API
- [ ] 对标 `pool.html` → `pool-main.tsx` 的同构模式清晰——`overlay.html` → `overlay-main.tsx`
