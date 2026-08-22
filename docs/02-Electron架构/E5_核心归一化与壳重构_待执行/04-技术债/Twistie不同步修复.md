# DnD Twistie 不同步修复

> 2026-08-02。**E5 第 4 层第 13 轮。** 拖放后 twistie 图标与实际展开状态同步。
> 执行清单任务：E5#24

---

## 一、前因——症状与根因

### 1.1 症状

拖放文件/目录到 `deep/` 松手后：
1. `deep/` 目录自动折叠（子节点消失）
2. 但 twistie 图标仍是 `▼`（展开状态）
3. 点一次：图标变 `▶`（折叠状态），但子节点仍是空的
4. 再点一次：正常展开，子节点出现

**必须点两次才恢复正常。**

### 1.2 代码追踪

**`FileTreeDnD.ts` L177-183——refreshDir 闭包：**

```typescript
const refreshDir = async (dir: string) => {
  callbacks.model.refresh(dir);               // ← 清除 children 缓存
  if (callbacks.model.isExpanded(dir)) {      // ← _expanded Set 仍标记为展开
    const item = callbacks.model.findClosest(dir);
    if (item) await callbacks.model.getChildren(item);  // ← 重新加载子节点
  }
};
```

**`FileTreeModel.ts` L324-345——refresh 方法：**

```typescript
async refresh(path?: string): Promise<void> {
  if (path) {
    const item = this.findClosest(path);
    if (!item?.isDirectory) return;
    if (this._expanded.has(item.uri)) {
      item.children = null;              // ← 清除缓存
      await this.getChildren(item).catch(() => {});  // ← 重新加载
      await this._reloadExpandedDescendants(item);
      return;
    }
    item.children = null;  // ← 未展开=只清缓存
  }
}
```

**`FileTree.tsx` L52-55——twistie 渲染判断：**

```typescript
const twistieItem = (currentLeaf && !currentLeaf.isDirectory && currentLeaf.parent)
  ? currentLeaf.parent : item;
const shouldUnfold = twistieItem?.isDirectory === true
  && model.isExpanded(twistieItem.uri)     // ← _expanded 中有这个 URI
  && twistieItem.children !== null;        // ← children 缓存不为 null
```

### 1.3 根因分析

**时序 bug：**

1. `refreshDir(dir)` 调用 → `model.refresh(dir)` → `item.children = null`
2. `isExpanded(dir)` 返回 true（`_expanded` Set 中仍有该 URI）
3. `getChildren(item)` 开始异步加载… 
4. **在 `getChildren` 完成之前，DnD 的其他逻辑触发了 `rerender()`**
5. 重渲染时 `flattenTree` 检查：`model.isExpanded(uri)` = true，但 `children` = null（`getChildren` 还在进行中）
6. `shouldUnfold` = false（因为 `children !== null` 为 false）→ twistie 图标是 `▶`
7. 但 `_expanded` Set 中仍有该 URI
8. 用户点击 → `handleTwistie` 看到 `isExpanded` = true → 调 `collapse()` → twistie 不变（仍是 `▶`）+ children 仍是 null
9. **第一次点击无效——因为 `isExpanded` 和 `children` 不同步**
10. 第二次点击 → `isExpanded` = false → `expand()` → 重新加载子节点 → 正常

**修复方向：** 确保 `refreshDir` 完成后 `_expanded` 状态和 `children` 状态同步。

---

## 二、修复方案

### 2.1 refreshDir 完成后同步 _expanded

```typescript
// FileTreeDnD.ts L177-183（修复后）
const refreshDir = async (dir: string) => {
  await callbacks.model.refresh(dir);        // ← await 完成（改前没 await）
  // refresh 完成后 model 内部已同步——不需要额外逻辑
  // 但为防万一只 refresh 不展开的 case —— 显式调 rerender
  callbacks.rerender();
};
```

**Fix 1——`refreshDir` 中 `await model.refresh(dir)`：** `refresh` 是 async——不 await 的话 `rerender()` 在 `getChildren` 完成前触发 → children 仍为 null。

### 2.2 FileTreeModel.refresh 加 _expanded 回滚

```typescript
// FileTreeModel.ts refresh 方法（修复后）
async refresh(path?: string): Promise<void> {
  if (path) {
    const item = this.findClosest(path);
    if (!item?.isDirectory) return;
    if (this._expanded.has(item.uri)) {
      item.children = null;
      try {
        await this.getChildren(item);
        await this._reloadExpandedDescendants(item);
      } catch (e) {
        // 加载失败 → 回滚 _expanded（展开状态和实际内容同步）
        this._expanded.delete(item.uri);
        console.error(`[FileTreeModel] refresh 失败，回滚展开状态: ${item.uri}`, e);
        this._onDidChange.fire();
      }
      return;
    }
    item.children = null;
  }
  // ... 全局 refresh ...
}
```

**Fix 2——`getChildren` 失败时回滚 `_expanded`：** 对标已有的 `_rollbackExpanded` 方法（L305-309）——但将其扩展到 `refresh` 路径。

---

## 三、实现步骤

### E5#24a 定位根因——确认调用链（调查 ~10 行）

**内容：** 在 `refreshDir`、`refresh`、`flattenTree` 中加临时 console.log——确认 twistie 不同步的精确时序。

**预期输出：**
```
[FileTreeDnD] refreshDir: target=deep/
[FileTreeModel] refresh: clear children for deep/
[FileTreeModel] refresh: getChildren started
[FileTree] flattenTree: deep/ isExpanded=true, children=null  ← 🔴 时序 gap
[FileTreeModel] refresh: getChildren completed (5 items)
[FileTreeDnD] rerender — too late, already rendered with null children
```

### E5#24b 修复——async await + 回滚（~10 行）

**内容：**
1. `refreshDir` 中 `await model.refresh(dir)`——确保 `getChildren` 完成才 `rerender()`
2. `refresh` 中 `getChildren` 失败时 `_expanded.delete(uri)`

### E5#24c 🛡️ 验证——DnD 测试清单

1. 拖文件到 `deep/` → 松手 → twistie 图标与实际状态一致
2. 拖目录到 `deep/` → 松手 → 同上
3. 从 OS 文件夹拖文件到 `deep/` → 同上
4. 连续拖放多次 → 不出现不同步
5. `npm run check` 零错误

---

## 🔴 预测 Bug

### Bug E5-24a 🔴 await 后 rerender 太晚——refreshDir 调用方已经 return

**触发条件：** `refreshDir` 改为 `async/await` → 但调用方（`handleDrop`）不能 await（事件处理器） → `refreshDir` 异步执行 → `rerender` 在调用方 return 后才触发。

**🔥 防线——调用方也 await：**
```typescript
// handleDrop 中
await refreshDir(target.targetDir);  // ← 已 await（L195, 214-215）
```

**确认：** 当前 L195 和 L214-215 已有 `await refreshDir(...)`——调用方已经在 await。✅

---

## 四、完工标准

- [ ] 拖放后 twistie 图标与实际展开状态一致
- [ ] 点一次 twistie → 正常切换展开/折叠（不需要点两次）
- [ ] refresh 失败时 _expanded 回滚——console.error + twistie 显示折叠
- [ ] 6 步 DnD 测试清单全部通过
- [ ] `npm run check` 零错误

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#24
