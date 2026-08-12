# Zone 分解设计

> 极简Pool 的布局分区——每个 Zone 一个 React 组件文件。Zone 之间零 import 零 emit。
> 架构全景 → [01-极简Pool设计.md](../01-极简Pool设计.md)

---

## 1. Zone 全景

### 1.1 flex 布局矩阵

```
flex column (全窗口 100vw × 100vh)
├── TitleBarZone     (30px, flex-shrink: 0, -webkit-app-region: drag)
├── flex row (flex: 1, min-height: 0)
│   ├── IconBarZone  (42px, flex-shrink: 0)
│   ├── SidebarZone  (可变宽度, flex-shrink: 0, 条件渲染)
│   ├── 分隔线       (4px, flex-shrink: 0, cursor: col-resize)
│   ├── flex column (flex: 1, min-width: 0)
│   │   ├── TabBarZone       (35px, flex-shrink: 0)
│   │   ├── TopBarZone       (可选, flex-shrink: 0, 条件渲染)
│   │   ├── EditorZone       (flex: 1, min-height: 0)
│   │   └── PanelZone        (可变高度, flex-shrink: 0, 条件渲染)
│   ├── 分隔线       (4px, flex-shrink: 0, 条件渲染)
│   └── RightSidebarZone (可变宽度, flex-shrink: 0, 条件渲染)
├── StatusBarZone    (22px, flex-shrink: 0)
└── FloatingLayerHost (position: fixed, inset: 0, pointer-events: none)
```

### 1.2 Zone 职责表

| Zone | PoolLayout 字段 | 特性 |
|:--|:--|:--|
| TitleBarZone | `layout.titleBar` | `-webkit-app-region: drag`, 窗口控制 |
| IconBarZone | `layout.iconBar` | 42px 宽, 图标按钮列表 |
| SidebarZone | `layout.sidebar` | 可折叠, 可拖宽度 |
| TabBarZone | `layout.tabBar` | 35px 标签栏, 拖拽排序 |
| TopBarZone | `layout.topBar?` | 条件渲染, 面包屑/工具栏 |
| EditorZone | `layout.groups`, `layout.root` | SplitTree 分屏, 标签页内容 |
| PanelZone | `layout.panel?` | 条件渲染, 底部面板 |
| RightSidebarZone | `layout.rightSidebar?` | 条件渲染, 右侧面板 |
| StatusBarZone | `layout.statusBar` | 22px, 状态信息 |
| FloatingLayerHost | 事件触发 | position:fixed, z-index |

---

## 2. 每个 Zone 详细设计

### 2.1 TitleBarZone

**文件：** `src/pool/zones/TitleBarZone.tsx`

```
Props: titleBar: { title: string; menuBarVisible: boolean }
职责：
  - 渲染窗口标题（居中或左对齐）
  - 窗口控制按钮（_ □ ×）→ IPC → 主进程 win.minimize/maximize/close
  - 双缓冲 drag region（-webkit-app-region: drag + no-drag 子区域）
  - 菜单栏（条件渲染——menuBarVisible）
  - 系统菜单（Alt 键 → 调出隐藏菜单栏）

CSS:
  height: 30px
  -webkit-app-region: drag (默认)
  内部按钮: -webkit-app-region: no-drag
  background: var(--titlebar-bg)
  color: var(--titlebar-fg)

与壳关系:
  原 E5 壳 App.tsx 的 TitleBar div → 迁移到此
  窗口控制 IPC: window.linkdesk.window.minimize/maximize/close
```

### 2.2 IconBarZone

**文件：** `src/pool/zones/IconBarZone.tsx`

```
Props: iconBar: { icons: IconBarItem[]; activePluginId?: string }
职责：
  - 渲染图标按钮（垂直排列，42px 宽）
  - 高亮当前激活图标（activePluginId）
  - 点击 → window.linkdesk.events.emit('icon:selected', pluginId)
  - 右键图标 → 图标上下文菜单
  - 拖拽重排（可选——远期）

CSS:
  width: 42px
  display: flex, flex-direction: column
  gap: 4px
  padding-top: 4px

与壳关系:
  原 E5 壳 IconBar + useIconBar → 迁入此
  icon:selected 事件 → 主进程 handler → tabState → pushLayout
```

### 2.3 SidebarZone

**文件：** `src/pool/zones/SidebarZone.tsx`

```
Props: sidebar: { visible: boolean; width: number; viewId: string | null }
职责：
  - visible=false → display: none（零宽度 + overflow: hidden）
  - visible=true → 渲染 viewId 对应的插件视图
  - 使用 <PluginComponent>——和 EditorZone 中标签页的加载方式一致
  - 侧栏内切换视图：viewId 变化 → PluginComponent 卸载旧/挂载新

CSS:
  width: layout.sidebar.width (px)
  height: 100%
  flex-shrink: 0
  overflow: hidden
  transition: width 150ms ease (折叠动画)

组件树:
  <div className="sidebar-container">
    {viewId && (
      <PluginComponent
        pluginId={viewId}
        tabId={`sidebar-${viewId}`}
        isActive={true}
      />
    )}
  </div>

与壳关系:
  原 E5 壳 SidePanel → 迁入此
  原 E5.6 SidebarRenderer（独立 WCV）→ 变成了此 React 组件
  数据流不变: viewId 由 pushLayout 推送
```

### 2.4 TabBarZone

**文件：** `src/pool/zones/TabBarZone.tsx`

```
Props: tabBar: { groups: Array<{ groupId: string; tabs: PoolTab[]; activeTabId: string }> }
职责：
  - 为每个 group 渲染一行标签栏（35px）
  - 标签页点击 → window.linkdesk.tabs.setActive(tabId)
  - 标签页关闭 → window.linkdesk.tabs.close(tabId)
  - 拖拽排序 → 拖拽预览 portal + drop 位置计算
  - 拖拽分屏 → 拖到分隔线区域 → 创建新 group
  - 拖出窗口 → 超出窗口边界 → 触发脱出窗口
  - 右键标签页 → ContextMenu（Close / Close Others / Split Right / ...）

CSS:
  height: 35px
  display: flex, overflow-x: auto
  scrollbar-width: none

与壳关系:
  原 E5.6 壳 DOM 的 TabBar → 迁入此
  原 E5.6 MainRenderer 的 GroupTabBar → 可复用 shared/GroupTabBar.tsx
```

### 2.5 EditorZone

**文件：** `src/pool/zones/EditorZone.tsx`

```
Props:
  groups: PoolGroup[]
  root?: SplitNode
  creatableViews?: CreatableViewMeta[]

职责：
  - computeLayout(root, groups) → PanelRect[] + HandleRect[]
  - 渲染分屏面板（绝对定位平铺——B22 防护）
  - 每个面板渲染激活标签页内容（keep-alive——CSS display 切换）
  - 分隔线拖拽（mousedown → mousemove → update SplitNode）
  - 标签页拖拽协调（useDragReorder）
  - Glassmorphism 分屏预览 overlay（useTabDropPreview）
  - Drag preview portal（拖拽标签页时的半透明预览）

不 import: PanelZone / SidebarZone / StatusBarZone / TitleBarZone

关键算法:
  computeLayout(root, containerWidth, containerHeight):
    - 递归遍历 SplitNode 树
    - leaf → 一个 PanelRect（x, y, width, height）
    - branch → 根据 direction (horizontal|vertical) 分配空间
    - 返回: { panels: PanelRect[], handles: HandleRect[] }
    - B22 防护: panels 用 position: absolute, key=groupId 不变

组件树:
  <div className="editor-zone" style={{ flex: 1, position: 'relative' }}>
    {panels.map(panel => (
      <div key={panel.groupId} style={{ position: 'absolute', ...panel.rect }}>
        {group.tabs.map(tab => (
          <div key={tab.id} style={{ display: tab.id === group.activeTabId ? 'flex' : 'none' }}>
            <PluginErrorBoundary pluginId={tab.pluginId} tabId={tab.id}>
              <PluginComponent
                pluginId={tab.pluginId}
                tabId={tab.id}
                sourceId={tab.sourceId}
                isActive={tab.id === group.activeTabId}
              />
            </PluginErrorBoundary>
          </div>
        ))}
      </div>
    ))}
    {/* 分屏预览 overlay */}
    <DropZoneOverlay />
    {/* 拖拽预览 portal */}
    <DragPreviewPortal />
  </div>

与壳关系:
  从 E5.6 MainRenderer.tsx 的 computeLayout + 分屏渲染逻辑提取
  SplitTree 数据结构不变（src/hooks/splitTree.ts → src/pool/splitTree.ts）
```

### 2.6 PanelZone

**文件：** `src/pool/zones/PanelZone.tsx`

```
Props: panel: { visible: boolean; height: number; activeViewId: string; views: PanelViewMeta[] }
职责：
  - 渲染 PanelTabBar（28px 矮标签栏）
  - 渲染活动面板视图（keep-alive——CSS display 切换）
  - 面板视图注册表查找组件
  - [+] 按钮 → 新建终端/output channel
  - 拖拽顶部 resize handle → 调整高度

CSS:
  height: layout.panel.height (px)
  flex-shrink: 0
  display: flex, flex-direction: column
  border-top: 1px solid var(--border-color)

PanelTabBar (28px):
  - 标签宽度: 80px 固定（不 shrink）
  - overflow-x: auto（标签过多时滚动）
  - [+] 按钮: 始终显示在最右侧
  - 右键: Close View / Hide Panel

keep-alive:
  所有 views 平级渲染，display: none/flex 切换
  和 EditorZone 的 TabContent 模式一致

面板视图注册表:
  src/pool/main/panelViews.ts:
    export const PANEL_VIEWS: Record<string, React.ComponentType<{ isActive: boolean }>>
    = {
      "terminal": TerminalView,
      "output": OutputPanel,
      "problems": ProblemsView,   // 未来
      "ports": PortsView,         // 未来
    }

与壳关系:
  E5.6 设计为独立 BottomPanelPool WCV → E5.7 变 MainPool 内部 zone
  不需要 pool.html?zone=bottom-panel——它是 PoolZoneShell 内部的 React 组件
```

### 2.7 RightSidebarZone

**文件：** `src/pool/zones/RightSidebarZone.tsx`

```
Props: rightSidebar: { visible: boolean; width: number; viewId: string | null }
职责：
  - 和 SidebarZone 结构一致（可复用 shared 逻辑）
  - 默认隐藏——需要时才渲染
  - 宽度拖拽——左侧 4px resize handle
  - 内容：大纲视图、属性面板、AI Chat 等

CSS:
  width: layout.rightSidebar.width (px)
  height: 100%
  flex-shrink: 0
  border-left: 1px solid var(--border-color)

与壳关系:
  E5.6 设计为可选独立 RightSidebarPool WCV → E5.7 变 MainPool 内部 zone
  需要时 pushLayout 包含 rightSidebar 字段 → PoolZoneShell 渲染 <RightSidebarZone>
```

### 2.8 StatusBarZone

**文件：** `src/pool/zones/StatusBarZone.tsx`

```
Props: statusBar: { items: StatusBarItem[] }
职责：
  - 渲染状态栏（22px）
  - 左侧区域：光标位置、编码、行尾序列
  - 右侧区域：连接状态、内存使用、通知、缩放
  - 点击项 → 对应操作（切换编码、切换行尾、选择缩放等）

CSS:
  height: 22px
  display: flex, justify-content: space-between
  border-top: 1px solid var(--border-color)
  font-size: 12px

与壳关系:
  原 E5 壳 StatusBar div → 迁入此
  插件通过 window.linkdesk.statusBar.setEntry(id, { text, tooltip, command })
     → 主进程 → pushLayout → StatusBarZone 渲染
```

---

## 3. 加新 Zone——三步

```
1. 在 poolLayout.ts 加字段
2. 新建 src/pool/zones/<Name>Zone.tsx
3. 在 PoolZoneShell.tsx 加一个条件渲染 div
```

**现有 zone 代码零改动。**

---

## 4. Zone 间通信——不需要

所有变化走同一路径：

```
插件调 window.linkdesk.* → IPC → 主进程 handler → tabState 更新
  → syncLayout() → pushLayout(newLayout)
    → PoolZoneShell 收到新 layout → 所有 Zone 重新渲染
```

PanelZone 显隐 = pushLayout 有/没有 `panel` 字段。EditorZone 高度变化 = flex 自动调整。

---

> 📖 架构全景 → [01-极简Pool设计.md](../01-极简Pool设计.md)
> 📖 执行清单 → [E5.7-执行清单.md](../E5.7-执行清单.md)
