# E5.5#9 Per-Tab WebView——设计文档

> 2026-08-08。**从 `pluginId → WebContentsView` (1:1) 升级为 `instanceId → WebContentsView` (1:1 per tab)。**
> 核心动机：编辑器分屏（左 hello.c / 右 hello.h）、串口多会话（COM3 + COM5 同时开）、任何插件多标签页——全链路支持。

---

## 1. 问题

### 1.1 当前架构

```
pluginId "editor"    →  一个 WebContentsView
  标签页 "main.py"   →  setBounds + openFile("main.py")
  标签页 "utils.py"  →  同一个 WebView，openFile("utils.py") 顶掉 main.py → main.py 标签页白屏
```

**根因链：**

| 层 | 文件 | 代码 | 问题 |
|:--|:--|:--|:--|
| 注册表 | `plugin-view-registry.ts:27` | `!this.windowManager.hasPluginView(pluginId)` | 已有则不创建——幂等阻止第二个 WebView |
| 映射 | `window-manager.ts:21` | `pluginViews = new Map<pluginId, View>` | Map key 是 pluginId——同插件第二个标签页 key 碰撞 |
| 同步 | `useWebViewSync.ts:149` | `currentStates.set(tab.pluginId, ...)` | 同 pluginId → 覆盖前一个标签页的 bounds/visible 状态 |
| 渲染 | `MainContent.tsx:101` | `readyWebViewIds.has(tab.pluginId)` | 用 pluginId 查 ready 状态——不是 tabId |

### 1.2 为什么必须修

1. **分屏编辑器**——左 hello.c / 右 hello.h，同插件两个标签页同时可见。一个 WebView 只有一个 bounds 位置 → 物理不可能。
2. **分屏串口**——COM3 + COM5 同时监控，两个独立数据流。
3. **任何插件**——只要 `singleton: false` + 不同 `sourceId`，就允许多标签页。基础设施必须支持。
4. **对标 VS Code**——VS Code 每个编辑器标签页背后有独立渲染上下文。

---

## 2. 方案

### 2.1 核心变更：key = `tab.id`（instanceId）

```
现在：pluginId → WebContentsView (1:1)

改为：tab.id (instanceId) → WebContentsView (1:1 per tab)

标签页 "tab-abc" (editor, main.py)    → WebContentsView A → Monaco 加载 main.py
标签页 "tab-def" (editor, utils.py)   → WebContentsView B → Monaco 加载 utils.py
标签页 "tab-ghi" (serial, COM3)       → WebContentsView C → 串口连接 COM3
标签页 "tab-jkl" (serial, COM5)       → WebContentsView D → 串口连接 COM5
```

### 2.2 instanceId 的生命周期

```
1. useTabManager 创建 Tab → 分配唯一 tab.id（已有，不需改）
2. useWebViewSync 检测到新 tab.id 不在 prev 中 → pv.create(tab.id, pluginId)
3. plugin-view:create handler → 构建 URL "plugin-view.html?pluginId=editor&instanceId=tab-abc"
4. WindowManager.createPluginView("tab-abc", url) → pluginViews.set("tab-abc", view)
5. WebView 加载 → preload-plugin.ts 从 URL 读 instanceId → 暴露 window.linkdesk.pluginInstance
6. plugin-shell-main.tsx 读 instanceId → notifyReady(instanceId)
7. 壳收到 ready → readyWebViewIds.add("tab-abc")
8. MainContent 渲染 → readyWebViewIds.has(tab.id) → 空 div 占位，WebView 覆盖
9. 标签页关闭 → scheduleDestroy(instanceId) → 60s 宽限期 → 真销毁
```

### 2.3 URL 协议

插件 WebView 加载 URL 加两个 query param：

```
dev:  http://localhost:1420/plugin-view.html?pluginId=editor&instanceId=tab-abc
prod: linkdesk://editor/plugin-view.html?pluginId=editor&instanceId=tab-abc
```

`pluginId` 仍在 URL 中——preload 需要它挂载正确的 `contextBridge` API 命名空间。`instanceId` 是本次新增——让插件知道"我是哪个标签页"。

---

## 3. 改动清单——逐文件

### 第 1 层：主进程

#### 3.1 `electron/window-manager.ts`

**核心：Map key 从 `pluginId` 改为 `instanceId`。值从裸 View 升级为复合结构——一个 Map 同时服务正查 + 反查，不需要辅助索引。所有方法签名同步更新。**

| 方法 | 旧签名 | 新签名 | 改动 |
|:--|:--|:--|:--|
| `pluginViews` | `Map<pluginId, View>` | `Map<instanceId, { view: WebContentsView, pluginId: string }>` | 复合值——归一化 |
| `createPluginView` | `(pluginId, url)` | `(instanceId, pluginId, url)` | +1 参数 |
| `destroyPluginView` | `(pluginId)` | `(instanceId)` | 重命名参数 |
| `getPluginView` | `(pluginId)` → `View\|undefined` | `(instanceId)` → `WebContentsView\|undefined`（从复合值取 `.view`） | 同上 |
| `hasPluginView` | `(pluginId)` → `boolean` | `(instanceId)` → `boolean` | 同上 |
| `getAllPluginIds` | `()` → `string[]` | `getAllInstanceIds()` → `string[]` | 重命名 |
| `getPluginIdFromWebContents` | `(wc)` → `pluginId\|undefined` | `(wc)` → `{ pluginId, instanceId }\|undefined`（从复合值取 `.pluginId`） | 返回结构变更 |
| `focusPluginView` | `(pluginId)` | `(instanceId)` | 重命名参数 |
| `toggleDevTools` | `(pluginId)` | `(instanceId)` | 同上 |
| `setThrottling` | `(pluginId, isVisible)` | `(instanceId, isVisible)` | 同上 |
| `scheduleViewDestroy` | `(pluginId)` | `(instanceId)` | 同上 |
| `cancelViewDestroy` | `(pluginId)` → `boolean` | `(instanceId)` → `boolean` | 同上 |
| `cleanupCrashedView` | `(pluginId)` | `(instanceId)` | 同上 |
| | | **新增** `getInstanceIdsForPlugin(pluginId): string[]` | 遍历单一 Map 过滤 `.pluginId` |
| | | **新增** `rekeyInstance(oldIid, newIid): boolean` | 宽限期恢复时重映射 |

**单 Map 复合值——不需要 `_instancePluginMap`：**

```typescript
// pluginViews 的完整类型。一个 Map，两个查询方向：
//   正查: pluginViews.get(instanceId).view → WebContentsView
//   反查: pluginViews.get(instanceId).pluginId → string
private pluginViews = new Map<string, {
  view: WebContentsView;
  pluginId: string;
}>();
```

**`createPluginView` 关键变更：**

```typescript
// 改前
createPluginView(pluginId: string, url: string): WebContentsView {
  if (this.pluginViews.has(pluginId)) {
    this.destroyPluginView(pluginId);  // 同 pluginId 覆盖
  }
  // ...
  this.pluginViews.set(pluginId, view);
}

// 改后
createPluginView(instanceId: string, pluginId: string, url: string): WebContentsView {
  // 不检查 has(instanceId)——每个 instanceId 是唯一的 tab.id
  // 如果旧 instanceId 残留（宽限期恢复后 rekey），由调用方先调 rekeyInstance
  // ...
  view.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[WindowManager] 插件 "${pluginId}" (instance: ${instanceId}) 崩溃:`, details.reason);
    this.cleanupCrashedView(instanceId);
  });
  // console-message tag 同时显示 instanceId + pluginId
  view.webContents.on('console-message', (_, level, message) => {
    const tag = `[plugin:${pluginId}#${instanceId.slice(-6)}]`;
    // ...
  });
  this.pluginViews.set(instanceId, { view, pluginId });  // 复合值——一次 set
}
```

**`getPluginView` 改为从复合值取 `.view`：**

```typescript
getPluginView(instanceId: string): WebContentsView | undefined {
  return this.pluginViews.get(instanceId)?.view;
}
```

**`destroyPluginView` 同时清理复合值：**

```typescript
destroyPluginView(instanceId: string): void {
  const entry = this.pluginViews.get(instanceId);
  if (!entry) return;
  entry.view.webContents.close();  // 或根据需求
  (entry.view as any).webContents?.destroy?.();
  this.pluginViews.delete(instanceId);  // 一次 delete——复合值整体删除
}
```

**`rekeyInstance`（新增——宽限期恢复时用）：**

```typescript
/** 同一插件的旧 WebView 重分配给新 instanceId（宽限期恢复场景） */
rekeyInstance(oldInstanceId: string, newInstanceId: string): boolean {
  const entry = this.pluginViews.get(oldInstanceId);
  if (!entry) return false;
  this.pluginViews.delete(oldInstanceId);
  this.pluginViews.set(newInstanceId, entry);  // 复合值整体迁移
  // 同步更新 graceTimers
  const timer = this.graceTimers.get(oldInstanceId);
  if (timer) {
    this.graceTimers.delete(oldInstanceId);
    this.graceTimers.set(newInstanceId, timer);
  }
  return true;
}
```

**`getInstanceIdsForPlugin`——遍历单 Map 过滤：**

```typescript
getInstanceIdsForPlugin(pluginId: string): string[] {
  const ids: string[] = [];
  for (const [iid, entry] of this.pluginViews) {
    if (entry.pluginId === pluginId) ids.push(iid);
  }
  return ids;
}
```

**`getPluginIdFromWebContents`——从复合值取 `.pluginId`：**

```typescript
getPluginIdFromWebContents(wc: WebContents): { pluginId: string; instanceId: string } | undefined {
  for (const [iid, entry] of this.pluginViews) {
    if (entry.view.webContents === wc) return { pluginId: entry.pluginId, instanceId: iid };
  }
  return undefined;
}
```

> **归一化：** 只有一个 Map。`set`/`delete`/`rekey` 都是一次操作——不存在两个 Map 不同步的 bug。`getView` 取 `.view`，`getInstanceIdsForPlugin` 过滤 `.pluginId`，`getPluginIdFromWebContents` 遍历比对 `webContents`。三个查询方向，一个数据源。

**保活宽限期 `graceTimers` key：** `pluginId` → `instanceId`

**内存监控 `checkMemoryPressure`：** 遍历 `pluginViews`（现在 key 是 instanceId），不变。

**预估改动：** −45/+65 行（净增 ~20 行）

---

#### 3.2 `electron/plugin-view-registry.ts`

**核心：所有方法签名从 `pluginId` 改为 `instanceId`。`registerPlugin` 加 `pluginId` 参数透传给 WindowManager。**

| 方法 | 旧签名 | 新签名 |
|:--|:--|:--|
| `registerPlugin` | `(pluginId, url, force?)` | `(instanceId, pluginId, url, force?)` |
| `unregisterPlugin` | `(pluginId)` | `(instanceId)` |
| `setBounds` | `(pluginId, bounds)` | `(instanceId, bounds)` |
| `setVisible` | `(pluginId, visible)` | `(instanceId, visible)` |
| `scheduleDestroy` | `(pluginId)` | `(instanceId)` |
| `cancelDestroy` | `(pluginId)` → `boolean` | `(instanceId)` → `boolean` |
| `reloadPlugin` | `(pluginId)` | `(instanceId)` |
| `getView` | `(pluginId)` → `View\|undefined` | `(instanceId)` → `View\|undefined` |
| `isRegistered` | `(pluginId)` → `boolean` | `(instanceId)` → `boolean` |
| `getAllPluginIds` | `()` → `string[]` | `getAllInstanceIds()` → `string[]` |
| `toggleDevTools` | `(pluginId)` | `(instanceId)` |
| | | **新增** `getInstanceIdsForPlugin(pluginId): string[]` |
| | | **新增** `rekeyInstance(oldIid, newIid): boolean` |

**预估改动：** −25/+35 行（净增 ~10 行）

---

#### 3.3 `electron/ipc/plugin-view-handlers.ts`

**所有 handler 参数从 `pluginId` 改为 `instanceId`。`plugin-view:create` 多收一个 `pluginId`。**

```typescript
// 改前
ipcMain.handle('plugin-view:create', (_event, pluginId: string) => {
  const url = isDev
    ? `${DEV_SERVER_URL}/plugin-view.html?plugin-view=${pluginId}`
    : `linkdesk://${pluginId}/plugin-view.html?plugin-view=${pluginId}`;
  _registry?.registerPlugin(pluginId, url);
});

// 改后
ipcMain.handle('plugin-view:create', (_event, instanceId: string, pluginId: string) => {
  const url = isDev
    ? `${DEV_SERVER_URL}/plugin-view.html?pluginId=${pluginId}&instanceId=${instanceId}`
    : `linkdesk://${pluginId}/plugin-view.html?pluginId=${pluginId}&instanceId=${instanceId}`;
  _registry?.registerPlugin(instanceId, pluginId, url);
});
```

**完整 handler 表：**

| Channel | 旧参数 | 新参数 |
|:--|:--|:--|
| `plugin-view:create` | `(pluginId)` | `(instanceId, pluginId)` |
| `plugin-view:setVisible` | `(pluginId, visible)` | `(instanceId, visible)` |
| `plugin-view:setBounds` | `(pluginId, bounds)` | `(instanceId, bounds)` |
| `plugin-view:getAllIds` | → `string[]` | → `string[]`（返回 instanceIds） |
| `plugin-view:toggleDevTools` | `(pluginId)` | `(instanceId)` |
| `plugin-view:destroy` | `(pluginId)` | `(instanceId)` |
| `plugin-view:focus` | `(pluginId)` | `(instanceId)` |
| `plugin-view:scheduleDestroy` | `(pluginId)` | `(instanceId)` |
| `plugin-view:cancelDestroy` | `(pluginId)` → `boolean` | `(instanceId)` → `boolean` |
| `plugin-view:ready` | `(pluginId)` → 转发壳 | `(instanceId, pluginId)` → 转发壳 |

**`plugin-view:ready` 关键变更：**

```typescript
// 改前
ipcMain.on('plugin-view:ready', (_event, pluginId: string) => {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    _mainWindow.webContents.send('plugin-view:ready', pluginId);
  }
});

// 改后
ipcMain.on('plugin-view:ready', (_event, instanceId: string, pluginId: string) => {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    _mainWindow.webContents.send('plugin-view:ready', instanceId, pluginId);
  }
});
```

**预估改动：** −20/+30 行（净增 ~10 行）

---

#### 3.4 `electron/ipc-bridge.ts`

**核心：`broadcast` / `pushToPlugin` / `requestToPlugin` / `replayToPlugin` 全部从 `pluginId` 切 `instanceId`。**

| 方法 | 旧 | 新 |
|:--|:--|:--|
| `broadcast(channel, payload, source?)` | 遍历 `getAllPluginIds()` | 遍历 `getAllInstanceIds()` |
| `pushToPlugin(pluginId, channel, payload, source?)` | `getPluginView(pluginId)` | `pushToPlugin(instanceId, channel, payload, source?)` → `getPluginView(instanceId)` |
| `replayToPlugin(pluginId)` | `pushToPlugin(pluginId, ...)` | `replayToPlugin(instanceId)` → `pushToPlugin(instanceId, ...)` |
| `registerPushListener` | `{ pluginId, channel, payload }` | `{ instanceId, channel, payload }` |
| `registerRequestToPluginListener` | `(pluginId, channel, payload)` | `(instanceId, channel, payload)` |
| `getPluginIdFromWebContents` | 返回 `pluginId\|undefined` | → `windowManager.getPluginIdFromWebContents` 现在返回 `{ pluginId, instanceId }\|undefined` |
| `pluginRequestQueues` | `Map<pluginId, Promise>` | `Map<instanceId, Promise>`（每实例独立队列） |

**`broadcast` 变更：**

```typescript
// 改前
broadcast(channel: string, payload: unknown, source?: string): void {
  this.lastBroadcasts.set(channel, payload);
  for (const pluginId of this.windowManager.getAllPluginIds()) {
    const view = this.windowManager.getPluginView(pluginId);
    if (view) view.webContents.send('plugin:push', { channel, payload, source });
  }
}

// 改后
broadcast(channel: string, payload: unknown, source?: string): void {
  this.lastBroadcasts.set(channel, payload);
  for (const instanceId of this.windowManager.getAllInstanceIds()) {
    const view = this.windowManager.getPluginView(instanceId);
    if (view) view.webContents.send('plugin:push', { channel, payload, source });
  }
}
```

**`registerRequestToPluginListener` 变更：**

```typescript
// 改前
ipcMain.handle('bridge:request-to-plugin', async (_event, pluginId: string, channel: string, payload: unknown) => {
  const view = this.windowManager.getPluginView(pluginId);
  // ...
});

// 改后
ipcMain.handle('bridge:request-to-plugin', async (_event, instanceId: string, channel: string, payload: unknown) => {
  const view = this.windowManager.getPluginView(instanceId);
  // ...
});
```

**`registerPushListener` 变更：**

```typescript
// 改前
ipcMain.on('bridge:pushToPlugin', (_event, { pluginId, channel, payload }) => {
  this.pushToPlugin(pluginId, channel, payload, "shell");
});

// 改后
ipcMain.on('bridge:pushToPlugin', (_event, { instanceId, channel, payload }) => {
  this.pushToPlugin(instanceId, channel, payload, "shell");
});
```

**`getPluginIdFromWebContents` 返回结构变更：**

```typescript
// 改前——ipc-bridge.ts 调用
const pluginId = this.windowManager.getPluginIdFromWebContents(event.sender);
if (pluginId) {
  // pluginRequestQueues keyed by pluginId
}

// 改后——WindowManager 返回 { pluginId, instanceId }
const info = this.windowManager.getPluginIdFromWebContents(event.sender);
if (info) {
  // pluginRequestQueues keyed by instanceId
  const prev = this.pluginRequestQueues.get(info.instanceId) ?? Promise.resolve();
  // ...
}
```

**`clearPluginQueue`：**

```typescript
// 改前
clearPluginQueue(pluginId: string): void {
  this.pluginRequestQueues.delete(pluginId);
}

// 改后——清空指定插件的所有实例队列
clearPluginQueues(pluginId: string): void {
  const instanceIds = this.windowManager.getInstanceIdsForPlugin(pluginId);
  for (const iid of instanceIds) {
    this.pluginRequestQueues.delete(iid);
  }
}
```

**预估改动：** −30/+35 行（净增 ~5 行）

---

#### 3.5 `electron/keyboard-router.ts`

`initKeyboardRouting` 的遍历从 `getAllPluginIds()` 改为 `getAllInstanceIds()`。`registerPlugin` monkey-patch 不变——参数改为 `instanceId`。

```typescript
// 改前
for (const pluginId of pluginViewRegistry.getAllPluginIds()) {
  const view = pluginViewRegistry.getView(pluginId);
  if (view) registerOnView(view);
}

// 改后
for (const instanceId of pluginViewRegistry.getAllInstanceIds()) {
  const view = pluginViewRegistry.getView(instanceId);
  if (view) registerOnView(view);
}
```

**预估改动：** −5/+5 行

---

#### 3.6 `electron/main.ts`

不变——main.ts 只做 wiring，不直接传 pluginId。`WindowManager` / `PluginViewRegistry` / `IpcBridge` / `registerPluginViewHandlers` 初始化调用不变。

---

### 第 2 层：壳侧（渲染进程 + preload）

#### 3.7 `electron/preload-shell.ts`

**`pluginViews` API 所有方法从 `pluginId` 改为 `instanceId`。`create` 多传 `pluginId`。**

```typescript
// 改前
pluginViews: {
  create: (pluginId: string) => ipcRenderer.invoke('plugin-view:create', pluginId),
  setVisible: (pluginId: string, visible: boolean) => ipcRenderer.invoke('plugin-view:setVisible', pluginId, visible),
  setBounds: (pluginId: string, bounds) => ipcRenderer.invoke('plugin-view:setBounds', pluginId, bounds),
  getAllIds: () => ipcRenderer.invoke('plugin-view:getAllIds'),
  scheduleDestroy: (pluginId: string) => ipcRenderer.invoke('plugin-view:scheduleDestroy', pluginId),
  cancelDestroy: (pluginId: string) => ipcRenderer.invoke('plugin-view:cancelDestroy', pluginId),
  focus: (pluginId: string) => ipcRenderer.invoke('plugin-view:focus', pluginId),
  reload: (pluginId: string) => ipcRenderer.invoke('plugin-view:reload', pluginId),
  toggleDevTools: (pluginId: string) => ipcRenderer.invoke('plugin-view:toggleDevTools', pluginId),
  onReady: ...,
}

// 改后
pluginViews: {
  create: (instanceId: string, pluginId: string) => ipcRenderer.invoke('plugin-view:create', instanceId, pluginId),
  setVisible: (instanceId: string, visible: boolean) => ipcRenderer.invoke('plugin-view:setVisible', instanceId, visible),
  setBounds: (instanceId: string, bounds) => ipcRenderer.invoke('plugin-view:setBounds', instanceId, bounds),
  getAllIds: () => ipcRenderer.invoke('plugin-view:getAllIds'),
  getInstanceIdsForPlugin: (pluginId: string) => ipcRenderer.invoke('plugin-view:getInstanceIdsForPlugin', pluginId),
  scheduleDestroy: (instanceId: string) => ipcRenderer.invoke('plugin-view:scheduleDestroy', instanceId),
  cancelDestroy: (instanceId: string) => ipcRenderer.invoke('plugin-view:cancelDestroy', instanceId),
  focus: (instanceId: string) => ipcRenderer.invoke('plugin-view:focus', instanceId),
  reload: (instanceId: string) => ipcRenderer.invoke('plugin-view:reload', instanceId),
  toggleDevTools: (instanceId: string) => ipcRenderer.invoke('plugin-view:toggleDevTools', instanceId),
  onReady: ..., // callback 收到 instanceId 而非 pluginId
}
```

**`bridge.requestToPlugin` / `bridge.pushToPlugin`：**

```typescript
// 改前
requestToPlugin: (pluginId: string, channel: string, payload: unknown) =>
  ipcRenderer.invoke('bridge:request-to-plugin', pluginId, channel, payload),
pushToPlugin: (pluginId: string, channel: string, payload: unknown) =>
  ipcRenderer.send('bridge:pushToPlugin', { pluginId, channel, payload }),

// 改后
requestToPlugin: (instanceId: string, channel: string, payload: unknown) =>
  ipcRenderer.invoke('bridge:request-to-plugin', instanceId, channel, payload),
pushToPlugin: (instanceId: string, channel: string, payload: unknown) =>
  ipcRenderer.send('bridge:pushToPlugin', { instanceId, channel, payload }),
```

**`onReady` 回调签名变更：**

```typescript
// 改前：callback 收到 pluginId
// 改后：callback 收到 instanceId
onReady: (cb: (instanceId: string) => void) => { ... }
```

**预估改动：** −25/+35 行（净增 ~10 行）

---

#### 3.8 `src/hooks/useWebViewSync.ts`

**核心：所有映射 key 从 `tab.pluginId` 改为 `tab.id`。**

**Effect 3 中的 `currentStates` 构建：**

```typescript
// 改前
for (const tab of g.tabs) {
  if (tab.pluginId && !isShellRenderedTab(tab.type)) {
    currentStates.set(tab.pluginId, { groupId: g.id, isVisible: ... });
  }
}

// 改后
for (const tab of g.tabs) {
  if (tab.pluginId && !isShellRenderedTab(tab.type)) {
    currentStates.set(tab.id, { pluginId: tab.pluginId, groupId: g.id, isVisible: ... });
  }
}
```

**对比 prev 时的判断：**

```typescript
// 改前
const prevState = prev.get(pluginId);
if (!prevState) {
  pv.cancelDestroy(pluginId)...
  pv.create(pluginId);
}

// 改后
const prevState = prev.get(instanceId); // instanceId = tab.id
if (!prevState) {
  pv.cancelDestroy(instanceId)...
  pv.create(instanceId, pluginId);
}
```

**setVisible / setBounds / scheduleDestroy 调用：**

```typescript
// 改前
pv.setVisible(pluginId, state.isVisible);
pv.setBounds(pluginId, bounds);
pv.scheduleDestroy(pluginId);

// 改后
pv.setVisible(instanceId, state.isVisible);
pv.setBounds(instanceId, bounds);
pv.scheduleDestroy(instanceId);
```

**`resetWebViewState`——插件卸载时清所有实例：**

```typescript
// 改前
resetWebViewState: (pluginId: string) => {
  setReadyWebViewIds(prev => { const next = new Set(prev); next.delete(pluginId); return next; });
  // ...
}

// 改后
resetWebViewState: (pluginId: string) => {
  // 清空该插件所有实例的 ready 状态
  pv?.getInstanceIdsForPlugin?.(pluginId).then((ids: string[]) => {
    setReadyWebViewIds(prev => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
    // 同清 webViewBoundsReady / webViewTimeout
  }).catch(() => {});
}
```

**`PluginViewsAPI` 类型更新：**

```typescript
export interface PluginViewsAPI {
  onReady(cb: (instanceId: string) => void): () => void;
  getAllIds(): Promise<string[]>;
  getInstanceIdsForPlugin(pluginId: string): Promise<string[]>;
  setVisible(instanceId: string, visible: boolean): void;
  setBounds(instanceId: string, bounds: ...): Promise<void>;
  scheduleDestroy(instanceId: string): void;
  cancelDestroy(instanceId: string): Promise<boolean>;
  create(instanceId: string, pluginId: string): void;
  focus(instanceId: string): void;
}
```

**预估改动：** −30/+35 行（净增 ~5 行）

---

#### 3.9 `src/components/MainContent.tsx`

**`renderTabContent`：**

```typescript
// 改前
if (readyWebViewIds?.has(tab.pluginId) && webViewBoundsReady?.has(tab.pluginId)) {
  return <div key={tab.id} className="plugin-webview-placeholder" />;
}

// 改后
if (readyWebViewIds?.has(tab.id) && webViewBoundsReady?.has(tab.id)) {
  return <div key={tab.id} className="plugin-webview-placeholder" />;
}
```

**编辑器 `openFile` IPC（345 行附近）：**

```typescript
// 改前
if (t.pluginId === "editor" && t.sourceId && readyWebViewIds.has("editor")) {
  bridge.requestToPlugin?.("editor", "openFile", { filePath: t.filePath })...
}

// 改后——不再需要 pluginId 硬编码判断
// 所有非壳渲染的插件标签页，WebView ready 后发 restore IPC
if (t.pluginId && !isShellRenderedTab(t.type) && t.sourceId && readyWebViewIds.has(t.id)) {
  const channel = viewRegistry.getTabRestoreChannel(t.pluginId);  // E5.5#10 声明式
  if (channel) {
    bridge.requestToPlugin?.(t.id, channel, { sourceId: t.sourceId, filePath: t.filePath })...
  }
}
```

> **声明式，零硬编码。** `viewRegistry.getTabRestoreChannel(t.pluginId)` 从 plugin.json 的 `restoreOnFocus` 字段取值——不写死任何插件 ID。file-tree / serial-monitor / 未来任何插件只需在自己的 plugin.json 中声明 `restoreOnFocus: "openFile"` 或 `restoreOnFocus: "restoreSession"`。`MainContent` 不区分谁是谁。

**`dialog:visibility` 恢复（370 行附近）：**

```typescript
// 改前
pv.setVisible(activeTab.pluginId, isFocused);

// 改后
pv.setVisible(activeTab.id, isFocused);
```

**预估改动：** −15/+25 行（净增 ~10 行）

---

#### 3.10 `src/pluginLoader/loader.ts`

```typescript
// 改前（907 行附近）
window.linkdesk?.pluginViews?.create?.(pluginId);

// 改后
const tabId = ...; // 从上下文获取 tab.id
window.linkdesk?.pluginViews?.create?.(tabId, pluginId);
```

> **注意：** `loader.ts` 中 `pluginViews.create()` 的调用时机是插件加载时（非标签页创建时）。在 per-tab 模型下，WebView 创建应该由标签页创建触发，不是插件加载触发。此调用可能需要调整或移除——改为由 `useWebViewSync` Effect 3 统一管理。

**预估改动：** −2/+5 行

---

### 第 3 层：插件侧

#### 3.11 `electron/preload-plugin.ts`

**新增 `pluginInstance` 命名空间 + `notifyReady` 签名更新。**

```typescript
// 从 URL 读 instanceId
const urlParams = new URLSearchParams(window.location.search);
const _pluginId = urlParams.get('pluginId') || '';
const _instanceId = urlParams.get('instanceId') || '';

// 暴露
contextBridge.exposeInMainWorld('linkdesk', {
  ...
  pluginInstance: {
    /** 当前 WebView 的 instanceId（= 标签页 tab.id） */
    id: _instanceId,
    /** 当前 WebView 的 pluginId */
    pluginId: _pluginId,
  },
  pluginViews: {
    // 改前: notifyReady: (pluginId: string) => ipcRenderer.send('plugin-view:ready', pluginId)
    // 改后: 自动发送 instanceId + pluginId
    notifyReady: () => ipcRenderer.send('plugin-view:ready', _instanceId, _pluginId),
  },
  ...
});
```

**新增 IPC handler：** `plugin-view:getInstanceIdsForPlugin`

**`pluginState` API 不变：** key 仍是 `(namespace, key)`——插件自行决定是否在 key 中包含 instanceId 来隔离实例间状态。基建不做假设。

**预估改动：** −5/+20 行（净增 ~15 行）

---

#### 3.12 `src/plugin-shell-main.tsx`

```typescript
// 改前
const pluginId = ...; // 从某处获取
window.linkdesk?.pluginViews?.notifyReady?.(pluginId);

// 改后
const instanceId = (window as any).linkdesk?.pluginInstance?.id;
if (instanceId) {
  window.linkdesk?.pluginViews?.notifyReady?.();  // 不再传参，preload 自动发
} else {
  // fallback: 非 WebView 环境（浏览器 dev），用 pluginId
  window.linkdesk?.pluginViews?.notifyReady?.();
}
```

**预估改动：** −3/+5 行

---

#### 3.13 `electron/plugin-view.html`

**不变。** Query params 在 URL 中，HTML 不需改。

---

### 第 4 层：插件适配（按需——不是必须）

#### 3.14 编辑器插件 `plugins/builtin/editor/`

**零改动（最优情况）。** 每个 instance WebView 加载后，壳通过 `requestToPlugin(instanceId, "openFile", ...)` 发文件路径——插件收 `openFile` IPC 后加载文件到 Monaco。跟现在完全一样的流程，只是 routing 用 instanceId。

如果编辑器有自己的 `notifyReady` → `openFile` 的依赖，确认 `openFile` 使用 `bridge.requestToPlugin`（instanceId 路由）而非 `bridge.pushToPlugin`（pluginId 路由）即可。

#### 3.15 串口监视器 `plugins/user/serial-monitor/`

**需要小改。** `pluginState` 键名增加 session 隔离：

```typescript
// 改前——所有实例共享同一键，互相覆盖
pluginState.set("serial-monitor", "isOpen", true)
pluginState.set("serial-monitor", "sourceName", "COM3")

// 改后——键名含 sourceId，实例间隔离
pluginState.set("serial-monitor", `session:${sourceId}:isOpen`, true)
pluginState.set("serial-monitor", `session:${sourceId}:sourceName`, sourceId)
```

**`SessionListView` 壳侧读取也对应更新：** 按每个 session 的 sourceId 读对应的 `session:xxx:isOpen` 键。

> 这部分联动 E5.5#7 Bug C 的修复——当时修的 pluginState 同步，在 per-tab 下需再加一层 session 隔离。

---

## 4. 不变量——不改的

| 组件 | 不改什么 |
|:--|:--|
| `useTabManager` | tab 创建/销毁/分屏逻辑全部不变。tab.id 早已唯一。 |
| `tabIdentity` | identityField / singleton 逻辑不变 |
| `MainContent` 分屏 | `SplitNode` / `dropZone` / 布局计算不变 |
| `OverlayPortal` | 弹窗/Toast/SelectBox 渲染路径不变 |
| `keyboard-router` chord 状态机 | 不变——每个 instance WebView 独立注册 before-input-event |
| `pluginState` API 签名 | 不变——`(namespace, key)` 不变，插件自行决定 key 是否含 instanceId |
| `events.on/emit` | 不变——broadcast 链路自动覆盖所有 instance |
| 插件 `plugin.json` | 不加新字段——per-tab 是基础设施行为，不需要插件声明 |
| 保活宽限期 (60s) | 不变——per-instance grace period |
| 内存监控 (30s/1GB) | 不变——遍历 `pluginViews` 不加改动 |

---

## 5. 风险与边界

### 5.1 内存

每个 WebContentsView ~30-50MB 增量。10 个标签页 ≈ 300-500MB。

**缓解：** 60s 宽限期 + 1GB 内存压力阈值不变。这是 Chromium 的基线开销——VS Code 同样为每个 webview 付出此成本。

### 5.2 侧栏插件（file-tree）

file-tree 的 `viewRole: "sidebarPrimary"`——侧栏在壳 HTML 中渲染，不走 WebView。不受此改动影响。

### 5.3 singleton 插件（settings / marketplace）

`singleton: true` → `reduceCreateTab` 阻止第二标签页 → 永远不会为 singleton 插件创建第二个 instance。Singleton 插件始终只有一个 WebView。

### 5.4 宽限期恢复 + instanceId 变更

场景：串口 COM3 标签页关闭 → 60s 内重新打开 COM3。
- 旧 instanceId = 旧 tab.id（如 "tab-old"）
- 新 tab 创建 → 新 tab.id（如 "tab-new"）
- `cancelDestroy(instanceId)` 查的是旧 instanceId → 查不到
- **解决：** 宽限期恢复时，先用 `pluginId` 找到旧 instanceId，再 `rekeyInstance(oldIid, newIid)`

```typescript
// useWebViewSync.ts 中 cancelDestroy 逻辑
// 因 instanceId 变了（新 tab = 新 id），不能直接用 instanceId 查
// 改为：在宽限期内查找同 pluginId 的旧 instanceId → rekey
const oldInstanceId = await pv.findGraceInstance?.(pluginId);
if (oldInstanceId) {
  await pv.rekeyInstance?.(oldInstanceId, instanceId);
  // 复用成功
} else {
  pv.create(instanceId, pluginId);
}
```

需要在 `PluginViewRegistry` / `WindowManager` 中加 `findGraceInstance(pluginId)` 方法——在 `graceTimers` 中查找同 pluginId 的待销毁实例。

### 5.5 标签页启动恢复

重启后 `LayoutService` 恢复标签页 → 每个 tab 有新的 `tab.id` → `useWebViewSync` 检测到新 instanceId → 自动创建新 WebView → 正常。

> 宽限期不跨进程——重启后所有旧 WebView 随进程退出而销毁，不存在旧 instanceId 残留。

### 5.6 预期 bug 与缓解

> **不是"可能发生"——是"几乎确定会发生"。** 以下按概率排序。每个都有明确缓解。实现时对照检查，不要等验证阶段才发现。

#### 🔴 几乎确定

**① 宽限期恢复 + rekey 竞态（§5.4 展开）**

串口 COM3 标签页关闭 → 60s 宽限期开始 → 用户 3 秒后又开 COM3（新 `tab.id`）→ `cancelDestroy(newInstanceId)` 查不到旧 WebView → 创建新 WebView → 短期内同时存在两个 COM3 WebView。串口端口被第一个 WebView 占用 → 第二个打开失败。

**缓解：** `findGraceInstance(pluginId)` 在 `graceTimers` 中按 pluginId 查找待销毁实例 → `rekeyInstance(oldIid, newIid)` 重映射。**§5.4 已有方案——实现时不可遗漏 `findGraceInstance`。** 验证：关闭标签页 → 3 秒内重开 → 确认 `pluginViews` Map 中只有一个 instance。

**② 编辑器 pluginState 键冲突**

编辑器可能在 `pluginState` 中存 per-file 状态（光标位置、折叠状态、最近文件列表）。两个 editor instance 用同一 key → 互相覆盖 → 切换标签页时光标跳到错误位置。

**根因：** 编辑器如果用了 `pluginState.set("editor", "cursorPosition", ...)` 而非 `pluginState.set("editor", `file:${path}:cursorPosition`, ...)`，两个 instance 打架。

**缓解：** 审计编辑器的 pluginState 使用——每个 key 必须含文件路径。**验证：** 打开 hello.c 滚动到第 100 行 → 切换到 hello.h → 切回 hello.c → 光标仍在第 100 行。

**③ 重启后所有 WebView 冷启动**

重启前开了 5 个编辑器标签页。重启 → `LayoutService` 恢复 5 个 tab → 5 个新 `tab.id` → `useWebViewSync` 检测到 5 个新 instance → 同时创建 5 个 `WebContentsView` → 5 个 Monaco 同时初始化 → 启动时间暴增。

**根因：** 宽限期是内存内的——进程退出后所有旧 WebView 随进程销毁。

**缓解：** 无完美解法。对标 VS Code——重启后编辑器也是从磁盘恢复。per-tab 隔离的代价。标签页 ≤5 时启动增量应在 2-3 秒内可接受。如果 >10 个，后续可加懒加载——只创建可见标签页的 WebView，隐藏的等切换时再创建。**验证：** 5 个编辑器标签页重启，恢复时间 < 5 秒。

#### 🟡 特定条件触发

**④ 同一串口端口被两个标签页打开**

用户开 COM3 标签页 → 连接成功 → 又开一个 COM3 标签页（新 session）→ `openSession` 调 serial-service → 端口已被第一个占用 → 第二个报错"端口被占用"。

**缓解：** serial-service 层面检查——端口已打开时拒绝第二个连接并提示"该端口已在另一个会话中打开"。不是 per-tab 引入的新问题——单 WebView 下用户也可以手动创建两个 COM3 标签页——per-tab 只是让这个场景更容易触发。**不在 #9 范围——串口插件自身的逻辑。**

**⑤ DevTools 不知道该开哪个 instance**

F12 当前是 `toggleDevTools(pluginId)`。per-tab 后有 3 个 editor instance → 按哪个？

**缓解：** `toggleDevTools(instanceId)`——开**当前聚焦标签页**的 DevTools。E5.5#9d 已覆盖。

**⑥ 内存——10 个标签页 ≈ 300-500MB 仅编辑器**

10 个编辑器 + 2 个串口 + 设置页 = 12 个 `WebContentsView` × ~40MB = ~480MB。加壳 + 主进程 + GPU → 轻松超 1GB。

**缓解：** 现有 `MEMORY_PRESSURE_THRESHOLD = 1GB` + `flushGracePeriods` 不变。懒加载（隐藏标签页不创建 WebView）后续可加。**验证：** 开 10 个编辑器标签页，确认不 OOM（E5.5#44 内存验证覆盖）。

#### 🟢 基础设施已覆盖——不会发生

| 场景 | 为什么不发生 |
|:--|:--|
| IPC 路由发错 instance | `tab.id` 是确定性的——创建 tab 时生成，不会冲突 |
| `notifyReady` 竞态 | preload-shell `_readyBuffer` 模块级缓冲——E5.5#0c 已验证 |
| LSP 响应发错 WebView | `event.sender` 是 per-WebContents 的——E5.5#7 Bug 5 已修 |
| 键盘路由误拦截 | `before-input-event` 只触发在聚焦的 WebView——E5.5#7 Bug D 已修（无修饰键放行） |
| 主题/配置切换不同步 | `broadcast` 遍历所有 instance——每个都收到 |
| 插件崩溃拖垮壳 | `render-process-gone` per-instance——单个崩溃只清理那一个 |

---

## 6. 验证计划

### 6.1 单插件多标签页

- [ ] 编辑器开 2 个文件标签页 → 切换不白屏，内容各自独立
- [ ] 编辑器开 3+ 标签页 → 切换正常
- [ ] 串口监视器开 COM3 + COM5 → 两个会话独立，不互相覆盖
- [ ] 关闭 COM3 标签页 → COM5 不受影响

### 6.2 分屏

- [ ] 左 hello.c / 右 hello.h → 两个编辑器同时可见，各自独立编辑
- [ ] 分屏中切换标签页 → 各自的 active tab 独立 WebView 正常
- [ ] 合屏 → 一个 WebView 隐藏/销毁，另一个保持

### 6.3 宽限期

- [ ] 关闭编辑器标签页 → 60s 内重开 → 零重建，内容保持
- [ ] 关闭标签页 → 等 65s → 重开 → 新建 WebView，加载正常
- [ ] 同插件两个标签页都关闭 → 都在宽限期 → 重开其中一个 → 恢复正确的那一个

### 6.4 跨插件

- [ ] 编辑器 + 串口 + 设置 同时开 → 各自独立 WebView
- [ ] 侧栏文件树正常（壳渲染，不受影响）
- [ ] 状态栏正常
- [ ] Ctrl+Shift+P 命令面板正常

### 6.5 生命周期

- [ ] 安装/卸载/禁用插件 → 所有 instance 正确清理
- [ ] 崩溃恢复 → 单个 instance 崩溃不影响其他
- [ ] 退出 → 所有 instance 正确销毁

---

## 7. 与后续任务的联动

| 后续任务 | 联动 |
|:--|:--|
| E5.5#10 (硬编码 pluginId) | `openFile` IPC 从 `if (pluginId === "editor")` 改为声明式 `restoreOnFocus`——与本文 `requestToPlugin(instanceId, channel)` 互补 |
| E5.5#25 (缩放联动) | zoom 广播到所有 instance——`broadcast` 自动覆盖 |
| E5.5#26 (OverlayWindow) | OverlayWindow 是独立 BrowserWindow——与 instance 数量无关 |
| E5.5#3e (分屏 editor) | 本文是 E5.5#3e 的答案——per-tab WebView 让分屏两个同插件标签页成为可能 |

---

## 8. 预估

| 指标 | 值 |
|:--|:--|
| 改动文件 | ~13 个 |
| 代码行数 | −200/+280 行（净增 ~80 行） |
| 新增 IPC channel | 1 个（`plugin-view:getInstanceIdsForPlugin`） |
| 插件改动 | 编辑器零改动，串口监视器 ~10 行（pluginState 键加 session 前缀） |
| 风险等级 | 🟡 中——改动面广但模式一致（机械重命名），每步可验证 |
| 不可逆 | ✅ 可逆——改的都是 infrastructure，不删功能 |
