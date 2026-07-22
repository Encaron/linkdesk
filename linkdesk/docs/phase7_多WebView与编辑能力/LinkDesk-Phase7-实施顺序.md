# Phase 7 — 实施顺序

> 2026-07-22。从 [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) 提炼。
> **前提：** Phase 6 底层加固全部完成（6a/6b/6c 验证通过）。
> **性质：** Phase 7 = 多 WebView 架构 + 第一批消费者插件。先建隔离底座，再在上面写新插件。

---

## 前置条件

```
Phase 6 全部完成：
  ✅ ErrorBoundary 全覆盖（主区+侧栏+壳视图）
  ✅ Rust 心跳 + 内存监控
  ✅ SerialContext 已迁出 core/
  ✅ 术语迁移 portOpen → sourceOpen
  ✅ 终端 useTauriEvent 归一化 + 模块变量消灭 + 命令路由修复
  ✅ FileService / WorkspaceService / DialogService / Chord / keybindings / 模糊搜索
  ✅ CoreEvents 补漏
```

---

## 第 1 层：7a — 多 WebView 核心（~400 行）

> **先建隔离底座，再写新插件。** 新插件一出生就在独立 WebView 里——不用先单线程再迁移。

### 步 1：Tauri v2 multi-WebView 配置

**文件：** `src-tauri/src/lib.rs` + `tauri.conf.json`

**做什么：** Tauri v2 支持通过 `WebviewBuilder` 创建多个 WebView。每个 WebView 加载同一个 HTML 入口但不同 URL query（`?pluginId=terminal`）。

**预计：** +50 行（Rust）

### 步 2：IPC 桥接层

**文件：** `src/core/IpcBridge.ts`（新建）

**做什么：**
```
核心服务代理——插件 WebView 通过 IPC 使用核心能力：

ConfigurationService  → get/set → invoke("ipc:config:get", { key })
CommandRegistry       → execute → invoke("ipc:command:execute", { id, args })
CoreEvents            → subscribe → invoke("ipc:events:subscribe", { event })
useSendData           → send → invoke("ipc:send", { data })
```

**预计：** +150 行

### 步 3：插件 WebView 生命周期

**文件：** `src/core/PluginWebViewManager.ts`（新建）

**做什么：** 创建/销毁/重载插件 WebView。对标 VS Code Extension Host 进程管理。

**预计：** +100 行

### 步 4：现有插件迁移

**文件：** terminal / marketplace / settings 插件

**做什么：** 改造现有 import → IPC 调用。terminal 插件最大的改动——`useSerialContext` 内部从直接 import 变成 IPC。

**预计：** +100 行

---

## 第 2 层：7b — 文件树 + 编辑（~500 行）

> 设计细节见 [LinkDesk-Phase7-文件树与编辑.md](./LinkDesk-Phase7-文件树与编辑.md)。

| 步 | 任务 |
|:--:|------|
| 5 | 文件树视图（📁 图标栏 → 侧栏/标签页 + 右键菜单 MenuId.FileContext） |
| 6 | 文件关联 + FileAssociationService |
| 7 | Monaco JSON 编辑器标签页 |
| 8 | 系统文件拖入 + Ctrl+Shift+T + 文件树键盘操作（F2/Delete/Ctrl+XCV 对标 VS Code） |
| 9 | 文件搜索（Ctrl+Shift+F）+ 多选/批量 + 编码检测 |
| 10 | JSON schema 自动补全 + 多工作区文件夹 |
| 11 | 文件图标主题 + 文件装饰器框架 |

---

## 第 3 层：7c — 主题/语言引擎（~200 行）

> 设计细节见 [LinkDesk-Phase7-主题语言引擎.md](./LinkDesk-Phase7-主题语言引擎.md)。

| 步 | 任务 |
|:--:|------|
| 12 | 主题系统插件化 + 三层退路 |
| 13 | 语言系统插件化 + 两层退路 |
| 14 | 主题浏览器 UI（Ctrl+K Ctrl+T） |
| 15 | 产品图标主题 + 插件资源访问 API |

---

## 第 4 层：7d — Profile + 激活 + 抛光（~500 行）

> 设计细节见 [LinkDesk-Phase7-Profile与激活.md](./LinkDesk-Phase7-Profile与激活.md) + [LinkDesk-Phase7-壳完善与抛光.md](./LinkDesk-Phase7-壳完善与抛光.md)。

| 步 | 任务 |
|:--:|------|
| 16 | Profile 系统（五维验证） |
| 17 | activationEvents + extensionDependencies |
| 18 | 齿轮菜单完整版 + 输出面板 UI |
| 19 | 终端会话持久化 |
| 20 | 欢迎页集成 + 标题栏 ☰ + Workspace 导入导出 |
| 21 | 通知系统全功能（5 项——进度条/过滤/DND/Notification Center/source 归类） |
| 22 | 动态 StatusBarItem + 插件 i18n + Toggle 动态标题 |
| 23 | contributes.icons + ☰ 完整版 + V2 配置导入 |

---

## 支线预案

| 触发条件 | 支线 |
|:--|------|
| 7a 多 WebView 中 IPC 性能瓶颈 | 评估 SharedArrayBuffer 或 batch 模式 |
| 7a terminal 迁移后串口收发延迟 | 对比单 WebView 和 IPC 版本的时序——数据管道可能需要优化 |
| 7b 文件树在侧栏渲染时 ErrorBoundary 触发 | 用 terminal 侧栏做对照——同样的 viewRole: sidebarPrimary |
| 7c 主题浏览器和旧 ThemeEngine 冲突 | 先建 ThemeRegistry → loader 兼容旧格式 → 再删旧代码 |
| 7d Profile 切换时五维验证失败 | 逐维排查——每维独立 try/catch → toast 报告失败维度 |

---

## 每步执行模板

```
1. 读相关代码（3 分钟 max）
2. 改（小步，尽量 < 30 行）
3. npx tsc --noEmit  → 零错误
4. npx vitest run    → 全过
5. git diff --stat   → 确认只动了该动的文件
6. git commit         → 一条 commit 只修一个概念
7. 告诉用户测什么    → 用户验证
8. 用户确认          → 下一步
```

---

## 不做的事

- ❌ 7a 做完前开始 7b（新插件必须在多 WebView 底座上诞生）
- ❌ 跳过 Rust cargo check（改 Tauri 配置后必跑）
- ❌ 在单 WebView 里先写文件树再迁 IPC（双倍工作量）

---

## 相关文档

- [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) — 主设计文档
- [LinkDesk-Phase7-多WebView架构.md](./LinkDesk-Phase7-多WebView架构.md) — 7a 细节
- [LinkDesk-Phase7-文件树与编辑.md](./LinkDesk-Phase7-文件树与编辑.md) — 7b 细节
- [LinkDesk-Phase7-主题语言引擎.md](./LinkDesk-Phase7-主题语言引擎.md) — 7c 细节
- [LinkDesk-Phase7-Profile与激活.md](./LinkDesk-Phase7-Profile与激活.md) — 7d 前半细节
- [LinkDesk-Phase7-壳完善与抛光.md](./LinkDesk-Phase7-壳完善与抛光.md) — 7d 后半细节
