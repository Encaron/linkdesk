# 多Pool扩展预留

> ## 🔴 已废弃——2026-08-12 架构切换至极简Pool
>
> **多Pool 概念已随双Pool 冻结。** E5.7 只有一个 Pool——扩展预留全部变成 Zone：
> SidebarZone / RightSidebarZone / PanelZone / TopBarZone / StatusBarZone（[Zone分解设计.md](../../E5.7_极简Pool/Zone系统/Zone分解设计.md)）。
> 脱出窗口独立成文：[脱出窗口设计.md](../../E5.7_极简Pool/脱出窗口/脱出窗口设计.md)。
> 本文件保留历史——六位置全景图的"位置"概念被 E5.7 Zone 继承，但"Pool 类型"全部取消。

> 📖 对应执行清单：[E5.6#37-#42](../E5.6-执行清单.md)
> 📖 核心设计：[01-Pool模型设计.md](../01-Pool模型设计.md)
> 🔥 **2026-08-12 修正：** BottomPanelPool 从独立 WCV 改为 MainPool 内部 PanelZone。详见 [MainPool内部解耦-Pool与Zone.md](../MainPool/MainPool内部解耦-Pool与Zone.md)。**本文档 §1-2 的 BottomPanel 独立 Pool 描述已过时——保留"一个 Pool 一个 TabBar"原则对 SidebarPool↔MainPool 正确，对 BottomPanel 不适用。** §5 的 PanelLayout 协议、面板视图注册表、插件贡献声明可复用。

---

## 1. 核心原则

### 每个 Pool 只管理一种 TabBar

这是 E5.6 的核心约束——永不破例：

| Pool 类型 | TabBar 组件 | 每个 tab 的含义 |
|:--|:--|:--|
| SidebarPool | 视图列表（图标切换） | 一个侧栏视图（文件树/市场/...） |
| MainPool | `<TabBar>`（35px 顶部标签栏） | 一个插件/文档标签页 |
| BottomPanelPool | `<PanelTabBar>`（28px 矮标签栏） | 一个面板视图（终端/输出/问题/端口） |
| OverlayWindow | 无 TabBar | —（右键菜单/命令面板/浮层/分割线） |

**永不出现一个 Pool 内部渲染两层 TabBar。** 终端内部的 `[PowerShell | bash | node]` 标签页**不是壳的 TabBar**——它是终端插件 React 组件内部的 `<TerminalInstanceBar>`，壳完全不知道它的存在。

---

### Pool 类型（代码）≠ Zone（布局位置）

同一份 Pool 代码可以服务于多个 zone。区别只在 `?zone=xxx` URL 参数——组件根据 zone 选择 Renderer：

| Pool 类型 | pool.html 入口 | 服务 zone |
|:--|:--|:--|
| SidebarPool | `pool.html?zone=sidebar-left` / `?zone=sidebar-right` | sidebar-left / sidebar-right |
| MainPool | `pool.html?zone=main` | main / detached |
| BottomPanelPool | `pool.html?zone=bottom-panel` | bottom-panel |

**三份 Pool 代码（三种 Renderer），六个位置，四个 WebContentsView。**

---

## 2. 六位置全景图

```
┌──────────────────────────────────────────────────────────────┐
│ 主窗口 (BrowserWindow)                                        │
│ ┌──────┐ ┌──────────────────────────┐ ┌──────────┐          │
│ │      │ │ MainPool                  │ │          │          │
│ │Side  │ │ ┌──────────────────────┐ │ │ Sidebar  │          │
│ │bar   │ │ │ TabBar [a.ts│b.ts]   │ │ │ Pool     │          │
│ │Pool  │ │ ├──────────────────────┤ │ │ (right)  │          │
│ │(left)│ │ │                      │ │ │          │          │
│ │      │ │ │  MainContent         │ │ │ AI Chat  │          │
│ │      │ │ │                      │ │ │          │          │
│ │      │ │ ├──────────────────────┤ │ │          │          │
│ │      │ │ │ PanelTabBar          │ │ │          │          │
│ │      │ │ │ [Term|Out|Prob|Port] │ │ │          │          │
│ │      │ │ │  BottomPanelContent  │ │ │          │          │
│ │      │ │ └──────────────────────┘ │ │          │          │
│ └──────┘ └──────────────────────────┘ └──────────┘          │
│ ┌──────────────────────────────────────────────────────┐     │
│ │ StatusBar                                             │     │
│ └──────────────────────────────────────────────────────┘     │
│                                                              │
│ OverlayWindow (透明, z-index 最高——不出现在此 ASCII 图中)      │
└──────────────────────────────────────────────────────────────┘
```

| # | 位置 | ZoneConfig | Pool 类型 | WCV 数 | 生命周期 |
|:--|:--|:--|:--|:--|:--|
| 1 | sidebar-left | `dock: { edge: "left" }` | SidebarPool | 1 | 始终存在 |
| 2 | main (tabs) | `dock: { edge: "center" }` | MainPool | 1 | 始终存在 |
| 3 | bottom-panel | `dock: { edge: "bottom", order: 1 }` | BottomPanelPool | +1 | 按需创建/销毁 |
| 4 | sidebar-right | `dock: { edge: "right" }` | SidebarPool (第二个) | +1 | 按需创建/销毁 |
| 5 | modal | `mode: "modal"` | OverlayWindow 容器 | 0 (复用) | 按需创建/销毁 |
| 6 | detached | `mode: "detached"` | MainPool (新窗口) | +1/窗口 | 按需创建/销毁 |

**始终 3 个渲染进程**（SidebarPool + MainPool + OverlayWindow）。
**按需 +N**（RightSidebarPool + BottomPanelPool + N×DetachedWindow）。

---

## 3. pool.html——通用入口

所有 Pool 加载同一个 `pool.html`，运行同一份 `pool-main.tsx`。`?zone=xxx` 决定渲染哪个 Renderer：

```typescript
// pool-main.tsx
// 注册表——加新 zone = 加一行映射。禁止 switch
const RENDERERS: Record<string, React.ComponentType<{ layout: PoolLayout }>> = {
  'sidebar-left':  (props) => <SidebarRenderer {...props} side="left" />,
  'sidebar-right': (props) => <SidebarRenderer {...props} side="right" />,
  'main':          MainRenderer,
  'bottom-panel':  BottomPanelRenderer,
};

function PoolApp() {
  const zone = new URLSearchParams(window.location.search).get('zone') || 'main';
  const [layout, setLayout] = useState<PoolLayout | null>(null);

  useEffect(() => {
    window.linkdesk.pool.ready();
    return window.linkdesk.pool.onLayout((l) => setLayout(l));
  }, []);

  if (!layout) return <PoolSkeleton />;

  const Renderer = RENDERERS[zone] ?? MainRenderer;
  return <Renderer layout={layout} />;
}
```

### 三种 Renderer

```
SidebarRenderer:          MainRenderer:             BottomPanelRenderer:
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ 视图切换按钮       │     │ TabBar (35px)     │     │ PanelTabBar (28px)│
│ [文件树] [市场]    │     │ [a.ts] [b.ts]     │     │ [Term] [Out] [+]  │
├──────────────────┤     ├──────────────────┤     ├──────────────────┤
│                  │     │                  │     │                  │
│ 活动视图内容       │     │ 活动标签页内容     │     │ 活动视图内容       │
│ (keep-alive)     │     │ (keep-alive)     │     │ (keep-alive)     │
│                  │     │                  │     │                  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

**SidebarRenderer 不区分左右**——Prop `side="left" | "right"` 控制影子方向和折叠箭头。
**MainRenderer** 是唯一有 `<TabBar>` 的 Renderer——标签栏支持分屏和拖出。
**BottomPanelRenderer** 用 `<PanelTabBar>`——28px 矮标签栏，80px 固定宽度。

---

## 4. 插件嵌入统一模型

插件代码**不知道自己在哪个 Pool**。Props 契约完全相同：

```typescript
interface PluginComponentProps {
  tabId: string;       // 壳分配——即使底部面板也分配 ID
  sourceId?: string;   // 载荷（文件路径 / 端口名 / ...）
  isActive: boolean;   // CSS display 切换——不活跃时 return null 但保持 mount
}
```

### 全功能插件（多位置）

```json
{
  "name": "marketplace",
  "entry": "index.tsx",                   // MainPool 标签页 / Modal 浮层
  "contributes": {
    "views": {
      "sidebar": [
        { "id": "marketplace", "entry": "sidebar.tsx" }   // SidebarPool
      ]
    }
  }
}
```

同一插件"市场"三形态：
- **侧栏**：sidebar.tsx → SidebarPool → 紧凑列表（搜索 + 已安装数 + 行列表）
- **标签页**：index.tsx → MainPool → 全屏商店（160px 分类栏 + 卡片网格）
- **浮层**：index.tsx → OverlayWindow Modal 容器 → 同上但居中浮层 800×600

### 底部面板专用插件（对标 VS Code Serial Monitor）

```json
{
  "name": "serial-monitor-lite",
  // 无顶层 entry —— 不能作为标签页打开
  "contributes": {
    "views": {
      "bottom-panel": [
        { "id": "serial-monitor", "title": "Serial Monitor", "icon": "plug" }
      ]
    }
  }
}
```

这个插件**只在底部面板存在**——不占侧栏、不占标签页、不占图标栏。和微软 VS Code Serial Monitor 扩展完全对标。

### 终端内部标签页——插件自主管理

```
BottomPanelPool DOM:

  PanelTabBar [Terminal | Output | Problems]    ← 壳管理（每个 tab = 一个视图）

  活动视图内容 (activeViewId === "terminal"):
    ┌──────────────────────────────────────┐
    │ <TerminalView>                       │  ← 插件组件 mount
    │                                      │
    │  <TerminalInstanceBar>               │  ← 插件内部 React state
    │  [PowerShell | bash | node] [+]      │     壳完全不知道这些标签页存在
    │                                      │
    │  <XtermContainer />                  │
    └──────────────────────────────────────┘
```

`TerminalInstanceBar` 是纯 React `useState([sessions])` + 条件渲染。对标 VS Code `TerminalTabList extends WorkbenchList<ITerminalInstance>`。

---

## 5. BottomPanelPool 完整设计

### 5.1 物理结构

- 独立 `WebContentsView`——不和 MainPool 共用进程
- `pool.html?zone=bottom-panel` → `<BottomPanelRenderer>`
- 按需创建——用户不开面板时零开销

### 5.2 PanelTabBar 组件规格

| 属性 | 主 `<TabBar>` | 底部 `<PanelTabBar>` |
|:--|:--|:--|
| 高度 | 35px | 28px |
| 标签宽度 | fit(120) → shrink(80) → overflow scroll | 80px 固定 |
| `[+]` 按钮 | 无（tab 由侧栏触发） | **有**——新建终端/output channel |
| 右键菜单 | Close Tab / Split / ... | Close View / Hide Panel |
| 分屏 | ✅ | ❌ |
| 拖出窗口 | ✅ 拖标签页→detached | ❌ 先"提升到主区标签页"→再从主 TabBar 拖出 |
| 拖拽重排 | ✅ | ✅ |
| 数据源 | `layout.tabs[]` | `layout.views[]` |

### 5.3 PanelLayout 协议

```typescript
// pool:layout → BottomPanelPool
interface PoolLayout {
  version: 2;               // v2 = 含 bottomPanel 字段
  poolId: "bottom-panel";
  bottomPanel?: {           // ← BottomPanelPool 只读这个字段
    views: PanelViewLayout[];
    activeViewId: string;
    visible: boolean;       // Ctrl+J toggle
    height: number;         // 持久化到 workspace.json
  };
}

interface PanelViewLayout {
  id: string;               // "terminal" | "output" | "problems" | "ports" | <plugin-contributed>
  label: string;            // i18n 显示名
  icon?: string;            // Lucide icon
  component: string;        // 壳路由到对应组件
}
```

#### 完整 JSON 示例——AI 可直接读懂的协议

```jsonc
// 壳 pushLayout 推给 BottomPanelPool 的 JSON
{
  "version": 2,
  "poolId": "bottom-panel",
  "bottomPanel": {
    "visible": true,
    "height": 300,
    "activeViewId": "terminal",
    "views": [
      {
        "id": "terminal",
        "label": "Terminal",
        "icon": "terminal",
        "component": "terminal"
      },
      {
        "id": "output",
        "label": "Output",
        "icon": "output",
        "component": "output"
      },
      {
        "id": "problems",
        "label": "Problems",
        "icon": "alert-circle",
        "component": "problems"
      },
      {
        "id": "ports",
        "label": "Ports",
        "icon": "plug",
        "component": "ports"
      },
      {
        "id": "serial-monitor",
        "label": "Serial Monitor",
        "icon": "monitor",
        "component": "serial-monitor"
      }
    ]
  }
}
```

**AI 一眼看懂：** 5 个视图（4 壳级 + 1 插件贡献）、当前选中 Terminal、面板高度 300px、可见。

### 5.4 生命周期

```
启动 → BottomPanelPool 不存在（零进程开销）

用户 Ctrl+J（或菜单 → New Terminal / 编译触发 Problems 面板）：
  → WindowManager.createPool('bottom-panel')
  → 加载 pool.html?zone=bottom-panel
  → Pool 就绪 → pushLayout({ views: [...], activeViewId, visible: true, height: 300 })
  → 主窗口 resize：三 WCV（SidebarPool/MainPool/BottomPanelPool）重新 setBounds

用户关闭所有面板视图（右键 → Hide Panel 或 Ctrl+J）：
  → pushLayout({ ...visible: false })  // 先隐藏——保留 views 状态
  → 用户可 Ctrl+J 恢复——instant（Pool 还在，只是 setBounds 缩到 0）

用户长时间不用底部面板（可选优化）：
  → WindowManager.destroyPool('bottom-panel')
  → WCV 销毁 → 回到零开销
```

### 5.5 内置视图

| id | 壳级/插件 | 现有资产 | 迁移计划 |
|:--|:--|:--|:--|
| `terminal` | 壳级 | v1.2.0 新建 | node-pty + xterm.js |
| `output` | 壳级 | E3f #54 `OutputPanel.tsx` | 从主区标签页迁入面板 |
| `problems` | 壳级 | v1.2.0 新建 | 编译输出解析 |
| `ports` | 壳级 | v1.2.0 新建 | 对标 VS Code Ports view |

### 5.6 插件贡献到底部面板

`plugin.json` 中 `contributes.views["bottom-panel"]` 声明。插件无需顶层 `entry`。和 VS Code Serial Monitor 扩展完全相同。

---

## 6. RightSidebarPool 设计

- **第二个 SidebarPool WCV**——同代码、不同 zone param
- `pool.html?zone=sidebar-right` → `<SidebarRenderer side="right" />`
- 宽度 300px, 可折叠（`minWidth: 0, collapsedWidth: 0`）
- AI chat 插件注册时创建，关闭时销毁
- 左右侧栏可同时存在——互不干扰，独立 WCV

---

## 7. 三态互转——`ZoneConfig.mode`

```typescript
type ZoneMode = "main" | "modal" | "detached";

interface ZoneConfig {
  zone: string;
  mode: ZoneMode;
  dock?: { edge: "left" | "right" | "center" | "bottom"; width?: number; height?: number; order?: number; ... };
  float?: { width?: number; height?: number; x?: number; y?: number; /* modal 专用 */ };
}
```

### 七条转换路径

```
(1) main tab  ──→ drag out window        ──→ detached（新 BrowserWindow + Shell Lite + MainPool）
(2) main tab  ──→ "Pop out"              ──→ modal（OverlayWindow 浮层容器）
(3) modal      ──→ "Dock to Main Window" ──→ main tab
(4) modal      ──→ "Move to New Window"  ──→ detached
(5) detached   ──→ drag back             ──→ main tab
(6) detached   ──→ close window          ──→ mergeAllTabs → main tab
(7) panel view ──→ "Move to Editor Area" ──→ main tab（底部面板视图升级为标签页）
```

统一入口函数 `moveTab(tabId, fromZone, toZone)`——不区分主窗口内/跨窗口。跨 Pool = 重建组件（相同 tabId/sourceId，不同容器 mount）。跨窗口 = 新 BrowserWindow + Shell Lite + MainPool（不是 WCV 跨窗口转移）。

---

## 8. WindowManager 通用 Pool API

```typescript
class WindowManager {
  private _pools = new Map<string, WebContentsView>();

  // --- 通用 Pool 生命周期 ---
  createPool(zone: string): WebContentsView {
    // 创建 WebContentsView + 加载 pool.html?zone=xxx
    // 注册到 _pools map
    // 返回 view（壳侧可 pushLayout）
  }

  destroyPool(zone: string): void {
    // 销毁 WCV + 从 _pools 移除
  }

  rebuildPool(zone: string): void {
    // 崩溃恢复——同 createPool 但保留旧 layout
  }

  getPool(zone: string): WebContentsView | undefined {
    return this._pools.get(zone);
  }

  // --- 布局同步 ---
  updatePoolBounds(zone: string): void {
    const view = this._pools.get(zone);
    const bounds = layoutEngine.getBounds(zone);
    if (view && bounds) view.setBounds(bounds);
  }

  updateAllPoolBounds(): void {
    for (const [zone, view] of this._pools) {
      const bounds = layoutEngine.getBounds(zone);
      if (bounds) view.setBounds(bounds);
    }
  }

  // --- 查询 ---
  listPools(): string[] {
    return [...this._pools.keys()];
  }

  // --- 始终存在的 Pool（E5.6 创建） ---
  initCorePools(): void {
    this.createPool('sidebar-left');
    this.createPool('main');
    // OverlayWindow 单独管理（透明窗口，不是 WCV）
  }

  // --- 按需创建的 Pool（未来版本实现） ---
  // createPool('sidebar-right')  → AI chat 开启时
  // createPool('bottom-panel')   → Ctrl+J 时
}
```

**E5.6 只 `createPool('sidebar-left')` + `createPool('main')`。**

---

## 9. LayoutEngine ZoneConfig 扩展

### 9.1 现有 zone（E5.6）

```typescript
this._zones = [
  { zone: "iconbar",     dock: { edge: "left",   width: 42, order: 0, resizable: false } },
  { zone: "sidebar-left",dock: { edge: "left",   width: 260, order: 1, minWidth: 170, maxWidth: 600, collapsedWidth: 0 } },
  { zone: "main",        dock: { edge: "center", flex: 1 } },
  { zone: "statusbar",   dock: { edge: "bottom", height: 24, order: 0 } },
];
```

### 9.2 `_recalculate()` 已支持的边

| edge | 布局逻辑 | 维度 |
|:--|:--|:--|
| `left` | 从左向右，order 小的靠左 | width |
| `right` | 从右向左，order 小的靠右 | width |
| `center` | 填满 left 和 right 之间的空间 | flex |
| `bottom` | 底部从左向右 | height |

### 9.3 未来加 zone——一行配置

```typescript
// 加右侧栏
{ zone: "sidebar-right", dock: { edge: "right", width: 300, order: 0, minWidth: 200, maxWidth: 500 } }

// 加底部面板
{ zone: "bottom-panel",   dock: { edge: "bottom", height: 300, order: 1, minHeight: 100, maxHeight: 600 } }
// StatusBar order:0 在下方面板之下（面板在 StatusBar 上方）
```

`_recalculate()` **不需要改**——已支持 left/right/center/bottom 四条边。

---

## 10. 扩展检查清单

未来加新 Pool 时自检：

- [ ] **LayoutEngine** 加 `ZoneConfig` 条目（一行配置）
- [ ] **pool-main.tsx** 加对应的 Renderer（新 zone → 新 case 分支）
- [ ] **WindowManager** `createPool(zone)`——E5.6 后已是通用方法
- [ ] **PoolLayout** 类型扩展对应的 layout 结构
- [ ] **壳侧 `syncLayoutToPools()`** 构建对应的 layout JSON → `pushLayout`
- [ ] **OverlayWindow** 加对应的 resize handle（新 Pool 和现有 Pool 之间的分割线）
- [ ] **崩溃恢复 + 心跳监控** 覆盖新 Pool
- [ ] **`plugin.json` contributes.views**——`sidebar` / `sidebar-right` / `bottom-panel` 数组
- [ ] **README / 插件开发指南** 更新（新 zone 的贡献方式）
