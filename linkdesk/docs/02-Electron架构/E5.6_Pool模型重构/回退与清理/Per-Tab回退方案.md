# Per-Tab 回退方案——E5.6#0a 审计结果

> 📖 对应执行清单：[E5.6#0a, E5.6#1-#4, E5.6#31-#36](../E5.6-执行清单.md)
> 📖 E5.5 原始实现：[04-PerTab-WebView-设计.md](../../E5.5_多WebView恢复/04-PerTab-WebView-设计.md)
> 📅 审计日期：2026-08-09

---

## 0. 审计摘要

| 指标 | 数值 |
|:--|:--|
| 受影响的源文件 | **11 个** |
| 核心 `instanceId` 引用 | ~280 处（不含 `node_modules`） |
| `rekeyInstance` 调用链 | 7 处（window-manager + plugin-view-registry + handlers + preload-shell + useWebViewSync + linkdesk-api） |
| `findGraceInstance` 调用链 | 7 处 |
| `graceTimers` 引用 | 18 处（全部在 window-manager.ts） |
| `notifyReady` 引用 | 5 处 |
| `readyWebViewIds` 引用 | 13 处（useWebViewSync + MainContent） |
| `webViewBoundsReady` 引用 | 11 处 |
| `pluginViews.*` preload 暴露方法 | 14 个 |
| `useWebViewSync()` 调用点 | 1 处（MainContent.tsx:326） |
| 整文件删除 | 1 个（useWebViewSync.ts ~270 行） |

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
| 124-130 | `pluginRequestQueues.get(instanceId)` | → pool 路由 |
| 178-186 | `bridge:pushToPlugin` handler | → `pool:push` |
| 200-214 | `pushToPlugin(instanceId, channel, payload)` | → `pushToPool(zone, ...)` |
| 222-252 | `flushPushQueue(instanceId)` | → pool 级 |
| 299-301 | `broadcastToAll` 用 `getAllInstanceIds()` | → 广播到 2 个 Pool |
| 306-309 | `replayToPlugin(instanceId)` | → pool replay |
| 315-317 | `clearPluginQueue(instanceId)` | → pool 级 |
| 324-326 | `getInstanceIdsForPlugin(pluginId)` | **删除** |
| 343-346 | `bridge:request-to-plugin` handler | → `pool:request` |

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

### 1.5 `electron/preload-shell.ts`（~350 行）——`pluginViews` 命名空间替换

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

### 1.6 `electron/preload-plugin.ts`（~600 行）——插件侧 per-tab 清理

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 76-79 | `_pluginInstanceId` + URL 解析注释 | **删除** |
| 223 | `pluginInstance` 身份对象 | → `pool.zone` |
| 401-402 | `notifyReady` 注释 | 改 |
| 404 | `notifyReady(pluginId?)` | → `pool.ready()` |

**验证 grep：**
```
grep -n "_pluginInstanceId\|notifyReady\|pluginInstance" electron/preload-plugin.ts  # 零匹配（除 pool.ready）
```

---

### 1.7 `electron/ipc/serial-handlers.ts`——`getAllInstanceIds()` 广播

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

### 1.8 `electron/ipc/file-handlers.ts`——`getAllInstanceIds()` 广播

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 79-80 | `getAllInstanceIds()` 遍历 → `filesystem:changed` | → 广播到 MainPool |

**验证 grep：**
```
grep -n "getAllInstanceIds" electron/ipc/file-handlers.ts  # 零匹配
```

---

### 1.9 `electron/keyboard-router.ts`——`getAllInstanceIds()` 键盘分发

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 250-251 | `getAllInstanceIds()` 遍历 → 键盘事件发送 | → 发送到活跃 Pool |
| 256-259 | `registerPlugin(instanceId, pluginId, url, force?)` patch | **删除** patch |

**验证 grep：**
```
grep -n "getAllInstanceIds\|getInstanceIdsForPlugin" electron/keyboard-router.ts  # 零匹配
```

---

### 1.10 `src/hooks/useWebViewSync.ts`（~270 行）——🔴 整文件删除

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

### 1.11 `src/components/MainContent.tsx`——useWebViewSync 集成剥离

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 29 | `import { useWebViewSync }` | **删 import** |
| 72-73 | `readyWebViewIds?`, `webViewBoundsReady?` prop | 删 props |
| 102 | `readyWebViewIds?.has(tab.id) && webViewBoundsReady?.has(...)` 守卫 | → 改为 Pool 就绪检查 |
| 319-326 | useWebViewSync 调用 + pv 变量 | → `usePoolSync` |
| 342-343 | `if (t.pluginId === "editor" && ...readyWebViewIds.has(...))` | → pool 就绪后 pushLayout |
| 347 | `readyWebViewIds, webViewBoundsReady` deps | 改 |
| 356-359 | `if (activeTab?.pluginId === "serial-monitor" && ...readyWebViewIds.has(...))` | → pool 就绪后 pushLayout |
| 527 | `renderTabContent(...readyWebViewIds, webViewBoundsReady)` | → `renderTabContent(tab, isFocused)` |

**验证 grep：**
```
grep -n "useWebViewSync\|readyWebViewIds\|webViewBoundsReady\|webViewTimeout" src/components/MainContent.tsx  # 零匹配
```

---

### 1.12 `src/plugin-shell-main.tsx`——多 WebView 模式分支

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 27 | 多 WebView 判据注释 | 删 |
| 122 | `notifyReady: noop` | **删** |
| 323-324 | `window.linkdesk?.pluginViews?.notifyReady?.()` | **删** |

**验证 grep：**
```
grep -n "notifyReady\|pluginViews\|isDevMode" src/plugin-shell-main.tsx  # 零匹配（除注释）
```

---

### 1.13 `src/pluginLoader/loader.ts`——useWebViewSync 注释

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 906 | `useWebViewSync Effect 3 ...` 注释 | 删注释 |

---

### 1.14 `src/pluginLoader/viewRegistry.ts`——pluginViews 引用

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 118 | `const pv = linkdesk()?.pluginViews` | → `linkdesk()?.pool` |
| 124 | 降级注释 `pluginId = instanceId` | 删 |

---

### 1.15 `src/core/api/linkdesk-api.ts`——类型定义

| 行 | 内容 | 操作 |
|:--|:--|:--|
| 197 | `notifyReady(pluginId?: string)` | → `pool.ready()` |
| 207 | `findGraceInstance?(pluginId)` | **删** |
| 209 | `rekeyInstance?(old, new)` | **删** |

**验证 grep：**
```
grep -n "notifyReady\|findGraceInstance\|rekeyInstance" src/core/api/linkdesk-api.ts  # 零匹配
```

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

> **← E5.6#0a 审计完成。** 共 11 个源文件需要修改，1 个整文件删除。所有 instanceId/grace 引用已枚举到行号。
> **→ 下一步：** E5.6#0b 审计通信链路。
