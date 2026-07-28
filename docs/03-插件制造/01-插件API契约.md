# 01 — 插件 API 契约

> 2026-07-24。**`window.linkdesk.*` 完整 API 定义。** 这是插件开发者能调用的全部系统级能力。Web 平台能力（Canvas/WebGL/WebRTC/fetch 等）不限——只有系统级能力走此 API。
>
> **对标 VS Code：** `vscode` 命名空间。但 LinkDesk 更窄——只暴露系统能力，Web 能力不封装。

---

## 一、设计原则

| 原则 | 如何体现 |
|------|------|
| **核心无知** | 主进程 IPC handler 只看 `pluginId + channel`，不读 payload |
| **归一化** | 所有系统级能力走 `window.linkdesk.*`——一个入口 |
| **安全** | 插件 preload 比壳 preload 窄——插件不能调 `plugins.install` 或 `window.createPluginView` |
| **AI 友好** | 完整 TypeScript 类型——AI 看类型就知道能调什么 |

---

## 二、壳 vs 插件——API 差异

插件在自己的 WebContentsView 中运行（E3a 后）。插件 preload 比壳 preload **窄**——核心无知原则。

| 命名空间 | 壳可调 | 插件可调 | 为什么 |
|------|:--:|:--:|------|
| `serial.*` | ✅ | ✅ | 插件需要串口 |
| `filesystem.*` | ✅ 全部 | ✅ 受限 | 插件能读写但不能枚举其他插件目录 |
| `path.*` | ✅ | ❌ | 主进程路径拼接——插件不需要 |
| `config.*` | ❌ 壳直接读 ConfigurationService | ✅ | 插件配置走 IPC |
| `commands.*` | ✅ execute | ✅ execute | 插件执行命令；注册命令走 plugin.json contributes |
| `pluginManager.*` | ✅ | ✅ | 插件市场需要查询/启用/禁用/安装/卸载 |
| `window.*` | ✅ | ❌ | 插件不能创建/关闭 WebView |
| `dialog.*` | ✅ | ❌ | 插件不弹系统对话框——走壳的 UI（E3g 计划开放） |
| `events.*` | ✅ | ✅ | 插件需要订阅事件 |
| `lang.*` | ✅ | ✅ | 插件需要接收语言切换广播 |
| `notifications.*` | ✅ | ✅ | 插件需要弹出 toast 通知用户 |
| `clipboard.*` | — | ✅ | 读/写系统剪贴板 |
| `env.*` | — | ✅ | 读 app 版本/平台/语言 |

---

## 三、完整 API 定义

### 3.1 `serial`——串口

```typescript
interface OpenPortConfig {
  portName: string;
  baudRate: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 1.5 | 2;
  parity?: "none" | "even" | "odd" | "mark" | "space";
  flowControl?: "none" | "hardware" | "software";
}

interface PortInfo {
  name: string;        // "COM3"
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
}

interface SerialStats {
  txBytes: number;
  rxBytes: number;
}
```

```typescript
window.linkdesk.serial.getPorts(): Promise<PortInfo[]>
  // 枚举可用串口

window.linkdesk.serial.getStatus(): Promise<{ isOpen: boolean; portName?: string; baudRate?: number }>
  // 当前串口状态

window.linkdesk.serial.openPort(config: OpenPortConfig): Promise<void>
  // 打开串口。失败 throw Error

window.linkdesk.serial.closePort(): Promise<void>
  // 关闭串口

window.linkdesk.serial.sendData(data: Uint8Array): Promise<number>
  // 发送二进制数据。返回已发送字节数（0 是合法值）

window.linkdesk.serial.sendText(text: string, encoding: string): Promise<number>
  // 发送文本。encoding: "utf-8" | "gbk" | "shift-jis" 等

window.linkdesk.serial.setDtr(enable: boolean): Promise<void>
window.linkdesk.serial.setRts(enable: boolean): Promise<void>
  // 硬件流控引脚控制

window.linkdesk.serial.onData(callback: (text: string) => void): void
  // 订阅串口接收数据。不需要取消函数——插件 WebView 销毁时自动清理

window.linkdesk.serial.onStats(callback: (stats: SerialStats) => void): void
  // 订阅 TX/RX 统计

window.linkdesk.serial.onSystem(callback: (msg: string) => void): void
  // 订阅系统消息（如 "USB 设备已拔出"）
```

### 3.2 `filesystem`——文件系统

```typescript
interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;
  modifiedAt?: number;
}
```

```typescript
// ── 壳 preload（全部） ──
window.linkdesk.filesystem.readTextFile(path: string): Promise<string>
window.linkdesk.filesystem.writeTextFile(path: string, data: string): Promise<void>
window.linkdesk.filesystem.readFile(path: string): Promise<Uint8Array>
window.linkdesk.filesystem.writeFile(path: string, data: Uint8Array): Promise<void>
window.linkdesk.filesystem.exists(path: string): Promise<boolean>
window.linkdesk.filesystem.mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>
window.linkdesk.filesystem.readdir(path: string): Promise<FileEntry[]>
window.linkdesk.filesystem.copy(src: string, dest: string): Promise<void>
window.linkdesk.filesystem.remove(path: string): Promise<void>

// ── 插件 preload（受限——只能读写有权限的路径） ──
window.linkdesk.filesystem.readTextFile(path: string): Promise<string>
window.linkdesk.filesystem.writeTextFile(path: string, data: string): Promise<void>
```

**插件文件系统权限约定：**

| 路径 | 权限 | 用途 |
|------|:--:|------|
| `.linkdesk/plugins/<pluginId>/data/` | 读+写 | **插件自己的数据目录——持久化、缓存、导出** |
| 用户通过对话框选择的文件 | 读+写 | 编辑器打开文件、CAD 导入导出 |
| Workspace 目录（用户打开的文件夹） | 读 | 文件树浏览、编辑器打开 |
| 其他插件目录 | ❌ | 禁止 |
| 系统目录 | ❌ | 禁止 |

### 3.3 `config`——配置

```typescript
window.linkdesk.config.get<T>(key: string): Promise<T>
  // 读配置项，返回当前值

window.linkdesk.config.set<T>(key: string, value: T): Promise<void>
  // 写配置项。自动持久化 + 通知所有订阅者

window.linkdesk.config.onChange(key: string, callback: (value: unknown) => void): void
  // 订阅配置变化。Settings Editor 改值 → 你的插件收到通知
```

**配置 key 命名规则：** `<pluginId>.<property>`，如 `terminal.baudRate`、`cad.gridSize`。

### 3.4 `commands`——命令

```typescript
// ── 插件注册命令──
// 🔒 命令注册不走 runtime API——handler 函数无法通过 IPC 序列化。
// 在 plugin.json 的 contributes.commands 中声明命令 ID + title + category，
// 壳根据 plugin.json 自动注册到 CommandRegistry + 命令面板。
// 插件代码中只需 export 对应的命令处理函数（index.tsx 中导出同名函数）。
// 详见 `03-插件contributes规范.md` §命令注册。

// ── 插件执行命令（调用"壳或其他插件能做什么"）──
window.linkdesk.commands.execute(id: string, ...args: unknown[]): Promise<unknown>
  // 执行任意已注册命令。壳的核心命令（closeTab/splitRight/toggleSidebar 等）也可调用
```

**使用示例：**
```typescript
// 插件注册命令——在 plugin.json 声明 + 代码 export handler
// plugin.json:
//   "contributes": {
//     "commands": [{ "id": "cad.importDxf", "title": "导入 DXF" }]
//   }
// index.tsx:
//   export function cad_importDxf() { ... }   // handler 命名：id 中的 . 换 _

// 插件执行其他插件/壳提供的命令
const color = await linkdesk.commands.execute('color-picker.pick', { initialColor: '#ff0000' })
const choice = await linkdesk.commands.execute('quickpick.show', { title: '选择端口', items: [{ label: 'COM3' }, { label: 'COM5' }] })
await linkdesk.commands.execute('serial-monitor.send', [0xFF, 0x01, 0x01])
```

**已知可调用的命令（壳/其他插件注册）：**

| 命令 ID | 提供方 | 参数 | 返回值 | 说明 |
|------|------|------|------|------|
| `color-picker.pick` | 壳（#59e） | `{ initialColor, title? }` | `string \| undefined` | 弹出调色盘→返回用户选的颜色；取消返回 undefined |
| `quickpick.show` | 壳（#80） | `{ title?, items: { label, description? }[] }` | `{ label, description? } \| undefined` | 弹出浮动列表让用户选一项；对标 VS Code `showQuickPick()` |
| `serial-monitor.send` | 终端（#79） | `number[] \| string` | `Promise<void>` | 发送数据到串口 |
| `sbq-protocol.encode` | 协议插件 | `Record<string, unknown>` | `number[]` | 编码字段为串口字节（示例——尚未实现） |
| … | 任何插件 | … | … | 🆕 新插件注册命令→往此表加一行 |

// 插件执行壳命令——打开新标签页
await window.linkdesk.commands.execute("workbench.action.splitRight");
```

### 3.5 `events`——事件发布与订阅

> 插件之间数据通信的唯一通道。不是"终端开个门给协议"——所有数据走同一根管道，频道名是插件自己起的字符串。核心不知道频道名是什么意思。

```typescript
// ── 订阅（已有）──
window.linkdesk.events.on(channel: string, callback: (payload: unknown) => void): () => void
  // 订阅任意频道。返回 unsubscribe 函数——组件 unmount 时调用清理。
  // ⚠️ 回调中用到 React state 必须用 ref 桥接（见 §四 IPC 可靠性约定）

// ── 发布（🆕 E3j #77 计划）──
window.linkdesk.events.emit(channel: string, payload: unknown): Promise<void>
  // 往频道推数据。所有订阅该频道的插件都会收到。
  // 频道名约定：<插件id>:<数据名>——如 serial:rawData、sbq-protocol:parsed
```

**频道命名约定：** `<发出数据的插件id>:<数据名>`。一眼就知道数据来源和内容。不是随机字符串。

**壳广播事件（`events.on` 可订阅——壳发出，插件接收）：**

| 频道 | payload | 触发时机 |
|------|------|------|
| `theme:changed` | `{ themeId: string; themeType: string; variables: Record<string, string> }` | 用户切换主题（CSS 变量自动注入，无需手动订阅） |
| `lang:changed` | `{ lang: string; resources: Record<string, unknown> }` | 用户切换语言 |
| `workspace:changed` | `{ rootPath: string }` | 用户打开/切换文件夹 |
| `plugin:unregistered` | `{ pluginId: string }` | 其他插件被卸载 |

**插件广播事件（`events.emit` 发出——插件发出，其他插件订阅）：**

| 频道 | 发出方 | payload | 说明 |
|------|------|------|------|
| `serial:rawData` | 终端插件 | `{ portName: string; text: string }` | 原始串口数据——协议插件订阅后解析 |
| `serial:connected` | 终端插件 | `{ portName: string; baudRate: number }` | 串口连接建立 |
| `serial:disconnected` | 终端插件 | `{ portName: string }` | 串口连接断开 |
| … | 任何插件 | … | 🆕 新插件往此表加一行——核心不感知 |

### 3.6 `dialog`——对话框（🆕 E3g 计划）

```typescript
// ── 壳 preload 暴露，插件 preload 不暴露 ──

window.linkdesk.dialog.showConfirm(message: string): Promise<boolean>
  // 确认对话框。返回 true = 用户点了"确定"

window.linkdesk.dialog.showOpenDialog(options?: {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
  properties?: Array<"openFile" | "openDirectory" | "multiSelections">;
}): Promise<string[]>
  // 系统文件选择器。返回用户选中的文件路径数组

window.linkdesk.dialog.showSaveDialog(options?: {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}): Promise<string | undefined>
  // 系统保存文件对话框。返回用户选的路径

window.linkdesk.dialog.showInputBox(options?: {
  title?: string;
  prompt?: string;
  value?: string;
  placeHolder?: string;
  validateInput?: (value: string) => string | undefined;
}): Promise<string | undefined>
  // 输入框。对标 VS Code window.showInputBox()
```

### 3.7 `clipboard`——剪贴板

```typescript
window.linkdesk.clipboard.readText(): Promise<string>
window.linkdesk.clipboard.writeText(text: string): Promise<void>
```

### 3.8 `env`——环境信息

```typescript
interface AppEnv {
  appVersion: string;       // "1.0.0"
  platform: string;         // "win32" | "darwin" | "linux"
  locale: string;           // "zh-CN"
  appDataDir: string;       // LinkDesk 数据目录绝对路径
  pluginDataDir: string;    // 当前插件专用数据目录绝对路径
}

window.linkdesk.env.get(): Promise<AppEnv>
```

### 3.9 `pluginManager`——插件管理

> 查询已加载插件、启用/禁用/安装/卸载。对标 VS Code 的 `vscode.extensions`。

```typescript
// ── 查询 ──
window.linkdesk.pluginManager.list(): Promise<PluginInfo[]>
  // 获取所有已加载插件的清单（含 pluginId + manifest 摘要）
  // 返回：{ pluginId, manifest: { name, description, version, core, author, statusBar, contributes } }[]

window.linkdesk.pluginManager.getDisabled(): Promise<string[]>
  // 获取被禁用的插件 ID 列表

window.linkdesk.pluginManager.getUninstalled(): Promise<string[]>
  // 获取已卸载但残留数据的插件 ID 列表

window.linkdesk.pluginManager.isDisabled(pluginId: string): Promise<boolean>
  // 检查插件是否被禁用

// ── 操作 ──
window.linkdesk.pluginManager.enable(pluginId: string): Promise<void>
  // 启用已禁用的插件

window.linkdesk.pluginManager.disable(pluginId: string): Promise<void>
  // 禁用插件——插件从 UI 移除但文件不删，可重新启用

window.linkdesk.pluginManager.install(pluginPath: string): Promise<void>
  // 安装插件——从 .linkdesk 文件或目录路径安装

window.linkdesk.pluginManager.uninstall(pluginId: string): Promise<void>
  // 卸载插件——删除插件文件 + 清理注册表

window.linkdesk.pluginManager.reinstall(pluginId: string): Promise<void>
  // 重装插件——卸载后立即重装，保留插件 ID 不变
```

**使用示例：**
```typescript
// 插件市场列出所有已安装插件
const plugins = await window.linkdesk.pluginManager.list();
for (const p of plugins) {
  console.log(`${p.manifest.name} (${p.pluginId})`);
}

// 禁用插件
await window.linkdesk.pluginManager.disable("community.light-theme");

// 检查状态
const disabled = await window.linkdesk.pluginManager.isDisabled("community.light-theme");
```

### 3.10 `lang`——语言同步

> 接收壳广播的语言数据。对标 VS Code 的 `vscode.env.language` + `vscode.l10n`。
> 壳切换语言时自动推送新的翻译资源到所有插件 WebView。

```typescript
window.linkdesk.lang.getInitial(): { lang: string; resources: Record<string, unknown> } | null
  // 获取插件 WebView 启动时壳已推送的初始语言数据。
  // 返回 null = 尚未收到壳广播（极早期调用）。
  // resources: { "终端": "Terminal", "设置": "Settings", ... }——按 key 取翻译文本

window.linkdesk.lang.onChange(callback: (data: { lang: string; resources: Record<string, unknown> }) => void): () => void
  // 订阅语言变更。返回 unsubscribe 函数。
  // 用户切换语言 → 壳广播 → 所有插件收到新的 resources
```

**使用示例：**
```typescript
// 启动时获取初始语言
const initial = window.linkdesk.lang.getInitial();
if (initial) {
  console.log(`当前语言: ${initial.lang}`);
}

// 订阅语言切换
const unsub = window.linkdesk.lang.onChange(({ lang, resources }) => {
  // 更新插件内部的 i18n 缓存
  i18next.addResourceBundle(lang, 'translation', resources, true, true);
  i18next.changeLanguage(lang);
});

// 组件卸载时清理
// unsub();
```

### 3.11 `notifications`——通知（🆕 E3j #76 计划）

> 右下角 toast 通知。对标 VS Code `vscode.window.showInformationMessage` / `showWarningMessage` / `showErrorMessage` / `withProgress`。
> 插件通知走壳的 `pushToast()` 基础设施——不重复造轮子。

```typescript
type NotificationType = "info" | "warning" | "error";

interface NotificationOptions {
  type?: NotificationType;       // 默认 "info"
  progress?: boolean;            // true = 进度条模式（可 update/finish）
  cancellable?: boolean;         // 进度条模式下是否显示取消按钮
  source?: string;               // 通知来源 ID（通常为 pluginId——自动填入）
  actions?: { label: string; callback: () => void }[];  // 操作按钮（Phase 6+）
}

interface NotificationHandle {
  update(message: string): void;   // 更新通知文字
  finish(message?: string): void;  // 进度条跳到 100% 后消失
  cancel(): void;                  // 立即移除
}

window.linkdesk.notifications.show(message: string, options?: NotificationOptions): NotificationHandle
  // 右下角弹出 toast。返回 handle——进度条模式下调 update/finish/cancel。
```

**使用示例：**
```typescript
// 简单通知
window.linkdesk.notifications.show("导出完成");

// 带类型
window.linkdesk.notifications.show("连接超时", { type: "error" });

// 进度条模式——对标 VS Code vscode.window.withProgress
const handle = window.linkdesk.notifications.show("正在处理...", { progress: true, cancellable: true });
await doStep1();
handle.update("步骤 2/3：解析数据...");
await doStep2();
handle.update("步骤 3/3：写入文件...");
await doStep3();
handle.finish("处理完成");
```

---

## 四、IPC 可靠性约定

每个 `window.linkdesk.*` 调用底层走 `ipcRenderer.invoke()` —— 异步 IPC。

**规则：**
1. **每个 invoke 有 5s 超时。** 超时 throw `Error("IPC timeout: <channel>")`
2. **返回值有 falsy 可能。** `""` / `0` / `false` 是合法值。用 `isNaN(n) ? default : n` 而非 `n || default`（G22 教训）
3. **IPC 回调里用到 React state → 用 ref 桥接。** 不能假设闭包里的 state 是最新的（B86 教训）

```typescript
// ❌ IPC 回调里读 state——拿到的是注册时的旧值
const [portName, setPortName] = useState("");
useEffect(() => {
  window.linkdesk.serial.onData((text) => {
    if (portName === "COM3") { ... }  // portName 永远是 ""
  });
}, []);

// ✅ 用 ref 桥接——永远读最新值
const portNameRef = useRef(portName);
portNameRef.current = portName;
useEffect(() => {
  window.linkdesk.serial.onData((text) => {
    if (portNameRef.current === "COM3") { ... }  // 永远最新
  });
}, []);
```

---

## 五、迁移对照——Tauri → Electron

| Tauri（旧） | Electron（新） | 变化 |
|------|------|:--:|
| `invoke("list_ports")` | `window.linkdesk.serial.getPorts()` | 名变，参不变 |
| `invoke("open_port", {...})` | `window.linkdesk.serial.openPort({...})` | 名变，参不变 |
| `invoke("close_port")` | `window.linkdesk.serial.closePort()` | 名变 |
| `invoke("send_data", {...})` | `window.linkdesk.serial.sendData(...)` | 名变，参不变 |
| `invoke("send_text", {...})` | `window.linkdesk.serial.sendText(...)` | 名变，参不变 |
| `listen("serial-data", cb)` | `window.linkdesk.serial.onData(cb)` | 事件→回调 |
| `invoke("list_plugin_dirs")` | 壳专属——插件无此能力 | — |
| `invoke("install_plugin")` | 壳专属——插件无此能力 | — |
| `@tauri-apps/plugin-fs` | `window.linkdesk.filesystem.*` | 名变，接口同 |
| `@tauri-apps/api/path` | 插件不需要——主进程处理路径 | — |
| `window.__TAURI__` 检测 | `window.linkdesk` 是否存在 | 检测目标变了 |

---

> **下一份：** `02-插件生命周期.md`——注册→激活→运行→卸载全状态机
> **全部文档索引：** `00-README.md`
