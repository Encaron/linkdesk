# Per-Tab 回退方案——E5.6#0a 审计结果

> 📖 对应执行清单：[E5.6#0a, E5.6#1-#4, E5.6#31-#36](../E5.6-执行清单.md)
> 📖 E5.5 原始实现：[04-PerTab-WebView-设计.md](../../E5.5_多WebView恢复/04-PerTab-WebView-设计.md)
> 📅 审计日期：2026-08-09

---

## 0. 审计摘要

| 指标 | 数值 |
|:--|:--|
| 受影响的源文件 | **20 个** + 1 个仅注释（lsp-handlers.ts，无需修改） |
| 其中需要修改 | 18 个 |
| 其中整文件删除 | 2 个（useWebViewSync.ts + plugin-view.html） |
| 核心 `instanceId` 引用 | ~280 处（不含 `node_modules`） |
| `rekeyInstance` 调用链 | 7 处（window-manager + plugin-view-registry + handlers + preload-shell + useWebViewSync + linkdesk-api） |
| `findGraceInstance` 调用链 | 7 处 |
| `graceTimers` 引用 | 18 处（全部在 window-manager.ts） |
| `notifyReady` 引用 | 5 处 |
| `readyWebViewIds` 引用 | 13 处（useWebViewSync + MainContent） |
| `webViewBoundsReady` 引用 | 11 处 |
| `getPluginIdFromWebContents` 引用 | 3 处（ipc-bridge.ts:122,268,392——全在 per-tab 路由上下文） |
| `clearPluginQueues` 复数形式 | 1 处（ipc-bridge.ts:323——遍历 getInstanceIdsForPlugin 清空同插件所有实例队列） |
| `pluginViews.*` preload 暴露方法 | 14 个 |
| `pluginInstance` 命名空间引用 | 3 文件（preload-plugin.ts:223-230 + plugin-shell-main.tsx:129-133 + linkdesk-api.ts:187-193） |
| `_pluginInstanceId` / `_urlPluginId` 模块级常量 | 2 个（preload-plugin.ts:79-80——URL 解析的 per-tab 身份） |
| `useWebViewSync()` 调用点 | 1 处（MainContent.tsx:326） |
| 硬编码 `requestToPlugin(t.id, ...)` | 2 处（MainContent.tsx:344 openFile + :357 openSession——t.id 即 instanceId） |
| `requestToPlugin(pluginId, "invokeBeforeClose")` | 1 处（viewRegistry.ts:83——pluginId 作为 instanceId 路由） |
| `pluginViewRegistry` 外部消费者 | **0 个** ✅（main.ts L303 导出的变量无文件 import） |
| `pluginViews.*` 壳侧消费者 | 5 个（useWebViewSync + MainContent + viewRegistry + **developerCommands** + **DialogService**） |
| 插件/测试文件沾染 | **0 个** ✅ |
| ShellPluginComponent.tsx | **不存在**——从 E5.6#36 移除 |

---

## 1. 逐文件审计——精确行号 + 操作

### 1.1 `electron/window-manager.ts`（~440 行）——最重灾区

#### 1.1.1 数据结构——删除

| 行 | 符号 | 操作 |
|:--|:--|:--|
| 6-7 | `E5.5#9a 注释` | 删注释块 |
| 25-27 | `pluginViews Map<instanceId, ...>` JSDoc | 删 |
| 28 | `private pluginViews` 声明 | → `sidebarPoolView + mainPoolView` |
| 35-36 | `private graceTimers` 声明 | **整行删除** |

#### 1.1.2 `instanceId` 签名方法——逐个处理

| 方法 | 行 | 操作 |
|:--|:--|:--|
| `createPluginView(instanceId, pluginId, url)` | 58-126 | → `createPool(zone)` (Phase 2 新方法) |
| `destroyPluginView(instanceId)` | 129-149 | → `destroyPool(zone)` |
| `getPluginView(instanceId)` | 152-154 | → `poolView` getter |
| `hasPluginView(instanceId)` | 157-159 | **删除** |
| `getAllInstanceIds()` | 161-163 | **删除** |
| `getPluginIdFromWebContents(wc)` | 169-175 | → `getZoneFromWebContents(wc)` |
| `getInstanceIdFromView(view)` | 179-186 | **删除** |
| `getInstanceIdsForPlugin(pluginId)` | 189-199 | **删除** |
| `rekeyInstance(oldInstanceId, newInstanceId)` | 202-218 | **删除** |
| `focusPluginView(instanceId)` | 226-233 | → `focusPool(zone)` |
| `toggleDevTools(instanceId)` | 236-245 | → `togglePoolDevTools(zone)` |
| `setThrottling(instanceId, isVisible)` | 260-271 | → pool 级 |
| `scheduleViewDestroy(instanceId)` | 316-331 | **删除**（Pool 无宽限期概念） |
| `cancelViewDestroy(instanceId)` | 337-349 | **删除** |
| `isInGracePeriod(instanceId)` | 357-359 | **删除** |
| `findGraceInstanceForPlugin(pluginId)` | 361-371 | **删除** |
| `cancelGraceTimer(instanceId)` | 375-382 | **删除** |
| `checkMemoryPressure()` | 384-395 | → 改为监控 2 个 Pool |
| `destroyAllPluginViews()` | 398-419 | → `destroyAllPools()` |
| `cleanupCrashedView(instanceId)` | 426-437 | → `rebuildPool(zone)` |

#### 1.1.3 验证 grep

```
# 回退后零匹配：
grep -n "instanceId" electron/window-manager.ts
grep -n "graceTimer" electron/window-manager.ts
grep -n "rekeyInstance" electron/window-manager.ts
grep -n "findGrace" electron/window-manager.ts
```

---

### 1.2 `electron/ipc-bridge.ts`（~410 行）——instanceId 队列

| 行 | 符号 | 操作 |
|:--|:--|:--|
| 6-8 | E5.5#9d 注释块 | 删 |
| 32 | `pushQueues Map<instanceId, ...>` | → `Map<zone, ...>` |
| 35 | `pluginRequestQueues Map<instanceId, ...>` | → `Map<zone, ...>` |
| 36 | （隐含）`flushing Set<instanceId>` | → `Set<zone>` |
| 122-124 | `getPluginIdFromWebContents(event.sender)` → 解构 `{ instanceId }` 做 FIFO 串行路由 | → pool zone 路由 |
| 124-130 | `pluginRequestQueues.get(instanceId)` | → pool 路由 |
| 178-186 | `bridge:pushToPlugin` handler | → `pool:push` |
| 200-214 | `pushToPlugin(instanceId, channel, payload)` | → `pushToPool(zone, ...)` |
| 222-252 | `flushPushQueue(instanceId)` | → pool 级 |
| 268 | `getPluginIdFromWebContents(event.sender)` → `plugin:emit` 来源识别 | → pool zone 路由 |
| 299-301 | `broadcastToAll` 用 `getAllInstanceIds()` | → 广播到 2 个 Pool |
| 306-309 | `replayToPlugin(instanceId)` | → pool replay |
| 315-317 | `clearPluginQueue(instanceId)` **单数**——清空单个实例队列 | → pool 级 |
| 323-327 | `clearPluginQueues(pluginId)` **复数**——遍历 `getInstanceIdsForPlugin` 清空同插件所有实例队列 | **整方法删除**（Pool 无多实例概念） |
| 343-346 | `bridge:request-to-plugin` handler | → `pool:request` |
| 390-392 | `getPluginView(target)` + `getPluginIdFromWebContents(event.sender)`——`p2p:send` 定向推流+来源识别 | → pool zone 路由 |

**验证 grep：**
```
grep -n "instanceId" electron/ipc-bridge.ts  # 零匹配
grep -n "pushToPlugin" electron/ipc-bridge.ts # 改为 pushToPool
```

---

### 1.3 `electron/plugin-view-registry.ts`（~143 行）——整文件重写

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 2-7 | 模块 JSDoc（E5.5#9b 注释） | 重写 |
| 27-34 | `registerPlugin(instanceId, ...)` | → `registerZone(zone, view)` |
| 39-40 | `unregisterPlugin(instanceId)` | → `unregisterZone(zone)` |
| 47-48 | `setBounds(instanceId, bounds)` | → pool bounds |
| 58-59 | `setVisible(instanceId, visible)` | → pool visible |
| 70-71 | `scheduleDestroy(instanceId)` | **删除** |
| 78-79 | `cancelDestroy(instanceId)` | **删除** |
| 86-89 | `reloadPlugin(instanceId)` | **删除** |
| 96-97 | `getView(instanceId)` | → pool view getter |
| 101-102 | `toggleDevTools(instanceId)` | → pool devtools |
| 106-107 | `isRegistered(instanceId)` | **删除** |
| 110-113 | `getAllInstanceIds()` | **删除** |
| 116-121 | `getInstanceIdsForPlugin(pluginId)` | **删除** |
| 124-131 | `rekeyInstance(old, new)` | **删除** |
| 133-138 | `findGraceInstance(pluginId)` | **删除** |

**验证 grep：**
```
grep -n "instanceId\|graceInstance\|rekeyInstance\|getAllInstanceIds\|getInstanceIdsForPlugin" electron/plugin-view-registry.ts  # 零匹配
```

---

### 1.4 `electron/ipc/plugin-view-handlers.ts`（~102 行）——per-tab handler 替换

| 行 | handler | 操作 |
|:--|:--|:--|
| 5-7 | E5.5#9c 注释 | 删 |
| 23-27 | `plugin-view:setVisible` | → `pool:setVisible` |
| 31-32 | `plugin-view:setBounds` | → `pool:setBounds` |
| 44-45 | `plugin-view:toggleDevTools` | → `pool:toggleDevTools` |
| 49-50 | `plugin-view:destroy` | → `pool:destroy` |
| 54-55 | `plugin-view:focus` | → `pool:focus` |
| 60-61 | `plugin-view:scheduleDestroy` | **删除** |
| 63-64 | `plugin-view:cancelDestroy` | **删除** |
| 67-69 | `plugin-view:findGraceInstance` | **删除** |
| 71-73 | `plugin-view:rekeyInstance` | **删除** |
| 77-78 | `plugin-view:reload` | **删除** |
| 82-89 | `plugin-view:create` | → 改为 Pool URL 构造 |
| 93-96 | `plugin-view:ready` | → `pool:ready` |
| 100 | 日志行——"14 个 handler" | 改日志 |

**URL 构造变更：**
```diff
- `${DEV_SERVER_URL}/plugin-view.html?pluginId=${pluginId}&instanceId=${instanceId}`
+ `${DEV_SERVER_URL}/pool.html?zone=${zone}`
```

**验证 grep：**
```
grep -n "instanceId\|graceInstance\|rekeyInstance\|plugin-view:" electron/ipc/plugin-view-handlers.ts  # 零匹配
```

---

### 1.5 `electron/main.ts`——PluginViewRegistry 全部引用更新

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 20 | `import { registerPluginViewHandlers } from './ipc/plugin-view-handlers.js'` | → `import { registerPoolHandlers } from './ipc/pool-handlers.js'` |
| 26 | `import { PluginViewRegistry } from './plugin-view-registry.js'` | → `import { PoolRegistry } from './pool-registry.js'` |
| 41 | `let pluginViewRegistry: PluginViewRegistry \| null = null;` 变量声明 | → `let poolRegistry: PoolRegistry \| null` |
| 83-84 | `pluginViewRegistry = new PluginViewRegistry(windowManager);` 初始化 | → `poolRegistry = new PoolRegistry(windowManager)` |
| 86 | `initKeyboardRouting(mainWindow, pluginViewRegistry);` 键盘路由初始化 | → `initKeyboardRouting(mainWindow, poolRegistry)` |
| 92 | `registerPluginViewHandlers(pluginViewRegistry, mainWindow);` handler 注册 | → `registerPoolHandlers(poolRegistry, mainWindow)` |
| 303 | `export { mainWindow, windowManager, pluginViewRegistry, ipcBridge };` 导出 | → `export { mainWindow, windowManager, poolRegistry, ipcBridge }` |

**验证 grep：**
```
grep -n "plugin-view-handlers\|PluginViewRegistry\|pluginViewRegistry" electron/main.ts  # 零匹配
```

> 🔍 **确认：** `pluginViewRegistry` 导出（L303）**零外部消费者**——无任何文件从 `electron/main.ts` import 此变量。改名不会产生连锁修改。

---

### 1.6 `electron/preload-shell.ts`（~350 行）——`pluginViews` 命名空间替换

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 36-41 | `_readyBuffer` + `plugin-view:ready` IPC 监听 | → `pool:ready` buffer |
| 315-320 | `pushToPlugin` / `requestToPlugin` | 改为 `pool.push` / `pool.request` |
| 332-370 | **`pluginViews` 命名空间**（14 个方法） | → `pool` 命名空间 |

**`pluginViews` 暴露面逐方法：**

| 方法 | 操作 |
|:--|:--|
| `setVisible(instanceId, v)` | → `pool.setVisible(zone, v)` |
| `setBounds(instanceId, b)` | → 壳不再管理 bounds（Pool 内部处理） |
| `getAllIds()` | **删除** |
| `getInstanceIdsForPlugin(pluginId)` | **删除** |
| `toggleDevTools(instanceId)` | → `pool.toggleDevTools(zone)` |
| `create(instanceId, pluginId)` | **删除**（Pool 创建由 WindowManager 管） |
| `destroy(instanceId)` | → `pool.destroy(zone)` |
| `scheduleDestroy(instanceId)` | **删除** |
| `cancelDestroy(instanceId)` | **删除** |
| `findGraceInstance(pluginId)` | **删除** |
| `rekeyInstance(old, new)` | **删除** |
| `reload(instanceId)` | **删除** |
| `focus(instanceId)` | → `pool.focus(zone)` |
| `onReady(cb)` | → `pool.onReady(cb)` |

**验证 grep：**
```
grep -n "pluginViews\|instanceId\|_readyBuffer" electron/preload-shell.ts  # 零匹配
```

---

### 1.7 `electron/preload-plugin.ts`（~600 行）——插件侧 per-tab 清理

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 76-78 | `E5.5#9j` 注释 + `const _urlParams = new URLSearchParams(globalThis.location?.search ?? '')` URL 解析 | **删除**（Pool 不读 URL instanceId） |
| 79 | `const _pluginInstanceId = _urlParams.get('instanceId') ?? '';` **模块级常量**——从 URL 解析的实例 ID | **整行删除** |
| 80 | `const _urlPluginId = _urlParams.get('pluginId') ?? '';` 模块级常量——从 URL 解析的插件 ID | 保留（Pool 仍需 pluginId），改为从 pool.html URL 参数获取 |
| 223-230 | **`pluginInstance` 命名空间**——`{ id: _pluginInstanceId, pluginId: _urlPluginId }`，暴露给插件侧 `window.linkdesk.pluginInstance` | → `pool: { zone: "main" \| "sidebar", pluginId }` |
| 227 | `id: _pluginInstanceId`——插件代码用 `pluginInstance.id` 做 pluginState key 前缀 | → `pool.zone`（插件代码用 `pool.zone` 识别自己是哪个 Pool） |
| 229 | `pluginId: _urlPluginId`——插件代码用 `pluginInstance.pluginId` 标识自己 | 保留（Pool 模型仍需 pluginId） |
| 401-402 | `notifyReady` 注释——E5.5#9k notifyReady 不再传参 | 改注释 |
| 404 | `notifyReady: (pluginId?) => ipcRenderer.send('plugin-view:ready', _pluginInstanceId, pluginId ?? _urlPluginId)` | → `pool.ready: () => ipcRenderer.send('pool:ready', zone, pluginId)` |

**验证 grep：**
```
grep -n "_pluginInstanceId\|_urlPluginId\|notifyReady\|pluginInstance" electron/preload-plugin.ts  # 零匹配（除 pool.*）
```

---

### 1.8 `electron/ipc/serial-handlers.ts`——`getAllInstanceIds()` 广播

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 29-30 | `getAllInstanceIds()` 遍历 → `serial:data` | → 广播到 MainPool |
| 39-40 | `getAllInstanceIds()` 遍历 → `serial:stats` | → 广播到 MainPool |
| 49-50 | `getAllInstanceIds()` 遍历 → `serial:system` | → 广播到 MainPool |

**验证 grep：**
```
grep -n "getAllInstanceIds\|getInstanceIdsForPlugin" electron/ipc/serial-handlers.ts  # 零匹配
```

---

### 1.9 `electron/ipc/file-handlers.ts`——`getAllInstanceIds()` 广播

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 79-80 | `getAllInstanceIds()` 遍历 → `filesystem:changed` | → 广播到 MainPool |

**验证 grep：**
```
grep -n "getAllInstanceIds" electron/ipc/file-handlers.ts  # 零匹配
```

---

### 1.10 `electron/keyboard-router.ts`——`PluginViewRegistry` import + 键盘分发 + monkey-patch

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 19 | `import type { PluginViewRegistry } from './plugin-view-registry.js'` | → `import type { PoolRegistry }` |
| 237 | 注释——"Monkey-patch pluginViewRegistry.registerPlugin" | 删注释 |
| 241 | 函数签名 `pluginViewRegistry: PluginViewRegistry` 参数 | → `poolRegistry: PoolRegistry` |
| 243-247 | `registerOnView` 回调——`view.webContents.on('before-input-event', ...)` | 保留逻辑，改为 Pool 级别注册 |
| 250-251 | `getAllInstanceIds()` 遍历 → 键盘事件注册 | → 发送到活跃 Pool |
| 257 | `const _origRegister = pluginViewRegistry.registerPlugin.bind(pluginViewRegistry);` | **删除** monkey-patch |
| 258 | Monkey-patched 签名 `(instanceId, pluginId, url, force?)` | **删除** |
| 259 | `const view = _origRegister(instanceId, pluginId, url, force);` | **删除** |

**验证 grep：**
```
grep -n "PluginViewRegistry\|getAllInstanceIds\|registerPlugin" electron/keyboard-router.ts  # 零匹配（除新 PoolRegistry import）
```

---

### 1.11 `src/hooks/useWebViewSync.ts`（~270 行）——🔴 整文件删除

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 1-270 | **全部** | `git rm src/hooks/useWebViewSync.ts` |

**内部符号清单（全删）：**
- `readyWebViewIds` / `setReadyWebViewIds`
- `webViewBoundsReady` / `setWebViewBoundsReady`
- `webViewTimeout` / `setWebViewTimeout`
- `registerPoolRef`
- `resetWebViewState`
- `PluginViewsAPI` 接口（13 个方法签名）
- Effect 1（onReady + 缓冲回放）
- Effect 2（ResizeObserver + bounds sync）
- Effect 3（懒创建 + 宽限期恢复 + rekey）
- Effect 4（显隐 + 焦点）
- Effect 5（废弃 WebView 清理）

**验证：**
```
test -f src/hooks/useWebViewSync.ts && echo "EXISTS" || echo "DELETED"  # DELETED
grep -rn "useWebViewSync" src/  # 零匹配
```

---

### 1.12 `src/components/MainContent.tsx`——useWebViewSync 集成剥离

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 29 | `import { useWebViewSync }` | **删 import** |
| 60 | 注释——"bridge:pushToPlugin IPC → 插件 WebView 接收" | 改注释 |
| 72-73 | `readyWebViewIds?`, `webViewBoundsReady?` prop | 删 props |
| 102 | `readyWebViewIds?.has(tab.id) && webViewBoundsReady?.has(...)` 守卫 | → 改为 Pool 就绪检查 |
| 319-326 | useWebViewSync 调用 + pv 变量 | → `usePoolSync` |
| 336 | 注释——"editor openFile IPC——编辑器独立 WebView 后，壳通过 IPC 告知文件路径" | 改注释 |
| 342-343 | `if (t.pluginId === "editor" && ...readyWebViewIds.has(...))` | → pool 就绪后 pushLayout |
| **344** | **`bridge.requestToPlugin?.(t.id, "openFile", ...)` —— `t.id` 是 instanceId 路由 key** | → `pool.pushLayout({ zone: "main", type: "openFile", ... })` |
| 347 | `readyWebViewIds, webViewBoundsReady` deps | 改 |
| 349-350 | 注释——"serial-monitor openSession" + "IPC 路由 key 从 serial-monitor 改为 instanceId (= tab.id)" | 改注释 |
| **357** | **`bridge.requestToPlugin?.(activeTab.id, "openSession", ...)` —— `activeTab.id` 是 instanceId 路由 key** | → `pool.pushLayout({ zone: "main", type: "openSession", ... })` |
| 527 | `renderTabContent(...readyWebViewIds, webViewBoundsReady)` | → `renderTabContent(tab, isFocused)` |

**验证 grep：**
```
grep -n "useWebViewSync\|readyWebViewIds\|webViewBoundsReady\|webViewTimeout" src/components/MainContent.tsx  # 零匹配
grep -n "requestToPlugin.*\.id" src/components/MainContent.tsx  # 零匹配（instanceId 路由全部移除）
```

---

### 1.13 `src/plugin-shell-main.tsx`——多 WebView 模式分支 + plugin-view 残留

> 此文件处理两种渲染模式。E5.5#9 加了模式 1（多 WebView）分支。E5.6 回退到仅模式 2（壳内渲染）。

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 4-8 | 模式 1 注释——多 WebView 渲染说明 | **删** |
| 24 | `params.get("pluginId") ?? params.get("plugin-view")` | → 仅保留 `params.get("pluginId")` |
| 27 | 多 WebView 判据注释 | 删 |
| 121-128 | `pluginViews: { notifyReady: noop, getAllIds: emptyArr, setVisible: noop, ... }` 多 WebView mock 对象 | **整块删除** |
| 122 | `notifyReady: noop` | **删** |
| 129 | E5.5#9k 注释——插件实例身份 | 删 |
| 129-133 | **`pluginInstance: { id: pluginId ?? '', pluginId: pluginId ?? '' }`** ——壳内渲染的 mock 身份，id 用 pluginId 降级 | → `pool: { zone: "shell", pluginId }`（壳内渲染不再需要 faked instanceId） |
| 229 | 错误消息 `缺少参数: ?plugin-view=...` | → 改消息，删 `plugin-view` 提及 |
| 323-324 | `window.linkdesk?.pluginViews?.notifyReady?.()` | **删** |

**验证 grep：**
```
grep -n "plugin-view\|notifyReady\|pluginViews" src/plugin-shell-main.tsx  # 零匹配
```

---

### 1.14 `src/pluginLoader/loader.ts`——useWebViewSync 注释

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 906 | `useWebViewSync Effect 3 ...` 注释 | 删注释 |

---

### 1.15 `src/pluginLoader/viewRegistry.ts`——pluginViews + requestToPlugin 引用

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 69 | JSDoc——"读取 tabBehavior 声明，依次执行 confirmOnClose 弹窗和 invokeBeforeClose 命令" | 保留注释，改"WebView"→"插件" |
| 72 | 注释——"invokeBeforeClose 走 requestToPlugin——壳发请求到插件 WebView，插件自己判断+处理" | 改注释 |
| 76 | `invokeBeforeCloseTab(pluginId: string)` 函数签名 | 保留（Pool 模型仍需关闭确认） |
| 81-85 | `requestToPlugin?.(pluginId, "invokeBeforeClose", {})` —— `pluginId` **作为 instanceId 路由 key** | → `pool.request({ zone: "main", pluginId, method: "invokeBeforeClose" })` |
| 120 | `const pv = linkdesk()?.pluginViews` | → `linkdesk()?.pool` |
| 121-123 | `pv?.getInstanceIdsForPlugin(pluginId).then(...)` | → pool 级 API |
| 126 | 降级注释 `pluginId = instanceId`（E5.5#9 兼容代码） | **删** |

---

### 1.16 `src/core/api/linkdesk-api.ts`——pluginInstance + pluginViews 类型定义

| 行 | 符号 | 操作 |
|:--|:--|:--|
| 187-193 | **`pluginInstance: { id: string; pluginId: string }`** ——E5.5#9j 类型，`id` 即 instanceId | → `pool: { zone: string; pluginId: string }` |
| 196-215 | **`pluginViews` 命名空间**（19 行类型） | → `pool` 命名空间 |
| 197 | `notifyReady(pluginId?: string): void` | → `pool.ready()` |
| 198 | `getAllIds?(): Promise<string[]>` | **删**（Pool 无多实例概念） |
| 199 | `getInstanceIdsForPlugin?(pluginId): Promise<string[]>` | **删** |
| 200-203 | `setVisible?` / `setBounds?` / `destroy?` / `toggleDevTools?`（id 参数） | → pool 级等价（zone 参数取代 id） |
| 204 | `scheduleDestroy?(id: string): void` | **删** |
| 205 | `cancelDestroy?(id: string): Promise<boolean>` | **删** |
| 207 | `findGraceInstance?(pluginId): Promise<string \| undefined>` | **删** |
| 209 | `rekeyInstance?(oldInstanceId, newInstanceId): Promise<boolean>` | **删** |
| 210-211 | `reload?` / `create?`（instanceId 参数） | **删**（Pool 管理自己的生命周期） |
| 212-214 | `focus?` / `onReady?`（instanceId 参数） | → pool 级等价 |

**验证 grep：**
```
grep -n "pluginInstance\|pluginViews\|notifyReady\|findGraceInstance\|rekeyInstance\|scheduleDestroy\|cancelDestroy\|getInstanceIdsForPlugin\|getAllIds" src/core/api/linkdesk-api.ts  # 零匹配（除 pool）
```

---

### 1.17 `plugins/user/lang-defaults/en.json`——i18n 字符串

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 95 | `"缺少参数: ?plugin-view=<插件ID>"` | → `"缺少参数: ?pluginId=<插件ID>"`（仅保留 pluginId 参数） |

**验证 grep：**
```
grep -n "plugin-view" plugins/user/lang-defaults/en.json  # 零匹配
```

---

### 1.18 `plugin-view.html`（项目根）——🔴 整文件删除

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 1-30 | Per-Tab WebView 的 HTML 入口 | `git rm plugin-view.html`（Phase 8） |

> **注意：** `plugin-view.html` 不在 Vite `rollupOptions.input` 中（`vite.config.ts:79-80` 仅 `main: index.html`），所以删除不影响构建。Vite dev server 仅在 dev mode 直接 serve 它。

**验证：**
```
test -f plugin-view.html && echo "EXISTS" || echo "DELETED"  # DELETED
```

---

### 1.19 🔴 `src/core/builtin/developerCommands.ts`——pluginViews 消费者

> 此文件在 E5#44-4 创建，E5.5#7 添加了 `pluginViews.*` 调用——不在 E5.5#9 commit 中但被动消费 per-tab API。

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 19 | `const lk = window.linkdesk;` | 保留（改为访问 `pool`） |
| 20 | `lk?.pluginViews?.getAllIds?.()` —— 列出所有 instanceId 供 QuickPick 选择 | → `pool.listZones()` |
| 21-22 | `webViewIds.map(id => ({ kind: 'plugin', id }))` —— id 即 instanceId | → zone 列表 |
| 30 | `t.kind === 'shell' ? 'shell 壳窗口' : t.id` —— 显示 instanceId | → 显示 zone 名 |
| 35 | `lk?.pluginViews?.toggleDevTools?.(t.id)` —— `t.id` 即 instanceId | → `pool.toggleDevTools(zone)` |

**验证 grep：**
```
grep -n "pluginViews\|getAllIds" src/core/builtin/developerCommands.ts  # 零匹配
```

---

### 1.20 🔴 `src/core/services/DialogService.ts`——pluginViews 消费者

> 此文件在 E5#85 添加 `_hideAllPluginViews()`——弹窗时将原生 WebContentsView 移到屏幕外防遮挡。

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 72 | `const OFF_SCREEN = { x: -10000, y: -10000, width: 1, height: 1 }` | 保留（Pool 仍需屏幕外隐藏） |
| 74-86 | `_hideAllPluginViews()` —— `getAllIds()` → `setVisible(id, false)` + `setBounds(id, OFF_SCREEN)` 逐个隐藏 | → `_hideAllPools()` —— 隐藏 SidebarPool + MainPool 两个 zone |
| 78 | `const ids: string[] = await pv.getAllIds()` | → pool zone 列表 |
| 80-83 | `ids.map(id => Promise.all([pv.setVisible(id, false), pv.setBounds(id, OFF_SCREEN)]))` | → 对 2 个 pool zone 操作 |
| 85 | `catch { /* pluginViews 不可用 */ }` | 改注释 |

**验证 grep：**
```
grep -n "pluginViews\|getAllIds" src/core/services/DialogService.ts  # 零匹配
```

---

### 1.21 🟢 ShellPluginComponent.tsx——不存在

> E5.6#36 原计划删除此文件，但 grep 全量结果为 **0 匹配**——此文件从未被创建。从 E5.6#36 中移除。

---

### 1.22 🟢 全量确认——插件代码零沾染

| 检查范围 | 结果 |
|:--|:--|
| `plugins/user/*/src/**/*.{ts,tsx}` — per-tab 符号 | **零匹配** ✅ |
| `src/__tests__/**` — per-tab 符号 | **零匹配** ✅ |
| `node_modules` | **排除**——第三方代码不受影响 |

> 插件和测试代码完全不引用 `instanceId` / `rekeyInstance` / `findGraceInstance` / `graceTimers` / `notifyReady` / `readyWebViewIds` / `webViewBoundsReady` / `pluginViews`。回退对插件零影响。

---

### 1.23 🟢 `electron/ipc/lsp-handlers.ts`——仅历史注释，无需修改

| 行 | 内容 | 原因 |
|:--|:--|:--|
| 143-144 | 注释——"旧代码用 pluginId → `getPluginView('python')` 永远 null" | 此 Bug 已在 E5.5#7 修复——改用 `event.sender` 路由。**无 active per-tab 代码**，注释仅作历史记录 |

> `lsp-handlers.ts` 已完成 per-tab 适配——用 `event.sender`（WebContents）路由 LSP 数据，不依赖 `getPluginView(pluginId)`。回退无需修改此文件。

---

## 2. 不需要回退的文件（保留）

| 文件 | 原因 |
|:--|:--|
| `src/core/services/LayoutEngine.ts` | 仍需要——Pool bounds 管理 |
| `src/App.tsx` | zoneBounds 保留——壳 layout 逻辑不变（侧栏/主区位置不动） |
| `src/components/SidePanel.tsx` | 保留——壳侧栏容器 |
| `src/components/TabBar.tsx` | 保留——壳渲染 TabBar |
| `src/components/StatusBar.tsx` | 保留——壳渲染 StatusBar |
| `plugin-view.html` | **Phase 8 删除**（Phase 1-7 暂留作 fallback） |

---

## 3. 执行顺序（两阶段）

### Phase 1：禁用——不删代码，只断调用链

| 步骤 | 文件 | 操作 | 行 |
|:--|:--|:--|:--|
| 1 | `window-manager.ts` | `createPluginView` → early return + console.error | ~59 |
| 2 | `plugin-view-handlers.ts` | `plugin-view:create` → early return + 日志 | ~83 |
| 3 | `MainContent.tsx` | useWebViewSync 调用 → 注释，返回空状态 | ~320-326 |
| 4 | `loader.ts` | 注释 `// E5.6: per-tab disabled` | ~906 |
| 5 | `plugin-shell-main.tsx` | `if (isDevMode)` 多 WebView 分支 → `false` | — |
| 6 | `npm run check` | tsc + ESLint + vitest | — |

### Phase 8：删除——确认双Pool稳定后物理删除

| 步骤 | 文件 | 操作 |
|:--|:--|:--|
| 1 | `useWebViewSync.ts` | `git rm` |
| 2 | `window-manager.ts` | 删 ~180 行 per-tab 方法 |
| 3 | `plugin-view-registry.ts` | 删 ~100 行 instanceId 路由 |
| 4 | `plugin-view-handlers.ts` | 删 ~80 行旧 handler |
| 5 | `preload-shell.ts` | 删 ~30 行 pluginViews 命名空间 |
| 6 | `preload-plugin.ts` | 删 ~10 行 |
| 7 | 其余文件 | 清理残余引用 |
| 8 | `plugin-view.html` | `git rm`（Pool 模型下无人加载） |
| 9 | `ShellPluginComponent.tsx` | `git rm`（Phase 1 不再渲染插件到壳 DOM） |

---

## 4. 全量验证 grep

```bash
# 回退完成后必须零匹配的命令：
grep -rn "instanceId" src/ electron/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v '.d.ts'
grep -rn "rekeyInstance\|findGraceInstance\|graceTimers" src/ electron/
grep -rn "notifyReady" src/ electron/ | grep -v node_modules
grep -rn "readyWebViewIds\|webViewBoundsReady\|webViewTimeout" src/ electron/
grep -rn "useWebViewSync" src/
grep -rn "pluginViews\." electron/preload-shell.ts
grep -rn "getAllInstanceIds\|getInstanceIdsForPlugin" src/ electron/ | grep -v node_modules
```

---

> **← E5.6#0a 审计完成（五轮自检 + git 历史对照）。** 共 18 个源文件需要修改 + 2 个整文件删除 + 1 个仅含历史注释（无需修改）。所有 instanceId/grace/rekey/requestToPlugin/getPluginView/getPluginIdFromWebContents/pluginViewRegistry/pluginInstance/pluginViews 引用已枚举到行号。E5.5#9 全部 commit 逐文件对照无遗漏。插件零沾染。
> **→ 下一步：** E5.6#0b 审计通信链路。
