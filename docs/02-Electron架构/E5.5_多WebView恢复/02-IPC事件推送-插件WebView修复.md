# E5.5#7 IPC 事件推送——插件 WebView 修复

> 2026-08-08。诊断结论：`configuration.onChange` 在插件 WebView 中静默失效。

## 根因

### `plugin:push` 分发 vs `listenDirect` 不匹配

壳侧的 `IpcBridge.broadcast` 向插件 WebView 推送事件时，走的是 **`plugin:push`** IPC 通道：

```
壳 → IpcBridge.broadcast('config:changed', {key, value})
   → view.webContents.send('plugin:push', { channel: 'config:changed', payload: {key, value} })
```

但 `preload-plugin.ts` 的 `configuration.onChange` 用的是 **`listenDirect`**——直接监听 `config:changed` 通道：

```typescript
// preload-plugin.ts:85-88 ❌ 错误
onChange: (key, cb) =>
  listenDirect(ipcRenderer, 'config:changed', (d) => {
    if (!key || d.key === key) cb(d.value);
  }),
```

`listenDirect` → `ipcRenderer.on('config:changed', handler)`。事件在 `plugin:push` 上到达，`config:changed` 上永远收不到 → **静默失效，不掉报错**。

### 为什么 theme / lang 没这个问题

`theme:changed` 和 `lang:changed` 注册在 `extraHandlers` 中——`createEventSystem` 内有专门的 `ipcRenderer.on('plugin:push', ...)` 分发器根据 `data.channel` 匹配到正确的 handler。`config:changed` 没注册 → 不匹配 → 丢失。

### 为什么 pluginState.onChange 可能没问题

`pluginState.onChange` 用的是 `events.on('plugin-state:changed', cb)`，走的是 `createEventSystem` 的 `plugin:push` 分发器——和 `theme:changed` 同路径。**理论上应该通路，但需验证。**

---

## 归一化原则——所有推送事件走同一路径

**现状：** 推送事件到插件 WebView 有三种路径：

| 路径 | 用途 | 是否经过 `plugin:push` 分发 | 
|------|------|:--:|
| `listenDirect(channel, cb)` | serial 数据 / p2p 数据 | ❌ 直接 IPC 通道 |
| `extraHandlers[channel]` | theme / lang CSS 注入 | ✅ |
| `events.on(channel, cb)` | pluginState / 通用事件 | ✅ |

**问题：** `configuration.onChange` 误用了 `listenDirect` 路径——但 `config:changed` 事件走的是 `plugin:push` 分发路径，不是直接 IPC 通道。

**归一化规则：** `IpcBridge.broadcast` 推送的事件 → 插件侧只走 `events.on`。`listenDirect` 仅用于主进程直接 `view.webContents.send(channel, ...)` （不经过 `plugin:push` 包装）的通道（serial/p2p）。

---

## 方案

### 第 1 层：修 `configuration.onChange`——切到 `events.on`

**文件：** `electron/preload-plugin.ts` 第 85-88 行，~3 行改动。

```typescript
// 改前 ❌
onChange: (key: string, cb: (v: any) => void) =>
  listenDirect(ipcRenderer, 'config:changed', (d: { key: string; value: any }) => {
    if (!key || d.key === key) cb(d.value);
  }),

// 改后 ✅
onChange: (key: string, cb: (v: any) => void) =>
  events.on("config:changed", (d: any) => {
    const { key: k, value } = d as { key: string; value: any };
    if (!key || k === key) cb(value);
  }),
```

**Why `events.on` not `extraHandlers`：** `extraHandlers` 是全局一次性注册，适合无条件的 CSS 注入。`onChange` 是每个调用者独立注册/注销——`events.on` 返回 unsubscribe，调用者清理时自动移除 `plugin:push` 监听器。

### 第 2 层：模块级 `_configCache`——防竞态（`linkdesk-API缺口补全.md` §配置 Hook 适配）

**问题：** IPC 事件可在 React mount 前到达。`useEffect` 内注册 → 事件丢失。`_langCache` / `_contextKeyStore` 已有此模式，configuration 缺。

**文件：** `electron/preload-plugin.ts`，在 `_contextKeyStore` 下方加。

```typescript
// ── 配置缓存——事件可能在 React mount 前到达（同 _contextKeyStore / _langCache 模式）──
const _configCache = new Map<string, unknown>();

// 模块顶层常驻监听——零竞态
ipcRenderer.on('plugin:push', (_event, data: any) => {
  if (data?.channel === 'config:changed') {
    const { key, value } = data.payload as { key: string; value: any };
    _configCache.set(key, value);
  }
});
```

然后在 `configurationObj` 中暴露缓存读：

```typescript
const configurationObj = {
  get: (key: string) => ipcRenderer.invoke('config:get', key),
  set: (key: string, v: any) => ipcRenderer.invoke('config:set', key, v),
  getSchema: (key?: string) => ipcRenderer.invoke('plugins:call', 'getSchema', key),
  /** 读模块级缓存——同步，零竞态。插件 mount 前到达的值不丢。 */
  getCached: (key: string) => _configCache.get(key),
  onChange: (key: string, cb: (v: any) => void) => {
    // 已缓存 → 立即回调（填 React mount 前的空白）
    if (_configCache.has(key)) {
      try { cb(_configCache.get(key)); } catch { /* contextBridge 回调静默失败 */ }
    }
    return events.on("config:changed", (d: any) => {
      const { key: k, value } = d as { key: string; value: any };
      if (!key || k === key) cb(value);
    });
  },
};
```

**不需要 `config:getAll` IPC：** `_configCache` 是增量填充的（每个 `config:changed` 事件到达时写入）。React mount 后的首次渲染走 `configuration.get(key)` → invoke → 填缓存。

### 第 3 层：审计其他 `listenDirect` 使用——确认无同类 bug

| 位置 | channel | 事件来源 | 是否正确 |
|------|---------|---------|:--:|
| `serial.onData` | `serial:data` | 主进程 `view.webContents.send('serial:data', ...)` | ✅ 直接通道 |
| `serial.onStats` | `serial:stats` | 同上 | ✅ |
| `serial.onSystem` | `serial:system` | 同上 | ✅ |
| `p2p.on` | `p2p:data` | `IpcBridge` 直接 `view.webContents.send` | ✅ |
| ~~`configuration.onChange`~~ | ~~`config:changed`~~ | ~~`IpcBridge.broadcast` 经 `plugin:push`~~ | ❌ → 修 |

**结论：** 只有 `configuration.onChange` 有问题。其余 `listenDirect` 全部对应直接 IPC 通道。

---

## 改动范围

| 文件 | 改动 | 行数 |
|------|------|:--:|
| `electron/preload-plugin.ts` | ① `onChange` `listenDirect` → `events.on` ② +`_configCache` 模块级缓存 + `ipcRenderer.on('plugin:push'...)` ③ +`getCached` | ~15 行 |
| 无其他文件 | — | 0 |

**零新 IPC channel。零新 handler。**

---

## 对未来插件的适用性

**任意新插件**通过 `linkdesk.configuration.onChange(key, cb)` 订阅配置变更——壳侧 `IpcBridge.broadcast('config:changed', ...)` → 插件 WebView 的 `plugin:push` 分发 → `events.on` 回调。与插件类型无关，与插件数量无关。

**任意新推送事件类型**只需：
1. 壳侧 `IpcBridge.broadcast('newChannel', payload)`
2. 插件侧 `events.on('newChannel', cb)`

不新增 `extraHandler`、不新增 IPC 通道、不改主进程。这是归一化范式。

---

## 验证

- [ ] F12 插件 WebView console → `linkdesk.configuration.onChange('editor.fontSize', v => console.log('OK', v))` → 侧栏改字体大小 → console 有输出
- [ ] 设置页打开后正常显示配置项（不再空白）
- [ ] 侧栏改字体/行号/主题 → 编辑器实时变化
- [ ] 编辑器改配置 → 侧栏显示更新

---

## 🔥 E5.5#7 Phase 1.5——设置页全量 IPC 化

> 2026-08-08。Phase 1 修复了 `onChange` 通道，但设置页仍然为空。**更深层根因：** `SettingsView.tsx` 直接 import `@src/core`（ConfigurationRegistry / ConfigurationService / useConfigurationValue / onPluginLifecycleChange / ContextKeyService / MenuId）。在插件 WebView 的独立 JS 堆中，这些 import 创建**空的模块实例**——壳的实例有所有已注册贡献，插件的实例为空。→ 设置页无数据。

### 改动清单

| 文件 | 改动 | 行数 |
|------|------|:--:|
| `src/core/services/IpcBridgeHandler.ts` | 补 6 个 `plugins:call` 方法 + 壳侧 Emitter→broadcast 桥接（onRequestSettingsGroup / onRequestScrollToSetting / onPluginLifecycleChange） | +47 |
| `electron/preload-plugin.ts` | `configurationObj` 补 8 个 API + `menu.MenuId` 11 常量 | +43 |
| `src/core/react/useConfigurationIpc.ts` | **新建**——IPC 版 `useConfigurationValueIpc` / `useConfigurationIpc` hook（异步 get + onChange 订阅） | +75 |
| `src/components/views/SettingsView.tsx` | **全量重写**——7 个 `@src/core` import → `window.linkdesk.*` IPC | −69/+150 |

### 消灭的 @src/core import（14 个符号，7 个模块）

| 原 import | 新 IPC 调用 |
|-----------|------------|
| `getConfigurationContributions` from ConfigurationRegistry | `window.linkdesk.configuration.getConfigurationContributions()` → `plugins:call getConfigurationContributions` |
| `getMergedSchema` from ConfigurationRegistry | `window.linkdesk.configuration.getSchema()` → `plugins:call getSchema` |
| `consumeSettingsGroup` from ConfigurationRegistry | `window.linkdesk.configuration.consumeSettingsGroup()` → `plugins:call consumeSettingsGroup` |
| `onRequestSettingsGroup` from ConfigurationRegistry | `window.linkdesk.configuration.onRequestSettingsGroup(cb)` → `events.on("settings:requestGroup", cb)` |
| `consumeScrollToSetting` from ConfigurationRegistry | `window.linkdesk.configuration.consumeScrollToSetting()` → `plugins:call consumeScrollToSetting` |
| `onRequestScrollToSetting` from ConfigurationRegistry | `window.linkdesk.configuration.onRequestScrollToSetting(cb)` → `events.on("settings:scrollTo", cb)` |
| `setConfigurationValue` from ConfigurationService | `window.linkdesk.configuration.set(key, value)` → `config:set` |
| `inspectConfiguration` from ConfigurationService | `window.linkdesk.configuration.inspectConfiguration(key)` → `plugins:call inspectConfiguration` |
| `getUserSettings` from ConfigurationService | `window.linkdesk.configuration.getUserSettings()` → `plugins:call getUserSettings` |
| `useConfigurationValue` from useConfiguration | `useConfigurationValueIpc(key)` → `configuration.get(key)` + `onChange` |
| `onPluginLifecycleChange` from lifecycle | `window.linkdesk.configuration.onPluginLifecycleChange(cb)` → `events.on("plugin-lifecycle:changed", cb)` |
| `MenuId` from MenuRegistry | `window.linkdesk.menu.MenuId` → 本地常量对象（preload 注入） |
| `ContextKeyService` from ContextKeyService | `window.linkdesk.contextKey.set(key, value)` → `contextKey:set` |
| `onDidChangeConfiguration` from ConfigurationService | `window.linkdesk.configuration.onDidChangeConfiguration(cb)` → `events.on("config:changed", cb)` |

### 架构意义

**设置页现在是真正的保姆插件：** 零 `import @src/core`，全走 IPC。任何人写自己的设置 UI 插件，只需调同样的 `window.linkdesk.configuration.*` API → 自动接入大厅的同一张 ConfigurationRegistry 桌子 → 替换原设置插件，所有原有设置项无缝显示。

**API 桌子不变，房间可换。** 这是圆形大厅模型在设置页的首次完整落地。

---

## 🔥 归一化规则——未来 AI 必读

> **这些规则是枪。** 新增任何推送事件前逐条过。E5.5#7 修了这个 bug，同样的 bug 不允许再出现第二次。

### 通道选型流程

```
壳→插件推送事件，应该走哪条路？

1. 事件由 IpcBridge.broadcast() 发出？
   → YES → 插件侧用 events.on() 接收 ✅
   → NO  → 继续

2. 主进程直接 view.webContents.send(channel, data)？
   → YES → 插件侧用 listenDirect(channel, cb) ✅
            channel 名必须加 :direct 后缀（如 serial:data:direct）
   → NO  → 继续

3. 壳→壳（同一渲染进程内）？
   → 走 shellEvents.emit() ✅（不走 IPC）
```

### 预检 3 问——每加一个新推送事件必须回答

```
□ 1. 发送端——事件从哪发出？
     IpcBridge.broadcast? / 主进程直接 send? / 壳内 shellEvents?

□ 2. 接收端——插件侧用哪个 API 接收？
     events.on? / listenDirect? / extraHandlers?
     必须与发送端匹配——broadcast ↔ events.on, 直接 send ↔ listenDirect

□ 3. 竞态——事件可能在 React mount 前到达吗？
     YES → 加模块级缓存（_configCache / _langCache / _contextKeyStore 模式）
           在 ipcRenderer.on('plugin:push', ...) 中填充缓存
           在 API 中暴露同步读（getCached）
     NO  → 确认 useEffect 注册时机覆盖所有场景
```

### 硬约束

1. **`IpcBridge.broadcast` → `events.on`，不允许 `listenDirect`。** 跨了 `plugin:push` 分发层。
2. **主进程 `view.webContents.send` → `listenDirect` + `:direct` 后缀。** 不经过 `plugin:push` 包装。
3. **新增推送通道 → 先在这个文档里登记。** 写清发送端/接收端/竞态策略/验证方式。
4. **`listenDirect` 运行时告警已在 `event-system.ts` 中。** 传了非 `:direct` 后缀的 channel → `console.error`。

---

## 🔥 Bug C 教训——pluginState 跨 WebView 状态同步（2026-08-08）

> **症状：** 串口监视器侧栏指示灯不亮 + TX/RX 计数器不更新 + 状态栏计数器不更新。
> **根因：** `SerialContext._setState` 只在 `isOpen` 变化时同步到 `pluginState`——`txBytes`/`rxBytes` 锁在守卫内、`sourceName` 从未同步。`SessionListView` 用 `useSerialContext().state.isOpen` 读到壳 WebView 的隔离空副本。

### pluginState 同步模式——插件 WebView 权威状态 → 壳组件消费

```
插件 WebView（权威数据源）                    壳 WebView（只读消费）
┌──────────────────────────┐       ┌──────────────────────────┐
│ SerialContext._setState  │       │ statusBar / SessionList  │
│                          │       │                          │
│ if isOpen changed:       │       │ pluginState.get(k)       │
│   → pluginState.set() ✅ │  IPC  │   .then(v => setState)   │
│                          │ ────→ │                          │
│ if sourceName changed:   │       │ pluginState.onChange(k,  │
│   → pluginState.set() ✅ │       │   v => setState)         │
│                          │       │                          │
│ if txBytes/rxBytes       │       │ return () => unsub?.()   │
│   changed (debounce):    │       │   // mount 注册 unmount  │
│   → pluginState.set() ✅ │       │   // 注销，零泄漏        │
└──────────────────────────┘       └──────────────────────────┘
```

### 铁律

1. **插件 WebView 内的模块级状态变化 → 必须在 setter 中同步到 `pluginState`。** 所有可能被壳组件消费的字段都要覆盖，不漏字段、不锁守卫。
2. **高频数据（onStats 每 100ms 回调）→ 防抖合并。** 250ms debounce——每次 `pluginState.set` 是跨进程 IPC，不能每次回调都发。
3. **壳侧组件（侧栏/状态栏/任何壳渲染的 UI）读插件状态 → 只用 `pluginState.get/onChange`。** 永远不用 `useSerialContext` 等模块级 hook——那些在壳 WebView 中是隔离空实例。
4. **mount 注册 / unmount 注销——`onChange` 返回 unsubscribe，useEffect cleanup 中调用。** 零泄漏。

### 自检——新插件加跨 WebView 状态前回答

```
□ 1. 这个状态在哪个 WebView 中是权威源？
     插件 WebView（主区操作）? / 壳 WebView（设置/侧栏）?
     权威源负责写 pluginState.set()

□ 2. 哪些 WebView 需要读这个状态？
     壳侧栏? / 状态栏? / 其他插件?
     消费端用 pluginState.get + onChange 订阅

□ 3. 所有字段都覆盖了吗？
     isOpen / sourceName / txBytes / rxBytes / ...
     漏一个 → 消费端读到旧值/空值
```

---

## 🔥 Bug D 教训——键盘路由器无修饰键规则（2026-08-08）

> **症状：** 编辑器 WebView 中按 Enter 无法换行。Shift+Enter、字母、数字、Tab 均正常。
> **根因：** `file-tree/plugin.json` 注册了 `"key": "Enter", "command": "explorer.openFocused"`。`keyboard-router.ts` 在主进程 `before-input-event` 中查 `keyCache.shortcuts`——命中 `"enter"` → `event.preventDefault()` 吃掉。单 WebView 时代有 `isEditableElementFocused()` 守卫（Monaco 的 textarea 是 active element → 放行），多 WebView 下主进程看不到 DOM，无差别拦截。

### 键盘路由器规则

```
before-input-event 到达 → keyboardInputToKeyString(input)

1. modifier-only（只有 ctrl/shift/alt/meta，无实际键）？
   → return（不处理）

2. Chord 第二键（_chordState.isPending）？
   → 匹配/不匹配都 preventDefault + forward 到壳

3. 🔥 无修饰键（!ctrlKey && !shiftKey && !altKey && !metaKey）？
   → return（放行给 WebView）★ 2026-08-08 新增
   → 原因：任何插件可注册 "key": "Enter" → keyCache 含裸键
   → 主进程无法判断 WebView 内是否有 editable element

4. 有修饰键 → 常规匹配：
   → Chord 第一键? / 单键快捷键? → preventDefault + forward
   → 不匹配 → 放行
```

### 为什么安全

- **带修饰键的快捷键（Ctrl+S / Ctrl+Shift+P）不会误放行**——步骤 4 正常拦截。
- **Chord 第二键不受影响**——步骤 2 在步骤 3 之前，`Ctrl+K Enter` 仍生效。
- **插件 WebView 内 DOM 级 keydown 监听不受影响**——`before-input-event` 不放行 ≠ DOM 事件不触发？→ 不放行 = 不调 `preventDefault` = 事件正常到达 WebView = DOM keydown 正常触发。
- **file-tree 的 Enter 改走 DOM keydown**——`FileTreeKeyboard.ts` 已在壳侧用 `case "Enter"` 处理，不依赖主进程拦截。

