# E1 — Electron 迁移

> 2026-07-24。**Tauri P6 封存 → E1 = 换地基。**

---

## 定位

| | |
|---|---|
| Phase | **E1**——换地基 |
| 输入 | Tauri P6 + tsc 零错 + vitest 全过 |
| 输出 | Electron 桌面应用，功能与迁移前 100% 一致 |
| 工时 | ~16h AI |
| 分支 | `electron`（活跃）+ `phase6`（Tauri 冻结退路） |

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

→ 进入 **E2 底层加固与侧栏扩展**

---

## 文档索引

| # | 文档 | 内容 |
|---|---|---|
| 1 | `01-设计概述.md` | 总体设计、三个架构决策、变与不变 |
| 2 | `02-插件隔离模型.md` | 为什么独立 WebContentsView 而非共享 ExtHost |
| 3 | `03-插件入口方案.md` | React 组件 vs activate()——利弊与选择 |
| 4 | `04-迁移方案.md` | 逐文件迁移范围、7 步执行计划 |
| 5 | `05-API与协议设计.md` | window.linkdesk / preload / linkdesk:// |
| 6 | `06-实施顺序.md` | 完整 E1→E2→E3 执行分层 + 纪律 + 预案 |
| 7 | `07-体积与内存分析.md` | 安装包体积 + 运行时内存真实数字 |
| 8 | `08-多WebView-vs-ExtHost-开销对比.md` | 冷冰冰的数字——独立 WebContentsView vs 共享 ExtHost |
| 9 | `09-Phase重排-任务映射.md` | Tauri 旧编号 → Electron E 编号权威对照 |
