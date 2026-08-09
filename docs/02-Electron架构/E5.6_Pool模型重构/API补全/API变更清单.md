# E5.6 API 变更清单

> 📖 对应执行清单：[E5.6#43-#52](../E5.6-执行清单.md)
> 📖 核心设计：[01-Pool模型设计.md](01-Pool模型设计.md)

---

## 1. 新增：pool.* API 命名空间

### 壳侧（preload-shell.ts）

```typescript
window.linkdesk.pool = {
  /** 推送布局到指定 Pool */
  pushLayout(zone: 'sidebar' | 'main', layout: PoolLayout): void;
  
  /** Pool 就绪回调——返回 unsubscribe */
  onReady(zone: string, cb: () => void): () => void;
  
  /** Pool 崩溃回调 */
  onCrashed(zone: string, cb: () => void): () => void;
  
  /** 获取 Pool 内存信息 */
  getMemoryInfo(zone: string): Promise<Electron.ProcessMemoryInfo>;
  
  /** 列出所有 Pool */
  listZones(): string[];
}
```

### 池侧（preload-plugin.ts）

```typescript
window.linkdesk.pool = {
  /** 接收壳推送的布局——返回 unsubscribe */
  onLayout(cb: (layout: PoolLayout) => void): () => void;
  
  /** 通知壳——池已就绪 */
  ready(): void;
  
  /** 当前 Pool 的 zone 标识 */
  getZone(): string;
}
```

---

## 2. 删除：pluginViews API（壳侧 preload-shell.ts）

E5.5#9 引入、Phase 8 删除：

```typescript
// ❌ 删除以下全部
window.linkdesk.pluginViews = {
  create(pluginId: string): Promise<string>,
  setVisible(instanceId: string, visible: boolean): void,
  setBounds(instanceId: string, bounds: Bounds): void,
  getAllIds(): string[],
  scheduleDestroy(instanceId: string): void,
  cancelDestroy(instanceId: string): boolean,
  focus(instanceId: string): void,
  reload(instanceId: string): void,
  toggleDevTools(instanceId: string): void,
  onReady(cb: (instanceId: string) => void): () => void,
}
```

---

## 3. 删除：pluginInstance API（池侧 preload-plugin.ts）

```typescript
// ❌ 删除
window.linkdesk.pluginInstance = {
  id: string,       // instanceId——消失
  pluginId: string,
}

// ❌ 删除
window.linkdesk.pluginInstance.notifyReady(): void
```

---

## 4. 不变：所有现有 linkdesk.* API

以下命名空间**零改动**：

| 命名空间 | 说明 |
|:--|:--|
| `linkdesk.tabs.*` | 标签页操作 |
| `linkdesk.filesystem.*` | 文件系统 |
| `linkdesk.configuration.*` | 配置读写 |
| `linkdesk.events.*` | 事件发布订阅 |
| `linkdesk.menu.*` | 右键菜单 |
| `linkdesk.dialog.*` | 弹窗 |
| `linkdesk.commands.*` | 命令 |
| `linkdesk.keybinding.*` | 快捷键 |
| `linkdesk.clipboard.*` | 剪贴板 |
| `linkdesk.i18n.*` | 国际化 |
| `linkdesk.pluginState.*` | 插件状态 |
| `linkdesk.pluginManagement.*` | 插件管理 |

**插件作者不需要改一行代码。**

---

## 5. 补全：10 个命名空间（详见 Phase 10）

| 任务 | 命名空间 | 新增方法 |
|:--|:--|:--|
| E5.6#44 | `linkdesk.workspace` | `openFolder`, `addFolder`, `removeFolder`, `onDidChangeFolders`, `onDidChangeActiveWorkspace`, `setActiveWorkspace` |
| E5.6#45 | `linkdesk.commands` | `registerCommand` (IPC版) |
| E5.6#46 | `linkdesk.fileAssociation` | `getPluginFor(ext)` |
| E5.6#47 | `linkdesk.viewContainer` | `getViews`, `getViewContainer` |
| E5.6#48 | `linkdesk.events` | `emit`, `on`, `off` (IPC暴露) |
| E5.6#49 | `linkdesk.fileDecoration` | `registerProvider`, `getDecorations` |
| E5.6#50 | `linkdesk.protocol` | `registerParser`, `getParsers`, `getDefaultFor` |
| E5.6#51 | 6个零散 | `keybinding`, `clipboard`, `langDef`, `encoding`, `fileSearch`, `sidebar`, `data`, `contextKey` |
| E5.6#52 | `linkdesk.quickPick` | `show(opts)` → `Promise<selected>` |
