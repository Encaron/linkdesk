# 08 — ViewContainer 视图容器 API

> 2026-07-30 · E5.8 全量更新 2026-08-21。**插件如何注册侧栏/面板视图。** 对标 VS Code `contributes.viewsContainers` + `contributes.views`。
> 所有有侧栏的插件（file-tree/marketplace/serial-monitor）都走此 API。面板视图（`location: "panel"`）同此机制。
> **E6 核 2026-09-06**（E6#58 对账）：塌平单根（无 plugins/{builtin,user}）· 共享控件走 @linkdesk/ui · 分发 = .linkdesk-plugin zip。本页对应机制引用已清。

---

## 一、概念

```
┌──────────────────────────────────────┐
│ 侧栏 (SidebarZone)                    │
│ ┌──────────────────────────────────┐ │
│ │ 资源管理器          [◀折叠][+][🔄] │ │ ← 容器 header（ViewContainer.title）+ titleActions
│ ├──────────────────────────────────┤ │
│ │ ▶ FOLDERS                        │ │ ← view（SidebarSection——可独立折叠）
│ │    src/                          │ │
│ │    docs/                         │ │
│ │                                  │ │
│ │ ▶ OUTLINE  (语言插件)            │ │ ← 另一个插件注册的 view——文件树不知道它的存在
│ │    functionA()                   │ │
│ │                                  │ │
│ │ ▶ TIMELINE (Git 插件)            │ │ ← 又一个插件注册的 view
│ │    M  modified.ts                │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ 底部面板 (PanelZone)   ← location: "panel" 的容器渲染在这里      │
│ ┌─────────┬─────────┐                │
│ │  输出    │ 待办    │  ← 面板标签栏（切换器）+ 活动视图 titleActions │
│ └─────────┴─────────┘                │
└──────────────────────────────────────┘
```

- **ViewContainer** = 侧栏/面板的一个"频道"。点图标栏切换。如 `explorer` / `marketplace` / `serial-monitor` / `panel-demo`。
- **View** = 容器里的一个可折叠 section。如 `folders` / `sessions` / `settings`。
- **任何插件** 都可以往别人的容器里注册 view。容器的主人不知道、不关心。
- **渲染位置由 `location` 决定**：`"sidebar"` → 左侧栏 SidebarZone；`"panel"` → 底部面板 PanelZone（标签栏切换视图）；`"auxiliarybar"` → 右侧辅助侧栏 RightSidebarZone——⚠ **壳当前未接线（E6 拍板不渲染，区域 dormant，见 [E6 清单 #61](../02-Electron架构/E6_插件生态与发布/E6-执行清单.md)）**：声明 auxiliarybar 容器/视图 = 无表面不可见。第三方侧栏/面板需求请用 `"sidebar"`/`"panel"`。所有区都用同一个 `PoolSectionStack` 渲染 view（SidebarSection 自动包裹）。

---

## 二、声明式注册——plugin.json（正路）

**🔥 所有 view 必须在 plugin.json 声明。** `render` 是组件模块路径字符串——loader 加载组件后注册进壳。**`render` 字段是函数/组件，过不了 IPC**——运行时 `registerView`（§四）传的 render 会被池侧白名单剥掉。所以：**组件永远靠 plugin.json 声明，运行时调用只更新元数据。**

```json
{
  "contributes": {
    "viewsContainers": {
      "explorer": {
        "title": "资源管理器",
        "location": "sidebar",
        "hideIfEmpty": false,
        "order": 100
      }
    },
    "views": {
      "explorer": [
        {
          "id": "folders",
          "title": "",
          "render": "src/views/FoldersView.tsx",
          "order": 0,
          "collapsed": false,
          "titleActions": []
        }
      ]
    }
  }
}
```

### viewsContainers 字段

| 字段 | 必需 | 类型 | 说明 |
|------|:--:|------|------|
| `title` | ✅ | string | 侧栏 header 显示的名称。如 "资源管理器" |
| `location` | ❌ | `"sidebar"` \| `"panel"` \| `"auxiliarybar"` | 容器位置。默认 `"sidebar"`（见 §一渲染区） |
| `hideIfEmpty` | ❌ | boolean | 无活跃 view 时自动隐藏。默认 `false` |
| `order` | ❌ | number | 同位置容器排序。小值靠前 |
| `icon` | ❌ | string | 容器图标——覆盖插件自身图标 |
| `mergeHeaderWhenSingle` | ❌ | boolean | 容器内只有一个 view 时，隐藏 view 折叠头——标题合并到容器 header。对标 VS Code `mergeViewWithContainerWhenSingleView`（`panel-demo` 侧栏容器即用此模式） |

### views 字段（全表）

| 字段 | 必需 | 类型 | 说明 |
|------|:--:|------|------|
| `id` | ✅ | string | View 唯一 ID。命名建议：`<功能名>` 如 `folders` / `sessions` |
| `render` | ✅ | string | 组件模块路径。**相对于插件目录**。如 `"src/views/FoldersView.tsx"` |
| `title` | ❌ | string | SidebarSection 折叠头标题。空字符串 = 无折叠头，直接渲染内容 |
| `role` | ❌ | `"toolbar"` \| `"section"` | 容器角色。默认 `"section"`（有折叠头）；`"toolbar"` = 粘顶、不被 section 覆盖。替代 title 空串 hack |
| `order` | ❌ | number | 容器内排序。小值在上 |
| `collapsed` | ❌ | boolean | 初始折叠。默认 `false` |
| `when` | ❌ | string | Context key 条件——满足时才显示此 view。如 `"explorerFocus"` |
| `canToggleVisibility` | ❌ | boolean | ✅ 已实现——用户可在面板切换器/侧栏「视图」子菜单切换可见性（E5.8#34） |
| `canMoveView` | ❌ | boolean | ✅ 已实现——用户可拖放此 view 到其他容器（E4V#48） |
| `hideByDefault` | ❌ | boolean | ✅ 已实现——默认隐藏，用户需手动从视图菜单开启 |
| `titleDescription` | ❌ | string | 标题旁的副文字。对标 VS Code `ViewPane.titleDescription` |
| `singleViewPaneContainerTitle` | ❌ | string | 单 view 且 `mergeHeaderWhenSingle` 时，容器 header 显示此标题替代容器 title |
| `minHeight` | ❌ | number | 拖拽 resize 最小高度（px）。不声明默认 100 |
| `showActions` | ❌ | `"always"` \| `"whenExpanded"` \| `"default"` | 控制动作区显隐时机。对标 VS Code `ViewPaneShowActions` |
| `titleTooltip` | ❌ | string | 标题 hover tooltip——标题截断时显示完整文字 |
| `badge` | ❌ | string \| number | 标题右侧标记——数字/短文字（如已安装数量 "15"） |
| `titleActions` | ❌ | `TitleActionWidget[]` | **视图动作区声明制**——见 §三 |

---

## 三、titleActions 声明制——视图 header 右侧的动作区（E5.8#36.5/36.6）

**对标 VS Code 视图 header 右侧的 `[+][🔄][⊟]` / 终端 `[+][▾]`。** 声明在 `contributes.views[].titleActions`，壳统一渲染器 `ViewTitleActions.tsx` 消费——**随视图走、随视图迁移**（视图在面板/侧栏之间移动，动作区跟着走）。

### 三 widget 形态

| 类型 | 形态 | 点击行为 |
|------|------|------|
| `icon` | 单图标按钮 | 执行 `command` |
| `dropdown` | 纯下拉（chevron） | 展开 `items` 列表，点条目执行对应 `command` |
| `split` | 主按钮 + 下拉复合 | 主按钮执行 `command`（默认动作），右侧 chevron 展开 `items` 备选 |

**widget 字段：** `id`（唯一）、`command`（点击执行的命令 ID）、`args`（可选——`executeCommand(command, args)` 单个位置参数透传）、`icon`（codicon 类名，如 `"codicon-add"`）、`title`（tooltip/aria-label/无 icon 时的文本）、`items`（dropdown/split 的备选条目 `{ label, command, args }`）。

### 真实示例——panel-demo（官方验证插件）

```json
{
  "id": "demo-output",
  "title": "输出",
  "render": "src/views/DemoOutputView.tsx",
  "order": 0,
  "titleActions": [
    {
      "type": "split",
      "id": "add-log",
      "command": "panel-demo.addLog",
      "icon": "codicon-add",
      "title": "添加演示日志",
      "args": { "level": "info", "text": "主按钮——添加信息日志" },
      "items": [
        { "label": "添加信息", "command": "panel-demo.addLog", "args": { "level": "info" } },
        { "label": "添加警告", "command": "panel-demo.addLog", "args": { "level": "warn" } },
        { "label": "添加错误", "command": "panel-demo.addLog", "args": { "level": "error" } }
      ]
    },
    {
      "type": "icon",
      "id": "clear-log",
      "command": "panel-demo.clearLog",
      "icon": "codicon-clear-all",
      "title": "清空输出"
    }
  ]
}
```

### titleActions 命令的注册

`titleActions` 声明的 `command` 执行真相源 = **池侧命令注册表**（`executeCommand` 池侧优先、壳 IPC fallback）。命令 handler 在 view 组件里注册：

```tsx
// DemoOutputView.tsx（panel-demo 真实写法）
useEffect(() => {
  const api = window.linkdesk?.commands;
  api?.registerCommand?.(
    "panel-demo.addLog",
    (args?: { level?: LogLevel; text?: string }) => {
      addLine(args?.level ?? "info", args?.text ?? "");
    },
    // 池侧 registerCommand 注册——when 交给声明制；when:"false" = 纯程序化命令不进命令面板（titleActions 专属）
  );
  api?.registerCommand?.("panel-demo.clearLog", () => clearLines());
}, []);
```

> **`when: "false"` = 纯程序化命令不进命令面板**——titleActions 专属命令都这样声明，防止在 Ctrl+Shift+P 里刷屏。

### 渲染位置（一个渲染器，两处消费）

- **面板容器（PanelZone）**：标签栏右侧动作区——按**活动视图**的 titleActions 渲染（`PanelZone.tsx`）
- **侧栏容器（SidebarZone/RightSidebarZone）**：section 折叠头右侧——每视图各渲染各的（`PoolSectionStack` 注入 SidebarSection actions 槽）；`mergeHeaderWhenSingle` 单视图时容器 header 即视图 header，同样消费

**零声明（`titleActions: []`）→ 渲染 null（右侧空白，现状保持）。** widget 是通用件不是给终端造的——谁声明谁用（插件独立铁律：第三方声明即用，零壳改动）。

---

## 四、运行时更新与查询——`window.linkdesk.viewContainer`

**声明式（§二）管"有什么 view"；运行时 API 管"元数据更新 + 查询"。** 视图的元数据真相源在壳 `ViewContainerService`（池通过真 IPC 访问）。

```typescript
// 查询——返回 DTO（可序列化公开字段，render/actions 已剥）
const views = await window.linkdesk.viewContainer.getViews("explorer");      // ViewDto[]
const view = await window.linkdesk.viewContainer.getView("folders");          // ViewDto | undefined
const container = await window.linkdesk.viewContainer.getViewContainer("explorer");

// 更新元数据——标题随数据变化（对标 VS Code registerViews 更新）
// 同一 (pluginId, viewId) 重复调用 = 更新已有，render 保留（render 过不了 IPC，池侧白名单剥掉）
await window.linkdesk.viewContainer.registerView("file-tree", "explorer", {
  id: "folders",
  title: newFolderName,   // 只更新标题——其他字段可选
  minHeight: 180,
});
```

**规则：**
- 同一个 `(pluginId, viewId)` 组合多次调用 `registerView` = **更新已有 view**。不指定某字段则保留原值。
- **`render` 是函数——过不了 IPC**（invoke 结构化克隆抛 `DataCloneError`，池侧白名单 `toViewMetaDto` 剥掉）。**永远不要靠运行时注册传组件**——组件必须 plugin.json 声明（§二），运行时只更新元数据。
- 查询不存在的容器/视图 → `undefined` / `[]`。

### 视图变更广播

壳注册表变化会 `events.emit("viewContainer:changed", { containerId, views: DTO[] })`——插件可订阅（marketplace 用它在视图注册后刷新 UI）：

```typescript
const unsub = window.linkdesk.events.on<{ containerId: string }>(
  "viewContainer:changed",
  ({ containerId }) => { refresh(containerId); }
);
```

### 壳侧写操作 API（插件不直接调——跨插件交互走 UI/桥）

以下方法在壳 `ViewContainerService`（`src/core/services/layout/ViewContainerService.ts`）——插件侧**禁止 import 该模块**（ESLint `noCoreImportInPlugin` error 级，见 `01 §五`）。显隐/迁移/排序的**用户操作**由池侧 UI 经 IPC 桥自动落到壳：

| 壳方法 | 语义 | 插件怎么触发 |
|--------|------|------|
| `setVisible(containerId, viewId, visible)` / `isVisible` / `toggleViewVisibility` | 视图显隐（+ 持久化） | 面板切换器勾选 `panel:toggleViewVisibility` 桥 |
| `moveView(viewId, from, to, newIndex?)` | 跨容器迁移 | 拖放（`viewDragProtocol` MIME） |
| `reorderView(containerId, viewId, newIndex)` | 容器内重排（+ 持久化） | 拖 header 排序 |
| `registerViewEmptyContent(containerId, viewId, content, when?)` | View 空状态占位（无数据时显示） | — |

> 插件想"程序化"显隐/迁移 = 走 `executeCommand`（壳/插件注册的命令 handler 内调壳侧服务），或 `panel.reveal`（见 §五）。

---

## 五、面板视图——`location: "panel"` + `panel.reveal`

面板容器（`location: "panel"`）渲染在底部 PanelZone，标签栏切换视图。**聚焦底部面板视图 = `window.linkdesk.panel.reveal(viewId)`**（对标 VS Code 视图提升语义，E5.8#34.5）：

```typescript
await window.linkdesk.panel.reveal("demo-output");  // 聚焦底部面板的 demo-output 视图
```

- 面板隐藏 → 展开并切到该视图（Ctrl+J 同机制）
- 面板已显示 → 切换聚焦
- `viewId` 不在 panel 容器 → **no-op**（不报错）

**完整面板容器示例——panel-demo：**

```json
{
  "contributes": {
    "viewsContainers": {
      "panel-demo": { "title": "面板演示", "location": "panel" },
      "panel-demo-sidebar": { "title": "面板演示", "location": "sidebar" }
    },
    "views": {
      "panel-demo": [
        { "id": "demo-output", "title": "输出", "render": "src/views/DemoOutputView.tsx", "order": 0, "titleActions": [/* §三 */] },
        { "id": "demo-todo", "title": "待办", "render": "src/views/DemoTodoView.tsx", "order": 1 }
      ],
      "panel-demo-sidebar": [
        { "id": "demo-sidebar", "title": "侧栏演示", "render": "src/views/DemoSidebarView.tsx", "order": 0, "titleActions": [/* §三 */] }
      ]
    }
  }
}
```

> 同一个插件可以同时声明 panel 容器 + sidebar 容器（各归各的 zone）。**已移除 `panel.moveToEditor`**（#36.10）——zone 位置移动是布局命令的事。

---

## 六、View 组件写法规约

### 组件签名

```typescript
// src/views/MyView.tsx
export default function MyView() {
  // 标准 React 组件——和写普通组件完全一样
  return <div>...</div>;
}
```

### 不要自己包 SidebarSection

**❌ 错误：**
```tsx
export default function MyView() {
  return (
    <SidebarSection title="我的视图">
      <div>内容</div>
    </SidebarSection>
  );
}
```

**✅ 正确：**
```tsx
export default function MyView() {
  // PoolSectionStack 会自动用 SidebarSection 包裹——不需要自己包
  return <div>内容</div>;
}
```

渲染循环（壳 `usePoolSync` → 池 `PoolSectionStack`）：
```tsx
views.map(view => (
  <SidebarSection key={view.id} title={view.title} defaultOpen={!view.collapsed}>
    <PluginComponent renderPath={view._renderPath} />
  </SidebarSection>
))
```

view 组件只负责**内容区域**。折叠/展开/标题由 SidebarSection 统一管理。

### title 为空字符串

`"title": ""` → SidebarSection 不渲染折叠头——内容直接显示。适合"唯一的 view，不需要折叠"的场景。如 file-tree 的 `folders` view。多 section 场景用 `role` 而非 title hack。

### 工具栏按钮

view 内容顶部可以自由放置工具栏按钮——不是 SidebarSection 的 header actions（那个走 titleActions 声明制，§三）。内容区域完全自由：

```tsx
export default function MyView() {
  return (
    <>
      <div className="my-toolbar">
        <button onClick={...}>+ 新建</button>
      </div>
      <div className="my-content">...</div>
    </>
  );
}
```

---

## 七、完整示例——Git 插件往 Explorer 注册 TIMELINE

```json
// git/plugin.json
{
  "contributes": {
    "views": {
      "explorer": [
        {
          "id": "timeline",
          "title": "TIMELINE",
          "render": "src/views/TimelineView.tsx",
          "order": 100,
          "when": "gitOpen"
        }
      ]
    }
  }
}
```

```typescript
// git/src/views/TimelineView.tsx
export default function TimelineView() {
  // ... 读 git log → 渲染列表 ...
  return <div className="git-timeline">...</div>;
}
```

文件树插件零改动。TimelineView 自动出现在 FOLDERS 下面。

---

## 八、生命周期

```
插件加载
  → loader parseContributions → 声明式注册 viewsContainers + views（加载 render 组件）
  → 组件 mount → 运行时 registerView 更新元数据（标题/排序/minHeight）
  → 壳 usePoolSync → 池 PoolSectionStack 渲染 getActiveViews(containerId)

插件卸载
  → ViewContainerService.unregisterAll(pluginId)（可逆注册 tracker 逆序回滚）
  → 该插件的全部容器 + 全部 view 移除
  → events.emit("viewContainer:changed") 广播
  → 池重渲染——其他插件的 view 不受影响
```

## 九、何时用声明式、何时用运行时

| 场景 | 方式 |
|------|------|
| view 标题固定不变 | plugin.json 声明式（§二） |
| view 标题随数据变化（如"收发设置 — COM3"） | plugin.json 声明 + 运行时 `registerView({ title: 新标题 })` 更新元数据（§四） |
| view 数量固定 | plugin.json 声明式 |
| view 需要动作区（header 右侧按钮/下拉） | plugin.json `titleActions` 声明制（§三） |
| 需要聚焦底部面板视图 | `window.linkdesk.panel.reveal(viewId)`（§五） |

---

> **← 概览：** `00-README.md`
> **→ 相关：** `01-插件API契约.md` `03-插件contributes规范.md` `07-插件间通信.md`
