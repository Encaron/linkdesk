# file-tree 迁移——FoldersView 提取

> 对应任务：E36#6。三个迁移中最简单的一个——file-tree 本来就只有一个 view。不拆不砍，只提取。

---

## 当前状态

[sidebar.tsx](linkdesk/plugins/builtin/file-tree/src/sidebar.tsx) 137 行——`FileTreeSidebar` 大组件：
- header 标题（"资源管理器"）→ 迁移后 SidePanel 统画
- 面包屑 → 迁移后移到 FoldersView 内容顶部
- 工具栏（4 个按钮：新建文件/新建文件夹/刷新/收起全部）→ 保留在 FoldersView 内容顶部
- FileTree / WelcomeView 条件渲染 → 保留
- 右键菜单 → 保留

---

## 迁移后

`plugin.json` 声明 viewsContainers + views，sidebar.tsx 的核心内容提取到 `FoldersView.tsx`。

### plugin.json 新增

```json
{
  "contributes": {
    "viewsContainers": {
      "explorer": {
        "title": "资源管理器",
        "location": "sidebar",
        "hideIfEmpty": false
      }
    },
    "views": {
      "explorer": [
        {
          "id": "folders",
          "title": "",
          "render": "src/views/FoldersView.tsx",
          "order": 0
        }
      ]
    }
  }
}
```

### FoldersView.tsx——工具栏为什么留在内容区

**ViewDescriptor 有 `actions?: React.ReactNode` 字段——用于 view header 右侧的操作按钮。** 对标 VS Code view header actions。

但对 file-tree 来说，工具栏按钮（刷新/收起全部）的 onClick 回调是 FoldersView 内部的 `useCallback`（`handleRefresh` / `handleCollapseAll`）。这些回调闭包捕获了 `model` ref 和 `rerender`——放在 header actions 里需要通过 ref 桥接才能拿到（对标 B86 `portNameRef` 模式）。E3.6 不做这个桥接。

**决策：** 工具栏留在 `FoldersView` 内容区顶部——和当前 sidebar.tsx 行为一致。**`actions` 字段留给操作模块级状态的场景**——如 marketplace 的搜索+安装按钮（操作模块级 search state，不依赖组件内部 state）。
**🔥 TB2-TB3：** E3.6 暂态——工具栏加 `position: sticky; top: 0` + `flex-wrap: wrap`。E4V#20 完成后从内容区删除。

**E4：** 工具栏操作走命令系统（E4V#20a–d 实现 `explorer.refresh` / `explorer.collapseAll` handler）→ header actions 通过 `executeCommand` 触发 → 不需要 ref 桥接 → 工具栏从内容区移到 `ViewDescriptor.actions`。

### FoldersView.tsx——完整代码骨架

```typescript
// plugins/builtin/file-tree/src/views/FoldersView.tsx
import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getWorkspaceFolders, onDidChangeFolders, type WorkspaceFolder } from "@src/core/WorkspaceService";
import { CoreEvents } from "@src/core/CoreEvents";
import FileTree from "../FileTree";
import FileTreeContextMenu, { activateFileTreeContextMenu } from "../FileTreeContextMenu";
import WelcomeView from "../WelcomeView";
import { FileTreeModel } from "../FileTreeModel";
import type { ExplorerItem } from "../FileTreeModel";
import "../file-tree.css";

export default function FoldersView() {
  const { t } = useTranslation();
  const modelRef = useRef<FileTreeModel>(new FileTreeModel());
  const model = modelRef.current;

  const [roots, setRoots] = useState<WorkspaceFolder[]>([]);
  const [, setVersion] = useState(0);
  const rerender = useCallback(() => setVersion((v) => v + 1), []);

  // ── 注册 explorer 命令 + FileContext 菜单项（从 sidebar.tsx L31 搬）──
  useEffect(() => { activateFileTreeContextMenu(); }, []);

  // ── 右键菜单状态（从 sidebar.tsx L34-45 搬）──
  const [contextMenu, setContextMenu] = useState<{
    item: ExplorerItem | null;
    anchor: { x: number; y: number };
  } | null>(null);

  const handleContextMenu = useCallback(
    (item: ExplorerItem, event: React.MouseEvent) => {
      event.preventDefault();
      setContextMenu({ item, anchor: { x: event.clientX, y: event.clientY } });
    }, [],
  );

  // ── 同步工作区根（从 sidebar.tsx L49-63 搬）──
  const syncRoots = useCallback(async () => {
    const folders = getWorkspaceFolders();
    setRoots(folders);
    await model.setRoots(folders.map((f) => f.uri));
    rerender();
  }, [model, rerender]);

  useEffect(() => {
    syncRoots();
    const unsub1 = onDidChangeFolders(() => { syncRoots(); });
    const unsub2 = CoreEvents.onDidChangeFileSystem.event(() => {
      model.refresh().then(() => rerender());
    });
    return () => { unsub1(); unsub2(); };
  }, [syncRoots, model, rerender]);

  // ── 打开文件（从 sidebar.tsx L67-69 搬）──
  const handleOpenFile = useCallback((_item: ExplorerItem, _mode: "preview" | "pin") => {
    // TODO E4c #103: FileAssociationService
  }, []);

  // ── 工具栏操作（从 sidebar.tsx L73-81 搬）──
  const handleRefresh = useCallback(async () => {
    await model.refresh(); rerender();
  }, [model, rerender]);

  const handleCollapseAll = useCallback(() => {
    model.collapseAll(); rerender();
  }, [model, rerender]);

  const rootName = roots[0]?.name ?? "";

  // ── 渲染（从 sidebar.tsx L87-134 搬——去掉 header 标题）
  return (
    <div className="file-tree-root file-tree-sidebar">
      {/* 路径面包屑 */}
      {rootName && (
        <div className="file-tree-breadcrumb">
          <span className="codicon codicon-root-folder file-tree-breadcrumb-icon" />
          <span className="file-tree-breadcrumb-path">{rootName}</span>
        </div>
      )}

      {/* 工具栏 */}
      <div className="file-tree-toolbar">
        <button className="file-tree-toolbar-btn" title={t("新建文件")} onClick={() => {/* TODO E4b #98 */}}>
          <span className="codicon codicon-new-file" />
        </button>
        <button className="file-tree-toolbar-btn" title={t("新建文件夹")} onClick={() => {/* TODO E4b #98 */}}>
          <span className="codicon codicon-new-folder" />
        </button>
        <button className="file-tree-toolbar-btn" title={t("刷新")} onClick={handleRefresh}>
          <span className="codicon codicon-refresh" />
        </button>
        <button className="file-tree-toolbar-btn" title={t("收起全部")} onClick={handleCollapseAll}>
          <span className="codicon codicon-collapse-all" />
        </button>
      </div>

      {/* 文件树 / 空工作区 */}
      <div className="file-tree-body">
        {roots.length === 0 ? (
          <WelcomeView />
        ) : (
          <FileTree model={model} onOpenFile={handleOpenFile} onContextMenu={handleContextMenu} />
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <FileTreeContextMenu
          item={contextMenu.item}
          anchor={contextMenu.anchor}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
```

**关键变化：**
- ❌ 删 `file-tree-header` div——SidePanel 统画 header
- ✅ 保留面包屑——移到 FoldersView 内容顶部
- ✅ 保留工具栏——FoldersView 内自由渲染
- ✅ 保留 FileTree/WelcomeView 条件渲染——核心内容不动
- ✅ 保留右键菜单——FoldersView 内管理自己的 contextMenu state

### sidebar.tsx——标记废弃

```typescript
/**
 * @deprecated 自 E3.6——提取为 FoldersView（src/views/FoldersView.tsx）。
 * 保留此文件直到 R4 清理。
 * 旧 export 指向新组件——确保旧路径（loader glob）在此期间不崩。
 */
export { default } from "./views/FoldersView";
```

exit 重进确认旧路径不再被引用后 R4 删除。

---

## 🔥 Bug 防线

### 防线 1：tsc 不扫 plugins/（Bug 风险 5）

**问题：** `FoldersView.tsx` 在 `plugins/builtin/` 下——tsc 不扫。import 路径拼错 → 不报。

**修复：** `npm run lint` 的 `import-x/no-unresolved: error` 扫 `plugins/builtin/`。E36#6 做完立刻跑。

**🛡️ ESRint 规则引用：**
```javascript
// eslint.config.js
{
  files: ["plugins/builtin/**/*.{ts,tsx}"],
  rules: { "import-x/no-unresolved": "error" }
}
```

### 防线 2：header 标题不搬（架构正确性）

**问题：** 旧 sidebar.tsx 自己画了 `file-tree-header`。如果 FoldersView 也自己画 header → 两层标题。

**修复：** FoldersView 不包 header。SidePanel 从 `getViewContainer("explorer").title` 取"资源管理器"显示在侧栏顶部。view 组件只管内容。

---

## 难度评估

**容易。** 137 行 → ~110 行 FoldersView.tsx。逻辑一根线：sidebar.tsx 的内容部分剪切粘贴到新文件——去掉 header div 即可。

---

## 文件

- `plugins/builtin/file-tree/plugin.json`——+15 行
- 新 `plugins/builtin/file-tree/src/views/FoldersView.tsx`——~110 行
- `plugins/builtin/file-tree/src/sidebar.tsx`——改 −115 +2（deprecated re-export）

**行数：** ~35 行净改动

---

## 验证

- [ ] 点 📁 → header 显示"资源管理器"→ 内容区渲染文件树
- [ ] 有工作区 → FileTree。无工作区 → WelcomeView
- [ ] 工具栏按钮正常（刷新/收起全部）→ 新建文件/新建文件夹仍 TODO（不回归）
- [ ] 右键菜单正常
- [ ] `npm run lint` 零错误（`import-x/no-unresolved` 必须通过）
