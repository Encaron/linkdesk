# Phase 7 — 浮动窗口：标签页拖出方案

> 2026-07-23。功能：把标签栏中的标签页拖出整个软件外，形成独立的浮动窗口在 Windows 桌面上（对标 VS Code "detach tab to new window"）。
>
> **核心结论：LinkDesk 在这个功能上可以比 VS Code 做得更优雅。** VS Code 必须销毁+重建（编辑器在 DOM 里），LinkDesk 可以 WebContentsView 热迁移——不销毁、不序列化、插件零改动。

---

## 零、VS Code 怎么做——为什么我们不必学

### VS Code 的"销毁+重建"路线

```
拖出标签页 → 序列化编辑器状态 → 创建新 BrowserWindow →
加载 workbench.html → 等渲染完成 → 反序列化恢复状态 →
原窗口删除标签页
```

VS Code **不得不**这样做，因为它的编辑器（Monaco、notebook、diff editor）全部渲染在主 workbench DOM 里。DOM 不能从一个窗口搬到另一个窗口——必须销毁再在新窗口重建。

代价：
- 每个编辑器类型都要实现 `EditorViewState` 序列化/反序列化接口
- 新窗口加载有白屏闪烁
- 未保存的 UI 状态（滚动位置、折叠区域、canvas 内容）可能丢失

### LinkDesk 可以做的"热迁移"路线

```
拖出标签页 → removeChildView(主窗口) → 创建新 BrowserWindow →
addChildView(新窗口) → 原窗口删除标签页引用
```

**不销毁 WebContentsView。不序列化。插件一行代码不用改。**

因为 Phase 7 Plan B 里每个插件的 UI 就是独立的 `WebContentsView`。Electron 的 API 原生支持从一个窗口移除再添加到另一个窗口——底层 `WebContents` 进程持续运行，React 状态、WebGL 上下文、canvas、input 焦点全部保留。

```javascript
// 核心 API（Electron >= 30 原生支持）
// 从主窗口摘下来
mainWindow.contentView.removeChildView(tabView);

// 在鼠标位置创建新壳窗口
const floatWin = new BrowserWindow({
  x: mouseScreenX,
  y: mouseScreenY,
  width: 800,
  height: 600,
});

// 把活的 WebContentsView 贴上去——里面的 React 状态、canvas、input 全部保留
floatWin.contentView.addChildView(tabView);
```

| | VS Code（销毁+重建） | LinkDesk（热迁移） |
|---|---|---|
| 编辑器/视图是什么 | 主窗口 DOM 的一部分 | 独立 WebContentsView 进程 |
| 拖出时做什么 | 序列化 → 销毁 → 新建 → 反序列化 | `removeChildView` → `addChildView` |
| 插件要不要改代码 | 要实现序列化接口 | **不用**——WebView 活着，所有状态自然保留 |
| 有没有闪烁 | 有（等新窗口加载 HTML + JS） | **没有**——WebContentsView 没重启 |
| 未保存内存状态（canvas、表单、滚动） | 可能丢失 | **完整保留** |

**VS Code 10 年没做成的事，LinkDesk 因为 WebContentsView-per-plugin 的架构天然就能做。**

---

## 一、目标架构

### 1.1 窗口拓扑

```
WindowManager (Electron 主进程，全局单例)
│
├─ BrowserWindow "main"
│   ├─ 完整壳：图标栏 + 侧栏 + 状态栏
│   ├─ WebContentsView #1 (terminal-main)
│   ├─ WebContentsView #2 (settings)
│   ├─ WebContentsView #3 (marketplace)
│   └─ React App (壳 Workbench)
│       ├─ TabGroup "group-1" → [terminal-main, settings]
│       └─ TabGroup "group-2" → [marketplace]
│
├─ BrowserWindow "float-1" (用户从主窗口拖出来的)
│   ├─ 轻量壳：只有标签栏 + 内容区（无图标栏/侧栏/状态栏）
│   ├─ WebContentsView #4 (terminal-usb0)
│   └─ React App (壳——同一个 main.tsx 入口)
│       └─ TabGroup "float-group-1" → [terminal-usb0]
│
└─ BrowserWindow "float-2" (又拖出来一个)
    └─ ...
```

### 1.2 核心设计原则

1. **WebContentsView = 标签页的内容。** 一对一映射。创建标签页时创建 View，关闭标签页时销毁 View。
2. **BrowserWindow = 标签页组的容器。** 主窗口可以有多个分屏面板（多 `TabGroup`），浮动窗口初始只有一个。
3. **热迁移，不重建。** `windowManager.moveViewToWindow(viewId, fromWindowId, toWindowId)` 是核心 API——O(1) 操作，WebContentsView 进程不重启。
4. **浮动窗口的壳是最小化的。** 同一个 `main.tsx` 入口，通过 `window.__linkdeskWindowId` 判断渲染哪些壳组件。浮动窗口只渲染标签栏 + 内容区。
5. **WindowManager 是唯一真相源。** 主进程维护 `Map<windowId, { browserWindow, views: Map<viewId, WebContentsView> }>`。

### 1.3 浮动窗口能否支持分屏？

架构上支持（一个 BrowserWindow 可以有多个 TabGroup），但初期不做。VS Code 的浮动窗口也没有分屏。初期设计：浮动窗口 = 1 个 TabGroup，只能有 1 个标签页（拖出后再拖入另一个标签页可以合并，但不支持在浮动窗口内分屏）。

---

## 二、三类状态：隔离方案

这是浮动窗口方案的核心架构决策。当前代码里的全部状态分三类，每类解法不同。

```
┌─────────────────────────────────────────────────────────┐
│ 第一类：每窗口独立                                       │
│ ├── TabState (标签页列表、激活标签页、分屏树)              │
│ ├── LayoutService 缓存                                   │
│ ├── DOM 查询结果 (document.querySelectorAll)             │
│ ├── keydown 事件处理 (Ctrl+W, Ctrl+Tab)                  │
│ └── React 组件树 (App, MainContent, TabBar, SplitPane)   │
│                                                           │
│ → 解法：Electron 独立 renderer 进程天然隔离               │
│ → 当前代码不需要改——每个窗口 independent JS context        │
│ → 模块级单例 (CoreEvents, ConfigurationService 等)       │
│   在独立 renderer 进程中天然隔离，不是 bug 是 feature     │
├─────────────────────────────────────────────────────────┤
│ 第二类：全应用共享                                       │
│ ├── ConfigurationService (用户设置)                      │
│ ├── PluginStateService (插件启用/禁用/版本状态)           │
│ ├── viewRegistry (已加载的插件元数据列表)                 │
│ ├── CoreEvents (配置变更、端口状态、主题变更事件)          │
│ ├── CommandRegistry / MenuRegistry / ProtocolRegistry    │
│ └── 插件加载状态 + 运行时错误                             │
│                                                           │
│ → 解法：移到 Electron 主进程，renderer 通过 IPC 同步       │
│ → Plan B §三 已经规划了主进程 ConfigService               │
│ → 需要扩展：主进程 PluginStateService + RegistryBroadcast │
│ → 同步协议：renderer 启动时拉全量，运行时主进程增量推送     │
├─────────────────────────────────────────────────────────┤
│ 第三类：硬件级（真正的物理单例）                           │
│ ├── SerialState (串口——物理设备只有一个)                  │
│ ├── 文件系统                                             │
│ └── 系统通知                                             │
│                                                           │
│ → 解法：Electron 主进程唯一管理，renderer 通过 IPC 调用    │
│ → Plan B §三 已经规划了 serial-service.ts / file-service  │
│ → 物理单例天然不会冲突                                    │
└─────────────────────────────────────────────────────────┘
```

### 为什么"模块级单例"在 Electron 模型下不是问题

当前代码每个核心服务都是模块级 `const`（`CoreEvents`、`ConfigurationService` 等）。在 Tauri 单 WebView 下，这没问题——只有一个 JS context。在 Electron 多窗口下：

- **每个 BrowserWindow 有独立的 renderer 进程**——各自的 JS context、各自的 `const` 实例。
- 第一类状态（`TabState` 等）在各窗口内独立运行——不需要改代码。
- 第二类状态需要**一个真正的单例**——在 Electron 主进程。每个 renderer 通过 IPC 获取自己的"只读视图"。

当前代码的模块级单例在迁移后变成"renderer 本地缓存"——不是 bug，是正确的分层。

---

## 三、当前代码评估：什么该留，什么该改

### 3.1 不需要改的（架构天生支持多窗口）

| 组件/模块 | 为什么不用改 |
|-----------|-------------|
| `Tab` 数据模型 | `{ id, type, pluginId, label, sourceId, ... }` 自包含，可通过 IPC 序列化传输 |
| `TabGroup` / `TabState` | 纯数据结构，窗口无关 |
| 所有 `reduce*` 函数 | 纯函数，对任何窗口的 TabState 操作逻辑一致 |
| `TabBar` 组件 | 纯 props 组件（接收 `group` + 回调），每个窗口独立渲染 |
| `useTabManager` hook | React hook，每个窗口的 React App 独立实例化（但需要改 Tab ID 生成——见 §3.2） |
| `TabPanePositioner` | portal 到当前窗口的 DOM——天然窗口隔离 |
| `SplitPane` | 纯布局组件，驱动自 `SplitNode` |
| `useDragReorder` | 窗口内拖拽——浮动窗拖出是新增功能，不冲突 |
| keep-alive 策略 | 所有视图平级渲染 + CSS display 切换 → 映射到"WebContentsView 不被销毁" |
| `TabActionsContext` | 插件 ↔ 标签管理的边界清晰，每个窗口独立 Provider |

### 3.2 需要改的（全部是增量，不重写现有逻辑）

#### A. Tab ID 全局唯一性（`tabIdentity.ts`，~10 行）

当前用模块级计数器：
```typescript
// 现在
let _terminalCounter = 0;  // 每个窗口独立计数
id: `terminal-${++_terminalCounter}`
```

浮动窗口拖回主窗口时，ID 可能碰撞。改为带窗口 ID 前缀：
```typescript
// 迁移后
// 每个 renderer 通过 preload 注入 window.__linkdeskWindowId
const winId = window.__linkdeskWindowId || 'main';
id: `${winId}/terminal-${++_terminalCounter}`
```

#### B. 窗口级壳渲染（`App.tsx`，~30 行）

每个 Electron 窗口加载同一个 React 入口，通过 preload 注入的 `windowId` 判断渲染范围：
```typescript
// App.tsx 壳渲染——迁移后
const isMainWindow = window.__linkdeskWindowId === 'main';
const isFloatingWindow = !isMainWindow;

return (
  <>
    {isMainWindow && <IconBar />}
    {isMainWindow && <SidePanel />}
    <MainContent />      {/* 所有窗口都有：标签栏 + 分屏 */}
    {isMainWindow && <StatusBar />}
  </>
);
```

不是重写——是给已有渲染加一个维度。

#### C. 拖出检测（新增 `useDetachDrag` hook，~60 行）

当前 `useDragReorder` 只处理窗口内拖拽。新增 hook 检测鼠标离开窗口边界：
```typescript
// 新 hook：useDetachDrag
function useDetachDrag(tabId: string, tabLabel: string) {
  // 在 window 级 mousemove 中检测：
  // 如果拖拽中鼠标离开窗口 rect → 触发 detach
  // dragend 时如果鼠标在窗口外 → ipcRenderer.send('window:detachTab', {
  //   tabId, windowId, mouseX: e.screenX, mouseY: e.screenY
  // })
}
```

对着 VS Code 的 `src/vs/base/browser/dnd.ts` 写——纯 DOM 逻辑，框架无关。

#### D. WindowManager 预留多窗口 API（`main/window-manager.ts`，~40 行）

Plan B 当前规划的 `WindowManager` 只管理"窗口 → WebContentsView"。需要在设计之初就预留：
```typescript
// main/window-manager.ts
class WindowManager {
  private windows = new Map<string, {
    browserWindow: BrowserWindow;
    views: Map<string, WebContentsView>;
  }>();

  // 核心 API——迁移时就写好
  createWindow(windowId: string, options: WindowOptions): BrowserWindow;
  closeWindow(windowId: string): void;
  addView(windowId: string, viewId: string, view: WebContentsView): void;
  removeView(windowId: string, viewId: string): WebContentsView;

  // 浮动窗口核心——迁移时就预留接口
  moveViewToWindow(
    viewId: string,
    fromWindowId: string,
    toWindowId: string
  ): void;

  // 获取窗口数量——用于判断是否所有窗口都关闭了
  getWindowCount(): number;

  // 浮动窗口关闭时的回迁逻辑
  onFloatWindowClosing(windowId: string): void;
}
```

**在迁移时就写好 `moveViewToWindow`——后续实现拖出功能时只需要调它。**

#### E. localStorage → 主进程持久化 + IPC 同步

`StorageService.ts` 当前用 `localStorage` 做持久化。每个 renderer 的 `localStorage` 是隔离的——但对第二类共享状态，需要主进程作为唯一真相源：

```typescript
// 迁移后——renderer 侧
const settings = await ipcRenderer.invoke("config:getAll");
// 主进程是唯一真相源——读文件、缓存、变更时推送给所有窗口

// 迁移后——每个窗口的 layout 存在自己的 localStorage（第一类状态）
localStorage.setItem(`v3_layout`, JSON.stringify(tabState));
// 每个窗口独立——不需要 namespace
```

#### F. `document.querySelectorAll` ——不需要改

当前 TabBar 中的 `document.querySelectorAll(".tab-bar")` 假设所有 tab bar 在同一文档中。Electron 每个窗口有独立的 renderer 进程——每个窗口的 `document` 只包含自己的 tab bar。天然隔离，不需要 scope 参数。

#### G. `window.addEventListener("keydown")` ——不需要改

当前 App.tsx 的全局 keydown 监听（Ctrl+W, Ctrl+Tab 等）。Electron 每个窗口有独立的 `window` 对象——每个窗口只响应自己窗口内的按键。天然隔离。

### 3.3 总改动量

| 类型 | 规模 | 说明 |
|------|:--:|------|
| 新增 | ~150 行 | `useDetachDrag` + `WindowManager.moveViewToWindow` + 浮动窗口创建逻辑 |
| 修改 | ~40 行 | `tabIdentity.ts` Tab ID 生成 + `App.tsx` 窗口渲染条件 |
| 不动 | **95%+** | 全部 React 组件、全部 reducer、全部 Registry、全部测试 |

---

## 四、对 Plan B 的补充

Phase 7 Plan B（`LinkDesk-Phase7-PlanB-Electron迁移方案.md`）目前的架构设计只有一个 `BrowserWindow`。浮动窗口方案需要在其基础上做以下补充：

### 4.1 Plan B §一 "目标架构" 补充

在进程拓扑图（§一）中，`Shell Window` 从单数改为"至少一个"：

```
┌─────────────────────────────────────────────────────────────┐
│  Electron Main Process (Node.js)                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Core Services                                          │  │
│  │ SerialService  FileService  ConfigService  WindowMgr  │  │
│  │                                                         │  │
│  │ WindowManager (增强)                                    │  │
│  │   windows: Map<windowId, BrowserWindow>                │  │
│  │   moveViewToWindow(viewId, fromWinId, toWinId)         │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 主窗口 (BrowserWindow "main")                           │  │
│  │   Workbench UI —— 图标栏/侧栏/标签栏/分屏/状态栏      │  │
│  │   + WebContentsView × N (插件 UI)                      │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 浮动窗口 #1 (BrowserWindow "float-N")                   │  │
│  │   轻量 Workbench —— 标签栏 + 内容区（无图标栏/侧栏）   │  │
│  │   + WebContentsView × 1 (被拖出的插件 UI)              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Plan B §三 "壳与 Extension Host 的分工" 补充

| 组件 | 原计划 | 补充：浮动窗口相关 |
|------|--------|-------------------|
| `main/window-manager.ts` | 管理主窗口 + WebContentsView 创建/销毁 | **增强**：管理 N 个 BrowserWindow，维护 `Map<windowId, { browserWindow, views }>`，预留 `moveViewToWindow` API |
| `main/ipc-router.ts` | ExtHost ↔ Renderer 消息路由 | **增强**：路由时知道消息从哪个 windowId 来、发到哪个 windowId 去 |
| `preload.ts` | `contextBridge` 暴露 API | **增强**：注入 `window.__linkdeskWindowId` 和 `window.__linkdeskIsMainWindow` |

### 4.3 Plan B §五 "迁移步骤" 补充

在 **步 1 "Electron 壳初始化"** 中增加：

```
8. preload.ts 注入 window.__linkdeskWindowId
9. App.tsx 根据 windowId 条件渲染壳（浮动窗口不渲染图标栏/侧栏/状态栏）
```

在 **步 5 "WebContentsView 管理"** 中增加：

```
5. WindowManager 使用 Map<windowId, ...> 而非单一 BrowserWindow 引用
6. 预留 moveViewToWindow(viewId, fromWinId, toWinId) API（不实现拖出 UI，只预留接口）
```

---

## 五、实施路线

```
Phase 5.5c (现在, Tauri)
  │  什么都不做——Tauri 不支持 WebContentsView reparent
  │  当前代码不需要为浮动窗口做任何预改
  │
Phase 7 Plan B 迁移 (Electron)
  │  WindowManager 设计时使用 Map<windowId, ...> 而非单一引用
  │  预留 moveViewToWindow API（接口 + 空实现或简单实现）
  │  preload 注入 window.__linkdeskWindowId
  │  App.tsx 根据 windowId 条件渲染壳组件
  │  tabIdentity Tab ID 生成加 windowId 前缀
  │  主进程持久化替代 localStorage（第二类状态）
  │  工作量：在已规划的迁移工作中附带完成，无额外工期
  │
Phase 7 迁移完成 + 1-2 天
  │  实现 useDetachDrag hook（窗口边界检测）
  │  实现浮动窗口创建 + WebContentsView 热迁移
  │  实现拖回合并（浮动窗口 tab 拖回主窗口）
  │  浮动窗口关闭 → 标签页回迁主窗口（或确认丢弃）
  │  工作量：~200 行新代码
  │
Phase 7 迁移完成 + 2-3 天
  │  浮动窗口位置/大小记忆 + 会话恢复时重建
  │  浮动窗口内支持多个标签页（拖另一个标签页进浮动窗口）
  │  浮动窗口内支持分屏（可选，VS Code 也没做）
```

---

## 六、为什么不在迁移之后才考虑这个

| | 迁移时不考虑 | 迁移时预留 API |
|---|---|---|
| WindowManager 数据结构 | `browserWindow: BrowserWindow`（单一引用） | `windows: Map<string, { browserWindow, views }>` |
| 后续改造 WindowManager | 重写 ~150 行（单一引用 → Map） | 不用改 |
| 后续改 App.tsx 条件渲染 | 加条件（但可能在别处已有耦合） | 迁移时顺手写 |
| 浪费 | ~150 行（写了又删） | 0 |

**在迁移时就预留接口 vs. 迁移后改造——两者的总工作量一样，但预留接口没有浪费，后续实现浮动窗口时直接使用已有 API。**

---

## 七、相关文档

- [LinkDesk-Phase7-PlanB-Electron迁移方案.md](./LinkDesk-Phase7-PlanB-Electron迁移方案.md) — Phase 7 Plan B 迁移主文档
- [LinkDesk-Phase7-框架选择分析-Tauri-vs-Electron.md](../phase7_多WebView与编辑能力/LinkDesk-Phase7-框架选择分析-Tauri-vs-Electron.md) — Tauri vs Electron 决策
- [LinkDesk-Phase7-多WebView-坑与对策.md](../phase7_多WebView与编辑能力/LinkDesk-Phase7-多WebView-坑与对策.md) — 多 WebView 七个坑
- [LinkDesk-Phase7-架构切换分析-插件模型抉择.md](../phase7_多WebView与编辑能力/LinkDesk-Phase7-架构切换分析-插件模型抉择.md) — 插件模型三条路
