# file-tree 迁移

> 对应任务：E36#6

## 当前状态

[sidebar.tsx](linkdesk/plugins/builtin/file-tree/src/sidebar.tsx) 导出一个大组件 `FileTreeSidebar`，内部硬编码 FileTree + WelcomeView。loader 通过 `sidebar: "src/sidebar.tsx"` 字段找到它 → 存入 `sidebarComponent` → SidePanel 渲染整个组件。

## 迁移后

plugin.json 声明 viewsContainers + views，sidebar.tsx 的逻辑提取到 `FoldersView.tsx`。

**plugin.json 新增：**
```json
{
  "contributes": {
    "viewsContainers": {
      "explorer": { "title": "资源管理器" }
    },
    "views": {
      "explorer": [
        {
          "id": "folders",
          "title": "",
          "render": "src/views/FoldersView.tsx"
        }
      ]
    }
  }
}
```

**FoldersView.tsx：** 把 sidebar.tsx 中的核心两行提取出来：
```typescript
export default function FoldersView() {
  const hasWorkspace = ...
  return hasWorkspace ? <FileTree /> : <WelcomeView />
}
```

header/toolbar 不再需要组件自己画——SidePanel 的 SidebarSection 统一提供折叠/展开。

**sidebar.tsx：** 保留 export 但标记 `@deprecated`。等 E36#9 随 `sidebarComponent` 字段一起移除。

## 难度评估

容易。当前 sidebar.tsx 逻辑简单——有 workspace 渲染 FileTree，没有渲染 WelcomeView。提取出来 ~20 行。

**文件：** file-tree `plugin.json` + 新 `src/views/FoldersView.tsx`  
**行数：** ~30 行（plugin.json +15 / 新建 FoldersView +20 / sidebar.tsx deprecated）
