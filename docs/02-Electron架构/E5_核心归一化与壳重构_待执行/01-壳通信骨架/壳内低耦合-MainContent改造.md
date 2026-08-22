# 壳内低耦合——MainContent 改造

> 2026-08-02。**E5 第 1 层第 2 轮。** MainContent 只管理标签页+分屏——不 import IconBar/SidePanel/StatusBar。
> 执行清单任务：E5#5

---

## 一、当前状态——最重的耦合

### 1.1 Props（来自 App.tsx L851-873——14 个 prop）

```typescript
// MainContent.tsx L26-45
interface MainContentProps {
  tabState: TabState;                    // 整个标签页状态树
  activeGroupId: string;                // 当前活跃分屏
  onFocusTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (type: string, opts?) => string;
  onSplitTab: (tabId: string, direction?) => void;
  onMoveTab: (tabId: string, targetGroupId: string) => void;
  onReorderTab: (tabId: string, toIndex: number) => void;
  onPinTab?: (tabId: string) => void;
  onDropSplit: (tabId, zone, targetGroupId?) => void;
  onDropCopySplit?: (tabId, zone, targetGroupId?) => void;
  onSplitResize?: (anchorGroupId, sizes, branchIndex?) => void;
  dropZone?: DropZone | null;
  dragDropTargetGroupId?: string | null;
  editorAreaRef?: React.RefObject<HTMLDivElement | null>;
  onDragDropZone?: (zone, targetGroupId?) => void;
  isDragging?: boolean;
  onDraggingChange?: (v: boolean) => void;
}
```

**14 个 props——9 个是标签页生命周期回调、5 个是拖拽状态。** MainContent 是 App 的遥控器——所有标签页操作必须经过 App。

### 1.2 直接依赖

| 依赖 | 行号 | 方式 |
|------|:--:|------|
| `getViewPlugin(pluginId)` | L88 | renderTabContent 中直接读 viewRegistry |
| `linkdesk.pluginViews` | L156-231 | WebView 同步逻辑——直接调 IPC |
| `isShellRenderedTab(tab.type)` | L55 | 壳内标签页 vs 插件标签页判断 |
| `WelcomeView` / `PluginDetailView` / `OutputPanel` | L56-77 | **硬编码壳内视图组件 import** |

### 1.3 renderTabContent——模块级硬编码（L47-104）

```typescript
// ⚠️ 模块级函数——不在组件内，每次改壳内视图都要改这个函数
function renderTabContent(tab, isFocused, onCreateTab, readyWebViewIds) {
  if (isShellRenderedTab(tab.type)) {
    if (tab.type === "plugin-detail") return <PluginDetailView />;
    if (tab.type === FALLBACK_PLUGIN_ID) return <WelcomeView />;
    if (tab.type === "output") return <OutputPanel />;
  }
  // 插件 tab——WebView 或 React fallback
  if (readyWebViewIds.has(pluginId)) return <div className="plugin-webview-placeholder" />;
  const plugin = getViewPlugin(tab.pluginId);
  if (plugin?.component) return <ErrorBoundary><plugin.component /></ErrorBoundary>;
}
```

**加新壳内视图类型 → 必须改 MainContent.tsx。** 不开闭。

---

## 二、改造方案

### 2.1 目标

```typescript
// MainContent.tsx（改造后）
// Props 极简——只接收布局引擎 bounds
interface MainContentProps {
  style: { position: "fixed"; x: number; y: number; width: number; height: number };
}

// 标签页操作 → 走 TabManager（已经可用——不需要 App 中转）
// 壳内视图 → 走 ViewRegistry（已经可用——不需要硬编码 switch）
// tab 切换 → emit shellEvents
```

### 2.2 TabManager 自治

**当前：** `useTabManager` 在 App.tsx 中调用（L88-107），返回 `tabState` + 9 个回调 → 全部传给 MainContent。

**改造后：** `useTabManager` 在 MainContent 内部调用——标签页状态归 MainContent 管理，不再需要 App 中转。

```typescript
// MainContent.tsx 内部
const { tabState, activeGroupId, focusTab, closeTab, createTab, ... } = useTabManager();
// 不再通过 App props 传入
```

**为什么可以这样做：** `useTabManager` 是纯 React hook——不依赖 App 的任何东西。它已经在 `src/hooks/useTabManager.ts` 中独立存在。移到 MainContent 内部只是调用位置的改变。

### 2.3 壳内视图注册——消灭硬编码 switch

```typescript
// MainContent.tsx 改造后——renderTabContent

// 壳内视图通过 ViewRegistry 注册——不需要 switch
function renderTabContent(tab, isFocused) {
  if (isShellRenderedTab(tab.type)) {
    // 🔥 从 ViewContainerService 查——不是硬编码 switch
    const shellView = ViewContainerService.getView(tab.type);
    if (shellView) return <ErrorBoundary><shellView.render /></ErrorBoundary>;
  }
  // 插件 tab——同现有逻辑
  // ...
}
```

### 2.4 具体改动

#### E5#5a 取消 import 邻居（−3 行）

MainContent **本来就没有直接 import IconBar/SidePanel/StatusBar。** 它的耦合是通过 App 的 props 间接的。

**改动：** 从依赖 App 的 props → 自己调用 TabManager。

#### E5#5b 订阅 + emit 事件（~8 行）

```typescript
import { shellEvents } from "@src/core/ShellEvents";

// 订阅——侧栏图标点击可能导致标签页切换
useEffect(() => {
  const unsub = shellEvents.on("icon:selected", (pluginId) => {
    // 如果点了 tabOnly 的插件图标 → 可能需要创建标签页
    // 由 useTabManager 内部处理
  });
  return unsub;
}, []);

// emit——标签页切换通知其他区域
const handleTabFocus = (tabId: string) => {
  focusTab(tabId);
  const tab = getTabById(tabId);
  if (tab) {
    shellEvents.emit("tab:focused", { pluginId: tab.pluginId || tab.type, tabId });
  }
};
```

#### E5#5c 标签页切换 emit 事件（~3 行）

```typescript
// 每个标签页操作完成后 emit
const handleFocusTab = (tabId: string) => {
  focusTab(tabId);
  const tab = allTabs.find(t => t.id === tabId);
  if (tab) {
    shellEvents.emit("tab:focused", { pluginId: tab.pluginId || tab.type, tabId });
  }
};
```

#### E5#5d useEffect cleanup（~5 行）

```typescript
useEffect(() => {
  const unsub1 = shellEvents.on("icon:selected", handleIconSelected);
  const unsub2 = shellEvents.on("sidebar:toggled", handleSidebarToggled);
  return () => { unsub1(); unsub2(); };
}, []);
```

#### E5#5e TabManager 移到 MainContent（~10 行改动）

**App.tsx（−15 行）：**
```diff
- const { tabState, focusTab, closeTab, ... } = useTabManager();
- // 不再传给 MainContent
```

**MainContent.tsx（+10 行）：**
```diff
+ const { tabState, activeGroupId, focusTab, closeTab, ... } = useTabManager();
```

#### E5#5f 壳内视图注册——去硬编码（~20 行）

**当前 `renderTabContent` L55-77——删硬编码 switch。**

**改后：** 壳体视图通过 `ViewContainerService` 查询——对标 VS Code 的 `IViewsRegistry`。

```typescript
// "plugin-detail" / "welcome" / "output" 注册为 views
ViewContainerService.registerView("shell", "main", {
  id: "welcome",
  title: "Welcome",
  render: () => <WelcomeView />,
});
ViewContainerService.registerView("shell", "main", {
  id: "output",
  title: "Output",
  render: () => <OutputPanel />,
});

// renderTabContent 中
const shellView = ViewContainerService.getView("main", tab.type);
if (shellView) return <shellView.render />;
```

**E5 内完成——不加新壳内视图时不会主动改这里，等于永远不改。** 现在做：WelcomeView / PluginDetailView / OutputPanel 注册到 ViewContainerService，renderTabContent 不再硬编码 switch。

---

## 🔴 预测 Bug

### Bug E5-5a 🔴🔴 TabManager 移到 MainContent → App 也需要 tabState 怎么办

**触发条件：** App.tsx 的 `handleIconClick` 中调了 `createTab()`（对 `tabOnly` 插件）。TabManager 移到 MainContent → App 无法调 `createTab`。

**🔥 防线——ShellEvents:** App 不直接调 `createTab`。IconBar emit `"icon:selected"` → MainContent 订阅 → 内部调 `createTab`。

```typescript
// MainContent 内部
useEffect(() => {
  const unsub = shellEvents.on("icon:selected", (pluginId) => {
    const plugin = getViewPlugin(pluginId);
    if (plugin?.manifest.viewRole === "tabOnly") {
      createTab(pluginId);  // ← MainContent 自己调——不需要 App 中转
    }
  });
  return unsub;
}, []);
```

---

### Bug E5-5b 🔴 Context Provider 链路断裂——TabActionsContext 和 SourceStateContext

**当前：** App.tsx L832-833 用 `TabActionsContext.Provider` 和 `SourceStateContext.Provider` 包裹四个子组件。

**改造后：** App 不再包裹 MainContent → 但 MainContent 内部子组件（TabBar 等）依赖 `TabActionsContext`。

**🔥 防线——Provider 移到 MainContent 内部：**
```typescript
// MainContent.tsx 内部
return (
  <TabActionsContext.Provider value={tabActions}>
    <SourceStateContext.Provider value={sourceState}>
      <div style={style}>
        {/* 现有 MainContent JSX */}
      </div>
    </SourceStateContext.Provider>
  </TabActionsContext.Provider>
);
```

**Provider 跟消费者走——不是跟 App 走。**

---

### Bug E5-5c 🔴 WebView 同步逻辑丢失——linkdesk.pluginViews 调用

**当前：** WebView 同步逻辑在 MainContent L169-231——直接调 `linkdesk.pluginViews.setVisible/setBounds`。

**改造后：** 保留这部分逻辑——它在 MainContent 内部，符合"MainContent 管标签页"的责任边界。**不需要移到 App。**

---

## 三、涉及文件

| 文件 | 改动 | 行数 |
|------|------|:--:|
| `src/components/MainContent.tsx` | useTabManager 内部调用 + emit 事件 + useEffect 订阅 + Provider 内部包裹 | ~30 |
| `src/App.tsx` | 删 useTabManager 调用和 14 个 prop 传递 | −30（E5#7 做） |
| `src/hooks/useTabManager.ts` | 零改动——已是独立 hook | 0 |

---

## 四、完工标准

- [ ] MainContent 不再接收 14 个 props——自己调 useTabManager
- [ ] 标签页切换 → `shellEvents.emit("tab:focused", ...)`
- [ ] 标签页操作（创建/关闭/分屏/拖拽）功能不变
- [ ] TabActionsContext 和 SourceStateContext 在 MainContent 内部提供
- [ ] WebView 同步逻辑正常——WebContentsView 显隐和 bounds 正确
- [ ] `npm run check` 零错误

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#5
> **← 前置：** `ShellEvents类型系统.md`（E5#1–#2）
