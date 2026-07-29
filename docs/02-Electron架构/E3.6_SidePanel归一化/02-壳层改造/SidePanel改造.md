# SidePanel 重写——渲染循环替代 sidebarComponent

> 对应任务：E36#3

## 改之前

SidePanel 从 `viewRegistry` 取 `sidebarComponent` 渲染。一次只能渲染一个插件的一整个 sidebar：

```typescript
const effectivePluginId = sidebarView ?? lastSidebar ?? activePluginId;
const plugin = getViewPlugin(effectivePluginId);
return <plugin.sidebarComponent />;
```

## 改之后

SidePanel 从 `ViewContainerService` 取 views 循环渲染。一份代码处理所有容器：

```typescript
const effectiveContainerId = sidebarView ?? lastSidebar;
// 去掉了 activePluginId fallback——侧栏不再跟标签页关联

const renderSidebarContent = () => {
  if (!effectiveContainerId) return null;

  const views = ViewContainerService.getViews(effectiveContainerId);

  if (views.length === 0) {
    return <div className="side-panel-placeholder">无已注册视图</div>;
  }

  return views.map(view => (
    <ErrorBoundary key={view.id} pluginId={view.id}>
      <SidebarSection title={view.title} defaultOpen={true}>
        <view.render />
      </SidebarSection>
    </ErrorBoundary>
  ));
};

// Header title 从容器桌子取，不是从 plugin manifest.name 取
const container = effectiveContainerId
  ? ViewContainerService.getViewContainer(effectiveContainerId)
  : null;
const title = container?.title ?? "";
```

## SidePanel 的分层结构

```
┌──────────────────┐
│ [title]        ◀ │  ← header —— 壳自己画的，永远有。
├──────────────────┤       title = ViewContainerService.getViewContainer(id)?.title
│ ▶ view section   │  ← 内容区 —— getViews(id).map(...)
│ ▶ view section   │
└──────────────────┘
```

Header title 谁决定：
- 点 📁 → `getViewContainer("explorer").title` → "资源管理器"（file-tree 的 plugin.json 声明）
- 点 🪢 → `getViewContainer("serial-monitor").title` → "串口监视器"
- 点 🛒 → `getViewContainer("marketplace").title` → "插件市场"

## 三种状态

| 条件 | header title | 内容区 |
|------|:--:|------|
| 容器已注册 + 有 views | 容器 title | 循环渲染 views |
| 容器已注册 + views 为空 | 容器 title | "无已注册视图" 占位 |
| 容器未注册 | 空字符串 | 不应出现（E36#4 保证不会进入此状态） |

## 关键变化

- 不再 import `getViewPlugin`——壳不需要知道"哪个插件"
- 不再依赖 `sidebarComponent` 字段
- `lastSidebar` sticky 逻辑不变
- `SidebarSection` 直接复用（`src/components/shared/SidebarSection.tsx`）——零改动
- `activePluginId` fallback 移除——SidePanel props 中虽有 `activePluginId?` 但 App.tsx 从未传入

**文件：** `src/components/SidePanel.tsx`（当前 100 行）  
**行数：** ~45 行改动（删旧 ~20 行 + 写新 ~45 行，净增 ~25 行）
