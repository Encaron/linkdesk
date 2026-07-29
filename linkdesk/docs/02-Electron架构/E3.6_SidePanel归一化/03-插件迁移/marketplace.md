# marketplace 迁移

> 对应任务：E36#7

## 当前状态

300+ 行 `sidebar.tsx` 导出 `MarketplaceSidebar`，内部硬编码四个 `<SidebarSection>`——已安装/内置/已禁用/待安装。四个 section 的数据过滤逻辑已在组件内。

## 迁移后

拆为 4 个独立组件，各自由 loader 按 plugin.json 声明动态 import 注册。

**plugin.json 新增：**
```json
{
  "contributes": {
    "viewsContainers": {
      "marketplace": { "title": "插件市场" }
    },
    "views": {
      "marketplace": [
        { "id": "installed",  "title": "已安装", "render": "src/views/InstalledListView.tsx" },
        { "id": "builtin",    "title": "内置",   "render": "src/views/BuiltinListView.tsx" },
        { "id": "disabled",   "title": "已禁用", "render": "src/views/DisabledListView.tsx" },
        { "id": "uninstalled", "title": "待安装", "render": "src/views/UninstalledListView.tsx" }
      ]
    }
  }
}
```

**四个 view 组件：** 各自 export default，各自调 `pm().list()` 取数据，各自渲染列表。每个 ~40 行。原组件内的共享逻辑（`ensureMarketplaceCommands`）移到 `index.tsx` 的 `activate()` 中。

## 难度评估

中等偏易。四个 section 的职责天然独立——只是原来挤在同一个文件里，拆开不涉及逻辑重写。

**文件：** marketplace `plugin.json` + 4 个新 view 组件  
**行数：** ~25 行（plugin.json +20 / 组件拆分 ~5 行胶水代码）
