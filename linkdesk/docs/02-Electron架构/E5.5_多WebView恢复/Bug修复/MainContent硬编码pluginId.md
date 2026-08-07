# MainContent 硬编码 pluginId → 声明式 IPC 通道——E5.5#10

> 📖 **🔥 2026-08-07 审计发现。** 硬约束 #10 明确禁止 `if (pluginId === "...")` 模式。
> 每加一个新插件就要加一行硬编码 = V2.6 的种子。

## 问题

[MainContent.tsx:353](linkdesk/src/components/MainContent.tsx#L353) 和 [MainContent.tsx:367](linkdesk/src/components/MainContent.tsx#L367) 有两处硬编码。代码自标 `@deprecated E5#26d`——"多 WebView 恢复时改为 plugin.json 声明式 IPC 通道"。

```typescript
// L353——标签页恢复时通知 editor 插件打开文件
if (t.pluginId === "editor" && t.sourceId) {
  bridge.requestToPlugin?.("editor", "openFile", { filePath: t.sourceId })
}

// L367——标签页聚焦时通知 serial-monitor 插件恢复会话
if (activeTab?.pluginId === "serial-monitor" && activeTab.sourceId) {
  bridge.requestToPlugin?.("serial-monitor", "openSession", { sourceId: activeTab.sourceId })
}
```

**共同模式：** 壳需要在标签页聚焦时通知对应插件"恢复这个 sourceId 的状态"。当前实现是 `if pluginId === X → call Y`。新增插件需要做同样的事 → 必须加硬编码。

## 方案

plugin.json 加 `tabBehavior.restoreOnFocus?: string`（IPC channel 名）：

```json
// editor/plugin.json
{ "tabBehavior": { "restoreOnFocus": "openFile" } }

// serial-monitor/plugin.json
{ "tabBehavior": { "restoreOnFocus": "openSession" } }
```

**MainContent.tsx——替换硬编码为 Registry 查询：**

```typescript
// 旧（硬编码——删）：
for (const g of tabState.groups) for (const t of g.tabs) {
  if (t.pluginId === "editor" && t.sourceId) {
    bridge.requestToPlugin?.("editor", "openFile", { filePath: t.sourceId })
  }
}

// 新（声明式）：
for (const g of tabState.groups) for (const t of g.tabs) {
  const restoreChannel = getTabRestoreChannel(t.pluginId); // 读 plugin.json tabBehavior.restoreOnFocus
  if (restoreChannel && t.sourceId) {
    bridge.requestToPlugin?.(t.pluginId, restoreChannel, { sourceId: t.sourceId })
  }
}
```

> ⚠️ 参数 key 统一——原来 editor 是 `filePath`，serial-monitor 是 `sourceId` → 统一为 `sourceId`。editor 插件侧 handler 改为接收 `{ sourceId }`。

## 执行步骤

- [ ] **E5.5#10** 分析两处硬编码的共同模式——标签页聚焦 → 通知插件恢复 sourceId
- [ ] **E5.5#10** plugin.schema.json——`tabBehavior` 补 `restoreOnFocus` 字段
- [ ] **E5.5#10** `viewRegistry.ts`——新增 `getTabRestoreChannel(pluginId): string | null`
- [ ] **E5.5#10** `MainContent.tsx`——替换两处 `if (pluginId === ...)` 为声明式查询
- [ ] **E5.5#10** editor 插件——handler 适配：`openFile({ filePath })` → `openFile({ sourceId })`
- [ ] **E5.5#10** grep 全量确认 `src/core/` + `src/pluginLoader/` + `electron/` 中零硬编码 pluginId
- [ ] **E5.5#10** 验证——重启后 editor + serial-monitor 标签页恢复正确

## 相关

- [硬约束 #10](../../../CLAUDE.md)——禁止在 core/ 或 pluginLoader/ 中写死插件 ID
- [MainContent.tsx](linkdesk/src/components/MainContent.tsx)
- [plugin.schema.json](linkdesk/public/schemas/plugin.schema.json)
