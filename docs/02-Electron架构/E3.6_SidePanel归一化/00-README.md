# E3.6 — SidePanel ViewContainer 归一化

> 2026-07-29。**E3 架构封站后发现的设计裂缝。**
> SidePanel 是壳级组件（对的），但壳只做了一半——能切换"谁的整个 sidebar"，
> 切进去之后每个插件侧栏内部是硬编码死 JSX，任何其他插件无法往里注册内容。
>
> **本文说明为什么要归一化、归一化成什么样、涉及哪些文件。**

---

## 一、前因——当前架构的裂缝

### 1.1 现在是怎么工作的

```
用户点 📁 图标
→ App.handleIconClick("file-tree")
→ setSidebarView("file-tree")
→ SidePanel:
    const plugin = getViewPlugin("file-tree")
    const SidebarComponent = plugin.sidebarComponent  // ← 来自 plugin.json "sidebar": "src/sidebar.tsx"
    return <SidebarComponent />                        // ← 渲染整个 file-tree 的 sidebar.tsx

用户点 🪢 图标
→ handleIconClick("serial-monitor")
→ setSidebarView("serial-monitor")
→ SidePanel:
    const plugin = getViewPlugin("serial-monitor")
    <plugin.sidebarComponent />                        // ← 渲染整个 serial-monitor 的 sidebar.tsx
```

每个插件的 `plugin.json` 声明了一个 `sidebar` 字段，指向一个 `.tsx` 文件。loader 在加载插件时 glob 这个文件，动态 import，存到 `viewRegistry` 的 `sidebarComponent` 字段。SidePanel 切换时取不同插件的 sidebarComponent 来渲染。

### 1.2 问题在哪

**SidePanel 只能切换"整个侧栏是谁的"，但切进去之后是死胡同。**

读三份 sidebar.tsx 的实际代码：

```typescript
// file-tree/src/sidebar.tsx（简化）
<div className="file-tree-sidebar">
  <div className="sidebar-header">资源管理器 ⋯</div>
  <FileTree />           // ← 写死的
  <WelcomeView />        // ← 写死的
</div>
```

```typescript
// marketplace/src/sidebar.tsx（简化）
<div className="marketplace-sidebar">
  <SidebarSection title="已安装"> ... </SidebarSection>   // ← 写死的
  <SidebarSection title="内置"> ... </SidebarSection>      // ← 写死的
  <SidebarSection title="已禁用"> ... </SidebarSection>    // ← 写死的
  <SidebarSection title="待安装"> ... </SidebarSection>    // ← 写死的
</div>
```

```typescript
// serial-monitor/src/sidebar.tsx（简化，原 460 行）
<div className="serial-monitor-sidebar">
  <SidebarSection title="串口监视器会话"> ... </SidebarSection>  // ← 写死的
  <SidebarSection title="收发设置"> ... </SidebarSection>        // ← 写死的
</div>
```

**三份都是封闭盒子。** 没有一个插件能往另一个插件的侧栏里注入内容：

- 语言插件无法往 Explorer 侧栏注册 OUTLINE section
- Git 插件无法往 Explorer 侧栏注册 TIMELINE section
- 协议分析插件无法往串口监视器侧栏注册第三行
- 用户装了什么插件就往侧栏多什么东西——**这个做不到**

### 1.3 VS Code 怎么做

VS Code 的 Explorer 侧栏不是 file-tree 一个人画的：

```
Explorer 侧栏：
├── OPEN EDITORS      ← 壳提供
├── FOLDERS            ← file-tree 扩展注册
├── OUTLINE            ← C/C++ 扩展注册
└── TIMELINE           ← Git 扩展注册
```

谁装了谁就出现。file-tree 不知道 OUTLINE 的存在，语言插件不知道 TIMELINE 的存在。
核心提供了一张叫 `ViewContainer` 的桌子——插件往桌子上登记 view，侧栏渲染循环消费桌子上的数据。

### 1.4 不改的后果

E4 执行清单里有 5+ 个任务要改 `sidebar.tsx`：UI 对齐（E4V#20-#21）、新建文件 toolbar（E4V#25）、FileAssociation 连线（E4V#33）等。
如果在硬编码的 `sidebar.tsx` 上做这些，做完后 E4V#7-#11 再重构为 ViewContainer ——返工。**E3.6 在 E4 之前做，让 E4 所有任务往正确架构上写。**

---

## 二、归一化方案

### 2.1 核心概念——一张表、两个动作

```
ViewContainerService（大厅的一张新桌子）
├── registerView(containerId, { id, title, render })   ← 插件往桌子上放东西
├── getViews(containerId): ViewDescriptor[]             ← 侧栏从桌子上取东西
└── onDidChangeViews                                    ← 东西变了通知所有人
```

**注册时的样子：**

```
file-tree 插件 activate():
  registerView("explorer",       { id: "folders",   title: "linkdesk-project", render: FoldersView })

marketplace 插件 activate():
  registerView("marketplace",    { id: "installed", title: "已安装", render: InstalledList })
  registerView("marketplace",    { id: "builtin",   title: "内置", render: BuiltinList })
  registerView("marketplace",    { id: "disabled",  title: "已禁用", render: DisabledList })
  registerView("marketplace",    { id: "uninstalled", title: "待安装", render: UninstalledList })

serial-monitor 插件 activate():
  registerView("serial-monitor", { id: "sessions",  title: "串口监视器会话", render: SessionListView })
  registerView("serial-monitor", { id: "settings",  title: "收发设置", render: SettingsView })
```

**切换时的样子：**

```
SidePanel 的渲染逻辑——不管当前是哪个 container，同一句话：
  const views = ViewContainerService.getViews(activeContainerId)
  return views.map(view => (
    <SidebarSection key={view.id} title={view.title}>
      <view.render />
    </SidebarSection>
  ))

点 📁 → activeContainerId = "explorer"       → 渲染 1 个 section（FOLDERS）
点 🪢 → activeContainerId = "serial-monitor" → 渲染 2 个 section（会话 + 收发设置）
点 🛒 → activeContainerId = "marketplace"    → 渲染 4 个 section（已安装/内置/已禁用/待安装）
```

**SidePanel 不知道 FOLDERS 是什么、不知道"串口监视器会话"是什么、不知道"已安装"是什么。** 它只做一件事——查表 + 循环渲染。谁注册了什么就渲染什么。

### 2.2 图标和 container 的关系

`plugin.json` 声明哪个插件"拥有"哪个容器：

```json
// file-tree/plugin.json
{
  "contributes": {
    "viewsContainers": {
      "explorer": { "title": "资源管理器" }
    },
    "views": {
      "explorer": [
        { "id": "folders", "title": "", "render": "src/views/FoldersView.tsx" }
      ]
    }
  }
}
```

`viewsContainers` 声明了"点我的图标 → 切换到 explorer 容器"。
`views` 声明了"在 explorer 容器里显示一个叫 folders 的 view"。

**关键：`viewsContainers` 和 `views` 是独立的。** file-tree 声明了 explorer 容器，但任何插件都可以往 explorer 注册 view——语言插件注册 OUTLINE、Git 注册 TIMELINE。容器的主人只管"切到这里"，不管"谁往这里放东西"。

### 2.3 和旧系统的对比

| | 旧（sidebar 字段） | 新（ViewContainerService） |
|---|---|---|
| 注册方式 | plugin.json `sidebar: "src/sidebar.tsx"` + loader glob | plugin.json `contributes.views` + `registerView()` |
| SidePanel 渲染 | `getViewPlugin(id).sidebarComponent` → 渲染整个组件 | `getViews(id).map(v => <SidebarSection><v.render /></SidebarSection>)` |
| 可扩展 | ❌ 侧栏内部是死代码 | ✅ 任何插件 `registerView("explorer", ...)` |
| 卸载清理 | viewRegistry.unregisterViewPlugin → sidebarComponent 丢失 | ViewContainerService.unregisterAll(pluginId) → 该插件的 view 从所有容器移除 |
| 每个插件侧栏结构 | 千奇百怪——各自画各自的 JSX | 统一——都是 Section 列表 |

---

## 三、涉及文件

| 层级 | 文件 | 改动性质 |
|------|------|----------|
| 核心 | 新 `src/core/ViewContainerService.ts` | 新桌子——约 50 行 |
| 核心 | `public/schemas/plugin.schema.json` | 加 viewsContainers + views 贡献点——约 25 行 |
| 核心 | `src/core/types.ts` | PluginManifest 加 contributes.viewsContainers/views 类型——约 15 行 |
| 壳 | `src/components/SidePanel.tsx` | 重写渲染逻辑——原 100 行，约 45 行改动 |
| 壳 | `src/App.tsx` | sidebarView 从 pluginId → containerId——约 20 行 |
| 加载器 | `src/pluginLoader/loader.ts` | parseContributions 中解析 views——约 25 行 |
| 加载器 | `src/pluginLoader/viewRegistry.ts` | 标记 sidebarComponent 废弃——约 5 行 |
| 插件 | `plugins/builtin/file-tree/plugin.json` | 声明 viewsContainers + views——约 15 行 |
| 插件 | `plugins/builtin/file-tree/src/sidebar.tsx` | 重构为 FoldersView 组件 |
| 插件 | `plugins/builtin/marketplace/plugin.json` | 同上——约 20 行 |
| 插件 | `plugins/builtin/marketplace/src/sidebar.tsx` | 拆为 4 个独立 view 组件 |
| 插件 | `plugins/user/serial-monitor/plugin.json` | 同上——约 12 行 |
| 插件 | `plugins/user/serial-monitor/src/sidebar.tsx` | 拆为 2 个独立 view 组件 |

### 3.1 不受影响的文件

- `IconBar.tsx`——零改动。仍然传 pluginId 给 `handleIconClick`，App 内部 resolve 出 containerId
- `SidebarSection.tsx`——加 4 个 prop（titleDescription/titleTooltip/showActions/headerHidden），~27 行 CSS+TSX 扩展
- `PluginStateService`——零改动。container 切换是纯 UI 状态，不需要持久化
- `WorkspaceService` / `CommandRegistry` / `KeybindingRegistry` / `ConfigurationService`——零改动

---

## 四、完工标准

- 点 📁 → 侧栏渲染 FOLDERS section（外观不变）
- 点 🪢 → 侧栏渲染"会话"+"收发设置"两个 section（外观不变）
- 点 🛒 → 侧栏渲染四个 section（外观不变）
- 写一个测试插件，`registerView("explorer", { id: "test", render: TestView })`→ Explorer 侧栏多出 TEST section
- 卸载上述测试插件→ TEST section 消失，FOLDERS section 不受影响
- 卸载 file-tree → explorer 容器为空，侧栏显示空状态，不报错
- E4V#7-#11（ViewContainer）在 E3.6 基础上零额外工作——已经就绪

---

## 文档导航

| 文档 | 内容 |
|:--|------|
| `05-执行清单.md` | **🔥 唯一真相源。** 4 轮 50 任务，进度追踪 |
| `06-UI-UX审查.md` | 🆕 **设计系统对照。** Dark Mode (OLED) 审查——5 P0 + 3 P1 问题，8 项已融入执行清单 |
| `01-核心桌子/ViewContainerService.md` | E36#1–#2：Service 类 v2 完整 API |
| `02-壳层改造/SidePanel改造.md` | E36#3：SidePanel 渲染循环重写 |
| `02-壳层改造/ContainerRole-容器角色重构.md` | 🆕🔥 E36#TB-ROLE：`title=""` hack → 显式 `role` 字段，消灭分支 + 状态泄漏 |
| `02-壳层改造/App+IconBar改造.md` | E36#4：containerId 语义 + 点击→渲染完整链路 |
| `02-壳层改造/Loader+类型改造.md` | E36#5：types + loader parseContributions |
| `03-插件迁移/file-tree.md` | E36#6：file-tree 迁移方案 |
| `03-插件迁移/file-tree-toolbar-演进路线.md` | 🆕 **工具栏 + sticky scroll 三阶段演进路线**——E3.6 暂态→E4 永久→未来粘顶 |
| `03-插件迁移/marketplace.md` | E36#7：marketplace 迁移方案 |
| `03-插件迁移/serial-monitor.md` | E36#8：serial-monitor 迁移方案（460行拆分） |
| `04-清理/废弃sidebarComponent.md` | E36#10：删除旧系统 |
| `05-快通道备选/README.md` | 已废弃——采用全拆方案 |

---

## 对标 VS Code 侧栏细节——完整覆盖

| # | VS Code 细节 | LinkDesk | 阶段 |
|:--|------|------|:--:|
| 1 | View header title | `ViewDescriptor.title` | E3.6 ✅ |
| 2 | View header actions | `ViewDescriptor.actions` | E3.6 ✅ |
| 3 | View header titleDescription | `ViewDescriptor.titleDescription` | E3.6 ✅ |
| 4 | View header titleTooltip | `ViewDescriptor.titleTooltip` | E3.6 ✅ |
| 5 | View header showActions | `ViewDescriptor.showActions` | E3.6 ✅ |
| 6 | mergeViewWithContainerWhenSingleView | `ViewContainerDescriptor.mergeHeaderWhenSingle` | E3.6 ✅ |
| 7 | singleViewPaneContainerTitle | `ViewDescriptor.singleViewPaneContainerTitle` | E3.6 ✅ |
| 8 | View collapsed | `ViewDescriptor.collapsed` | E3.6 ✅ |
| 9 | View canToggleVisibility | `ViewDescriptor.canToggleVisibility` | E3.6 ✅ |
| 10 | View canMoveView | `ViewDescriptor.canMoveView` | E3.6 ✅ |
| 11 | View when context key | `ViewDescriptor.when` | E3.6 ✅ |
| 12 | View hideByDefault | `ViewDescriptor.hideByDefault` | E3.6 ✅ |
| 13 | View order | `ViewDescriptor.order` | E3.6 ✅ |
| 14 | Sticky scroll (父目录粘顶) | FileTree sticky ancestors | E4 ✅ |
| 15 | `...` 更多操作溢出菜单 | View header toolbar overflow | E4 ✅ |
| 16 | View welcome content | `registerViewWelcomeContent` | E4 ✅ |
| 17 | Pane resize (view 间拖拽) | SidebarSection sash | E4 ✅ |
| 18 | 折叠状态持久化 | PluginStateService | E4 ✅ |
| 19 | View 拖放排序 | View reorder | E4 ✅ |
| 20 | View 拖到其他容器 | View move | E4 ✅ |
| 21 | View 右键菜单 | `MenuId.ViewTitleContext` | E4 ✅ |
| 22 | Views 子菜单（显隐 view） | `MenuId.ViewsSubmenu` | E4 ✅ |

**全覆盖——15 个字段在 E3.6 数据结构中就绪，7 个行为在 E4 实现。**

---

> **← 上一 Phase：** `../E3_多WebView与壳收尾_暂定/`
> **→ 下一 Phase：** `../E4_文件树与编辑器_暂定/`
