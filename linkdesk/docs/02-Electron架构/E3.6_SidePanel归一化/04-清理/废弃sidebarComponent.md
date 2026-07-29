# 清理——废弃 sidebarComponent

> 对应任务：E36#9 + E36#10

R3 三个插件迁移完成后，旧系统已无消费者。删除所有相关代码。

## E36#9 废弃 sidebarComponent

**文件：** `src/core/types.ts` + `src/pluginLoader/viewRegistry.ts`  
**行数：** ~15 行

1. `types.ts` 中 `ViewPluginEntry` 移除 `sidebarComponent?: React.ComponentType` 字段
2. `viewRegistry.ts` 中 `getTabCreatableViews`——原来是 `filter(entry => !entry.sidebarComponent)`，改为 `filter(entry => !entry.manifest.contributes?.viewsContainers)`
3. 确认 `SidePanel.tsx` 中无 `sidebarComponent` 残留（E36#3 已移除）

**验证：** `grep -r "sidebarComponent" src/ --include="*.ts" --include="*.tsx"` 返回空。

## E36#10 loader 清理——移除 sidebar.tsx glob

**文件：** `src/pluginLoader/loader.ts`  
**行数：** ~15 行删减

1. 移除 `import.meta.glob("**/sidebar.tsx")` 调用（4 条 glob pattern）
2. 移除运行时动态 `import()` sidebar.tsx 的逻辑
3. 移除 `sidebarComponent` 赋值到 `ViewPluginEntry` 的代码
4. `parseContributions` 中不处理旧的 `sidebar` 字段——静默忽略

**文件：** `src/pluginLoader/loader.ts`  
**行数：** ~15 行删减

**验证：** `tsc --noEmit` 零错误。`npm run dev` → 三个侧栏正常渲染。
