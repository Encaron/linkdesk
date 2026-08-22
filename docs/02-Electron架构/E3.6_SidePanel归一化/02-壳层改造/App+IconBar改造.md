# App.tsx + IconBar——sidebarView 语义变更

> 对应任务：E36#4。**最脆弱的任务——IconBar isActive 无编译器检查、无 vitest、纯 UI。做完立刻手动测。**

---

## 核心变化

`sidebarView` 状态仍是 `string | null`，但语义从 **pluginId** → **containerId**。

| | 旧 | 新 |
|------|------|------|
| 存储的值 | `"file-tree"`（pluginId）| `"explorer"`（containerId）|
| SidePanel 查什么 | `getViewPlugin("file-tree").sidebarComponent` | `getActiveViews("explorer")` |
| IconBar 怎么判断高亮 | `sidebarView === "file-tree"` | `sidebarView` 是否匹配插件的任一 containerId |
| 点击逻辑 | `setSidebarView(pluginId)` | `setSidebarView(containerId)` |

---

## App.tsx handleIconClick——改前 vs 改后

### 改前（当前代码 L520-529）

```typescript
const handleIconClick = useCallback(
  (pluginId: string) => {
    const plugin = getViewPlugin(pluginId);
    if (plugin?.manifest.viewRole === "tabOnly") {
      createTab(pluginId);
    } else {
      setSidebarView((prev) => (prev === pluginId ? null : pluginId));
    }
  },
  [createTab]
);
```

### 改后

```typescript
const handleIconClick = useCallback(
  (pluginId: string) => {
    const plugin = getViewPlugin(pluginId);

    // tabOnly——不开侧栏，直接开标签页（旧行为不变）
    if (plugin?.manifest.viewRole === "tabOnly") {
      createTab(pluginId);
      return;
    }

    // 从 plugin.json contributes.viewsContainers 取 containerId
    const containers = plugin?.manifest.contributes?.viewsContainers;
    if (!containers || Object.keys(containers).length === 0) {
      // 没有声明容器——不猜测意图
      console.warn(`[App] 插件 "${pluginId}" 未声明 viewsContainers，点击图标无操作`);
      return;
    }

    const containerId = Object.keys(containers)[0];
    setSidebarView((prev) => (prev === containerId ? null : containerId));
  },
  [createTab]
);
```

---

## IconBar isActive——改前 vs 改后 🔥🔥🔥

**这是 E36#4 最脆弱的点。** 如果改错——全部图标永远不高亮。无编译器检查、无 vitest。

### 改前

```typescript
const isActive = (pluginId: string) => sidebarView === pluginId;
```

### 改后

```typescript
const isActive = (pluginId: string) => {
  if (!sidebarView) return false;
  const plugin = getViewPlugin(pluginId);
  const containers = plugin?.manifest.contributes?.viewsContainers;
  if (!containers) return false;
  return Object.keys(containers).some(id => id === sidebarView);
};
```

---

## 完整点击→渲染链路

```
1. 用户点 📁 图标
2. App 从 file-tree plugin.json 读 viewsContainers → 取出 "explorer"
3. setSidebarView("explorer")
4. IconBar 重渲染：
   isActive("file-tree") → 查 file-tree 的 viewsContainers
   → "explorer" 在容器列表中 → 匹配 sidebarView → true → 📁 高亮
5. SidePanel 重渲染：
   - header title = getViewContainer("explorer").title → "资源管理器"
   - 内容 = getActiveViews("explorer").map(v => <SidebarSection ...>)
```

---

## 🔥 Bug 防线

### 防线 1：IconBar isActive 手动验证协议（Bug 风险 6）

**做完 E36#4 后立刻执行——不依赖自动化：**

| 步骤 | 操作 | 预期 | 实际 |
|:--|------|------|:--:|
| 1 | 点 📁 | 📁 高亮 + 侧栏打开 | |
| 2 | 点 🪢 | 🪢 高亮、📁 不高亮、侧栏切换 | |
| 3 | 点 🛒 | 🛒 高亮、🪢 不高亮、侧栏切换 | |
| 4 | 再点 🛒 | 全部不高亮、侧栏关闭 | |
| 5 | 点 ⚙（settings，tabOnly）| 不开侧栏、图标不高亮、开标签页 | |

### 防线 2：revertContainerIfCurrent（Bug 风险 2+7）

**问题：** 用户在 explorer 侧栏打开时卸载 file-tree → `ViewContainerService.unregisterAll("file-tree")` → explorer 容器消失 → header 空白。

**修复：** 在 `PLUGIN_REMOVED` 事件 handler 中，**在 closeTab 之前**调 `revertContainerIfCurrent`：

```typescript
// src/App.tsx —— PLUGIN_REMOVED 消费端（L197-210）
// ⚠️ 顺序至关重要！
useEffect(() => {
  const handler = (e: Event) => {
    const { pluginId } = (e as CustomEvent).detail as { pluginId: string };

    // Step 1: 先 revert 容器（需要 ViewContainerService 里还有数据）
    revertContainerIfCurrent(pluginId);

    // Step 2: 再关标签页
    for (const group of tabState.groups) {
      for (const tab of group.tabs) {
        if (tab.pluginId === pluginId || tab.detailPluginId === pluginId) {
          forceCloseTab(tab.id);
        }
      }
    }
  };
  window.addEventListener(CUSTOM_EVENTS.PLUGIN_REMOVED, handler);
  return () => window.removeEventListener(CUSTOM_EVENTS.PLUGIN_REMOVED, handler);
}, [tabState.groups, forceCloseTab]);

function revertContainerIfCurrent(pluginId: string): void {
  if (!sidebarView) return;
  const plugin = getViewPlugin(pluginId);
  const containerIds = Object.keys(plugin?.manifest.contributes?.viewsContainers ?? {});
  if (containerIds.includes(sidebarView)) {
    setSidebarView(null);
  }
}
```

**为什么顺序重要——已通过源码验证：**

`lifecycle.ts` 中 `onWillUninstall` 的 handler 注册顺序（`lifecycle.ts` L89-170）：

```
1. L89:  updateIconOrder
2. L99:  deactivate 插件
3. L107: 清配置
4. L163: dispatchEvent(PLUGIN_REMOVED)  ← App.tsx handler：revertContainerIfCurrent 读数据 ✅
5. E36#4.7 新增: ViewContainerService.unregisterAll  ← 清数据
... onDidUninstall 消费端
```

`revertContainerIfCurrent` 在 PLUGIN_REMOVED handler（步骤 4）执行——此时 `ViewContainerService` 数据还在（unregisterAll 在步骤 5 才执行）。`revertContainerIfCurrent` 能正常读取该插件的 viewsContainers 声明。

**🔥 关键：** E36#4.7 的生命周期 handler 必须注册在 L165 之后——确保 `unregisterAll` 在 `PLUGIN_REMOVED` dispatch **之后**执行。

**验证（E36#11）：**
1. 打开 explorer 侧栏 → marketplace 卸载 file-tree → 侧栏自动关闭
2. 打开 marketplace 侧栏 → 卸载 marketplace → 侧栏自动关闭
3. 侧栏关闭时卸载 file-tree → 无影响、无报错

---

## 文件

- `src/App.tsx`——`handleIconClick`（L520-529）+ `revertContainerIfCurrent`（新增）+ `PLUGIN_REMOVED` 消费端（L197-210）
- `src/components/IconBar.tsx`——`isActive` 函数

**改动：** ~40 行（App.tsx ~30 / IconBar.tsx ~10）
