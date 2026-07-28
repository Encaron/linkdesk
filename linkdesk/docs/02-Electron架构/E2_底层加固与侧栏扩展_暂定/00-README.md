# E2 — 底层加固与侧栏扩展

> 2026-07-24~25。**E1 完成后 = E2。核心服务补齐 + 侧栏扩展位评估。** 🎉 36/40 完成，4 取消。
> E2d 取消——VS Code 源码确认侧栏单槽位，现有 `lastSidebar` 已正确。

---

## 子任务

| # | 内容 | 任务数 | 行数 |
|:--:|------|:--:|:--:|
| E2a | **ErrorBoundary 增强**——多进程前必须的兜底 | 6 | ~140 |
| E2b | **终端归一化**——串口能力从 Rust 搬到 Node.js 后的终端重构 | 8 | ~170/−105 |
| E2c | **核心服务补齐**——FileService / WorkspaceService / DialogService 等 | 22 | ~915 |
| E2d | ~~侧栏扩展位~~ | ❌ 取消 | — |

任务 ID 从 `#1` 到 `#23` + 子编号，跨子任务连续编号。

## 设计文档

| # | 文档 | 内容 |
|:--:|------|------|
| 1 | `01-E2a-ErrorBoundary增强.md` | ErrorBoundary 加 pluginId/重试 + 心跳 + 内存监控 |
| 2 | `02-E2b-终端归一化.md` | SerialContext 迁出 + 术语迁移 + 模块状态消灭 + 命令路由 |
| 3 | `03-E2c-基础设施缺口.md` | FileService / WorkspaceService / DialogService / Chord / KeybindingResolver / 模糊搜索 + G14 fix + 审计 |
| 4 | `04-E2d-侧栏扩展位.md` | ❌ 已取消——VS Code 单槽位 |
| 🔥 | `05-执行清单.md` | 全部任务执行记录 |

---

> **← 上一 Phase：** `../E1_Electron迁移_暂定/`
> **→ 下一 Phase：** `../E3_多WebView与壳收尾_暂定/`
