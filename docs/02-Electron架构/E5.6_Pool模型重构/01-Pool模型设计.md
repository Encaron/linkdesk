# E5.6 Pool 模型——设计文档（双Pool版）

> ## 🔴 已废弃——2026-08-12 架构切换至极简Pool
>
> **双Pool 架构已冻结。** 新架构：1 BrowserWindow + 1 WebContentsView——[01-极简Pool设计.md](../E5.7_极简Pool/01-极简Pool设计.md)。
> 本文件保留历史价值——SidebarPool/MainPool 的 keep-alive/分屏/PluginErrorBoundary 设计被 E5.7 继承，但进程边界全部取消。

---

> 2026-08-09。**从 Per-Tab WebView（O(N) 进程）重构为双Pool WebView 模型（O(1) 进程）。**
> SidebarPool + MainPool，并排，各自独立进程。TabBar 留在壳。
> 对标 VS Code 的侧栏与主区独立进程隔离——但用 WebContentsView 替代 iframe。

---

## 1. 问题——Per-Tab WebView 的根本矛盾

### 1.1 E5.5#9 的成就与代价

编辑器分屏（左 hello.c / 右 hello.h）、串口多会话（COM3 + COM5）——同插件多标签页同时运行。E5.5#9 的答案是：每个 tab 一个独立 `WebContentsView`。

**代价：**
- 进程数 O(N)
- `useWebViewSync` ~270 行——3 Effect + 3 Set + ResizeObserver + 宽限期
- `rekeyInstance` / `graceTimers` / `notifyReady` 全链
- **根本矛盾：用 OS 进程边界解决应用层分屏问题。分屏是 CSS flex 的问题。**

### 1.2 为什么不合并成单Pool

**如果只有一个全屏 Pool：** 侧栏插件（文件树、搜索）和主区插件（编辑器、串口）在同一个 JS 上下文。第三方侧栏插件 `while(true){}` → 带崩编辑器 → 全池崩溃重建 → 未保存内容丢失。

**双Pool = SidebarPool + MainPool。侧栏崩 ≠ 主区崩。** 这是 LinkDesk"万物皆插件"模型下的底线隔离。

---

## 2. 架构全景——Shell + SidebarPool + MainPool + OverlayWindow

```
┌──────────────────────────────────────────────────────────────────┐
│ MainWindow (BrowserWindow)                                        │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ TitleBar (Shell DOM)                                  _ □ ×  │ │
│  ├────┬─────────────────────────────────────────────────────────┤ │
│  │ 图标│ TabBar (Shell DOM)                                      │ │
│  │ 栏 │                                                          │ │
│  │    ├──────────────────────┬───────────────────────────────────┤ │
│  │    │ SidebarPool          │ MainPool                          │ │
│  │    │ WebContentsView      │ WebContentsView                   │ │
│  │    │                      │                                   │ │
│  │    │ ┌──────────────────┐ │ ┌───────────────────────────────┐ │ │
│  │    │ │ file-tree 组件   │ │ │ TabBar占位 (Shell渲染)         │ │ │
│  │    │ │ search 组件      │ │ ├───────────────────────────────┤ │ │
│  │    │ │ 插件面板 组件    │ │ │ ┌──────────┐ ┌──────────┐    │ │ │
│  │    │ │                  │ │ │ │ editor   │ │ editor   │    │ │ │
│  │    │ │                  │ │ │ │ hello.c  │ │ hello.h  │    │ │ │
│  │    │ │                  │ │ │ └──────────┘ └──────────┘    │ │ │
│  │    │ │                  │ │ │ ┌──────────────────────────┐ │ │ │
│  │    │ │                  │ │ │ │ serial-monitor COM3      │ │ │ │
│  │    │ │                  │ │ │ └──────────────────────────┘ │ │ │
│  │    │ └──────────────────┘ │ └───────────────────────────────┘ │ │
│  │    ├──────────────────────┴───────────────────────────────────┤ │
│  │    │ StatusBar (Shell DOM)                                     │ │
│  └────┴──────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ OverlayWindow (透明置顶 BrowserWindow)                        │ │
│  │ • 拖拽分隔线  • 右键菜单  • 命令面板  • Toast/Dialog/下拉     │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 2.1 四个 WebView 的职责

| WebView | 渲染什么 | Bounds | 进程 |
|:--|:--|:--|:--|
| **Shell** | TitleBar + 图标栏 + TabBar + StatusBar + 壳React逻辑 | 全窗口 | 1 |
| **SidebarPool** | 侧栏插件（file-tree/search/插件面板） | `{x:42, y:30, w:sidebarW, h:contentH}` | 1 |
| **MainPool** | 主区插件（editor/serial-monitor/…）+ 分屏布局 | `{x:42+sidebarW, y:30+tabBarH, w:mainW, h:contentH-tabBarH}` | 1 |
| **OverlayWindow** | 所有浮层（菜单/命令面板/Toast/分隔线） | 全窗口，置顶 | 1 |

**总进程数：4 (Main + Shell + Sidebar + Overlay) —— O(1)。** 开 30 个文件仍是 4 进程。

### 2.2 为什么 TabBar 在壳

- TabBar 是壳的交互——切标签页、关标签页、拖拽排序——全在壳的 tabState 里
- TabBar 在壳 = 标签页操作零 IPC 延迟
- 如果 TabBar 在 MainPool：每次切标签页 → MainPool IPC → Shell → Shell IPC → MainPool。不必要的往返
- **MainPool 顶部留 `tabBarH` 的空白**——池内内容从 `y = tabBarH` 开始。TabBar 渲染在壳的 `<div>` 里，铺在那个空白区域上方

### 2.3 为什么 OverlayWindow 永远需要

SidebarPool 和 MainPool 是平级 WebContentsView。任何浮层（右键菜单、下拉、命令面板）超出自身 Pool 的矩形 bounds → 被另一个 Pool 或壳 DOM 裁剪。

OverlayWindow = 全屏透明 `alwaysOnTop` 窗口，默认鼠标穿透。需要浮层时关闭穿透 → 渲染浮层 → 关闭后恢复穿透。

> 📖 **OverlayWindow 完整设计：** [OverlayWindow/OverlayWindow设计.md](OverlayWindow/OverlayWindow设计.md)

---

## 3. 通信协议——PoolLayout JSON

### 3.1 壳→Pool：布局快照

壳不直接操作插件的 React 组件。壳告诉池"世界长什么样"，池自己渲染。

```typescript
interface PoolLayout {
  version: 1;                    // ← 向前兼容——未来加字段时升级版本号
  poolId: string;                // "sidebar" | "main" | "bottom-panel" | ...

  // 侧栏部分——SidebarPool 和 RightSidebarPool 消费
  sidebar?: {
    visible: boolean;
    width: number;
    viewId: string | null;       // 当前打开的侧栏视图 pluginId
  };

  // 主区部分——MainPool 消费
  groups: Array<{
    id: string;                   // 分屏组 ID
    flex: number;                 // 分屏比例
    activeTabId: string;
    tabs: Array<{
      id: string;                 // tabId
      pluginId: string;
      title: string;
      sourceId?: string;          // 载荷——文件路径/端口名/…
      dirty?: boolean;
    }>;
  }>;
}
```

**触发时机：** 任何壳级变化——标签页增删/切换/分屏/合屏、侧栏展开/折叠/拖宽。全量发送。

**SidebarPool 只读 `sidebar` 字段。MainPool 只读 `groups` 字段。** 每个 Pool 忽略不相关的字段。

**`version` 字段保证向前兼容。** 未来加 `bottomPanel` 字段时升级为 `version: 2`。旧版 Pool 收到高版本 layout → 忽略未知字段（JSON 天然向前兼容）。新版 Pool 收到旧版 layout → 缺字段用默认值。

#### 完整 JSON 示例——壳推给 MainPool 的 layout

```jsonc
// IPC: pool:layout → MainPool
{
  "version": 1,
  "poolId": "main",
  "groups": [
    {
      "id": "group-1",
      "flex": 1,
      "activeTabId": "tab-001",
      "tabs": [
        {
          "id": "tab-001",
          "pluginId": "editor",
          "title": "main.c",
          "sourceId": "/home/user/project/main.c",
          "dirty": true
        },
        {
          "id": "tab-002",
          "pluginId": "editor",
          "title": "main.h",
          "sourceId": "/home/user/project/main.h",
          "dirty": false
        }
      ]
    }
  ]
}
```

```jsonc
// IPC: pool:layout → SidebarPool
{
  "version": 1,
  "poolId": "sidebar",
  "sidebar": {
    "visible": true,
    "width": 260,
    "viewId": "file-tree"
  }
}
```

**AI 一眼看懂：** MainPool 有 1 个分屏组、2 个标签页（main.c 已修改）、当前激活 tab-001。SidebarPool 显示文件树，宽 260px。

### 3.2 池→壳：事件上报

插件代码触发的事件通过现有 `events` 通道上报——和今天一样，Pool 模型零改动：

```typescript
// 插件代码（跑在 SidebarPool 或 MainPool 中）
window.linkdesk.events.emit('statusBar:update', { text: 'COM3 已连接' });
// → IPC → 主进程 → Shell webContents.send → 壳更新 StatusBar DOM
```

### 3.3 插件→主进程：不变

```typescript
window.linkdesk.filesystem.readTextFile(path)
  → ipcRenderer.invoke('filesystem:readTextFile', path)
  → 主进程 handler → 返回内容
```

`preload-plugin.ts` 的 `contextBridge` 暴露面零改动。

---

## 4. 池内部架构

### 4.1 pool.html——两个Pool共用入口

SidebarPool 和 MainPool 加载同一个 `pool.html`。Shell 在创建 Pool 时传入 `zone` 参数：

```typescript
// Shell
createSidebarPool() → poolView.loadURL(`pool.html?zone=sidebar-left`)
createMainPool()    → poolView.loadURL(`pool.html?zone=main`)
```

`src/pool/pool-main.tsx` 读 URL 参数知道自己是哪个 zone，只渲染对应部分。

> 📖 **SidebarPool 完整设计：** [SidebarPool/SidebarPool设计.md](SidebarPool/SidebarPool设计.md)
> 📖 **MainPool 完整设计：** [MainPool/MainPool设计.md](MainPool/MainPool设计.md)

### 4.2 src/pool/pool-main.tsx 入口

```tsx
// 注册表——加新 zone = 加一行映射。不 switch
const RENDERERS: Record<string, React.ComponentType<{ layout: PoolLayout }>> = {
  'sidebar':       (props) => <SidebarRenderer {...props} side="left" />,
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

**加新 zone = 往 `RENDERERS` 加一行映射。** 不改 switch 分支、不改条件判断。

**三种 Renderer 的 TabBar 组件互不共享：**
- `SidebarRenderer`——视图图标列表，`side` prop 控制影子方向和折叠箭头
- `MainRenderer`——`<TabBar>` 35px + 内容区 + keep-alive。**唯一有分屏的 Renderer**
- `BottomPanelRenderer`（未来）——`<PanelTabBar>` 28px + 内容区。80px 固定宽标签

### 4.3 SidebarRenderer——侧栏池

```tsx
function SidebarRenderer({ layout }: { layout: PoolLayout }) {
  const s = layout.sidebar;
  if (!s?.visible || !s?.viewId) return null;

  return (
    <aside style={{ width: '100%', height: '100%' }}>
      <PluginViewSlot pluginId={s.viewId} />
    </aside>
  );
}
```

### 4.4 MainRenderer——主区池

```tsx
function MainRenderer({ layout }: { layout: PoolLayout }) {
  return (
    <main style={{ display: 'flex', width: '100%', height: '100%' }}>
      {layout.groups?.map(group => (
        <div key={group.id} style={{ flex: group.flex, display: 'flex', flexDirection: 'column' }}>
          {/* 主区顶部留 tabBarH 空白——TabBar 在壳里渲染 */}
          {group.tabs.map(tab => (
            <TabContent key={tab.id} active={tab.id === group.activeTabId}>
              <PluginErrorBoundary pluginId={tab.pluginId} tabId={tab.id}>
                <PluginComponent
                  pluginId={tab.pluginId}
                  tabId={tab.id}
                  sourceId={tab.sourceId}
                  isActive={tab.id === group.activeTabId}
                />
              </PluginErrorBoundary>
            </TabContent>
          ))}
        </div>
      ))}
    </main>
  );
}
```

### 4.5 keep-alive——CSS display 切换

所有 tab 内容平级渲染，`display: none/block` 切换——和今天完全一样。

---

## 5. 交互链路

### 5.1 图标栏→侧栏池

```
IconBar click → shellEvents.emit("icon:selected", pluginId)
  → App.tsx → setSidebarView(pluginId)
    → syncLayout() → pushLayout({ sidebar: { visible: true, viewId: pluginId } })
      → IPC → SidebarPool ipcRenderer.on('pool:layout', ...)
        → SidebarRenderer 渲染 <PluginViewSlot pluginId={pluginId} />
```

### 5.2 文件树→主区池

```
FileTree 双击文件 → window.linkdesk.tabs.openOrFocus("editor", path)
  → IPC → 主进程 → Shell webContents.send('tabs:openOrFocus', ...)
    → Shell 创建 tab → tabState 更新
      → syncLayout() → pushLayout({ groups: [...] })
        → IPC → MainPool → MainRenderer 渲染编辑器
```

### 5.3 分隔线拖拽

```
用户拖分隔线
  → OverlayWindow mousemove → IPC → 主进程
    → layoutEngine.resizeZone("sidebar", newWidth)
      → SidebarPool.setBounds({ width: newWidth })
      → MainPool.setBounds({ x: newX, width: newWidth })
```

分隔线渲染在 OverlayWindow 里。拖拽时 OverlayWindow `setIgnoreMouseEvents(false)` 接管鼠标，松手后恢复穿透。

---

## 6. 崩溃恢复

每个 Pool 是独立渲染进程。一个 Pool 崩 ≠ 全壳崩。tabState 在壳 React 里——不随 Pool 崩溃丢失。

- SidebarPool 崩溃 → 1-2s 恢复，主区不受影响
- MainPool 崩溃 → 3-5s 恢复，标签页结构从 tabState 恢复，未保存内容丢失
- 心跳：5s `pool:ping` / `pool:pong`，超时 10s → 重建

> 📖 **崩溃恢复完整设计：** [崩溃恢复/崩溃恢复设计.md](崩溃恢复/崩溃恢复设计.md)

---

## 7. 可扩展性——六位置三 Pool 类型

> 📖 **完整设计：** [可扩展性/多Pool扩展预留.md](可扩展性/多Pool扩展预留.md)
> E5.6 只创建 SidebarPool + MainPool。以下四个位置是未来版本的预留口。

### 7.1 核心原则

**每个 Pool 只管理一种 TabBar 概念。** 永不出现一个 Pool 渲染两层标签栏。

| Pool 类型 | TabBar 组件 | 每个 tab 的含义 |
|:--|:--|:--|
| SidebarPool | 视图图标列表 | 一个侧栏视图（文件树/市场/AI） |
| MainPool | `<TabBar>` 35px | 一个插件/文档标签页 |
| BottomPanelPool | `<PanelTabBar>` 28px | 一个面板视图（终端/输出/问题/端口） |

终端内部的 `[PowerShell | bash | node]` 标签页是插件 React 组件内部的 `<TerminalInstanceBar>`——壳完全不知道。对标 VS Code `TerminalTabList extends WorkbenchList`。

### 7.2 六位置全景

| # | 位置 | ZoneConfig | Pool 类型 | WCV 数 | 生命周期 |
|:--|:--|:--|:--|:--|:--|
| 1 | sidebar-left | `dock: { edge:"left" }` | SidebarPool | 1 | 始终存在 |
| 2 | main (tabs) | `dock: { edge:"center" }` | MainPool | 1 | 始终存在 |
| 3 | bottom-panel | `dock: { edge:"bottom", order:1 }` | BottomPanelPool | +1 | **按需创建** |
| 4 | sidebar-right | `dock: { edge:"right" }` | SidebarPool (#2) | +1 | **按需创建** |
| 5 | modal | `mode: "modal"` | OverlayWindow 容器 | 0 (复用) | **按需创建** |
| 6 | detached | `mode: "detached"` | MainPool (新窗口) | +1/窗口 | **按需创建** |

**始终 3 个渲染进程**（SidebarPool + MainPool + OverlayWindow）。**按需 +N**（RightSidebarPool + BottomPanelPool + N×DetachedWindow）。

### 7.3 未来 Pool 详情

#### RightSidebarPool——第二个 SidebarPool 实例

- `pool.html?zone=sidebar-right` → `<SidebarRenderer side="right" />`——**同代码、不同 zone param**
- 和 sidebar-left **不是同一 WCV**——独立进程、独立崩溃恢复
- AI chat 插件注册时 `createPool("sidebar-right")`，关闭时 `destroyPool`
- 对标 VS Code Copilot Chat 右侧面板

#### BottomPanelPool——独立 Pool，按需创建

- `pool.html?zone=bottom-panel` → `<BottomPanelRenderer>` + `<PanelTabBar>`（28px）
- **不在 MainPool 内部**——独立 WCV、独立进程、独立崩溃恢复
- `<PanelTabBar>` vs `<TabBar>`：
  - 28px（vs 35px）、80px 固定（vs fit→shrink→overflow）、有 `[+]` 按钮、不支持分屏
- 按需创建：不开面板时零开销。Ctrl+J → `createPool("bottom-panel")` → pushLayout
- 插件可**仅贡献到底部面板**——无顶层 `entry`——对标 VS Code Serial Monitor 扩展
- 详见 [E5.6-执行清单.md §40](../E5.6-执行清单.md) + [多Pool扩展预留.md §5](可扩展性/多Pool扩展预留.md)

#### 插件嵌入统一模型

同一插件可出现在任意位置。**插件代码不知道自己在哪个 Pool**——Props 契约 `{ tabId, sourceId, isActive }` 完全相同。壳决定把组件挂载到哪个 Pool。

### 7.4 三态互转——`ZoneConfig.mode`

```typescript
type ZoneMode = "main" | "modal" | "detached";
// "main"     → docked 在主窗口 LayoutEngine 区域
// "modal"    → OverlayWindow 浮层容器（设置/市场/主题制作器）
// "detached" → 独立 BrowserWindow + Shell Lite + MainPool
```

七条转换路径——统一入口 `moveTab(tabId, fromZone, toZone)`。详见 [E5.6-执行清单.md §41](../E5.6-执行清单.md)。

### 7.5 扩展方式

**加新 Pool = 一行 ZoneConfig + `RENDERERS` 注册表加一行映射。** LayoutEngine 的 `_recalculate()` 已支持 left/right/center/bottom 四边。

---

## 8. 与 E5.5 Per-Tab 的对比

| 概念 | E5.5 Per-Tab | E5.6 双Pool |
|------|-------------|-----------|
| WebView 数 | 1 + N（每tab一个） | 4（Shell+Sidebar+Main+Overlay） |
| 进程数 | O(N) | O(1) |
| 新标签页 | 创建WebContentsView→加载URL→notifyReady | Shell pushLayout→MainPool渲染React组件 |
| 关闭标签页 | 60s宽限期→destroy | React卸载——零OS资源 |
| 重新打开 | findGrace→rekey→cancelDestroy | React重新挂载 |
| 分屏 | 每pane一个WebContentsView | MainPool内CSS flex分栏 |
| 侧栏隔离 | 无（侧栏在壳里） | SidebarPool独立进程 |
| 侧栏崩影响 | 全壳崩 | 只丢侧栏，编辑器不受影响 |
| 拖拽线 | 壳DOM 4px div | OverlayWindow渲染 |

### 8.1 消失的概念

| 消失的 | 代码量 | 为什么消失 |
|:--|:--|:--|
| `instanceId` 路由 | ~15 文件 | Pool 里用 tabId |
| `useWebViewSync` | ~270 行 | 池只需 bounds sync |
| `rekeyInstance` / `findGraceInstance` | ~50 行 | tabId 从不变化 |
| `scheduleDestroy` / `cancelDestroy` | ~40 行 | React 卸载就是卸载 |
| `graceTimers` | ~40 行 | 无宽限期 |
| `notifyReady` per-instance | preload + plugin-shell | 池就绪 = 一次性 |

---

## 9. 三步重构路线

### Step 1：回退单WebView（半天）
- 关闭 per-tab WebView 创建
- 所有插件回壳 React 树渲染
- 分屏立刻可用

### Step 2：双Pool骨架（2-3 天）
- WindowManager 创建两个 Pool
- pool.html（项目根） + src/pool/pool-main.tsx 双 zone 入口
- 壳 syncLayout → pushLayout 到两个 Pool
- SidebarPool 渲染侧栏，MainPool 渲染主区

### Step 3：清理 + 扩展（1-2 天）
- 删 Per-Tab 遗留代码
- OverlayWindow 跨 Pool UI
- 可扩展性预留口

---

## 10. 预估

| 指标 | 值 |
|:--|:--|
| 净删代码 | ~480 行（E5.5#9 回滚） |
| 新增代码 | ~350 行（pool.html + src/pool/pool-main.tsx + 双Pool管理 + OverlayWindow拖拽线） |
| 改动文件 | ~10 个 |
| 删除文件 | 1 个（useWebViewSync.ts） |
| 新增文件 | 3 个（pool.html + src/pool/pool-main.tsx + src/pool/SidebarRenderer.tsx + src/pool/MainRenderer.tsx） |
| 插件改动 | **0 行** |
| 工期 | 3.5-5.5 天 |

---

> **→ 执行清单：** [E5.6-执行清单.md](E5.6-执行清单.md)
> **→ MainPool 设计：** [MainPool/MainPool设计.md](MainPool/MainPool设计.md)
> **→ SidebarPool 设计：** [SidebarPool/SidebarPool设计.md](SidebarPool/SidebarPool设计.md)
> **→ OverlayWindow 设计：** [OverlayWindow/OverlayWindow设计.md](OverlayWindow/OverlayWindow设计.md)
> **→ 崩溃恢复：** [崩溃恢复/崩溃恢复设计.md](崩溃恢复/崩溃恢复设计.md)
> **→ 通信协议：** [跨Pool交互/通信协议设计.md](跨Pool交互/通信协议设计.md)
> **→ 多Pool扩展：** [可扩展性/多Pool扩展预留.md](可扩展性/多Pool扩展预留.md)
