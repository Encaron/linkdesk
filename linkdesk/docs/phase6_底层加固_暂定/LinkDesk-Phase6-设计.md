# Phase 6 — 底层加固

> 2026-07-22 Encaron 定稿。新路线图：Phase 5.5 修完 bug 后不直接进文件树——先进 Phase 6 底层加固。
> **Phase 6 零新功能。全是基础设施——安全气囊、终端去验证化、底层缺口。**
> 文件树、Monaco 编辑器、主题/语言浏览器等消费者插件全部推后到 Phase 7。

---

## 一、为什么需要这一层

### 1.1 当前三个裂缝

| # | 裂缝 | 如果不修 | 
|:--:|------|------|
| 1 | **ErrorBoundary 只包了主区**——侧栏（SidePanel.tsx:43）和壳视图（WelcomeView/PluginDetailView）裸奔 | Phase 7 文件树在侧栏渲染——崩了就是白屏，不是 fallback |
| 2 | **终端代码是 Phase 1-4 验证期的产物**——有裸 `listen()`、模块级可变状态、core/ 里放了终端专属的 SerialContext | Phase 7 新增插件以终端为模板复制模式——坏模式扩散 |
| 3 | **基础设施被跳过**——FileService/WorkspaceService/DialogService/Chord/keybindings 都在旧 P6 作为"编辑能力"的一部分，但它们本身是框架能力 | Phase 7 文件树诞生时底座不完整 |

### 1.2 核心原则

> **"底层打通，再做上层。"** 
>
> Phase 5 建了 Registry 体系（Command/Config/Menu/Protocol + ContextKey + Keybinding + CoreEvents）——这是"注册表"通了。
> Phase 6 建安全气囊 + 拆干净终端 + 补基础设施缺口——这是"运行时"通了。
> Phase 7 才在上面建新插件——这是"消费者"通了。
>
> **终端是验证插件，不是模板。** 它在 Phase 1-4 的任务是证明基础设施能跑——它的代码里有很多"先让它跑起来"的写法规避。Phase 6 把这些规避拆掉，让终端变成正确的参考实现。Phase 7 文件树、主题浏览器、语言选择器以终端为模板时，看到的是干净的代码。

---

## 二、Phase 6 三层（6a/6b/6c）

### 6a — 插件运行时安全（~150 行）

> **安全气囊。** 不限制插件能力——崩了兜底，不崩不存在。

| # | 任务 | 文件 | 行数 |
|:--:|------|------|:--:|
| 1 | ErrorBoundary 增强 | `ErrorBoundary.tsx` + `SidePanel.tsx` + `MainContent.tsx` | +50/−10 |
| 2 | Rust 心跳看门狗 | `lib.rs`（Rust）+ `useHeartbeat.ts`（TS） | +80 |
| 3 | 内存监控 | `useMemoryMonitor.ts` | +30 |

**详情见：** [LinkDesk-Phase6-插件运行时安全.md](./LinkDesk-Phase6-插件运行时安全.md)

**ErrorBoundary 增强（对标 VS Code "Reload" 按钮）：**
- 加 `pluginId` prop → fallback 显示"「终端」已崩溃 [重试]"
- 加 `componentDidCatch` → 控制台输出完整 error stack（AI 友好）
- 侧栏包 ErrorBoundary（和主区归一）
- 壳视图（欢迎页/插件详情）包 ErrorBoundary

**Rust 心跳：** 前端每 500ms `invoke("heartbeat")` → Rust 2s 超时 → 原生对话框"应用无响应" [刷新] [等待]。**只是检测，不是恢复——JS 死循环同线程无法恢复。**

**内存监控：** `performance.memory.usedJSHeapSize` 定期采样。插件 mount 记录基线，unmount 对比。全局 heap 持续增长 → toast 告警。**只是检测，不是修复。**

### 6b — 终端归一化（~200 行）

> **让终端从"验证产物"变成"正确参考实现"。** Phase 7 新插件以它为模板。

| # | 任务 | 文件 | 行数 |
|:--:|------|------|:--:|
| 4 | SerialContext 迁出 core/ | `SerialContext.tsx` → `plugins/terminal/` + 引用更新 | +30/−30 |
| 5 | 术语迁移：portOpen → sourceOpen | Rust（`lib.rs`）+ TS（`SerialContext.tsx` + 消费者）+ Tauri 命令名 | +40/−40 |
| 6 | useTauriEvent 归一化 | `plugins/terminal/index.tsx`（裸 `listen()` → `useTauriEvent`） | +20/−15 |
| 7 | 模块级可变状态消灭 | `_receiveMode` / `_activeSessionId` → session 状态 | +10/−10 |
| 8 | 命令路由修复 | `plugins/terminal/index.tsx`——按 activeSessionId 路由到正确实例（E3） | +20/−10 |
| 9 | 硬编码审计 | 全量 grep 终端插件：pluginId 字面量、端口假设、baudRate 假设、`"terminal"` 字符串 | −X |

**详情见：** [LinkDesk-Phase6-终端归一化.md](./LinkDesk-Phase6-终端归一化.md)

**关键原则——SerialContext 为什么不能留在 core/：** 核心不知道"串口"是什么。核心只有数据管道——数据源打开/关闭/发送/接收。SerialContext 的 `listPorts()` / `openPort(portName, baudRate)` 是终端专属的。对标 VS Code：`vscode.window` 不知道终端是什么——终端是 `vscode.window.createTerminal` 扩展 API 提供的。

**术语迁移为什么现在做：** Phase 7 多 WebView 之后，"端口"这个词会出现在 IPC 协议里——越晚迁移成本越高。`portOpen` → `sourceOpen`，`portName` → `sourceName`——核心只知道"数据源"，不知道"端口"。串口是终端插件的实现细节。

### 6c — 基础设施缺口（~300 行）

> **这些在旧 P6a/P6e 里被当作"编辑能力的一部分"——但它们本身是框架能力。** 文件树需要 FileService，但 FileService 不依赖文件树。同理 WorkspaceService / DialogService / Chord / keybindings / 模糊搜索。

| # | 任务 | 文件 | 行数 |
|:--:|------|------|:--:|
| 10 | FileService | `src/core/FileService.ts` + Rust `list_dir` / `read_file` / `write_file` / `watch_dir` | +80 |
| 11 | WorkspaceService | `src/core/WorkspaceService.ts` | +80 |
| 12 | DialogService | `src/core/DialogService.ts`（React `<Dialog>` 替换 3 处 `window.confirm()`——D8） | +60 |
| 13 | Chord 快捷键 | `KeybindingRegistry.ts` 加双键序列状态机（Ctrl+K Ctrl+S——D4） | +40 |
| 14 | keybindings.json | 用户自定义快捷键读写/合并/优先级（D6） | +50 |
| 15 | 命令面板模糊搜索 | `CommandPalette.tsx`——substring → fuzzy matching 打分排序（D5） | +40 |
| 16 | CoreEvents 补漏 | 加 `onDidChangeFileSystem` + `onDidChangeWorkspaceFolders` | +20 |

**详情见：** [LinkDesk-Phase6-基础设施缺口.md](./LinkDesk-Phase6-基础设施缺口.md)

**FileService 为什么不是 P7 文件树的配套设施：** 文件树需要 FileService，但 CAD 查看器、PDF 查看器、代码编辑器都需要 FileService。它是框架层，不是文件树的附属。Phase 5 的 ConfigurationService 和 PreferenceService 已经用了 Tauri fs API——FileService 是把这些调用归一化到一个入口。**对标 VS Code：** `vscode.workspace.fs` 是通用 API，不属于 Explorer 视图。

**WorkspaceService 同理：** "当前打开的文件夹"是一个全局概念——文件树用它、欢迎页用它、标题栏用它、设置（Workspace scope）用它。Phase 5 的 `ConfigurationService.setWorkspaceRoot()` 接口签名已经留好了——Phase 6c 只是实现。

---

## 三、Phase 6 不做的东西

| 不做 | 理由 | 以后 |
|------|------|:--:|
| 文件树 UI | 消费者插件 → Phase 7 | P7 |
| Monaco JSON 编辑器标签页 | 消费者 → Phase 7 | P7 |
| 主题/语言引擎插件化 | 消费者 → Phase 7 | P7 |
| 主题/语言浏览器 UI | 消费者 → Phase 7 | P7 |
| Profile 系统 | 需要多 WebView 稳定底座 → Phase 7 | P7 |
| 通知系统全功能 | 消费者 → Phase 7 | P7 |
| 多 WebView 隔离 | 重型架构改动，终端拆干净再做 → Phase 7 | P7 |
| 工作台卡片 | 纯消费者 → Phase 8 | P8 |
| OLED | 独立插件 → Phase 8 | P8 |

---

## 四、与 Phase 7 的边界

```
Phase 6（底层加固）               Phase 7（多 WebView + 消费者）
─────────────────────           ─────────────────────────────
ErrorBoundary 全覆盖             多 WebView 架构
Rust 心跳 + 内存监控             IPC 桥接层
终端 = 干净的参考实现            文件树（第一个新消费者）
FileService / WorkspaceService   主题/语言引擎 + 浏览器
DialogService / Chord            Profile + 激活
keybindings / 模糊搜索           通知系统 + 壳完善
CoreEvents 补漏                  终端会话持久化（消费 FileService）
```

**Phase 7 插件诞生时的底座：**
- ErrorBoundary 全覆盖 → 崩了有 fallback（不像 Phase 4 终端崩了白屏）
- Rust 心跳在跑 → 死循环能检测（不像现在静默卡死）
- 终端代码是干净的 → 复制模式不会复制坏味道
- FileService / WorkspaceService 就绪 → 文件树直接消费
- DialogService 就绪 → 不再用 `window.confirm()`

---

## 五、执行顺序

```
15 步修 Bug（当前主线，不打断）
  → 5.5d ErrorBoundary 增强（3 文件，1 小时——安全气囊立刻装）
    → 6b 终端归一化（拆干净验证产物）
      → 6c 基础设施缺口（补完底座）
        → 6a 剩余项（Rust 心跳 + 内存监控）
```

**为什么这个顺序：**
1. 15 步修 bug 最高优先级——不打断
2. ErrorBoundary 立刻做——太小了不值得排队，而且修 bug 期间可能触发崩溃
3. 6b 终端归一化在 6c 之前——SerialContext 迁出后 core/ 更干净，再写 FileService/WorkspaceService 时边界更清晰
4. 6a 的 Rust 心跳和内存监控放最后——Rust 需要 cargo check，不影响 TS 侧工作

**6b 和 6c 不并行：** 6c 的 FileService 可能和 6b 的 SerialContext 有引用关系——串行避免竞态。

---

## 六、验证标准

### 6a — 安全气囊

```
ErrorBoundary：
  故意在 terminal 插件 render() 抛异常
    → fallback 显示 "「终端」已崩溃 [重试]" 
    → 控制台输出完整 error stack
    → 其他标签页正常交互
    → 侧栏同理

Rust 心跳：
  终端插件写 while(true){} 
    → 2s 后弹出原生对话框 "应用无响应" [刷新] [等待]
    → 点刷新 → 软件重启

内存监控：
  插件 mount → 记录基线
  模拟泄漏（setInterval push 大数组）
    → toast "内存使用持续增长，请检查 [插件名] 插件"
```

### 6b — 终端归一化

```
SerialContext 迁出：
  grep src/core/ SerialContext → 零结果
  终端插件正常工作——收发/切换 COM 口不变

术语迁移：
  grep portOpen → 零结果（只剩 Rust serialport 库自身的 port_name 字段）
  invoke("source_open", { ... }) 正常工作

useTauriEvent：
  grep "listen(" plugins/terminal/ → 全部走 useTauriEvent 封装

模块变量：
  grep "^let _[a-z]" plugins/terminal/ → 零结果
  （允许 const 常量，不允许 let 模块级可变状态）

命令路由：
  两个终端标签页 → 会话A 选中文字 → Ctrl+Shift+P → 复制
    → 粘贴到记事本 → 是会话A 的内容
  会话B 的接收区没有被清空
```

### 6c — 基础设施缺口

```
FileService：
  await FileService.listDir("/tmp") → 返回文件列表
  await FileService.readFile("/tmp/test.txt") → 文件内容

WorkspaceService：
  WorkspaceService.openFolder() → Tauri dialog → rootPath 更新
  ConfigurationService 的 Workspace scope 正确解析

DialogService：
  关终端标签页 → 弹出 React <Dialog>，不是 window.confirm()
  3 处 window.confirm() 全部替换

Chord：
  Ctrl+K Ctrl+S → 触发 "workbench.action.openKeybindingsSettings"
  Ctrl+K（等待 2s 不按第二个键）→ 超时，不触发任何命令

keybindings.json：
  修改 keybindings.json → Ctrl+W 绑到别的命令 → 即时生效
  恢复默认 → 删除 keybindings.json → 回退到出厂绑定

模糊搜索：
  命令面板输入 "tgl" → "Toggle..." 类命令排在最前面
  （不是 substring，是 fuzzy matching 打分排序）
```

---

## 七、相关文档

- [LinkDesk-Phase6-实施顺序.md](./LinkDesk-Phase6-实施顺序.md) — 严格逐步执行计划
- [LinkDesk-Phase6-插件运行时安全.md](./LinkDesk-Phase6-插件运行时安全.md) — ErrorBoundary + Rust 心跳 + 内存监控细节
- [LinkDesk-Phase6-终端归一化.md](./LinkDesk-Phase6-终端归一化.md) — SerialContext 迁出 + 术语迁移 + useTauriEvent + 模块变量
- [LinkDesk-Phase6-基础设施缺口.md](./LinkDesk-Phase6-基础设施缺口.md) — FileService / WorkspaceService / DialogService / Chord / keybindings / 模糊搜索
- [Phase 5 设计](../phase5_应用基础设施/V3-Phase5-设计.md) — Phase 6 消费的 Registry 体系
- [Phase 5.5 ErrorBoundary 增强计划](../phase5.5_交互对标/V3-Phase5.5-ErrorBoundary增强计划.md) — 四层防线分析（含多 WebView 迁移规则）
- [Phase 7 设计](../phase7_多WebView与编辑能力/LinkDesk-Phase7-设计.md) — 多 WebView + 第一批消费者插件
