---
name: b78-workspace-tab-id-collision
description: 工作台多实例标签页 id 碰撞——generateId 硬编码导致双聚焦/关一关俩
metadata:
  type: project
---

# B78：工作台多实例标签页 id 碰撞

## 现象

创建两个工作台标签页 → 两个同时显示聚焦状态、关一个两个一起关、关闭后剩下的卡在中间不顶到最前面。终端不受影响（计数器区分）。

## 根因

`src/hooks/tabIdentity.ts` workspace `generateId` 无 `workspaceName` 时硬编码返回 `"workspace"`——两个标签页 `tab.id` 相同。

```
第一个工作台标签页 → generateId() → "workspace"
第二个工作台标签页 → generateId() → "workspace"  ← 同 id！
```

React `key` 重复 → `TabPanePositioner` reconciliation 混乱 → `activeTabId === "workspace"` 匹配两个 `flatPanes` → 两个 `isVisible=true`。

## 修法（2026-07-21）

无 `workspaceName` 时改走计数器 `workspace-${++_workspaceCounter}`，和 terminal 一致。同时修复 `oled` 同类硬编码。

```typescript
// 修前
generateId: (opts) => opts?.workspaceName ? `workspace-${opts.workspaceName}` : "workspace"

// 修后（B78）
generateId: (opts) => opts?.workspaceName ? `workspace-${opts.workspaceName}` : `workspace-${++_workspaceCounter}`
```

## 长期方案

标签页命名功能（5.5/Phase 6）上线后，`workspaceName` 分支接管 → 计数器不再触发 → 从根本上消灭此问题。

## 同类潜在风险

- `settings` → 硬编码 `"settings"`，但 settings 是单例 → 不影响
- `marketplace` → 硬编码 `"marketplace"`，纯侧栏视图无标签页 → 不影响
- `welcome` → 硬编码 `"welcome"`，fallback 单例 → 不影响
- `editor` → 无 filePath 时硬编码 `"editor"`，实践中总有 filePath → 暂不修
