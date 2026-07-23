# Phase 7 — 多 WebView 坑与对策

> 2026-07-23。Encaron 与 AI 深度讨论——多 WebView 实现后会真实发生的问题，逐条分析频率、严重度、解法。
> **每个坑都不可怕——但必须提前知道，不能踩了才发现。**

---

## 总览

| # | 问题 | 频率 | 严重度 | 解法状态 |
|:--:|------|:--:|:--:|:--:|
| 1 | CSS 变量同步 | 切主题时（低频） | 不可见 | 广播 + 版本号 |
| 2 | IPC 竞态 | 读写交叉时 | 可控 | 请求队列串行化 |
| 3 | 内存 | 持续 | 可控 | 按需激活 + 关闭销毁 |
| 4 | 调试地狱 | 开发时 | 中 | Tracing 结构化日志 |
| 5 | 插件开发体验倒退 | 写插件时 | 低 | Hook 签名不变 |
| 6 | 视觉接缝 | 持续 | 中 | 像素级 bounds 管理 |
| 7 | Rust 命令权限 | 持续 | 高 | Tauri Capability（已有） |

---

## 一、CSS 变量同步

### 问题

现在是单 WebView：`var(--bg)` 改了，所有插件立刻看到。

多 WebView 后：每个 WebView 有自己的 CSS 变量表。主题切换时核心要**广播**给所有 WebView——不再是"改一个变量全局生效"，是"N 个 WebView 逐个同步"。

先收到的和后收到的差几十毫秒——短暂的视觉不一致。

### 频率

**只有切换主题的那一刻。** 不是每秒都发生。一次会话切一两次主题。发生时不可见——人眼对颜色变化的感知远慢于 IPC 延迟（~1-5ms）。

### 解法

```typescript
// 壳 WebView
function broadcastTheme(theme: Theme) {
  const message = { version: Date.now(), variables: theme.cssVariables };
  pluginWebViews.forEach(wv => wv.postMessage({ type: "theme:update", ...message }));
}

// 插件 WebView
let currentVersion = 0;
onMessage("theme:update", ({ version, variables }) => {
  if (version <= currentVersion) return; // 忽略过期消息
  currentVersion = version;
  applyCssVariables(variables);
});
```

**版本号防乱序——标准模式。**

### 严重度

**低。** 低频 + 不可见 + 解法简单。

---

## 二、IPC 竞态

### 问题

单 WebView 下 JS 是单线程的——`openPort("COM3")` 执行完才轮到 `getPorts()`。多 WebView 后每个插件有自己的事件循环：

```
插件 A：openPort("COM3")  → IPC → 壳 → Rust  → 正在打开...
插件 B：getPorts()        → IPC → 壳 → Rust  → 返回 "COM3 还在打开中"
```

插件 B 在 A 的 openPort 完成前就读了——拿到的状态是旧的。

### 频率

**只有"写和读交叉时"才发生。** 插件的典型数据流是：

```
插件 mount → 请求初始状态 → 收到 → 渲染
            → 订阅变更    → 收到 → 更新
```

不是"每一帧都在问壳要数据"。大部分时间插件在读，竞态窗口很小。

**真正受影响：** 插件 A 写数据的同时插件 B 查询状态。这种场景不多——终端发数据时，其他插件通常不查询终端状态。

### 解法

**壳侧请求队列串行化——模拟 JS 单线程行为：**

```typescript
class IpcBridge {
  private queue: IpcMessage[] = [];
  private processing = false;

  async handle(message: IpcMessage) {
    this.queue.push(message);
    if (!this.processing) this.processQueue();
  }

  private async processQueue() {
    this.processing = true;
    while (this.queue.length > 0) {
      const msg = this.queue.shift()!;
      await this.dispatch(msg);  // 逐个处理
    }
    this.processing = false;
  }
}
```

**所有 IPC 请求串行处理——行为跟单 WebView 的 JS 单线程完全一致。** 插件作者不需要知道下面是 IPC。

### 严重度

**低。** 解法简单（队列化），影响范围窄（只有读写交叉时）。

---

## 三、内存

### 问题

现在是单 WebView——4 个插件共享一个 WebView，基线 **5MB**。

多 WebView 后每个插件自带 React + CSS 引擎 + DOM：

| WebView | 预估 | 说明 |
|---|---|---|
| 壳（layout + 三栏 + 核心服务） | ~80MB | WebView2 进程基线 40-60 + React + 壳代码 |
| 终端插件（CM6/xterm） | ~70MB | xterm + CM6 编辑器 |
| 编辑器插件（Monaco） | ~130MB | Monaco 是重型编辑器 |
| 文件树插件 | ~60MB | 文件树 + 图标渲染 |
| 地图插件（Leaflet + 瓦片缓存） | ~100MB | 地图瓦片吃内存 |
| 工作台（卡片网格） | ~80MB | react-grid-layout + 卡片组件 |

**6 个全开：~500-700MB。** 对标 VS Code 同等规模（1443MB）差不多甚至更低。

### 为什么 VS Code 1443MB，LinkDesk 不会到那个数字

VS Code 的 1.4GB 大头不是多 WebView：

| 部分 | VS Code | LinkDesk |
|---|---|---|
| 主 UI 渲染 | ~200MB | ~80MB（壳 WebView） |
| C++ 语言服务器（原生进程） | ~300MB | Rust 共享进程，~10MB |
| PowerShell 语言服务器 | ~200MB | protocol plugin（Rust 侧） |
| Claude Code（独立 Node） | ~200MB | —（不装就不用） |
| 百度 Comate + 豆包 | ~150MB | —（不装就不用） |
| Extension Host 开销 | ~150MB | 无此概念 |

VS Code 内存高是因为**原生二进制进程**——语言服务器、AI 助手自带完整 Node 运行时。LinkDesk 的原生能力在 Rust 共享进程里跑，反而省内存。

### 关键——按需激活 + 关闭销毁

**不是装了 30 个插件就同时跑 30 个 WebView。**

```typescript
// 标签页关闭 → WebView 销毁 → 内存回收
function closeTab(tabId: string) {
  const pluginId = getPluginId(tabId);
  pluginWebViewManager.destroy(pluginId);  // WebView 进程 kill
  // JS heap → 0，内存回到基线
}
```

用户只开了 2 个标签页 → 只有 2 个插件 WebView 在运行。

### 插件类型——不是所有插件都需要 WebView

| 插件类型 | 需要 WebView？ | 说明 |
|---|---|---|
| view plugin | ✅ 需要 | React 组件，自己渲染 DOM |
| protocol plugin | ❌ 不需要 | 纯逻辑——Rust 侧或共享 WebView |
| resource plugin | ❌ 不需要 | 数据提供者——无 UI |
| theme plugin | ❌ 不需要 | 提供 CSS 变量 JSON |
| language plugin | ❌ 不需要 | 提供 i18n JSON |
| card plugin | 🔶 共用工作台 WebView | 在工作台 WebView 里渲染 |

**30 个插件里，真正需要独立 WebView 的 5-10 个。** 日常同时运行的 3-5 个。

### 硬盘占用

LinkDesk 插件是**纯 JS**——不需要打包原生二进制：

| | VS Code 50 个扩展 | LinkDesk 30 个插件 |
|---|---|---|
| 硬盘占用 | **1.4GB** | **15-50MB** |
| 为什么 | 语言服务器/调试器自带二进制（PowerShell 302MB、C++ 258MB） | 原生能力走 Tauri IPC，插件不打包二进制 |

### 严重度

**低。** 500-700MB 对标 VS Code 同等规模。硬盘几乎不占。按需激活 + 关闭销毁控制运行时内存。**从 5MB 起步翻不到 1.4GB。**

---

## 四、调试——Tracing

### 问题

现在是 F12 打开一个 DevTools，看到所有东西。多 WebView 后 N 个 DevTools 窗口。插件 A 调了 IPC，壳收到了没有？壳发了响应，插件 A 收到了没有？**跨 WebView 的调用链，Chrome DevTools 帮不了你。**

### Tracing 是什么

**结构化的跨进程日志。** 不是神秘技术——就是在每个 IPC 调用前后加两行记录：

```typescript
// IpcBridge 内置 tracing
async handleRequest(msg: IpcMessage) {
  trace.recv(msg.webviewId, msg.id, msg.channel, msg.payload);  // ← 收
  const result = await this.dispatch(msg);
  trace.send(msg.webviewId, msg.id, msg.channel, result);       // ← 发
}

// 输出：
// [10:23:01.234] 壳:IPC:recv   ← terminal:getPorts {}
// [10:23:01.238] 壳:Rust:call  → list_ports
// [10:23:01.250] 壳:Rust:recv  ← [COM3, COM5]
// [10:23:01.251] 壳:IPC:send   → terminal:getPorts {ports: ["COM3","COM5"]}
// [10:23:01.252] terminal:IPC:recv ← 壳:getPorts {ports: ["COM3","COM5"]}
```

### 可视化

Tracing 日志在壳 WebView 的 DevTools Console 里统一展示——**一个 DevTools 看全部 IPC 流量**：

```
壳 DevTools:
  [IPC Trace] 按 WebView 过滤: [全部] [terminal] [file-tree] [settings]
  ─────────────────────────────────────────────────
  10:23:01.234 ◀ terminal   getPorts     {}
  10:23:01.238 ▶ Rust        list_ports
  10:23:01.250 ◀ Rust        list_ports   [COM3, COM5]
  10:23:01.251 ▶ terminal    getPorts     {ports: Array(2)}
  ─────────────────────────────────────────────────
  往返: 17ms ✓
```

### 实现量

~50 行。AI 在写 IpcBridge 时顺手写。不是 Phase 7 的独立任务——是 IpcBridge 的 built-in 能力。

### 严重度

**低。** 实现量小，一次性投入，开发时用。用户永远看不到。

---

## 五、插件开发体验

### 问题

现在写插件：`import { useSerialContext } from '@src/core'`——同步，一行。

多 WebView 后：IPC 是异步的——`useSerialContext()` 内部 `postMessage → 等回复 → 返回结果`。

VS Code 开发者写扩展：`vscode.workspace.findFiles()` 返回 `Thenable<Uri[]>`——也是异步的。他们习惯了。

### 关键——Hook 签名不变

```typescript
// 单 WebView 时代——插件作者写的：
const { ports, openSource } = useSerialContext()

// 多 WebView 时代——插件作者写的：
const { ports, openSource } = useSerialContext()
//                       ↑ 完全一样
```

**Hook 内部走 IPC 还是直接 import——调用方零感知。**

`useSerialContext` 在单 WebView 时从模块变量读，多 WebView 时从 IPC 读。**Hook 的实现换了，接口不变。** 插件作者不用改一行代码。

### 异步转同步的 React 模式

```typescript
function useIpcSerialContext() {
  // 初始值 = undefined → 首次渲染显示 loading
  const [state, setState] = useState<SerialState | undefined>();

  useEffect(() => {
    // 首次：拉初始值
    ipc.executeCommand("source:getStatus").then(setState);
    // 之后：订阅变更
    const sub = ipc.onEvent("source-state-changed", setState);
    return () => sub.dispose();
  }, []);

  return {
    ports: state?.ports ?? [],
    openSource: (name, config) => ipc.executeCommand("source:open", { name, config }),
    closeSource: () => ipc.executeCommand("source:close"),
  };
}
```

**插件 mount → 首次渲染可能 ports 是 `[]` → 几毫秒后 IPC 返回 → 二次渲染显示真实数据。** 这个"闪烁"几乎不可见——数据在壳侧是内存取，IPC 延迟 ~1-5ms。

### 对 VS Code 开发者的吸引力

VS Code 扩展开发的痛点：
- `vscode.*` API 几百个，学习曲线陡峭
- 不能自由渲染 UI——想要一个自定义视图得等 VS Code 团队加 API
- 调试复杂——Extension Host 是独立进程

LinkDesk 插件开发：
- 就是写 React 组件——Web 开发者零学习成本
- 完全自由渲染——`<LeafletMap />`、`<ThreeJSScene />`、`<MonacoEditor />`——想用什么用什么
- Hook 签名跟单 WebView 一样——IPC 透明

**VS Code 开发者适应 LinkDesk 比适应 VS Code 扩展更快——因为 React 是通用技能，`vscode.*` 不是。**

### AI 写模板代码

`multi-webview-freedom-principle.md` 已定调：

> 多 WebView 不影响插件广度自由度（能做什么），只增加步骤自由度（AI 的活）。IPC 模板代码 AI 生成——对人不可见。

### 严重度

**低。** Hook 签名不变 + AI 写 IPC 模板 + React 通用技能 > `vscode.*` 学习成本。

---

## 六、视觉接缝

### 问题

多个 WebView 拼在同一个窗口里——拖拽分屏时 WebView 的边界要对齐、z-index 要正确、拖拽区域的鼠标事件要正确路由。

### 解法

**壳管布局，插件管内容。**

```
┌─────────────── 壳 WebView ───────────────┐
│ 图标栏 │ 侧栏 │    主区                    │
│        │      │ ┌──────────┬───────────┐  │
│        │      │ │ 终端     │ 编辑器     │  │
│ 42px   │ 300px│ │ WebView  │ WebView   │  │
│        │      │ └──────────┴───────────┘  │
│        │      │          ↑                │
│        │      │     壳告诉每个 WebView 它的矩形
└──────────────────────────────────────────┘
```

```typescript
// 壳告诉每个插件 WebView 它的 bounds
function updateLayout(layout: SplitLayout) {
  layout.panes.forEach(pane => {
    pluginWebViewManager.setBounds(pane.pluginId, {
      x: pane.x,
      y: pane.y,
      width: pane.width,
      height: pane.height,
    });
  });
}

// Rust 侧调用 webview.set_position() + webview.set_size()
```

### Chrome 的经验

你用过 Chrome 的多标签页——你能看出每个标签页是独立进程吗？看不出来。

多 WebView 嵌在同一窗口里同理——**用户不知道也不关心下面是几个 WebView。** 他们只关心拖拽分屏时边界跟不跟手、有没有闪烁。

### 像素对齐

分屏比例用整数像素——不允许半个像素：

```typescript
function snapToPixel(rect: Rect): Rect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}
```

WebView 之间存在 1px 间隙？填一个 1px 的 `background-color: var(--border)` 的 div——不可见。

### 严重度

**中。** 需要像素级精细管理，但 Chrome / Electron 都解决过。不是新问题。

---

## 七、安全——权限

### 问题

插件无白名单——能调任何 Web API 和 invoke。单 WebView 时插件和壳共享 JS context——插件可以读 `localStorage` 里的任何东西。

多 WebView 后：每个插件独立 JS context → **插件 A 读不到插件 B 的 localStorage → 读不到壳的 sessionStorage。**

但插件还是能调 `invoke("fs:delete")` 删文件——需要 Tauri Capability 兜底。

### 已有防护

| 层 | 机制 | 状态 |
|:--:|------|:--:|
| 1 | 多 WebView JS 上下文隔离 | Phase 7 |
| 2 | core/ 代理层——插件不直接调 Tauri API | ✅ 已有 |
| 3 | Tauri Capability——Rust 层 ACL | ✅ 已有 |
| 4 | 安装时用户授权（展示权限列表） | Phase 7d |

**恶意插件绕过 core/ 代理直接 invoke → Tauri Capability 在 Rust 层拦截。**

```json
// src-tauri/capabilities/terminal.json
{
  "identifier": "terminal-capability",
  "windows": ["terminal-*"],
  "permissions": [
    "serial:allow-read",
    "serial:allow-write"
    // "fs:allow-delete" — 不在此列表中 → Rust 层拒绝
  ]
}
```

### 为什么不用 CSP

CSP 在 `plugin-isolation-universal-container.md` 已明确拒绝：

> CSP 是门禁，不是安全气囊。壳替插件做决定——壳不知道未来有哪些插件，地图需要瓦片服务器、AI 需要 API endpoint——白名单一定漏杀。多 WebView 已经解决了它想解决的问题——CSR 不需要。

### 严重度

**已解决。** Tauri Capability + 多 WebView JS 隔离 + 安装授权——三层够用。

---

## 八、不可怕的总览

| 问题 | 你是不是每秒都在经历？ | 你能解决吗？ |
|---|---|---|
| CSS 变量同步 | 否——切主题时才发生 | 广播 + 版本号，~10 行 |
| IPC 竞态 | 否——读写交叉时才发生 | 请求队列串行化，~20 行 |
| 内存 | — | 按需激活 + 关闭销毁 + 插件分类 |
| Tracing | 否——开发时用 | IpcBridge built-in，~50 行 |
| 开发体验 | — | Hook 签名不变，AI 写 IPC 模板 |
| 视觉接缝 | — | 壳管布局，像素对齐 |
| 安全 | — | Tauri Capability（已有） |

**每个坑都有解。没有一个坑是"每秒折磨你"。大部分是低频事件、开发时负担、或已有机制兜底。**

---

## 九、相关文档

- [LinkDesk-Phase7-多WebView架构.md](./LinkDesk-Phase7-多WebView架构.md) — 架构设计 + IPC 协议
- [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) — 主设计文档
- [LinkDesk-Phase7-实施顺序.md](./LinkDesk-Phase7-实施顺序.md) — 逐步执行计划
- [LinkDesk-框架选择分析-Tauri-vs-Electron.md](./LinkDesk-框架选择分析-Tauri-vs-Electron.md) — Tauri vs Electron 对比
- [插件隔离——通用容器防线](../phase5.5_交互对标/V3-Phase5.5-ErrorBoundary增强计划.md) — 多 WebView 是防线第四层
- memory: `plugin-isolation-universal-container.md` — CSP/iframe/Worker 明确拒绝原因
- memory: `multi-webview-freedom-principle.md` — Encaron 定调——广度 vs 步骤自由度
- memory: `multi-webview-migration-rules.md` — 现在写代码遵守的 import 规则
