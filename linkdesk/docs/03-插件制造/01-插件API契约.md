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
| `commands.*` | ✅ execute | ✅ register + execute | 插件注册命令、壳执行命令 |
| `plugins.*` | ✅ | ❌ | 插件不能管理其他插件 |
| `window.*` | ✅ | ❌ | 插件不能创建/关闭 WebView |
| `dialog.*` | ✅ | ❌ | 插件不弹系统对话框——走壳的 UI |
| `events.*` | ✅ | ✅ | 插件需要订阅事件 |
| `clipboard.*` | — | ✅ 🆕 | 读/写系统剪贴板（E3g 计划） |
| `env.*` | — | ✅ 🆕 | 读 app 版本/平台/语言（E3g 计划） |

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
// ── 插件注册命令（声明"我能做什么"） ──
window.linkdesk.commands.register(id: string, handler: (...args: unknown[]) => unknown): Promise<void>
  // 注册命令到 CommandRegistry。壳的命令面板/菜单/快捷键通过此命令调用你的插件

// ── 插件执行命令（调用"壳或其他插件能做什么"） ──
window.linkdesk.commands.execute(id: string, ...args: unknown[]): Promise<unknown>
  // 执行任意已注册命令。壳的核心命令（closeTab/splitRight/toggleSidebar 等）也可调用
```

**使用示例：**
```typescript
// 插件注册命令——在 plugin.json contributes.commands 声明 + 代码注册 handler
window.linkdesk.commands.register("cad.importDxf", async () => {
  const path = await window.linkdesk.dialog.showOpenDialog({ filters: [{ name: "DXF", extensions: ["dxf"] }] });
  // ... 导入逻辑
});

// 插件执行壳命令——打开新标签页
await window.linkdesk.commands.execute("workbench.action.splitRight");
```

### 3.5 `events`——事件订阅

```typescript
window.linkdesk.events.on(channel: string, callback: (...args: unknown[]) => void): void
window.linkdesk.events.off(channel: string, callback: (...args: unknown[]) => void): void
```

**壳广播事件列表（插件可订阅）：**

| 频道 | payload | 触发时机 |
|------|------|------|
| `theme:changed` | `{ themeId: string }` | 用户切换主题 |
| `lang:changed` | `{ langCode: string }` | 用户切换语言 |
| `workspace:changed` | `{ rootPath: string }` | 用户打开/切换文件夹 |
| `plugin:unregistered` | `{ pluginId: string }` | 其他插件被卸载 |
| `serial:connected` | `{ portName: string }` | 串口连接建立 |
| `serial:disconnected` | `{ portName: string }` | 串口连接断开 |

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

### 3.7 `clipboard`——剪贴板（🆕 E3g 计划）

```typescript
window.linkdesk.clipboard.readText(): Promise<string>
window.linkdesk.clipboard.writeText(text: string): Promise<void>
```

### 3.8 `env`——环境信息（🆕 E3g 计划）

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
