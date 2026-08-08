# 03-键盘路由——before-input-event 全局拦截

> E5.5#7 Phase 4。2026-08-08。

## 问题

多 WebView 下，Electron 键盘事件只发给聚焦的 `WebContentsView`。插件 WebView 聚焦时，壳的 `window.addEventListener("keydown", ...)` 收不到任何键盘事件。

**影响：**
- 全局快捷键（`Ctrl+Shift+P` 命令面板、`Ctrl+K Ctrl+T` 换主题等）全部失效
- Chord 状态机停摆——`_chordState` 在壳 keydown handler 里，壳收不到事件 = 永不进入 chord 状态
- `KeybindingRegistry` 的所有 `window.addEventListener("keydown", handler, true)` 都不触发

**⚠️ 已知限制——本方案是"半修复"：** 快捷键能触发（主进程 `before-input-event` 拦截 → IPC 转发壳 → 命令执行），但命令面板/QuickPick/主题选择器等弹窗在壳 HTML 中渲染，被插件 `WebContentsView` 的原生 Z-order 盖在后面。**键盘可操作（↑↓ Enter Esc），视觉不可见。** E5.5#26 OverlayWindow 将弹窗画在独立透明窗口 → 根治。详见 E5.5#5（Bug 1）。

## 方案

主进程 `before-input-event` 在所有 WebContents（壳 + 插件 View）上拦截键盘 → 同步查表 → 命中快捷键则 `preventDefault` + 转发壳执行。

```
插件 WebView 聚焦 → 用户按 Ctrl+K
  → view.webContents.on('before-input-event') 拦截（主进程，同步）
  → keyCache.chordPrefixes.has("ctrl+k") → true → event.preventDefault()
  → mainWindow.webContents.send('keyboard:executeShortcut', input) （异步）
  → 壳接收 → 喂 KeybindingRegistry → 进入 chord 状态
  → 状态栏显示 "(Ctrl+K) 已按下，正在等待第二键…"
  → 用户按 Ctrl+T → 同上拦截 → 壳解析 "ctrl+k ctrl+t" → 执行命令
```

## 关键决策——Chord 状态机在主进程

壳 chord 状态（`_chordState.isPending`）在 `window.addEventListener("keydown")` handler 里。插件 WebView 聚焦时此 handler 不跑——必须主进程自己维护 chord 状态。

壳同步快捷键信息时一并同步 chord 元数据。主进程据此判断：
- 当前 key 是 chord 前缀 → `preventDefault` + 转发 + 进入 chord 等待
- Chord 等待中 + 第二键到达 → `preventDefault` + 转发完整 chord
- Chord 等待中 + 2s 超时 → 清除状态，不通知（壳自己也有 2s 超时）

**双端 2s 超时同步风险：** 主进程和壳的 `CHORD_TIMEOUT` 必须同值。主进程超时清状态后，壳可能还在等——此时壳侧超时清状态是空操作（已经是空的）。无副作用。

## 架构——4 步

### Step 1：新建 `electron/keyboard-router.ts`

```
initKeyboardRouting(mainWindow, pluginViewRegistry)
  → mainWindow.webContents.on('before-input-event', ...)
  → 每个 pluginView.webContents.on('before-input-event', ...)
  → 维护 keyCache + chordState
  → 命中 → preventDefault + send('keyboard:executeShortcut')
  → 未命中 → 放行
```

`keyCache` 结构：
```typescript
{
  knownShortcuts: Set<string>,   // "ctrl+shift+p", "ctrl+w", ...
  chordPrefixes: Set<string>,    // "ctrl+k", "ctrl+shift+e", ...
  chordCombos: Set<string>,      // "ctrl+k ctrl+t", "ctrl+k ctrl+l", ...
}
```

Chord 状态机：
```typescript
let _chordState: { isPending: false } | { isPending: true; firstKey: string; timer: NodeJS.Timeout } = { isPending: false };
const CHORD_TIMEOUT = 2000; // 与壳 KeybindingRegistry.CHORD_TIMEOUT 同值
```

### Step 2：壳→主进程同步快捷键表

IPC：`ipcMain.handle('keyboard:syncShortcuts', (_, data: KeybindingSyncData) => { ... })`

`preload-shell.ts` 端：
- `KeybindingRegistry` mount 后 → `getAllKeybindings()` → 构建 `KeybindingSyncData` → `ipcRenderer.invoke('keyboard:syncShortcuts', data)`
- 用户自定义快捷键后 → 重同步

`KeybindingSyncData`：
```typescript
{
  shortcuts: string[],       // 所有非 chord keybinding 的 accelerator
  chordPrefixes: string[],  // 所有 chord 第一键
  chordCombos: string[],    // 所有完整 chord accelerator（如 "ctrl+k ctrl+t"）
}
```

**注意：** `keyboardEventToKeyString` 在主进程也需要可用。当前它依赖 `KeyboardEvent`（`e.ctrlKey` / `e.key` 等）→ 解耦为接受纯数据参数 `{ ctrlKey, shiftKey, altKey, metaKey, key, code }` → 主进程和壳侧共用。

### Step 3：壳接收转发

`preload-shell.ts`：
```typescript
ipcRenderer.on('keyboard:executeShortcut', (_event, input: KeyboardInput) => {
  // input = { ctrlKey, shiftKey, altKey, metaKey, key, code, type: 'keydown' }
  KeybindingRegistry.handleForwardedKeyEvent(input);
});
```

`KeybindingRegistry.handleForwardedKeyEvent(input)`：
- 行为等同于 `handleKeyEvent` 但不读 `KeyboardEvent`（读纯数据 input）
- `keyboardEventToKeyString` 接受纯数据参数
- Chord 状态机正常运转（壳自己有 `_chordState`）

### Step 4：注册时机

`electron/main.ts`：
```typescript
// PluginViewRegistry + WindowManager 初始化完成后
import { initKeyboardRouting } from './keyboard-router';
initKeyboardRouting(mainWindow, pluginViewRegistry);
```

`preload-shell.ts`：
```typescript
// KeybindingRegistry.ensureRegistered() 完成后
const data = buildKeybindingSyncData();
ipcRenderer.invoke('keyboard:syncShortcuts', data);
```

## 附带修复——i18next `{{display}}` 插值

`StatusBar.tsx:99-100` 的 chord 消息：
```typescript
// 当前——{{display}} 在 i18next v26 可能不插值
setChordLabel(t("({{display}}) 已按下，正在等待第二键…", { display }));

// 修复——chord 显示不走 i18n，按键名是技术标识符
setChordLabel(`(${display}) 已按下，正在等待第二键…`);
```

同样修复 `StatusBar.tsx:105` 的错误提示。

## 验证清单

1. 插件 WebView 聚焦 → `Ctrl+Shift+P` → 命令面板弹出
2. 插件 WebView 聚焦 → `Ctrl+K Ctrl+T` → 命令面板/主题选择器弹出
3. 插件 WebView 聚焦 → `Ctrl+K Ctrl+L` → 语言选择
4. Chord 第二键不匹配 → 状态栏显示 "(Ctrl+K, unknown) 不是命令" → 3s 后消失
5. 普通打字（非快捷键字符）→ 插件 WebView 正常接收（编辑器能打字）
6. F12 主进程 console → 每次 `before-input-event` 决策有日志（命中/放行/chord 状态）

## 风险

| 风险 | 缓解 |
|:--|:--|
| Chord 状态机主进程/壳双侧不一致 | 壳同步 chord 信息时一并同步；主进程 2s 超时与壳 `CHORD_TIMEOUT` 同值；F12 打印每次决策 |
| `before-input-event` 性能——每次按键都进主进程 JS | 同步查 `Set.has()` + `event.preventDefault()` 是 O(1)，无 IPC 开销 |
| 新插件 WebView 动态创建时 listener 缺失 | `keyboard-router.ts` 在 `PluginViewRegistry.onDidCreate` 事件中自动注册 |
