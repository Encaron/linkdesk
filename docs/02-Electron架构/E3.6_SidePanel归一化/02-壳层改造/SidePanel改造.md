# SidePanel 重写——渲染循环替代 sidebarComponent

> 对应任务：E36#3。**对标 VS Code ViewPaneContainer——侧栏是容器，不是插件。**

---

## 改之前（当前代码 L48-61）

```typescript
const renderSidebarContent = () => {
  if (!effectivePluginId) return null;
  const plugin = getViewPlugin(effectivePluginId);
  if (plugin?.sidebarComponent) {
    const SidebarComponent = plugin.sidebarComponent;
    return (
      <ErrorBoundary pluginId={effectivePluginId}>
        <SidebarComponent />
      </ErrorBoundary>
    );
  }
  return <div className="side-panel-placeholder">{t("无设置项")}</div>;
};

const title = effectivePluginId
  ? getViewPlugin(effectivePluginId)?.manifest.name ?? effectivePluginId
  : "";
```

**问题：** 一次只能渲染一个插件的整个 sidebar.tsx。sidebar.tsx 内部是封闭盒子——其他插件无法往里注册内容。

---

## 改之后

```typescript
import { ViewContainerService } from "../core/ViewContainerService";

const effectiveContainerId = sidebarView ?? lastSidebar;
// 去掉了 activePluginId fallback——侧栏不再跟标签页关联

const renderSidebarContent = () => {
  if (!effectiveContainerId) return null;

  const views = ViewContainerService.getActiveViews(effectiveContainerId);

  if (views.length === 0) {
    return <div className="side-panel-placeholder">{t("无已注册视图")}</div>;
  }

  // 🔥 mergeHeaderWhenSingle：容器只有一个 view 时隐藏 view header
  const singleView = views.length === 1 && container?.mergeHeaderWhenSingle;

  return views.map(view => (
    <ErrorBoundary key={view.id} pluginId={view.id}>
      <SidebarSection
        title={singleView ? (view.singleViewPaneContainerTitle ?? "") : view.title}
        titleDescription={view.titleDescription}
        titleTooltip={view.titleTooltip}
        defaultOpen={!view.collapsed}
        actions={view.actions}
        showActions={view.showActions ?? 'default'}
        headerHidden={singleView}
      >
        <view.render />
      </SidebarSection>
    </ErrorBoundary>
  ));

  // 🔥 singleView 时——容器 header 标题用 view.singleViewPaneContainerTitle 替代 container.title
  const headerTitle = singleView
    ? views[0]?.singleViewPaneContainerTitle ?? container?.title
    : container?.title;
};

// Header title 从容器桌子取
const container = effectiveContainerId
  ? ViewContainerService.getViewContainer(effectiveContainerId)
  : null;
const title = container?.title ?? "";
```

---

## 关键变化

| | 旧 | 新 |
|------|------|------|
| 数据源 | `getViewPlugin(id).sidebarComponent` | `getActiveViews(containerId)` |
| 渲染方式 | 单组件 `<SidebarComponent />` | 循环 `views.map(v => <SidebarSection><v.render /></SidebarSection>)` |
| Header title | `plugin.manifest.name` | `container.title` |
| 切换语义 | 切到"谁的整个 sidebar" | 切到"哪个容器——渲染该容器所有注册的 view" |
| 可扩展 | ❌ 封闭盒子 | ✅ 任何插件 `registerView("explorer", ...)` |

---

## 三种状态

| 条件 | header title | 内容区 |
|------|:--:|------|
| 容器存在 + 有活跃 views | `container.title` | 循环渲染 `<SidebarSection>` |
| 容器存在 + views 为空 | `container.title` | "无已注册视图" 占位 |
| 容器不存在（sidebarView 指向无效 containerId）| 空字符串 | 不应出现——E36#4 保证不进入此状态 |
| sidebarView = null | 无 | 不渲染（`return null`） |

---

## 🔥 Bug 防线

### 防线 1：闭态副作用（Bug 风险 4）

**问题：** SidePanel `sidebarView === null` → `return null` → 但 `onDidChangeActiveViews` 订阅仍在 → 事件触发 → 尝试 `getActiveViews(null)`。

**修复：**
```typescript
useEffect(() => {
  // 🔥 active guard——不活跃时不处理事件
  if (!effectiveContainerId) return;

  const sub = ViewContainerService.onDidChangeActiveViews.event(({ containerId }) => {
    // 🔥 只处理当前容器
    if (containerId !== effectiveContainerId) return;
    forceUpdate();
  });

  // 🔥 cleanup——StrictMode remount 时旧订阅被清理
  return () => sub.dispose();
}, [effectiveContainerId]);  // effectiveContainerId 在依赖数组里
```

**ESRint 已覆盖：** `no-effect-callback-without-active-guard`（#59c Bug 2 教训）

### 防线 2：StrictMode 双重订阅（Bug 风险 3）

**问题：** React StrictMode 下组件 mount → unmount → remount。第一次 mount 的订阅如果不清理，remount 后会多一个订阅 → 事件回调执行两次。

**修复：** `return () => sub.dispose()` ——首次 unmount 时清理旧订阅。remount 时创建新订阅。始终只有一个活跃订阅。

### 防线 3：空容器不抛错

```typescript
const views = ViewContainerService.getActiveViews(effectiveContainerId);
// getActiveViews 内部处理空容器——返回 []，不抛错
```

---

## SidePanel 分层结构

```
┌──────────────────────────────┐
│ 资源管理器            [◀折叠] │  ← header——SidePanel 自己画。title = container.title
├──────────────────────────────┤
│ ▶ FOLDERS                    │  ← SidebarSection——SidePanel 循环渲染。title = view.title
│   src/                       │  ← view.render() 渲染的内容
│   docs/                      │
│                              │
│ ▶ OUTLINE   (语言插件注册)    │  ← 另一个 SidebarSection——另一个插件的 view
│   functionA()                │
│                              │
│ ▶ TIMELINE  (Git 插件注册)   │  ← 又一个
│   M modified.ts              │
└──────────────────────────────┘
```

---

## 不受影响的

- 折叠/展开按钮——逻辑不变
- `lastSidebar` sticky——逻辑不变
- `SidebarSection` 组件——需扩展 4 个 prop（见下），内部渲染逻辑改动 ~15 行
- 拖拽调整侧栏宽度——零改动

### SidebarSection 扩展（E3.6 改动——"零改动"需修正）

当前 `SidebarSectionProps`：`title` / `collapsible` / `defaultOpen` / `badge` / `actions` / `children`

需新增 4 个 prop，对齐 VS Code `ViewPane`：

```typescript
export interface SidebarSectionProps {
  // ... 现有字段不变 ...

  /** 标题旁的副文字——如 "(5 files)"。对标 VS Code ViewPane.titleDescription */
  titleDescription?: string;
  /** 标题 hover tooltip——标题截断时显示完整文字。对标 VS Code titleContainerHover */
  titleTooltip?: string;
  /** 控制 actions 显隐——对标 VS Code ViewPaneShowActions */
  showActions?: 'always' | 'whenExpanded' | 'default';
  /** 隐藏 header 行——容器 mergeHeaderWhenSingle 且只有一个 view 时 */
  headerHidden?: boolean;
}
```

**渲染改动：**
```tsx
// headerHidden → 不渲染 header
{!headerHidden && (
  <div className={`sidebar-section-header${showActions === 'default' ? ' show-actions-on-hover' : ''}`}
       onClick={toggle} ...>
    {/* titleTooltip */}
    <span className="sidebar-section-title" title={titleTooltip ?? title}>{title}</span>
    {/* titleDescription */}
    {titleDescription && <span className="sidebar-section-title-desc">{titleDescription}</span>}
    {/* actions —— showActions='default' 时 CSS 控制 hover 显隐 */}
    {actions && <span className="sidebar-section-actions" onClick={e => e.stopPropagation()}>{actions}</span>}
  </div>
)}
```

**CSS 新增：**
```css
/* titleDescription */
.sidebar-section-title-desc {
  opacity: 0.7;
  font-weight: 400;
  text-transform: none;
  margin-left: 4px;
}

/* showActions='default' —— 默认隐藏，hover 才显示。对标 VS Code。220px 侧栏窄——省空间 */
/* 🔥 问题 3：不能用 opacity:0——按钮仍然可点击。用 visibility + pointer-events 确保隐藏时不可交互 */
.sidebar-section-header .sidebar-section-actions {
  visibility: hidden;
  pointer-events: none;
  transition: visibility 0.15s ease;
}
.sidebar-section-header:hover .sidebar-section-actions,
.sidebar-section-header.show-actions-always .sidebar-section-actions,
.sidebar-section-header:focus-within .sidebar-section-actions {
  visibility: visible;
  pointer-events: auto;
}
```

**改动：** `SidebarSection.tsx` ~15 行 + `SidebarSection.css` ~12 行

---

## 文件

**文件：** `src/components/SidePanel.tsx`（当前 100 行）  
**改动：** ~55 行（删 ~35 + 写 ~55，净增 ~20）

---

## 验证

- [ ] `sidebarView` = null → 侧栏不渲染
- [ ] `sidebarView` = 有效 containerId → 渲染该容器所有活跃 view
- [ ] 切换标签页 → 侧栏不关闭（`lastSidebar` sticky）
- [ ] 折叠/展开动画正常
- [ ] StrictMode 下 mount-unmount-remount → 无双重订阅、无漏订阅
