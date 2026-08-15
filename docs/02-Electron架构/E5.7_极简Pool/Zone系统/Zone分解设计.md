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
│   │   ├── MainZone       (flex: 1, min-height: 0——内含每 panel GroupTabBar 35px)
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
| MainZone | `layout.groups`, `layout.root` | SplitTree 分屏, 每 panel 自带 GroupTabBar（35px 标签栏）+ 标签页内容 |
| PanelZone | `layout.panel?` | 条件渲染, 底部面板 |
| RightSidebarZone | `layout.rightSidebar?` | 条件渲染, 右侧面板 |
| StatusBarZone | `layout.statusBar` | 22px, 状态信息 |
| FloatingLayerHost | 事件触发 | position:fixed, z-index |

> **中文名对照（V3-部件命名规范.md 唯一标准）：** TitleBarZone=标题栏、IconBarZone=图标栏、SidebarZone=侧栏、MainZone=主区、PanelZone=底部面板、RightSidebarZone=右侧栏、StatusBarZone=状态栏、FloatingLayerHost=浮层。

> 🔴 **显示文本铁律（防中英夹杂回归）：** 所有 zone 渲染的文本由壳侧解析（`t()` 在壳），经 pushLayout 推送到池——池侧哑渲染字符串。**池不初始化 i18n、不二次翻译。**（iconBar tooltip / statusBar items / containerTitle 等全部壳侧解析。）

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
  - 拖拽重排——🔴 2026-08-14 补回（零丢失铁律：壳已验证功能不得静默砍——原"可选——远期"废止，commit 9848333a）

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
Props: sidebar: SidebarLayout（壳推送全量字段）
职责（🔴 哑渲染 SidebarLayout 全部字段——不只是 PluginComponent 包装器。2026-08-13 审计修正）：
  - visible=false → display: none（零宽度 + overflow: hidden）
  - collapsed → 只渲染 ▶ 展开按钮（折叠态）
  - views 为空 → 空状态文案（壳解析后推送）
  - 容器结构：
    · header——containerTitle / mergeHeaderWhenSingle 单视图标题合并 + ◀ 折叠按钮 + 右键菜单
    · toolbar 粘顶——views.role==="toolbar" 在滚动容器外（flex-shrink: 0）
    · section stack——其余 views：折叠 / 拖排 / sash resize（组件来自 src/pool/shared/）
  - section 内容用 <PluginComponent>——和 MainZone 中标签页的加载方式一致
  - 侧栏内切换视图：viewId 变化 → PluginComponent 卸载旧/挂载新

CSS:
  width: layout.sidebar.width (px)
  height: 100%
  flex-shrink: 0
  overflow: hidden
  transition: width 150ms ease (折叠动画)
  复用 SidePanel.css（E5.6#11l 同款，随 zone 迁入 Pool）

组件树:
  <div className="side-panel">
    {effectiveTitle && <div className="side-panel-header">…</div>}
    <div className="side-panel-content">
      <PoolToolbarSlot />            // src/pool/shared/
      <PoolSectionStack />           // src/pool/shared/
    </div>
  </div>

与壳关系:
  原 E5 壳 SidePanel → 迁入此
  原 E5.6 SidebarRenderer（独立 WCV）→ 变成了此 React 组件——行为零丢失（E5.7#10 验收 6 项对照）
  数据流: SidebarLayout 全量字段由 pushLayout 推送（含 containerTitle/mergeHeaderWhenSingle/collapsedViews/views[].role）
  动作路径: 折叠/切换视图 → 暂用 linkdesk.pool.* 过渡 → Phase 12 归位 API 命名
```

### 2.4 TabBarZone——🔴 已取消（2026-08-13 审计，墓碑）

**不建独立 TabBarZone。** tab bar 留在 MainZone 内——每个 panel 自带 GroupTabBar（`src/pool/shared/GroupTabBar.tsx` 复用，不变）。

**取消论证：**

1. **E5.6#16.5 架构教训**：TabBar 曾因"与内容不在同 DOM"产生三个 bug（拖分隔线 TabBar 不跟着动 / 松手弹回 / 上下分屏不可能），根治方案就是"每个 group 自包含（TabBar+内容+分隔线）"。独立 TabBarZone 横带在左右分屏时与面板几何错位——要画对必须复制 computeLayout，等于把治好的病再种回去。
2. **拖拽协调不可拆**：MainRenderer 是全局拖拽协调者（tabBarRefs 注册 + computeSplitZone 扫面板 + preview portal + drop zone），依赖 tab bar 和 panel 同组件。拆成两个 zone 必须加跨 zone 共享拖拽状态——重接线 15 轮 bug 验证过的活代码，风险最高、收益为零。
3. VS Code 同款：EditorPart 的 tab bar 在 group 内部，不存在独立"标签栏 part"。

**连带变更：**

- PoolLayout 无 `tabBar` 字段（E5.7#1 已删）——tab bar 数据从 `groups[].tabs` 渲染
- 拖出窗口检测（useDragDetach，Phase 8 #33）由 MainZone 接入
- 标签页点击/关闭/右键菜单等动作仍走 `window.linkdesk.pool.tabAction`（Phase 12 归位命名）

### 2.5 MainZone

**文件：** `src/pool/zones/MainZone.tsx`

> **中文名：主区**（V3-部件命名规范.md ⑥——标签页内容，主区顶部是标签栏）。2026-08-13 审计更名：EditorZone → MainZone——主区装任何插件标签页（终端/串口/卡片/设置），"Editor" 是 VS Code 借词，废除。

```
Props:
  groups: PoolGroup[]
  root?: SplitNode
  creatableViews?: CreatableViewMeta[]

职责（🔴 2026-08-13 审计修正——吸收 TabBarZone（§2.4 墓碑），MainRenderer 693 行行为零丢失。
      验收逐项对照 MainRenderer 现有实现，禁止丢项）：

  ① 每 panel 自带 GroupTabBar（src/pool/shared/GroupTabBar.tsx 复用——tab bar 留在 panel 内）
  ② computeLayout(root) → PanelRect[] + HandleRect[]——面板绝对定位平级渲染，
     B22 防护：key=groupId 永远同级，树变化只改 x/y/w/h，不 unmount（禁改回递归 flex 嵌套）
  ③ keep-alive——CSS display 切换（不是条件渲染）
  ④ shellRendered 分支：tab.shellRendered → ShellViewRenderer（welcome/插件详情/输出），
     否则 PluginComponent——两条分支都保留
  ⑤ 空态——groups.length === 0 → 居中"没有打开的标签页"（壳解析文案）
  ⑥ 单面板 flex fallback——叶子数 = 1 时不绝对定位（useAbsolute 条件）
  ⑦ 分隔线拖拽——🔴 真实机制（不是"update SplitNode"）：
     乐观本地 sizes（mousedown 起 mousemove 本地算）+ mouseup 一次性
     commit tabAction({ action: "updateSplitSizes", branchIndex, sizes })（与 #13 同款模式）；
     双击重置 50/50；hover accent 高亮
  ⑧ 同组拖拽乐观重排 dragLocalTabs（拖拽期间本地重排，松手 reorderTab commit）
  ⑨ 跨 group 移动（findOtherContainer）+ 拖到面板边缘分屏（detectDropZone）——
     Glassmorphism drop zone 内发光 overlay（class drop-glass-zone，pointer-events: none）
  ⑩ drag preview portal——createPortal 到 document.body（防 B34 裁剪），
     图标 emoji-vs-img 判断 + 标题
  ⑪ creatableViews [+] 动态菜单（GroupTabBar 传入）
  ⑫ ErrorBoundary——🔴 池侧版（现 MainRenderer import components/shared/ErrorBoundary
     是壳目录；迁 src/pool/shared/ErrorBoundary.tsx）；tab bar 用 pluginId=pool-tabbar:${groupId}，
     内容用 tab.pluginId
  ⑬ z-index——drop zone 9999 → Z_INDEX.dropZone，preview 99999 → Z_INDEX.dragPreview
     （#26 常量表，禁裸数字）

  提取方式：MainRenderer 内联逻辑原样提取（useDragReorder 275 行 15 轮 bug 验证——
  不重写）；useSplitResize / useTabDropPreview 拆分是可选重构，非本任务。
  拖出窗口检测：Phase 8 #33 useDragDetach 建成后接入。

不 import: PanelZone / SidebarZone / StatusBarZone / TitleBarZone（及其他任何 zone）

关键算法:
  computeLayout(root, x, y, w, h, branchIndices, localSizes):
    - 递归遍历 SplitNode 树
    - leaf → 一个 PanelRect（x, y, width, height 百分比）
    - branch → 根据 direction (horizontal|vertical) 分配空间，中间 HANDLE_PCT=0.4 分隔条
    - 返回: { panels: PanelRect[], handles: HandleRect[] }
    - B22 防护: panels 用 position: absolute, key=groupId 不变

组件树:
  <div className="main-zone" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
    {/* 绝对定位模式（多面板）——单面板走 flex fallback */}
    {panels.map(panel => (
      <div key={panel.groupId} data-group-id={panel.groupId} style={{ position: 'absolute', ...rect }}>
        <ErrorBoundary pluginId={`pool-tabbar:${panel.groupId}`}>
          <GroupTabBar ... />
        </ErrorBoundary>
        <div style={{ flex: 1 }}>
          {group.tabs.map(tab => (
            <div key={tab.id} style={{ display: tab.id === activeTabId ? 'flex' : 'none' }}>
              <ErrorBoundary pluginId={tab.pluginId}>
                {tab.shellRendered
                  ? <ShellViewRenderer tab={tab} isActive={...} creatableViews={...} />
                  : <PluginComponent ... />}
              </ErrorBoundary>
            </div>
          ))}
        </div>
      </div>
    ))}
    {/* 分隔线 handles——onMouseDown 拖拽 + 双击重置 50/50 + hover accent */}
    {/* Glassmorphism drop zone overlay（拖拽分屏预览） */}
    {/* drag preview portal → document.body */}
  </div>

与壳关系:
  从 E5.6 MainRenderer.tsx 提取（含 #7 取消后吸收的 GroupTabBar）
  SplitTree 纯操作迁 src/core/utils/splitTree.ts（🔴 2026-08-13 审计修正：
  壳 tabState 与池 computeLayout 双进程共用——不进 pool 目录，见壳目录规范 §1 utils；
  原"→ src/pool/splitTree.ts"是错的）
  computeLayout 现私有在 MainRenderer——提取时随 MainZone 迁入或拆入 utils
```

### 2.6 PanelZone

**文件：** `src/pool/zones/PanelZone.tsx`

```
Props: panel: { visible: boolean; height: number; activeViewId: string; views: PanelViewMeta[] }
职责（🔴 2026-08-13 审计：greenfield 骨架——无壳侧生产者，本任务只建渲染骨架）：
  - 渲染 PanelTabBar（28px 矮标签栏）
  - 渲染活动面板视图（keep-alive——CSS display 切换）
  - 面板视图注册表查找组件
  - [+] 按钮 → 新建终端/output channel
  - 拖拽顶部 resize handle → 调整高度（🔴 #13 同款模式：乐观本地 + mouseup commit，真相源在壳）

✅ 数据生产者已落地（E5.7#63.7，2026-08-16）——骨架期"归 Phase 12"承诺兑现：
  - 壳侧 bottom-panel 贡献路由——usePoolSync buildPanelViewMetas：
    ViewContainerService getViewContainers("panel")（容器按 order）× getActiveViews（视图按 order）两级展平
    → panel.views[]（PanelViewMeta 含 renderPath，与侧栏同源 loader._renderPath）；views 非空才推 panel 字段
    （无面板贡献 → layout.panel 缺省 → 条件渲染永假零 DOM，与骨架期行为一致）
  - 面板视图动态加载——PanelZone 每 view 经 PluginComponent 按 renderPath 动态 import（侧栏同款；
    自带 ErrorBoundary + Suspense）——第三方插件加底部面板视图 = 只改自己的 plugin.json，池代码零改动
  - 面板高度持久化——LayoutEngine panel zone（bottom dock：默认 220，钳制 120-600，order 1 在 statusbar 上）
    + resizeZoneHeight（拖拽/恢复同路钳制）+ LayoutService panel {height, activeViewId}（layout.json——
    与标签页布局同文件，非 workspace.json）+ App 事件桥（panel:viewSelected/panel:resize）
  - 未落地（不在三件套范围）：panel:createView 消费——[+] 新建面板视图归 Phase 12 面板创建（现 no-op）

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
  和 MainZone 的 TabContent 模式一致

面板视图加载（✅ E5.7#63.7 已落地——2026-08-13 审计删 PANEL_VIEWS 静态表：写死 pluginId 违反
  插件独立铁律 + 硬约束 10，且是对侧栏已有动态机制的倒退）:
  动态加载——MainZone 插件标签页同款 PluginComponent 模式（已实现）：
  元数据来自 shell pushLayout `panel.views[]`
    （ViewContainerService `location:"panel"` 枚举已存在——loader.ts 已动态注册所有 contributes.views）
  按 renderPath 动态 import 插件视图组件（PluginComponent O(1) glob 查找，loader._renderPath 同源）
    ——第三方插件加底部面板视图 = 只改自己的 plugin.json，池代码零改动

与壳关系:
  E5.6 设计为独立 BottomPanelPool WCV → E5.7 变 MainPool 内部 zone
  不需要 pool.html?zone=bottom-panel——它是 PoolZoneShell 内部的 React 组件
```

### 2.7 RightSidebarZone

**文件：** `src/pool/zones/RightSidebarZone.tsx`

```
Props: rightSidebar: { visible: boolean; width: number; viewId: string | null }
职责（🔴 2026-08-13 审计：greenfield 骨架——数据生产者归 Phase 12）：
  - 和 SidebarZone 结构一致（复用 pool/shared/ 的 PoolSectionStack / PoolToolbarSlot——#11 已迁入）
  - 默认隐藏——需要时才渲染
  - 宽度拖拽——左侧 4px resize handle（🔴 #13 同款模式：乐观本地 + mouseup commit）
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

### 2.9 TopBarZone——🔴 已取消（2026-08-13 审计，墓碑）

**不建 TopBarZone。** 论证：

1. **与规范文档死名重名**：V3-部件命名规范 ② 顶栏（TopBar）Phase 4 已移除（串口控制移入插件内部、语言/主题移入状态栏）——捡回死名 = 命名违规。
2. **不在区域清单**：确认的区域 = 侧栏 / 标签栏+标签页（主区）/ 图标栏 / 底部面板 / 右侧（未来）/ 顶部标题。面包屑没有位置。
3. **无数据生产者 + 几何同构陷阱**：greenfield 骨架（无壳侧生产者，条件渲染永假）；面包屑若真做，VS Code 里是每编辑器组内部的（同 GroupTabBar per-panel），独立横带会重演 TabBarZone 的几何错位（§2.4 墓碑同款论证）。

**连带：**

- PoolLayout 无 `topBar` 字段（E5.7#1 已删）
- 面包屑需求 → 未来并入 MainZone 每 panel（不在 E5.7 范围）

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

PanelZone 显隐 = pushLayout 有/没有 `panel` 字段。MainZone 高度变化 = flex 自动调整。

---

> 📖 架构全景 → [01-极简Pool设计.md](../01-极简Pool设计.md)
> 📖 执行清单 → [E5.7-执行清单.md](../E5.7-执行清单.md)
