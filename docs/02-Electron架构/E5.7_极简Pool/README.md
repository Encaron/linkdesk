# E5.7 极简Pool——专题文档索引

> 2026-08-12。**1 BrowserWindow + 1 WebContentsView（100%×100%）+ preload-pool.ts 沙箱 + 主进程崩溃恢复。**
> 从 E5.6 双Pool（SidebarPool + MainPool + OverlayWindow）简化而来——进程边界 → 单 DOM，安全靠 preload 沙箱。
> **94 主任务，16 Phase，串行执行。插件代码零改动。**

---

## 为什么极简

E5.6 双Pool 的原始动机是安全——侧栏插件不能带崩编辑器。但追根溯源：真正的安全问题（插件访问 Node.js API）由 **preload-pool.ts 沙箱** 解决（`nodeIntegration: false` + `contextIsolation: true` + 只暴露 `window.linkdesk.*`），和进程数无关。双Pool 换来的进程隔离代价是 OverlayWindow + 跨Pool IPC + 3 个 WCV 生命周期——全部在极简Pool 中消失。

> 📖 完整推导链 → [01-极简Pool设计.md §1](01-极简Pool设计.md#1-起源从双pool到极简pool的推导链)

---

## 文档导航

| 你要做什么 | 读这个 |
|:--|:--|
| 🔥 了解极简Pool架构 | [`01-极简Pool设计.md`](01-极简Pool设计.md) — 架构全景、Zone 分解、安全模型、对比表 |
| 🔥 执行任务 | [`E5.7-执行清单.md`](E5.7-执行清单.md) — **进度唯一真相源**。94 主任务，16 Phase |
| 🔥 Zone 分解 | [`Zone系统/Zone分解设计.md`](Zone系统/Zone分解设计.md) — 每个 Zone 的职责/Props/CSS/与壳关系 |
| 🔥 浮层归一化 | [`浮层系统/浮层归一化设计.md`](浮层系统/浮层归一化设计.md) — FloatingLayerHost + ContextMenu/QuickPick/Toast/Dialog |
| 🔥 脱出窗口 | [`脱出窗口/脱出窗口设计.md`](脱出窗口/脱出窗口设计.md) — 拖出主窗口 + 漂移面板 + 新窗口 |
| 🔥 崩溃恢复 | [`崩溃恢复/单Pool崩溃恢复设计.md`](崩溃恢复/单Pool崩溃恢复设计.md) — render-process-gone → 重建 + Hot Exit |
| 🔥 清理方案 | [`清理/清理方案.md`](清理/清理方案.md) — Per-Tab 遗留 + 双Pool 死代码清单 |
| 🔥 Registry 主进程化 | [`Registry主进程化/Registry主进程化设计.md`](Registry主进程化/Registry主进程化设计.md) — 消灭跨进程数据隔离 bug 类 |
| 🔥 API 变更 | [`API补全/API变更清单.md`](API补全/API变更清单.md) — pool.* 简化 + 10 命名空间补全 |
| 🔥 硬编码清扫 | [`硬编码消灭/硬编码清扫方案.md`](硬编码消灭/硬编码清扫方案.md) — MenuId enum + schema + plugin-file-service |
| 🔥 回归验证 | [`回归验证/全量回归矩阵.md`](回归验证/全量回归矩阵.md) — 十场景验证 |
| 🔥 E5.6→E5.7 映射 | [`迁移/E5.6到E5.7任务映射.md`](迁移/E5.6到E5.7任务映射.md) — 哪些任务直接搬/适配搬/删除 |

---

## 目录结构

```
E5.7_极简Pool/
├── README.md                           ← 本文件
├── E5.7-执行清单.md                    ← 🔥 进度唯一真相源——93主任务，16 Phase
├── 01-极简Pool设计.md                  ← 架构全景（总览）
│
├── Zone系统/
│   └── Zone分解设计.md                 ← 10 个 Zone 的职责/Props/CSS + 加Zone三步
├── 浮层系统/
│   └── 浮层归一化设计.md               ← FloatingLayerHost + z-index + 4 浮层设计
├── 脱出窗口/
│   └── 脱出窗口设计.md                 ← detachTab + useDragDetach + 漂移面板
├── 崩溃恢复/
│   └── 单Pool崩溃恢复设计.md           ← render-process-gone + 心跳 + Hot Exit
├── 清理/
│   └── 清理方案.md                     ← Per-Tab 遗留 + 双Pool 死代码 + ESLint 防线
├── Registry主进程化/
│   └── Registry主进程化设计.md         ← plugin.json 预加载 + 迁移范围
├── API补全/
│   └── API变更清单.md                  ← pool.* 简化 + 删 pluginViews/pluginInstance
├── 硬编码消灭/
│   └── 硬编码清扫方案.md               ← MenuId enum + schema enum + 开放化
├── 迁移/
│   └── E5.6到E5.7任务映射.md           ← E5.6 剩余 327 子任务的分流对照
└── 回归验证/
    └── 全量回归矩阵.md                 ← 十场景全量回归
```

---

## 关键数据

**进程数：** 3（主进程 + 壳状态进程 + Pool 渲染进程）——开 30 个文件还是 3 进程。壳想（状态），池画（渲染）。

**净删代码：** ~1,400 行（OverlayWindow ~400 + Shell DOM ~500 + 双Pool 管理 ~350 + 其他）。

**插件改动：** 0 行。编辑器/串口/文件树/市场/设置——`window.linkdesk.*` 签名完全不变。

**任务数：** 93 个主任务，16 Phase。其中 ~110 子任务从 E5.6 直接搬入（清理/Registry/硬编码/ESLint/E6前置），~140 子任务适配搬入（浮层/崩溃恢复/Zone/API/缩放/回归）。

---

> **← 上一 Phase：** `../E5.6_Pool模型重构/`（已封存——执行到 51%，剩余任务按映射表流入 E5.7）
> **→ 下一 Phase：** `../E6_插件生态与发布/`
