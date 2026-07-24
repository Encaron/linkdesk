# E2 — 底层加固与侧栏扩展

> 2026-07-24。**E1 迁移完成后 = E2。核心服务补齐 + 侧栏为插件准备常驻面板坑位。**
> 此 Phase 之后，壳具备了承载"文件树"等常驻侧栏插件的能力。

---

## 定位

| | |
|---|---|
| Phase | **E2**——核心服务补齐 |
| 输入 | Electron 桌面应用（E1 完成） |
| 输出 | ErrorBoundary 全覆盖 + 终端重构完成 + FileService 等就绪 + 侧栏支持常驻面板 |
| 依赖 | E1 完成 |

## 子任务

| # | 内容 | 来源 | 性质 |
|---|---|---|---|
| E2a | **ErrorBoundary 增强**——多进程前必须的兜底 | 原 P6a | 架构级 |
| E2b | **终端归一化**——串口能力从 Rust 搬到 Node.js 后的终端重构 | 原 P6b | 架构级 |
| E2c | **核心服务补齐**——FileService / WorkspaceService / DialogService | 原 P6c | 架构级 |
| E2d | **侧栏扩展位设计**——侧栏从"跟标签页走"变成"支持常驻面板" | 🆕 新设计 | 架构级——文件树的坑位 |

## E2d 为什么是新设计

当前侧栏模型：激活终端标签页 → 侧栏显示终端会话列表。侧栏内容绑定到标签页。

文件树需要：**侧栏常驻面板——不随标签页切换而消失。** 这需要壳改动：
- 侧栏支持多个面板槽位（primary 跟标签页走 + persistent 常驻）
- plugin.json 新增 `sidebarRole: "persistent"` 声明
- 文件树插件声明自己为 persistent → 壳在侧栏底部或独立区域渲染它

**这是架构级改动——侧栏的渲染模型变了。** 但它只为"给插件挖坑"——文件树本身仍然是插件。

## 完工标准

- ErrorBoundary 覆盖全部插件 WebView
- 终端功能与 E1 一致，代码归一化
- FileService / WorkspaceService / DialogService API 就绪
- 侧栏支持 persistent 面板——写一个最小文件树插件验证

## 任务总览

| 子任务 | 任务数 | 总行数 |
|------|:--:|:--:|
| E2a — ErrorBoundary 增强 | 6 | ~140 |
| E2b — 终端归一化 | 8 | ~170/−105 |
| E2c — 基础设施缺口 | 22 | ~775 |
| E2d — 侧栏扩展位 | 4 | ~110 |
| **合计** | **40** | **~1,195 行** |

任务 ID 从 `#1` 到 `#23` + `#12a` + `#12b` + `#13a` + `#13b` + `#17a` + `#19a`-`#19l`，跨子任务连续编号。

## 详细设计文档

| # | 文档 | 内容 |
|:--:|------|------|
| 1 | `01-E2a-ErrorBoundary增强.md` | ErrorBoundary 加 pluginId/重试 + 心跳 + 内存监控 |
| 2 | `02-E2b-终端归一化.md` | SerialContext 迁出 + 术语迁移 + 模块状态消灭 + 命令路由 + 硬编码审计 |
| 3 | `03-E2c-基础设施缺口.md` | FileService / WorkspaceService / DialogService / Chord / keybindings / KeybindingResolver / 模糊搜索 / CoreEvents + **G14 fix（PluginDetailView 幽灵页）+ `\|\|` vs `??` 审计 + 旧代码 I/O 归一化 + factoryRole 工厂插槽解耦（settings+marketplace）+ tabIdentity 声明驱动化 + 壳去终端化 + ThemeEngine 5 缺口修复 + statusBar onClick 消费 + WelcomeView+TabBar emoji 声明驱动化 + manifest 11 零消费字段清理 + deriveType 排他分类 + 审计补充 13 项细粒度缺口** |
| 4 | `04-E2d-侧栏扩展位.md` | 侧栏双槽位 + plugin.json sidebarRole + 壳渲染逻辑 |

## 历史参考

- 原 P6 设计已吸收到 E2a-E2d

---

> **← 上一 Phase：** `../E1_Electron迁移_暂定/`
> **→ 下一 Phase：** `../E3_多WebView与壳收尾_暂定/`
