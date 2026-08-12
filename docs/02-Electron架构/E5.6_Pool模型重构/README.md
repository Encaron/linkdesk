# E5.6 Pool 模型重构——专题文档索引

> ## 🔴 已废弃——2026-08-12 架构切换至极简Pool
>
> **E5.6 冻结在 51%（317/644 子任务）。** 剩余任务已改号搬入 E5.7：
> [E5.7-执行清单.md](../E5.7_极简Pool/E5.7-执行清单.md) + [任务映射](../E5.7_极简Pool/迁移/E5.6到E5.7任务映射.md)。
> 本目录保留历史——keep-alive/分屏/PluginErrorBoundary/聪慧→哑数据流设计被 E5.7 继承。

---

> 2026-08-09。**从 Per-Tab WebView（O(N) 进程）重构为双Pool WebView 模型（O(1) 进程）。**
> SidebarPool + MainPool + OverlayWindow = 4 个 WebContentsView。进程 O(1)。
> **86 任务，16 Phase，串行执行。**

---

## 为什么是重构不是迁移

E5.5#9a-#9m 的 Per-Tab 代码不会被"搬"到新模型——会被**删掉**：

| 删掉的 E5.5#9 代码 | 留下的 |
|:--|:--|
| `useWebViewSync.ts` 全文件 ~270 行 | `SplitNode` 分屏树——搬到 MainPool |
| `rekeyInstance` / `findGraceInstance` / `cancelDestroy` | `linkdesk.*` API——全部不变 |
| `notifyReady` 流程 | `preload-plugin.ts`——去 notifyReady，加 `pool.onLayout` |
| `instanceId` 路由（15 个文件） | 壳的标签栏/状态栏——几乎不变 |
| `readyWebViewIds` / `webViewTimeout` 状态 | `MainContent.tsx` 的拖拽逻辑——搬到 OverlayWindow |
| `graceTimers` Map | `plugin.json` + `loader.ts`——不变 |

**插件代码零改动。** 编辑器、串口、文件树、市场、设置——它们不知道底层从 N 个 WebView 变成了 2 个 Pool。`window.linkdesk.*` 的签名不变。

---

## 文档导航

| 你要做什么 | 读这个 |
|:--|:--|
| 🔥 了解双Pool架构 | [`01-Pool模型设计.md`](01-Pool模型设计.md) — 架构全景、职责边界、PoolLayout 协议 |
| 🔥 执行任务 | [`E5.6-执行清单.md`](E5.6-执行清单.md) — **自包含，不参考E5.5**。86任务，16 Phase |
| 🔥 MainPool 设计 | [`MainPool/MainPool设计.md`](MainPool/MainPool设计.md) — MainRenderer、keep-alive、分屏、TabBar 插入点 |
| 🔥 MainPool 内部解耦 | [`MainPool/MainPool内部解耦-Pool与Zone.md`](MainPool/MainPool内部解耦-Pool与Zone.md) — **Pool vs Zone 决策规则** + 目录树规划 + E5 式 zone 分解 |
| 🔥 SidebarPool 设计 | [`SidebarPool/SidebarPool设计.md`](SidebarPool/SidebarPool设计.md) — SidebarRenderer、视图切换、折叠展开、图标栏通信 |
| 🔥 OverlayWindow 设计 | [`OverlayWindow/OverlayWindow设计.md`](OverlayWindow/OverlayWindow设计.md) — 浮层架构、鼠标穿透、z-index、分割线 |
| 🔥 崩溃恢复 | [`崩溃恢复/崩溃恢复设计.md`](崩溃恢复/崩溃恢复设计.md) — 心跳、SidebarPool/MainPool/OverlayWindow 恢复策略 |
| 🔥 双Pool实施细节 | [`双Pool骨架/双Pool架构实施.md`](双Pool骨架/双Pool架构实施.md) — WindowManager + pool.html + src/pool/ + preload-plugin.ts |
| 🔥 通信协议 | [`跨Pool交互/通信协议设计.md`](跨Pool交互/通信协议设计.md) — PoolLayout JSON 协议细节 |
| 🔥 跨Pool交互 | [`跨Pool交互/跨Pool通信方案.md`](跨Pool交互/跨Pool通信方案.md) — IconBar↔SidebarPool + 文件树↔MainPool + 事件广播 |
| 🔥 未来扩展预留 | [`可扩展性/多Pool扩展预留.md`](可扩展性/多Pool扩展预留.md) — 六位置三Pool类型 + 底部面板 + 三态互转 |
| 🔥 E5.5 任务对照 | [`审计与回退/E5.5任务保留对照.md`](审计与回退/E5.5任务保留对照.md) — E5.5 58 个任务→E5.6 映射 |
| 🔥 API 变更 + 补全 | [`API补全/API变更清单.md`](API补全/API变更清单.md) — pool.* 新命名空间 + 删 pluginViews |
| 🔥 Pool API 详情 | [`API补全/Pool模型API设计.md`](API补全/PoolModelAPI设计.md) — pool.* 新命名空间 + 补全 |
| 🔴 回退方案 | [`审计与回退/Per-Tab回退方案.md`](审计与回退/Per-Tab回退方案.md) — #9 代码哪些改/哪些删 |
| 🔴 通信链路审计 | [`审计与回退/通信链路审计.md`](审计与回退/通信链路审计.md) — 6 轮自查：22 ShellEvents + 10 CUSTOM_EVENTS + 17 IPC + 14 单例方法调用 ~67 断裂点 |
| 🔴 硬编码清扫 | [`硬编码消灭/硬编码清扫方案.md`](硬编码消灭/硬编码清扫方案.md) — MenuId/schema/enum/plugin-file-service |
| 📋 插件开发 | [`文档/插件开发指南-Pool版.md`](文档/插件开发指南-Pool版.md) — Pool 模型下的插件 API |

---

## 目录结构

```
E5.6_Pool模型重构/
├── README.md                           ← 本文件
├── E5.6-执行清单.md                    ← 🔥 进度唯一真相源——86任务，16 Phase
├── 01-Pool模型设计.md                  ← 架构全景（总览）
│
├── MainPool/
│   ├── MainPool设计.md                 ← MainRenderer、keep-alive、分屏、TabBar插入点
│   └── MainPool内部解耦-Pool与Zone.md   ← Pool vs Zone 决策 + 目录树 + E5式zone分解
├── SidebarPool/
│   └── SidebarPool设计.md              ← SidebarRenderer、视图切换、折叠展开、图标栏通信
├── OverlayWindow/
│   └── OverlayWindow设计.md            ← 浮层架构、鼠标穿透、z-index、分割线
├── 崩溃恢复/
│   └── 崩溃恢复设计.md                 ← 心跳、各Pool恢复策略、内存监控
│
├── 双Pool骨架/
│   └── 双Pool架构实施.md               ← WindowManager + pool.html + preload 代码细节
├── 跨Pool交互/
│   ├── 通信协议设计.md                 ← PoolLayout JSON 协议细节
│   └── 跨Pool通信方案.md               ← IconBar↔SidebarPool + 文件树↔MainPool + 事件广播
├── 可扩展性/
│   └── 多Pool扩展预留.md               ← 六位置三Pool类型 + 底部面板 + 三态互转
├── API补全/
│   ├── API变更清单.md                  ← pool.* 新命名空间 + 删 pluginViews
│   └── Pool模型API设计.md              ← IPC 通道一览
├── 审计与回退/
│   ├── Per-Tab回退方案.md              ← E5.6#0a 逐文件回退操作手册
│   ├── E5.5任务保留对照.md             ← E5.5 58任务→E5.6 映射
│   └── 通信链路审计.md                 ← E5.6#0b 6 轮自查——22 ShellEvents + 10 CUSTOM_EVENTS + 17 IPC + 14 单例 ~67 断裂点
├── 硬编码消灭/
│   └── 硬编码清扫方案.md               ← MenuId/schema/enum/plugin-file-service
├── 回归验证/
│   └── 全量回归矩阵.md                 ← 七场景全量回归
└── 文档/
    └── 插件开发指南-Pool版.md          ← Pool模型下的插件开发指南
```

---

## 关键数据

**净删代码：** ~480 行（删 E5.5#9a-#9m 的 instanceId 路由 + 宽限期 + rekey + useWebViewSync）

**新增代码：** ~350 行（pool.html + src/pool/pool-main.tsx + 双Pool管理 + OverlayWindow 拖拽线 + pool.* API）

**进程数：** O(N) → O(1)。开 1 个文件 = 4 进程。开 30 个文件 = 还是 4 进程。

**插件改动：** 0 行。编辑器/串口/文件树/市场/设置——`window.linkdesk.*` 签名完全不变。

**任务数：** 86 个，16 Phase，预估 15-22 天。

---

> **← 上一 Phase：** `../E5.5_多WebView恢复/`
> **→ 下一 Phase：** `../E6_插件生态与发布/`
