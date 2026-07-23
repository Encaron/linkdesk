# 09 — Phase 重排：原 P6/P7 → 新 P6/P7/P8 任务映射

> 2026-07-24。Phase 5.5 结束即迁移——迁移提升为 Phase 6，原 Phase 6 与原 Phase 7 拆分重组。
> **新 P7 = 底层加固 + 侧栏扩展位。新 P8 = 多 WebView + 壳收尾（架构最后一站）。**
> **此文档是重排的权威映射——之后所有文档按新编号引用。**

---

## 一、为什么重排——以及为什么是三期不是两期

**Phase 5.5 修完 bug → 立刻迁移。** 迁移本身就是 Phase 量级的工作。

原 P6（底层加固）+ 原 P7（多 WebView + 编辑能力）如果合并为一个 Phase——太大，拆不开验证。而且两者性质不同：P6 是"核心服务补齐"，P7 是"多进程隔离基础设施"。中间还缺一个关键步骤——**侧栏扩展位**。文件树需要侧栏能挂常驻面板——这是壳改动，不是插件改动。

**拆成三期，每期有独立可验证的完工标准：**

| 新 Phase | 内容 | 完工标准 |
|---|---|---|
| **P6** | Electron 迁移 | 软件行为与迁移前 100% 一致 |
| **P7** | 底层加固 + 侧栏扩展位 | ErrorBoundary 全覆盖 + 侧栏支持常驻面板（写一个最小文件树验证） |
| **P8** | 多 WebView + 主题/语言 + Profile | 多进程隔离就绪 + 主题/语言跨进程同步 + 壳收尾。**架构完工。** |

---

## 二、新旧映射总表

### Phase 6（新）—— Electron 迁移

| 旧编号 | 内容 | 去向 |
|---|---|---|
| Phase 5.6 | Electron 迁移 7 步 | → **新 Phase 6** |
| `phase7_PlanB_迁移electron/` | 全部迁移设计文档 | → `P6_Electron迁移_暂定/` |

### Phase 7（新）—— 底层加固 + 侧栏扩展位

| 旧编号 | 旧内容 | 去向 | 变化 |
|---|---|---|---|
| **Phase 6a** | ErrorBoundary 增强 | → **P7a** | 不变——纯 TS/React |
| **Phase 6b** | 终端归一化 | → **P7b** | 不变——serialport npm 替代 Rust |
| **Phase 6c** | FileService / WorkspaceService / DialogService | → **P7c** | 不变——window.linkdesk 替代 @tauri-apps |
| **Phase 6d** | Rust 命令插件化 | → **删除** | 目标自动达成——Rust 消失 |
| 🆕 | **侧栏扩展位设计** | → **P7d** | 新设计——侧栏支持 persistent 面板 |

### Phase 8（新）—— 多 WebView + 壳收尾（架构最后一站）

| 旧编号 | 旧内容 | 去向 | 变化 |
|---|---|---|---|
| **Phase 7a** | 多 WebView | → **P8a** | API 变——WebContentsView（stable）替代 add_child（unstable） |
| **Phase 7c** | 主题/语言引擎插件化 | → **P8b + P8c** | 拆为两子任务——主题跨进程广播 + 语言跨进程同步 |
| **Phase 7d** | Profile + 壳完善 | → **P8d** | 不变——纯 TS/React |

### 从 P 编号移除——降级为插件文件夹

| 旧编号 | 旧内容 | 去向 | 原因 |
|---|---|---|---|
| **Phase 7b** | 文件树 + Monaco 编辑器 | → `插件_文件树与编辑器_暂定/` | 纯消费者插件——不改变架构 |
| **Phase 8** | 卡片工作台 + OLED | → `插件_工作台与OLED_暂定/` | 纯消费者插件——不改变架构 |

---

## 三、视觉对比

### 旧路线图

```
Phase 5.5 bug 修复
    │
Phase 6 (底层加固，Tauri 上)
    │
Phase 7 (多 WebView + 编辑能力，Tauri 上，add_child unstable)
    │
Phase 8 (卡片工作台 + OLED)
```

### 新路线图

```
Phase 5.5 bug 修复
    │
Phase 6: Electron 迁移  ← 🔥 换地基
    │
Phase 7: 底层加固 + 侧栏扩展位
    │      7a: ErrorBoundary（原 6a）
    │      7b: 终端归一化（原 6b）
    │      7c: FileService 等（原 6c）
    │      7d: 侧栏扩展位（🆕 新设计）
    │
Phase 8: 多 WebView + 壳收尾  ← 🏁 架构完工
    │      8a: 多 WebView（原 7a）
    │      8b: 主题引擎跨进程（原 7c 主题部分）
    │      8c: 语言引擎跨进程（原 7c 语言部分）
    │      8d: Profile + 壳完善（原 7d）
    │
────── P 编号到此为止 ──────
    │
插件_文件树与编辑器/      ← 原 7b
插件_工作台与OLED/        ← 原 P8
插件_地图/               ← 来了就做  ...
```

---

## 四、P7 和 P8 的内部依赖顺序

### P7：底层加固 + 侧栏扩展位

```
P7a: ErrorBoundary 增强  ← 先做——多进程前必须的兜底
    │
P7b: 终端归一化          ← 依赖 P7a
    │
P7c: FileService 等       ← 依赖 P7b（StorageService 底层已稳定）
    │
P7d: 侧栏扩展位           ← 依赖 P7a（ErrorBoundary 兜底）
                          独立于 P7b/P7c——可以并行
```

### P8：多 WebView + 壳收尾

```
P8a: 多 WebView           ← 依赖 P7a（ErrorBoundary）
    │
    ├── P8b: 主题引擎跨进程  ← 依赖 P8a（多 View 才能跨进程广播）
    │
    ├── P8c: 语言引擎跨进程  ← 依赖 P8a
    │
    └── P8d: Profile + 壳完善  ← 依赖 P8a+P8b+P8c（壳层面收尾）
```

---

## 五、文档索引

| 文件夹 | 对应 Phase | 说明 |
|---|---|---|
| `docs/P6_Electron迁移_暂定/` | **Phase 6** 设计文档 | 迁移方案——Tauri → Electron |
| `docs/P7_底层加固与侧栏扩展_暂定/` | **Phase 7** 设计文档 | 核心服务补齐 + 侧栏扩展位 |
| `docs/P8_多WebView与壳收尾_暂定/` | **Phase 8** 设计文档 | 多进程隔离 + 壳收尾。架构终点 |
| `docs/插件_文件树与编辑器_暂定/` | 插件 | 第一批消费者插件 |
| `docs/插件_工作台与OLED_暂定/` | 插件 | 第二批消费者插件 |
| `docs/phase6_底层加固/` | 📦 存档 | 原 P6 设计——仍在 P7 中引用 |
| `docs/phase7_多WebView与编辑能力/` | 📦 存档 | 原 P7 设计——七个坑分析仍有效 |
| `docs/phase7_PlanB_迁移electron/` | 📦 存档 | 迁移方案原始讨论 |
| `docs/phase8_工作台与OLED/` | 📦 存档 | 原 P8 设计 |

---

## 六、这份重排节省了什么

| 节省 | 说明 |
|---|---|
| **Phase 6d 跳过** | 不需要写 400 行 Rust 插件化代码再删——迁移直接达成目标 |
| **P8 第一天就用 stable API** | `WebContentsView` 替代 `add_child`——不需要先跟 unstable API 搏斗 |
| **文件树/Monaco 不再占用架构编号** | 它们是插件——P7d 给它们挖好坑位，它们来用就行 |
| **P 编号到 P8 为止** | 此后任何新功能 = 写插件。来一个建一个 `插件_xxx/` 文件夹，不排序、不顺延 |
| **三期每期可独立验证** | P6 = 行为不变，P7 = 侧栏能挂文件树，P8 = 多进程隔离就绪 |

---

> **上一份：** `08-多WebView-vs-ExtHost-开销对比.md`
> **全部文档索引：** 见 `00-README.md`
