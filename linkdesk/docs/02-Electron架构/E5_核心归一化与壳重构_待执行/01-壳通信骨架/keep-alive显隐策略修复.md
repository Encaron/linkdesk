# keep-alive 显隐策略修复——display:none → opacity:0

> 2026-08-02。**E5 新增任务。** 17 个 commit 的光标/跳转问题根因：keep-alive 的 `display:none` 让隐藏 tab 的 DOM 不存在，Monaco 无法测量坐标。
> 执行清单任务：E5#40

---

## 一、前因——17 个 commit 的绕路史

### 1.1 根因——TabPanePositioner.tsx L76

```typescript
// src/components/TabPanePositioner.tsx L76
style={{
  position: "absolute",
  display: isVisible ? "flex" : "none",  // ← 🔴 display:none = 浏览器不渲染 DOM
}}
```

**所有非活跃 tab 的 DOM 不存在。** Monaco editor 在 `display:none` 的容器里——`setPosition()` / `layout()` / `revealPositionInCenter()` 全部收到调用，但没有 DOM 可测量 → 坐标无效。

### 1.2 绕路史

| commit | 做了什么 | 为什么是绕路 |
|--------|---------|------------|
| `4a0b0d9` | reveal 移到 editor 创建后 | 时序竞态——不是根因 |
| `3c64363` → `7a8dba1` | isActive reveal 加重试（100ms×30） | 等 DOM 出现——不是根因 |
| `12f6317` | 去重试——init effect 总是处理 | 简化为 init+isActive 双路径——仍在绕 |
| `823d608` | EditorRegistry——Map<filePath, editor> 直查跳转 | F12 不走 React 生命周期——绕过，不是修复 |
| `2505d5e` | **回退**——reveal 不直连隐藏 editor | 证明 registry 也不管用——隐藏时 setPosition 无效 |
| `63ea22a` | 终版：registry 兜底 + isActive 触发实际定位 | 两层 fallback——架构债 |

**17 个 commit 全在修同一个问题——但没人修 `display:none`。** 因为这是壳级改动，编辑器插件不应该碰壳代码。E5 是动壳的 Phase——现在修。

---

## 二、修复方案——一行

```diff
// src/components/TabPanePositioner.tsx L71-83
style={{
  position: "absolute",
- display: isVisible ? "flex" : "none",
+ opacity: isVisible ? 1 : 0,
+ pointerEvents: isVisible ? "auto" : "none",
+ zIndex: isVisible ? 1 : 0,
  flexDirection: "column",
  overflow: "hidden",
}}
```

### 为什么 opacity 而不是 visibility:hidden

| 方案 | DOM 渲染？ | 占布局空间？ | tab 切换动画？ |
|------|:--:|:--:|:--:|
| `display:none`（当前）| ❌ | ❌ | ❌ |
| `visibility:hidden` | ✅ | ✅ 占着 | ❌ |
| `opacity:0 + pointer-events:none` | ✅ | ❌ absolute 不受影响 | ✅ 可加 transition |

**`opacity:0` 完全符合 absolute 定位的 tab pane 模型——** 所有 pane 叠在同一位置，活跃的在最上面（z-index:1），不活跃的在下面（z-index:0, opacity:0）。

### 副作用——非 Monaco 插件

所有 keep-alive 的 tab（串口监视器、市场、设置、未来任何视图插件）都受益：
- `display:none` → tab 内容 unmount-lite——React 组件在，但 DOM 不在
- `opacity:0` → tab 内容在线但不可见——DOM 始终在

| 影响 | 说明 |
|------|------|
| 内存 | 略增——所有 tab 的 DOM 始终在内存。但 keep-alive 本来就保持 React 组件实例——DOM 是额外开销 |
| 性能 | 无影响——浏览器不绘制 `opacity:0` 的元素 |
| 滚动位置 | ✅ 修复——切换 tab 后滚动位置保留（DOM 从未销毁） |
| 动画 | ✅ 支持——opacity transition 可以加淡入淡出 |

---

## 三、连带清理——删 EditorRegistry + pendingReveal 双路径

`display:none` 修复后，Monaco editor 在后台 tab 也能正确响应 `setPosition()`。**不再需要 EditorRegistry 和 pendingReveal 两个绕路机制。**

### 删什么

```diff
// plugins/builtin/editor/src/navigation-bridge.ts (L24-39)
- // 编辑器注册表——filePath → editor 实例
- const _editorRegistry = new Map<string, any>();
- export function registerEditor(filePath, editor) { ... }
- export function unregisterEditor(filePath) { ... }
- export function getRegisteredEditor(filePath) { ... }

// plugins/builtin/editor/src/EditorView.tsx
- // handleEditorMount 中：
- registerEditor(filePath, editor);

- // F12 handler 中：
- const targetEditor = getRegisteredEditor(targetPath);
- if (targetEditor) { ... }  // 直连隐藏 editor——无效，已回退

- // dispose 中：
- unregisterEditor(filePath);
```

**EditorView.tsx 净删 ~30 行。navigation-bridge.ts 净删 ~20 行。**

### F12 回归简单模型

```typescript
// EditorView.tsx F12 handler——改后
const p = { lineNumber: targetLine, column: targetCol };
const label = normalizePath(targetPath).split("/").pop() || targetPath;

// 简单模型：createTab → tab 切换 → EditorView mount → effect 中 reveal
setPendingReveal(targetPath, targetLine, targetCol);
tabActionsRef.current?.createTab("editor", {
  filePath: targetPath, sourceId: targetPath, label, pinned: false,
});
```

**一条路径。** `createTab` → 标签页切换 → 编辑器 mount → `isActive` 变为 true → effect 中 `consumePendingReveal` → `revealPositionInCenter`。DOM 始终存在——reveal 一定成功。

---

## 四、实现步骤

### E5#40a TabPanePositioner 改显隐策略

- [ ] **E5#40a** `TabPanePositioner.tsx` L76——`display:none` → `opacity:0` + `pointerEvents:none` + `zIndex:0` | ~3 行
- [ ] 验证——编辑器从 A.tsx F12 跳到 B.tsx → 光标正确 → 切回 A → 切回 B → 光标仍在原行

### E5#40b 编辑器删绕路代码

- [ ] **E5#40b** `plugins/builtin/editor/src/navigation-bridge.ts`——删 `_editorRegistry` / `registerEditor` / `unregisterEditor` / `getRegisteredEditor` | ~−20 行
- [ ] **E5#40c** `plugins/builtin/editor/src/EditorView.tsx`——删 F12 handler 中直查 registry 分支 + mount 中 `registerEditor` + dispose 中 `unregisterEditor` | ~−30 行
- [ ] **E5#40d** F12 回归简单模型——`setPendingReveal` → `createTab` → mount 时 consume

### E5#40c 回归验证

- [ ] F12 跳转到同文件 → 光标正确
- [ ] F12 跳转到跨文件 → 新标签页打开 → 光标正确
- [ ] F12 跳转到已打开的隐藏 tab → 切过去 → 光标正确（**之前这里必炸**）
- [ ] Ctrl+Click 跳转——同 F12
- [ ] 编辑器 Ctrl+S 保存 → 正常
- [ ] 编辑器 keep-alive——标签页来回切换光标/滚动保留
- [ ] `npm run check` 零错误

---

## 五、完工标准

- [ ] `TabPanePositioner` 不再使用 `display:none`——`opacity:0` + `pointerEvents:none`
- [ ] `navigation-bridge.ts` 不再有 EditorRegistry
- [ ] `EditorView.tsx` 不再有 `registerEditor`/`unregisterEditor`/`getRegisteredEditor` 调用
- [ ] F12/Ctrl+Click 跳转——单一路径：createTab → consumePendingReveal → reveal
- [ ] 17 个绕路 commit 的逻辑被一行 CSS 替代

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#40
> **← 关联：** E5#5（MainContent 改造）——同文件改动，连做
