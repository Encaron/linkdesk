# App.tsx + IconBar —— sidebarView 语义变更

> 对应任务：E36#4

## 核心变化

`sidebarView` 状态仍然是 `string | null`，但语义从 **pluginId** 变成 **containerId**。

- 旧：`sidebarView = "file-tree"` → 渲染 file-tree 插件的 sidebarComponent
- 新：`sidebarView = "explorer"` → 渲染 explorer 容器的所有 views

变这个语义影响两个地方：
1. **App.handleIconClick** —— 点击图标后把什么写进 sidebarView
2. **IconBar.isActive** —— 读 sidebarView 判断哪个图标高亮

## 改前

```typescript
// App.tsx
const handleIconClick = (pluginId: string) => {
  const plugin = getViewPlugin(pluginId);
  if (plugin?.manifest.viewRole === "tabOnly") {
    createTab(pluginId);
    return;
  }
  setSidebarView((prev) => (prev === pluginId ? null : pluginId));
};

// IconBar.tsx
const isActive = (pluginId: string) => sidebarView === pluginId;
```

## 改后

```typescript
// App.tsx —— containerId 驱动
const handleIconClick = (pluginId: string) => {
  const plugin = getViewPlugin(pluginId);
  if (plugin?.manifest.viewRole === "tabOnly") {
    createTab(pluginId);
    return;
  }

  // 从 plugin.json 的 contributes.viewsContainers 取 containerId
  const containers = plugin?.manifest.contributes?.viewsContainers;
  if (!containers || Object.keys(containers).length === 0) {
    // 没有声明容器 → 不猜测意图
    console.warn(`[App] 插件 "${pluginId}" 未声明 viewsContainers，点击图标无操作`);
    return;
  }

  const containerId = Object.keys(containers)[0];
  setSidebarView((prev) => (prev === containerId ? null : containerId));
};

// IconBar.tsx —— containerId 匹配
const isActive = (pluginId: string) => {
  const plugin = getViewPlugin(pluginId);
  const containers = plugin?.manifest.contributes?.viewsContainers;
  if (containers) {
    return Object.keys(containers).some(id => sidebarView === id);
  }
  return false;
};
```

## 完整点击→渲染链路

```
1. 点 📁 图标
2. App 从 file-tree 的 plugin.json 读 viewsContainers → 取出 "explorer"
3. setSidebarView("explorer")
4. IconBar 重渲染：isActive("file-tree") → true
   （因为其 containerId "explorer" === sidebarView）
5. SidePanel 重渲染：
   - header title = getViewContainer("explorer").title → "资源管理器"
   - 内容 = getViews("explorer").map(v => <SidebarSection ...>)
```

## 插件没有声明容器时的处理

不做任何 fallback。不开侧栏，不开标签页。console.warn 一条，开发者补上 `viewsContainers` 声明即正常。

**文件：** `src/App.tsx`（第 507、520-529 行）+ `src/components/IconBar.tsx`（isActive 函数）  
**行数：** ~25 行改动
