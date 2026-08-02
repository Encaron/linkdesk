# IPC Channel 命名归一化 + preload API 统一

> 2026-08-02。**E5 新增任务。** 审计发现 29 项 API 不一致——致命到命名碎片。
> 执行清单任务：E5#29（clipboard handler 补全）、E5#31（IPC channel 命名归一化）

---

## 一、前因——审计发现的全部问题

### 1.1 致命——clipboard handler 不存在

**`preload-plugin.ts` 暴露了 `clipboard.readText()` / `clipboard.writeText()`，但 `electron/` 中没有对应的 `ipcMain.handle('clipboard:readText', ...)` 和 `clipboard:writeText`。**

任何插件调 `linkdesk.clipboard.readText()` → unhandled promise rejection → 静默炸。

### 1.2 IPC channel 命名碎片

| 问题 | channel | 应改为 |
|------|---------|--------|
| **无命名空间** | `theme-changed` | `theme:changed` |
| **无命名空间** | `preload-ready` | `app:preloadReady` |
| **无命名空间** | `heartbeat` | `app:heartbeat` |
| **kebab-case** | `theme-changed` | 统一 camelCase |
| **shell/plugin 不同名** | `serial.listPorts`(shell) vs `serial.getPorts`(plugin) | 统一 `serial:listPorts`，两边暴露同名 `listPorts()` |
| **bridge 频道 kebab** | `bridge:push-to-plugin` | `bridge:pushToPlugin` |

### 1.3 `LinkDeskAPI` 类型缺口

| 缺失 | 影响 |
|------|------|
| `language.getInitial()` | 无自动补全 |
| `language.onChange()` | 无自动补全 |
| `pluginViews.notifyReady` | 无类型检查 |
| `serial.*` | 插件必须 `(window as any)` |
| `filesystem.*` | 同上 |
| `clipboard.*` | 同上 |
| Shell `window.linkdesk` | 壳代码全是 `(window as any)` |

### 1.4 回调模式碎片化

| 模式 | 使用者 | 行数 |
|------|--------|:--:|
| `makeListener(channel)` 包装器 | serial.onData/onStats/onSystem | preload 内 |
| `createEventSystem()` | events.on/emit | event-system.ts |
| 自定义 per-channel | lsp.onData, pluginViews.onReady, window.onMaximizeChange, configuration.onChange, language.onChange | 各处 |

**三种回调注册方式——同一件事。**

---

## 二、设计方案

### 2.1 E5#29——补 clipboard IPC handler

**文件：** 新建 `electron/handlers/clipboard-handlers.ts`

```typescript
// electron/handlers/clipboard-handlers.ts
import { ipcMain, clipboard } from "electron";

export function registerClipboardHandlers(): void {
  ipcMain.handle('clipboard:readText', async () => {
    return clipboard.readText();
  });

  ipcMain.handle('clipboard:writeText', async (_e, text: string) => {
    clipboard.writeText(text);
  });
}
```

**文件：** `electron/main.ts`——在 `app.whenReady()` 中调用 `registerClipboardHandlers()`

**验证：** 插件调 `await linkdesk.clipboard.readText()` → 返回系统剪贴板文本。不抛异常。

### 2.2 E5#31——IPC channel 命名归一化

**规则：** `namespace:camelCase`

| 旧名 | 新名 | 影响文件 |
|------|------|------|
| `theme-changed` | `theme:changed` | main.ts, ipc-bridge.ts, preload-shell.ts, preload-plugin.ts |
| `preload-ready` | `app:preloadReady` | main.ts, preload-shell.ts, preload-plugin.ts |
| `heartbeat` | `app:heartbeat` | main.ts, preload-shell.ts |
| `bridge:push-to-plugin` | `bridge:pushToPlugin` | ipc-bridge.ts, preload-shell.ts |
| `plugin-view:setVisible` → 保留 | 已是 namespace:camelCase ✅ | — |

**同步改 preload 暴露的方法名：**

```typescript
// preload-plugin.ts——统一 serial 方法名
serial: {
  listPorts(): Promise<PortInfo[]>   // ← 改前是 getPorts
  // ...
}
```

**全项目 grep 替换——不靠人记。**

### 2.3 合并到 E5#1——回调模式归一化

**`createEventSystem()` 已是 E3j #77a 归一化产物。** 把 `makeListener` 和自定义 per-channel 回调都迁移到 `createEventSystem` 模式。

```typescript
// 归一化后——所有事件订阅走同一模式
const unsub1 = shellEvents.lsp.onData(callback);     // ← createEventSystem 模式
const unsub2 = shellEvents.serial.onData(callback);  // ← createEventSystem 模式
// 不再有 makeListener vs event-system vs custom 三分天下
```

**合并到 E5#1-2 ShellEvents 类型系统中——不单独开任务。**

### 2.4 合并到 E5#20——类型缺口补全

`LinkDeskAPI` 类型补全和 FileService API 重命名在同一个文件（`src/core/types.ts` / `linkdesk-api.ts`）。

```typescript
// linkdesk-api.ts——补全缺失类型
export interface LinkDeskAPI {
  // ... 现有 ...

  /** 🆕 串口 API */
  serial: {
    listPorts(): Promise<PortInfo[]>;
    getStatus(): Promise<SerialStatus>;
    openPort(cfg: SerialConfig): Promise<void>;
    closePort(): Promise<void>;
    sendData(data: number[]): Promise<void>;
    sendText(text: string, encoding?: string): Promise<void>;
    setDtr(enable: boolean): Promise<void>;
    setRts(enable: boolean): Promise<void>;
    onData(cb: (data: string) => void): () => void;
    onStats(cb: (stats: SerialStats) => void): () => void;
  };

  /** 🆕 文件系统 API */
  filesystem: {
    readTextFile(path: string): Promise<string>;
    writeTextFile(path: string, data: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    createDir(path: string): Promise<void>;
    listDir(path: string): Promise<FileEntry[]>;
    copy(src: string, dest: string): Promise<void>;
    remove(path: string): Promise<void>;
    readBinaryFile(path: string): Promise<Uint8Array>;
    watch(path: string, onEvent: (e: FileChangeEvent) => void): Promise<() => void>;
  };

  /** 🆕 剪贴板 API */
  clipboard: {
    readText(): Promise<string>;
    writeText(text: string): Promise<void>;
  };

  /** 🆕 补——language 缺失方法 */
  language: {
    // ... 现有 ...
    getInitial(): { lang: string; resources: Record<string, unknown> } | null;
    onChange(cb: (lang: string) => void): () => void;
  };

  /** 🆕 补 */
  pluginViews: {
    notifyReady(pluginId: string): void;
  };
}
```

---

## 三、实现步骤

### E5#29 补 clipboard IPC handler

- [ ] **E5#29a** 新建 `electron/handlers/clipboard-handlers.ts`——`registerClipboardHandlers()` | ~15 行
- [ ] **E5#29b** `electron/main.ts` 中 `app.whenReady()` 调 `registerClipboardHandlers()` | ~2 行
- [ ] **E5#29c** 验证——插件调 `await linkdesk.clipboard.readText()` → 返回剪贴板文本

### E5#31 IPC channel 命名归一化

- [ ] **E5#31a** 改 `theme-changed` → `theme:changed`——grep 全项目替换 | ~5 处
- [ ] **E5#31b** 改 `preload-ready` → `app:preloadReady` | ~3 处
- [ ] **E5#31c** 改 `heartbeat` → `app:heartbeat` | ~3 处
- [ ] **E5#31d** `serial.getPorts` → `serial.listPorts`（preload-plugin.ts）| ~3 处
- [ ] **E5#31e** 验证——`grep "theme-changed\|preload-ready\|heartbeat\|getPorts" electron/` 仅注释

### E5#20 补——类型补全（融入现有任务）

- [ ] **E5#20f** `LinkDeskAPI` 补 `serial/clipboard/env/pluginManager` 类型 | ~50 行
- [ ] **E5#20g** `LinkDeskAPI.language` 补 `getInitial()`/`onChange()` | ~5 行
- [ ] **E5#20h** `LinkDeskAPI` 补 `pluginViews.notifyReady` | ~3 行

---

## 四、完工标准

- [ ] `clipboard:readText` / `clipboard:writeText` handler 存在——grep 可验证
- [ ] 所有 IPC channel 统一 `namespace:camelCase`——grep `theme-changed\|preload-ready\|heartbeat` 零结果
- [ ] `serial.listPorts` 在 shell 和 plugin 两边同名
- [ ] `LinkDeskAPI` 类型包含 `serial/filesystem/clipboard/env`
- [ ] 插件代码不再需要 `(window as any).linkdesk.serial`
- [ ] `npm run check` 零错误

---

> **← E5 索引：** `../00-README.md`
> **← 执行清单：** `../05-执行清单.md` E5#29、E5#31
> **← 关联：** 融入 E5#1（回调归一化）、融入 E5#20（类型补全）
