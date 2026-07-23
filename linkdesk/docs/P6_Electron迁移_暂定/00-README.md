# P6 — Electron 迁移

> 2026-07-24。**Phase 5.5 修完 bug → Phase 6 = 换地基。**
> 此文件夹是迁移方案的执行文档。完整设计见 `phase7_PlanB_迁移electron/`（存档）。

---

## 定位

| | |
|---|---|
| Phase | **6**——换地基 |
| 输入 | Phase 5.5 + tsc 零错 + vitest 全过 |
| 输出 | Electron 桌面应用，功能与迁移前 100% 一致 |
| 工时 | ~16h AI |
| 分支 | `phase6-electron`（活跃）+ `phase6-tauri`（冻结退路） |

## 迁移内容

Tauri Rust 后端（751 行）→ Node.js（~1,300 行新文件）：
- 串口：Rust `serialport-rs` → Node.js `serialport` npm
- 文件系统：`@tauri-apps/plugin-fs` → `window.linkdesk.filesystem`
- 插件管理：Rust `plugins.rs` → Node.js `plugin-file-service.ts`
- 配置：Rust 配置读写 → Node.js `config-service.ts`
- 协议：`plugin://` → `linkdesk://`

7 个前端文件 ~50 处 `invoke()` → `window.linkdesk.*`。

## 迁移后什么不变

| 层 | 状态 |
|---|---|
| 壳 UI（图标栏/侧栏/标签栏/分屏/状态栏） | 100% 保留 |
| 核心服务（CommandRegistry / ConfigurationRegistry / MenuRegistry / ThemeEngine...） | 100% 保留 |
| 4 个插件 React 组件 | 一行不动 |
| CSS 变量体系 | 不变 |
| i18n 体系 | 不变 |
| 测试 | 全部保留 |

## 完成后

→ 进入 **P7 底层加固与侧栏扩展**

---

## 文档索引

| # | 文档 | 来源 |
|---|---|---|
| 1 | 设计概述 | `phase7_PlanB_迁移electron/01-设计概述.md` |
| 2 | 插件隔离模型 | `phase7_PlanB_迁移electron/02-插件隔离模型.md` |
| 3 | 插件入口方案 | `phase7_PlanB_迁移electron/03-插件入口方案.md` |
| 4 | 迁移方案 | `phase7_PlanB_迁移electron/04-迁移方案.md` |
| 5 | API 与协议设计 | `phase7_PlanB_迁移electron/05-API与协议设计.md` |
| 6 | 实施顺序 | `phase7_PlanB_迁移electron/06-实施顺序.md` |
| 7 | 体积与内存分析 | `phase7_PlanB_迁移electron/07-体积与内存分析.md` |
| 8 | 多WebView vs ExtHost 开销对比 | `phase7_PlanB_迁移electron/08-多WebView-vs-ExtHost-开销对比.md` |
| 9 | Phase 重排任务映射 | `phase7_PlanB_迁移electron/09-Phase重排-任务映射.md` |

> **原始讨论存档：** `../phase7_PlanB_迁移electron/`
