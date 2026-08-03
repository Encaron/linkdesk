# 多 WebView 三通信机制——广播 + 请求 + 推流

> 2026-08-04。**E3a 多 WebView 后，三张桌子只实现了一张半。本任务组补全双向通信，让插件真正自由。**
> **前置：** E5#1 ShellEvents（壳内事件类型系统已就绪）
> **插入位置：** 第 4d 轮（侧栏行为）之后，第 4e 轮（标签页系统）之前。
> **执行清单任务：** E5#61–#66

---

## 一、三机制模型

> 来源：memory `three-communication-mechanisms`（2026-07-28 Encaron 定义）

所有插件间通信只有三种形态：

| 形态 | 机制 | API | 比喻 | 状态 |
|:--|------|------|------|:--:|
| **一对多广播** | `events` | `emit(channel, data)` / `on(channel, cb)` | 广场喇叭 | ⚠️ 受阻 E5#74 |
| **一对一请求** | `commands` / `requestToPlugin` | `execute(id)` / `requestToPlugin(id, ch, payload)` | 命令本 | ✅ 就绪 |
| **一对一推流** | `p2p` | `send(target, channel, data)` / `on(channel, cb)` | 包间电话 | ⚠️ 受阻 E5#74 |

---

## 二、实现状态（2026-08-04）

### 已完成

| 任务 | 关键成果 | 教训 |
|:--|:--|:--|
| E5#61 events 审计 | 无回环 bug。source 字段。dev 日志 | — |
| E5#62 requestToPlugin | 壳→插件请求-响应。`pluginRequest.handle/unhandle` | 🐛 contextBridge 隔离世界不可用 `window.linkdesk` → 模块级变量修 |
| E5#63 撤回 confirmCondition | invokeBeforeClose 走 requestToPlugin。−21 行 | — |
| E5#64 串口 handler | `pluginRequest.handle('invokeBeforeClose', ...)` | `portOpenRef` 不工作——串口数据路由依赖 E5#74 |

### 受阻

| 任务 | 状态 | 受阻原因 |
|:--|:--|:--|
| E5#65 p2p 推流 | ⚠️ 管道已建 | 阻塞于 E5#74——`events.on` 不触发 |
| E5#67 dialog API | ⚠️ a-e 完成 | f-g 迁移待做 |

### 🔴🔴 E5#74——plugin:push 投递失败（最高优先级）

**现象：** `webContents.send('plugin:push', ...)` → 插件 `ipcRenderer.on('plugin:push', ...)` 收不到。

**影响：** `bridge.broadcast`、`events.emit`、`p2p.send` 全部依赖 `plugin:push` → 全部静默失效。`theme:changed` extraHandler、`serial:data` 同样受阻。

**教训：** contextBridge 下 `ipcRenderer.send(ch, a, b, c)` 多独立参数无效，必须 `ipcRenderer.send(ch, { key: val })` 对象。

### contextBridge 隔离世界 Bug

`contextBridge.exposeInMainWorld` 把对象暴露给渲染主世界，但 preload 隔离世界的 `ipcRenderer.on` 回调里 `window.linkdesk` 不可用。修法：共享状态用模块级变量。详见 memory `contextbridge-isolated-world-bug.md`。

---

## 三、API 设计

### 3.1 广播 `events`——受阻 E5#74

`events.emit(channel, payload)` / `events.on(channel, cb)`。受限于 `plugin:push` 投递失败，插件 WebView 侧不可用。修 E5#74 后应全通。

### 3.2 请求 `requestToPlugin`——✅ 就绪

```
壳：linkdesk.bridge.requestToPlugin(pluginId, channel, payload) → Promise<result>
插件：linkdesk.pluginRequest.handle(channel, handler) / unhandle(channel)
主进程：ipcMain.handle('bridge:request-to-plugin') → plugin:request IPC → 等 bridge:plugin-response
```

### 3.3 推流 `p2p`——⚠️ 管道已建，受阻 E5#74

```
发送：linkdesk.p2p.send(target, channel, data)
接收：linkdesk.p2p.on(channel, cb)  （= events.on）
主进程：ipcMain.on('p2p:send') → webContents.send('plugin:push')
```

`p2p.on` 复用 `events.on`——和 broadcast 共用同一订阅系统。E5#74 修复后应全通。

### 3.4 弹窗 `dialog`——⚠️ 核心就绪，迁移待做

```
linkdesk.dialog.confirm(message) → Promise<boolean>
linkdesk.dialog.alert(message) → Promise<void>
PROXY_CHANNELS → IpcBridgeHandler → DialogService → ConfirmDialog React 组件
```

---

## 四、依赖关系

### 直接依赖本任务组的已有 E5 任务

| 任务 | 需要 | 说明 |
|:--|:--|:--|
| E5#48 | `requestToPlugin` | `invokeBeforeClose` 壳→插件路由，撤回 `confirmCondition` |
| E5#11i | `requestToPlugin` | editor IPC——壳发 `openFile` 到 editor WebView |
| E5#54 | `events` 广播 | `file:deleted`/`file:renamed` 跨 WebView 广播 |
| E5#17a | API | clipboard provider 跨 WebView |

### 未来任务会用到

| 场景 | 机制 |
|:--|:--|
| 协议插件收串口数据 | `p2p`（E5#74 修后）|
| 卡片工作台可视化 | `p2p` |
| LSP 数据到插件 WebView | `p2p` + `requestToPlugin` |
| 壳→任意插件指令 | `requestToPlugin` |

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#61–#66
> **← 关联：** E5#48（`invokeBeforeClose` 用 `requestToPlugin` 后撤回 `confirmCondition`）
> **← 关联：** E5#11i（editor IPC 改造，依赖 `requestToPlugin`）
> **← 关联：** E5#54（标签页生命周期外部事件，依赖 `events` 跨 WebView）
> **← 关联：** `memory/three-communication-mechanisms.md`（三机制理论）
> **← 关联：** `memory/hall-architecture-model.md`（圆形大厅）
> **← 关联：** `memory/contextbridge-isolated-world-bug.md`（contextBridge 隔离世界 bug）
> **← 关联：** `memory/main-process-push-audit.md`（E5#74 前置调查）
> **← 关联：** `memory/plugin-api-audit-checklist.md`（API 审计清单）
