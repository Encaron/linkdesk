# 预览标签页系统 Bug 合集

> 2026-08-06。Filed by Encaron。
> 位于 E5 收尾——`05-收尾/`
> 预览模式（单击斜体打开 → 下次点别的替换）引入的多个 bug。

---

## Bug 1：预览替换致同 ID 双标签页

---

## 复现步骤

1. **单击** `hello.py` → 标签页以**斜体（预览模式，`pinned: false`）**打开
2. 在 `hello.py` 编辑器中 **Ctrl+Click 跨文件跳转**到 `utils.py` → 斜体预览标签页**被替换为 `utils.py`**
3. 回到文件树，**双击** `hello.py` → `hello.py` 标签页出现，但**旁边同时存在另一个同名标签页**，两个都高亮

**症状：** 同一个文件 `hello.py` 在标签栏里出现两次，两个标签页同时处于 active 高亮状态。

---

## 根因分析

### 标签页 ID 生成规则

编辑器标签页的 `id` 由 `tabIdentity.ts` 的 `makeGenerateId` 生成：

```typescript
// tabIdentity.ts:83 — editor 的 identityField = "filePath"
return (opts) => {
  const value = opts ? (opts as Record<string, unknown>)[identityField] as string | undefined : undefined;
  if (value) {
    const sanitized = value.replace(/[^a-zA-Z0-9一-鿿_-]/g, "_");
    return `${type}-${sanitized}`;  // ← id 由 filePath 决定
  }
  return `${type}-${nextCounter(type)}`;
};
```

即：**标签页 ID = `editor-` + 文件路径的 sanitized 版本**。同一个文件路径 → 同一个 ID。

### 预览替换逻辑

`useTabManager.ts` `reduceCreateTab` Step 3（L221-237）：

```typescript
// useTabManager.ts:221-237
if (opts?.pinned === false) {
  const targetGroup = prev.groups.find((g) => g.id === targetGroupId);
  if (targetGroup) {
    const previewTab = targetGroup.tabs.find(
      (t) => !t.pinned && !getTabBehavior(t.type).isFallback && !isSameTabIdentity(t, type, opts)
    );
    if (previewTab) {
      // ⚠️ 复用 preview 的 id——这是 bug 的根源
      const newTab = { ...createTabDefaults(type, opts), id: previewTab.id, pinned: false };
      // ...
    }
  }
}
```

关键行 L230：**替换预览标签页时，复用了旧标签页的 `id`**。注释说明这是为了 "保持 keep-alive 的 TabPanePositioner key 不变，避免 React unmount"。

### Bug 时序

```
Step 1: 单击 hello.py
  createTabDefaults("editor", { filePath: "E:/test/hello.py" })
  → id = "editor-E__test_hello_py"
  → Tab A: { id: "editor-E__test_hello_py", filePath: "E:/test/hello.py", pinned: false }

Step 2: Ctrl+Click → utils.py
  createTabDefaults("editor", { filePath: "E:/test/utils.py" })
  → would generate id = "editor-E__test_utils_py"
  → BUT L230 overrides: id = previewTab.id = "editor-E__test_hello_py"  ← 旧 ID!
  → Tab A 被替换: { id: "editor-E__test_hello_py", filePath: "E:/test/utils.py", pinned: false }
  
  ⚠️ Tab A 的 id 是 hello.py 的，但内容/路径是 utils.py 的——ID 与内容不一致！

Step 3: 双击 hello.py
  createTabDefaults("editor", { filePath: "E:/test/hello.py", pinned: true })
  → id = "editor-E__test_hello_py"  ← 和 Tab A 的 id 碰撞！
  
  findTabByIdentity: 搜索 filePath === "E:/test/hello.py"
  → Tab A 的 filePath 是 utils.py → 不匹配 → 找不到
  
  Step 3 (pinned: true): 跳过预览替换
  
  Step 4: 新建 Tab B: { id: "editor-E__test_hello_py", filePath: "E:/test/hello.py", pinned: true }
  
  🔴 Tab A 和 Tab B 拥有相同的 id: "editor-E__test_hello_py"
```

### 根因总结

**两个 bug 共同作用：**

1. **ID 语义错位（L230）：** 预览替换时保留旧 ID，导致标签页 ID 与内容（filePath）不一致。Tab A 的 id 是 `hello.py` 的，但实际内容已变成 `utils.py`。

2. **无 ID 碰撞检测：** `reduceCreateTab` Step 4 新建标签页时，不检查 `all.some(t => t.id === newTab.id)`。依赖 `findTabByIdentity`（Step 1）按 `filePath` 去重——但 Tab A 的 `filePath` 已经变了，去重失效。

---

## 修复方案

### 推荐方案：不复用预览标签页 ID

**位置：** `src/hooks/useTabManager.ts` L230

```typescript
// 修改前：
const newTab = { ...createTabDefaults(type, opts), id: previewTab.id, pinned: false };

// 修改后：
const newTab = { ...createTabDefaults(type, opts), pinned: false };
```

让 `createTabDefaults` 正常生成新 ID（基于新文件的 filePath）。旧标签页的 ID 不再被复用。

**影响评估：**

- **TabPanePositioner key 会变** → React 会 unmount 旧组件、mount 新组件。在单 WebView 下，这本来就是正确行为——编辑器 `EditorView` 的 `useEffect` 依赖 `filePath`（EditorView.tsx L257），切换文件时本来就要重建 editor。`id` 复用省不了这个开销。
- **对非编辑器插件：** 如果未来有插件在预览替换时需要保持 DOM 状态（不依赖 filePath 作为 key），可以给 `Tab` 加一个 `keepAliveKey` 字段，不与 `id` 耦合。当前无此需求。

### 备选方案：ID 碰撞检测（防御层）

即使修了 L230，也应该在 Step 4 加碰撞检测作为**纵深防御**：

```typescript
// useTabManager.ts reduceCreateTab Step 4 后
const newTab = createTabDefaults(type, opts);
// 纵深防御：绝不允许同 ID 标签页
if (all.some(t => t.id === newTab.id)) {
  newTab.id = `${newTab.id}-${nextCounter(type)}`;
}
```

两个修复不冲突——可以同时做。

---

## 可能遇到的连带 Bug

### 1. TabPanePositioner 闪烁

**风险：** 去掉 id 复用后，预览替换时 React key 变化 → 旧组件 unmount + 新组件 mount → 可能出现一帧白屏。

**缓解：** EditorView 的 `useEffect`（L71-257）本身就以 `filePath` 为依赖——切换文件就是 unmount 旧 editor + mount 新 editor。当前 id 复用**并没有**阻止这个重建。验证方法：在预览标签页被替换时，观察编辑器区域是否有异常闪烁。如果有，在 TabPanePositioner 加 CSS `transition: opacity 150ms` 平滑过渡。

### 2. 快速连续替换

**风险：** 用户快速 Ctrl+Click 跳转多次 → 每次预览替换生成新 id → React 快速 mount/unmount → 可能触发 Monaco 初始化竞态。

**缓解：** `EditorView.tsx` L71 已有 `disposed` guard——旧 effect 的 cleanup 设 `disposed=true`，新 effect 检查后才创建 editor。竞态已被正确处理。验证：快速 Ctrl+Click 3-5 次跳转，确认无 `[editor] 初始化失败` 日志 + 无白屏残留。

### 3. 其他以 `id` 做 tab 查找的代码

**风险：** 代码中是否有其他地方假设"标签页 id 在整个生命周期中不变"？

**审计范围：**
- `closeTabBySourceId`（L880-894）——按 `sourceId` 查找，不受影响
- `focusTabBySourceId`（L852-875）——同上
- `forceCloseTab`——按 `tabId` 查找，id 不会在 close 之外的操作中变
- `reduceMoveTab`——按 `tabId` 查找
- `reduceReorderTab`——按 `tabId` 查找
- `TabBar` `closeWithAnimation`——按 `tabId`
- 布局持久化 `toLayoutData`/`restoreLayout`——保存的 id 在恢复时可能不匹配？不影响，F5 刷新后 id 全量重建

结论：现有代码用 `tabId` 做操作目标（关闭/移动/重排），不假设 id 在预览替换时保持不变。去 id 复用安全。

### 4. 双击 pin 后仍可被替换

**注意：** 这不是本 bug 要修的，但属同区域问题。当前逻辑：`pinned: true` 跳过预览替换（Step 3 条件 `opts?.pinned === false`）。但如果用户 pin 了一个标签页后，再单击打开另一个文件（`pinned: false`），预览替换逻辑会找**非 pinned 且非同一身份**的标签页替换。如果 pin 了的标签页是唯一的非同一身份标签页——不会被替换（因为它 pinned）。逻辑正确，不需改动。

---

## 涉及文件

| 文件 | 改动 |
|:--|:--|
| `src/hooks/useTabManager.ts` L230 | 删 `id: previewTab.id` 覆盖——让 `createTabDefaults` 生成新 id |
| `src/hooks/useTabManager.ts` Step 4 后 | （可选）加 id 碰撞检测——纵深防御 |

**改动量：** ~2 行。
