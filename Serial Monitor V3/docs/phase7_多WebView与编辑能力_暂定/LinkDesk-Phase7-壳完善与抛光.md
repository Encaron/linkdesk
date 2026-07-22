# Phase 7d — 壳完善与抛光

> 2026-07-22。从 [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) §二 7d 展开（后半——壳完善 + 通知 + 通用 API + 视觉 + 兼容）。
> **设计细节直接引用旧 P6e + 旧 P6.5——内容已完整。**
>
> 完整设计见：**[旧 Phase 6 设计](../phase6_编辑能力/V3-Phase6-设计.md)** §2.9（欢迎页）, §2.18（标题栏+☰）, §2.19（Workspace 导入导出）
> 抛光细节见：**[旧 Phase 6.5 抛光](../phase6.5_抛光/V3-Phase6.5-抛光与补齐.md)** — 12 项

---

## 一、任务清单

### 7d-壳完善（从旧 P6e 迁移）

| # | 任务 | 旧编号 | 设计文档位置 |
|:--:|------|:--:|------|
| 1 | 欢迎页集成——"打开文件夹"入口 + recentFolders | P6e #24 | 旧 §2.9 |
| 2 | 标题栏暗色化 + ☰ 基础四组（File/Edit/View/Help）+ Workspace 导入导出 | P6e #26, #27 | 旧 §2.18, §2.19 |
| 3 | SerialContext/useSendData → 已在 P6b 迁出 | P6e #29 | 不需要再做 |
| 4 | 术语迁移 → 已在 P6b 完成 | P6e #30 | 不需要再做 |
| 5 | Chord 快捷键 → 已在 P6c 完成 | P6e #31 | 不需要再做 |
| 6 | keybindings.json → 已在 P6c 完成 | P6e #32 | 不需要再做 |
| 7 | DialogService → 已在 P6c 完成 | P6e #33 | 不需要再做 |

### 7d-抛光（从旧 P6.5 迁移）

| # | 任务 | 旧编号 | 设计文档位置 |
|:--:|------|:--:|------|
| 8 | 通知进度条 | P6.5 #1 | 旧 §4.1 |
| 9 | 通知来源过滤 / Do Not Disturb | P6.5 #2 | 旧 §4.2 |
| 10 | "Don't show again" 持久化 | P6.5 #3 | 旧 §4.3 |
| 11 | 完整 Notification Center 面板 | P6.5 #4 | 旧 §4.4 |
| 12 | 通知 source 归类（按插件分组） | P6.5 #5 | 旧 §4.5 |
| 13 | 动态 StatusBarItem（运行时创建） | P6.5 #6 | 旧 §5.1 |
| 14 | 插件 i18n 注册（内联翻译） | P6.5 #8 | 旧 §5.2 |
| 15 | Toggle 命令动态标题 | P6.5 #11 | 旧 §6.4 |
| 16 | 命令面板模糊搜索 → 已在 P6c 完成 | P6.5 #12 | 不需要再做 |
| 17 | contributes.icons（共享图标） | P6.5 #7 | 旧 §6.1 |
| 18 | 标题栏 ☰ 完整版（快捷键提示 + 禁用态灰显 + 插件菜单） | P6.5 #9 | 旧 §6.2 |
| 19 | V2 配置导入 | P6.5 #10 | 旧 §6.3 |

---

## 二、从旧 P6e/P6.5 减少的工作量

Phase 6c（基础设施缺口）已经消化了旧 P6e 的 5 项：
- Chord（旧 #31）→ P6c
- keybindings.json（旧 #32）→ P6c
- DialogService（旧 #33）→ P6c
- 模糊搜索（旧 P6.5 #12）→ P6c

Phase 6b（终端归一化）消化了 2 项：
- SerialContext 迁出（旧 #29）→ P6b
- 术语迁移（旧 #30）→ P6b

**所以 7d 实际工作量比旧 P6e+P6.5 少了 7 项。**

---

## 三、新增注意事项

### 3.1 多 WebView 下的通知

- NotificationService 在壳 WebView 中运行
- 插件通过 IPC 发通知：`ipc.notify({ title, message, source: pluginId })`
- Notification Center 面板在壳 WebView 中渲染

### 3.2 多 WebView 下的标题栏 ☰

- ☰ 菜单在壳 WebView 中渲染
- 插件通过 IPC 扩展菜单：`ipc.registerMenu("menuBar", { ... })`
- Phase 7 只做基础四组（File/Edit/View/Help），插件菜单留给 7d-18

---

## 四、相关文档

- [旧 Phase 6 设计 §2.9, §2.18, §2.19](../phase6_编辑能力/V3-Phase6-设计.md) — 壳完善详细设计
- [旧 Phase 6.5 抛光](../phase6.5_抛光/V3-Phase6.5-抛光与补齐.md) — 抛光项详细设计
- [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) — Phase 7 主设计
- [LinkDesk-Phase7-Profile与激活.md](./LinkDesk-Phase7-Profile与激活.md) — 7d 前半（Profile + 激活）
- [LinkDesk-Phase6-基础设施缺口.md](../phase6_底层加固_暂定/LinkDesk-Phase6-基础设施缺口.md) — 已消化旧 P6e 的 5 项
- [LinkDesk-Phase6-终端归一化.md](../phase6_底层加固_暂定/LinkDesk-Phase6-终端归一化.md) — 已消化旧 P6e 的 2 项
