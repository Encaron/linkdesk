# 插件隔离——为什么"没有 API 白名单"是双刃剑，以及我们怎么兜底

> 2026-07-22 Encaron 与 AI 讨论定稿。
>
> **本文档目的：** 让新 AI 完全理解——为什么 LinkDesk 插件没有 API 白名单、这带来了什么风险和什么好处、我们用什么防线兜底、以及未来多 WebView 迁移的准备规则。
>
> **当前状态：** Phase 5.5 修 bug 中（15 步主线）。Error Boundary 增强是 5.5d，排在 C1 验证通过后执行。多 WebView 迁移是 Phase 7 的事——现在只做规则约束，不做架构改动。

---

## 一、前因——为什么 LinkDesk 选择"没有 API 白名单"

### 1.1 核心无知原则

LinkDesk 是通用容器——核心只有标签页 + 分屏 + 数据管道 + 注册表。核心不知道上面跑什么插件。VS Code 能定义 `vscode.*` API 白名单因为它知道自己是什么（代码编辑器）。LinkDesk 不能——今天是终端插件，明天可能是地图、数据库浏览器、逻辑分析仪。

**没有 API 白名单 = 核心不预设插件的能力边界。** 插件能做什么，不由核心定义。

### 1.2 工程实现：`@src/` alias

2026-07-22 加上了 `@src/` alias（`vite.config.ts` + `vitest.config.ts`）。插件直接 `import` 核心的任何模块——RingBuffer、useSendData、CommandRegistry、TabActions。这不是"暂时没做白名单所以先放开"，这是设计意图。

### 1.3 双刃剑——好的一面

**插件开发 = 写 React 组件。** 不需要学一套 SDK，不需要写 IPC 桥接代码。

| 场景 | VS Code 扩展 | LinkDesk 插件 |
|:--|:--|:--|
| 用第三方库 | webview panel + postMessage 桥接，~50 行 | `npm install` → `import` → 直接用，1 行 |
| 主题颜色 | `ThemeColor` API，有限场景 | `var(--bg-card)` 直接用，切主题自动响应 |
| 读核心状态 | 通过 `vscode.*` API 查询 | `useSerialContext()` 直接读 |
| AI 生成插件 | 需理解 `vscode.window.createWebviewPanel` 完整 API | `export default function({ isActive }) { return <div>...</div> }` |

### 1.4 双刃剑——坏的一面

"能做任何事"反过来就是"能搞砸任何事"。VS Code 用独立进程（Extension Host）兜底——扩展崩了主窗口不受影响。LinkDesk 跑在 Tauri 单 WebView 里，物理上没有进程隔离。这不是设计选择——是平台硬边界。

| | VS Code (Electron) | LinkDesk (Tauri) |
|:--|:--|:--|
| 架构 | Chromium + Node.js | 系统 WebView |
| 进程模型 | 主窗口 + Extension Host 独立进程 | 单 WebView，单 JS 主线程 |
| 插件崩了 | 扩展进程重启，主窗口正常 | 取决于崩法（见下） |

---

## 二、物理现实——四类攻击，四种结局

### 2.1 React render 异常 → **挡得住**

插件 `render()` 抛异常。React Error Boundary 捕获 → 卸载崩掉的组件 → 显示 fallback → 其他组件不受影响。

**当前状态：** 主区已有（`MainContent.tsx:64`），侧栏缺失，壳自身视图缺失。

### 2.2 死循环 `while(true){}` → **挡不住，但能检测到**

主线程被占满，所有 JS 停止执行。**同线程内任何防御代码和攻击代码一起死。** 唯一能检测：Rust 端心跳（前端每 500ms `invoke("heartbeat")` → Rust 2 秒没收到 → 弹原生对话框）。

**但只是检测，不是恢复。** Rust 不能杀掉 JS 死循环。

### 2.3 内存泄漏 → **挡不住，但能检测到**

`performance.memory.usedJSHeapSize` 定期采样。插件 mount 记录基线，unmount 对比。全局 heap 持续增长 → 报警。

**只是检测，不是修复。**

### 2.4 `window` / DOM 篡改 → **挡不住**

同 JS context 下没有隔离。Proxy 包装 `window` 可以被 `__proto__` 绕过。

---

## 三、防线对插件自由度的实际影响

**关键区分：** 防线是"安全气囊"还是"门禁"？

| 防线 | 类型 | 对插件开发的影响 |
|:--|:--|:--|
| Error Boundary | 安全气囊 | 零影响。崩了兜底，不崩不存在 |
| Rust 心跳看门狗 | 安全气囊 | 零影响。后台运行 |
| 内存监控 | 安全气囊 | 零影响。后台采样 |
| CSP 头 | 门禁（轻） | `eval()` 和动态脚本受限——Web 安全基线 |
| 权限声明 (`plugin.json`) | 告知 | 声明了就能用——不是审批，是知情 |

**一条不跨越的线：** 不定义 `@linkdesk/api` 作为唯一合法 import 入口。`@src/` 永远开放。防御是安全气囊，不是笼子。

---

## 四、分层防线

### 第一层：Error Boundary 增强（Phase 5.5d，待执行）

**挡什么：** React render 异常。

**具体改动（3 文件，~+50/−10 行）：**

| 步 | 文件 | 做什么 |
|:--:|:--|:--|
| 1 | `ErrorBoundary.tsx` | 加 `pluginId` prop + `componentDidCatch` 日志 + "重试"按钮 |
| 2 | `SidePanel.tsx:43` | 侧栏包 ErrorBoundary（和主区归一） |
| 3 | `MainContent.tsx:50-57` | 壳视图（欢迎页/插件详情）包 ErrorBoundary |
| 4 | `MainContent.tsx:64` | 现有 ErrorBoundary 传 pluginId |

**验证：** 故意抛异常 → fallback 显示"「终端」已崩溃 [重试]" + 控制台 stack + 其他标签页正常。

**对齐六项原则：**
- 精益求精：ErrorBoundary 不是"有了就行"——要显示插件名、输出日志、能重试
- 归一化：所有插件渲染点用同一个 ErrorBoundary 组件（当前主区有、侧栏无——这是归一化缺失）
- 插件自由：Error Boundary 不限制插件能力，只在崩溃后兜底
- VS Code 化：对标 VS Code 扩展崩溃的 "Reload" 按钮
- AI 友好：componentDidCatch 输出完整 error stack → AI 能用 stack trace 定位问题
- 易操作：用户看到插件名 + 一键重试

### 第二层：Rust 心跳看门狗（Phase 7）

挡主线程死循环。Rust 端 `invoke("heartbeat")` 超时检测 → 原生对话框"应用无响应" [刷新] [等待]。

### 第三层：内存监控（Phase 7）

`performance.memory` 定期采样 + 泄漏趋势告警。

### 第四层：信任模型（有第三方生态后）

`plugin.json` `permissions` 字段 + 安装时展示。不是技术隔离（做不到），是用户知情权。

---

## 五、什么不做，为什么

| 不做的事 | 原因 |
|:--|:--|
| iframe 隔离插件 | CSS 变量 / React Context 全断——插件能用的东西归零 |
| Web Worker 跑插件 | 无 DOM——插件是 React 组件 |
| JS Proxy 包装 `window` | `__proto__` 逃逸 |
| 独立进程（VS Code Extension Host 模式） | Tauri 非 Electron，前端无 Node.js |

---

## 六、未来——多 WebView 隔离（Phase 7）

### 6.1 为什么现在不隔离

当前阶段（Phase 5.5-6.5）的插件（terminal / settings / marketplace / workspace / 文件树 / Monaco 编辑器）都是壳级基础设施，我们自己写的，不会写死循环。Error Boundary 能兜住 React 级崩溃。

### 6.2 Phase 7 做什么

Tauri v2 支持多 WebView。每个插件独立 WebView → 独立的 JS context → 插件崩了只崩自己。**进程级隔离，对标 VS Code。**

代价：插件不能直接 `import { useSerialContext }`——核心在另一个 WebView 里。需要 IPC 桥接。**但 AI 负责写插件，IPC 模板代码 AI 自动生成——对人不可见。**

### 6.3 现在就要遵守的规则

虽然多 WebView 是 Phase 7 的事，但**现在写的代码决定将来迁移要花多少代价。** 规则只有一条：

**每写一个 `@src/` import，判断它是"借东西"还是"复制东西"：**

| 类型 | 判断 | 规则 |
|:--|:--|:--|
| 工具函数 | `RingBuffer`、`HexToBytes`——纯计算，无副作用 | ✅ 随便写。将来每个 WebView 各拷一份 |
| UI 组件 | `ContextMenu`、`Toggle`、`SidebarSection` | ✅ 继续用现有的。❌ 不新增插件 UI 进 `@src/components/` |
| 数据 / 服务 / 事件 | `SerialContext`、`useTabActions`、`useTauriEvent` | ✅ 通过导出 hook/函数调用。❌ 不碰模块私有变量（如 `_sessions`） |

**当前审计（26 条 import）：**

| 类别 | 数量 | 迁移难度 |
|:--|:--:|:--|
| UI 组件 | 8 | 难——跨 WebView DOM 渲染 |
| 基础设施 | 6 | 中——改 IPC 调用 |
| 数据 | 4 | 中——改 IPC 同步 |
| 事件 | 3 | 中——改 IPC 事件 |
| 工具函数 | 3 | 易——各拷一份 |

详细规则见 memory `multi-webview-migration-rules.md`。

---

## 七、当前决定

- **Phase 5.5d 做 Error Boundary 增强**（纯 React，零架构改动，3 文件 +50/−10 行）
- **Phase 6 不改隔离模型**——插件继续保持单 WebView，Error Boundary 兜底
- **Phase 7 做多 WebView 隔离 + 工作台**
- **现在起遵守多 WebView 迁移规则**——不碰模块私有变量，不往 `@src/` 加插件专属代码

---

## 八、执行顺序

当前 15 步修 bug 主线不被打断。Error Boundary 增强（5.5d）排在 C1 验证通过后执行。

**相关文档：**
- 记忆：`plugin-isolation-universal-container.md`（三层防线架构）
- 记忆：`multi-webview-migration-rules.md`（写代码规则）
- Phase 6 前提：`docs/phase6_编辑能力/V3-Phase6-实施顺序.md`（已更新引用本计划）
