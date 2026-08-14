# 01 — 插件 API 契约

> 2026-08-04。**`window.linkdesk.*` 完整 API 定义。** 插件开发者能调用的全部系统级能力。Web 平台能力（Canvas/WebGL/WebRTC/fetch 等）不限——只有系统级能力走此 API。
>
> **E5#85 更新：** 单 WebView 回退后，`linkdesk.*` API 是插件访问壳的唯一正路。ESLint `error` 级拦截直接 import `ConfigurationService/FileService/pathUtils`。
>
> **对标 VS Code：** `vscode` 命名空间。

---

## 一、设计原则

| 原则 | 如何体现 |
|------|------|
| **核心无知** | 壳不认识任何插件的 pluginId |
| **合同优先** | 插件走 `window.linkdesk.*`，不走 `import @src/core` |
| **同步优先** | 能同步的 API 不同步封装（`path` 纯函数不走 IPC） |
| **安全** | 插件 preload 比壳 preload 窄——插件不能调 `plugins.install` 或 `window.createPluginView` |

---

## 二、壳 vs 插件——API 差异

插件在壳的渲染进程中运行（单 WebView）。插件 preload 和壳 preload 共址，但能力集不同。

| 命名空间 | 功能 | 插件可调 | 说明 |
|------|------|:--:|------|
| `serial.*` | 串口读写 | ✅ | |
| `filesystem.*` | 文件系统 | ✅ | 受限——不能枚举其他插件目录 |
| `path.*` | 路径工具 | ✅ | **E5#85 新增**——纯函数，同步 |
| `configuration.*` | 配置读写 | ✅ | 旧名 `config` 仍可用 |
| `commands.*` | 命令执行 | ✅ | 注册命令走 plugin.json |
| `workspace.*` | 工作区查询 | ✅ | **E5#85 新增** |
| `tabs.*` | 标签页操作 | ✅ | **E5#68** |
| `menu.*` | 菜单注册 | ✅ | **E5#69** |
| `contextKey.*` | 上下文键值 | ✅ | **E5#70** |
| `pluginState.*` | 持久化存储 | ✅ | **E5#71** |
| `hotExit.*` | Hot Exit 备份 | ✅ | **E5.7#38**——崩溃恢复脏内容落盘 |
| `dialog.*` | 弹窗 | ✅ | **E5#67**——confirm/alert |
| `events.*` | 发布/订阅 | ✅ | |
| `p2p.*` | 插件间推流 | ✅ | **E5#65** |
| `theme.*` | 主题查询 | ✅ | |
| `language.*` | 语言查询 | ✅ | |
| `notifications.*` | Toast 通知 | ✅ | |
| `clipboard.*` | 剪贴板 | ✅ | |
| `env.*` | 环境信息 | ✅ | |
| `pluginManager.*` | 插件管理 | ✅ | 市场/安装/卸载 |
| `pluginRequest.*` | 壳→插件请求 | ✅ | **E5#62**——handle/unhandle |
| `window.*` | 窗口控制 | ❌ | 仅壳 |
| `plugins.*` | 插件安装 | ❌ | 仅壳 |
| `shell.*` | OS Shell | ❌ | 仅壳 |

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
  name: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
}
```

```typescript
window.linkdesk.serial.getPorts(): Promise<PortInfo[]>
window.linkdesk.serial.getStatus(): Promise<{ isOpen: boolean; portName?: string; baudRate?: number }>
window.linkdesk.serial.openPort(config: OpenPortConfig): Promise<void>
window.linkdesk.serial.closePort(): Promise<void>
window.linkdesk.serial.sendData(data: number[]): Promise<void>
window.linkdesk.serial.sendText(text: string, enc: string): Promise<void>
window.linkdesk.serial.setDtr(enable: boolean): Promise<void>
window.linkdesk.serial.setRts(enable: boolean): Promise<void>
window.linkdesk.serial.onData(cb: (d: any) => void): () => void
window.linkdesk.serial.onStats(cb: (d: any) => void): () => void
window.linkdesk.serial.onSystem(cb: (d: any) => void): () => void
```

### 3.2 `filesystem`——文件系统

```typescript
// 基础读写（一直存在）
window.linkdesk.filesystem.readTextFile(path: string): Promise<string>
window.linkdesk.filesystem.writeTextFile(path: string, data: string): Promise<void>
window.linkdesk.filesystem.readBinaryFile(path: string): Promise<Uint8Array>
window.linkdesk.filesystem.writeBinaryFile(path: string, data: Uint8Array): Promise<void>

// E5#85 扩展——从壳 preload 补齐到插件
window.linkdesk.filesystem.listDir(path: string): Promise<FileEntry[]>
window.linkdesk.filesystem.exists(path: string): Promise<boolean>
window.linkdesk.filesystem.mkdir(path: string): Promise<void>
window.linkdesk.filesystem.copy(src: string, dest: string): Promise<void>
window.linkdesk.filesystem.remove(path: string): Promise<void>
window.linkdesk.filesystem.watch(dirPath: string, onEvent: (e: { path: string; type: string }) => void): Promise<() => void>
  // 返回 unsubscribe 函数。type = "created" | "changed" | "deleted"
```

**插件文件系统权限：** 和之前一样——插件数据目录读写、workspace 目录读、其他插件目录禁止。

### 3.3 `path`——路径工具 🆕

> **E5#85 新增。** 纯函数，不经过 IPC，同步调用。替代 `import { normalizePath } from "@src/core/pathUtils"`。

```typescript
window.linkdesk.path.normalize(p: string): string
  // 反斜杠→正斜杠。 "C:\\foo\\bar" → "C:/foo/bar"

window.linkdesk.path.join(...parts: string[]): string
  // 拼接路径，自动去重斜杠

window.linkdesk.path.basename(p: string): string
  // 取文件名。 "/a/b/c.ts" → "c.ts"

window.linkdesk.path.dirname(p: string): string
  // 取目录名。 "/a/b/c.ts" → "/a/b"

window.linkdesk.path.extname(p: string): string
  // 取扩展名。 "/a/b/c.ts" → ".ts"，无扩展名返回 ""
```

### 3.4 `configuration`——配置

```typescript
// 新名 configuration（对标 VS Code），旧名 config 向后兼容
window.linkdesk.configuration.get(key: string): Promise<unknown>
window.linkdesk.configuration.set(key: string, value: unknown): Promise<void>
window.linkdesk.configuration.getSchema(key?: string): Promise<any>

// onChange——订阅配置变更。key="" 匹配所有变更
window.linkdesk.configuration.onChange(key: string, cb: (value: unknown) => void): () => void
  // key="" → 所有配置变更都触发 cb
```

**配置 key 命名规则：** `<pluginId>.<property>`，如 `editor.fontSize`、`serial-monitor.baudRate`。

### 3.5 `commands`——命令

```typescript
window.linkdesk.commands.execute(id: string, ...args: any[]): Promise<unknown>
window.linkdesk.commands.executeCommand(id: string, ...args: any[]): Promise<unknown>  // 别名
window.linkdesk.commands.getCommands(): Promise<{ id: string; title: string }[]>
```

**注册命令**走 `plugin.json` 的 `contributes.commands`——handler 函数不可 IPC 序列化。

### 3.6 `workspace`——工作区 🆕

> **E5#85 新增。** 替代 `import { getWorkspaceFolders } from "@src/core/WorkspaceService"`。

```typescript
window.linkdesk.workspace.getFolders(): Promise<{ uri: string; name: string }[]>
window.linkdesk.workspace.getActive(): Promise<string | undefined>
```

### 3.7 `tabs`——标签页 🆕 E5#68

```typescript
window.linkdesk.tabs.create(type: string, opts?: Record<string, unknown>): Promise<string>
window.linkdesk.tabs.openOrFocus(type: string, opts?: Record<string, unknown>): Promise<string>
window.linkdesk.tabs.focus(tabId: string): Promise<void>
window.linkdesk.tabs.close(tabId: string): Promise<void>
window.linkdesk.tabs.focusBySourceId(sourceId: string): Promise<void>
window.linkdesk.tabs.updateLabelBySourceId(sourceId: string, label: string): Promise<void>
window.linkdesk.tabs.closeBySourceId(sourceId: string): Promise<void>
```

### 3.8 `menu`——菜单 🆕 E5#69

```typescript
window.linkdesk.menu.registerItems(menuId: string, pluginId: string, items: MenuItem[]): Promise<void>
window.linkdesk.menu.getItems(menuId: string): Promise<MenuItem[]>
```

### 3.9 `contextKey`——上下文键值 🆕 E5#70

```typescript
window.linkdesk.contextKey.set(key: string, value: unknown): Promise<void>
  // 设置上下文键——壳的 when 子句可消费。当前只支持 SET，不支持 GET
```

### 3.10 `pluginState`——持久化存储 🆕 E5#71

```typescript
window.linkdesk.pluginState.get(pluginId: string, key: string): Promise<unknown>
window.linkdesk.pluginState.set(pluginId: string, key: string, value: unknown): Promise<void>

// E5#84f——订阅其他 WebView 的变更（未来多 WebView 恢复后可用）
window.linkdesk.pluginState.onChange(pluginId: string, key: string, cb: (value: unknown) => void): () => void
```

### 3.11 `dialog`——弹窗 🆕 E5#67

```typescript
window.linkdesk.dialog.confirm(message: string): Promise<boolean>
window.linkdesk.dialog.alert(message: string): Promise<void>
```

### 3.12 `events`——发布与订阅

```typescript
window.linkdesk.events.on(channel: string, cb: (payload: unknown) => void): () => void
window.linkdesk.events.emit(channel: string, payload: unknown): void
```

**频道命名约定：** `<插件id>:<数据名>`——如 `serial:rawData`、`sbq-protocol:parsed`。

**壳广播事件（插件可订阅）：**

| 频道 | payload | 触发时机 |
|------|------|------|
| `theme:changed` | `{ themeId, themeType, variables }` | 用户切换主题（CSS 变量自动注入，无需手动订阅） |
| `lang:changed` | `{ lang, resources }` | 用户切换语言 |
| `workspace:changed` | `{ rootPath }` | 用户打开/切换文件夹 |

### 3.13 `p2p`——插件间推流 🆕 E5#65

```typescript
window.linkdesk.p2p.send(target: string, channel: string, data: unknown): void
window.linkdesk.p2p.on(channel: string, cb: (data: unknown) => void): () => void
```

### 3.14 `theme`——主题

```typescript
window.linkdesk.theme.getCurrent(): Promise<{ id: string; type: string }>
window.linkdesk.theme.getAvailable(): Promise<{ id: string; name: string }[]>
window.linkdesk.theme.apply(themeId: string): Promise<void>
```

### 3.15 `language`——语言

```typescript
window.linkdesk.language.getCurrent(): Promise<string>
window.linkdesk.language.getAvailable(): Promise<string[]>
window.linkdesk.language.set(langId: string): Promise<void>
window.linkdesk.language.getInitial(): { lang: string; resources: Record<string, unknown> } | null
window.linkdesk.language.onChange(cb: (data: { lang: string; resources: Record<string, unknown> }) => void): () => void
```

### 3.16 `notifications`——通知

```typescript
window.linkdesk.notifications.show(message: string, options?: {
  type?: "info" | "warning" | "error";
  progress?: boolean;
}): { update(msg: string): void; finish(msg?: string): void; cancel(): void } | undefined
```

### 3.17 `clipboard`——剪贴板

```typescript
window.linkdesk.clipboard.readText(): Promise<string>
window.linkdesk.clipboard.writeText(text: string): Promise<void>
```

### 3.18 `env`——环境信息

```typescript
window.linkdesk.env.get(): Promise<{ appVersion: string; platform: string; locale: string; ... }>
```

### 3.19 `pluginManager`——插件管理

```typescript
window.linkdesk.pluginManager.list(): Promise<PluginInfo[]>
window.linkdesk.pluginManager.enable(id: string): Promise<void>
window.linkdesk.pluginManager.disable(id: string): Promise<void>
window.linkdesk.pluginManager.install(path: string): Promise<void>
window.linkdesk.pluginManager.uninstall(id: string): Promise<void>
window.linkdesk.pluginManager.reinstall(id: string): Promise<void>
window.linkdesk.pluginManager.getDisabled(): Promise<string[]>
window.linkdesk.pluginManager.getUninstalled(): Promise<string[]>
window.linkdesk.pluginManager.isDisabled(id: string): Promise<boolean>
```

### 3.20 `pluginRequest`——壳→插件请求 🆕 E5#62

```typescript
window.linkdesk.pluginRequest.handle(channel: string, handler: (payload: unknown) => unknown): void
window.linkdesk.pluginRequest.unhandle(channel: string): void
```

### 3.21 `hotExit`——Hot Exit 备份 🆕 E5.7#38

崩溃恢复专用——脏内容落盘 `%APPDATA%/linkdesk/hot-exit/`（主进程路径约定单源，插件零直写）。保存或关闭标签页后应调用 `clear` 删除备份。

```typescript
window.linkdesk.hotExit.save(filePath: string, content: string): Promise<void>
window.linkdesk.hotExit.load(filePath: string): Promise<string | null>  // null = 无备份
window.linkdesk.hotExit.clear(filePath: string): Promise<void>
```

---

## 四、IPC 可靠性约定

1. **每个 invoke 有 10s 超时。** 超时 throw `Error`
2. **返回值有 falsy 可能。** `""`/`0`/`false` 是合法值。用 `isNaN(n) ? default : n` 而非 `n || default`
3. **IPC 回调里用到 React state → 用 ref 桥接**
4. **`onChange` 回调模式**（configuration/language）——返回 unsubscribe 函数，组件 unmount 时调用清理

---

## 五、禁止事项

| ❌ | ✅ 替代 |
|---|---|
| `import { normalizePath } from "@src/core/pathUtils"` | `lk.path.normalize(p)` |
| `import { getConfigurationValue } from "@src/core/ConfigurationService"` | `lk.configuration.get(key)` |
| `import { listDir } from "@src/core/FileService"` | `lk.filesystem.listDir(p)` |
| `import { getWorkspaceFolders } from "@src/core/WorkspaceService"` | `lk.workspace.getFolders()` |

**ESLint `error`**：`import { getConfigurationValue } from "@src/core/ConfigurationService"` → 🚫 编译失败。
**允许的 import**：`Emitter`, `import type { FileEntry }`, React hooks（`useConfiguration`/`useSendData`），`ViewContainerService`（侧栏组件）。

---

> **下一份：** `02-插件生命周期.md`
> **索引：** `00-README.md`
