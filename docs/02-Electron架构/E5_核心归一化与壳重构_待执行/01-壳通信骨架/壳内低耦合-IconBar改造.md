# 壳内低耦合——IconBar 改造

> 2026-08-02。**E5 第 1 层第 2 轮。** IconBar 不再 import Sidebar/MainContent/StatusBar——只 emit ShellEvents。**含拖拽排序归一化。**
> 执行清单任务：E5#3

---

## 一、当前状态

### 1.1 Props（来自 App.tsx）

```typescript
// IconBar.tsx L21-26
interface IconBarProps {
  sidebarView?: string | null;           // 活跃的侧栏 containerId
  onOpenOrFocus: (type: string) => void; // 点击回调——App 决定开侧栏还是标签页
  showHamburger?: boolean;               // 是否显示汉堡菜单
}
```

### 1.2 直接依赖（绕过 App props）

| 依赖 | 行号 | 方式 |
|------|:--:|------|
| `getViewPlugins()` | L78 | 直接读 viewRegistry——获取图标列表 |
| `getViewPlugin(pluginId)` | L99,172,200,215 | 查单个插件元数据 |
| `getIconLocation(pluginId)` | L98-99,200,215 | 查图标位置（top/bottom） |
| `onDidRegister` / `onDidUnregister` | L69-73 | 订阅插件注册/注销——自动刷新图标列表 |
| `getPluginStateValue(APP_PLUGIN_ID, "iconOrder")` | L33-38 | 读图标排序（持久化） |
| `setPluginStateValue(APP_PLUGIN_ID, "iconOrder", ...)` | L39-44 | 写图标排序 |
| `<HamburgerMenu />` | L236 | 直接渲染另一个壳组件 |

### 1.3 isActive 判断（L172-178）

```typescript
const isActive = (pluginId: string) => {
  const plugin = getViewPlugin(pluginId);
  // 🔥 关键逻辑——查插件的 viewsContainers
  const containers = plugin?.manifest.contributes?.viewsContainers;
  if (containers && sidebarView) {
    return Object.keys(containers).includes(sidebarView);
  }
  return false;
};
```

---

## 二、改造方案

### 2.1 目标

```typescript
// IconBar.tsx（改造后）
// 不再接收 sidebarView / onOpenOrFocus prop
// 不再 import HamburgerMenu
// 不再直接读 viewRegistry

const handleIconClick = (pluginId: string) => {
  shellEvents.emit("icon:selected", pluginId);
  // IconBar 不知道点了图标之后会发生什么
};

// 高亮状态——订阅事件而不是读 prop
const [activeContainerId, setActiveContainerId] = useState<string | null>(null);
useEffect(() => {
  const unsub = shellEvents.on("sidebar:toggled", (isOpen) => {
    // 侧栏切换时更新高亮
  });
  return unsub;
}, []);
```

### 2.2 具体改动

#### E5#3a 取消 import 邻居（−3 行）

```diff
- import { HamburgerMenu } from "./HamburgerMenu";
+ // HamburgerMenu 由 App.tsx 根据布局引擎放到对应 slot
```

**HamburgerMenu 的去向：** 当前在 `showHamburger` 时由 IconBar 渲染。改造后，HamburgerMenu 作为独立区域注册到布局引擎——和 IconBar 平级，不再寄生在 IconBar 内。

#### E5#3b onIconClick → emit 事件（~3 行）

```typescript
// 当前（L546-563 App.tsx 的 handleIconClick）
const handleIconClick = (pluginId: string) => {
  const plugin = getViewPlugin(pluginId);
  if (plugin?.manifest.viewRole === "tabOnly") {
    createTab(pluginId);
    return;
  }
  // ... 切换到侧栏 ...
  setSidebarView(containerId);
};

// 改造后——App.tsx 不再需要 handleIconClick
// IconBar 只 emit：
const handleIconClick = (pluginId: string) => {
  shellEvents.emit("icon:selected", pluginId);
};
```

#### E5#3c isActive 改订阅（~8 行）

```typescript
// 当前——读 prop
const isActive = (pluginId: string) => { ... containerIds.includes(sidebarView) ... };

// 改造后——订阅事件
const [sidebarContainerId, setSidebarContainerId] = useState<string | null>(null);
useEffect(() => {
  const unsub = shellEvents.on("sidebar:toggled", (isOpen) => {
    // 需要从 SidePanel 发的事件中带 containerId
    // 或订阅 icon:selected 事件
  });
  return unsub;
}, []);
```

**⚠️ 关键设计决策：** IconBar 需要知道当前活跃的 containerId 才能高亮。有两种方式：
- **A：** 订阅 `shellEvents.on("sidebar:containerChanged", (containerId) => ...)`——SidePanel 切换容器时 emit 新 containerId
- **B：** IconBar 内部跟踪——记录最后一次 `icon:selected` + `sidebar:toggled` 的组合

**推荐 A——信息源单一。** `ShellEvents` 接口加 `"sidebar:containerChanged": string | null`。

#### E5#3d useEffect cleanup（~5 行）

```typescript
useEffect(() => {
  const unsub1 = shellEvents.on("sidebar:containerChanged", (containerId) => {
    setSidebarContainerId(containerId);
  });
  return () => { unsub1(); };  // ← 🔥 忘了就内存泄漏
}, []);
```

#### E5#3e 拖拽排序归一化（🆕）

**当前问题（L120-167）：**
- 拖拽用 `window mousemove/mouseup`——全局监听，IconBar 独占。TabBar 也有自己的拖拽系统——两套独立实现
- 拖完直接写 `PluginStateService` + `setPluginVersion(v+1)` useMemo hack——没有事件通知

**改造后：**

```typescript
// 拖拽开始 → emit ShellEvent
const handleDragStart = (pluginId: string) => {
  shellEvents.emit("icon:drag-start", pluginId);
  // 其他区域可以响应——如状态栏显示 "正在拖动图标"
};

// 拖拽结束 → emit 新排序
const handleDrop = (newOrder: string[]) => {
  shellEvents.emit("icon:reordered", newOrder);
  // PluginStateService 的持久化由订阅者处理——IconBar 不直接写
};

// 持久化——shell 初始化时订阅
useEffect(() => {
  const unsub = shellEvents.on("icon:reordered", (order) => {
    setPluginStateValue(APP_PLUGIN_ID, "iconOrder", order);
  });
  return unsub;
}, []);

// 刷新——订阅事件，不用 setPluginVersion hack
const [order, setOrder] = useState<string[]>(loadOrder());
useEffect(() => {
  const unsub = shellEvents.on("icon:reordered", setOrder);
  return unsub;
}, []);
```

**ShellEvents 加两个事件：**
```typescript
interface ShellEvents {
  // ... 现有 ...
  "icon:drag-start": string;       // pluginId——正在拖拽图标
  "icon:reordered": string[];      // 新排序——pluginId 数组
}
```

---

## 🔴 预测 Bug

### Bug E5-3a 🔴 IconBar 高亮断层——sidebar:containerChanged 事件未发

**历史：** E3.6 Bug 6——IconBar isActive 语义断层。`sidebarView` 从 `pluginId` 改 `containerId` → 全部图标不高亮。

**E5 触发条件：** SidePanel 切换容器时忘了 emit `"sidebar:containerChanged"` → IconBar 收不到当前 containerId → 永不高亮。

**🔥 防线——SidePanel 切换容器时强制 emit：**
```typescript
// SidePanel.tsx 中——切换容器的地方
const switchContainer = (containerId: string | null) => {
  setSidebarView(containerId);
  shellEvents.emit("sidebar:containerChanged", containerId);  // ← 必须发
};
```

**🛡️ 手动验证（E5#8d 中执行）：** 点 📁 → 📁 高亮。点 🪢 → 🪢 高亮、📁 不高亮。

---

### Bug E5-3b 🔴 拖拽排序事件风暴——mousemove 触发 N 次 emit

**历史：** 无直接历史——这是 IconBar 拖拽排序的新生风险。

**E5 触发条件：** IconBar 拖拽排序时 `mousemove` 事件 → 如果拖拽过程中 emit 事件 → 其他区域频繁收到事件 → 性能问题。

**🔥 防线——拖拽期间不发事件：** 拖拽排序是 IconBar 内部行为——不涉及其他区域。只在拖拽结束（mouseup）时 emit 最终排序。

---

## 三、涉及文件

| 文件 | 改动 | 行数 |
|------|------|:--:|
| `src/components/IconBar.tsx` | 删 HamburgerMenu import、onIconClick → emit、isActive → 订阅、cleanup | ~20 |
| `src/App.tsx` | 删 handleIconClick（移到 IconBar 内部）、删 sidebarView prop | −15（E5#7 做） |
| `src/core/ShellEvents.ts` | 加 `"sidebar:containerChanged"` 事件 | +1（E5#1 做） |

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#3
> **← 前置：** `ShellEvents类型系统.md`（E5#1–#2）
> **→ 下一专题：** `壳内低耦合-SidePanel改造.md`（E5#4）
