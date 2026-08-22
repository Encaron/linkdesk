# 跨Pool通信方案

> 📖 对应执行清单：[E5.6#18-#20](../E5.6-执行清单.md)
> 📖 核心设计：[01-Pool模型设计.md](../01-Pool模型设计.md)

---

## 1. 通信拓扑

```
                    ┌─────────────┐
                    │  主进程      │
                    │  IPC Bridge  │
                    └──┬──┬──┬──┬─┘
                       │  │  │  │
          ┌────────────┘  │  │  └────────────┐
          │               │  │               │
    ┌─────┴──────┐  ┌────┴──┴───┐  ┌────────┴───────┐
    │ Shell      │  │ Sidebar   │  │ MainPool       │
    │ WebView    │  │ Pool      │  │                │
    │            │  │           │  │                │
    │ IconBar    │  │ file-tree │  │ editor         │
    │ TabBar     │  │ search    │  │ serial-monitor │
    │ StatusBar  │  │           │  │                │
    └────────────┘  └───────────┘  └────────────────┘
```

**SidebarPool 和 MainPool 不直接通信。所有消息走主进程路由。**

---

## 2. 三条通信链

### 2.1 文件树双击 → 编辑器打开（SidebarPool → 主进程 → Shell → MainPool）

```
file-tree (SidebarPool)
  └→ window.linkdesk.tabs.openOrFocus("editor", "/path/to/file.c")
      └→ ipcRenderer.invoke('tabs:openOrFocus', { pluginId: "editor", sourceId: "/path/to/file.c" })
          └→ 主进程 ipcMain.handle('tabs:openOrFocus', ...)
              └→ shellWindow.webContents.send('tabs:openOrFocus', { ... })
                  └→ 壳 React → tabState 更新 → createTab("editor", sourceId)
                      └→ syncLayoutToPools() → pushLayout('main', { groups: [...] })
                          └→ MainPool ipcRenderer.on('pool:layout', ...)
                              └→ MainRenderer → <PluginComponent pluginId="editor" sourceId="/path/to/file.c" />
```

**关键：** `window.linkdesk.tabs.openOrFocus` 今天已经走 IPC。Pool 模型下零改动——SidebarPool 和 MainPool 各跑各的 `preload-plugin.ts`，IPC 通路完全一样。

### 2.2 主题切换 → 两个 Pool CSS 变量同步（Shell → 主进程 → Sidebar + Main）

```
Shell React → setTheme("dark")
  └→ 壳 DOM CSS 变量切换（壳自己的 DOM 正常）
  └→ window.linkdesk.events.emit('theme:changed', { theme: "dark" })
      └→ ipcRenderer.send('events:emit', 'theme:changed', { theme: "dark" })
          └→ 主进程 IpcBridge
              └→ 广播到所有注册的 WebView
                  ├→ SidebarPool ipcRenderer.on('plugin:push', ...) → events.on('theme:changed', cb)
                  └→ MainPool ipcRenderer.on('plugin:push', ...) → events.on('theme:changed', cb)
                      └→ 池内 webFrame.insertCSS / CSS 变量更新
```

### 2.3 配置变更 → 广播（任意Pool → 主进程 → Shell + 另一个Pool）

```
serial-monitor (MainPool) → 修改波特率
  └→ window.linkdesk.configuration.set('serial.baudRate', 115200)
      └→ ipcRenderer.invoke('configuration:set', ...)
          └→ 主进程 handler → 写配置 → 广播 'config:changed'
              ├→ Shell → 持久化
              ├→ SidebarPool → events.on('config:changed', ...)
              └→ MainPool → events.on('config:changed', ...)
```

---

## 3. 跨Pool交互一览

| 操作 | 发起方 | 接收方 | 通道 | Pool模型改动？ |
|:--|:--|:--|:--|:--|
| 文件树双击 | SidebarPool | Shell→MainPool | `tabs:openOrFocus` IPC | 零改动 |
| 文件树右键→打开方式 | SidebarPool | Shell | `tabs:openOrFocus` | 零改动 |
| 搜索→打开文件 | SidebarPool | Shell→MainPool | `tabs:openOrFocus` | 零改动 |
| 编辑器保存→文件树刷新 | MainPool | Shell→SidebarPool | `events:emit('file:saved')` | 零改动 |
| 主题切换 | Shell | Sidebar+Main | `events:emit('theme:changed')` | 零改动 |
| i18n切换 | Shell | Sidebar+Main | `events:emit('language:changed')` | 零改动 |
| 配置变更 | 任意Pool | Shell+另一Pool | `config:changed` | 零改动 |
| 串口状态变化 | MainPool | Shell(StatusBar) | `events:emit('statusBar:update')` | 零改动 |
| 命令面板 | 壳 | 当前活跃Pool | `commands:executeCommand` | 零改动 |
| 侧栏激活 | 图标栏(壳) | SidebarPool | `pool:layout` push | **新通道** |
| 跨Pool拖拽 | SidebarPool | MainPool | OverlayWindow辅助 | **E6** |

**核心发现：90% 的跨Pool通信今天已通过 `linkdesk.*` IPC 支持。Pool 模型只新增一条通道：壳→池的 `pool:layout` 推送。**

---

## 4. pool:layout 协议细节

### 4.1 SidebarPool 收到的 layout

```typescript
{
  sidebar: {
    visible: boolean;     // 侧栏是否展开
    width: number;        // 侧栏像素宽度
    viewId: string | null; // 当前打开的侧栏视图 pluginId
  }
}
```

SidebarPool 只需要这三个字段。不关心主区有什么。

### 4.2 MainPool 收到的 layout

```typescript
{
  groups: Array<{
    id: string;           // 分屏组ID
    flex: number;         // 分屏比例
    activeTabId: string;
    tabs: Array<{
      id: string;         // tabId
      pluginId: string;
      title: string;
      sourceId?: string;  // 载荷
      dirty?: boolean;
    }>;
  }>;
}
```

MainPool 不关心侧栏状态。

### 4.3 触发时机

| 壳操作 | pushLayout 到 |
|:--|:--|
| 新建标签页 | MainPool |
| 关闭标签页 | MainPool |
| 切换活跃标签页 | MainPool |
| 分屏/合屏 | MainPool |
| 分屏比例拖拽 | MainPool（如果壳维护 flex 值）|
| 侧栏展开/折叠 | SidebarPool + MainPool（MainPool bounds 变化）|
| 侧栏拖宽 | SidebarPool + MainPool（MainPool bounds 变化）|
| 图标栏点击 | SidebarPool |
| 侧栏视图切换 | SidebarPool |
| 插件安装/卸载 | SidebarPool + MainPool |

---

## 5. 缓冲回放模式（防竞态）

**E5#11l Bug 4 教训：** IPC 监听器必须在 preload 模块顶层注册。`pool:layout` 可能在 React useEffect 的 `onLayout` 注册之前到达。

```typescript
// preload-plugin.ts——模块顶层
let _onLayoutCallback: ((layout: PoolLayout) => void) | null = null;
let _layoutBuffer: PoolLayout[] = [];
let _onLayoutActive = false;

// 模块顶层常驻监听——防竞态
ipcRenderer.on('pool:layout', (_event, layout: PoolLayout) => {
  if (_onLayoutActive && _onLayoutCallback) {
    // 正常模式——直接推
    _onLayoutCallback(layout);
  } else {
    // 缓冲模式——pool-main.tsx 的 useEffect 还没注册
    _layoutBuffer.push(layout);
  }
});

// contextBridge 暴露
pool: {
  onLayout(cb: (layout: PoolLayout) => void): () => void {
    _onLayoutCallback = cb;
    _onLayoutActive = true;
    // 回放所有缓冲的 layout
    for (const l of _layoutBuffer) cb(l);
    _layoutBuffer = [];
    return () => { _onLayoutCallback = null; _onLayoutActive = false; };
  },
}
```

---

## 6. 图标栏↔侧栏 通信链（ShellEvents → PoolLayout 映射）

### 当前（单WebView）

```
IconBar → shellEvents.emit("icon:selected", pluginId)
  → App.tsx handler → setSidebarView(pluginId)
    → shellEvents.emit("sidebar:containerChanged", pluginId)  ← IconBar 读
    → shellEvents.emit("sidebar:toggled", true)               ← IconBar 读
    → <SidePanel> 渲染插件组件
```

### Pool模型

```
IconBar → shellEvents.emit("icon:selected", pluginId)
  → App.tsx handler → setSidebarView(pluginId)
    → shellEvents.emit("sidebar:containerChanged", pluginId)  ← IconBar 读（壳内，不改）
    → window.linkdesk.pool.pushLayout('sidebar', { sidebar: { visible: true, viewId: pluginId } })
        → IPC → SidebarPool → SidebarRenderer 渲染插件组件
```

**IconBar 不改一行。** ShellEvents 在壳内，和 Pool 无关。只有 SidePanel 的渲染从壳 DOM 移到 SidebarPool。

---

## 7. 跨Pool事件订阅模式

插件通过 `window.linkdesk.events.on(channel, callback)` 订阅事件：

```typescript
// 在 SidebarPool 中的 file-tree 插件
useEffect(() => {
  return window.linkdesk.events.on('file:saved', (data) => {
    refreshFileTree();
  });
}, []);
```

**和今天完全一样。** Pool 模型下不改变件订阅 API。
