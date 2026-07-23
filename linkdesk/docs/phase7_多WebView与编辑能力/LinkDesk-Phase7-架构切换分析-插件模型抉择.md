# Phase 7 — 架构切换分析：插件模型抉择

> 2026-07-23。Encaron 要求从"换架构"的角度重审全部选项——不只是 Tauri vs Electron，是插件模型本身的抉择。
>
> **核心问题：插件应该是什么？** 这个答案决定了框架、隔离方式、多 WebView 是否必须——一切下游决策。

---

## 一、插件是什么——三条路，两个维度

### 1.1 两个独立维度

```
维度 A：插件怎么定义？
  ├── A1: React 组件——export default function() { return <div/> }
  └── A2: activate() 脚本——export function activate(ctx) { ctx.api.* }

维度 B：插件怎么隔离？
  ├── B1: 多 WebView——每个插件独立渲染进程
  └── B2: 单 WebView + Extension Host——UI 共享一个 WebView，逻辑在 Node 进程
```

**A1 强制要求 B1。** React 组件需要 DOM → 必须跑在 WebView 里 → 隔离 = 多 WebView。没有"组件 + 无 DOM 进程"的组合——物理定律。

**A2 可以选择 B1 或 B2。** `activate()` 不渲染 DOM → 逻辑可以跑在 Node 进程。但插件如果需要 UI，UI 部分还是要 WebView——VS Code 的 `WebviewView` 就是干这个的。

### 1.2 三条可行的路

| | 路 1：当前 LinkDesk | 路 2：Electron + Extension Host | 路 3：纯 VS Code 兼容 |
|---|---|---|---|
| 插件模型 | A1 React 组件 | A2 activate() + limited UI | A2 activate() + WebviewView |
| 隔离 | B1 多 WebView | B2 Extension Host（Node）+ per-plugin UI WebView（按需） | B2 Extension Host |
| 插件能渲染什么 | 无限制——任何 React/web 库 | activate() 不能渲染；UI 走受限 WebView | `vscode.window.createWebviewPanel()`——受限 |
| 插件怎么通信 | Hook（`useSerialContext()`） | `api.*` 命名空间 | `vscode.*` API |
| 单窗口 WebView 数 | N（壳 + 每个视图插件） | 1（壳）+ 按需（插件 UI WebView） | 1（壳）+ 按需 |
| 框架 | Tauri 或 Electron | Electron（UtilityProcess） | Electron 或 VS Code 直接 |
| 生态先例 | 无 | VS Code 模式 | VS Code 本身 |
| AI 友好度 | 高——AI 天然会写 React 组件 | 中——AI 需要学专用 API | 中——但 API 有大量文档和例子 |

---

## 二、每条路展开

### 2.1 路 1：React 组件插件 + 多 WebView（当前架构）

```typescript
// 插件代码——现在和将来都一样
export default function TerminalView({ isActive }: { isActive: boolean }) {
  const { ports, actions } = useSerialContext();
  return (
    <div className="terminal-view">
      {ports.map(p => <PortCard key={p.name} {...p} onClick={actions.openSource} />)}
    </div>
  );
}
```

**插件作者看到的：**
- 写 React 组件——跟写任何 React 应用一样
- `useSerialContext()`、`useConfiguration()`、`useTabActions()`——hook 即 API
- 无 API 白名单——`import Leaflet`、`import THREE.js`、`import Monaco`——自由
- HTML/CSS/JS 全能力——`<canvas>`、`<video>`、`WebGL`、`WebAssembly`

**核心做的：**
- 插件是 JS bundle——Vite 打包，plugin loader 加载
- 每个插件 mount 到自己的 WebView
- IPC 桥接：Hook 内部从 React Context 换成 postMessage——Hook 签名不变
- Tauri Capability 或 Electron preload 做权限控制

**代价：**
- 多 WebView 的七个坑（CSS 同步、IPC 竞态、内存、调试、开发体验、视觉接缝、安全）——每个都有解
- Tauri `add_child` 是 unstable——踩坑成本
- 没有生态先例——你是第一个

### 2.2 路 2：activate() + Extension Host + 受限 UI

```typescript
// 插件代码——逻辑部分（跑在 Extension Host，Node 进程，无 DOM）
export function activate(context: ExtensionContext) {
  // 注册命令——纯逻辑，没有 UI
  context.subscriptions.push(
    api.commands.registerCommand('terminal.openPort', async (portName: string) => {
      const result = await api.serial.open({ portName, baudRate: 115200 });
      api.window.showInformationMessage(`已打开 ${portName}`);
    })
  );

  // 需要 UI → 声明视图提供者
  api.window.registerWebviewViewProvider('terminal.main', {
    resolveWebviewView(webviewView) {
      // UI 部分——跑在独立 WebView 里
      webviewView.webview.html = `
        <!DOCTYPE html>
        <html><body>
          <div id="root"></div>
          <script src="vscode-webview.js"></script>
        </body></html>
      `;
      // ⚠️ HTML 字符串拼出来的 UI——不是 React JSX
      // ⚠️ 这个 WebView 是沙箱——不能 require，不能直接调 Node API
    }
  });
}
```

**插件作者看到的：**
- 逻辑和 UI 分离——两个 context，两种代码
- 逻辑部分：调 `api.*`——只能调核心暴露的 API
- UI 部分：在一个受限的 WebView 里写 HTML/JS——可以加载 React bundle，但需要 postMessage 跟 Extension Host 通信
- **写一个带 UI 的插件 = Extension Host 脚本 + WebView HTML bundle——两部分代码、两套通信协议**

**核心做的：**
- Extension Host：Node.js 进程，加载 `activate()` 脚本
- `api.*` 命名空间：IPC 代理到主窗口的核心服务
- 插件 UI WebView：主窗口管理——按需创建/销毁
- 权限：Extension Host 的 Node 能力 = preload 控制 + `api.*` 白名单

**代价：**
- 插件开发体验倒退——逻辑和 UI 分离，"写一个终端视图"从"一个 React 组件"变成"activate() + html 字符串 + postMessage 桥"
- 插件自由度下降——从"任何 web 库直接用"变成"api.* 有什么你用什么"
- `api.*` 需要设计、实现、文档——几百个函数
- **本质上还是多 WebView**——插件 UI 还是要跑在独立 WebView 里（VS Code `WebviewView` 就是独立 WebView）
- Extension Host 进程 + per-plugin UI WebView = 进程数可能更多

### 2.3 路 3：纯 VS Code 兼容——在 VS Code 上做 LinkDesk

```
不做独立桌面应用。
LinkDesk = VS Code 扩展。
终端/文件树/工作台 = VS Code 的 WebviewView。
```

这条路意味着放弃独立品牌、放弃 Tauri、放弃出 VS Code 生态的能力。不做深入分析——Encaron 已明确要做独立软件。

---

## 三、路 1 vs 路 2——深度对比

### 3.1 插件开发体验

| 场景 | 路 1：React 组件 | 路 2：activate() + Extension Host |
|---|---|---|
| 写一个终端视图 | `export default function TerminalView()` ——一个文件 | `activate()` + webview HTML bundle + postMessage 桥——三个文件 |
| 加一个设置项 | `registerConfiguration(...)` ——声明 | `api.configuration.register(...)` ——声明 |
| 加一个右键菜单 | `registerCommand(...)` + `registerMenuItems(...)` ——声明 | `api.commands.registerCommand(...)` + `api.menus.register(...)` ——声明 |
| 导入一个 UI 库 | `import Leaflet from "leaflet"` ——一行 | WebView bundle 里 `import Leaflet` + postMessage 传到 Extension Host ——两个 context |
| 读取串口状态 | `const { ports } = useSerialContext()` ——hook | `const ports = await api.serial.getPorts()` ——async |
| 发送串口数据 | `sendData("hello")` ——hook 提供的函数 | `await api.serial.send("hello")` ——async |

**路 1 的插件代码量 = 路 2 的 30-50%。** 因为不需要两套代码、两套通信。

### 3.2 隔离效果

| 攻击 | 路 1：多 WebView | 路 2：Extension Host |
|---|---|---|
| 插件 React render 崩溃 | WebView 崩了——其他插件正常 | Extension Host 脚本崩了？→ 整个 Extension Host 重启——**所有插件一起重载** |
| 插件死循环 | 那个 WebView 卡死——其他正常 | Extension Host 事件循环卡死——**所有插件全停** |
| 插件内存泄漏 | 泄漏在自己 WebView——销毁回收 | Extension Host heap 泄漏——**影响所有插件** |
| 插件恶意读其他插件数据 | JS context 隔离——读不到 | Extension Host 同一进程——**能读到**（同一个 Node 进程，同一个 heap） |
| 插件调 `require('child_process')` | 不存在 `require`——浏览器沙箱 | ✅ **能调**——这就是为什么需要 Extension Host 隔离 |
| 插件篡改 DOM | 只能改自己的 WebView | 逻辑部分无 DOM——UI WebView 各自独立 |

**反直觉的结论：路 1 的隔离比路 2 更强。** 

Extension Host 是一个进程跑所有插件——插件的隔离靠的是"信任插件不搞事"。VS Code 市场上线的扩展经过审核。但一个恶意扩展崩了 Extension Host → 所有扩展重载。

多 WebView 每个插件独立进程——插件 A 死循环不影响插件 B。进程级隔离 > 同进程内 try/catch 隔离。

### 3.3 插件自由度

| | 路 1：React 组件 | 路 2：activate() |
|---|---|---|
| 能用的 Web 库 | 所有 npm 包——`leaflet`、`three`、`monaco-editor`、`xterm`…… | UI WebView 里能用的——逻辑部分不能用 |
| 能画的 UI | 任何 HTML/CSS——`<canvas>`、`<video>`、`WebGL`、`CSS 3D` | 受限 WebView——有 CSP 沙箱限制 |
| 能调的系统能力 | 核心 hook 提供的 + Tauri Capability 允许的 | `api.*` 提供的——等核心团队加 |
| 写插件 = 学什么 | 会 React 就会写 | 学 LinkDesk 专用 API |

**路 1 的插件作者 = Web 开发者。路 2 的插件作者 = LinkDesk 开发者。**

### 3.4 AI 友好度

| | 路 1 | 路 2 |
|---|---|---|
| AI 的训练数据 | React 组件——GitHub 上几千万个 | `activate()` + `context.subscriptions.push()`——只有 VS Code 扩展 |
| AI 犯错的概率 | 低——写 React 是 AI 最熟练的事 | 中——专用 API 需要精确的文档和示例 |
| AI 生成新插件的准确率 | 高——`export default function` + hook | 中——需要理解 Extension Host vs WebView 的分离 |

### 3.5 归一化

| | 路 1 | 路 2 |
|---|---|---|
| 插件通信通道 | 一条——Hook | 两条——`api.*`（逻辑部分）+ postMessage（UI WebView 部分） |
| 插件代码结构 | 一种——React 组件 | 两种——activate() 脚本 + WebView bundle |
| 设置读写 | `useConfiguration()`——同一条 | `api.configuration.get()`——逻辑部分用；UI WebView 又需要另一套 |
| 命令注册 | `registerCommand(...)`——同一条 | `api.commands.registerCommand(...)`——逻辑部分 |

**路 1 更归一化——插件只有一种代码形式，通信只有一条通道。** 路 2 的"逻辑 + UI"分离创造了两个世界——同一个 bug 可能在两套系统里各出现一次（V2.6 教训）。

### 3.6 综合对比

| 维度 | 路 1：React + 多 WebView | 路 2：activate + ExtHost | 优胜 |
|---|---|---|---|
| 插件开发体验 | React 组件——零学习 | activate() + WebView bundle——上下文切换 | **路 1** |
| 插件自由度 | 无限制——任何 web 库 | api.* 白名单 | **路 1** |
| 隔离强度 | 进程级——一个插件一个 WebView | 进程级——一个 Extension Host 跑所有插件 | **路 1** |
| 单窗口 WebView 数 | N 个 | 1 壳 + 按需 N 个 UI WebView | **路 2** |
| 归一化 | 一条通信通道 | 两条通信通道（api + postMessage） | **路 1** |
| AI 友好度 | AI 天然会写 React | AI 需要专用 API 文档 | **路 1** |
| 生态先例 | 无 | VS Code | **路 2** |
| 框架稳定性 | Tauri add_child unstable | Electron UtilityProcess stable | **路 2** |
| 安装包大小 | ~5MB (Tauri) | ~120MB (Electron) | **路 1** |
| 内存基线 | ~50MB (Tauri) | ~150MB (Electron) | **路 1** |

---

## 四、如果切换——需要改什么

### 4.1 从路 1 切换到路 2 的改动范围

| 层 | 当前（路 1） | 切换后（路 2） | 工作量 |
|---|---|---|---|
| 插件定义 | `export default function` | `export function activate(ctx)` | 每个插件重写 |
| 插件加载 | `pluginLoader/`——React.lazy + mount | Extension Host 进程 + Node require | 重写 |
| 插件通信 | `useSerialContext()` 直接读 | `await api.serial.getPorts()` | Hook → api.* 全面替换 |
| 插件 UI | 一个 React 组件 | activate() 脚本 + WebView bundle——两部分 | 每个插件拆成两份 |
| 核心服务 | ConfigurationService 等在壳 WebView | 同，但多一层 Extension Host IPC | IPC 通道多一条 |
| 数据管道 | DataPipeline → hook | DataPipeline → api.* + postMessage | 两头接 |
| 串口后端 | Rust（Tauri）或 Node（Electron） | Node（Electron Extension Host 可直接调） | 取决于框架 |
| 现有插件 | 终端/设置/市场/工作台——4 个 React 组件 | 拆成 8 个文件（每个=activate + webview bundle） | ~2 天（AI 写） |

### 4.2 AI 写代码——改动量的意义变了

上面的"每个插件重写"在手工时代是几周的工作量。AI 时代是几小时。

**但 AI 改的是代码——架构决定的"插件开发体验"和"自由度"是永久的。** 路 2 选了 activate() → 每个新插件都需要 activate() + WebView bundle 两套代码——AI 写，但一直要写。路 1 每个新插件一个 React 组件就完了。

---

## 五、框架在其中的位置

### 5.1 Tauri 只能走路 1

Tauri 没有 Extension Host 等价物。`add_child` 是多 WebView，没有独立 Node 进程的概念。

**在 Tauri 上，路 2 不可行。** 你必须 React 组件 + 多 WebView。

### 5.2 Electron 可以走两条路

| | Electron 路 1 | Electron 路 2 |
|---|---|---|
| 插件模型 | React 组件 | activate() + Extension Host |
| 隔离 | `WebContentsView`——每个插件独立 Chromium 渲染进程 | `UtilityProcess`——一个 Node 进程跑所有插件逻辑 |
| 插件 UI | 自己的 WebView | Extension Host 没有 UI——UI 走 `WebviewView`（还是 WebView） |
| 多 WebView | 有 | 有——插件 UI 还是 WebView |
| 安装包 | ~120MB | ~120MB |
| 内存 | 150MB 基线 + N×60MB per plugin WebView | 150MB 基线 + Extension Host ~50MB + N×60MB per plugin UI WebView |
| 进程数 | 1 主 + N 插件 WebView | 1 主 + 1 ExtHost + N 插件 UI WebView |

**Electron 上路 2 的进程数可能更多——** Extension Host 是额外一个进程。而且 VS Code 的实际经验：Extension Host 内存占用 ~150MB（Encarons 的 VS Code 实测），不是免费的。

### 5.3 框架选择取决于插件模型选择

```
选路 1 → Tauri 和 Electron 都可行
  → Tauri: add_child unstable，踩坑
  → Electron: WebContentsView stable，120MB

选路 2 → 只能 Electron
  → Tauri 没有 Extension Host
```

**不先决定插件模型，讨论"换 Electron"没有意义。** 你说"看上 Electron 的 Extension Host 能力"——那意味着你必须同时接受路 2（activate() + api.*）。而路 2 放弃了 React 组件插件的自由度。

---

## 六、核心矛盾

```
React 组件插件
  ✅ 自由度——任何 web 库直接用
  ✅ AI 友好——AI 天然会写
  ✅ 归一化——一条通信通道
  ❌ 多 WebView 必然——Tauri add_child unstable

Extension Host + activate()
  ✅ 单 WebView 壳——成熟模式
  ✅ VS Code 先例——几十万扩展验证
  ❌ 插件自由度下降——api.* 白名单
  ❌ 插件开发体验下降——逻辑/UI 分离
  ❌ 隔离反而不如多 WebView——同进程插件互相影响
  ❌ 只能 Electron
```

**你不可能同时拥有"React 组件插件"和"Extension Host 单 WebView"。** React 组件需要 DOM → 必须 WebView → 隔离 = 多 WebView → 没有 Extension Host 节省 WebView 数量的空间。

---

## 七、推荐——路 1，两条子路径

### 路径 A：Tauri，等 add_child stable

- Phase 6（框架无关代码）正常推进
- Phase 7a 尝试 `add_child`——如果 stable 了直接用
- 如果还是 unstable → iframe + postMessage 降级（asyar 项目验证过）
- 如果 iframe 也不行 → 单 WebView + ErrorBoundary——已够用到 10+ 插件
- **三条退路，不需要换框架**

### 路径 B：Electron，WebContentsView

- Phase 6（框架无关代码）正常推进
- Phase 6 结束时决定换 Electron
- 14 个 Rust 命令 → Node.js（AI 迁移，~1 天）
- 6 个 Tauri API 文件 → Electron IPC（AI 迁移，~1 天）
- 插件代码一行不动——`export default function` 还是 `export default function`
- `WebContentsView` 是 stable API——不踩 `add_child` 的坑
- 代价：120MB 安装包、150MB 内存基线

### 不推荐：路 2

- 放弃 React 组件插件的自由度——不值得
- 插件开发体验下降——逻辑/UI 分离是永久的
- 隔离不如多 WebView——同进程插件互相影响
- 每个新插件都需要两套代码（activate + WebView bundle）
- `api.*` 设计、实现、文档——几百个函数——你不需要再造一个 VS Code 扩展 API

---

## 八、结论

1. **React 组件插件是对的。** 插件 = `export default function`——Web 开发者零门槛，AI 天然会写，任何 web 库直接用。不要为了 Extension Host 放弃这个。

2. **多 WebView 是 React 组件插件的必然代价。** 插件需要 DOM → 需要隔离 → 需要多进程 → 需要多 WebView。这个推导在 Tauri 和 Electron 上都成立。

3. **框架是实现细节。** Tauri 和 Electron 只是"把 React 组件塞进哪个进程"的方式不同。Tauri 的 `add_child` 是 unstable——Electron 的 `WebContentsView` 是 stable——这是唯一的实质区别。

4. **决策点在 Phase 6 结束时。** Phase 6 全是框架无关代码。到那时带着数据做决定：
   - `add_child` 进展？
   - 单 WebView 实测体验？
   - 是否愿意付 120MB 安装包换 stable API？

5. **AI 写代码改变了"改架构"的成本。** 从"几周"变成"几天"。但架构决定的"插件开发体验"、"自由度"、"归一化"是永久的——不会因为 AI 写代码而改变。架构选择的影响 > 迁移成本的影响。

---

## 九、相关文档

- [LinkDesk-Phase7-框架选择分析-Tauri-vs-Electron.md](./LinkDesk-Phase7-框架选择分析-Tauri-vs-Electron.md) — Tauri vs Electron 对比（上一轮讨论）
- [LinkDesk-Phase7-多WebView-坑与对策.md](./LinkDesk-Phase7-多WebView-坑与对策.md) — 七个坑的深度分析
- [LinkDesk-Phase7-多WebView架构.md](./LinkDesk-Phase7-多WebView架构.md) — IPC 协议 + WebView 拓扑
- [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) — Phase 7 主设计文档
- memory: `multi-webview-freedom-principle.md` — 广度 vs 步骤自由度
- memory: `linkdesk-is-universal-container.md` — 为什么 LinkDesk 比 VS Code 更高级
