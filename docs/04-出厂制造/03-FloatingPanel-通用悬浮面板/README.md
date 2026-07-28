# 03 — FloatingPanel（悬浮窗系统 / 通用悬浮面板）

> **类型：壳级别** — 改 `WindowManager` + 新增 `FloatingPanel.tsx` 壳组件，随壳版本发布。
> **05-出厂制造排序：3/11** — 第三优先。UI 基础设施——被 #05 Marketplace Store、#07 Theme Maker、设置面板消费。
> 2026-07-24。**E3 架构完工后的壳级扩展。** 对标 VS Code 的标签页拖出独立窗口 + 设置大面板。

---

## 05-出厂制造 聚焦

**本任务只做类型 B（壳内悬浮面板）。** 类型 A（可拖出标签页）延后到 v1.4。
类型 B 是一个通用 React 组件 (`<FloatingPanel>`)——消费方只需传 `title` + `children`，不关心遮罩/动画/拖拽。

| 维度 | 说明 |
|------|------|
| **基础设施** | UI 层的"桌子"——不关心内容，只提供容器 |
| **一致性** | 所有悬浮面板用同一个组件 → 动画、拖拽、resize 行为一致 |
| **消费方** | Marketplace 商店 / 设置面板 / 主题制作器 |
| **依赖链** | 被 #05 Marketplace、#07 Theme Maker 消费。自己无依赖 |

### 新版 UI 补充（原 04 文档未覆盖的细节）

- **入场动画：** 从右侧滑入 `translateX(100%) → 0`，250ms `cubic-bezier(0.16,1,0.3,1)`
- **拖拽手柄：** 顶部 6px 区域，`cursor: grab`，拖拽时半透明跟随
- **Resize 手柄：** 底部 8px 区域，`cursor: ns-resize`，最小 300px / 最大窗口高度-80px

---

## 定位

| | |
|---|---|
| 类型 | **壳级扩展**——需要改 `WindowManager`，不是纯插件 |
| 前提 | E3a 全部完工（WindowManager + WebContentsView + IPC 桥接全部就绪） |
| 涉及架构改动 | **类型 A ~260 行，类型 B ~160 行。** 不改插件接口。 |
| 插件感知 | **零。** 插件不知道自己在哪个窗口里渲染。 |

---

## 两种悬浮窗

### 类型 A：可拖出标签页（Detachable Tab）

> 对标 VS Code：把编辑器标签页拖出窗口 → 自动变成独立窗口 → 拖回来 → 自动并回去。

**技术原理：** Electron `WebContentsView` 不绑定创建它的 `BrowserWindow`。可以：
1. `shellWindow.contentView.removeChildView(view)` — 从壳窗口拆下
2. `floatWindow = new BrowserWindow({...})` — 创建新窗口
3. `floatWindow.contentView.addChildView(view)` — 装到新窗口

`webContents` 对象全程不变——JS 堆、IPC 通道、React 状态全部保留。

**实现：**

```typescript
// electron/services/window-manager.ts —— 新增方法

class WindowManager {
  private detachedWindows = new Map<string, BrowserWindow>();

  // 拖出
  detachPluginView(pluginId: string, bounds?: Rectangle): BrowserWindow {
    const view = this.pluginViews.get(pluginId);
    if (!view) throw new Error(`插件 "${pluginId}" 无 WebContentsView`);

    // 从壳拆下
    shellWindow.contentView.removeChildView(view);

    // 创建独立窗口
    const floatWindow = new BrowserWindow({
      ...bounds,
      title: getPluginDisplayName(pluginId),
      webPreferences: { /* 壳窗口同款 preload */ },
    });

    // 挂到新窗口
    floatWindow.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, width: bounds?.width ?? 800, height: bounds?.height ?? 600 });

    // 浮窗关闭 → 自动并回
    floatWindow.on('close', () => {
      this.attachPluginView(pluginId, floatWindow);
    });

    this.detachedWindows.set(pluginId, floatWindow);
    return floatWindow;
  }

  // 拖回
  attachPluginView(pluginId: string, floatWindow: BrowserWindow): void {
    const view = this.pluginViews.get(pluginId);
    if (!view) return;

    floatWindow.contentView.removeChildView(view);
    shellWindow.contentView.addChildView(view);
    // bounds 由 MainContent placeholder 重新计算

    floatWindow.destroy(); // 关闭空窗口
    this.detachedWindows.delete(pluginId);
  }
}
```

**拖拽手势（`useDragReorder.ts` 扩展）：**

- 检测鼠标移出壳 BrowserWindow 的 bounds（`screenX/screenY` vs `BrowserWindow.getBounds()`）
- 移出 → 触发 `detachPluginView()` → 浮窗跟随鼠标直到释放
- 浮窗拖回壳窗口上方 → `attachPluginView()`

**降级方案：** 如果 OS 级拖出检测兼容性不好 → 标签页右键菜单加"在新窗口中打开"/"并回主窗口"命令。

### 类型 B：壳内悬浮面板（Modal Panel）

> 对标 VS Code 设置面板——大 overlay 覆盖主区，卡在壳窗口内部，不创建 OS 窗口。

**技术原理：** 纯 React 组件。`createPortal` 到 `document.body`，`position: fixed` + 高 `z-index` + 背景遮罩。

```typescript
// src/components/shared/FloatingPanel.tsx —— 壳级通用组件

interface FloatingPanelProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;       // 底部按钮区——"打开编辑器""最大化""关闭"
}

function FloatingPanel({ visible, onClose, title, children, actions }: FloatingPanelProps) {
  if (!visible) return null;

  return createPortal(
    <div className="floating-panel-overlay" onClick={onClose}>
      <div className="floating-panel" onClick={e => e.stopPropagation()}>
        <div className="floating-panel-header">
          <span>{title}</span>
          <button onClick={onClose}>×</button>
        </div>
        <div className="floating-panel-body">{children}</div>
        {actions && <div className="floating-panel-actions">{actions}</div>}
      </div>
    </div>,
    document.body
  );
}
```

CSS：
```css
.floating-panel-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: var(--z-modal);
  display: flex; align-items: center; justify-content: center;
}
.floating-panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  width: 70vw; max-width: 900px;
  max-height: 80vh;
  display: flex; flex-direction: column;
}
.floating-panel-header { /* 标题栏 */ }
.floating-panel-body   { /* 内容区——overflow-y: auto */ }
.floating-panel-actions { /* 底部按钮 */ }
```

**面板内按钮：**
- **"在主窗口中打开（编辑器）"** → `createTab(pluginId)` → 关闭面板
- **"最大化编辑器"** → 面板 `width: 100vw; max-width: 100vw`，不创建新标签页
- **"关闭"** → `onClose()`

**消费端——Settings 插件改：**
```typescript
// 改前：Tab 内容直接渲染 SettingsView
// 改后：壳的 Ctrl+, 弹出 FloatingPanel<SettingsView>
//       面板内"打开编辑器"按钮 → createTab("settings")
```

---

## 任务清单

### 类型 B——壳内悬浮面板（v1.2，~160 行）

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| B1 | `FloatingPanel.tsx` —— 通用悬浮面板组件（overlay + 标题栏 + 内容区 + 底部按钮区） | ~80 | Ctrl+, 弹出 Settings 面板 → 面板内点击"编辑器打开" → Settings 变标签页 |
| B2 | Settings 面板集成——Ctrl+, 改走 FloatingPanel | ~30 | Ctrl+, 弹面板而非创建标签页 |
| B3 | Marketplace 面板集成——齿轮菜单"打开插件市场"改走 FloatingPanel | ~30 | 插件市场面板弹出 |
| B4 | CSS 变量——`--z-modal`、面板颜色全部走 CSS 变量 | ~20 | 切 Dark/Light 面板颜色跟随 |

### 类型 A——可拖出标签页（v1.4，~260 行）

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| A1 | `WindowManager.detachPluginView()` —— WebContentsView 跨窗口转移 | ~60 | 终端标签页拖出 → 独立窗口出现 → 终端正常工作 |
| A2 | `WindowManager.attachPluginView()` —— 浮窗并回壳 | ~40 | 关闭浮窗 → 标签页回到壳内 |
| A3 | 拖拽手势——`useDragReorder` 加 detach 阶段 + 边界检测 | ~50 | 拖标签页到壳窗口外 → 浮窗出现 |
| A4 | 右键菜单——"在新窗口中打开" / "并回主窗口"（拖拽的降级方案） | ~30 | 右键终端标签页 → "在新窗口中打开" |
| A5 | 浮窗生命周期——`window-all-closed` 逻辑更新 | ~30 | 关闭所有浮窗不退出软件 |
| A6 | 布局持久化——记录浮窗位置/大小 | ~50 | F5 刷新 → 浮窗位置恢复 |

---

## 架构兼容性

| 现有系统 | 是否受影响 | 说明 |
|------|:--:|------|
| IPC 桥接（E3a） | ❌ 不影响 | `ipcRenderer.invoke` 对所有窗口一视同仁 |
| 主题广播（E3b） | ❌ 不影响 | `webContents.send()` 无视窗口归属 |
| 语言广播（E3c） | ❌ 不影响 | 同上 |
| 插件 preload | ❌ 不影响 | 浮窗用同一个 preload |
| 标签页系统 | ⚠️ 轻影响 | TabState 加 `detached` / `windowId` 字段 |
| 布局持久化（LayoutService） | ⚠️ 轻影响 | LayoutData 加浮窗位置记录 |

**核心原则：插件零改动。** 无论是类型 A 还是类型 B，插件代码一行不改——对插件来说还是那个 React 组件在渲染。

---

> **← 04 索引：** `00-README.md`
> **← 架构前提：** `../../02-Electron架构/E3_多WebView与壳收尾_暂定/01-E3a-多WebView进程隔离.md`（WindowManager）
