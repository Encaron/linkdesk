# 多 WebView 三通信机制——广播 + 请求 + 推流

> 2026-08-04。**E3a 多 WebView 后，三张桌子只实现了一张半。本任务组补全双向通信，让插件真正自由。**
> **前置：** E5#1 ShellEvents（壳内事件类型系统已就绪）
> **插入位置：** 第 4d 轮（侧栏行为）之后，第 4e 轮（标签页系统）之前。
> **执行清单任务：** E5#61–#66

---

## 一、三机制模型

> 来源：memory `three-communication-mechanisms`（2026-07-28 Encaron 定义）

所有插件间通信只有三种形态：

| 形态 | 机制 | API | 比喻 | 多 WebView 状态 |
|:--|------|------|------|:--:|
| **一对多广播** | `events` | `emit(channel, data)` / `on(channel, cb)` | 广场喇叭——发了不管 | ⚠️ 全通但未验证 |
| **一对一请求** | `commands` | `execute(id, ...args)` / `registerCommand(id, handler)` | 桌子上的命令本——有去有回 | 🔴 仅插件→壳 |
| **一对一推流** | `p2p` | `send(target, channel, data)` / `on(channel, cb)` | 包间电话——高频直连 | 🔴 零代码 |

---

## 二、现状

### 2.1 广播 `events`——线接了，没跑过

- `events.emit(channel, payload)` → `plugin:emit` IPC → 主进程 → `broadcast()` → 所有 WebView ✅
- `events.on(channel, cb)` → 订阅 `plugin:push` IPC ✅
- **壳→插件**：`bridge.pushToPlugin(pluginId, channel, payload)` 定向 ✅
- **壳→全部插件**：`bridge.broadcast(channel, payload)` 全播 ✅
- **已知问题**：
  - 壳 `events.emit` 会通过 IPC 回环收到自己的事件——潜在重复触发
  - 接收方不知道事件来源（无 `sourcePluginId`）
  - **没有任何插件代码调用过 `linkdesk.events.emit`**——功能存在但未验证

### 2.2 请求 `commands`——单向，壳→插件断的

- **插件→壳** ✅：`commands.execute(id, ...args)` → `ipcRenderer.invoke('commands:execute')` → 主进程 IpcBridge 代理 → 壳 `IpcBridgeHandler` → `CommandRegistry.executeCommand()` → 结果返回
- **壳→插件** ❌：`preload-shell.ts` L126 `commands: {}`——空对象。`invokeBeforeClose` 里 `linkdesk().commands.execute("close_port")` 一直抛 TypeError 被静默 catch
- **根因**：IpcBridge 的 `PROXY_CHANNELS` 只代理插件→壳方向。handler 函数无法跨进程序列化——插件 WebView 不能把 handler 注册到壳的 CommandRegistry

### 2.3 推流 `p2p`——零代码

- `docs/03-插件制造/07-插件间通信.md` 设计了 `linkdesk.p2p.send(target, channel, data)` / `linkdesk.p2p.on(channel, cb)`
- 一行没写
- 当前串口数据走双重跳：主进程→壳→主进程→插件——壳是必经中间人

---

## 三、API 设计

### 3.1 广播 `events`——审计加固，不新增 API

保持现有 API。只修复已知问题：
- 防 `emit` 回环重复触发
- 事件加 `source` 字段——接收方可选读取
- 补充使用示例和文档

### 3.2 请求 `commands`——加 `bridge.requestToPlugin` 补壳→插件方向

```
壳→插件请求-响应
══════════════════

壳侧：
  linkdesk.bridge.requestToPlugin(pluginId, channel, payload) → Promise<result>

插件侧：
  linkdesk.pluginRequest.handle(channel, handler)    // 注册处理器
  linkdesk.pluginRequest.unhandle(channel)           // 注销

主进程（ipc-bridge.ts）：
  ipcMain.handle('bridge:request-to-plugin', async (event, pluginId, channel, payload) => {
    const view = windowManager.getPluginView(pluginId);
    if (!view) throw new Error(`插件 "${pluginId}" 未运行`);
    const requestId = generateRequestId();
    // 发 plugin:request 到目标插件 WebView
    view.webContents.send('plugin:request', { requestId, channel, payload });
    // 等 bridge:plugin-response 回复 → resolve
    return pendingPromise;
  });
```

**对标 VS Code：** `vscode.commands.executeCommand()` 对扩展透明——扩展不知道命令在哪个进程。`requestToPlugin` 同理——调用方不关心目标是壳还是插件。

**和 `pushToPlugin` 的区别：**

| | `pushToPlugin` | `requestToPlugin` |
|---|---|---|
| 方向 | 壳→插件 | 壳→插件 |
| 等回复 | ❌ fire-and-forget | ✅ 等 Promise |
| 目标不在 | 静默丢弃 | 抛异常 |
| IPC | `send` | `invoke` (handle) |
| 用途 | 推事件 | 发请求 |

### 3.3 推流 `p2p`——建基础管道

```
插件→插件定向推流
══════════════════

发送方插件：
  linkdesk.p2p.send(targetPluginId, channel, data) → Promise<void>

接收方插件：
  linkdesk.p2p.on(channel, (data, source) => { ... })

主进程（ipc-bridge.ts）：
  ipcMain.handle('p2p:send', async (event, { target, channel, data }) => {
    const sourceId = windowManager.getPluginIdFromWebContents(event.sender);
    const targetView = windowManager.getPluginView(target);
    if (!targetView) throw new Error(`目标插件 "${target}" 未运行`);
    targetView.webContents.send('p2p:data', { channel, data, source: sourceId });
  });
```

**和广播 `events.emit` 的区别：**

| | `events.emit` | `p2p.send` |
|---|---|---|
| 范围 | 全部 WebView | 指定一个插件 |
| 目标不在 | 静默跳过 | 抛异常 |
| 用途 | 状态广播（主题/语言） | 数据推流（串口/协议） |

**对标 VS Code：** VS Code 没有直接的 p2p API——扩展间通信走 commands + events。p2p 是 LinkDesk 独有——为高频数据推流设计。

---

## 四、为什么壳代码不感知插件

```
壳只知道                              壳不知道
────────                              ────────
bridge.requestToPlugin()              目标插件叫什么名字
pluginRequest.handle()                插件在哪个 WebView
p2p.send()                            p2p 目标是谁（core 只校验 target 存在）
channel 是个字符串                      channel 语义
false = 拒绝                          拒绝的原因是什么
```

**所有 channel 名由插件自己定义。** 核心不解析、不验证、不假设语义。`"invokeBeforeClose"` 只是一个例子——任何插件可以定义任何 channel。

### 示例场景（不只串口）

```
editor:      requestToPlugin('editor', 'openFile', { filePath })     → 壳通知 editor 打开文件
protocol:    p2p.send('protocol-bracket', 'serial:raw', bytes)       → 串口直推协议插件
settings:    requestToPlugin('settings', 'getValue', { key })        → 任意插件读设置
file-tree:   events.emit('file:changed', { path })                   → 文件树广播文件变更
lsp:         requestToPlugin('editor', 'lsp:didChange', { uri, changes }) → 壳通知 editor LSP 事件
card:        p2p.send('workspace-card', 'serial:frame', cardData)    → 卡片可视化串口帧
```

---

## 五、对 E5#48 的影响

当前 E5#48 用 `confirmCondition` + IPC 直接查端口状态——壳在替插件判断。属于方向性错误。

三机制补全后，E5#48 撤回 `confirmCondition` 方案，改为：

```
1. invokeBeforeCloseTab → bridge.requestToPlugin(pluginId, 'invokeBeforeClose', {})
2. 串口插件 pluginRequest.handle('invokeBeforeClose', async () => {
     if (!portOpenRef.current) return;
     const ok = await showConfirm(...);
     if (!ok) return false;
     await linkdesk.serial.closePort();
   })
```

壳零感知串口。插件自己做全部判断。

---

## 六、实现步骤

### E5#61 广播 events 审计与加固

- [ ] **E5#61a** 审计 `events.emit` 回环问题——壳 emit 是否触发自身 `on` 两次？→ 修或加文档说明
- [ ] **E5#61b** 事件 `payload` 加可选 `source` 字段——接收方可选读来源
- [ ] **E5#61c** `event-system.ts` 加 dev 模式日志——`[events] emit "channel" → N 订阅者`
- [ ] 验证——壳 emit → 插件收到 / 插件 emit → 壳收到 / 插件 A emit → 插件 B 收到

### E5#62 请求 commands 双向化——加壳→插件 requestToPlugin

- [ ] **E5#62a** `electron/ipc-bridge.ts`——加 `ipcMain.handle('bridge:request-to-plugin', ...)`。生成 requestId、推 `plugin:request` 到目标插件、等 `bridge:plugin-response`、带 10s 超时 | ~40 行
- [ ] **E5#62b** `electron/preload-shell.ts`——`bridge` 加 `requestToPlugin(pluginId, channel, payload): Promise<unknown>` | ~3 行
- [ ] **E5#62c** `electron/preload-plugin.ts`——加 `pluginRequest` 命名空间：`handle(channel, handler)` / `unhandle(channel)`。监听 `plugin:request` IPC → 调 handler → `bridge:plugin-response` 回传结果 | ~25 行
- [ ] **E5#62d** `src/core/linkdesk-api.ts`——加 `requestToPlugin` 和 `pluginRequest` 类型定义 | ~10 行
- [ ] 验证——壳 `requestToPlugin` → 插件 handler 执行 → 结果返回到壳

### E5#63 invokeBeforeCloseTab 改用 requestToPlugin

- [ ] **E5#63a** 撤回 E5#48 `confirmCondition` 方案——删 `types.ts` 字段 + 删 `viewRegistry.ts` `evaluateConfirmCondition` + 删 `plugin.json` 行 | ~−25 行
- [ ] **E5#63b** `viewRegistry.ts` `invokeBeforeCloseTab`——`commands.execute` 改为 `bridge.requestToPlugin(pluginId, 'invokeBeforeClose', {})`。`result === false` → 阻止关闭 | ~5 行
- [ ] 验证——所有现有 `invokeBeforeClose` 行为不变 + `npm run check`

### E5#64 串口插件注册 invokeBeforeClose handler

- [ ] **E5#64** `serial-monitor/src/index.tsx`——`pluginRequest.handle('invokeBeforeClose', async () => { if (!portOpenRef.current) return; const ok = await showConfirm(...); if (!ok) return false; await linkdesk.serial.closePort(); })`。cleanup 中 `unhandle` | ~15 行
- [ ] 验证——端口未开 → Ctrl+W 不弹确认 / 端口开着 → 弹确认 → 取消=不关 / 确认=断开+关闭

### E5#65 推流 p2p 基础管道

- [ ] **E5#65a** `electron/ipc-bridge.ts`——加 `ipcMain.handle('p2p:send', ...)`。校验目标存在 → 不存在抛异常（不静默丢弃）。`source` 字段标记发送方 | ~25 行
- [ ] **E5#65b** `electron/preload-plugin.ts`——加 `p2p` 命名空间：`send(target, channel, data)` + `on(channel, cb)`。`on` 监听 `p2p:data` IPC | ~15 行
- [ ] **E5#65c** `src/core/linkdesk-api.ts`——加 `p2p` 类型定义 | ~8 行

### E5#67 🔧 弹窗归一化——插件 WebView 调壳 DialogService

> 利用现有 `PROXY_CHANNELS`（插件→壳代理，和 `commands:execute` 同机制）。插件在自己 WebView 里调 `linkdesk.dialog.confirm()` → IPC 到壳 → `DialogService.confirm()` → `ConfirmDialog` 组件弹窗 → 结果返回。插件不需要 import 任何东西，不关心自己跑在哪。

- [ ] **E5#67a** `electron/ipc-bridge.ts`——`PROXY_CHANNELS` 加 `'dialog:confirm'` + `'dialog:alert'` | ~1 行
- [ ] **E5#67b** `src/core/IpcBridgeHandler.ts`——加 `case "dialog:confirm"` / `case "dialog:alert"` → 调用 `DialogService.confirm/alert` | ~10 行
- [ ] **E5#67c** `electron/preload-plugin.ts`——加 `dialog` 命名空间：`confirm(message)` / `alert(message)` → `ipcRenderer.invoke` | ~8 行
- [ ] **E5#67d** `electron/preload-shell.ts`——加 `dialog` 命名空间：壳侧直接调 `DialogService`，不走 IPC | ~8 行
- [ ] **E5#67e** `src/core/linkdesk-api.ts`——加 `dialog` 类型 | ~5 行
- [ ] **E5#67f** 迁移所有插件——替换 `import { showConfirm }` → `linkdesk.dialog.confirm()` | 4 文件 ~12 行：`SessionListView.tsx`（侧栏删会话）、`index.tsx`（主区关标签页）、`FileTreeContextMenu.tsx`（删除文件）、`FileTreeDnD.ts`（拖放）、`SearchView.tsx`（替换）
- [ ] **E5#67g** 验证——全部场景 React 弹窗（非 `window.confirm`）。`grep "import.*showConfirm" plugins/` 零结果。`npm run check`
- [ ] 验证——插件 A `p2p.send('B', 'test', {})` → 插件 B `p2p.on('test', cb)` 收到。目标不存在 → 抛异常

### E5#66 文档 + API 类型补全

> 对标现有文档体系：
> - `01-插件API契约.md`——主契约（已有 §3.4 commands + §3.5 events）
> - `07-插件间通信.md`——三机制全貌 + 大厅 vs 后门
> - `linkdesk-api.ts`——`window.linkdesk.*` TypeScript 编译期契约
> - `FileService-API命名.md`——API 命名规范（动词+名词一致、channel `namespace:camelCase`）

- [ ] **E5#66a** `docs/03-插件制造/07-插件间通信.md`——§三 events 补多 WebView 架构图 + source 字段。§四 commands 补 `requestToPlugin` 壳→插件方向 + 和 `executeCommand` 的区别。§五 p2p 从设计草案变为 API 文档。状态表三机制全绿。多场景示例（串口确认、editor openFile、协议推流、file-tree 广播）| ~60 行
- [ ] **E5#66b** `docs/03-插件制造/01-插件API契约.md`——§3.4 commands 加 `bridge.requestToPlugin`。§3.5 events 加 `source` 字段。新建 §3.6 p2p（`send`/`on`）。新建 §3.7 bridge（`requestToPlugin`/`pushToPlugin`/`broadcast`）。新建 §3.8 pluginRequest（`handle`/`unhandle`）。新建 §3.9 dialog（`confirm`/`alert`）| ~60 行
- [ ] **E5#66c** `src/core/linkdesk-api.ts`——`commands` 补 `requestToPlugin`。`events` 补 `source`。新建 `p2p` + `pluginRequest` + `dialog` 命名空间。与 preload 实际暴露 API 完全一致，tsc 检查调用方 | ~30 行
- [ ] **E5#66d** 本文件——标记全部勾完

---

## 七、验证——端到端三机制

- [ ] 广播：插件 A `events.emit('greeting', { text: 'hello' })` → 插件 B `events.on('greeting', cb)` 收到
- [ ] 请求：壳 `requestToPlugin('serial-monitor', 'ping', {})` → 插件返回 `'pong'` → 壳收到
- [ ] 推流：插件 A `p2p.send('plugin-b', 'stream', data)` → 插件 B `p2p.on('stream', cb)` 收到
- [ ] 目标不存在：`requestToPlugin('nonexistent', ...)` → 抛异常（不静默）
- [ ] `npm run check` 零错误

---

## 八、依赖关系——现在和未来

### 直接依赖本任务组的已有 E5 任务

| 任务 | 需要 | 说明 |
|:--|:--|:--|
| E5#48 | `requestToPlugin` | `invokeBeforeClose` 壳→插件路由，撤回 `confirmCondition` |
| E5#11i | `requestToPlugin` | editor IPC——壳发 `openFile` 到 editor WebView |
| E5#11j | `requestToPlugin` | python 插件——可能需要 `runCode` IPC |
| E5#11l | 以上全部 | 删 WEBVIEW_READY_PLUGINS——全部插件能独立通信 |
| E5#54 | `events` 广播 | `file:deleted`/`file:renamed` 跨 WebView 广播 |
| E5#14 | `requestToPlugin` | appearsIn 让 editor 正确推算——需要壳能调 editor |

### 未来任务会用到

| 场景 | 机制 | 说明 |
|:--|:--|:--|
| 协议插件收串口数据 | `p2p` | 串口 → 协议插件直推，不走壳中转 |
| 卡片工作台可视化 | `p2p` | 串口帧 → 卡片插件直推 |
| LSP 数据到插件 WebView | `p2p` + `requestToPlugin` | 编辑器在独立 WebView 时需要 LSP 数据 |
| 多插件协作 | `events` | 任意插件广播状态变更 |
| 壳→任意插件指令 | `requestToPlugin` | 打开文件、切换会话、参数变更等 |

### 不可逆点

- `requestToPlugin` 就绪后，E5#48 的 `confirmCondition` 方案立即撤回——壳不替插件判断。如果 `requestToPlugin` 没做完就合并 E5#48，`confirmCondition` 会成为技术债。

---

## 九、完工标准

- [ ] `events` 广播——双向全通，无回环 bug，有 source 字段，dev 模式日志
- [ ] `requestToPlugin`——壳→插件请求-响应管道就绪，10s 超时，目标不存在抛异常
- [ ] `p2p`——插件→插件定向推流管道就绪，目标不存在抛异常
- [ ] E5#48 撤回 `confirmCondition`——`invokeBeforeClose` 用 `requestToPlugin` 路由
- [ ] 串口插件 `invokeBeforeClose` handler——自己判断端口状态 + 确认 + 断开
- [ ] 文档更新——三机制 API 完整、类型齐备、代码示例涵盖多个场景（不止串口）
- [ ] 壳代码不出现 `serial`、`port`、`isOpen`、`close_port` 等串口专属字面量
- [ ] `npm run check` 零错误

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#61–#66
> **← 关联：** E5#48（`invokeBeforeClose` 用 `requestToPlugin` 后撤回 `confirmCondition`）
> **← 关联：** E5#11i（editor IPC 改造，依赖 `requestToPlugin`）
> **← 关联：** E5#54（标签页生命周期外部事件，依赖 `events` 跨 WebView）
> **← 关联：** `memory/three-communication-mechanisms.md`（三机制理论）
> **← 关联：** `memory/hall-architecture-model.md`（圆形大厅——广播+后门直连）
> **← 关联：** `docs/03-插件制造/07-插件间通信.md`（插件通信开发者文档）

- [ ] `events` 广播——双向全通，无回环 bug，有 source 字段
- [ ] `requestToPlugin`——壳→插件请求-响应管道就绪
- [ ] `p2p`——插件→插件定向推流管道就绪
- [ ] E5#48 撤回 `confirmCondition`——`invokeBeforeClose` 用 `requestToPlugin` 路由
- [ ] 串口插件 `invokeBeforeClose` handler——自己判断端口状态 + 确认 + 断开
- [ ] 文档更新——三机制 API 完整、类型齐备、有代码示例
- [ ] 壳代码不出现 `serial`、`port`、`isOpen`、`close_port` 等串口专属字面量

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#61–#66
> **← 关联：** E5#48（`invokeBeforeClose` 改用 `requestToPlugin` 后撤回 `confirmCondition`）
> **← 关联：** `memory/three-communication-mechanisms.md`（三机制理论）
> **← 关联：** `memory/hall-architecture-model.md`（圆形大厅——events=p2p 后门直连）
