# 09 — Phase 重排：原 P6/P7 → 新 P6/P7 任务映射

> 2026-07-24。Phase 5.5 结束即迁移——迁移提升为 Phase 6，原 Phase 6 与原 Phase 7 合并重组为新 Phase 7。
> **此文档是重排的权威映射——之后所有文档按新编号引用。**

---

## 一、为什么重排

**Phase 5.5 修完 bug → 立刻迁移。** 这个决策改变了 Phase 编号：

| 旧编号 | 旧定位 | 发生什么 |
|---|---|---|
| Phase 5.6 | "迁移"——被当成 Phase 5 的尾巴 | 迁移不是"补丁"——是整个后端的替换。值得一个独立的 Phase 编号 |
| Phase 6 | 底层加固——零新功能 | 推迟到迁移后，在新框架上做 |
| Phase 7 | 多 WebView + 编辑能力 | 推迟，在新框架上用 stable API 做 |

迁移本身就是 Phase 量级的工作——删除一种语言（Rust）、新增一个框架（Electron）、替换约 20 处 API 调用、新增 ~15 个文件。它不是一个"Phase 5.x"的小步。

**新编号反映真实工作量：Phase 6 = 迁移，Phase 7 = 原 P6 底层加固 + 原 P7 多 WebView 编辑能力。**

---

## 二、新旧映射总表

### Phase 6（新）—— Electron 迁移

| 旧编号 | 内容 | 去向 |
|---|---|---|
| Phase 5.6 | Electron 迁移 7 步 | → **新 Phase 6** |
| `phase7_PlanB_迁移electron/` | 全部迁移设计文档 | → **新 Phase 6 设计文档** |

### Phase 7（新）—— 底层加固 + 多 WebView + 编辑能力

| 旧编号 | 旧内容 | 去向 | 变化 |
|---|---|---|---|
| **Phase 6a** | ErrorBoundary 增强 | → 新 Phase 7 | **不变**——纯 TS/React，框架无关 |
| **Phase 6b** | 终端归一化 | → 新 Phase 7 | **不变**——`serialport` npm 替代 Rust `serialport-rs` |
| **Phase 6c** | FileService / WorkspaceService / DialogService | → 新 Phase 7 | **不变**——`window.linkdesk.filesystem` 替代 `@tauri-apps/plugin-fs` |
| **Phase 6d** | Rust 命令插件化 | → **删除** | 目标自动达成——Rust 后端整个消失，Node.js serialport 天然独立 |
| **Phase 7a** | 多 WebView | → 新 Phase 7 | API 变了——`WebContentsView`（stable）替代 `add_child`（unstable） |
| **Phase 7b** | 文件树 + Monaco 编辑器 | → 新 Phase 7 | **不变**——纯 UI 插件，框架无关 |
| **Phase 7c** | 主题/语言引擎插件化 | → 新 Phase 7 | **不变**——纯 TS，框架无关 |
| **Phase 7d** | Profile + 壳完善 | → 新 Phase 7 | **不变**——纯 TS/React，框架无关 |

### Phase 8（不变）

| 旧编号 | 内容 | 去向 |
|---|---|---|
| Phase 8 | 卡片工作台 + OLED | → **新 Phase 8**——不变，纯消费者插件，框架无关 |

---

## 三、视觉对比

### 旧路线图

```
Phase 5.5 bug 修复
    │
Phase 6a-c (底层加固，Tauri 上)
Phase 6d (Rust 插件化，Tauri 上)
    │
Phase 7 (多 WebView + 编辑能力，Tauri 上，add_child unstable)
    │
Phase 8 (框架无关)
```

### 新路线图

```
Phase 5.5 bug 修复
    │
Phase 6: Electron 迁移  ← 🔥 迁移本身成为独立 Phase
    │
Phase 7: 底层加固 + 多 WebView + 编辑能力
    │      ├── 7a: ErrorBoundary 增强
    │      ├── 7b: 终端归一化
    │      ├── 7c: FileService / WorkspaceService / DialogService
    │      ├── 7d: 多 WebView（WebContentsView，stable）
    │      ├── 7e: 文件树 + Monaco 编辑器
    │      ├── 7f: 主题/语言引擎插件化
    │      └── 7g: Profile + 壳完善
    │
Phase 8: 卡片工作台 + OLED
```

---

## 四、Phase 7 的内部顺序

Phase 7 合并了原 P6 和原 P7，内部有先后依赖：

```
Phase 7a: ErrorBoundary 增强  ← 先做——迁移后第一件事，兜底
    │
Phase 7b: 终端归一化          ← 依赖 7a 的 ErrorBoundary
    │
Phase 7c: FileService 等       ← 依赖 7b（StorageService 底层已稳定）
    │
Phase 7d: 多 WebView           ← 依赖 7a（ErrorBoundary 兜底多进程）
    │
Phase 7e: 文件树 + Monaco      ← 依赖 7d（Monaco 需要独立 WebContentsView）
    │
Phase 7f: 主题/语言引擎        ← 依赖 7d（多 WebView 需要广播主题变量）
    │
Phase 7g: Profile + 壳完善     ← 依赖 7e + 7f（壳层面收尾）
```

---

## 五、文档索引更新

| 文件夹 | 对应 Phase | 说明 |
|---|---|---|
| `docs/phase7_PlanB_迁移electron/` | **Phase 6** 设计文档 | 文件夹名保留（含历史讨论），内容按新 Phase 6 理解 |
| `docs/phase7_多WebView与编辑能力/` | **Phase 7** 参考文档 | 原分析仍然有效——七个坑、框架对比、架构切换分析 |
| `docs/phase6_底层加固/` | **Phase 7a-c** 参考文档 | 原设计仍然有效——只是执行框架从 Tauri 变为 Electron |

---

## 六、这份重排节省了什么

| 节省 | 说明 |
|---|---|
| **Phase 6d 跳过** | 不需要写 400 行 Rust 插件化代码再删——迁移直接达成目标 |
| **Phase 7 第一天就用 stable API** | `WebContentsView` 替代 `add_child`——不需要先跟 unstable API 搏斗 |
| **原 P6 和原 P7 不重复碰同一批文件** | `invoke()` → `window.linkdesk` 在 Phase 6 一次性改完——Phase 7 的新代码直接在正确的 API 上写 |

---

> **上一份：** `08-多WebView-vs-ExtHost-开销对比.md`
> **全部文档索引：** 见 `README.md`
