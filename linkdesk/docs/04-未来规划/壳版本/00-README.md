# 壳版本 — 路线图

> 2026-07-24。**改壳代码才发版。内置插件随版本一起出——所有人标配。**

---

## 一、版本号规则

```
MAJOR.MINOR.PATCH
  1  .  2  .  3
```

**对标现有软件：**

| 软件 | 版本号历史 | 模式 |
|------|------|------|
| **VS Code** | `1.0` (2016) → `1.95` (2024)，8 年未升 MAJOR | 每月 MINOR，PATCH 随 MINOR 出 |
| **Obsidian** | `1.0` → `1.7.6`（当前），5 年未升 MAJOR | MINOR = 功能，PATCH = 修 Bug |
| **Windows Terminal** | `1.0` → `1.21`，4 年未升 MAJOR | 每月 MINOR |
| **Slack / Discord / Figma** | 不显示版本号 | 用户无感知，后台静默更新 |
| **Electron** | `28` → `29` → `30` → ... | Chromium 驱动——MAJOR 跟着上游跑 |
| **Sublime Text** | `3.x` 长达 10 年，2024 年升 `4` | MAJOR = 完全重写 |

**LinkDesk 对标 VS Code + Obsidian 模式——1.x 长期维护，MAJOR 极难触发。**

| 位 | 触发条件 | 预计频率 |
|:--:|------|:--:|
| **MAJOR** | 架构级变更——插件 API 不兼容、数据格式不兼容、IPC 协议重写、Electron 大版本跨越导致旧版不可用 | **5~10 年一次**。VS Code 8 年没升。 |
| **MINOR** | 壳新增能力——新 preload API、新面板区域、新内置插件、WindowManager 新方法 | **功能做完就发**。不对标 VS Code 的月度强发——LinkDesk 团队小，按完成度发。 |
| **PATCH** | 纯修复——Bug 修、性能优化、安全补丁。不新增 API、不新增内置插件、不改 UI 布局 | **修好就发**。严重 Bug 不过夜。 |

**硬约束：**
- PATCH 不准夹带新功能——哪怕一行新 API。
- MINOR 不准夹带破坏性变更——旧配置/布局/插件必须继续工作。
- MAJOR 发布前必须有迁移工具（布局升级器、配置转换器）+ 至少一个 MINOR 版本的弃用警告期。
- 每个 MINOR 的最后一个小版本自动成为该 MINOR 的 LTS——只收 PATCH，不追加功能。

---

## 二、预发布（内部开发——不对外）

| 版本 | 里程碑 | 说明 |
|:--:|------|------|
| `0.1.0` | E1 完成 | Electron 壳 + `linkdesk://` 协议 + 串口服务 + preload |
| `0.2.0` | E2 完成 | FileService / WorkspaceService / 快捷键 / 生命周期 / 主题修复 + 终端改名 |
| `0.3.0` | E3 完成 | 多 WebContentsView + IPC 桥接 + 插件迁移 + 壳收尾 |
| `0.3.x` | RC 阶段 | `1.0.0-rc.1` → `rc.2` → ... → bug 收敛到零 → `1.0.0` |

---

## 三、正式版本

```
1.0.0  首个稳定版
 │     E1+E2+E3 全部完工。
 │     内置插件：serial-monitor / settings / marketplace / file-tree + Monaco
 │     单 BrowserWindow，每插件独立 WebContentsView。
 │     完整插件生命周期 + IPC 桥接 + 主题/语言引擎。
 │     此后壳不再大改——只加 MINOR。
 │
 ├─ 1.0.1, 1.0.2, ...  只修 Bug。不加功能。
 │
 ├─ 1.1.0  菜单补全 + Git 集成
 │     ┌ 壳：顶栏菜单 / Electron 原生菜单 / 右键全覆盖（~220 行）
 │     ├ 内置：Git 插件——侧栏暂存/提交/历史（~410 行）
 │     └ 前置：1.0.x 最新 PATCH
 │
 ├─ 1.1.1, 1.1.2, ...  只修 Bug。
 │
 ├─ 1.2.0  终端系统 + 悬浮面板 + Marketplace 增强
 │     ┌ 壳：底部 Panel 区域 + 终端仿真器（node-pty + xterm.js，~420 行）
 │     ├ 壳：FloatingPanel 组件——类型 B 悬浮面板（~160 行）
 │     ├ 壳：插件输出面板——OutputChannel API（含在终端系统内）
 │     ├ 内置：Marketplace 全屏商店双模式（~300 行，依赖 FloatingPanel）
 │     └ 前置：1.1.x 最新 PATCH
 │
 ├─ 1.2.1, 1.2.2, ...  只修 Bug。
 │
 ├─ 1.3.0  可拖出标签页
 │     ┌ 壳：WindowManager 扩展——detachPluginView / attachPluginView（~260 行）
 │     ├ 壳：useDragReorder 加 detach 阶段 + 边界检测
 │     ├ 壳：多窗口生命周期 + 布局持久化
 │     └ 前置：1.2.x 最新 PATCH
 │
 ├─ 1.3.1, 1.3.2, ...  只修 Bug。
 │
 └─ 1.x  长期延续——对标 VS Code 的 1.0→1.95（8 年未升 MAJOR）。
    未来 MORE 功能（新插件、新壳能力）继续 MINOR，Bug 继续 PATCH。
    触发 2.0 的条件：插件 API 全盘重写 / IPC 协议重写 / 布局格式不可向前兼容。
    触发之前——永远 1.x。
```

---

## 四、每版本边界——明确不在里面

| 版本 | ✅ 包含 | ❌ 不包含 |
|:--:|------|------|
| **1.0.0** | 壳 + 4 内置插件 + 文件树 + Monaco | Git、终端、悬浮窗、Marketplace 增强、任何官方可选插件 |
| **1.1.0** | 顶栏菜单、Git 侧栏、右键全覆盖 | 终端仿真器、悬浮面板、Marketplace 增强 |
| **1.2.0** | PowerShell 终端、FloatingPanel、OutputChannel、Marketplace 双模式 | 可拖出标签页（类型 A） |
| **1.3.0** | 标签页拖出/拖回独立窗口 | — |

---

## 五、文档索引

按依赖顺序排列——前面的不依赖后面的：

| # | 文档 | 内容 | 入版 |
|:--:|------|------|:--:|
| 01 | `01-菜单系统补全.md` | 顶栏菜单 / Electron 原生菜单 / 右键全覆盖 | 1.1.0 |
| 02 | `02-Git集成.md` | Git 视图插件——侧栏 + 标签页，开发者标配 | 1.1.0 |
| 03 | `03-终端系统.md` | 终端仿真器（PowerShell/cmd）+ 插件输出面板 | 1.2.0 |
| 04 | `04-悬浮窗系统.md` | 类型 B（壳内悬浮面板）+ 类型 A（可拖出标签页） | 1.2.0 / 1.3.0 |
| 05 | `05-Marketplace增强.md` | Marketplace 全屏商店模式（依赖 04 FloatingPanel） | 1.2.0 |

---

## 六、依赖链

```
1.0.0  壳完工。插件基础设施全部就绪。
 │     内置：serial-monitor + settings + marketplace + file-tree + Monaco
 │
 ├── [1.1.0] 菜单补全 + Git
 │    前置：1.0.x 最新 PATCH
 │    依赖：Phase 5 MenuRegistry + v1.0 文件树
 │
 ├── [1.2.0] 终端系统 + 悬浮面板 B + Marketplace 增强
 │    前置：1.1.x 最新 PATCH
 │    依赖：E3a WebContentsView
 │    Marketplace 增强 → 依赖悬浮面板 B（FloatingPanel 组件）
 │
 └── [1.3.0] 悬浮窗类型 A
      前置：1.2.x 最新 PATCH
      依赖：E3a WindowManager
```

---

## 七、壳级扩展汇总

| 入版 | 壳改动 | 行数 | 改什么 |
|:--:|------|:--:|------|
| 1.1.0 | 菜单系统补全 | ~220 | TitleBar / Electron 原生菜单 / 右键覆盖 |
| 1.2.0 | 底部 Panel 区域 + 终端仿真器 | ~420 | Panel 组件 + node-pty + xterm.js + OutputChannel |
| 1.2.0 | FloatingPanel 组件（类型 B） | ~160 | 壳内悬浮面板通用组件 |
| 1.3.0 | WindowManager 扩展（类型 A） | ~260 | detachPluginView / attachPluginView |
| **壳改动总计** | | **~1,060 行** | 跨 3 个 MINOR 版本 |

对比 E1→E2→E3 总计 ~4,755 行——全部壳版本升级加起来不到架构基建的 1/4。（terminal 改名在 E2b 内完成，不计入壳版本。）

---

## 八、发布节奏

| 类型 | 节奏 | 对标 |
|------|------|------|
| **PATCH** | 修好就发——严重 Bug 不过夜 | VS Code 的 recovery release |
| **MINOR** | 功能做完 → 验证通过 → 发。不绑日历，不学 VS Code 月度强发（团队小，没必要为发版而发版）。 | Obsidian——功能驱动，非日历驱动 |
| **MAJOR** | 至少一个 MINOR 版本的弃用警告期 + 迁移工具就绪 + 旧 MAJOR 维护至少 6 个月 | Sublime Text 3→4——十年一升 |

**插件不受此节奏约束。** 官方插件（工作台/OLED/AI）独立版本号——`1.0.0` → `1.1.0` → ...，随时上架 Marketplace。壳的版本号不跟着插件走。

---

> **← 04 索引：** `../00-README.md`
> **← 架构基础：** `../../02-Electron架构/`（E1→E2→E3）
> **← 另一路：** `../官方插件/00-README.md`（官方可选插件）
