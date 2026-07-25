# E2 — 底层加固与侧栏扩展

> 2026-07-24。**E1 迁移完成后 = E2。核心服务补齐 + 侧栏扩展位评估。**
> 2026-07-25 修正：E2d 取消——VS Code 源码确认侧栏单槽位，无需架构改动。

---

## 定位

| | |
|---|---|
| Phase | **E2**——核心服务补齐 |
| 输入 | Electron 桌面应用（E1 完成） |
| 输出 | ErrorBoundary 全覆盖 + 终端重构完成 + FileService 等就绪 |
| 依赖 | E1 完成 |

## 子任务

| # | 内容 | 来源 | 性质 |
|---|---|---|---|
| E2a | **ErrorBoundary 增强**——多进程前必须的兜底 | 原 P6a | 架构级 |
| E2b | **终端归一化**——串口能力从 Rust 搬到 Node.js 后的终端重构 | 原 P6b | 架构级 |
| E2c | **核心服务补齐**——FileService / WorkspaceService / DialogService | 原 P6c | 架构级 |
| E2d | ~~侧栏扩展位设计~~ | ❌ 取消 | VS Code 单槽位，现有 `lastSidebar` 已正确 |

## E2d 为什么取消

原设计侧栏双槽位（persistent + tagFollower 同时显示）。curl VS Code 源码确认：`SidebarPart` 只有一个 `activeViewletSettingsKey`——单槽位切换。LinkDesk 现有 `lastSidebar` 已经是对标 VS Code 的正确行为。文件树就是侧栏中一个普通视图，走现有路径即可，零架构改动。详见 `04-E2d-侧栏扩展位.md`。

## 完工标准

- ErrorBoundary 覆盖全部插件 WebView ✅
- 终端功能与 E1 一致，代码归一化 ✅
- FileService / WorkspaceService / DialogService API 就绪 ✅

## 任务总览

| 子任务 | 任务数 | 总行数 |
|------|:--:|:--:|
| E2a — ErrorBoundary 增强 | 6 | ~140 |
| E2b — 终端归一化 | 8 | ~170/−105 |
| E2c — 基础设施缺口 | 22 | ~775 |
| E2d — 侧栏扩展位（取消） | 0 | 0 |
| **合计** | **36 执行 + 4 取消** | **~1,085 行** |

任务 ID 从 `#1` 到 `#23` + `#12a` + `#12b` + `#13a` + `#13b` + `#17a` + `#19a`-`#19l`，跨子任务连续编号。

## 详细设计文档

| # | 文档 | 内容 |
|:--:|------|------|
| 1 | `01-E2a-ErrorBoundary增强.md` | ErrorBoundary 加 pluginId/重试 + 心跳 + 内存监控 |
| 2 | `02-E2b-终端归一化.md` | SerialContext 迁出 + 术语迁移 + 模块状态消灭 + 命令路由 + 硬编码审计 |
| 3 | `03-E2c-基础设施缺口.md` | FileService / WorkspaceService / DialogService / Chord / keybindings / KeybindingResolver / 模糊搜索 / CoreEvents + **G14 fix（PluginDetailView 幽灵页）+ `\|\|` vs `??` 审计 + 旧代码 I/O 归一化 + factoryRole 工厂插槽解耦（settings+marketplace）+ tabIdentity 声明驱动化 + 壳去终端化 + ThemeEngine 5 缺口修复 + statusBar onClick 消费 + WelcomeView+TabBar emoji 声明驱动化 + manifest 11 零消费字段清理 + deriveType 排他分类 + 审计补充 13 项细粒度缺口** |
| 4 | `04-E2d-侧栏扩展位.md` | ❌ 已取消——VS Code 单槽位，现有 `lastSidebar` 已正确 |

## 历史参考

- 原 P6 设计已吸收到 E2a-E2d

---

> **← 上一 Phase：** `../E1_Electron迁移_暂定/`
> **→ 下一 Phase：** `../E3_多WebView与壳收尾_暂定/`
