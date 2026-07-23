# 09 — Phase 重排：Tauri 旧编号 → Electron E 编号 任务映射

> 2026-07-24。Tauri P5.5 结束即迁移——新框架从 E1 开始，原 Phase 6 与原 Phase 7 拆分重组到 E2 和 E3。
> **E2 = 底层加固 + 侧栏扩展位。E3 = 多 WebView + 壳收尾（架构最后一站）。E 编号从 1 开始——新框架，新编号。**
> **此文档是重排的权威映射——之后所有文档按 E 编号引用。**

---

## 一、为什么重排——以及为什么是三期不是两期

**Tauri P6 封存 → 立刻迁移。** 迁移本身就是 Phase 量级的工作。

原 P6（底层加固）+ 原 P7（多 WebView + 编辑能力）如果合并为一个 Phase——太大，拆不开验证。而且两者性质不同：P6 是"核心服务补齐"，P7 是"多进程隔离基础设施"。中间还缺一个关键步骤——**侧栏扩展位**。文件树需要侧栏能挂常驻面板——这是壳改动，不是插件改动。

**拆成三期，每期有独立可验证的完工标准：**

| 新编号 | 内容 | 完工标准 |
|---|---|---|
| **E1** | Electron 迁移 | 软件行为与迁移前 100% 一致 |
| **E2** | 底层加固 + 侧栏扩展位 | ErrorBoundary 全覆盖 + 侧栏支持常驻面板（写一个最小文件树验证） |
| **E3** | 多 WebView + 主题/语言 + Profile | 多进程隔离就绪 + 主题/语言跨进程同步 + 壳收尾。**架构完工。** |

---

## 二、新旧映射总表

### E1 —— Electron 迁移

| 旧编号 | 内容 | 去向 |
|---|---|---|
| Phase 5.6 | Electron 迁移 7 步 | → **E1** |
| ~~phase7_PlanB_迁移electron/~~ | 已删除——内容已吸收到 E1 | → `E1_Electron迁移_暂定/` |

### E2 —— 底层加固 + 侧栏扩展位

| 旧编号 | 旧内容 | 去向 | 变化 |
|---|---|---|---|
| **Phase 6a** | ErrorBoundary 增强 | → **E2a** | 不变——纯 TS/React |
| **Phase 6b** | 终端归一化 | → **E2b** | 不变——serialport npm 替代 Rust |
| **Phase 6c** | FileService / WorkspaceService / DialogService | → **E2c** | 不变——window.linkdesk 替代 @tauri-apps |
| **Phase 6d** | Rust 命令插件化 | → **删除** | 目标自动达成——Rust 消失 |
| 🆕 | **侧栏扩展位设计** | → **E2d** | 新设计——侧栏支持 persistent 面板 |

### E3 —— 多 WebView + 壳收尾（架构最后一站）

| 旧编号 | 旧内容 | 去向 | 变化 |
|---|---|---|---|
| **Phase 7a** | 多 WebView | → **E3a** | API 变——WebContentsView（stable）替代 add_child（unstable） |
| **Phase 7c** | 主题/语言引擎插件化 | → **E3b + E3c** | 拆为两子任务——主题跨进程广播 + 语言跨进程同步 |
| **Phase 7d** | Profile + 壳完善 | → **E3d** | 不变——纯 TS/React |

### 从编号移除——降级为插件文件夹

| 旧编号 | 旧内容 | 去向 | 原因 |
|---|---|---|---|
| **Phase 7b** | 文件树 + Monaco 编辑器 | → `03-插件制造/插件_文件树与编辑器_暂定/` | 纯消费者插件——不改变架构 |
| **Phase 8** | 卡片工作台 + OLED | → `03-插件制造/插件_工作台与OLED_暂定/` | 纯消费者插件——不改变架构 |

---

## 三、视觉对比

### 旧路线图（Tauri 时代）

```
Tauri P5.5 bug 修复
    │
Phase 6 (底层加固，Tauri 上)
    │
Phase 7 (多 WebView + 编辑能力，Tauri 上，add_child unstable)
    │
Phase 8 (卡片工作台 + OLED)
```

### 新路线图（Electron 时代——E 编号从 1 开始）

```
Tauri P1-P6  ← 01-Tauri_ 封存
    │
E1: Electron 迁移  ← 🔥 换地基
    │
E2: 底层加固 + 侧栏扩展位
    │      E2a: ErrorBoundary（原 6a）
    │      E2b: 终端归一化（原 6b）
    │      E2c: FileService 等（原 6c）
    │      E2d: 侧栏扩展位（🆕 新设计）
    │
E3: 多 WebView + 壳收尾  ← 🏁 架构完工
    │      E3a: 多 WebView（原 7a）
    │      E3b: 主题引擎跨进程（原 7c 主题部分）
    │      E3c: 语言引擎跨进程（原 7c 语言部分）
    │      E3d: Profile + 壳完善（原 7d）
    │
────── E 编号到此为止 ──────
    │
插件_文件树与编辑器/      ← 原 7b
插件_工作台与OLED/        ← 原 P8
插件_地图/               ← 来了就做  ...
```

---

## 四、E2 和 E3 的内部依赖顺序

### E2：底层加固 + 侧栏扩展位

```
E2a: ErrorBoundary 增强  ← 先做——多进程前必须的兜底
    │
E2b: 终端归一化          ← 依赖 E2a
    │
E2c: FileService 等       ← 依赖 E2b（StorageService 底层已稳定）
    │
E2d: 侧栏扩展位           ← 依赖 E2a（ErrorBoundary 兜底）
                          独立于 E2b/E2c——可以并行
```

### E3：多 WebView + 壳收尾

```
E3a: 多 WebView           ← 依赖 E2a（ErrorBoundary）
    │
    ├── E3b: 主题引擎跨进程  ← 依赖 E3a（多 View 才能跨进程广播）
    │
    ├── E3c: 语言引擎跨进程  ← 依赖 E3a
    │
    └── E3d: Profile + 壳完善  ← 依赖 E3a+E3b+E3c（壳层面收尾）
```

---

## 五、文档索引

| 文件夹 | 对应 | 说明 |
|---|---|---|
| `docs/02-Electron架构/E1_Electron迁移_暂定/` | **E1** 设计文档 | 迁移方案——Tauri → Electron |
| `docs/02-Electron架构/E2_底层加固与侧栏扩展_暂定/` | **E2** 设计文档 | 核心服务补齐 + 侧栏扩展位 |
| `docs/02-Electron架构/E3_多WebView与壳收尾_暂定/` | **E3** 设计文档 | 多进程隔离 + 壳收尾。架构终点 |
| `docs/02-Electron架构/插件_文件树与编辑器_暂定/` | 插件 | 第一批消费者插件 |
| `docs/03-插件制造/插件_工作台与OLED_暂定/` | 插件 | 第二批消费者插件 |
| ~~phase6_底层加固/~~ | 已删除 | 内容已吸收到 E2a-E2c |
| ~~phase7_多WebView与编辑能力/~~ | 已删除 | 内容已吸收到 E3a-E3d + 插件 |
| ~~phase7_PlanB_迁移electron/~~ | 已删除 | 内容已吸收到 E1 |
| ~~phase8_工作台与OLED/~~ | 已删除 | 内容已吸收到插件_工作台与OLED_暂定 |

---

## 六、这份重排节省了什么

| 节省 | 说明 |
|---|---|
| **原 Phase 6d 跳过** | 不需要写 400 行 Rust 插件化代码再删——迁移直接达成目标 |
| **E3 第一天就用 stable API** | `WebContentsView` 替代 `add_child`——不需要先跟 unstable API 搏斗 |
| **文件树/Monaco 不再占用架构编号** | 它们是插件——E2d 给它们挖好坑位，它们来用就行 |
| **E 编号从 1 开始，到 3 为止** | 新框架，新编号。此后任何新功能 = 写插件。来一个建一个 `插件_xxx/` 文件夹，不排序、不顺延 |
| **三期每期可独立验证** | E1 = 行为不变，E2 = 侧栏能挂文件树，E3 = 多进程隔离就绪 |

---

> **上一份：** `08-多WebView-vs-ExtHost-开销对比.md`
> **E1 全部文档索引：** 见 `00-README.md`
