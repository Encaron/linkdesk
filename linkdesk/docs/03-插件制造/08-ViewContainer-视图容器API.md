# 08 — ViewContainer 视图容器 API

> 2026-07-30。**插件如何注册侧栏视图。** 对标 VS Code `contributes.viewsContainers` + `contributes.views`。
> E3.6 新增。所有有侧栏的插件（file-tree/marketplace/serial-monitor）都迁移到此 API。

---

## 一、概念

```
┌─────────────────────────────┐
│ 侧栏 (SidePanel)             │
│ ┌─────────────────────────┐ │
│ │ 资源管理器        [◀折叠] │ │ ← 容器 header（ViewContainer.title）
│ ├─────────────────────────┤ │
│ │ ▶ FOLDERS               │ │ ← view（SidebarSection——可独立折叠）
│ │    src/                  │ │
│ │    docs/                 │ │
│ │                          │ │
│ │ ▶ OUTLINE  (语言插件)    │ │ ← 另一个插件注册的 view——文件树不知道它的存在
│ │    functionA()           │ │
│ │    classB                │ │
│ │                          │ │
│ │ ▶ TIMELINE (Git 插件)    │ │ ← 又一个插件注册的 view
│ │    M  modified.ts        │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

- **ViewContainer** = 侧栏的一个"频道"。点图标栏切换。如 `explorer` / `marketplace` / `serial-monitor`。
- **View** = 容器里的一个可折叠 section。如 `folders` / `sessions` / `settings`。
- **任何插件** 都可以调用 `registerView("explorer", ...)` 往别人的容器里注册 view。容器的主人不知道、不关心。

---

## 二、声明式注册——plugin.json

**适合：** view 的内容是静态的、不需要运行时动态变化。

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
          "collapsed": false
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
| `location` | ❌ | `"sidebar"` \| `"panel"` \| `"auxiliarybar"` | 容器位置。默认 `"sidebar"` |
| `hideIfEmpty` | ❌ | boolean | 无活跃 view 时自动隐藏。默认 `false` |
| `order` | ❌ | number | 同位置容器排序。小值靠前 |
| `icon` | ❌ | string | 容器图标——覆盖插件自身图标 |

### views 字段

| 字段 | 必需 | 类型 | 说明 |
|------|:--:|------|------|
| `id` | ✅ | string | View 唯一 ID。命名建议：`<功能名>` 如 `folders` / `sessions` |
| `render` | ✅ | string | 组件模块路径。相对于插件目录。如 `"src/views/FoldersView.tsx"` |
| `title` | ❌ | string | SidebarSection 折叠头标题。空字符串 = 无折叠头，直接渲染内容 |
| `order` | ❌ | number | 容器内排序。小值在上 |
| `collapsed` | ❌ | boolean | 初始折叠。默认 `false` |
| `when` | ❌ | string | Context key 条件——满足时才显示此 view。如 `"explorerFocus"` |
| `canToggleVisibility` | ❌ | boolean | 用户可在 Views 菜单中切换可见性（未来功能） |
| `canMoveView` | ❌ | boolean | 用户可拖放此 view 到其他容器（未来功能） |
| `hideByDefault` | ❌ | boolean | 默认隐藏——用户需手动从 Views 菜单开启（未来功能） |

---

## 三、命令式注册——activate() 中调用

**适合：** view 的标题需要随运行时状态变化（如串口会话名）。

```typescript
// plugins/my-plugin/src/index.tsx

import { ViewContainerService } from "@src/core/ViewContainerService";

export function activate() {
  // 注册容器（如果 plugin.json 已声明则跳过——幂等）
  ViewContainerService.registerViewContainer("my-plugin", {
    id: "my-container",
    title: "我的插件",
  });

  // 注册 view——标题可动态更新
  ViewContainerService.registerView("my-plugin", "my-container", {
    id: "my-view",
    title: "初始标题",
    render: MyViewComponent,
    order: 0,
  });

  // 稍后更新标题——同一个 pluginId + viewId → 更新而非重复注册
  someEventEmitter.on("change", (newTitle) => {
    ViewContainerService.registerView("my-plugin", "my-container", {
      id: "my-view",
      title: newTitle,  // 只更新标题——render 和 order 可选填
    });
  });
}
```

**规则：** 同一个 `(pluginId, viewId)` 组合多次调用 `registerView` = 更新已有 view。不指定 `render` 时保持原组件不变——只更新 title/order/collapsed 等元数据。

### View header actions——折叠头右侧的操作按钮

`ViewDescriptor.actions?: React.ReactNode`——对标 VS Code view header actions（如 Explorer FOLDERS 标题右侧的 [+][🔄][⊟]）。

```typescript
// 命令式注册——ReactNode 不可序列化到 JSON，无法在 plugin.json 声明
ViewContainerService.registerView("my-plugin", "my-container", {
  id: "my-view",
  title: "我的视图",
  render: MyView,
  actions: (
    <>
      <button onClick={handleRefresh} title="刷新">
        <span className="codicon codicon-refresh" />
      </button>
    </>
  ),
});
```

**⚠️ 限制：** `actions` 中的回调只能访问模块级状态——不能访问 view 组件内部的 useState/useCallback。因为注册时机（`activate()` 或组件 mount 时）的闭包可能过期。需要访问组件内部 state 的按钮 → 留在 view 内容区渲染，或通过 `executeCommand` 间接触发（命令 handler 通过 ref 桥接到组件内部）。

---

## 四、View 组件写法规约

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
  // SidePanel 会自动用 SidebarSection 包裹——不需要自己包
  return <div>内容</div>;
}
```

SidePanel 的渲染循环是：
```tsx
views.map(view => (
  <SidebarSection key={view.id} title={view.title} defaultOpen={!view.collapsed}>
    <view.render />
  </SidebarSection>
))
```

view 组件只负责**内容区域**。折叠/展开/标题由 SidePanel 统一管理。

### title 为空字符串

`"title": ""` → SidebarSection 不渲染折叠头——内容直接显示。适合"唯一的 view，不需要折叠"的场景。如 file-tree 的 `folders` view。

### 工具栏按钮

view 内容顶部可以自由放置工具栏按钮——不是 SidebarSection 的 `actions` prop（那个在折叠头右侧）。内容区域完全自由：

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

## 五、完整示例——Git 插件往 Explorer 注册 TIMELINE

```json
// plugins/user/git/plugin.json
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
// plugins/user/git/src/views/TimelineView.tsx
export default function TimelineView() {
  // ... 读 git log → 渲染列表 ...
  return <div className="git-timeline">...</div>;
}
```

文件树插件零改动。TimelineView 自动出现在 FOLDERS 下面。

---

## 六、生命周期

```
插件加载
  → loader parseContributions → 声明式注册 viewsContainers + views
  → activate() → 命令式注册/更新 views
  → SidePanel 渲染循环 → getActiveViews(containerId).map(...)

插件卸载
  → ViewContainerService.unregisterAll(pluginId)
  → 该插件的全部容器 + 全部 view 移除
  → onDidChangeViews 事件触发
  → SidePanel 重渲染——其他插件的 view 不受影响
```

## 七、何时用声明式、何时用命令式

| 场景 | 方式 |
|------|------|
| view 标题固定不变 | plugin.json 声明式 |
| view 标题随数据变化（如"收发设置 — COM3"） | activate() 命令式——订阅数据变更 → `registerView({ title: 新标题 })` |
| view 数量固定 | plugin.json 声明式 |
| view 数量动态（如 N 个数据源各一个 view） | activate() 命令式——循环 `registerView` |

---

> **← 概览：** `00-README.md`
> **→ 相关：** `01-插件API契约.md` `03-插件contributes规范.md`
