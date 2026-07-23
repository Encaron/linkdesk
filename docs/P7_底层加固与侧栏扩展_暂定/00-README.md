# P7 — 底层加固与侧栏扩展

> 2026-07-24。**迁移完成后 = Phase 7。核心服务补齐 + 侧栏为插件准备常驻面板坑位。**
> 此 Phase 之后，壳具备了承载"文件树"等常驻侧栏插件的能力。

---

## 定位

| | |
|---|---|
| Phase | **7**——核心服务补齐 |
| 输入 | Electron 桌面应用（P6 完成） |
| 输出 | ErrorBoundary 全覆盖 + 终端重构完成 + FileService 等就绪 + 侧栏支持常驻面板 |
| 依赖 | P6 完成 |

## 子任务

| # | 内容 | 来源 | 性质 |
|---|---|---|---|
| P7a | **ErrorBoundary 增强**——多进程前必须的兜底 | 原 P6a | 架构级 |
| P7b | **终端归一化**——串口能力从 Rust 搬到 Node.js 后的终端重构 | 原 P6b | 架构级 |
| P7c | **核心服务补齐**——FileService / WorkspaceService / DialogService | 原 P6c | 架构级 |
| P7d | **侧栏扩展位设计**——侧栏从"跟标签页走"变成"支持常驻面板" | 🆕 新设计 | 架构级——文件树的坑位 |

## P7d 为什么是新设计

当前侧栏模型：激活终端标签页 → 侧栏显示终端会话列表。侧栏内容绑定到标签页。

文件树需要：**侧栏常驻面板——不随标签页切换而消失。** 这需要壳改动：
- 侧栏支持多个面板槽位（primary 跟标签页走 + persistent 常驻）
- plugin.json 新增 `sidebarRole: "persistent"` 声明
- 文件树插件声明自己为 persistent → 壳在侧栏底部或独立区域渲染它

**这是架构级改动——侧栏的渲染模型变了。** 但它只为"给插件挖坑"——文件树本身仍然是插件。

## 完工标准

- ErrorBoundary 覆盖全部插件 WebView
- 终端功能与 P6 一致，代码归一化
- FileService / WorkspaceService / DialogService API 就绪
- 侧栏支持 persistent 面板——写一个最小文件树插件验证

## 历史参考

- 原 P6 设计：`../phase6_底层加固/`
- 原 P7 侧栏相关设计：`../phase7_多WebView与编辑能力/`

---

> **← 上一 Phase：** `../P6_Electron迁移_暂定/`
> **→ 下一 Phase：** `../P8_多WebView与壳收尾_暂定/`
