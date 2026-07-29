# PluginManifest 类型 + loader 解析

> 对应任务：E36#5

## types.ts 新增类型

```typescript
interface PluginContributes {
  // ... 现有字段 ...
  viewsContainers?: Record<string, { title: string; icon?: string }>;
  views?: Record<string, Array<{
    id: string;
    title?: string;
    render: string;      // 模块路径，如 "src/views/FoldersView.tsx"
    when?: string;        // context key 条件
  }>>;
}
```

## loader.ts 新增解析逻辑

在 `parseContributions` 末尾加：

```typescript
// 解析 viewsContainers——注册容器
if (manifest.contributes?.viewsContainers) {
  for (const [containerId, descriptor] of Object.entries(manifest.contributes.viewsContainers)) {
    ViewContainerService.registerViewContainer(containerId, {
      title: descriptor.title,
      icon: descriptor.icon,
    });
  }
}

// 解析 views——动态 import 渲染组件
if (manifest.contributes?.views) {
  for (const [containerId, viewDefs] of Object.entries(manifest.contributes.views)) {
    for (const viewDef of viewDefs) {
      const renderModule = await import(/* @vite-ignore */ viewDef.render);
      const RenderComponent = renderModule.default ?? renderModule;

      ViewContainerService.registerView(containerId, {
        id: viewDef.id,
        title: viewDef.title ?? "",
        render: RenderComponent,
      });
    }
  }
}
```

## 声明式 vs 命令式——两种注册方式共存

ViewContainerService 是桌子，不关心数据从哪来：

| 方式 | 怎么写 | 适合什么 |
|------|--------|----------|
| 声明式 | plugin.json `contributes.views` → loader 自动 `registerView` | 静态 view——marketplace 的"已安装"永远是 4 个分组 |
| 命令式 | 插件 `activate()` 中手动 `registerView()` | 动态 view——serial-monitor 标题随 session 变化 |

两者走同一条路到同一个 Map。不冲突。

## 向后兼容

**不删除** 旧的 `sidebar` 字段解析逻辑——迁移期间两套系统共存。R3 迁移完成、R4 清理时才移除。

**文件：** `src/core/types.ts` + `src/pluginLoader/loader.ts`  
**行数：** ~40 行（types.ts ~15 行 + loader.ts ~25 行）
