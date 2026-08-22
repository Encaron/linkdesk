# SidebarPool 设计

> 📖 架构全景：[01-Pool模型设计.md](../01-Pool模型设计.md)
> 📖 执行清单：[E5.6#10-#13](../E5.6-执行清单.md)——Phase 3：SidebarPool 迁移

---

## 1. 概述

SidebarPool = **侧栏内容的 WebContentsView**。`pool.html?zone=sidebar-left` → `<SidebarRenderer side="left" />`。

| 属性 | 值 |
|:--|:--|
| 位置 | LayoutEngine zone `sidebar-left`, `edge: "left"`, `order: 1` |
| Bounds | `{ x: 42, y: 30, w: sidebarW, h: contentH }` |
| URL | `pool.html?zone=sidebar-left` |
| Renderer | `SidebarRenderer` |
| 进程 | 独立——崩了侧栏重建，主区不受影响 |

**未来：第二个 SidebarPool 实例。** `pool.html?zone=sidebar-right` → `<SidebarRenderer side="right" />`。同代码、独立 WCV。对标 VS Code Copilot Chat。

---

## 2. SidebarRenderer 组件

```tsx
// pool-main.tsx → RENDERERS['sidebar-left'] / RENDERERS['sidebar-right']
function SidebarRenderer({ layout, side }: { layout: PoolLayout; side: 'left' | 'right' }) {
  const s = layout.sidebar;
  if (!s?.visible || !s?.viewId) return null;

  return (
    <aside
      className={`sidebar-pool sidebar-pool--${side}`}
      style={{ width: '100%', height: '100%' }}
    >
      <PluginViewSlot pluginId={s.viewId} />
    </aside>
  );
}
```

### 2.1 组件职责

| 组件 | 职责 |
|:--|:--|:--|
| `SidebarRenderer` | 读 `layout.sidebar`，渲染 `<PluginViewSlot>` |
| `PluginViewSlot` | 动态 import `pluginId` 的 `sidebar.tsx` 入口 |
| `PluginErrorBoundary` | 单视图崩溃隔离 |

### 2.2 `side` prop

- `side="left"` → 右边有阴影（视觉暗示可向右拖拽）
- `side="right"` → 左边有阴影（视觉暗示可向左拖拽）
- 不影响宽度、不影响内容、不影响图标栏位置

---

## 3. 视图切换

图标栏点击 → 侧栏切换视图：

```
IconBar click "file-tree"
  → shellEvents.emit("icon:selected", "file-tree")
  → App.tsx handleIconClick → setSidebarView("file-tree")
  → syncLayout → pushLayout({ sidebar: { visible: true, width: 260, viewId: "file-tree" } })
  → IPC → SidebarPool → SidebarRenderer 收到 viewId 变化
  → <PluginViewSlot pluginId="file-tree" /> → 动态 import → mount 组件
```

**Switch back from search to file-tree:**
```
IconBar click "search"
  → 同上流程 → viewId: "search"
  → file-tree 的组件被 unmount，search 被 mount
```

**只渲染一个视图。** 不是列表切换（和主区 keep-alive 不同）——侧栏一次只显示一个视图。切换 = unmount 旧 + mount 新。侧栏视图不重——mount/unmount 几乎没有性能开销。

---

## 4. 折叠/展开

```
侧栏展开 (visible: true, width: 260):
  x: 42, y: 30, w: 260, h: contentH

侧栏折叠 (visible: true, width: 0 / collapsedWidth: 0):
  x: 42, y: 30, w: 0, h: contentH
  → SidebarPool WCV 还活着——只是 bounds 宽度为 0
  → MainPool WCV 左边界随着右移

侧栏关闭 (visible: false):
  → syncLayout → pushLayout({ sidebar: { visible: false } })
  → SidebarRenderer return null
```

**折叠不是销毁。** Pool 还在——只是 setBounds 宽度为 0。展开瞬间恢复。

---

## 5. 与图标栏通信

```
图标栏在壳 DOM (42px 宽，始终存在)
SidebarPool 在壳右侧 (从 x=42 开始)

方向：
  图标栏 → SidebarPool: shellEvents → 壳 syncLayout → pool:layout IPC
  SidebarPool → 图标栏: 插件调 window.linkdesk.events.emit('sidebar:xxx') → 壳更新图标栏状态
```

---

## 6. 拖拽宽度

OverlayWindow 在 SidebarPool 和 MainPool 之间渲染 4px 可拖拽分隔线：

```
用户拖分隔线
  → OverlayWindow mousemove → IPC → 主进程
  → layoutEngine.resizeZone("sidebar-left", newWidth)
  → SidebarPool.setBounds({ width: newWidth })
  → MainPool.setBounds({ x: newX, width: newWidth })
  → syncLayout → pushLayout({ sidebar: { width: newWidth } })  ← Pool 内部知道新宽度
```

---

## 7. 插件贡献到侧栏

```json
{
  "contributes": {
    "views": {
      "sidebar": [
        { "id": "file-tree", "entry": "sidebar.tsx", "icon": "folder-tree" }
      ]
    }
  }
}
```

插件贡献到 `sidebar` 或 `sidebar-right`。壳根据 `contributes.views` 自动将视图注册到图标栏。

---

> **← 架构全景：** [01-Pool模型设计.md](../01-Pool模型设计.md)
> **→ 主区池：** [MainPool设计.md](../MainPool/MainPool设计.md)
> **→ 执行清单：** [E5.6#10-#13](../E5.6-执行清单.md)
