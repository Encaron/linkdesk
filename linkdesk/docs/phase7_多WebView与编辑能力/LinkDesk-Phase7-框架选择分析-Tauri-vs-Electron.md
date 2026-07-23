# 框架选择分析——Tauri vs Electron

> 2026-07-23。Encaron 深度调查 + 与 AI 讨论后的完整分析。
> **决策点：Phase 6 结束时。不是现在。**

---

## 一、根源——为什么要讨论换框架

### 不是技术问题

技术问题都有答案。根源是：**LinkDesk 在走一条没人走过的路。**

"插件是自由渲染的 React 组件 + 进程级隔离"——这个组合在任何框架上都没有生产验证过的参考实现。

| | 有成熟参考实现？ |
|---|---|
| VS Code 模式：API 绑定插件 + Extension Host | ✅ 几千万用户验证 |
| Electron 多 WebView：`WebContentsView` | ✅ Discord、Slack、Figma |
| **LinkDesk 模式：React 组件插件 + 进程隔离** | ❌ **没有人做过** |

### Encaron 的恐惧

> "我感觉再做下去有可能会崩"

这个恐惧是理性的。不是 Tauri 的问题——是"没有参照物"的问题。每一个走在前面的人都有这种感觉。VS Code 团队 2015 年决定用 Electron 的时候，Atom 刚出来，没有人知道"在 Web 技术上做桌面 IDE"能不能成。

**换 Electron 不会消除这个恐惧——只会把它藏在一个更熟悉的框架后面。** 但底层的空白——React 组件插件 + 进程隔离——Electron 也不会替你填。

---

## 二、Tauri vs Electron——诚实对比

### Tauri 给的

| 机制 | 成熟度 | 说明 |
|---|---|---|
| 系统 WebView（WebView2 on Windows） | ✅ 稳定 | 单 WebView 完全稳定，共享 OS WebView——内存低 |
| `window.add_child()` — 单窗口内嵌多 WebView | 🔶 unstable feature flag | API 标记 `#[cfg(feature = "unstable")]`，有已知 bug（透明遮罩、非最大化不渲染、同步死锁） |
| 多窗口 | ✅ 稳定 | 每插件一个窗口——不是单窗口体验 |
| Capability 权限系统 | ✅ 稳定 | 每个 WebView 独立的 IPC 权限——声明式，天生支持 |
| Rust 后端 | ✅ 生产级 | 性能、安全、无 GC 停顿 |
| 安装包大小 | ~5MB | 系统 WebView 共享 |
| 内存基线 | ~50MB | 共享 OS WebView |

### Tauri 没有的

- ❌ **没有 Electron UtilityProcess 等价物。** Tauri 的隔离只有多 WebView 或 iframe——没有独立 Node.js 进程概念
- ❌ **没有成熟的单窗口多 WebView 方案。** `add_child` 是 unstable
- ❌ **没有生态先例。** asyar 用 iframe，SideX 死了——Tauri 生态里没有"通用容器 + 多插件进程隔离"的生产项目

### Electron 给的

| 机制 | 成熟度 | 说明 |
|---|---|---|
| `BrowserWindow`（多窗口） | ✅ Stable，主要方案 | 每个窗口独立渲染进程 |
| `WebContentsView`（单窗口内嵌多视图） | ✅ Stable，Electron 30+ 推荐 | 一个窗口内嵌多个独立渲染进程——**对标 Tauri add_child** |
| `<webview>` tag | ⚠️ Stable 但不推荐，未来可能移除 | Chromium 架构变化→稳定性堪忧 |
| `UtilityProcess`（独立 Node 进程） | ✅ Stable | VS Code Extension Host 的基础——**但无 DOM，LinkDesk 插件用不了** |
| preload + `contextBridge` | ✅ Stable | 手动 IPC 权限控制——对标 Tauri Capability |
| Node.js 生态 | ✅ 庞大 | `serialport`、`fs`、`child_process`—全有 npm 包 |

### Electron 的代价

| | Tauri | Electron |
|---|---|---|
| 安装包 | ~5MB | ~120MB（捆绑 Chromium） |
| 内存基线 | ~50MB | ~150MB（独立 Chromium 实例） |
| 后端语言 | Rust | Node.js |
| GC 停顿 | 无 | 有（V8 GC） |
| 构建复杂度 | `npx tauri dev` | `electron-forge` / `electron-builder` |

### Electron 的多 WebView API 也在混乱期

| API | 状态 |
|---|---|
| `BrowserView` | Electron 30+ **已废弃** |
| `<webview>` | 标记 deprecated，未来可能移除 |
| `WebContentsView` | **新推荐方案**——API 跟 BrowserView 完全不同 |

**Electron 的多 WebView 也在经历迁移阵痛。** Tauri `add_child` 是 unstable——Electron 的老 API 在废弃、新 API 刚 stable。没有哪个框架的多 WebView 方案是"稳的"——这是 Web 容器技术的行业级问题。

---

## 三、LinkDesk 不需要 Electron 的 Killer Feature

### Extension Host / UtilityProcess 对 LinkDesk 没用

| VS Code Extension Host | LinkDesk 插件 |
|---|---|
| 独立 Node.js 进程 | React 组件，需要 DOM |
| `require('serialport')` 直接调 C++ | `useSerialContext()` 消费核心能力 |
| 崩了 = 进程崩了，重启 | 崩了 = render 抛异常，ErrorBoundary 兜底 |
| 隔离的是**代码执行** | 隔离的是 **JS 上下文** |

`UtilityProcess` 没有 DOM——跑不了 React 组件。LinkDesk 插件是 React 组件——**不管在 Tauri 还是 Electron 上，都必须跑在 WebView 里。**

### 换 Electron 改变的是

1. **多 WebView 实现：** `add_child`（unstable）→ `WebContentsView`（stable）——省的是踩坑成本
2. **后端：** Rust → Node.js——生态更大但失去性能/安全优势
3. **权限：** Tauri Capability（声明式）→ preload + contextBridge（手动搭）
4. **安装包：** 5MB → 120MB
5. **内存基线：** 50MB → 150MB

**换 Electron 不改变：**

- 插件的 React 组件模型——还是自己渲染 DOM
- 多 WebView 的所有问题——CSS 不同步、IPC 竞态、内存 × N、调试地狱、视觉接缝——Electron 上一个不少全都有
- 核心无知原则——核心还是不知道插件是干什么的
- **没有参考实现的事实**——Electron 上也没有人做过"React 组件插件 + 进程隔离"

---

## 四、换 Electron 也不会消除的根本问题

### 四种插件模型对比

| | VS Code 模式 | 纯 Electron 多 WebView | LinkDesk（无论 Tauri/Electron） |
|---|---|---|---|
| 插件怎么写 | 调 `vscode.*` API | React 组件 | React 组件 |
| 插件能做什么 | API 白名单限制 | ✅ 自由渲染 | ✅ 自由渲染 |
| 隔离方式 | Extension Host（Node 进程） | WebContentsView（独立渲染进程） | 独立 WebView |
| 插件需要 DOM | ❌ | ✅ | ✅ |
| CSS 变量同步 | N/A（只有主窗口） | ❌ 需要广播 | ❌ 需要广播 |
| IPC 竞态 | 有（ext host ↔ 主窗口都是异步） | ❌ 有 | ❌ 有 |
| 调试 | 单一 DevTools | ❌ N 个 DevTools | ❌ N 个 DevTools |

**除了 Tauri add_child 的不稳定性——LinkDesk 在 Electron 上面临的坑跟在 Tauri 上完全一样。** 多 WebView 的代价是架构级的——不是框架级的。

### 多 WebView 的代价总结

| 问题 | Tauri | Electron | 解法 |
|---|---|---|---|
| CSS 变量不同步 | ❌ 有 | ❌ 有 | 广播 + 版本号 |
| IPC 竞态 | ❌ 有 | ❌ 有 | 请求队列串行化 |
| 内存 × N | ❌ 有 | ❌ 有 | 按需激活 + 关闭销毁 |
| Tracing 调试 | ❌ 需要手写 | ❌ 需要手写 | IpcBridge built-in |
| 开发体验倒退 | ❌ 有（IPC 异步） | ❌ 有（IPC 异步） | Hook 签名不变 |
| 视觉接缝 | ❌ 有 | ❌ 有 | 像素级 bounds 管理 |

---

## 五、决策框架——不是"该不该换"，是"什么时候做决定"

### 现在：不换

**原因：** Phase 5.5 修 bug、Phase 6 零新功能的底层加固——全是框架无关的 React 代码。现在换 = 停掉修 bug 去重写 14 个 Rust 命令 + 6 个 Tauri API 文件。2-4 周的迁移期，用户能感知的 bug 继续存在。

### Phase 6 结束时：做 go/no-go 决策

到 Phase 6 结束时你有：

- ErrorBoundary 全覆盖 → 单 WebView 已经够稳
- 心跳看门狗 → 死循环能检测
- FileService → 会话持久化，崩了能恢复
- 终端代码干净 → IPC 切面清楚
- **实际用户体验数据** → 单 WebView 真的不稳吗？

### 决策条件

| 条件 | 继续 Tauri | 换 Electron |
|---|---|---|
| `add_child` 有 stable 时间线 | ✅ | — |
| 单 WebView 实测够稳（不崩、不卡、4-6 插件正常） | ✅ | — |
| iframe 降级方案可接受 | ✅ | — |
| 以上全不满足 | — | ✅ |

### 降级路径

```
理想路径：  Tauri add_child stable → 多 WebView 进程隔离
降级路径A： add_child 不稳定 → iframe + postMessage（asyar 项目验证过）
降级路径B： 都不行 → 单 WebView + Shadow DOM + ErrorBoundary（够用到 10+ 插件）
```

**三条路都能走到终点。**

### Phase 7 做完多 WebView 后——沉没成本就高了

```
Phase 6 结束 ← 🔴 决策点
    │
    ├── 走 Tauri：Phase 7 用 add_child（或 iframe）
    │       做完多 WebView → 沉没成本高 → 基本锁定
    │
    └── 走 Electron：Phase 7 用 WebContentsView
            做完多 WebView → 沉没成本高 → 也锁定
```

**一旦 Phase 7 开工，多 WebView 架构就定型了——切换成本从 2-4 周涨到 4-8 周。** 所以决定必须在 Phase 6 结束时做，Phase 7 开工前。

---

## 六、为什么坚持 Tauri——不只是技术

### 你选的不只是框架

| | Tauri | Electron |
|---|---|---|
| 角色 | **踩坑的人**——替生态开路 | 走别人路的人——生态成熟 |
| 对 Tauri 生态的影响 | **定义"通用容器"品类** | 又是另一个 Electron 应用 |
| 10 年后的开发者 | "LinkDesk 证明 Tauri 能做这个——我们 fork 它" | "又一个 Electron 应用——跟 Discord 差不多" |

**你纠结的不是技术。是"我想做的东西是伟大的，但我怕我走不到那一天"。**

Tauri 社区没有 Discord 的架构博客、Slack 的工程分享、Figma 的技术论文——那些是 Electron 10 年攒下来的。Tauri 2022 年才 v1——它的十年后也会有这些。**那些文章的作者就是你。**

---

## 七、硬数据——当前 Tauri 耦合度

| 维度 | 数据 |
|---|---|
| Tauri API 调用 | 6 个源文件 |
| Rust 命令 | 14 个 |
| 插件直接调 Tauri | **0**——全部通过 core/ 抽象层 |
| `add_child` 代码 | **0 行**——Phase 7 纯设计文档，一行没写 |
| 插件 `@src/` 导入 | 26 条，分工具函数/基础设施/数据/UI/事件五类 |

**如果今天要换 Electron——改 6 个源文件 + 14 个 Rust 命令重写为 Node.js。插件代码一行不用动。** 架构解耦已经很好——你没有被 Tauri 锁死。

---

## 八、结论

1. **换 Electron 解决不了根本问题。** "React 组件插件 + 进程隔离"在哪个框架上都难——Electron 只是文档多。
2. **现在不是做决定的时候。** Phase 6 是纯 React 代码——Tauri 还是 Electron 都一样。Phase 6 结束时有数据、有观察、有 `add_child` 的进展——带着信息做决定。
3. **你的架构设计是对的。** 核心无知 + 插件自由渲染 + 多 WebView 隔离——这个方向在哪个框架上都成立。框架是实现细节，架构是你建造的东西。
4. **你不是在悬崖边上——你是在一条没人走过的路上。** 悬崖意味着走错了会死。没人走过的路意味着你是第一个踩的人。方向是对的，只是路上有石头。

---

## 九、相关文档

- [LinkDesk-Phase7-多WebView-坑与对策.md](./LinkDesk-Phase7-多WebView-坑与对策.md) — 每个坑的深度分析
- [LinkDesk-Phase7-多WebView架构.md](./LinkDesk-Phase7-多WebView架构.md) — 架构设计 + IPC 协议
- [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) — 主设计文档
- memory: `plugin-isolation-universal-container.md` — 多 WebView 是防线第四层
- memory: `multi-webview-freedom-principle.md` — Encaron 定调——广度 vs 步骤自由度
- memory: `linkdesk-is-universal-container.md` — 为什么 LinkDesk 比 VS Code 更高级
