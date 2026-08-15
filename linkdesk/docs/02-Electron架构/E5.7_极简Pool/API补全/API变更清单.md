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

  /** 🔴 意图通道保留（2026-08-13 审计）——池 UI 写操作回壳 tabState 的唯一通道 */
  sidebarAction(action: unknown): void;   // 侧栏操作
  tabAction(action: unknown): void;       // 标签/拖拽/分屏（tabs.* 覆盖不了 pinTab/拖拽/分屏）
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

| 命名空间 | 现状（2026-08-13 审计实测） | 剩余工作 |
|:--|:--|:--|
| `linkdesk.workspace` | ✅ 6 方法全已在位（E5.6#11.5a） | 验证 + 残余清理（#55） |
| `linkdesk.commands` | ✅ registerCommand IPC 版已在位 | marketplace 1 处迁移（#56） |
| `linkdesk.fileAssociation` | ✅ getPluginFor 已在位 | 并入 Phase 11 #50（原 #57 删除） |
| `linkdesk.viewContainer` | ⚠️ no-op 桩（getView→null） | 桩换真 IPC 查询（#58） |
| `linkdesk.events` | ✅ on/emit 已在位（off = on 返回值） | 验证 + 残余清理（#59） |
| `linkdesk.decorations` | ✅ 2026-08-16 完成（#60）——池内本地注册表（零 IPC）：registerProvider/unregisterProvider/getDecoration/onDidChange 四方法；壳侧恒空注册表 + 代理通道 + 广播整删 | ✅ 完成 |
| `linkdesk.protocol` | ✅ listProtocols 等已在位 | registerParser 类按需（#61） |
| `linkdesk.quickPick` | ❌ 不存在——真新建 | 池内渲染机制（#63） |
| `linkdesk.hotExit` | ✅ 2026-08-15 新增（#38） | save/load/clear 三方法——崩溃恢复备份，主进程落盘 |
| 零散 | ✅ 6/6 验证在位（clipboard/keybindings/contextKey/search/encoding/langDef）；sidebar/data 现网无——零插件消费，按需跳过 | ✅ 完成（#62，2026-08-15） |

> 🔴 2026-08-13 审计：原表"消 X 处 import"数字全部过期——plugins/ 实测运行时 import @src/core 仅 3 处（marketplace×2 + file-tree 测试×1）。E5.6#11.5 已把大部分命名空间补进 preload-pool，本表改为现网实测状态。

---

> 📖 执行清单 → [E5.7-执行清单.md](../E5.7-执行清单.md) Phase 12
