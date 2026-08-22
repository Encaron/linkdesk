# 壳内低耦合——SidePanel 改造

> 2026-08-02。**E5 第 1 层第 2 轮。** SidePanel 不再 import IconBar/MainContent/StatusBar——只订阅 ShellEvents。
> 执行清单任务：E5#4

---

## 一、当前状态

### 1.1 Props（来自 App.tsx L841-847）

```typescript
// SidePanel.tsx L19-24
interface SidePanelProps {
  activeTabType: string;           // 当前标签页类型——**已废弃，SidePanel 不使用**
  activePluginId?: string;         // 当前插件 ID——**已废弃，_activePluginId 前缀表示未使用（L31）**
  sidebarView?: string | null;     // 活跃的 view containerId
  width: number;                   // 像素宽度（App 管理 sidebar resize）
}
```

**两个 dead props：** `activeTabType` 和 `activePluginId` 传了但从不用——App.tsx 还在传，SidePanel 不读。

### 1.2 直接依赖（绕过 App props）

| 依赖 | 行号 | 方式 |
|------|:--:|------|
| `ViewContainerService` | L66-79 | 直接读 `getViewContainer()` / `getActiveViews()` |
| `onDidChangeActiveViews.event` | L66-71 | 订阅 view 变化——自动刷新 |
| `ToolbarSlot` / `SectionStack` | L112-121 | 内部子组件——不需要外部知道 |

### 1.3 SidePanel 的独立性——最不耦合的子组件

SidePanel 实际上已经是四个区域里最独立的——它不 import 邻居。它从 `ViewContainerService` 直接拿数据，不依赖 App 传入的 `activePluginId`。

**改造量最小——主要是删 dead props + 发 sidebar 状态事件。**

---

## 二、改造方案

### 2.1 目标

```typescript
// SidePanel.tsx（改造后）
// Props 极简——只接收布局引擎传来的 bounds
interface SidePanelProps {
  style: { position: "fixed"; x: number; y: number; width: number; height: number };
}

// 侧栏状态通过 ShellEvents 广播——不通过 App props
const handleToggle = () => {
  const newState = !isOpen;
  shellEvents.emit("sidebar:toggled", newState);
  if (newState) {
    shellEvents.emit("sidebar:containerChanged", effectiveContainerId);
  } else {
    shellEvents.emit("sidebar:containerChanged", null);
  }
};
```

### 2.2 具体改动

#### E5#4a 取消 import 邻居（−3 行）

SidePanel **本来就没有 import 邻居**——它是四个区域里最干净的。当前 import：

```typescript
// L14-16
import { ViewContainerService } from "@src/core/ViewContainerService";  // ← 保留——核心服务
import { ToolbarSlot } from "./shared/ToolbarSlot";                     // ← 保留——内部子组件
import { SectionStack } from "./shared/SectionStack";                   // ← 保留——内部子组件
```

**零行删——本来就不依赖邻居。** ✅

#### E5#4b 订阅 shellEvents（~8 行）

```typescript
// SidePanel.tsx —— 新增订阅
import { shellEvents } from "@src/core/ShellEvents";

// 订阅 icon:selected——接收 IconBar 的点击事件
useEffect(() => {
  const unsub = shellEvents.on("icon:selected", (pluginId) => {
    // 和当前 handleIconClick 逻辑一样：
    // pluginId → 查 viewsContainers → 取第一个 containerId → 切换侧栏
    const containerId = resolveContainerId(pluginId);
    if (containerId) {
      setSidebarView(prev => prev === containerId ? null : containerId);
    }
  });
  return unsub;
}, []);
```

**⚠️ 注意：** `resolveContainerId` 逻辑目前存在于 App.tsx 的 `handleIconClick`（L546-563）。改造后移到 SidePanel 内部——SidePanel 自己知道怎么从 pluginId 查到 containerId。

#### E5#4c 切换容器时 emit 事件（~3 行）

```typescript
// 在 setSidebarView 的调用处
const switchContainer = (containerId: string | null) => {
  setSidebarView(containerId);
  // 🔥 通知 IconBar——更新高亮
  shellEvents.emit("sidebar:containerChanged", containerId);
};

// toggle 关闭时
const handleToggle = () => {
  if (sidebarView) {
    switchContainer(null);
    shellEvents.emit("sidebar:toggled", false);
  }
};
```

#### E5#4d useEffect cleanup（~5 行）

```typescript
useEffect(() => {
  const unsub1 = shellEvents.on("icon:selected", handleIconSelected);
  const unsub2 = shellEvents.on("tab:focused", handleTabFocused);
  return () => { unsub1(); unsub2(); };  // ← 🔥 忘了就内存泄漏
}, []);
```

#### E5#4e 删 dead props（−2 行）

```diff
interface SidePanelProps {
- activeTabType: string;
- activePluginId?: string;
- sidebarView?: string | null;
- width: number;
+ style: { position: "fixed"; x: number; y: number; width: number; height: number };
}
```

**`sidebarView` 变成内部 state——不再从 App 传入。** SidePanel 自己管理容器切换。

**`width` 变成 layout engine 的 bounds 中的一部分——`style.width`。**

#### E5#4f 保留 lastSidebar 逻辑——不变

```typescript
// L55-60——lastSidebar sticky 逻辑保留
const lastSidebar = useRef<string | null>(null);
// 切标签页时侧栏不关——对标 VS Code
```

---

## 🔴 预测 Bug

### Bug E5-4a 🔴 sidebar:containerChanged 未被 IconBar 订阅 → 图标永不高亮

**同 IconBar 改造 Bug E5-3a。** SidePanel emit 了事件，但 IconBar 如果漏订阅 → 图标栏无高亮。

**🔥 防线：** E5#3c（IconBar isActive 改订阅）和 E5#4c（SidePanel emit）必须连做——做完立即验证。

---

### Bug E5-4b 🔴 lastSidebar sticky 和 shellEvents 交互——切标签页时侧栏不关但事件发了

**触发条件：** `lastSidebar` 逻辑：切标签页 → `setSidebarView(null)` → 但 `lastSidebar.current` 保留旧值 → `shellEvents.emit("sidebar:containerChanged", null)` → IconBar 取消高亮。但用户期望侧栏仍然开着（对标 VS Code）→ 矛盾。

**🔥 防线：** `lastSidebar` 切换时不发 `sidebar:containerChanged` 事件——只在用户主动点图标或 toggle 时发。

---

### Bug E5-4c 🔴 forwardRef 耦合——App 需要 ref 来拖拽 resize

**当前：** `SidePanel` 通过 `forwardRef` 暴露 `<aside>` DOM 元素给 App（L129-132）。App 用这个 ref 计算 resize 拖拽。

**E5 改造后：** App 不再 import SidePanel。resize 拖拽在布局引擎层处理——`layoutEngine.resizeZone("sidebar", newWidth)` → bounds 变了 → SidePanel 收到新 `style.width` → 自动渲染。

**不需要 forwardRef 了。** 拖拽手势也在布局引擎层——不是 SidePanel 自己的事。

---

## 三、涉及文件

| 文件 | 改动 | 行数 |
|------|------|:--:|
| `src/components/SidePanel.tsx` | 删 dead props、加 emit 事件、加 useEffect 订阅、sidebarView → 内部 state | ~15 |
| `src/App.tsx` | 删 `sidebarView` prop 传递、删 `handleIconClick`（逻辑移到 SidePanel 内部）| −10（E5#7 做） |

---

## 四、完工标准

- [ ] SidePanel 不再接收 `sidebarView` / `activePluginId` / `activeTabType` props
- [ ] SidePanel 自己管理容器切换——订阅 `shellEvents.on("icon:selected")`
- [ ] 切换容器时 `shellEvents.emit("sidebar:containerChanged", ...)`
- [ ] `lastSidebar` sticky 逻辑不变——切标签页时侧栏不关
- [ ] `npm run check` 零错误

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#4
> **← 前置：** `ShellEvents类型系统.md`（E5#1–#2）
> **→ 对比：** `壳内低耦合-IconBar改造.md`（E5#3）——同模式
