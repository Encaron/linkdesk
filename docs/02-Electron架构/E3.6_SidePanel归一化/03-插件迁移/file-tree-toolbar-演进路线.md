# file-tree 工具栏 + sticky scroll 完整演进路线

> 2026-07-30。**从"按钮随滚动消失"到"对标 VS Code Explorer header + 父目录粘顶"。**
> 三阶段：E3.6 暂态 → E4 永久 → 未来 sticky scroll。

---

## 问题

file-tree 的工具栏按钮（[+新建文件] [+新建文件夹] [🔄刷新] [⊟收起全部]）放在 FoldersView 内容区顶部——和文件树列表一起滚动。用户翻到深层目录时，按钮滚出屏幕——找不到新建按钮、不知道自己在哪。

VS Code 的做法是两层保护：
1. **view header actions**——按钮放在 FOLDERS 折叠头右侧，折叠头永远在侧栏顶部
2. **sticky scroll**——父目录粘顶叠加。翻到深层子目录时，所有展开的父目录依次钉在顶部

```
┌──────────────────────────────┐
│ 资源管理器            [◀折叠] │  ← container header（固定）
├──────────────────────────────┤
│ ▶ linkdesk/           [+][🔄][⊟] │  ← view header（固定——actions 在此）
│   ▶ docs/                     │  ← 父子粘顶（linkdesk 的子）
│     ▶ 02-Electron架构/        │  ← 父子粘顶（docs 的子）
│       ▶ E3.6_SidePanel归一化/  │  ← 同级粘顶（02-Electron架构 的子，可被兄弟目录顶替）
│ ──────────────────────────── │  ← 粘性区域结束
│         01-核心桌子/          │  ← 正常滚动
│         ViewContainerService.md│
│         02-壳层改造/          │
│         ...                   │
│ ▶ FOLDERS              [+][🔄][⊟] │
│   ▶ src/                      │
│   ▶ docs/                     │
├──────────────────────────────┤
│ ▶ OUTLINE  (语言插件注册)     │  ← 另一个 view
└──────────────────────────────┘
```

三层固定信息，无论翻多深都在：**你在哪个容器 / 当前 view 能做什么操作 / 你在目录树的什么位置。**

---

## 阶段 1：E3.6 暂态——actions 字段就绪，工具栏暂留内容区

### 做了什么

| 组件 | 状态 |
|------|------|
| `ViewDescriptor.actions?: React.ReactNode` | ✅ 字段就绪——SidePanel 渲染循环已传 `actions={view.actions}` 给 SidebarSection |
| `SidebarSection actions` prop | ✅ 已有——折叠头右侧渲染 ReactNode |
| file-tree 工具栏 | ⚠️ 留在 FoldersView 内容区顶部。加 `position: sticky; top: 0` 防止滚走。加 `flex-wrap: wrap` 防止窄屏溢出 |

### 为什么不能一步到位

工具栏按钮的回调（`handleRefresh` / `handleCollapseAll`）是 FoldersView 内部的 `useCallback`，闭包捕获了 `model` ref 和 `rerender`。放在 `actions`（在 `activate()` 中注册或组件 mount 时注册）里拿不到这些——需要 ref 桥接（对标 B86 `portNameRef` 模式），E3.6 不引入这个复杂度。

### E3.6 执行清单任务

来自 `05-执行清单.md`：

- [ ] **E36#3.2** SidePanel 渲染循环传 `actions={view.actions}` 给 SidebarSection
- [ ] **E36#1.1** `ViewDescriptor` 类型定义含 `actions?: React.ReactNode`
- [ ] **E36#6.3** file-tree 工具栏留在 FoldersView 内容区——`position: sticky` + `flex-wrap`
- [ ] **E36#6.4** UX07 工具栏 flex-wrap——窄屏不溢出

**E3.6 完工后状态：**
- `actions` 字段可用——marketplace 搜索+安装按钮可放进去（已在 E36#7.3 中做）
- file-tree 工具栏 sticky 定位——不滚走但仍在内容区
- `SidebarSection` 渲染 `actions` 的路径已通

---

## 阶段 2：E4 永久方案——命令 handler → 工具栏移到 header actions

### 第 1 步：实现命令 handler（E4V#20 扩展）

file-tree 的 `plugin.json` 已声明了 7 个命令，其中 4 个与工具栏相关：

```json
// plugins/builtin/file-tree/plugin.json
{
  "contributes": {
    "commands": [
      { "id": "explorer.newFile",     "title": "新建文件" },
      { "id": "explorer.newFolder",   "title": "新建文件夹" },
      { "id": "explorer.refresh",     "title": "刷新资源管理器" },
      { "id": "explorer.collapseAll", "title": "收起所有文件夹" }
    ]
  }
}
```

当前 handler 全部是 `console.warn` 占位。E4 需要实现真实逻辑：

| 命令 | handler | 依赖 |
|------|------|------|
| `explorer.newFile` | `FileService.writeFile(joinPath(selectionDir, defaultName), "")` → 刷新 → 进入重命名 | E4V#27 行内重命名 |
| `explorer.newFolder` | 同上，创建空目录 | — |
| `explorer.refresh` | `model.refresh()` → `rerender()` | model ref 桥接 |
| `explorer.collapseAll` | `model.collapseAll()` → `rerender()` | model ref 桥接 |

**ref 桥接方案（对标 B86）：**
```typescript
// plugins/builtin/file-tree/src/FileTreeContextMenu.tsx
// FoldersView mount 时写入 ref，unmount 时清空
export const fileTreeModelRef = { current: null as FileTreeModel | null };
export const fileTreeRerenderRef = { current: null as (() => void) | null };

// FoldersView.tsx
useEffect(() => {
  fileTreeModelRef.current = model;
  fileTreeRerenderRef.current = rerender;
  return () => {
    fileTreeModelRef.current = null;
    fileTreeRerenderRef.current = null;
  };
}, [model, rerender]);

// 命令 handler（在 registerCommand 中注册）
registerCommand("file-tree", {
  id: "explorer.refresh",
  title: "刷新资源管理器",
  handler: async () => {
    await fileTreeModelRef.current?.refresh();
    fileTreeRerenderRef.current?.();
  },
});
```

### 第 2 步：注册 ViewDescriptor.actions

handler 实现后，按钮的 onClick 不再需要直接访问 FoldersView 内部 state——全部通过 `executeCommand` 间接：

```typescript
// plugins/builtin/file-tree/src/index.tsx —— activate()
import { ViewContainerService } from "@src/core/ViewContainerService";
import { executeCommand } from "@src/core/CommandRegistry";

export function activate() {
  ViewContainerService.registerView("file-tree", "explorer", {
    id: "folders",
    title: "",  // 空标题——不显示折叠头标题
    render: FoldersView,  // 由声明式 plugin.json 注册，此处补 actions
    order: 0,
    // 🔥 工具栏按钮移到 header——对标 VS Code ▶ FOLDERS [+][🔄][⊟]
    actions: (
      <>
        <button className="file-tree-toolbar-btn" title="新建文件"
          onClick={() => executeCommand("explorer.newFile")}>
          <span className="codicon codicon-new-file" />
        </button>
        <button className="file-tree-toolbar-btn" title="新建文件夹"
          onClick={() => executeCommand("explorer.newFolder")}>
          <span className="codicon codicon-new-folder" />
        </button>
        <button className="file-tree-toolbar-btn" title="刷新"
          onClick={() => executeCommand("explorer.refresh")}>
          <span className="codicon codicon-refresh" />
        </button>
        <button className="file-tree-toolbar-btn" title="收起全部"
          onClick={() => executeCommand("explorer.collapseAll")}>
          <span className="codicon codicon-collapse-all" />
        </button>
      </>
    ),
  });
}
```

### 第 3 步：从 FoldersView 内容区移除工具栏

工具栏 `<div className="file-tree-toolbar">` 从 FoldersView 的 return 中删除。按钮不再占用内容区空间。

### E4 执行清单任务

来自 `../E4_文件树与编辑器_暂定/06-执行清单.md`：

- [ ] **E4V#20a** `explorer.newFile` handler——`FileService.writeFile` + 刷新 + 进入重命名
- [ ] **E4V#20b** `explorer.newFolder` handler——同上
- [ ] **E4V#20c** `explorer.refresh` handler——`model.refresh()` + `rerender()`。通过 `fileTreeModelRef` 桥接
- [ ] **E4V#20d** `explorer.collapseAll` handler——`model.collapseAll()` + `rerender()`。通过 `fileTreeModelRef` 桥接
- [ ] **E4V#20e** `activate()` 中注册 `ViewDescriptor.actions`——四个按钮，各自调 `executeCommand`
- [ ] **E4V#20f** 从 `FoldersView.tsx` 删除 `<div className="file-tree-toolbar">` 及其子元素
- [ ] **E4V#20g** 验证——工具栏出现在 FOLDERS header 右侧、不随文件树滚动消失、翻到多深都在

**E4 完工后状态：**
- 工具栏按钮在 view header 右侧——对标 VS Code `▶ FOLDERS [+][🔄][⊟]`
- 文件树内容区只剩路径面包屑 + 树节点
- `actions` 机制已验证——其他 view（marketplace/serial-monitor）可复用同样的模式

---

## 阶段 3：未来——FileTree sticky scroll（父目录粘顶）

> ⚠️ 不在 E3.6 或 E4 范围内。此节为架构预留——确保 E3.6/E4 的设计不阻塞 sticky scroll。

### VS Code 是怎么做的

核心算法在 `abstractTree.ts` 的 `StickyScrollController`：

```
1. 取视口第一个可见节点（firstVisibleNode）
2. 从它往上走父链——每个展开的父节点创建一个 StickyScrollNode
3. 粘性节点堆叠在树顶部，总高度不超过视口的 40%
4. 最多 7 个粘性节点（stickyScrollMaxItemCount）
```

展开的父目录被"推"出视口时，变成粘性节点钉在顶部。更深层的祖先继续往上堆。同级目录切换时最底层的粘性节点被替换。

### LinkDesk FileTree 需要什么

当前 `flattenTree` 生成的 `FlatItem[]` 每行有 `depth` 和 `parent` 引用。sticky scroll 需要：

1. 虚拟列表视口第一个可见的 `flatItems[index]`
2. 从它往上找展开的祖先——收集 `depth` 递减的展开父节点
3. 每个祖先渲染为一个 sticky header 行——单行高 22px（`TREE_ITEM_HEIGHT`）
4. 堆叠在虚拟列表顶部——超过视口 40% 或超过 7 个时截断

### 和 ViewDescriptor.actions 的关系

两者独立、互补：
- `actions` 在 view header——属于 SidebarSection 的 chrome。操作入口。
- sticky scroll 在 view 内容——属于 FileTree 组件内部。位置感知。

一个 view 可以同时有 `actions`（header 右侧按钮，始终可见）和 sticky scroll（内容区父目录粘顶）。不冲突。

### 需要改的文件（未来参考）

| 文件 | 改动 |
|------|------|
| `FileTree.tsx` | `flattenTree` 后计算 sticky ancestors + 渲染 overlay |
| `FileTreeModel.ts` | 查找节点的父链（`getAncestors(node): ExplorerItem[]`）|
| `file-tree.css` | `.file-tree-sticky-row` 样式——fixed-position overlay、背景色、缩进对齐 |

---

## 补充：FOLDERS view 动态标题——对标 VS Code

### VS Code 怎么做

Explorer 里的 FOLDERS section 标题不是固定的"资源管理器"——它是**工作区文件夹名**，并且随工作区变化自动更新：

```typescript
// VS Code explorerView.ts L249-252
get name(): string {
    return this.labelService.getWorkspaceLabel(this.contextService.getWorkspace());
    // → "linkdesk" / "my-project" / ...
}
override get title(): string { return this.name; }
```

标题变化时自动重渲染：`this.contextService.onDidChangeWorkspaceName(() => setHeader())`

### LinkDesk 怎么做——E3.6 阶段 1.5

FoldersView 内部已有 `roots[0]?.name` 拿工作区名。需要把标题写回 `ViewDescriptor.title`：

```typescript
// plugins/builtin/file-tree/src/views/FoldersView.tsx
import { ViewContainerService } from "@src/core/ViewContainerService";
import { getWorkspaceFolders, onDidChangeFolders } from "@src/core/WorkspaceService";

export default function FoldersView() {
  // ... 现有 state + refs ...

  // 🔥 FOLDERS view 标题 = 工作区文件夹名
  useEffect(() => {
    const updateTitle = () => {
      const folders = getWorkspaceFolders();
      const title = folders[0]?.name ?? "";  // "" = 无工作区时隐藏折叠头
      ViewContainerService.registerView("file-tree", "explorer", {
        id: "folders",
        title,  // ← 动态标题——和 serial-monitor settings view 同模式
      });
    };
    updateTitle();
    const unsub = onDidChangeFolders(updateTitle);
    return unsub;
  }, []);

  // ... 其余逻辑不变 ...
}
```

**验证：**
- [ ] 无工作区 → FOLDERS view 标题为空字符串（SidebarSection 折叠头不显示）
- [ ] 打开文件夹 `linkdesk` → FOLDERS view 标题更新为 `"linkdesk"`
- [ ] 切换工作区 → 标题自动更新

### E3.6 执行清单任务

- [ ] **E36#TB6** FOLDERS view 动态标题——`useEffect` 读 `getWorkspaceFolders()[0]?.name` → `registerView({ title })` | `FoldersView.tsx` ~8 行
- [ ] **E36#TB7** 验证——无工作区时标题为空（不显示折叠头）、打开工作区后标题=文件夹名、切换工作区后标题更新

---

## 补充：容器内多 view 垂直堆叠

### 行为规则

一个容器（如 `explorer`）可以同时有多个 view——它们按 `order` 字段从小到大垂直排列。对标 VS Code Explorer 的 OPEN EDITORS → FOLDERS → TIMELINE → OUTLINE。

```
┌──────────────────────────────┐
│ 资源管理器            [◀折叠] │  ← container header（固定）
├──────────────────────────────┤
│ ▶ linkdesk    [+][🔄][⊟]     │  ← file-tree 注册的 FOLDERS view（order:0）
│   src/                        │
│   docs/                       │
├──────────────────────────────┤
│ ▶ TIMELINE                    │  ← Git 插件注册（order:100）
│   M modified.ts               │
├──────────────────────────────┤
│ ▶ OUTLINE                     │  ← 语言插件注册（order:200）
│   functionA()                 │
└──────────────────────────────┘
```

**规则：**
1. 同一容器内 views 按 `order` 升序排列。`order` 相同 → 按注册先后
2. 任何插件可通过 `registerView("explorer", ...)` 往别人的容器加 view——容器主人不知道
3. view 可被 SidebarSection 折叠/展开——每个 view 独立
4. view 可通过 `when` context key 条件显隐（E3.6 暂存字段，不消费）
5. 卸载插件 → 该插件注册的 view 从所有容器移除 → 其他 view 不受影响、不重排（保留空位或自动补位——暂定保留空位）

**限制（E3.6）：**
- 不支持用户拖放 view 到其他容器（`canMoveView` 字段已存，未来消费）
- 不支持用户手动显隐 view（`canToggleVisibility` 字段已存，未来消费）

### E3.6 执行清单任务

- [ ] **E36#TB8** 验证——E36#12 测试插件 `registerView("explorer", { id: "test", order: 50 })` → FOLDERS (order:0) 在上面、TEST (order:50) 在下面
- [ ] **E36#TB9** 验证——两个插件注册到同一容器、order 相同 → 按注册先后排列
- [ ] **E36#TB10** 验证——卸载其中一个插件 → 它的 view 消失、另一个 view 不受影响

| | E3.6 暂态 | E4 永久 | 未来 |
|:--|:--|:--|:--|
| 工具栏位置 | 内容区顶部——sticky | view header actions | view header actions |
| 按钮回调 | 直接访问 FoldersView state | `executeCommand` → ref 桥接 | `executeCommand` |
| 父目录粘顶 | ❌ | ❌ | ✅ sticky scroll |
| ViewDescriptor.actions | 字段就绪、SidePanel 路径通 | 消费——file-tree 工具栏放入 | 消费 |
| 对标 VS Code | — | Explorer header actions | Explorer sticky scroll |

---

> **← file-tree 迁移：** `file-tree.md`
> **← 执行清单：** `../05-执行清单.md`
> **→ E4 执行清单：** `../../E4_文件树与编辑器_暂定/06-执行清单.md`
> **→ UX 审查：** `../06-UI-UX审查.md` §P1-2 "工具栏溢出" + §P0-2 "搜索框 sticky"
