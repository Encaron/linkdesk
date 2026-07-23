# 05 — API 与协议设计

> 2026-07-23。定义 `window.linkdesk` API 的完整契约、preload 分层设计、`linkdesk://` 自定义协议。
> **这是插件开发者的接口——迁移执行前定稿。**

---

## 一、设计原则

| 原则 | 如何体现 |
|------|------|
| **核心无知** | 主进程 IPC handler 只看 `{ pluginId, type }`，不读 payload。壳转发消息不处理业务 |
| **归一化** | 所有系统级能力走 `window.linkdesk.*`——一个入口，一个名字，全代码库一致 |
| **AI 友好** | 完整 TypeScript 类型定义——AI 看类型就知道能调什么、参数是什么 |
| **安全** | 插件 preload 比壳 preload 窄——插件不能调管理型 API（install/uninstall/createView） |
| **对标 VS Code** | `contextBridge` 对标 VS Code 的 preload + `vscode` 命名空间（但更窄——只暴露系统能力，Web 能力无限制） |

---

## 二、壳窗口 preload (`electron/preload-shell.ts`)

壳窗口自己是 BrowserWindow 的 Chromium 渲染进程。壳的 preload 暴露壳需要的**全部**系统能力：

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('linkdesk', {
  // ═══════════════════════════════════════════
  // 串口 —— serialport npm 包的 IPC 代理
  // ═══════════════════════════════════════════
  serial: {
    getPorts:     ()                    => ipcRenderer.invoke('serial:getPorts'),
    getStatus:    ()                    => ipcRenderer.invoke('serial:getStatus'),
    openPort:     (cfg: OpenPortConfig) => ipcRenderer.invoke('serial:openPort', cfg),
    closePort:    ()                    => ipcRenderer.invoke('serial:closePort'),
    sendData:     (data: Uint8Array)    => ipcRenderer.invoke('serial:sendData', data),
    sendText:     (text: string, enc: string) => ipcRenderer.invoke('serial:sendText', text, enc),
    setDtr:       (enable: boolean)     => ipcRenderer.invoke('serial:setDtr', enable),
    setRts:       (enable: boolean)     => ipcRenderer.invoke('serial:setRts', enable),
    onData:       (cb: (text: string) => void) => { ipcRenderer.on('serial:data', (_, d) => cb(d)); },
    onStats:      (cb: (stats: SerialStats) => void) => { ipcRenderer.on('serial:stats', (_, d) => cb(d)); },
    onSystem:     (cb: (msg: string) => void) => { ipcRenderer.on('serial:system', (_, d) => cb(d)); },
  },

  // ═══════════════════════════════════════════
  // 文件系统 —— fs 模块的 IPC 代理
  // ═══════════════════════════════════════════
  filesystem: {
    readTextFile:  (path: string) => ipcRenderer.invoke('filesystem:readTextFile', path),
    writeTextFile: (path: string, data: string) => ipcRenderer.invoke('filesystem:writeTextFile', path, data),
    readFile:      (path: string) => ipcRenderer.invoke('filesystem:readFile', path),
    writeFile:     (path: string, data: Uint8Array) => ipcRenderer.invoke('filesystem:writeFile', path, data),
    exists:        (path: string) => ipcRenderer.invoke('filesystem:exists', path),
    mkdir:         (path: string, opts?: { recursive?: boolean }) => ipcRenderer.invoke('filesystem:mkdir', path, opts),
    readdir:       (path: string) => ipcRenderer.invoke('filesystem:readdir', path),
    copy:          (src: string, dest: string) => ipcRenderer.invoke('filesystem:copy', src, dest),
    remove:        (path: string) => ipcRenderer.invoke('filesystem:remove', path),
  },

  // ═══════════════════════════════════════════
  // 路径 —— path 模块的 IPC 代理
  // ═══════════════════════════════════════════
  path: {
    appDataDir:  () => ipcRenderer.invoke('path:appDataDir'),
    join:        (...parts: string[]) => ipcRenderer.invoke('path:join', ...parts),
  },

  // ═══════════════════════════════════════════
  // 插件管理 —— 对标 Rust plugins.rs
  // ⚠️ 只有壳 preload 暴露此命名空间
  // ═══════════════════════════════════════════
  plugins: {
    listDirs:      () => ipcRenderer.invoke('plugins:listDirs'),
    listDisabled:  () => ipcRenderer.invoke('plugins:listDisabled'),
    install:       (source: string) => ipcRenderer.invoke('plugins:install', source),
    uninstall:     (pluginId: string) => ipcRenderer.invoke('plugins:uninstall', pluginId),
    reinstall:     (pluginId: string) => ipcRenderer.invoke('plugins:reinstall', pluginId),
    readManifest:  (pluginId: string) => ipcRenderer.invoke('plugins:readManifest', pluginId),
  },

  // ═══════════════════════════════════════════
  // 命令 —— 对标 Rust close_port 等命令
  // 壳侧使用：invokeBeforeClose 等生命周期命令
  // ═══════════════════════════════════════════
  commands: {
    execute: (id: string, ...args: unknown[]) => ipcRenderer.invoke('commands:execute', id, ...args),
  },

  // ═══════════════════════════════════════════
  // 窗口管理 —— WebContentsView 生命周期
  // ⚠️ 只有壳 preload 暴露此命名空间
  // ═══════════════════════════════════════════
  window: {
    createPluginView: (pluginId: string) => ipcRenderer.invoke('window:createPluginView', pluginId),
    closePluginView:  (pluginId: string) => ipcRenderer.invoke('window:closePluginView', pluginId),
    focusPluginView:  (pluginId: string) => ipcRenderer.invoke('window:focusPluginView', pluginId),
  },

  // ═══════════════════════════════════════════
  // 事件 —— 通用 IPC 事件订阅
  // ═══════════════════════════════════════════
  events: {
    on:  (channel: string, cb: (...args: unknown[]) => void) => {
      ipcRenderer.on(channel, (_, ...args) => cb(...args));
    },
    off: (channel: string, cb: (...args: unknown[]) => void) => {
      ipcRenderer.removeListener(channel, cb);
    },
  },

  // ═══════════════════════════════════════════
  // 对话框
  // ═══════════════════════════════════════════
  dialog: {
    showConfirm: (message: string) => ipcRenderer.invoke('dialog:showConfirm', message),
  },
});
```

---

## 三、插件 WebView preload (`electron/preload-plugin.ts`)

插件 WebView 的 preload 比壳**更窄**——核心无知原则：插件不知道壳的存在，不能操作其他插件。

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('linkdesk', {
  // ── 串口 ──
  serial: {
    getPorts:  () => ipcRenderer.invoke('serial:getPorts'),
    getStatus: () => ipcRenderer.invoke('serial:getStatus'),
    openPort:  (cfg) => ipcRenderer.invoke('serial:openPort', cfg),
    closePort: () => ipcRenderer.invoke('serial:closePort'),
    sendData:  (data) => ipcRenderer.invoke('serial:sendData', data),
    sendText:  (text, enc) => ipcRenderer.invoke('serial:sendText', text, enc),
    onData:    (cb) => { ipcRenderer.on('serial:data', (_, d) => cb(d)); },
  },

  // ── 配置 ──
  config: {
    get:      (key) => ipcRenderer.invoke('config:get', key),
    set:      (key, v) => ipcRenderer.invoke('config:set', key, v),
    onChange: (key, cb) => {
      ipcRenderer.on('config:changed', (_, d) => {
        if (d.key === key) cb(d.value);
      });
    },
  },

  // ── 命令 ──
  commands: {
    register: (id, handler) => ipcRenderer.invoke('commands:register', id),
    execute:  (id, ...args) => ipcRenderer.invoke('commands:execute', id, ...args),
  },

  // ── 文件系统（受限——只能读写插件自己的目录） ──
  filesystem: {
    readTextFile:  (p) => ipcRenderer.invoke('filesystem:readTextFile', p),
    writeTextFile: (p, d) => ipcRenderer.invoke('filesystem:writeTextFile', p, d),
  },

  // ⚠️ 插件不暴露：
  //   plugins.*    —— 不能安装/卸载/列出其他插件
  //   window.*     —— 不能创建/关闭/聚焦 WebView
  //   dialog.*     —— 不能弹系统对话框（走壳的 toast/ConfirmDialog）
  //   child_process / require / __dirname —— 不能绕过 preload 调 Node.js 原始能力
});
```

### 壳 vs 插件 preload 差异

| 命名空间 | 壳 preload | 插件 preload | 原因 |
|------|:--:|:--:|------|
| `serial.*` | ✅ 全部 | ✅ 全部 | 插件需要串口能力 |
| `filesystem.*` | ✅ 全部 | ✅ 受限（只读/写） | 插件能读写文件但不能枚举/删除其他目录 |
| `path.*` | ✅ | ❌ | 插件不需要路径拼接——主进程代理处理 |
| `plugins.*` | ✅ | ❌ | 插件不能管理其他插件 |
| `window.*` | ✅ | ❌ | 插件不能创建/关闭 WebView |
| `commands.execute` | ✅ | ✅ | 插件需要执行命令 |
| `commands.register` | ❌ | ✅ | 插件注册命令走自己的 preload |
| `dialog.*` | ✅ | ❌ | 插件不弹系统对话框——走壳的 UI |
| `config.*` | ❌（壳直接读 ConfigurationService） | ✅ | 插件配置走 IPC |

---

## 四、主进程 IPC Handler 结构

每个 IPC handler 在 `electron/ipc/` 下独立文件：

```
electron/ipc/
  ├── serial-handlers.ts     # serial:getPorts / openPort / closePort / sendData / ...
  ├── file-handlers.ts       # filesystem:readTextFile / writeTextFile / exists / ...
  ├── config-handlers.ts     # config:get / config:set
  ├── plugin-handlers.ts     # plugins:listDirs / install / uninstall / reinstall
  ├── command-handlers.ts    # commands:execute
  └── window-handlers.ts     # window:createPluginView / closePluginView / focusPluginView
```

**Handler 模板（核心无知原则——不读 payload）：**

```typescript
// electron/ipc/serial-handlers.ts
import { ipcMain } from 'electron';
import { serialService } from '../services/serial-service';

export function registerSerialHandlers(): void {
  ipcMain.handle('serial:getPorts', async () => {
    return serialService.getPorts();
  });

  ipcMain.handle('serial:openPort', async (_event, config) => {
    // ⚠️ handler 不知道也不关心是哪个插件调的
    // 只做"执行串口打开"——不做"判断这个插件能不能打开串口"
    return serialService.openPort(config);
  });

  // ... 其余 handler 同理
}
```

**权限控制层面：** 权限不在 handler 里做——在 preload 的 API 暴露层面做了。插件 preload 能暴露 `serial.openPort` → 插件就能调。壳 preload 额外暴露 `plugins.uninstall` → 壳能调、插件不能调。这是"声明式权限"——对标 Tauri Capability。

---

## 五、`linkdesk://` 自定义协议

### 5.1 对标

| | VS Code | LinkDesk |
|------|------|------|
| 协议 | `vscode-file://` | `linkdesk://` |
| 用途 | 加载扩展的 HTML/JS/CSS 资源 | 加载插件的 JS/CSS/HTML bundle |
| URI 格式 | `vscode-file:///absolute/path/to/file` | `linkdesk://pluginId/path/within/plugin` |
| 实现 | `protocol.registerFileProtocol` | `protocol.handle`（Electron 30+ 推荐） |

### 5.2 实现

```typescript
// electron/protocol.ts —— ~30 行
import { protocol, net } from 'electron';
import { join, normalize } from 'path';
import { existsSync } from 'fs';

// dev 模式：项目根目录/plugins，打包后：app.asar.unpacked/plugins
const PLUGINS_DIR = join(__dirname, '..', '..', 'plugins');

protocol.handle('linkdesk', (request) => {
  // URI: linkdesk://terminal/dist/bundle.js
  const pluginPath = request.url.replace('linkdesk://', '');
  const normalized = normalize(pluginPath);

  // 安全检查：防止路径穿越（../../etc/passwd）
  if (normalized.includes('..')) {
    return new Response('Forbidden', { status: 403 });
  }

  const fullPath = join(PLUGINS_DIR, normalized);
  if (!existsSync(fullPath)) {
    return new Response('Not Found', { status: 404 });
  }

  return net.fetch(`file://${fullPath}`);
});
```

### 5.3 为什么不用 `loadFile()` 或 `file://`

| 方案 | 问题 |
|------|------|
| `webContents.loadFile(path)` | 路径直接绑死文件系统。未来插件从网络/数据库/加密包加载 → 改代码 |
| `file://` | Electron 默认允许 file://——安全风险。多来源（本地/网络/数据库）无法统一管理 |
| `linkdesk://` | **归一化入口。** 今天映射到文件系统，明天映射到任何来源——只改协议处理器，不改插件代码、不改 WebView 创建逻辑 |

### 5.4 MIME 类型自动检测

```typescript
function mimeForPath(path: string): string {
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}
```

**这是从 Rust `plugin_protocol.rs` 的 `mime_for_path()` 函数直接翻译过来的——逻辑完全一致。**

---

## 六、类型定义

`window.linkdesk` 需要完整的 TypeScript 类型声明文件——供 AI 和插件开发者参考：

```typescript
// types/linkdesk.d.ts —— 全局类型声明
declare global {
  interface Window {
    linkdesk: LinkDeskAPI;
  }
}

interface LinkDeskAPI {
  serial: {
    getPorts(): Promise<PortInfo[]>;
    getStatus(): Promise<SerialStatus>;
    openPort(cfg: OpenPortConfig): Promise<void>;
    closePort(): Promise<void>;
    sendData(data: Uint8Array): Promise<number>;
    sendText(text: string, encoding: string): Promise<number>;
    setDtr(enable: boolean): Promise<void>;
    setRts(enable: boolean): Promise<void>;
    onData(cb: (text: string) => void): void;
    onStats(cb: (stats: { tx?: number; rx?: number }) => void): void;
    onSystem(cb: (msg: string) => void): void;
  };
  filesystem: { /* ... */ };
  config: { /* ... */ };
  commands: { /* ... */ };
  // ... 完整定义在源码 electron/preload-*.ts 中
}
```

---

## 七、迁移影响

| 当前 Tauri API | 迁移后 `window.linkdesk` | 变化 |
|------|------|:--:|
| `invoke("list_ports")` | `window.linkdesk.serial.getPorts()` | 名变，参不变 |
| `invoke("open_port", {...})` | `window.linkdesk.serial.openPort({...})` | 名变，参不变 |
| `invoke("close_port")` | `window.linkdesk.serial.closePort()` | 名变 |
| `invoke("send_data", {...})` | `window.linkdesk.serial.sendData(...)` | 名变，参不变 |
| `invoke("send_text", {...})` | `window.linkdesk.serial.sendText(...)` | 名变，参不变 |
| `listen("serial-data", cb)` | `window.linkdesk.serial.onData(cb)` | 事件监听 → 回调注册 |
| `listen("serial-stats", cb)` | `window.linkdesk.serial.onStats(cb)` | 同上 |
| `listen("serial-system", cb)` | `window.linkdesk.serial.onSystem(cb)` | 同上 |
| `invoke("list_plugin_dirs")` | `window.linkdesk.plugins.listDirs()` | 名变 |
| `invoke("install_plugin", {...})` | `window.linkdesk.plugins.install(...)` | 名变 |
| `invoke("uninstall_plugin", {...})` | `window.linkdesk.plugins.uninstall(...)` | 名变 |
| `invoke("reinstall_plugin", {...})` | `window.linkdesk.plugins.reinstall(...)` | 名变 |

**全部是 1:1 映射——机械替换，逻辑不变。**

---

> **上一份：** `04-迁移方案.md`
> **下一份：** `06-实施顺序.md`——阶段划分、分支策略、与 E1-E3 的关系
