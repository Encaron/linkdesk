# E5.7 API 变更清单

> 极简Pool 下的 API 变更。插件代码零改动——所有变更都在 preload 层。

---

## 1. 简化：pool.* API 命名空间

E5.7 只有一个 Pool——`poolId`/`zone` 参数全部消失：

```typescript
// 池侧（preload-pool.ts）——window.linkdesk.pool
{
  /** 接收壳推送的布局——返回 unsubscribe */
  onLayout(cb: (layout: PoolLayout) => void): () => void;

  /** 通知壳——池已就绪（ready 前的 layout 会被缓冲回放） */
  ready(): void;
}
```

对比 E5.6：删 `getZone()`、`pushLayout(zone, ...)`（壳侧）、`onReady(zone)`、`onCrashed(zone)`、`getMemoryInfo(zone)`、`listZones()`。

---

## 2. 删除：pluginViews API（壳侧）

```typescript
// ❌ 删除以下全部——per-tab WebView 遗留
window.linkdesk.pluginViews = {
  create(pluginId), setVisible(instanceId, visible), setBounds(instanceId, bounds),
  getAllIds(), scheduleDestroy(instanceId), cancelDestroy(instanceId),
  focus(instanceId), reload(instanceId), toggleDevTools(instanceId),
  onReady(cb),
}
```

## 3. 删除：pluginInstance API（池侧）

```typescript
// ❌ 删除——instanceId 消失
window.linkdesk.pluginInstance = { id, pluginId }
window.linkdesk.pluginInstance.notifyReady()
```

## 4. 不变：所有现有 linkdesk.* API

`linkdesk.tabs.*` / `filesystem.*` / `configuration.*` / `events.*` / `menu.*` / `dialog.*` / `commands.*` / `keybinding.*` / `clipboard.*` / `i18n.*` / `pluginState.*` / `pluginManagement.*` — **零改动。插件作者不需要改一行代码。**

## 5. 补全：10 个命名空间

| 命名空间 | 新增方法 | 消 import 数 |
|:--|:--|:--|
| `linkdesk.workspace` | `openFolder`, `addFolder`, `removeFolder`, `onDidChangeFolders`, `onDidChangeActiveWorkspace`, `setActiveWorkspace` | 7 |
| `linkdesk.commands` | `registerCommand` (IPC版) | 4 |
| `linkdesk.fileAssociation` | `getPluginFor(ext)` | 2 |
| `linkdesk.viewContainer` | `getViews`, `getViewContainer` | 3 |
| `linkdesk.events` | `emit`, `on`, `off` (IPC暴露) | 3 |
| `linkdesk.fileDecoration` | `registerProvider`, `getDecorations` | 1 |
| `linkdesk.protocol` | `registerParser`, `getParsers`, `getDefaultFor` | 1 |
| `linkdesk.quickPick` | `show(opts)` → `Promise<selected>` | — |
| 零散 6 个 | `keybinding`, `clipboard`, `langDef`, `encoding`, `fileSearch`, `sidebar`, `data`, `contextKey` | 8 |

> 全部是消灭插件 `import @src/core` 的补全——和 Pool 模型无关，E5.6 未完成部分原样搬入 E5.7。

---

> 📖 执行清单 → [E5.7-执行清单.md](../E5.7-执行清单.md) Phase 12
