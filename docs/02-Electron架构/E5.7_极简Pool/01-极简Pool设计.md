# E5.7 极简 Pool 模型——设计文档

> 2026-08-12。**从 E5.6 双Pool 重构为极简单Pool 模型——1 BrowserWindow + 1 WebContentsView。**
> **E5.7 是 E5.6 的简化，不是否定。** E5.6 双Pool 已完成 SidebarPool + MainPool + OverlayWindow 骨架（317/620 子任务 = 51%），E5.7 继承所有有效代码，扔掉进程边界带来的复杂度。
> **插件代码零改动。** `window.linkdesk.*` 签名不变。

---

## 目录

- [1. 起源——从双Pool到极简Pool的推导链](#1-起源从双pool到极简pool的推导链)
- [2. 为什么极简——根因分析](#2-为什么极简根因分析)
- [3. 架构全景](#3-架构全景)
- [4. Zone 分解——单Pool的布局分区](#4-zone-分解单pool的布局分区)
- [5. Layout 模型——flex + position:fixed](#5-layout-模型flex--positionfixed)
- [6. PoolRenderer——统一渲染器](#6-poolrenderer统一渲染器)
- [7. PushLayout 协议——减负](#7-pushlayout-协议减负)
- [8. 安全模型——preload沙箱](#8-安全模型preload沙箱)
- [9. 崩溃恢复——单点 + 快速重建](#9-崩溃恢复单点--快速重建)
- [10. 脱出窗口——同一代码，新进程（🔴 推迟 v1.3）](#10-脱出窗口同一代码新进程)
- [11. 消除了什么，保留了什么](#11-消除了什么保留了什么)
- [12. 目录树——E5.6现状 vs E5.7目标](#12-目录树e56现状-vs-e57目标)
- [13. 对比表——四种架构](#13-对比表四种架构)
- [14. 迁移路径概要](#14-迁移路径概要)

---

## 1. 起源——从双Pool到极简Pool的推导链

### 1.1 历史回顾——每一步为什么走

```
2026-06  E3      壳 + 单WebView（插件在壳里渲染）
                    ↓ 问题：插件 import 壳的源码 → 安全无保障
2026-07  E5      壳 + 多WebView（每个插件独立WebView？不——后来发现不可行）
                    ↓ 问题：没有明确模型，脚本注入 vs contextBridge 混乱
  ...    E5.5    Per-Tab WebView（每个标签页一个WebContentsView）
                    ↓ 问题：进程数 O(N)，30 个文件 = 30 个 WebContentsView
                    ↓ useWebViewSync ~270 行，宽限期、rekey、graceTimers 全链
2026-08  E5.6    双Pool（SidebarPool + MainPool + OverlayWindow = 4 WCV，O(1)）
                    ↓ 问题：跨Pool通信复杂（OverlayWindow、SplitHandle、IPC往返）
                    ↓ 问题：Toast 放哪？OverlayWindow setIgnoreMouseEvents 二进制→不够
                    ↓ 问题：底部面板独立WCV的价值被挑战——"崩了还有用吗？"
2026-08  E5.7    极简单Pool（1 BrowserWindow + 1 WCV 100%×100%）
```

### 1.2 关键转折——安全问题的根因再发现

**从 E3 到 E5.6，每一步都在追逐"进程隔离 = 安全"。**

但回顾历史，真正的安全问题只有一个：

```
插件代码 import { openFile } from '@src/core/filesystem'
  → openFile 调用 fs.readFileSync(path) —— Node.js API
  → 恶意插件 import 后读取任意系统文件
```

**解决方案不是多个进程——是 preload 沙箱。**

| 方案 | 防 import @src/core？ | 防 require('fs')？ | 防 child_process？ |
|------|:---:|:---:|:---:|
| E5 壳 preload（preload-shell.ts） | ❌ 插件跑在壳 renderer | ❌ contextBridge 但壳能接触 Node | ❌ 同进程 |
| E5.6 双Pool preload（preload-pool.ts） | ✅ 插件在独立 renderer | ✅ nodeIntegration: false | ✅ contextIsolation: true |
| E5.7 极简Pool preload（preload-pool.ts） | ✅ 同E5.6沙箱 | ✅ 同E5.6沙箱 | ✅ 同E5.6沙箱 |

**安全层级与进程数无关。** `nodeIntegration: false` + `contextIsolation: true` + `preload-pool.ts` 只暴露 `window.linkdesk.*` = 三者等价。VS Code 也只在主窗口用一个 renderer 进程 + Extension Host 做隔离。

### 1.3 双Pool的原始动机——再审视

E5.6 双Pool的唯一硬理由（[01-Pool模型设计.md](../E5.6_Pool模型重构/01-Pool模型设计.md) 第 23 行）：

> 侧栏插件 `while(true){}` → 带崩编辑器 → 全池崩溃重建 → 未保存内容丢失

**这条逻辑是对的，但结论可以不同。**

| 侧栏崩了 | 双Pool方案 | 极简Pool方案 |
|----------|-----------|-------------|
| 编辑器状态 | 不受影响——独立进程 | 受影响——同一进程 |
| 恢复速度 | 侧栏1-2s恢复 | 全池2-4s重建 |
| 未保存内容 | 保留（主进程 tabState） | **同样保留（主进程 tabState + 文件落盘）** |

**真正的"未保存内容丢失"不是进程隔离问题——是编辑器持久化问题。** VS Code 的 Hot Exit + 文件落盘机制在单 renderer 进程下运行了十年——编辑器崩了，重启自动恢复未保存内容。

**极简Pool的代价是真实的（崩一个=崩全池），但收益也真实（消除OverlayWindow + 跨Pool IPC + 分隔线进程 + 3个WCV生命周期管理）。**

---

## 2. 为什么极简——根因分析

### 2.1 根因：安全 ≠ 进程数

```
安全层级（从上到下）：
  1. 窗口边界——BrowserWindow 隔离渲染进程 ← E5.6 双Pool 在此层构建
  2. preload 沙箱——contextBridge 白名单     ← 实际起作用的是这个
  3. IPC 校验——主进程 handler 权限检查       ← 共享防线

E5.6 双Pool = 在第 1 层解决第 2 层的问题——过度工程。
E5.7 极简Pool = 在第 2 层解决问题——适可而止。
```

### 2.2 E5.6 双Pool 制造的问题

| E5.6 双Pool 的复杂度 | 来源 |
|:---|:---|
| OverlayWindow——独立 BrowserWindow | SidebarPool + MainPool 并排 WCV → 浮层跨边界被裁剪 |
| SplitHandle——OverlayWindow 渲染 | 同上——分隔线跨两个 WCV，不能用 CSS |
| 跨Pool IPC 往返 | TabBar 在壳 → MainPool IPC → 壳 IPC → SidebarPool |
| `pool.html?zone=sidebar` vs `?zone=main` | 两个 WCV 加载同一 HTML 但走不同渲染分支 |
| WindowManager——创建/销毁/setBounds 协调 | 管理 3+ WCV 的生命周期 |
| 崩溃恢复——SidebarPool + MainPool 独立策略 | 每个 Pool 各自心跳 + 重建逻辑 |
| Toast 无处可放 | 非模态浮层——OverlayWindow 是二进制的（全透/全不透） |

**E5.7 = 全部消除。** 1 个 WCV = 一个 DOM = 一个 CSS 层叠上下文 = 一个 `window`。

### 2.3 极简Pool 的关系网

```
E5.7 极简Pool
  ├── 继承自 E5.6：
  │   ├── preload-pool.ts 沙箱（window.linkdesk.* 只读）
  │   ├── pushLayout 协议（壳推送，池渲染）
  │   ├── PluginComponent（动态 import 插件入口）
  │   ├── PluginErrorBoundary（单tab崩溃隔离）
  │   ├── keep-alive（CSS display 切换）
  │   ├── SplitTree（分屏树数据结构）
  │   └── PoolLayout 类型定义
  │
  ├── 简化自 E5.6：
  │   ├── pool.html 单zone——不再需要 ?zone=sidebar|main 路由
  │   ├── PoolRenderer 统一——一个渲染器，内部 flex 分区
  │   ├── 壳 DOM 全部移入 Pool——IconBar/TabBar/StatusBar 变 React 组件
  │   └── 浮层 = CSS position:fixed——无 OverlayWindow
  │
  ├── 消除自 E5.6：
  │   ├── OverlayWindow BrowserWindow + 类
  │   ├── SidebarPool WCV 创建逻辑
  │   ├── 跨Pool IPC（pool:layout 现在只发一个 Pool）
  │   ├── SplitHandle WCV 分隔线
  │   ├── WindowManager 多Pool 管理
  │   └── 跨Pool 崩溃恢复策略
  │
  └── 新增：
      ├── IconBarZone.tsx / SidebarZone.tsx / MainZone.tsx / PanelZone.tsx / StatusBarZone.tsx
      ├── FloatingLayerHost（Toast/ContextMenu/QuickPick/Dialog——position:fixed 容器）
      ├── PoolZoneShell——唯一 React 根组件
      └── 主进程 crash recovery（render-process-gone → 重建 WCV——BrowserWindow + 壳渲染进程存活）
```

---

## 3. 架构全景

### 3.1 一句话

**1 个 BrowserWindow + 1 个 WebContentsView（100%×100%）+ preload-pool.ts 沙箱 + 主进程崩溃恢复。**

### 3.2 全景图

```
┌──────────────────────────────────────────────────────┐
│ MainWindow (BrowserWindow)                            │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │ MainPool WebContentsView (100%×100%)              │ │
│  │                                                    │ │
│  │  ┌──────────────────────────────────────────────┐ │ │
│  │  │ TitleBar  (React, -webkit-app-region:drag)   │ │ │
│  │  ├────┬─────────────────────────────────────────┤ │ │
│  │  │图标│ TabBar                                    │ │ │
│  │  │栏  │                                           │ │ │
│  │  │    ├──────────┬──────────────────────────────┤ │ │
│  │  │    │ Sidebar  │ 主区 (SplitTree + 分屏)        │ │ │
│  │  │    │                      │                   │ │ │
│  │  │    │ ┌────────┐ │ ┌──────┐ ┌──────┐         │ │ │
│  │  │    │ │file-   │ │ │main.c│ │main.h│         │ │ │
│  │  │    │ │tree    │ │ └──────┘ └──────┘         │ │ │
│  │  │    │ └────────┘ │ ┌────────────────────┐     │ │ │
│  │  │    │            │ │ Panel (Term/Out/…)  │     │ │ │
│  │  │    │            │ └────────────────────┘     │ │ │
│  │  │    ├────────────┴────────────────────────────┤ │ │
│  │  │    │ StatusBar                                │ │ │
│  │  └────┴─────────────────────────────────────────┘ │ │
│  │                                                    │ │
│  │  FloatingLayer (z-index 最高, position:fixed)       │ │
│  │  ┌──────┐ ┌────────────┐ ┌───────┐ ┌───────┐     │ │
│  │  │Toast │ │ContextMenu │ │QuickPick│ │Dialog │     │ │
│  │  └──────┘ └────────────┘ └───────┘ └───────┘     │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**所有 UI 都在单一 React 树的单一 CSS 层叠上下文中。** 没有跨进程裁剪、没有透明窗口叠加、没有 setIgnoreMouseEvents 切换。

### 3.3 核心数据

| 属性 | 值 |
|:--|:--|
| BrowserWindow | 1 个（主窗口——webContents 加载壳 index.html） |
| WebContentsView | 1 个（100%×100% 覆盖窗口内容区，加载 pool.html） |
| 渲染进程 | 2 个——壳渲染进程（纯状态持有者，无可见 DOM）+ Pool 渲染进程（全部 UI）。加主进程 = 3 OS 进程 |
| preload | `preload-pool.ts`——只暴露 `window.linkdesk.*` |
| nodeIntegration | `false` |
| contextIsolation | `true` |
| sandbox | `true`（Electron 默认） |
| 插件代码改动 | **0 行** |
| 浮层方案 | CSS `position: fixed` + `z-index` 层级 |
| 分隔线方案 | CSS flex 分隔——`cursor: col-resize` + mousedown 拖拽 |

> **壳渲染进程为什么保留：** "壳=唯一真相源"——tabState/syncLayout/pushLayout/命令执行留在壳；**静态声明 Registry 数据（LangDef/Protocol/FileAssociation）真源在主进程**（Phase 11 分区——2026-08-13 审计：文件打开路由本就在主进程决策）。壳只是不再渲染 UI DOM（被 WCV 完全覆盖）。壳想，池画。
>
> **E5.8+ 候选（不是 E5.7 缺陷）：** E5.7 完成后 tabState 的所有 UI 消费方都已搬入 Pool（MainZone 含 TabBar 都在池里，TabBarZone 已取消——2026-08-13 审计），壳里 tabState 的唯一消费者只剩 syncLayout()——未来 tabState 主进程化（纯数据存储 + 单一消费者）比 E5.6 时代可行得多。省一个零绘制的渲染进程（几十 MB 内存），代价是 useTabManager 状态层重写 + 消费方变异步 IPC——E5.7 的 94 任务不该再装下这个。

---

## 4. Zone 分解——单Pool的布局分区

### 4.1 Pool vs Zone——在极简Pool下的含义

在 E5.6 中，Pool = 独立 WebContentsView（进程边界），Zone = flex 布局分区。E5.7 只有一个 WCV，所以**所有区域都是 Zone**。但 Pool 这个词保留——"MainPool"现在是这个唯一 WCV 的名字。

```
极简Pool 内的 Zone：
  IconBarZone      ← 图标栏——flex row 最左侧，40px 宽
  SidebarZone      ← 侧边栏——flex row，可折叠，可拖宽度
  MainZone       ← 主区——flex row + flex column，SplitTree 分屏
  PanelZone        ← 底部面板——flex column 底部，可折叠
  StatusBarZone    ← 状态栏——flex column 最底部，22px 高
  FloatingLayer    ← 所有浮层容器——position:fixed，pointer-events 穿透/阻塞按需

每个 Zone = 一个 React 组件文件。Zone 之间不 import 对方。
壳 pushLayout = 唯一数据源。所有 Zone 从 layout 快照渲染。
```

### 4.2 Zone 职责表

| Zone | 渲染什么 | 数据字段 | CSS 定位 |
|:--|:--|:--|:--|
| TitleBarZone | 窗口标题 + 菜单 | `layout.titleBar` | flex column top, 30px |
| IconBarZone | 图标栏按钮 | `layout.iconBar` | flex row left, 42px |
| SidebarZone | 侧栏视图（文件树/搜索/插件面板） | `layout.sidebar` | flex row, 可变宽度 |
| MainZone | 主区——标签页内容 + SplitTree 分屏 | `layout.groups`, `layout.root` | flex: 1, minWidth: 0 |
| PanelZone | 底部面板（终端/输出/问题/端口） | `layout.panel` | flex column, 可变高度 |
| StatusBarZone | 状态栏信息 | `layout.statusBar` | flex column bottom, 22px |
| RightSidebarZone | 右侧面板（大纲/属性/AI Chat） | `layout.rightSidebar` | flex row right, 条件渲染 |
| FloatingLayer | Toast / ContextMenu / QuickPick / Dialog | 事件触发 | position: fixed, z-index 最高 |

### 4.3 Zone 扩展——加新 Zone = 三步

```
1. PoolLayout 类型加字段（poolLayout.ts）
2. 新建 Zone 组件文件（src/pool/main/<Name>Zone.tsx）
3. PoolZoneShell 加一个条件渲染 div
```

现有 zone 代码零改动。每个 zone 是独立文件——和 E5 壳内解耦模式完全一致。

### 4.4 Zone 之间的通信——不需要

E5.6 双Pool 中 zone 之间需要事件总线（IconBar click → SidebarPool 切换视图）——因为它们在**不同进程**。

E5.7 极简Pool 中 zone 之间**不需要直接通信**。所有变化路径相同：

```
插件调 window.linkdesk.* → IPC → 主进程 handler → 壳 tabState 更新
  → 壳 syncLayout() → pushLayout(newLayout)
    → Pool 收到新 layout → 所有 Zone 根据新 layout 重新渲染
```

PanelZone 显隐 = pushLayout 有/没有 `panel` 字段。MainZone 高度变化 = flex 自动调整。**zone 之间零 import、零 emit。**

---

## 5. Layout 模型——flex + position:fixed

### 5.1 主布局——flex matrix

```
┌─────────────────────────────────────────┐
│ TitleBarZone         (30px, fixed top)  │
├────┬────────────────────────────────────┤  ← flex row
│图标│ TabBar (35px)                       │
│栏  ├──────────┬─────────────────────────┤  ← flex row
│42px│ Sidebar  │ MainZone              │
│    │ (可折叠) │ ┌─────────────────────┐ │
│    │          │ │ SplitTree (flex row) │ │  ← flex: 1
│    │          │ └─────────────────────┘ │
│    │          │ ┌─────────────────────┐ │
│    │          │ │ PanelZone (可折叠)   │ │  ← 可变高度
│    │          │ └─────────────────────┘ │
│    ├──────────┴─────────────────────────┤
│    │ StatusBarZone (22px)               │  ← flex column bottom
└────┴────────────────────────────────────┘
```

**CSS 骨架：**

```css
.pool-root {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.pool-body {
  display: flex;
  flex: 1;
  min-height: 0;  /* ← 关键——允许 flex 子元素缩小 */
}
```

### 5.2 浮层——position:fixed + z-index 层级

```
z-index 层级（从低到高）：
  100  SplitHandle（分隔线拖拽手柄）
  200  PanelZone 拖拽尺寸手柄
  500  GroupTabBar 拖拽预览
  1000 DropZone（分屏拖拽预览——Glassmorphism 内发光）
  2000 Toast 容器（bottom-right）
  3000 ContextMenu
  4000 QuickPick / CommandPalette
  5000 Dialog / Modal
  6000 Tooltip（如需要）
```

**所有浮层在同一个 DOM + 同一个 CSS 层叠上下文中。** 没有"这个 Toast 被 SidebarPool WCV 盖住"的问题——因为只有一个 renderer。

### 5.3 分隔线——CSS 原地分离

> 🔴 **分隔线不变量（2026-08-13 审计）：分隔线活在区域的可见性条件块内——两个区域都在时自动出现，区域消失分隔线消失。** 侧栏分隔线在 `sidebar?.visible &&` 块内；分屏分隔线只在 branch 节点产出（单面板 flex fallback 零 handle）；面板 handle 在 PanelZone 内部（`panel?.visible` 假则整体不渲染）。不存在"永远渲染的分隔线"。

SidebarZone↔MainZone 分隔线 = 一个 4px `<div>`，`cursor: col-resize`，`mousedown` 启动拖拽：

```tsx
// 分隔线——和 E5 壳的 SidebarResizeHandle 完全相同
<div
  style={{
    width: 4,
    cursor: 'col-resize',
    background: 'transparent',
    flexShrink: 0,
  }}
  onMouseDown={handleSidebarResizeStart}
/>
```

拖拽时 `mousemove` 计算新宽度 → 更新 React state → SidebarZone flex-basis 变化 → MainZone 自动 fill 剩余空间。

**不需要 OverlayWindow、不需要跨进程 setBounds、不需要 IPC 往返。** 和 E5 壳的拖拽逻辑完全相同。

### 5.4 分屏分隔线——同进程拖拽

MainZone 内部 SplitTree 的分隔线同样用 CSS div → mousedown → mousemove：

```tsx
// 分屏分隔线——和当前 MainRenderer.tsx 的 SplitHandle 逻辑相同
<div
  style={{
    position: 'absolute',
    width: 4,
    height: '100%',
    cursor: 'col-resize',
    zIndex: 100,
  }}
  onMouseDown={(e) => handleSplitResizeStart(e, splitIndex)}
/>
```

**不需要 OverlayWindow 渲染分隔线。** 当前 E5.6 用 OverlayWindow 是因为分隔线跨两个 WCV 边界——极简Pool 只有一个 WCV。

---

## 6. PoolRenderer——统一渲染器

### 6.1 PoolZoneShell——唯一根组件

```tsx
// PoolZoneShell.tsx——E5.7 的入口组件
// 替代 E5.6 的 pool-main.tsx 中按 zone 分发的 RENDERERS 注册表
// 替代 E5 的 App.tsx 中 MainContent + shell 壳渲染

function PoolZoneShell({ layout }: { layout: PoolLayout }) {
  return (
    <div className="pool-root">
      {/* Row 1: TitleBar */}
      {layout.titleBar && <TitleBarZone titleBar={layout.titleBar} />}

      {/* Row 2: IconBar + Sidebar + Main + RightSidebar + Panel */}
      <div className="pool-body">
        {/* IconBar */}
        <IconBarZone iconBar={layout.iconBar} />

        {/* Sidebar */}
        {layout.sidebar?.visible && (
          <>
            <SidebarZone sidebar={layout.sidebar} />
            <SidebarResizeHandle />
          </>
        )}

        {/* Main Content Area (Main + Panel) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* 主区——tab bar 在 MainZone 内（每 panel 自带 GroupTabBar，TabBarZone 已取消——见 Zone分解设计 §2.4 墓碑） */}
          <MainZone
            groups={layout.groups}
            root={layout.root}
            creatableViews={layout.creatableViews}
          />

          {/* Panel */}
          {layout.panel?.visible && <PanelZone panel={layout.panel} />}
        </div>

        {/* RightSidebar */}
        {layout.rightSidebar?.visible && (
          <>
            <SidebarResizeHandle side="right" />
            <RightSidebarZone sidebar={layout.rightSidebar} />
          </>
        )}
      </div>

      {/* Row 3: StatusBar */}
      <StatusBarZone statusBar={layout.statusBar} />

      {/* Fractal: FloatingLayer —— 始终挂载，默认 pointer-events: none */}
      <FloatingLayerHost />
    </div>
  );
}
```

**对比 E5.6：**

| E5.6 | E5.7 |
|:--|:--|
| Shell DOM 渲染 TitleBar + IconBar + TabBar + StatusBar | React PoolZoneShell 渲染所有 |
| pool-main.tsx 按 `?zone=` 参数分发到不同 Renderer | 单入口，无 zone 参数 |
| SidebarRenderer / MainRenderer 在不同 WCV | SidebarZone / MainZone 在同一 DOM |

### 6.2 MainZone——从 MainRenderer 提取

E5.6 的 [MainRenderer.tsx](../E5.6_Pool模型重构/MainPool/MainPool设计.md)（693 行）承担了 MainZone + 布局分发 的职责。E5.7 中提取：

```tsx
function MainZone({ groups, root, creatableViews }: MainZoneProps) {
  // 从当前 MainRenderer.tsx 的 computeLayout() + 分屏渲染逻辑提取
  // 职责：
  //   接收 groups[] + root SplitNode
  //   computeLayout() → PanelRect[] + HandleRect[]
  //   渲染分屏面板（绝对定位平铺——B22 防护）
  //   分隔线拖拽（onDividerMouseDown）
  //   标签页拖拽协调（useDragReorder）
  //   Glassmorphism 分屏预览 overlay
  //   Drag preview portal
  //
  // 不 import: PanelZone / SidebarZone / StatusBarZone / TitleBarZone
}
```

### 6.3 SidebarZone——从 SidebarRenderer 合并

E5.6 的 SidebarRenderer 跑在独立 SidebarPool WCV 中。E5.7 中它变成 MainPool 内部的一个 React 组件：

```tsx
function SidebarZone({ sidebar }: { sidebar: SidebarLayout }) {
  if (!sidebar.viewId) return null;

  return (
    <div style={{ width: sidebar.width, height: '100%', flexShrink: 0, overflow: 'hidden' }}>
      <PluginComponent
        pluginId={sidebar.viewId}
        tabId={`sidebar-${sidebar.viewId}`}
        isActive={true}
      />
    </div>
  );
}
```

**和 E5.6 的 SidebarRenderer 逻辑相同——区别只是它在同一 DOM 里。**

### 6.4 PanelZone——底部面板

```tsx
function PanelZone({ panel }: { panel: PanelLayout }) {
  const { height, activeViewId, views } = panel;

  return (
    <div style={{ height, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      <PanelTabBar
        views={views}
        activeViewId={activeViewId}
        onSelect={handleViewSelect}
        onCreate={handleCreateTerminal}
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        {views.map(view => (
          <div key={view.id} style={{ display: view.id === activeViewId ? 'flex' : 'none', height: '100%' }}>
            <PluginComponent
              pluginId={view.id}
              tabId={`panel-${view.id}`}
              isActive={view.id === activeViewId}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 6.5 FloatingLayerHost——所有浮层的容器

```tsx
function FloatingLayerHost() {
  // 始终挂载在最外层 div 的最后——z-index 最高层
  // 默认 pointer-events: none——不阻挡正常交互
  // Toast/ContextMenu/QuickPick/Dialog 各自通过 portal 渲染到这里
  //
  // 和 E5.6 OverlayWindow 的功能等价——区别是：
  //   E5.6: 独立 BrowserWindow + setIgnoreMouseEvents 切换
  //   E5.7: 一个 div + pointer-events: none/auto 切换

  return (
    <div id="floating-layer" style={{
      position: 'fixed',
      inset: 0,
      zIndex: 2000,
      pointerEvents: 'none',  // 默认穿透
    }}>
      {/* Toast 容器 */}
      <ToastHost />

      {/* ContextMenu portal target */}
      <div id="context-menu-root" />

      {/* QuickPick / CommandPalette portal target */}
      <div id="quick-pick-root" />

      {/* Dialog / Modal portal target */}
      <div id="dialog-root" />
    </div>
  );
}
```

---

## 7. PushLayout 协议——减负

### 7.1 E5.6 的 PoolLayout

```typescript
// E5.6: 每个 Pool 收到适合的字段
// SidebarPool 收到 { sidebar: {...} }
// MainPool 收到 { groups: [...] }
// poolId 区分目标
interface PoolLayout {
  version: 1;
  poolId: string;  // "sidebar" | "main" | ...
  sidebar?: { ... };
  groups: [...];
}
```

### 7.2 E5.7 的 PoolLayout——全量、唯一

> **E5.8#5 补注——pushLayout 两条协议铁律（2026-08-19，全文落 src/core/types/pool/poolLayout.ts 头注释）：**
> 1. **whole-value checkpoint**：每次推送必须带完整 post-change 布局快照，禁止裸 delta——池不缓存旧值增量合并（合并错位 = 布局与壳真相源分叉，无法自愈）。
> 2. **delta 必须带稳定 id + 升序重放确定性**：若未来确需增量，delta 必须可脱离 live-only 内存重放——池崩溃重建后只能从主进程拿到最后快照，live-only 增量会静默丢更新。

```typescript
// E5.7: 唯一的 Pool 收到完整的 layout
// 不再需要 poolId——只有一个 Pool
interface PoolLayout {
  version: 2;  // 升级版本号——从 E5.6 的 version: 1

  // 布局 Zone
  titleBar: TitleBarLayout;
  iconBar: IconBarLayout;
  sidebar: SidebarLayout;
  rightSidebar?: SidebarLayout;

  // 主区
  groups: PoolGroup[];
  root?: SplitNode;          // SplitTree 分屏根节点
  creatableViews?: CreatableViewMeta[];

  // 底部面板
  panel?: PanelLayout;

  // 状态栏
  statusBar: StatusBarLayout;
}

// 新增类型
interface TitleBarLayout {
  title: string;
  menuBarVisible: boolean;
}

interface IconBarLayout {
  icons: IconBarItem[];
  activePluginId?: string;
}

interface SidebarLayout {
  visible: boolean;
  width: number;
  viewId: string | null;
}

interface PanelLayout {
  visible: boolean;
  height: number;
  activeViewId: string;
  views: PanelViewMeta[];
}

interface StatusBarLayout {
  items: StatusBarItem[];
}

// PoolGroup / PoolTab / SplitNode / CreatableViewMeta——从 E5.6 继承，不变
```

**全量推送 = 壳 syncLayout() 一次性发送——没跨Pool路由开销。** 触发时机和 E5.6 相同：标签页变化、侧栏折叠展开、面板显隐、分屏。

### 7.3 缓冲回放——不变

```typescript
// preload-pool.ts——和 E5.6 完全相同
window.linkdesk.pool = {
  ready: () => ipcRenderer.send('pool:ready'),
  onLayout: (cb) => {
    // 缓冲在 ready() 之前的 layout → ready() 后回放
    ipcRenderer.on('pool:layout', (_, layout) => cb(layout));
  },
};
```

---

## 8. 安全模型——preload沙箱

### 8.1 三层安全

```
Layer 1: Electron WebPreferences
  nodeIntegration: false       ← 不允许 require('fs')
  contextIsolation: true       ← preload 和网页 JS 上下文隔离
  sandbox: true                ← OS 级沙箱
  webSecurity: true            ← 禁止跨域

Layer 2: preload-pool.ts contextBridge 白名单
  window.linkdesk.*  ← 只暴露这些。没有 require/process/__dirname
  每个 API 函数 → ipcRenderer.invoke → 主进程权限校验

Layer 3: 主进程 handler 权限校验
  每个 IPC handler 检查调用者的 webContents.id + 插件权限
  危险操作（读外层文件系统 / spawn process）需要确认或禁止
```

**和 E5.6 双Pool 的安全层级完全一致。** 唯一的区别是侧栏插件和编辑器跑在同一 renderer 进程——但 `contextIsolation: true` 保证它们不能访问 Node.js。

### 8.2 为什么 preload 沙箱足够——对标 VS Code

| 安全机制 | VS Code | E5.6 双Pool | E5.7 极简Pool |
|:--|:--|:--|:--|
| 扩展代码运行位置 | Extension Host（独立进程，Node） | Pool renderer（独立进程，无 Node） | Pool renderer（同进程，无 Node） |
| renderer 能调 require？ | ❌（workbench renderer） | ❌（nodeIntegration: false） | ❌（同） |
| contextIsolation | ✅ | ✅ | ✅ |
| 扩展能读操作系统文件？ | ✅（Extension Host 有 Node——但通过 VS Code API 限制） | ❌（只有 window.linkdesk.*） | ❌（同） |

**VS Code 的扩展代码跑在 Extension Host——有完整 Node.js 权限。** 它的安全靠 VS Code API 层限制（`vscode.workspace.fs` 只能访问 workspace 内文件）。

**LinkDesk 的插件更没有理由需要进程隔离——它们连 Node.js 都访问不了。** `window.linkdesk.*` 是唯一接口，主进程 handler 做权限校验。

### 8.1 filesystem 路径守卫——沙箱唯一故意开口

> 🔴 **现状缺口：** `electron/ipc/file-handlers.ts` 的 11 个 filesystem handler 零路径校验——插件可 `filesystem:remove('C:\\任意路径')`。与"主进程 handler 做权限校验"的安全模型脱节，是对标 VS Code 的 `vscode.workspace.fs`（只能访问 workspace 内文件）必须补的一环。

```
1. normalizePath 归一化——消除 ../ 穿越与分隔符差异（复用 src/core/pathUtils）
2. 危险目录写拒绝——系统根目录 / C:\Windows / C:\Program Files 等任何写操作直接拒绝
3. workspace 外写操作 → 用户确认 dialog（读放行——文件树/打开任意目录是正常用法）
4. 越界尝试 console.error 记录——便于审计恶意插件
```

> 写操作 = writeTextFile / writeBinaryFile / createDir / copy / remove；读操作放行。目标：恶意插件无法静默破坏 workspace 之外的系统与用户文件。

---

## 9. 崩溃恢复——单点 + 快速重建

### 9.1 现状：E5.6 的多Pool崩溃恢复

| E5.6 崩溃场景 | 影响 | 恢复策略 |
|:--|:--|:--|
| SidebarPool 崩 | 侧栏空白1-2s | 重建 WCV → loadURL → pushLayout |
| MainPool 崩 | 编辑器空白3-5s | 重建 WCV → 从 tabState 恢复 |
| OverlayWindow 崩 | 浮层消失 | 重建透明窗口 |
| 壳崩 | 全灭 | 重建 BrowserWindow |

### 9.2 E5.7：唯一 Pool 崩溃

```
MainPool renderer 崩溃
  → app.on('render-process-gone', (event, details)
  → 重建 WCV（BrowserWindow + 壳渲染进程存活——tabState 不丢）
  → 重新 addWebContentsView (100%×100%)
  → loadURL('pool.html')
  → preload-pool.ts 初始化
  → pool:ready → pushLayout(最后已知 layout)
  → PoolZoneShell 渲染所有 Zone
  → 所有 PluginComponent 重新 mount
  → 插件从持久化恢复状态
```

**数据恢复：**

> **tabState 位置：** tabState 在壳渲染进程（E5.6 以来的"壳=唯一真相源"原则不变——壳只是不再渲染 UI DOM）。主进程在 `pool:pushLayout` IPC 中转时缓存 `lastLayout` 快照——Pool 崩溃后主进程直接用快照重建，不依赖壳。

| 数据 | 恢复能力 |
|:--|:--|
| 标签页结构（tabState） | ✅ 主线——壳 tabState 不随 Pool 崩溃丢失；主进程 lastLayout 快照直接回放 |
| 侧栏视图（sidebar.viewId） | ✅ 主线——同上 |
| 分屏布局（SplitNode） | ✅ 主线——同上 |
| 面板布局（panelLayout） | ✅ 主线——同上 |
| Monaco Editor 未保存内容 | ⚠️ 依赖 Hot Exit 机制——文件落盘→重启恢复 |
| Terminal 会话 | ❌ 丢失——xterm.js 缓存不可恢复 |
| 串口 SerialPort | ❌ 丢失——需要重新连接 |

**和 E5.6 对比：** E5.6 MainPool 崩溃时编辑器同样丢失——区别是 SidebarPool 不受影响。但 2-4s 后全池重建，tabState 恢复后用户回到相同状态。**编辑器的 Hot Exit（未保存内容落盘）是真正的可靠恢复——和进程数无关。**

### 9.3 壳渲染进程崩溃——全窗口重建

> 壳渲染进程跑 loader.ts（plugin.json 解析 + glob 构建）+ tabState + 命令分发——它崩了，tabState 随之丢失。E5.6 有"壳崩 → 重建 BrowserWindow"一行，E5.7 必须补上完整恢复路径。

```
壳 renderer 崩溃
  → app.on('render-process-gone') 收到 BrowserWindow.webContents
  → 销毁旧 BrowserWindow（WCV 随窗口销毁）
  → createMainWindow()——复用应用启动路径（壳 index.html + WCV pool.html）
  → 壳从 workspace 持久化恢复 tabState → pushLayout
  → 若壳恢复的 tabState 为空/过期 → 主进程回放 lastLayout 快照兜底
  → Pool 插件重新 mount → Phase 12 的 IPC 注册通道让插件命令重新登记（闭环）
```

**与 Pool 崩溃的区别：** Pool 崩 = 壳活，tabState 不丢；壳崩 = 全灭，靠 workspace 持久化 + lastLayout 兜底。壳崩恢复质量依赖两件事：workspace 持久化（已有）和 Phase 12 的 IPC 注册闭环（完成前壳崩后插件命令注册会丢失——边缘场景，接受）。

### 9.4 心跳——简化

E5.6 需要多 Pool 各自心跳（`pool:ping`/`pool:pong` → 超时 10s → 重建该 Pool）。E5.7 只有一个 Pool：

```
主进程窗口管理：
  app.on('render-process-gone') → 直接重建（不需要心跳判断是哪个 Pool）
  可选：5s 心跳——renderer 无响应 → 主动 kill + 重建
```

---

## 10. 脱出窗口——同一代码，新进程

> 🔴 **2026-08-13 推迟到上架后 v1.3——版本更新点（用户决策）。** E5.7 发布 = 单窗口。本节保留为 v1.3 设计稿；开工前必读 [脱出窗口设计.md](脱出窗口/脱出窗口设计.md) 头部审计记录（状态迁移空白 / 壳想池画数据流 / VS Code"释放时判断"机制 / window:* sender 路由）。

### 10.1 脱出窗口的定义

用户拖标签页脱离主窗口 → 创建独立 BrowserWindow，内部加载同一个 Pool 代码。

```
┌───────────────────┐    ┌───────────────────┐
│ MainWindow        │    │ DetachedWindow    │
│ ┌───────────────┐ │    │ ┌───────────────┐ │
│ │ MainRenderer  │ │    │ │ MainRenderer  │ │
│ │ 只渲染剩余tabs │ │    │ │ 只渲染脱出tab │ │
│ └───────────────┘ │    │ └───────────────┘ │
└───────────────────┘    └───────────────────┘
```

### 10.2 实现

```typescript
// 壳——检测到拖拽出窗口边界
function detachTab(tabId: string) {
  // 1. 创建新 BrowserWindow（无边框，跟随鼠标）
  const detachedWin = new BrowserWindow({
    frame: false,
    transparent: true,  // 拖拽期间的半透明预览
  });

  // 2. 新 WCV
  const wcv = new WebContentsView({
    webPreferences: {
      preload: 'preload-pool.ts',  // ← 同一个 preload
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 3. 加载同一个 pool.html
  wcv.webContents.loadURL(`file://.../pool.html`);

  // 4. pool:ready → pushLayout——只包含脱出的 tab
  const detachedLayout: PoolLayout = {
    ...baseLayout,
    groups: [{ id: 'detached-1', flex: 1, activeTabId: tabId, tabs: [tab] }],
  };

  // 5. 脱离预览结束 → 变为正式窗口
  detachedWin.setBounds(...);
  detachedWin.show();
}
```

**脱出窗口关闭 → 销毁 BrowserWindow + WCV → tab 回归主窗口。** 和 E5.6 的 DetachedWindow 逻辑完全一致——区别是 E5.6 的脱出窗口需要复制 SidebarPool + MainPool 两个 WCV，E5.7 只有一个。

---

## 11. 消除了什么，保留了什么

### 11.1 消除清单

| 消除的 | E5.6 位置 | 代码量 | 原因 |
|:--|:--|:--|:--|
| **OverlayWindow 类** | `electron/overlay-window.ts` | ~400 行 | 单WCV = 无跨进程裁剪 → 不需要透明覆盖窗口 |
| **OverlayWindow BrowserWindow** | `electron/window-manager.ts` | ~50 行 | 同上 |
| **SidebarPool WCV 创建** | `electron/window-manager.ts` | ~80 行 | 侧栏变 MainPool 内部 zone |
| **SplitHandle WCV 渲染** | OverlayWindow 内部 | ~100 行 | 分隔线用 CSS div |
| **跨Pool IPC 路由** | main process + preload | ~50 行 | 只有 1 个 Pool |
| **pool.html zone 路由** | `src/pool/pool-main.tsx` | ~30 行 | 不再需要 `?zone=sidebar\|main` |
| **RENDERERS 注册表** | `src/pool/pool-main.tsx` | ~15 行 | 单入口——PoolZoneShell |
| **WindowManager 多Pool 管理** | `electron/window-manager.ts` | ~150 行 | 只管理 1 个 WCV |
| **setIgnoreMouseEvents 切换** | `electron/overlay-window.ts` | ~30 行 | 不需要——pointer-events CSS |
| **Shell DOM（TitleBar/IconBar/TabBar/StatusBar）** | `src/App.tsx` + `src/components/` | ~500 行 | 移入 PoolZoneShell React 组件 |
| **BottomPanelPool WCV 预留** | 未实现的设计 | — | PanelZone 是 MainPool 内部 zone |

**净删 ~1,400 行。**

### 11.2 保留清单

| 保留的 | 说明 |
|:--|:--|
| `preload-pool.ts` | window.linkdesk.* API——零改动 |
| `pushLayout` 协议 | 壳→池布局快照——`version: 1` → `version: 2`（字段更完整） |
| `PluginComponent` | 动态 import 插件入口——零改动 |
| `PluginErrorBoundary` | 单 tab 崩溃隔离——零改动 |
| `keep-alive`（CSS display 切换） | 标签页状态保持——零改动 |
| `SplitTree` + `computeLayout()` | 分屏树数据结构和渲染——零改动 |
| `GroupTabBar` | 标签栏组件——零改动（从壳移入 Pool） |
| `PoolLayout` 类型 | 类型定义——扩展字段，不删字段 |
| `pool.html` | 入口 HTML——去 zone 参数 |
| `src/pool/shared/` | 共享组件——零改动 |
| `src/pool/views/` | 壳视图组件——零改动 |
| `plugin.json` declares | 插件声明语法——零改动 |
| 所有插件代码 | **零改动** |

---

## 12. 目录树——E5.6现状 vs E5.7目标

### 12.1 E5.6 当前结构

```
src/pool/
├── pool-main.tsx              ← 按 zone 分发
├── shared/
│   ├── PluginComponent.tsx
│   ├── GroupTabBar.tsx
│   └── GroupTabBar.css
├── sidebar/
│   ├── SidebarRenderer.tsx
│   ├── PoolSectionStack.tsx
│   └── PoolToolbarSlot.tsx
├── main/
│   └── MainRenderer.tsx       ← 693 行——超级胶水
└── views/
    ├── ShellViewRenderer.tsx
    ├── WelcomePoolView.tsx
    ├── PluginDetailPoolView.tsx
    └── OutputPoolView.tsx

electron/
├── window-manager.ts          ← 3+ WCV 管理
├── overlay-window.ts          ← OverlayWindow 类
└── pool-layout.ts             ← pushLayout 协议
```

### 12.2 E5.7 目标结构

```
src/pool/
├── pool-main.tsx              ← 单入口——只创建 PoolZoneShell
├── PoolZoneShell.tsx          ← 🆕 唯一根组件——flex 布局所有 zone
│
├── zones/                     ← 🆕 每个 zone 一个文件
│   ├── TitleBarZone.tsx       ← 窗口标题栏
│   ├── IconBarZone.tsx        ← 图标栏
│   ├── SidebarZone.tsx        ← 侧栏（从 sidebar/SidebarRenderer.tsx 迁入）
│   ├── MainZone.tsx         ← 主区 + 每 panel GroupTabBar（从 main/MainRenderer.tsx 提取，#7 TabBarZone 取消）
│   ├── PanelZone.tsx          ← 底部面板
│   ├── StatusBarZone.tsx      ← 状态栏
│   ├── RightSidebarZone.tsx   ← 右侧面板（大纲/属性/AI Chat）
│   └── FloatingLayerHost.tsx  ← 浮层宿主（Toast/ContextMenu/QuickPick/Dialog）
│
├── shared/                    ← 不变
│   ├── PluginComponent.tsx
│   ├── GroupTabBar.tsx
│   └── GroupTabBar.css
│
├── hooks/                     ← 🆕 壳 hooks 迁入（原在 src/hooks/）
│   ├── useSidebarResize.ts    ← 侧栏拖拽宽度
│   ├── useSplitResize.ts      ← 分屏分隔线拖拽
│   ├── useDragReorder.ts      ← 标签页拖拽排序
│   ├── useTabDropPreview.ts   ← 分屏拖拽预览
│   └── useDragDetach.ts       ← 脱出窗口拖拽检测（🔴 推迟 v1.3）
│
└── views/                     ← 不变
    ├── ShellViewRenderer.tsx
    ├── WelcomePoolView.tsx
    ├── PluginDetailPoolView.tsx
    └── OutputPoolView.tsx

electron/                      ← 主进程——大幅瘦身
├── main-window.ts             ← 🆕 单窗口管理（替代 window-manager.ts）
├── push-layout.ts             ← pushLayout 协议（替代 pool-layout.ts）
├── crash-recovery.ts          ← 🆕 render-process-gone → 重建
└── (删除) overlay-window.ts   ← 不再需要
    (删除) window-manager.ts   ← 不再需要

删除：
├── src/pool/sidebar/          ← SidebarRenderer 搬入 zones/SidebarZone.tsx
├── src/pool/main/             ← MainRenderer 分解入 zones/MainZone.tsx + ...
├── src/components/ (壳 DOM)    ← 迁移入 zones/ 或共享 hooks
└── shell 渲染相关代码          ← App.tsx 中 TitleBar/IconBar/TabBar/StatusBar 渲染逻辑
```

> **splitTree.ts（原 src/hooks/）→ `src/core/utils/`**——分屏树纯操作，壳（tabState 分屏逻辑）与 Pool（MainZone computeLayout）双进程共用，不进 pool 目录（见壳目录规范 §1 utils）。

---

## 13. 对比表——四种架构

| 维度 | E5 壳 | E5.6 双Pool | **E5.7 极简Pool** | VS Code |
|:--|:--|:--|:--|:--|
| **BrowserWindow** | 1 | 2 (Main + Overlay) | **1** | 1 |
| **WebContentsView** | 0 (插件在壳) | 3 (Sidebar + Main + Overlay) | **1** (100%×100%) | 0 (iframe 隔离) |
| **渲染进程** | 1 | 4 (壳+Side+Main+Overlay) | **2** (壳状态 + Pool 渲染) | 3 (Main+Render+ExtHost) |
| **Sidebar 隔离** | 无 | 独立进程 | **PluginErrorBoundary** | 无（同workbench） |
| **安全层** | preload-shell（弱） | preload-pool（强） | **preload-pool（强）** | Extension Host API |
| **浮层方案** | CSS position:fixed | OverlayWindow BrowserWindow | **CSS position:fixed** | CSS position:fixed |
| **跨区通信** | ShellEvents emit | IPC + ShellEvents | **pushLayout（单向）** | Service + Event |
| **拖拽分隔线** | CSS div + mousemove | OverlayWindow + IPC setBounds | **CSS div + mousemove** | CSS div + mousemove |
| **Toast 锚定** | 壳 DOM bottom | ❓（无解——OverlayWindow是二进制） | **窗口 bottom-right** | `.monaco-workbench` bottom |
| **脱出窗口** | 不支持 | 新 Window + 2 WCV | **新 Window + 1 WCV（🔴 推迟 v1.3）** | 不支持原生的 |
| **崩溃恢复** | 重建 BrowserWindow | 每个 Pool 独立重建 | **重建 WCV（窗口 + 壳存活）** | 重建 renderer |
| **O(N)→O(1)** | N/A | ✅ (4 = O(1)) | **✅ (3 = O(1))** | ✅ (3 = O(1)) |
| **插件改动** | N/A | 0 行 | **0 行** | N/A |
| **进程边界复杂度** | 低 | 高 | **低** | 中 |
| **行数估算** | ~4,000 (壳+renderer) | E5 + ~350 | **E5.6 - ~1,400** | ~100,000+ |

---

## 14. 迁移路径概要

从 E5.6 当前状态（317/620 子任务 = 51%）→ E5.7 极简Pool：

```
Phase A: E5.6 归档——标废弃，向前引用 → E5.7
Phase 1: 壳 DOM 迁入 Pool——TitleBar/IconBar/TabBar/StatusBar 变 React Zone
Phase 2: SidebarPool 合并——SidebarRenderer → SidebarZone，删 SidebarPool WCV
Phase 3: OverlayWindow 消除——所有浮层用 position:fixed
Phase 4: Zone 分解——MainZone + PanelZone + RightSidebarZone
Phase 5: 突破边界的能力——脱出窗口 / 漂移面板 / 新窗口（🔴 推迟 v1.3）
Phase 6: 崩溃恢复——render-process-gone → 重建
Phase 7: 清理死代码——OverlayWindow + WindowManager + Shell DOM
Phase 8: 全量回归——七场景验证
```

完整执行清单见 [E5.7-执行清单.md](E5.7-执行清单.md)。

---

> **→ 执行清单：** [E5.7-执行清单.md](E5.7-执行清单.md)
> **← E5.6 双Pool 设计：** [01-Pool模型设计.md](../E5.6_Pool模型重构/01-Pool模型设计.md) (已标记废弃)
> **← 决策过程：** [MainPool内部解耦-Pool与Zone.md](../E5.6_Pool模型重构/MainPool/MainPool内部解耦-Pool与Zone.md)
