# MainPool 内部解耦——Pool vs Zone

> 2026-08-12。**E5.6 设计修正。** 澄清 Pool（进程隔离）和 Zone（布局分区）的边界——不是所有区域都需要独立 WebContentsView。
> **修正对象：** [多Pool扩展预留](../可扩展性/多Pool扩展预留.md) —— BottomPanelPool 从独立 WCV 改为 MainPool 内部 zone。
> **模式来源：** [E5 壳内低耦合](../../E5_核心归一化与壳重构_待执行/01-壳通信骨架/壳内低耦合-App去胶水化.md) —— 每个 zone 一个文件，零 import 邻居。

---

## 1. 问题——Toast 逼出了设计假设的裂缝

### 1.1 触发链

```
Toast 放哪？
  → OverlayWindow？ setIgnoreMouseEvents 是二进制的——全透或全不透。Toast 是非模态的 ❌
  → 壳 DOM？ WebContentsView 压在壳 DOM 上面——看不见 ❌
  → MainPool？ ✅ 但底部面板如果是独立 WCV，MainPool 底边会缩——Toast 和铃铛分离 ❓
```

这个"❓"追下去，发现底部面板独立成 Pool 的前提——"每个 Pool 只管理一种 TabBar"——从来没被挑战过。

### 1.2 "一个 Pool 一个 TabBar"为什么对 SidebarPool 对，对 BottomPanel 不对

Pool 的原始动机只有一句（[01-Pool模型设计.md](../01-Pool模型设计.md) 第 23 行）：

> 侧栏插件 while(true){} → 带崩编辑器 → 全池崩溃重建 → 未保存内容丢失

这条逻辑的测试问题：**"这个区域崩了——其他区域还有价值吗？"**

| 区域 | 崩了之后 | 答案 |
|------|---------|:--:|
| SidebarPool 崩 | 编辑器不丢未保存内容——继续写代码 | ✅ 有价值——**需要独立进程** |
| MainPool 崩 | 侧栏导航还在——但对着文件树能干嘛？ | ❌ 没价值——但 MainPool 是中心 |
| BottomPanel 崩 | 编辑器还在——但终端没了，你对着 Monaco 敲 `npm run dev`？ | ❌ 没价值——**不需要独立进程** |

**SidebarPool 是唯一明确需要进程隔离的**——侧栏是第三方插件的地盘，崩了不能拖垮用户的编辑器。底部面板（终端/输出/问题）是编辑器的附属工具——隔离它不带来独立价值。

### 1.3 VS Code 源码铁证

VS Code 的 PanelPart 和 EditorPart 在同一个 workbench DOM——只是 CSS flex 分区：

```css
/* VS Code notificationsToasts.css */
.monaco-workbench > .notifications-toasts {
    position: absolute;
    bottom: 25px;  /* 22px 状态栏高度 + 3px——永远在状态栏上方 */
}
```

Toast 锚定的是 `.monaco-workbench` 窗口底部——不是编辑器底部。底部面板打开 = 编辑器缩小，Toast 位置不变，铃铛位置不变，它们永远挨着。

---

## 2. Pool vs Zone——决策规则

```
问：这个区域崩了——其他区域还有价值吗？
  ├── 是 → Pool（独立 WebContentsView，进程隔离）
  └── 否 → Zone（MainPool 内部 flex 分区）
```

| 区域 | 代码来源 | 隔离需求 | 方案 |
|------|---------|---------|------|
| 左侧栏 | 第三方插件 | 高——可能 while(true) | **SidebarPool**（独立 WCV） |
| 右侧栏（AI Chat） | 第三方插件 | 高——LLM 推理可能崩 | **RightSidebarPool**（独立 WCV） |
| 主区编辑器 | 壳 + 全部插件 | —（中心） | **MainPool**（独立 WCV） |
| 底部面板（终端/输出/问题） | 壳级 | 低——xterm.js 稳定十年 | **PanelZone**（MainPool 内 flex） |
| 右侧面板（大纲/属性） | 壳级/可信插件 | 低——只是读编辑器状态渲染 DOM | **RightSidebarZone**（MainPool 内 flex） |
| 顶部工具栏（面包屑） | 壳级 | 低 | **TopBarZone**（MainPool 内 flex） |

**两条路并存——不互斥。** 同一个"右侧"位置——AI Chat 走 Pool（需要隔离），大纲视图走 Zone（不需要隔离）。架构两条路都留着。

---

## 3. 目录树规划

### 3.1 当前状态

```
src/pool/
├── pool-main.tsx              ← 入口——根据 zone 分发
├── shared/                    ← 跨 Pool 共享
│   ├── PluginComponent.tsx
│   ├── GroupTabBar.tsx
│   └── GroupTabBar.css
├── sidebar/                   ← SidebarPool 专属
│   ├── SidebarRenderer.tsx
│   ├── PoolSectionStack.tsx
│   └── PoolToolbarSlot.tsx
├── main/                      ← MainPool 专属
│   └── MainRenderer.tsx       ← 🔴 693 行——正在变成超级胶水
└── views/                     ← 壳视图（跨 Pool 共享）
    ├── ShellViewRenderer.tsx
    ├── WelcomePoolView.tsx
    ├── PluginDetailPoolView.tsx
    └── OutputPoolView.tsx
```

### 3.2 目标状态

```
src/pool/
├── pool-main.tsx              ← 入口——根据 zone 分发（不变）
├── shared/                    ← 跨 Pool 共享（不变）
│   ├── PluginComponent.tsx
│   ├── GroupTabBar.tsx
│   └── GroupTabBar.css
├── sidebar/                   ← SidebarPool 专属（不变）
│   ├── SidebarRenderer.tsx
│   ├── PoolSectionStack.tsx
│   └── PoolToolbarSlot.tsx
├── main/                      ← MainPool 专属
│   ├── MainRenderer.tsx       ← 瘦身——只做布局分发（~80 行）
│   ├── EditorZone.tsx         ← 🆕 编辑器区域——SplitTree + GroupTabBars + 拖拽分屏
│   ├── PanelZone.tsx          ← 🆕 底部面板——PanelTabBar + 面板内容
│   ├── PanelTabBar.tsx        ← 🆕 面板标签栏组件（28px）
│   ├── MainPoolEvents.ts      ← 🆕 类型安全事件表（可选——zone 间通常不需要直接通信）
│   └── panelViews.ts          ← 🆕 面板视图注册表——替代 switch(viewId)
├── views/                     ← 壳视图（跨 Pool 共享，不变）
│   ├── ShellViewRenderer.tsx
│   ├── WelcomePoolView.tsx
│   ├── PluginDetailPoolView.tsx
│   └── OutputPoolView.tsx
└── (删除) bottom/             ← 空目录——BottomPanelPool 不独立存在
```

### 3.3 为什么不需要独立的 `bottom/` 目录

BottomPanel 不是独立 Pool——它和 EditorZone 共享 MainPool 的 WebContentsView。`PanelZone.tsx` 文件和 `EditorZone.tsx` 同级——`main/` 目录下平级。就像 E5 的 `IconBar.tsx` 和 `SidePanel.tsx` 都在 `components/` 下——它们是同一个壳的不同 zone，不需要各自的子目录。

如果未来有第二个 Panel（比如 `StatusPanelZone`——底部状态面板），加一个文件即可——不建新目录。

---

## 4. MainPool 内部解耦——E5 模式

### 4.1 核心原则

```
每个 Zone 一个文件。Zone 之间不 import 对方。
所有 Zone 都从壳 pushLayout 收数据——壳是唯一真相源。
```

和 E5 的区别：E5 的四个区域通过 ShellEvents 互相通信（IconBar emit → SidePanel on）。MainPool 的 zone 之间**不需要事件总线**——它们的唯一"通信"是通过壳中转的 layout 快照。

```
壳 pushLayout ──→ MainPool 接收
                      │
                      ├──→ EditorZone: groups[], root, creatableViews
                      ├──→ PanelZone:  panelLayout (views, activeViewId, visible, height)
                      └──→ RightSidebarZone: rightSidebar (views, activeViewId, width)
```

PanelZone 显隐 = 壳 pushLayout 有/没有 panel 字段。EditorZone 高度变化 = 壳 setBounds 时 WCV 高度自然调整。**zone 之间零直接通信。**

### 4.2 MainRenderer 瘦身

```tsx
// MainRenderer.tsx（改造后 ~50 行）
// 只做布局分发——不管理任何 zone 的内部状态

function MainRenderer({ layout }: { layout: PoolLayout }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 顶部工具栏（条件渲染） */}
      {layout.topBar && <TopBarZone topBar={layout.topBar} />}

      {/* 主区 + 右侧面板 */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* 左侧：编辑器 + 底部面板 */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <EditorZone
            groups={layout.groups}
            root={layout.root}
            creatableViews={layout.creatableViews}
          />
          {layout.panel?.visible && <PanelZone panelLayout={layout.panel} />}
        </div>

        {/* 右侧面板（条件渲染） */}
        {layout.rightSidebar?.visible && (
          <RightSidebarZone sidebar={layout.rightSidebar} />
        )}
      </div>
    </div>
  );
}
```

**只加 zone = 在 MainRenderer 里加一个 div + 一个新文件。** 不改任何现有 zone 的代码。

### 4.3 EditorZone.tsx

从当前 `MainRenderer.tsx` 中提取编辑器相关逻辑：

```
职责：
  - 接收 groups[] + root SplitNode
  - computeLayout() → PanelRect[] + HandleRect[]
  - 渲染分屏面板（绝对定位平铺——B22 防护）
  - 分隔线拖拽（onDividerMouseDown）
  - 标签页拖拽协调（useDragReorder）
  - Glassmorphism 分屏预览 overlay
  - Drag preview portal

Props:
  groups: PoolGroup[]
  root?: SplitNode
  creatableViews?: { pluginId: string; label: string }[]

不 import: PanelZone / RightSidebarZone / TopBarZone
```

### 4.4 PanelZone.tsx

```
职责：
  - 接收 panelLayout (views, activeViewId, visible, height)
  - 渲染 PanelTabBar（28px 矮标签栏）
  - 渲染活动面板视图（keep-alive——CSS display 切换）
  - 面板视图注册表查找组件

Props:
  panelLayout: PanelLayout

内部状态:
  - activeViewId（壳推，但 PanelZone 本地缓存——切 tab 瞬间响应）
  - tab 拖拽重排（PanelTabBar 内部）

不 import: EditorZone / RightSidebarZone / TopBarZone
```

### 4.5 PanelLayout 类型

```typescript
// poolLayout.ts 新增
interface PanelLayout {
  visible: boolean;
  height: number;            // 持久化到 workspace.json
  activeViewId: string;      // "terminal" | "output" | "problems" | "ports" | plugin-contributed
  views: PanelViewMeta[];    // 已注册的面板视图列表
}

interface PanelViewMeta {
  id: string;
  label: string;             // i18n 显示名
  icon?: string;             // Lucide icon
  component: string;          // 面板视图注册表 key
}
```

### 4.6 面板视图注册表——替代 switch

```typescript
// panelViews.ts
import TerminalView from "../../plugins/builtin/terminal/TerminalView";   // 未来
import OutputPanel from "../../components/OutputPanel";                   // 现有
// 未来：ProblemsView, PortsView ...

export const PANEL_VIEWS: Record<string, React.ComponentType<{ isActive: boolean }>> = {
  "terminal": TerminalView,
  "output": OutputPanel,
  // "problems": ProblemsView,    // 未来
  // "ports": PortsView,          // 未来
};

// 插件贡献的面板视图动态注册
export function registerPanelView(id: string, component: React.ComponentType<{ isActive: boolean }>) {
  PANEL_VIEWS[id] = component;
}
```

加新面板视图 = 在 `PANEL_VIEWS` 里加一行。不改 PanelZone 代码。

### 4.7 PanelTabBar 组件

| 属性 | 主 `<GroupTabBar>` | 底部 `<PanelTabBar>` |
|:--|:--|:--|
| 高度 | 35px | 28px |
| 标签宽度 | fit(120) → shrink(80) → overflow scroll | 80px 固定 |
| `[+]` 按钮 | 无——tab 由侧栏/命令触发 | **有**——新建终端/output channel |
| 右键菜单 | Close Tab / Split / ... | Close View / Hide Panel |
| 分屏 | ✅（在 SplitNode 中） | ❌ |
| 拖拽重排 | ✅ | ✅ |
| 数据源 | `layout.groups[].tabs[]` | `layout.panel.views[]` |

---

## 5. 加新 Zone——三步

### 5.1 加底部面板（PanelZone）

```
1. PoolLayout 类型加 panel?: PanelLayout
2. 新建 main/PanelZone.tsx
3. MainRenderer 加 {layout.panel?.visible && <PanelZone panelLayout={layout.panel} />}
4. 壳 pushLayout 时填充 panel 字段
```

### 5.2 加右侧面板（RightSidebarZone）

```
1. PoolLayout 类型加 rightSidebar?: SidebarLayout
2. 新建 main/RightSidebarZone.tsx
3. MainRenderer 加 {layout.rightSidebar?.visible && <RightSidebarZone sidebar={layout.rightSidebar} />}
4. 壳 pushLayout 时填充 rightSidebar 字段
```

### 5.3 加顶部工具栏（TopBarZone）

```
1. PoolLayout 类型加 topBar?: TopBarLayout
2. 新建 main/TopBarZone.tsx
3. MainRenderer 加 {layout.topBar && <TopBarZone topBar={layout.topBar} />}
4. 壳 pushLayout 时填充 topBar 字段
```

**现有 zone 代码零改动。** 每个 zone 是独立文件。

---

## 6. 插件声明——零变化

```json
// 底部面板视图——现在就能声明，key 不变
{ "contributes": { "views": { "bottom-panel": [{ "id": "serial-quick", "entry": "quick.tsx" }] } } }

// 侧栏视图——不变
{ "contributes": { "views": { "sidebar": [{ "id": "marketplace", "entry": "sidebar.tsx" }] } } }

// 主区标签页——不变
{ "entry": "index.tsx" }
```

**壳在 pushLayout 时做了不同的事（`sidebar` → SidebarPool，`bottom-panel` → MainPool 的 `panel.views[]`），但插件声明一模一样。** 插件代码不知道自己在哪个 Pool 或 zone——`window.linkdesk.*` 是唯一 API 契约。

---

## 7. 与"多Pool扩展预留"的关系——修正

[多Pool扩展预留](../可扩展性/多Pool扩展预留.md) 中的修正：

| 原文 | 修正后 |
|------|--------|
| BottomPanelPool = 独立 WCV | BottomPanel = PanelZone（MainPool 内 flex 分区） |
| `pool.html?zone=bottom-panel` | 不需要——PanelZone 是 MainPool 内部的 React 组件 |
| `createPool('bottom-panel')` | 不需要——MainPool 已存在 |
| `src/pool/bottom/` 目录 | 删除——PanelZone 在 `main/PanelZone.tsx` |
| 始终 3 进程 + 按需 +N | 始终 3 进程（SidebarPool + MainPool + OverlayWindow）+ 按需 +N（RightSidebarPool + DetachedWindow） |

**保留不变：**
- RightSidebarPool = 独立 WCV（AI Chat 等需要进程隔离的第三方插件）
- SidebarPool = 独立 WCV（不变）
- 六位置全景图中的 `sidebar-left` / `main` / `sidebar-right` / `modal` / `detached`——删 `bottom-panel` 独立位置，它现在是 MainPool 的内部 zone
- WindowManager `createPool()` / `destroyPool()` API

### 修正后的六位置全景图

```
┌──────────────────────────────────────────────────────────────┐
│ 主窗口 (BrowserWindow)                                        │
│ ┌──────┐ ┌──────────────────────────────────┐ ┌──────────┐  │
│ │      │ │ MainPool                          │ │          │  │
│ │Side  │ │ ┌──────────────────────────────┐ │ │ Sidebar  │  │
│ │bar   │ │ │ EditorZone                    │ │ │ Pool     │  │
│ │Pool  │ │ │ ┌──────────┐ ┌──────────────┐│ │ │ (right)  │  │
│ │(left)│ │ │ │ Group 1  │ │ Group 2      ││ │ │          │  │
│ │      │ │ │ │ a.ts     │ │ b.ts         ││ │ │ AI Chat  │  │
│ │      │ │ │ │          │ │              ││ │ │          │  │
│ │      │ │ │ └──────────┘ └──────────────┘│ │ │          │  │
│ │      │ │ ├──────────────────────────────┤ │ │          │  │
│ │      │ │ │ PanelZone                    │ │ │          │  │
│ │      │ │ │ [Term|Out|Prob|Port] [+]     │ │ │          │  │
│ │      │ │ │  面板内容                     │ │ │          │  │
│ │      │ │ └──────────────────────────────┘ │ │          │  │
│ │      │ └──────────────────────────────────┘ │          │  │
│ └──────┘ └──────────────────────────────────┘ └──────────┘  │
│ ┌──────────────────────────────────────────────────────┐     │
│ │ StatusBar                                             │     │
│ └──────────────────────────────────────────────────────┘     │
│                                                              │
│ OverlayWindow (透明, z-index 最高)                            │
└──────────────────────────────────────────────────────────────┘
```

| # | 位置 | Zone 类型 | 进程 | 生命周期 |
|:--|:--|:--|:--|:--|
| 1 | sidebar-left | SidebarPool | 独立 WCV | 始终存在 |
| 2 | main | MainPool | 独立 WCV | 始终存在 |
| 3 | MainPool 内部 PanelZone | MainPool 内 zone | 共享 MainPool | 条件渲染 |
| 4 | MainPool 内部 RightSidebarZone | MainPool 内 zone | 共享 MainPool | 条件渲染 |
| 5 | MainPool 内部 TopBarZone | MainPool 内 zone | 共享 MainPool | 条件渲染 |
| 6 | sidebar-right | RightSidebarPool | 独立 WCV（+1） | 按需创建/销毁 |
| 7 | modal | OverlayWindow | 独立 BrowserWindow | 按需创建/销毁 |
| 8 | detached | MainPool（新窗口） | 独立 BrowserWindow（+1/窗口） | 按需创建/销毁 |

**始终 3 个渲染进程**（SidebarPool + MainPool + OverlayWindow）。
**按需 +N**（RightSidebarPool + N×DetachedWindow）。

---

## 8. 实施影响

| 改动 | 说明 |
|------|------|
| 删 `src/pool/bottom/` | 空目录——删除 |
| 删 BottomPanelPool WCV 创建逻辑 | 不存在的——还没实现（E5.6#40 远期预留） |
| 修正 `多Pool扩展预留.md` | BottomPanelPool → PanelZone |
| 修正 `01-Pool模型设计.md` | 更新 Pool 类型表 |
| 修正 `E5.6-执行清单.md` | E5.6#40 改——从"独立 Pool"改为"MainPool 内部 zone" |
| 新文件 `MainPool内部解耦-Pool与Zone.md` | 本文档 |
| 插件代码 | **零改动** |
| `window.linkdesk.*` | **零改动** |

**零返工。** BottomPanelPool 的代码一行没写——改的是设计文档和远期任务描述。

---

## 9. 对插件作者——零变化

```
声明 contributes.views["bottom-panel"]  → 壳 pushLayout → MainPool PanelZone 渲染
                                          ↑
                                     插件不需要知道这个细节
```

插件作者只关心三件事：
1. 我的视图在哪个位置（`sidebar` / `bottom-panel` / 主区标签页）
2. 我的组件收到 `isActive` prop
3. 我通过 `window.linkdesk.*` 调 API

**壳内部是 1 个文件还是 3 个文件、是独立进程还是 flex 分区——插件代码一行不变。**

---

> **← MainPool 索引：** [MainPool设计.md](MainPool设计.md)
> **← E5 解耦模式：** [壳内低耦合-App去胶水化](../../E5_核心归一化与壳重构_待执行/01-壳通信骨架/壳内低耦合-App去胶水化.md)
> **→ 修正对象：** [多Pool扩展预留](../可扩展性/多Pool扩展预留.md)
> **→ 执行清单：** [E5.6-执行清单.md](../E5.6-执行清单.md)
