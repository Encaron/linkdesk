# Phase 6 — 实施顺序

> 2026-07-22。从 [LinkDesk-Phase6-设计.md](./LinkDesk-Phase6-设计.md) 提炼。
> **前提：** Phase 5.5 15 步修 Bug 全部完成。
> **性质：** 零新功能——全是基础设施加固。用户看不到新 UI，但底座从"能跑"变成"稳"。

---

## 前置条件

```
Phase 5.5 15 步修 Bug 全部完成
  → tsc 零错误，vitest 全过
  → 15 步每步 Encaron 验证通过
```

---

## 第 0 步：5.5d — ErrorBoundary 增强（立刻做，1 小时）

> **为什么第一个：** 修 bug 期间可能触发崩溃。安全气囊先装，后面的工作更安全。

### 步 0.1：ErrorBoundary 组件增强

**文件：** `src/components/shared/ErrorBoundary.tsx`

**做什么：**
- 加 `pluginId?: string` prop
- 加 `componentDidCatch(error, errorInfo)` → `console.error("[pluginId]", error, errorInfo.componentStack)`
- fallback 显示插件名 + 重试按钮（调 `this.setState({ hasError: false })`）

**预计：** +20/−5 行

### 步 0.2：侧栏包 ErrorBoundary

**文件：** `src/components/SidePanel.tsx`

**做什么：** `renderSidebarContent()` 的返回结果包 `<ErrorBoundary pluginId={effectivePluginId}>`。

**预计：** +3 行

### 步 0.3：壳视图包 ErrorBoundary

**文件：** `src/components/MainContent.tsx`

**做什么：** `PluginDetailView` / `WelcomeView` 的渲染包 `<ErrorBoundary>`。

**预计：** +5 行

### 步 0.4：现有 ErrorBoundary 传 pluginId

**文件：** `src/components/MainContent.tsx:64`

**做什么：** 现有 `<ErrorBoundary>` 加 `pluginId={tab.pluginId}`。

**预计：** +1 行

### 验证

```
1. 故意在 terminal 插件 render() 抛异常
2. fallback 显示 "「终端」已崩溃 [重试]"
3. 控制台输出完整 error stack
4. 其他标签页正常交互
5. 点 [重试] → 重新 mount 终端组件
6. 侧栏同理（在 sidebar.tsx 里抛异常）
7. 壳视图同理（在 WelcomeView 里抛异常）
```

---

## 第 1 批：6b — 终端归一化（~200 行）

> **目标：终端从"验证产物"变成"正确参考实现"。**
> Phase 7 文件树、主题浏览器、语言选择器全以终端为模板——模板本身必须干净。

### 步 1：SerialContext 迁出 core/

**文件：**
- `src/core/SerialContext.tsx` → `plugins/terminal/SerialContext.tsx`
- 更新所有 import 路径（`@src/core/SerialContext` → `@src/../plugins/terminal/SerialContext`）

**做什么：** 纯文件移动 + import 路径更新。不改逻辑。

**预计：** +30/−30 行（import 路径）

**验证：**
```
npm run dev → 终端正常收发 → COM 口枚举正常 → 切换 COM 口正常
grep "SerialContext" src/core/ → 零结果
```

**如果出问题：**
- Vite 路径解析失败 → 检查 `@src/` alias 覆盖范围
- 循环依赖 → SerialContext 不应依赖 core/ 的任何非导出模块

### 步 2：术语迁移 portOpen → sourceOpen

**文件：**
- `src-tauri/src/lib.rs` — Tauri 命令名 + 内部函数名
- `plugins/terminal/SerialContext.tsx` — invoke 调用
- `plugins/terminal/ControlPanel.tsx` — UI 回调
- 所有消费 `portOpen` / `portName` 的文件

**做什么：**
- Tauri 命令：`open_port` → `open_source`，`close_port` → `close_source`（Rust 函数名同步改）
- TS：`invoke("open_port", ...)` → `invoke("open_source", ...)`
- 类型：`PortState` → `SourceState`
- 事件名：`port-state-changed` → `source-state-changed`

**预计：** +40/−40 行

**验证：**
```
npm run tauri dev → 打开串口正常 → 关闭正常 → 状态栏 TX/RX 计数正常
grep "portOpen\|portName\|PortState\|port-state" src/ src-tauri/ → 零结果（排除 serialport crate 内部字段）
```

**如果出问题：**
- Tauri 命令名改了但 invoke 没改 → tauri dev 报 "command not found"
- Rust 内部 `port_name` 字段（serialport crate）→ 不动它，只改我们自己的函数/命令名

### 步 3：useTauriEvent 归一化

**文件：** `plugins/terminal/index.tsx` + 可能的其他终端文件

**做什么：**
- 全局搜索终端插件里的裸 `listen()` 调用
- 全部替换为 `useTauriEvent`（Phase 2.5 已提取的 hook，自带 generation counter 模式——B11 教训）
- 没有 useTauriEvent 包装的 → 加包装

**预计：** +20/−15 行

**验证：**
```
grep "listen(" plugins/terminal/ → 全部走 useTauriEvent 封装（无裸 listen）
npm run vitest run → 全过
```

**如果出问题：**
- 某处 listen 不在组件内（在纯函数/模块级）→ 提取到最近的组件 useEffect

### 步 4：模块级可变状态消灭

**文件：** `plugins/terminal/index.tsx`

**做什么：**
- `let _receiveMode = ...` → 从 session 读
- `let _activeSessionId = ...` → 从 session 读
- 搜所有 `let _[a-z]` 模块级变量 → 迁入 hook state 或 session

**预计：** +10/−10 行

**验证：**
```
grep "^let _" plugins/terminal/ → 零结果（允许 const 常量）
两个终端标签页各设不同接收模式 → 互不干扰
```

### 步 5：命令路由修复（E3）

**文件：** `plugins/terminal/index.tsx`

**做什么：** Ctrl+Shift+P 执行终端命令时，命令作用于"当前活跃会话的 TerminalView"，而不是"最后一个 mount 的 TerminalView"。

**方案：** `cmViewMap` 改用 WeakMap + 按 sourceId 索引 + dispose 自动清理。

**预计：** +20/−10 行

**验证：**
```
会话A 选中文字 → 切到会话B → Ctrl+Shift+P → 复制 → 粘贴 → 是会话A 的内容
```

### 步 6：硬编码审计

**做什么：** 全局 grep 终端插件：
```bash
grep -rn '"terminal"' plugins/terminal/        # pluginId 字面量
grep -rn 'baudRate\|baud_rate\|115200' plugins/terminal/  # 波特率假设
grep -rn 'COM[0-9]\|port_name\|portName' plugins/terminal/ # 端口假设
```

**预计：** 不确定——看 grep 结果。大部分可能已经在 5.5c 的 useTerminalSessions 中消除了。

**验证：**
```
grep 结果 → 逐条判断是否合理 → 不合理则改
```

---

## 第 2 批：6c — 基础设施缺口（~300 行）

> **这些在旧 P6 里被当作"编辑能力的一部分"——但它们本身是框架能力。**

### 步 7：FileService

**文件：**
- `src/core/FileService.ts`（新建）
- `src-tauri/src/lib.rs`（加 `list_dir` / `read_file` / `write_file` / `watch_dir` 命令）

**做什么：** 薄封装 Tauri fs 命令。对标 VS Code `vscode.workspace.fs`。

```typescript
class FileService {
  async listDir(path: string): Promise<FileEntry[]>
  async readFile(path: string): Promise<string>
  async readBinaryFile(path: string): Promise<Uint8Array>
  async writeFile(path: string, content: string): Promise<void>
  async watch(path: string): Promise<Disposable>
}
```

**预计：** +80 行（TS 50 + Rust 30）

**验证：**
```
FileService.listDir("/tmp") → 返回文件列表
FileService.writeFile("/tmp/test.txt", "hello") → 文件存在
Tauri dev 中验证（Tauri fs API 需要真实环境）
```

### 步 8：WorkspaceService

**文件：** `src/core/WorkspaceService.ts`（新建）

**做什么：**
```typescript
class WorkspaceService {
  private _folders: WorkspaceFolder[] = []
  get folders(): WorkspaceFolder[]
  get rootPath(): string | undefined
  async openFolder(): Promise<void>
  addFolder(path: string): void
  removeFolder(path: string): void
  onDidChangeFolders: Event<WorkspaceFolder[]>
}
```

**和 ConfigurationService 的关系：**
```
WorkspaceService.rootPath = "/home/user/stm32-project"
  → ConfigurationService.setWorkspaceRoot(path)
    → Workspace scope 的 settings.json 路径正确
```

**⚠️ 时序：** `setWorkspaceRoot` 必须在任何 `useConfiguration()` 调用之前——和 Phase 5f 的"懒加载时序歧义"同类问题。解法：App.tsx 初始化阶段同步调用。

**预计：** +80 行

**验证：**
```
WorkspaceService.openFolder() → Tauri dialog → rootPath 更新
onDidChangeFolders 事件 → 订阅者收到新 folders[]
```

### 步 9：DialogService（D8）

**文件：** `src/core/DialogService.ts`（新建）+ React `<Dialog>` 组件

**做什么：** 替换 3 处 `window.confirm()`：
1. 关终端标签页确认
2. 插件卸载确认
3. 设置重置确认

**预计：** +60 行

**验证：**
```
关终端标签页 → 弹出 React <Dialog>，不是浏览器 confirm()
暗色主题下 Dialog 颜色正确（走 CSS 变量）
```

### 步 10：Chord 快捷键（D4）

**文件：** `src/core/KeybindingRegistry.ts`

**做什么：** 加双键序列状态机：
```
Ctrl+K 按下 → 进入 chord 模式（500ms 超时）
  → Ctrl+S → 触发 "workbench.action.openKeybindingsSettings"
  → Ctrl+T → 触发 "workbench.action.selectTheme"
  → 超时 → 取消 chord，不做任何事（对标 VS Code）
```

**预计：** +40 行

**验证：**
```
Ctrl+K Ctrl+S → 触发命令
Ctrl+K 等 2s → 什么都不发生
Ctrl+K Ctrl+Z（未绑定）→ 什么都不发生
```

### 步 11：keybindings.json（D6）

**文件：** `src/core/KeybindingRegistry.ts` + `.linkdesk/keybindings.json`

**做什么：**
- 启动时读 `.linkdesk/keybindings.json`
- 用户定义的快捷键覆盖出厂默认
- 删除 keybindings.json → 回退到出厂绑定
- 格式对标 VS Code `keybindings.json`

**预计：** +50 行

**验证：**
```
keybindings.json 绑 Ctrl+W 到别的命令 → 即时生效
删除 keybindings.json → 回退到出厂
格式错误 → toast 提示 + 回退
```

### 步 12：命令面板模糊搜索（D5）

**文件：** `CommandPalette.tsx`

**做什么：** 把 `String.includes` 替换为 fuzzy matching 打分排序：
- 首字母连续匹配 > 中间连续匹配 > 跳跃匹配 > 不匹配
- 对标 VS Code `fuzzyScore`，不引入 `fuse.js`

**预计：** +40 行

**验证：**
```
命令面板输入 "tgl" → "Toggle..." 类命令排在前面
输入 "关闭" → "关闭消息回显" / "关闭终端" 等排在前面
```

### 步 13：CoreEvents 补漏

**文件：** `src/core/CoreEvents.ts`

**做什么：** 加两个事件发射器：
- `onDidChangeFileSystem: Event<FileChangeEvent[]>`
- `onDidChangeWorkspaceFolders: Event<WorkspaceFolder[]>`

**预计：** +20 行

**验证：**
```
tsc 零错误——事件类型定义正确
```

---

## 第 3 批：6d — Rust 命令插件化（~150 行 Rust）

> **目标：serialport crate 从核心 Cargo.toml 消失，serial.rs 从 src-tauri/src/ 消失。**
> 插件可以带自己的 Rust 代码——每个插件的 Rust 依赖在自己的 Cargo.toml 里，不污染核心。
> 详情见：[LinkDesk-Phase6-Rust命令插件化.md](./LinkDesk-Phase6-Rust命令插件化.md)

### 步 14：建 terminal 插件 Rust crate 骨架

**文件：**
- `plugins/terminal/rust/Cargo.toml`（新建）
- `plugins/terminal/rust/src/lib.rs`（新建）

**做什么：**
1. 建 crate 目录结构
2. `Cargo.toml` 依赖 `tauri`、`serde`、`serialport`、`encoding_rs`
3. `lib.rs` 写 `pub fn register(app: &mut tauri::App)` 函数签名
4. 此时 `register()` 函数体留空——下一步填入

**预计：** +30 行

**验证：**
```bash
cd plugins/terminal/rust && cargo check
# → 零错误（可能有 dead_code 警告——下一步消除）
```

### 步 15：serial.rs 搬迁到插件 crate

**文件：**
- `src-tauri/src/serial.rs` → 内容搬到 `plugins/terminal/rust/src/commands.rs`
- 状态管理 → `plugins/terminal/rust/src/state.rs`
- `plugins/terminal/rust/src/lib.rs` → 填 `register()` 函数体

**做什么：**
1. 复制 `serial.rs` 全部 392 行到 `commands.rs`
2. 提取 `SerialInner` / `SerialState` / `create_state()` 到 `state.rs`（~50 行）
3. `lib.rs` 声明模块 + 实现 `register()`
4. 内部引用关系：`commands.rs` → `use crate::state::...`
5. **不改任何逻辑**——函数签名、参数、返回值、内部实现全部保留
6. 6b 的术语迁移（`open_port` → `open_source` 等）照常应用在 `commands.rs` 里

**预计：** +392/−392 行（纯搬家，净增 ~20 行 glue code）

**验证：**
```bash
cd plugins/terminal/rust && cargo check
# → 零错误
```

**如果出问题：**
- `SerialInner` 字段权限 → 改 `pub(crate)`
- Tauri command 宏不解析 → 检查 Cargo.toml tauri features
- 模块声明顺序 → `lib.rs` 先 `mod state;` 再 `mod commands;`

### 步 16：更新主 Cargo.toml + lib.rs

**文件：**
- `src-tauri/Cargo.toml`
- `src-tauri/src/lib.rs`

**做什么——Cargo.toml：**
1. 删 `serialport = "4"`
2. 加 `[features]` section
3. 加 `linkdesk-plugin-terminal = { path = "../../plugins/terminal/rust", optional = true }`

**做什么——lib.rs：**
1. 删 `mod serial;`
2. 删 8 个串口命令条目
3. 删 `.manage(serial::create_state())`
4. 加 `.setup(|app| { ... })` 闭包
5. 闭包内：`#[cfg(feature = "plugin-terminal")] linkdesk_plugin_terminal::register(app);`

**预计：** +15/−15 行

**验证：**
```bash
cd src-tauri && cargo check
# → 零错误
```

**⚠️ 关键风险：**
- 如果其他文件引用了 `crate::serial::*` → 需先更新这些引用
- `invoke_handler` 从 14 条命令变成 6 条——确认没有遗漏

### 步 17：全量验证

```bash
cd linkdesk/
npx tsc --noEmit          # TS 零错误
npx vitest run            # 测试全过

cd src-tauri/
cargo check               # Rust 零错误
cargo build               # release build

cd ../
npx tauri dev             # 完整桌面应用
```

**手动验证：**
```
□ 终端打开串口 / 关闭 / F5 → 正常
□ 切换 COM 口 / 波特率 → 正常
□ HEX 模式 / 时间戳 → 正常
□ 发送文本 → 正常
□ 状态栏 TX/RX 计数 → 正常
□ 分屏两个终端 → 各自独立
□ 插件市场 → 正常
□ 设置 → 终端设置项正常
□ 命令面板终端命令 → 正常
```

**清理验证：**
```bash
grep "serialport" src-tauri/Cargo.toml    # → 零结果 ✅
grep "mod serial" src-tauri/src/lib.rs    # → 零结果 ✅
ls src-tauri/src/serial.rs                # → 不存在 ✅
grep "serialport" plugins/terminal/rust/Cargo.toml  # → 存在 ✅
```

---

## 支线预案

| 触发条件 | 支线内容 | 优先级 |
|:--|------|:--:|
| 步 1 发现 SerialContext 被 core/ 其他模块引用 | 先解耦再迁移——提取接口层 | 🔥 |
| 步 2 Rust 命令改名后 tauri dev 报错 | cargo check + 逐命令排查 | 🔥 |
| 步 7-8 FileService/WorkspaceService 时序冲突 | 比照 Phase 5f 的"懒加载时序歧义"修复模式 | 🟡 |
| 步 10 Chord 和现有 KeybindingRegistry 冲突 | 现有单键绑定不受影响——Chord 是独立状态机 | 🟡 |
| 步 15 serial.rs 搬迁后 cargo check 报引用错误 | 先修 src-tauri/ 内其他模块对 `crate::serial` 的引用 | 🔥 |
| 步 16 删 `mod serial;` 后 cargo check 报错 | 确认所有引用链已更新——grep 全量搜索 | 🔥 |
| 任何步 tsc 报错 | 停下来先修类型错误——不改逻辑 | 🔥 |
| 任何步 vitest 失败 | 停下来先修测试——可能是测试本身需要更新 | 🔥 |

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

- ❌ 一口气修多个概念
- ❌ 跳过 tsc/vitest/cargo check 直接 commit
- ❌ "顺手"加新功能（Phase 6 零新功能）
- ❌ 重构范围超出基础设施加固所需
- ❌ 在 6d Rust 命令插件化完成前开始 7a 多 WebView

---

## 相关文档

- [LinkDesk-Phase6-设计.md](./LinkDesk-Phase6-设计.md) — 主设计文档
- [LinkDesk-Phase6-插件运行时安全.md](./LinkDesk-Phase6-插件运行时安全.md) — 6a 细节
- [LinkDesk-Phase6-终端归一化.md](./LinkDesk-Phase6-终端归一化.md) — 6b 细节
- [LinkDesk-Phase6-基础设施缺口.md](./LinkDesk-Phase6-基础设施缺口.md) — 6c 细节
- [LinkDesk-Phase6-Rust命令插件化.md](./LinkDesk-Phase6-Rust命令插件化.md) — 6d 细节（🆕）
- [Phase 5.5 ErrorBoundary 增强计划](../phase5.5_交互对标/V3-Phase5.5-ErrorBoundary增强计划.md)
