# linkdesk.* API 缺口补全——E5.5#16-#24

> 📖 **来源：** [[e5-120-audit-plugin-core-imports]]——37 处 ESLint `no-core-import-in-plugin` warn。
> **结论：** 9 处白名单（`import type` 5 + `__tests__/` 4），1 处可立即切，**27 处缺 API 留 E5.5**。
> **目标：** 按 8 个 API 命名空间补全 → 逐 import 迁移 → ESLint warn 清零（保留白名单 9 处）。

## 现状

ESLint `no-core-import-in-plugin` 拦截所有 `plugins/** → import from @src/core/**`。当前 37 处 warn。多 WebView 恢复后，插件在自己的 JS 堆中运行——直接 import 核心模块 = 读本地副本（静默失效，不报错）。

## API 缺口全景

| linkdesk.* | 已有 | 缺（插件正在 import 的） | 影响 import 数 |
|------|:--:|------|:--:|
| workspace | `getFolders`, `getActive` | `openFolder`, `addFolder`, `removeFolder`, `onDidChangeFolders`, `onDidChangeActiveWorkspace`, `setActiveWorkspace` | 7 |
| commands | `executeCommand`, `getCommands` | `registerCommand`（IPC 版） | 4 |
| fileAssociation | ❌ 完全不存在 | `getPluginFor` | 2 |
| viewContainer | ❌ 完全不存在 | `getViews`, `getViewContainer` | 3 |
| events | `onDidChange*` 特定方法 | `emit` / `on` / `off`（通用 IPC 事件通道） | 3 |
| fileDecoration | ❌ 完全不存在 | `registerProvider`, `getDecoration` | 1 |
| protocol | ❌ 完全不存在 | `registerParser`, `getParsers`, `getDefaultFor` | 1 |
| keybinding | ❌ 不存在于 window.linkdesk | `setKeybindingCaptureActive` | 1 |
| clipboard | `readText`, `writeText` | `registerProvider` / `unregisterProvider`（ClipboardProviderRegistry 模式） | 2 |
| langDef | ❌ 不存在 | `getLangDef` | 1 |
| encoding | ❌ 不存在 | `detectEncoding` | 1 |
| fileSearch | ❌ 不存在 | `searchFiles` | 1 |
| sidebar | ❌ 不存在 | `activateSidebarItem` | 1 |
| configuration | `get`, `onDidChange` | hook 模式适配（`useConfigurationValue`）——见下方 §配置 Hook 适配 | 2 |
| contextKey | `_getValue` | `setValue` / `getValue` | 1 |

### 配置 Hook 适配（useConfigurationValue 在多 WebView 中）

> 🔥 **关键——不能直接在 React useEffect 里注册 IPC 监听器（E5#11l Bug 4 教训）：** IPC 事件在 mount 前到达 → 丢失。不掉报错，只是 UI 不更新。

**三层方案：**

```
层 1 — preload-plugin.ts 模块顶层（常驻，永远不卸载）：
  ipcRenderer.on('config:changed', (e, {key, value}) => {
    _configCache.set(key, value)  // 同步更新缓存
  })
  // 和 theme/contextKey 相同模式——模块顶层 = 零竞态

层 2 — hook 内读缓存（同步，不依赖 IPC 时序）：
  function useConfigurationValue<T>(key: string): T | undefined {
    const [value, setValue] = useState<T | undefined>(_configCache.get(key))
    useEffect(() => {
      const handler = (e, {key: k, value: v}) => {
        if (k === key) setValue(v as T)
      }
      ipcRenderer.on('config:changed', handler)   // ← 仅用于触发 React 重渲染
      return () => ipcRenderer.removeListener('config:changed', handler)
    }, [key])
    return value
  }

层 3 — 首次 mount 拉取（填冷启动缓存）：
  // preload-plugin.ts 初始化阶段：
  ipcRenderer.invoke('config:getAll').then(all => {
    for (const [k, v] of Object.entries(all)) _configCache.set(k, v)
  })
```

**避免的模式：** `useEffect(() => { ipcRenderer.on('config:changed', cb) }, [])`——事件在 React mount 前到达 = 静默丢失。

## 执行策略

**每个 API 独立——做完一个 API → grep 审计表对应的 import → 逐文件切 → 逐个验证。不批量。**

验证方法：API 补完后在插件 WebView console 中手动调 → 确认返回值正确 → 再切 import。

## 详细设计

### 1. linkdesk.workspace（E5.5#16）— 补 6 个方法

**影响文件：** editor/ts-intelligence.ts (1), file-tree/FileTree.tsx (3), file-tree/FileTreeContextMenu.tsx (2), file-tree/FoldersView.tsx (1), file-tree/WelcomeView.tsx (1)

**IPC handler（electron/ipc/workspace-handlers.ts，新建）：**

```typescript
// workspace:openFolder — dialog.showOpenDialog 在主进程调
ipcMain.handle('workspace:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  const folderPath = result.filePaths[0];
  workspaceService.addFolder(folderPath);
  return folderPath;
});

// workspace:addFolder — 直接添加（不弹 dialog）
ipcMain.handle('workspace:addFolder', (_e, folderPath: string) => {
  workspaceService.addFolder(folderPath);
});

// workspace:removeFolder
ipcMain.handle('workspace:removeFolder', (_e, folderPath: string) => {
  workspaceService.removeFolder(folderPath);
});

// workspace:setActiveWorkspace
ipcMain.handle('workspace:setActive', (_e, folderPath: string) => {
  workspaceService.setActiveWorkspace(folderPath);
});

// workspace:onDidChangeFolders — 订阅模式
ipcMain.on('workspace:onDidChangeFolders', (event) => {
  const disposable = workspaceService.onDidChangeFolders((folders) => {
    event.sender.send('workspace:foldersChanged', folders);
  });
  // 注册清理——插件 WebView 销毁时自动 unregister
  registerPluginCleanup(event.sender, disposable);
});

// workspace:onDidChangeActiveWorkspace
ipcMain.on('workspace:onDidChangeActiveWorkspace', (event) => {
  const disposable = workspaceService.onDidChangeActiveWorkspace((folder) => {
    event.sender.send('workspace:activeWorkspaceChanged', folder);
  });
  registerPluginCleanup(event.sender, disposable);
});
```

**preload 暴露：**
```typescript
workspace: {
  getFolders: () => ipcRenderer.invoke('workspace:getFolders'),       // 已有
  getActive: () => ipcRenderer.invoke('workspace:getActive'),         // 已有
  openFolder: () => ipcRenderer.invoke('workspace:openFolder'),       // 新增
  addFolder: (path) => ipcRenderer.invoke('workspace:addFolder', path), // 新增
  removeFolder: (path) => ipcRenderer.invoke('workspace:removeFolder', path), // 新增
  setActive: (path) => ipcRenderer.invoke('workspace:setActive', path), // 新增
  onDidChangeFolders: (cb) => createEventSubscription('workspace:onDidChangeFolders', 'workspace:foldersChanged', cb), // 新增
  onDidChangeActive: (cb) => createEventSubscription('workspace:onDidChangeActiveWorkspace', 'workspace:activeWorkspaceChanged', cb), // 新增
}
```

### 2. linkdesk.commands.registerCommand（E5.5#17）

**影响文件：** file-tree/FileTreeContextMenu.tsx (1), marketplace/index.tsx (1), serial-monitor/index.tsx (2)

**设计：** 插件的 `registerCommand` 需在壳的 CommandRegistry 注册。但 handler 在插件侧（插件 WebView 执行命令逻辑）。

```typescript
// IPC: commands:registerCommand
ipcMain.handle('commands:registerCommand', (event, commandId: string, pluginId: string) => {
  // 注册一个代理——壳 executeCommand 时通过 requestToPlugin 回调插件
  commandRegistry.registerCommand(commandId, {
    handler: async (...args) => {
      // 通过 IpcBridge.requestToPlugin 回调插件执行真正的 handler
      return ipcBridge.requestToPlugin(pluginId, 'commands:executeHandler', { commandId, args });
    }
  });
});

// 插件侧 handler 注册
// preload-plugin.ts:
registerCommand: (id, handler) => {
  // 先在壳注册代理
  ipcRenderer.invoke('commands:registerCommand', id, pluginId);
  // 本地存 handler——壳回调时执行
  _commandHandlers.set(id, handler);
}

// 壳回调执行
ipcMain.on('commands:executeHandler', async (event, { commandId, args }) => {
  const handler = _commandHandlers.get(commandId);
  if (!handler) throw new Error(`Command ${commandId} not registered`);
  return handler(...args);
});
```

**备注：** 快捷方式——如果 handler 是无参/简单同步（大部分注册命令都是 `executeCommand` 调用另一个已有命令），可简化为只在壳注册。

### 3. linkdesk.fileAssociation（E5.5#18）— 新建

**影响文件：** file-tree/FoldersView.tsx (1), file-tree/SearchView.tsx (1)

```typescript
// IPC
ipcMain.handle('fileAssociation:getPluginFor', (_e, ext: string) => {
  return fileAssociationService.getPluginFor(ext);
});

// preload
fileAssociation: {
  getPluginFor: (ext) => ipcRenderer.invoke('fileAssociation:getPluginFor', ext),
}
```

### 4. linkdesk.viewContainer（E5.5#19）— 新建

**影响文件：** file-tree/FoldersView.tsx (1), marketplace/marketplaceShared.ts (1), serial-monitor/SerialSettingsView.tsx (1)

```typescript
// IPC
ipcMain.handle('viewContainer:getViews', (_e, containerId?: string) => {
  if (containerId) return viewContainerService.getViews(containerId);
  return viewContainerService.getAllViews();
});
ipcMain.handle('viewContainer:getViewContainer', (_e, id: string) => {
  return viewContainerService.getViewContainer(id);
});

// preload
viewContainer: {
  getViews: (containerId?) => ipcRenderer.invoke('viewContainer:getViews', containerId),
  getViewContainer: (id) => ipcRenderer.invoke('viewContainer:getViewContainer', id),
}
```

### 5. linkdesk.events（E5.5#20）— 通用 IPC 事件通道

**影响文件：** editor/EditorView.tsx (1), file-tree/FileTree.tsx (1), file-tree/FileTreeContextMenu.tsx (1)

**设计：** 插件 emit 事件 → 壳 ShellEventBus + 广播到其他插件。插件订阅 → 壳注册 listener → 回调。

```typescript
// preload-plugin.ts 扩展已有 events API
events: {
  // 已有
  onDidChangeTheme: (cb) => createEventSubscription(...),
  // 新增——通用通道
  emit: (channel, data) => ipcRenderer.send('events:emit', channel, data),
  on: (channel, cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on(`events:${channel}`, handler);
    return { dispose: () => ipcRenderer.removeListener(`events:${channel}`, handler) };
  },
}

// IPC
ipcMain.on('events:emit', (event, channel, data) => {
  // 壳内 ShellEventBus
  shellEventBus.emit(channel, data);
  // 广播到所有其他插件 WebView
  ipcBridge.broadcast('events:' + channel, data, { exclude: event.sender });
});
```

### 6. linkdesk.fileDecoration（E5.5#21）— 新建

**影响文件：** file-tree/FileTreeDecoration.ts (1)

```typescript
ipcMain.handle('fileDecoration:getDecorations', (_e, filePath: string) => {
  return fileDecorationRegistry.getDecorations(filePath);
});
ipcMain.handle('fileDecoration:registerProvider', (_e, pluginId: string) => {
  // Provider 逻辑在插件侧——IPC 回调模式
  // 简化：只提供查询，注册走 plugin.json contributes
});
```

### 7. linkdesk.protocol（E5.5#22）— 新建

**影响文件：** serial-monitor/ControlPanel.tsx (1)

```typescript
ipcMain.handle('protocol:getParsers', () => protocolRegistry.getAll());
ipcMain.handle('protocol:getDefaultFor', (_e, data: string) => protocolRegistry.getDefaultFor(data));
```

### 8. 其余零散 API（E5.5#23）

| API | IPC handler | 行数 | 影响 |
|:--|:--|:--|:--|
| `keybinding.setCaptureActive` | `ipcMain.handle('keybinding:setCaptureActive', ...)` | ~8 | file-tree/FileTree.tsx |
| `clipboard.registerProvider` | `ipcMain.handle('clipboard:registerProvider', ...)` + 回调模式 | ~12 | file-tree/FileTreeContextMenu + serial-monitor/SessionListView |
| `langDef.getLangDef` | `ipcMain.handle('langDef:getLangDef', ...)` | ~8 | editor/EditorView.tsx |
| `encoding.detect` | `ipcMain.handle('encoding:detect', ...)` | ~10 | editor/ts-intelligence.ts |
| `fileSearch.searchFiles` | `ipcMain.handle('fileSearch:search', ...)` | ~12 | file-tree/SearchView.tsx |
| `sidebar.activateItem` | `ipcMain.handle('sidebar:activateItem', ...)` | ~8 | serial-monitor/SessionListView.tsx |
| `configuration` hook | 封装 `useConfigurationValue` → `get()` + `onDidChange()` | ~10 | serial-monitor/statusBar.tsx + file-tree/FoldersView.tsx |
| `contextKey.setValue/getValue` | `ipcMain.handle('contextKey:set', ...)` / `ipcMain.handle('contextKey:get', ...)` | ~8 | serial-monitor/SessionListView.tsx |

## ESLint 白名单（E5.5#24a-b）

**`import type`（纯类型，编译擦除，零运行时）：**

```javascript
// eslint-local-rules.js no-core-import-in-plugin 规则
const TYPE_ONLY_IMPORTS = [
  'FileEntry',        // file-tree/FileExcludeFilter, FileTreeModel
  'FileDecoration',   // file-tree/FileTreeModel
  'WorkspaceFolder',  // file-tree/FoldersView
  'ViewPluginEntry',  // marketplace/marketplaceShared
];
```

**`__tests__/`（vitest 跑在 node，不经过 WebView）：**

```javascript
if (filename.includes('__tests__/')) return; // 不检查
```

## 迁移执行顺序

```
E5.5#16  workspace     → 7 处 → 文件树 + 编辑器
E5.5#17  commands       → 4 处 → 所有插件（最高频）
E5.5#18  fileAssociation → 2 处 → 文件树
E5.5#19  viewContainer  → 3 处 → 文件树 + 市场 + 串口
E5.5#20  events         → 3 处 → 编辑器 + 文件树
E5.5#21  fileDecoration → 1 处 → 文件树
E5.5#22  protocol       → 1 处 → 串口
E5.5#23  其余零散       → 8 处 → 逐个
E5.5#24  ESLint + 收尾  → 验证全量
```

**每个 API 做完 → `grep` 此文档对应的 import → 逐文件切 → 插件 WebView console 验证 → 勾掉。**

## 相关

- [[e5-120-audit-plugin-core-imports]] — 37 处审计原表
- [[plugin-communication-standard]] — 插件通信唯一铁律
- [IpcBridge.ts](linkdesk/electron/ipc-bridge.ts) — 三通信机制
- [preload-plugin.ts](linkdesk/electron/preload-plugin.ts) — 26 命名空间 API
