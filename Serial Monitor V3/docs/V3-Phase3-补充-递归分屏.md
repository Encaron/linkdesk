# Phase 3 补充：递归分屏——VS Code 风格自由布局

> 2026-07-19，替代原 §2.4 的"仅 2-pane"限制。Phase 3.x step。

---

## 目录

1. [为什么当前模型不够](#1-为什么当前模型不够)
2. [新数据模型：递归分裂树](#2-新数据模型递归分裂树)
3. [Drop Zone 检测——嵌套面板](#3-drop-zone-检测嵌套面板)
4. [组件层：递归 SplitPane](#4-组件层递归-splitpane)
5. [状态操作：树变换](#5-状态操作树变换)
6. [布局持久化 + 迁移](#6-布局持久化--迁移)
7. [拖拽预览增强](#7-拖拽预览增强)
8. [潜在 bug 预估 + 预防](#8-潜在-bug-预估--预防)
9. [额外想法](#9-额外想法)
10. [实施顺序](#10-实施顺序)

---

## 1. 为什么当前模型不够

当前 `SplitLayout` 是扁平二格：

```ts
SplitLayout {
  direction: "horizontal" | "vertical";
  groupIds: [string, string];  // 永远恰好两个
  sizes: [number, number];
}
```

**这意味着所有分屏组合只能有两个面板。** 用户场景：

```
用户已有 [终端 | 工作台]（上下分屏）
现在想看 OLED 在旁边 →
期望：[终端 | 工作台]（上下）| OLED（左右三栏）
实际：只能把 OLED 塞进上面或下面的面板，变成标签页堆叠
```

VS Code 可以做到这点是因为它的分屏模型是**递归二叉树**——每个节点要么是叶子（一个 editor group），要么是一个分叉（方向 + 两个子树）。

---

## 2. 新数据模型：递归分裂树

### 2.1 核心类型

```ts
/** 分裂树节点——要么是叶子（含一个 TabGroup），要么是分叉（含两个子树） */
export type SplitNode =
  | { type: "leaf"; groupId: string }
  | {
      type: "branch";
      direction: "horizontal" | "vertical";
      children: [SplitNode, SplitNode];
      sizes: [number, number];   // 百分比，如 [50, 50]。表示两个子树在父容器中的占比
    };

/** Tab 和 TabGroup 不变，和当前完全一样 */
interface Tab { /* 不变 */ }
interface TabGroup { /* 不变 */ }

/** 顶层状态——split 从 SplitLayout|null 变成 SplitNode */
interface TabState {
  groups: TabGroup[];          // 所有存在的 group 的平铺列表，方便 O(1) 查找
  activeGroupId: string;
  root: SplitNode;             // 分裂树根节点——单面板时 = { type:"leaf", groupId:"main" }
}
```

### 2.2 为什么用平铺 groups[] + 树结构

- `groups[]` 平铺数组 → `findGroup(state, tabId)` 仍是 O(n)（n ≤ 10，可忽略），不需要遍历树
- `root` 树只管布局——不持有 Tab 数据，只持有 `groupId` 引用
- 加新 group → push 到 `groups[]` + 在树中引用它的 `groupId`
- 删 group → 从 `groups[]` 中移除 + 从树中移除对应的 leaf

### 2.3 示例：三栏布局

```
用户操作序列：
1. 初始：[终端]                                    root = leaf("main")
2. 拖终端向下分屏：[终端 | 工作台]                    root = branch("vertical", [leaf("g1"), leaf("g2")])
3. 拖 OLED 到最右边：[ [终端|工作台] | OLED ]       root = branch("horizontal", [branch("vertical", ...), leaf("g3")])
```

对应树结构：
```
Branch("horizontal", sizes=[67, 33])
├── Branch("vertical", sizes=[50, 50])
│   ├── Leaf(groupId="g1")   ← 终端
│   └── Leaf(groupId="g2")   ← 工作台
└── Leaf(groupId="g3")       ← OLED
```

### 2.4 辅助函数

```ts
/** 平铺所有叶子 groupId——用于验证、持久化 */
export function getAllLeafGroupIds(node: SplitNode): string[] {
  if (node.type === "leaf") return [node.groupId];
  return [...getAllLeafGroupIds(node.children[0]), ...getAllLeafGroupIds(node.children[1])];
}

/** 在树中查找一个 groupId 的父节点 + 它是左孩子还是右孩子 */
export function findParentInTree(
  node: SplitNode,
  groupId: string,
  parent?: { node: SplitNode & { type: "branch" }; side: 0 | 1 }
): { parent: SplitNode & { type: "branch" }; side: 0 | 1 } | null {
  if (node.type === "branch") {
    if (node.children[0].type === "leaf" && node.children[0].groupId === groupId) {
      return { parent: node, side: 0 };
    }
    if (node.children[1].type === "leaf" && node.children[1].groupId === groupId) {
      return { parent: node, side: 1 };
    }
    return findParentInTree(node.children[0], groupId, { parent: node, side: 0 })
        || findParentInTree(node.children[1], groupId, { parent: node, side: 1 });
  }
  return null;
}

/** 最大嵌套深度——防止无限分割 */
export function treeDepth(node: SplitNode): number {
  if (node.type === "leaf") return 1;
  return 1 + Math.max(treeDepth(node.children[0]), treeDepth(node.children[1]));
}
```

---

## 3. Drop Zone 检测——嵌套面板

### 3.1 双层检测

当前检测只针对整个编辑器区域。嵌套下需要两层：

**第 1 层：找到鼠标落在哪个叶子面板上。**

遍历所有 leaf group → 找到对应 DOM 元素（`.tab-group-pane[data-group-id="xxx"]`）→ 检查 `elementFromPoint` 或 rect 包含。

```ts
function findLeafUnderMouse(
  clientX: number, clientY: number
): { groupId: string; rect: DOMRect } | null {
  const panes = document.querySelectorAll<HTMLElement>(".tab-group-pane");
  for (const pane of panes) {
    const rect = pane.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right &&
        clientY >= rect.top && clientY <= rect.bottom) {
      return { groupId: pane.dataset.groupId!, rect };
    }
  }
  return null;
}
```

**第 2 层：在找到的叶子面板内，用现有 `detectDropZone` 算法判断分屏方向。**

```ts
function detectNestedDropZone(
  clientX: number, clientY: number
): { leafGroupId: string; zone: DropZone } | null {
  const leaf = findLeafUnderMouse(clientX, clientY);
  if (!leaf) {
    // 鼠标不在任何面板上——可能在整个编辑器区域的边缘
    // → 用编辑器区域整体 rect 做 fallback
    const editorRect = editorAreaRef.current?.getBoundingClientRect();
    if (!editorRect) return null;
    const zone = detectDropZone(clientX, clientY, editorRect);
    return zone && zone !== "center" ? { leafGroupId: "__root__", zone } : null;
  }
  const zone = detectDropZone(clientX, clientY, leaf.rect);
  return zone && zone !== "center" ? { leafGroupId: leaf.groupId, zone } : null;
}
```

### 3.2 语义："分屏" vs "移动"

| 鼠标位置 | 行为 |
|------|------|
| 在叶子面板的**边缘** (drop zone = left/right/up/down) | **分裂该叶子面板**——在该 leaf 的父处插入一个新 leaf（或向外扩展） |
| 在另一个面板的**标签栏**上 | **移动**——tab 从原 group 移到目标 group（和现在一样） |
| 在整个编辑器区域的**最外边缘**（不在任何叶子面板上） | **在根层级分裂**——在根外面包一层 branch，新 leaf 做兄弟 |

**关键：** 分裂的"锚点叶子" = 鼠标所在的那个面板。分裂方向 = `detectDropZone` 在**那个面板**的 rect 上计算的结果。

---

## 4. 组件层：递归 SplitPane

### 4.1 当前 `SplitPane` → 升级为递归

当前 `SplitPane` 只渲染一层（两个 children）。新 `SplitPane` 递归渲染 `SplitNode` 树：

```tsx
function SplitPane({ node, groups, ... }: { node: SplitNode; groups: TabGroup[] }) {
  if (node.type === "leaf") {
    const group = groups.find(g => g.id === node.groupId)!;
    return renderGroup(group);  // 标签栏 + 内容区
  }

  const [child1, child2] = node.children;
  const isHorizontal = node.direction === "horizontal";

  return (
    <div style={{
      display: "flex",
      flexDirection: isHorizontal ? "row" : "column",
      flex: 1, minWidth: 0, minHeight: 0,
    }}>
      <div style={{ flex: node.sizes[0], overflow: "hidden", minWidth: 0, minHeight: 0 }}>
        <SplitPane node={child1} groups={groups} />
      </div>
      <ResizeHandle direction={node.direction} onResize={...} />
      <div style={{ flex: node.sizes[1], overflow: "hidden", minWidth: 0, minHeight: 0 }}>
        <SplitPane node={child2} groups={groups} />
      </div>
    </div>
  );
}
```

### 4.2 分割条（ResizeHandle）

**每个 branch 节点对应一个分割条。** 多级分屏 = 多个分割条，各自独立拖拽。

```
┌──────────────┬─────────────────────┐
│              │        │            │
│   终端       │ 工作台 │   OLED     │  ← 两个分割条：竖线②是外层，竖线①是内层
│              │   ①   │            │
│              │        │            │
└──────────────┴────────┴────────────┘
               ②
```

分割条的 `onResize` 只更新**它自己所在 branch** 的 `sizes`——不影响其他 branch。

### 4.3 最小尺寸约束

每个叶子面板（leaf）有最小尺寸：宽 ≥ 200px，高 ≥ 100px。当父 branch 的 resize 导致某个子树被压缩到低于最小尺寸时，**拖拽停止，尺寸锁定在最小值。** 这和 VS Code 的行为一致。

实现：在 resize handler 中，计算两个子树各自包含的 leaf 数量 + 每个 leaf 的最小尺寸 → 换算成百分比下限 → clamp。

---

## 5. 状态操作：树变换

### 5.1 `reduceSplitTab(tabId, direction)` —— 核心变化最大

**当前（v4 扁平模型）：**
```ts
// 已分屏 → 忽略或切换方向
// 未分屏 → 创建新 group，建 SplitLayout
```

**新模型：**
```ts
/**
 * 分裂标签页到指定方向。
 * 1. 找到 tabId 所在的 leaf group
 * 2. 从该 group 中移出 tab
 * 3. 创建新 group（含 tab）做 leaf 节点
 * 4. 在树中替换原 leaf 为 branch(方向, [原leaf, 新leaf])
 */
function reduceSplitTab(prev: TabState, tabId: string, direction: "horizontal" | "vertical"): TabState {
  const sourceGroup = findGroup(prev, tabId);
  if (!sourceGroup || sourceGroup.tabs.length < 1) return prev;

  // 深度检查：最大允许 4 层嵌套
  if (treeDepth(prev.root) >= 4) return prev;

  const tab = sourceGroup.tabs.find(t => t.id === tabId)!;
  const sourceRemaining = sourceGroup.tabs.filter(t => t.id !== tabId);

  // 创建新 group
  const newGroup = createGroup([tab]);
  const newGroups = prev.groups.map(g =>
    g.id === sourceGroup.id
      ? { ...g, tabs: sourceRemaining, activeTabId: sourceRemaining[0]?.id ?? "" }
      : g
  ).concat(newGroup);

  // 树操作：找到 sourceGroup 在树中的位置，替换为 branch
  const newRoot = replaceLeafWithBranch(
    prev.root,
    sourceGroup.id,
    direction,
    newGroup.id
  );

  return { groups: newGroups, activeGroupId: newGroup.id, root: newRoot };
}

/** 在树中找到 groupId 对应的 leaf，替换为 branch(方向, [原leaf, newLeaf]) */
function replaceLeafWithBranch(
  node: SplitNode,
  targetGroupId: string,
  direction: "horizontal" | "vertical",
  newGroupId: string
): SplitNode {
  if (node.type === "leaf") {
    if (node.groupId === targetGroupId) {
      // 把原 leaf 和 新 leaf 打包成 branch
      return {
        type: "branch",
        direction,
        children: [node, { type: "leaf", groupId: newGroupId }],
        sizes: [50, 50],
      };
    }
    return node;
  }
  return {
    ...node,
    children: [
      replaceLeafWithBranch(node.children[0], targetGroupId, direction, newGroupId),
      replaceLeafWithBranch(node.children[1], targetGroupId, direction, newGroupId),
    ],
  };
}
```

**注意：已分屏时再拖到另一个方向**——当前行为是"切换方向"或"忽略"。新模型下，**每次拖到面板边缘 = 在那个面板上做一次新的分裂**——也就是在树的对应位置插入 branch。这完全对标 VS Code。

### 5.2 `reduceUnsplit(groupId)` —— 收起一个面板

```ts
/**
 * 收起指定 groupId 的面板：
 * 1. 在树中找到该 groupId 的父 branch
 * 2. 用另一个 child 替换整个 branch
 * 3. 目标 group 的 tabs 合并到保留的 group 中（或丢弃——对标 VS Code：关闭面板时标签页不保留）
 */
function reduceUnsplit(prev: TabState, groupId: string): TabState {
  const group = prev.groups.find(g => g.id === groupId);
  if (!group) return prev;

  // 终端保底：如果关闭后没有任何终端
  // ... (同当前逻辑)

  const result = removeLeafFromTree(prev.root, groupId);
  if (!result) return prev;  // 只剩一个 leaf，不能 unsplit

  const newGroups = prev.groups.filter(g => g.id !== groupId);
  return {
    groups: newGroups,
    activeGroupId: result.survivingSiblingGroupId,
    root: result.tree,
  };
}
```

### 5.3 `reduceMoveTab(tabId, targetGroupId)` —— 基本不变

移动标签页的逻辑和当前一致：从源 group 移出，加入目标 group。唯一需要额外处理的边界：**如果源 group 变空**——当前代码会 unsplit（整个 SplitLayout 清掉）。新模型下，"源 group 空了" = 树中有一个 leaf 对应空的 TabGroup——此时应该移除这个 leaf（调用 unsplit 逻辑收掉该面板）。

### 5.4 `reduceCloseTab` —— 边界强化

关闭标签页时，如果 group 变空且树中有多个 leaf → 触发 unsplit。逻辑和当前相似，但"unsplit"操作从全局扁平变为树节点删除。

---

## 6. 布局持久化 + 迁移

### 6.1 新 LayoutData 格式

```ts
interface LayoutData {
  groups: { id: string; tabs: Tab[]; activeTabId: string }[];
  activeGroupId: string;
  root: SplitNode;  // 替代旧的 split: SplitLayout | null
}
```

SplitNode 树直接 JSON 序列化——它是纯数据结构，没有循环引用。

### 6.2 迁移旧格式

`reduceRestoreLayout` 需要处理旧格式（`split: SplitLayout | null`）：

```ts
function reduceRestoreLayout(saved: any): TabState {
  // 检测旧格式
  if (saved.split && !saved.root) {
    // 旧 SplitLayout → 新 SplitNode
    if (saved.split.groupIds && saved.split.groupIds.length === 2) {
      saved.root = {
        type: "branch",
        direction: saved.split.direction,
        children: [
          { type: "leaf", groupId: saved.split.groupIds[0] },
          { type: "leaf", groupId: saved.split.groupIds[1] },
        ],
        sizes: saved.split.sizes,
      };
    }
  }
  if (!saved.root) {
    // 单面板
    saved.root = { type: "leaf", groupId: saved.groups[0]?.id ?? "main" };
  }
  // ... 其余验证逻辑不变
}
```

### 6.3 AI 友好评估

递归树的 JSON 表示对 AI 是友好的——AI 可以：
- 在平铺 `groups[]` 中找到要改的标签页（O(1) 思维）
- 在树中定位对应的 leaf（按 groupId 查找，简单递归遍历）
- 理解布局结构（树的缩进表示直观对应屏幕上的嵌套）

**不加额外嵌套层。** 树里的 `groupId` 引用 groups 数组中的条目，不把 Tab 数据嵌入树中。和 workspace.json 禁止嵌套的设计哲学一致。

---

## 7. 拖拽预览增强

### 7.1 幽灵面板（Ghost Pane）

对标 VS Code：拖拽标签页到面板边缘时，在目标位置显示一个**半透明彩色矩形**——表示"标签页放这里会变成一个新面板"。

```
当前（Phase 3 v4）：毛玻璃 overlay 覆盖整个编辑器区域的边缘 25%

增强：
┌──────────────┬─────────────┐
│              │  ░░░░░░░░░  │  ← 半透明覆盖目标面板，显示分裂方向和大小
│   终端       │  ░ 新面板 ░  │
│              │  ░░░░░░░░░  │
└──────────────┴─────────────┘
```

实现：在目标 leaf panel 的 rect 内，根据 `detectDropZone` 的方向和 50% 阈值，**只覆盖目标半边**——而不是整个编辑器。

### 7.2 锚点提示（Anchor Hints）

每个面板的边缘中心显示一个微弱的锚点标记（hover 时出现），直接点击可以快速分屏，不需要拖拽。

```
┌──────────────┬─●─┐
│              │   │  ← ● = 左侧分屏锚点
│   终端       │   │
│              │   │
└──────────────┴─●─┘
```

对标 VS Code 的 "Split Right" / "Split Down" 按钮（在编辑器标签栏右上角）。已经有右键菜单的"向下分屏/向右分屏"——锚点是拖拽之外的另一种快捷操作。

### 7.3 布局名称 + 预设

这是你提的"左中右"等——可以作为**快捷布局预设**：

| 预设名 | 结构 | 适合场景 |
|------|------|------|
| 2 列 | root = branch("horizontal", [leaf, leaf]) | 左终端 + 右工作台 |
| 2 行 | root = branch("vertical", [leaf, leaf]) | 上终端 + 下工作台 |
| 3 列 | branch("horizontal", [leaf, branch("horizontal", [leaf, leaf])]) | 左终端 + 中工作台 A + 右工作台 B |
| 左 + 右双行 | branch("horizontal", [leaf, branch("vertical", [leaf, leaf])]) | 左终端 + 右上工作台 + 右下 OLED |
| 2x2 网格 | branch("horizontal", [branch("vertical", [...]), branch("vertical", [...])]) | 四个面板 |

**入口：** 命令面板（Ctrl+Shift+P → "Layout: 2 Columns"）+ 标签栏右键菜单 → "布局" 子菜单。

---

## 8. 潜在 bug 预估 + 预防

### 8.1 数据模型层

| # | 可能发生的 bug | 预防 |
|:--:|------|------|
| **T1** | 树中出现"孤立 leaf"——groupId 指向已删除的 group | `reduceRestoreLayout` 中添加树验证：每个 leaf 的 groupId 必须在 `groups[]` 中存在，否则剪枝 |
| **T2** | 树深度无限增长——用户疯狂分屏到 10 层 | 硬限制 `treeDepth() <= 4`，>=4 时 `reduceSplitTab` 直接 return prev |
| **T3** | 树的两个 children 顺序反了——水平分屏时该在右边的 leaf 跑到左边 | `replaceLeafWithBranch` 中新 leaf 始终放右边/下边——`[原leaf, 新leaf]`。如需放左边，由 `direction` + `zoneToSide()` 决定顺序 |
| **T4** | unsplit 后 group 的 tabs 丢失 | unsplit 时必须决定目标 group 的 tabs 去向。对标 VS Code：关闭面板 → 该面板的标签页也关闭（可以从 [+] 重新打开）。如果用户想保留标签页，应该先拖过去 |
| **T5** | `reduceRestoreLayout` 迁移旧格式时 groupId 不存在 | 旧 split.groupIds 中的 group 在恢复时可能已被过滤掉（tabs 为空）。迁移前先验证 groupId 有效性 |

### 8.2 渲染层

| # | 可能发生的 bug | 预防 |
|:--:|------|------|
| **R1** | 递归 SplitPane 无限渲染——树的 children 引用形成环 | `SplitNode` 是纯值类型（每次操作生成新树），不存在引用环。但 JSON 持久化恢复时需要防 |
| **R2** | 嵌套 resize handle 互相干扰——拖内层分割条时外层也在动 | 每个 resize handle 只调**自己所在 branch** 的 `sizes`。事件冒泡用 `e.stopPropagation()` |
| **R3** | 面板最小尺寸被破坏——resize 到 0 导致面板消失 | 在 resize handler 中计算百分比下限：`minPct = (leafCount * minLeafPx) / containerPx * 100` |
| **R4** | Keep-alive 的 `display:none/flex` 在递归面板中失效 | 不变——每个 `.tab-content-pane` 仍用 `display:none/flex`，和面板嵌套层级无关 |

### 8.3 拖拽交互层——最易回归

| # | 可能发生的 bug | 预防 |
|:--:|------|------|
| **D1** | 拖到叶子面板边缘 → 分屏方向算错——该左右的变成了上下 | `detectDropZone` 在**那个 leaf 的 rect** 上算，不是全局 editor 的 rect。rect 取 `.tab-group-pane[data-group-id]` 的 bounding rect |
| **D2** | `elementFromPoint` 找不到嵌套面板——被分割条挡住 | 在 `findLeafUnderMouse` 中，对 `.tab-group-pane` 用 `getBoundingClientRect` 做 rect 检测（不用 elementFromPoint），避免分割条的 z-index 干扰 |
| **D3** | 拖到另一个面板的标签栏 → 不移动（Bug #9 回归） | 已修。`findOtherContainer` 返回 boolean，新实现要保持 boolean |
| **D4** | 拖拽幽灵预览显示在错误的位置 | 幽灵面板的 rect = 目标 leaf 的 rect 裁剪到对应半边（和 drop zone 方向一致），用 `position: absolute` + leaf 的 rect 坐标 |

### 8.4 持久化层

| # | 可能发生的 bug | 预防 |
|:--:|------|------|
| **P1** | 保存的布局树损坏（手动编辑 prefs.json 出错）→ 启动白屏 | `reduceRestoreLayout` 中 try-catch 每个验证步骤。树损坏 → 回退到单面板 + 一个终端标签页 |
| **P2** | 旧格式迁移后 group 顺序不对 | 迁移时保持 groupIds 顺序 → children[0] 对应 groupIds[0] |
| **P3** | sizes 总和 ≠ 100 → 分割条计算异常 | 验证时 normalize sizes：`sizes.map(s => s / sum * 100)` |

---

## 9. 额外想法

### 9.1 拖标签页到面板中心 = "合并到此面板"

当前拖到边缘 = 分屏，拖到标签栏 = 移动。还可以加第三种：**拖到面板内容区的中心区域（drop zone = "center"）→ 标签页移动到此面板并成为焦点。** 

```
拖到左边缘 → 左侧创建新面板（分屏）
拖到中心   → 加入此面板（移动）  ← 新增
拖到标签栏 → 加入此面板的标签栏（移动）← 已有
```

这比拖到标签栏更宽容——鼠标不用精确对准标签栏，只要到面板中央就行。

### 9.2 双击分割条 = 均分

双击任意分割条 → 该 branch 的 sizes 重置为 `[50, 50]`。对标 VS Code 的"Reset Sizes"。

### 9.3 面板最小尺寸——200px 硬约束

当前有 `min-width: 200px`，在递归模型中每个 leaf 面板继承此约束。面板太小时，标签栏的标签页会被挤成 `...`——这不是 bug，是合理的空间反馈。

### 9.4 Shift+拖拽标签页 = 复制视图

对标 VS Code：按住 Shift 拖拽标签页到面板边缘 → **复制**该标签页的视图到新面板（不移动原标签页）。对于串口工具——两个终端标签页看同一个串口数据但不同过滤设置——这很有用。

### 9.5 焦点面板视觉区分

当前活跃面板（`activeGroupId`）只有标签栏颜色区分。可以加一个**焦点边框指示器**：活跃面板外围 1px `--accent` 边框——对标 VS Code 的蓝色焦点边框。非焦点面板无边框。

### 9.6 面板图标

每个面板的标签栏左侧显示**所属 group 的微缩标识**（一个小图标或 group 编号）——方便用户理解哪个面板是哪个，特别是在 3+ 面板布局中。

---

## 10. 实施顺序

| Step | 内容 | 预计行数 | 风险 |
|:--:|------|:--:|:--:|
| **S1** | `SplitNode` 类型 + 辅助函数（`treeDepth`, `findParentInTree`, `getAllLeafGroupIds`）+ 单元测试 | ~100 行 | 低——纯函数 |
| **S2** | `useTabManager` 改造：`SplitLayout` → `SplitNode`，所有 reducer 适配新类型 | ~200 行改 | 中——核心逻辑 |
| **S3** | `reduceRestoreLayout` 迁移逻辑 + 测试（旧格式→新格式） | ~80 行 | 中——需覆盖各种旧格式 |
| **S4** | `SplitPane` 递归化 + `ResizeHandle` 嵌套兼容 | ~120 行 | 中——渲染层 |
| **S5** | 嵌套 drop zone 检测（`findLeafUnderMouse` + `detectNestedDropZone`） | ~80 行 | 低——纯几何 |
| **S6** | 幽灵面板（ghost pane）+ 拖拽预览增强 | ~100 行 | 低——CSS + 定位 |
| **S7** | 命令面板 + 快捷布局预设（2列/2行/3列/2x2） | ~80 行 | 低 |
| **S8** | 完整测试 + 手动验证 + bug 修复 | — | — |

**总计：~760 行新代码 + ~200 行改动。** 可以在不破坏现有功能的前提下逐步替换——先改类型，再改逻辑，最后改 UI。

---

> **设计原则提醒（来自 [[recurring-themes]]）：**
> - 树结构中的 `groupId` 是引用，不嵌入 Tab 数据 → 归一化
> - 新 CSS 变量 → `themes/*.json` + `index.css` fallback → 归一化
> - 状态变换是纯函数 → AI 友好
> - 所有新的拖拽分支（分屏/移动/合并/复制）必须双向可逆 → 不重蹈 Phase 3 bug
