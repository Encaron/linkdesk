# MainPool 设计

> 📖 架构全景：[01-Pool模型设计.md](../01-Pool模型设计.md)
> 📖 执行清单：[E5.6#14-#17](../E5.6-执行清单.md)——Phase 4：MainPool 迁移
> 📖 内部解耦：[MainPool内部解耦-Pool与Zone.md](./MainPool内部解耦-Pool与Zone.md)——Pool vs Zone 决策规则 + 目录树 + zone 分解

---

## 1. 概述

MainPool = **主区标签页内容的 WebContentsView**。`pool.html?zone=main` → `<MainRenderer>`。

**只渲染内容区域——不渲染 TabBar。** TabBar 在壳 DOM 里（35px 高），覆盖在 MainPool 上方。MainPool 顶部留 `tabBarH` 空白。

| 属性 | 值 |
|:--|:--|
| 位置 | LayoutEngine zone `main`, `edge: "center"`, `flex: 1` |
| Bounds | `{ x: 42 + sidebarW, y: 30 + tabBarH, w: mainW, h: contentH - tabBarH }` |
| URL | `pool.html?zone=main` |
| Renderer | `MainRenderer` |
| 进程 | 独立——崩了不影响壳/SidebarPool/OverlayWindow |

---

## 2. MainRenderer 组件

```tsx
// pool-main.tsx → RENDERERS['main']
function MainRenderer({ layout }: { layout: PoolLayout }) {
  return (
    <main style={{ display: 'flex', width: '100%', height: '100%' }}>
      {layout.groups?.map(group => (
        <div
          key={group.id}
          style={{ flex: group.flex, display: 'flex', flexDirection: 'column' }}
        >
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

### 2.1 组件职责

| 组件 | 职责 |
|:--|:--|
| `MainRenderer` | 读 `layout.groups[]`，渲染分屏 flex 布局 |
| `TabContent` | `display: none/block` 切换——keep-alive |
| `PluginErrorBoundary` | 单个 tab 崩溃 → 显示 "插件崩溃" 覆盖层，**不影响同 Pool 其他 tab** |
| `PluginComponent` | 动态 import 插件入口组件 |

### 2.2 分屏

分屏在 MainPool **内部**用 CSS flex 实现：

```
┌────────────────────────────────────┐
│ group-1 (flex: 1)  │ group-2 (flex: 2) │
│ ┌────────────────┐ │ ┌──────────────┐ │
│ │ editor main.c  │ │ │ editor main.h│ │
│ │                │ │ │              │ │
│ └────────────────┘ │ └──────────────┘ │
│                     │ ┌──────────────┐ │
│                     │ │ serial COM3  │ │
│                     │ └──────────────┘ │
└────────────────────────────────────┘
```

- 每个 `group` = 一个 `flex` 列。`layout.groups[]` 的 `flex` 值控制比例
- 每个 `group` 内所有 tab 平级渲染，`display: none/block` 切换
- 分屏组之间分隔线 → OverlayWindow 渲染（同 SidebarPool↔MainPool 分隔线模式）
- 最多 4 层分屏深度（`MAX_TREE_DEPTH = 4`——和 E4 分屏逻辑完全复用）

---

## 3. keep-alive——CSS display 切换

**所有 tab 内容始终 mount，`display: none/block` 切换。**

```tsx
function TabContent({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: active ? 'block' : 'none', width: '100%', height: '100%' }}>
      {children}
    </div>
  );
}
```

**为什么不用条件渲染？** `{active && <View />}` → 切标签页时 Monaco Editor / CM6 / xterm.js 状态全部丢失。CSS display 切换 → DOM 还在、编辑器状态保持、切回来瞬间恢复。

---

## 4. TabBar 插入点

TabBar **不在 MainPool 里**。TabBar 是壳 DOM `<div>`，渲染在 MainPool WCV 上方：

```
壳 DOM
  <div className="tab-bar" />     ← 壳渲染，高度 35px
  ← 这个空白区域恰好覆盖 MainPool 上方

MainPool WCV
  ┌──────────────────────────────┐
  │ y=0: 空白 (tabBarH)          │  ← MainPool 内容从 tabBarH 以下开始
  │ y=tabBarH: MainRenderer       │
  └──────────────────────────────┘
```

**为什么 TabBar 在壳？**
- 切标签页 → 壳 `tabState` 直接更新 → 零 IPC 延迟
- 拖拽排序 → 壳的 window 级 mousemove + portal 拖影
- TabBar 如果在 MainPool → 每次操作都要 IPC 往返：MainPool → 壳 → MainPool

---

## 5. PluginErrorBoundary——单 tab 隔离

每个 tab 一个独立的 Error Boundary：

```tsx
class PluginErrorBoundary extends React.Component<Props, { error: Error | null }> {
  componentDidCatch(error: Error) {
    this.setState({ error });
    // 通知壳：tab 崩溃 → 壳可选重建
    window.linkdesk.events.emit('pool:tab-crashed', { tabId: this.props.tabId });
  }

  render() {
    if (this.state.error) {
      return <TabCrashOverlay error={this.state.error} tabId={this.props.tabId} />;
    }
    return this.props.children;
  }
}
```

**一个 tab 崩 ≠ 整个 MainPool 崩。** 其他 tab 继续正常运行。

---

## 6. 与壳的通信

```
壳 → MainPool:
  pool:layout IPC → MainRenderer 接收 { groups: [...] }
  → React 重新渲染（分屏/标签页增删/keep-alive 切换）

MainPool → 壳:
  插件调 window.linkdesk.tabs.* → IPC → 壳 tabState 更新
  → 壳 syncLayout → pushLayout → MainPool 收到新 layout
```

---

## 7. DevTools

F12 → 选择 "MainPool" DevTools。和 SidebarPool 独立——各自有独立的 Console/Network/Elements。

---

> **← 架构全景：** [01-Pool模型设计.md](../01-Pool模型设计.md)
> **→ 侧栏池：** [SidebarPool设计.md](../SidebarPool/SidebarPool设计.md)
> **→ 执行清单：** [E5.6#14-#17](../E5.6-执行清单.md)
