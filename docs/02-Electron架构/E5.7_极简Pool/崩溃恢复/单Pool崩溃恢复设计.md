# 单Pool 崩溃恢复设计

> 极简Pool 只有一个 UI 渲染进程（Pool——壳渲染进程只持状态不画 UI）。Pool 崩了 → 主进程 `render-process-gone` handler → 重建 WCV（BrowserWindow + 壳渲染进程存活）→ pushLayout 恢复。

---

## 1. 崩溃模型

```
场景 A: Pool renderer 崩溃（OOM/while(true)/GPU crash/插件代码异常）
  ↓
Electron 触发: app.on('render-process-gone')
  ↓
主进程 handler:
  1. lastLayout 快照已有（每次 pushLayout 中转时缓存）
  2. 移除残留 WCV（BrowserWindow 本身存活——壳渲染进程不受影响）
  3. 创建新 WebContentsView
  4. 重新 addChildView (100%×100%)
  5. loadURL('pool.html')
  6. 等待 pool:ready
  7. pushLayout(lastLayout 快照)
  8. 所有 Zone 重新渲染
  9. 插件重新 mount → 从持久化恢复状态

场景 B: 壳渲染进程崩溃（loader.ts OOM / 壳代码异常）——比 Pool 崩更严重：tabState 随壳而死
  ↓
主进程 handler:
  1. 销毁旧 BrowserWindow（WCV 随窗口销毁）
  2. createMainWindow()——复用应用启动路径（壳 index.html + WCV pool.html）（🔴 不可直接复用——内部无条件 IPC 注册，见 §2.1 验收条）
  3. 壳从 workspace 持久化恢复 tabState → pushLayout
  4. 若壳恢复的 tabState 为空/过期 → 主进程回放 lastLayout 快照兜底
  5. Pool 插件重新 mount → IPC 重新注册命令（Phase 12 闭环；完成前命令注册会丢失——边缘场景，接受）
```

---

## 2. 实现

### 2.1 主进程 handler

```typescript
// electron/crash-recovery.ts

let lastLayout: PoolLayout | null = null;

// 壳 pushLayout 走 IPC 中转（壳渲染进程 → ipcRenderer.send → 主进程 → pool）
// 主进程在中转处缓存快照——Pool 崩溃后不依赖壳就能回放
export function cacheLayoutSnapshot(layout: PoolLayout): void {
  lastLayout = layout;
}

// render-process-gone handler
export function setupCrashRecovery(mainWindow: BrowserWindow): void {
  app.on('render-process-gone', (event, webContents, details) => {
    // 🔴 2026-08-13 审计：clean-exit 守卫——应用退出/窗口销毁也触发本事件，不拦 = 退出过程中建 WCV
    if (details.reason === 'clean-exit') return;

    // 分支 1：Pool WCV 崩——重建 WCV（壳存活，tabState 不丢）
    const mainWcv = getMainPoolView();
    if (mainWcv && webContents.id === mainWcv.webContents.id) {
      console.error('[E5.7] MainPool renderer crashed:', details.reason, details.exitCode);
      rebuildMainPool(mainWindow);
      return;
    }

    // 分支 2：壳渲染进程崩——全窗口重建（tabState 随壳丢失，靠持久化 + lastLayout 兜底）
    if (webContents.id === mainWindow.webContents.id) {
      console.error('[E5.7] Shell renderer crashed — full window rebuild');
      rebuildShellAndPool(mainWindow);
      return;
    }

    // 🔴 2026-08-13：脱出窗口已推迟 v1.3——E5.7 只有 2 个渲染进程，分支到此完备
  });
}

function rebuildShellAndPool(mainWindow: BrowserWindow): void {
  // 复用应用启动路径——createMainWindow() 内部：新建 BrowserWindow + 挂 WCV + 加载壳/pool
  const newWin = createMainWindow();
  // 壳从 workspace 持久化恢复 tabState；若为空，主进程在 pool:ready 后回放 lastLayout 兜底
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();  // WCV 随窗口销毁
  }
}

function rebuildMainPool(mainWindow: BrowserWindow): void {
  // 1. 清除旧的 WCV
  const oldWcv = getMainPoolView();
  if (oldWcv) {
    try { mainWindow.contentView.removeChildView(oldWcv); } catch {}
  }

  // 2. 创建新 WCV
  const newWcv = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload-pool.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // 3. 设置 bounds——100%×100%
  setWcvFullBounds(mainWindow, newWcv);

  // 4. 添加到窗口
  mainWindow.contentView.addChildView(newWcv);

  // 5. 更新 WindowManager 引用
  setMainPoolView(newWcv);

  // 6. 加载 pool.html
  const url = process.env.NODE_ENV === 'development'
    ? 'http://localhost:1420/pool.html'
    : `file://${path.join(__dirname, '../renderer/pool.html')}`;

  // 7. 等待 ready → pushLayout
  const onReady = (event: IpcMainEvent) => {
    if (event.sender === newWcv.webContents) {
      ipcMain.removeListener('pool:ready', onReady);
      if (lastLayout) {
        newWcv.webContents.send('pool:layout', lastLayout);
        console.log('[E5.7] Pool rebuilt + layout restored');
      }
    }
  };
  ipcMain.on('pool:ready', onReady);

  newWcv.webContents.loadURL(url);
}

function setWcvFullBounds(mainWindow: BrowserWindow, wcv: WebContentsView): void {
  const [w, h] = mainWindow.getContentSize();
  wcv.setBounds({ x: 0, y: 0, width: w, height: h });
}
```

### 2.2 心跳——独立任务（与 E2a 壳心跳并行）

> 🔴 2026-08-13 审计：① 与 E2a 壳心跳（`app:heartbeat` 2s 发 / 30s 超时 → 原生对话框）**并行互不替代**——壳持 tabState，壳心跳保留。② preload-pool.ts 需补 `pool.onPing` 注册（现池命名空间只有 onLayout/ready/sidebarAction/tabAction，无人回 pong）。

```typescript
// 主动检测无响应的 renderer
let lastPong = Date.now();

function setupHeartbeat(wcv: WebContentsView): void {
  // 每 5s ping
  const interval = setInterval(() => {
    wcv.webContents.send('pool:ping');
  }, 5000);

  // 收到 pong
  ipcMain.on('pool:pong', (event) => {
    if (event.sender === wcv.webContents) {
      lastPong = Date.now();
    }
  });

  // 10s 无响应 → 主动 kill + 重建
  setInterval(() => {
    if (Date.now() - lastPong > 10000) {
      console.error('[E5.7] Pool heartbeat timeout — force rebuild');
      wcv.webContents.forcefullyCrashRenderer();  // 触发 render-process-gone
    }
  }, 3000);
}
```

---

## 3. 数据恢复

### 3.1 恢复能力表

> **状态归属：** tabState 在壳渲染进程（不随 Pool 崩溃丢失）。主进程在 pushLayout 中转时缓存 `lastLayout`——重建时不依赖壳的即时响应，直接回放快照；壳随后 syncLayout 时自然对齐。

| 数据 | 恢复来源 | 恢复能力 |
|:--|:--|:--|
| 标签页结构 | 主进程 lastLayout 快照 + 壳 tabState | ✅ 100%——快照直接回放，壳再全量对齐 |
| 侧栏视图 | 同上 | ✅ 100% |
| 分屏布局（SplitNode） | 同上 | ✅ 100% |
| 面板布局 | 同上 | ✅ 100% |
| StatusBar 项 | 插件重新注册 | ✅ 插件 mount 时重新调 `window.linkdesk.statusBar.setEntry` |
| Monaco Editor 内容 | Hot Exit 临时文件 | ⚠️ 需要 Hot Exit 机制——文件落盘→重建后恢复 |
| Terminal 会话 | xterm.js buffer | ❌ 不可恢复——需重新连接 |
| 串口连接 | SerialPort 句柄 | ❌ 不可恢复——需重新连接 |
| 插件内部 React state | React state | ❌ 丢失——插件重新 mount，state 初始化 |

### 3.2 Hot Exit 机制

```
编辑器未保存内容恢复:
  Monaco onDidChangeModelContent
    → 脏内容异步写入 %APPDATA%/linkdesk/hot-exit/{workspaceId}/{filePath}.dirty
    → Pool 崩溃
    → 重建 → MainZone 重新 mount
    → PluginComponent(pluginId="editor", sourceId=filePath) mount
    → 编辑器检查 hot-exit 目录 → 有脏文件 → 恢复内容 + 标记 dirty
    → 用户保存 → 删除 hot-exit 文件
```

**如果 Hot Exit 未实现——需要在 E5.7#38 新增。** 不依赖进程数。

> ✅ **E5.7#38 已实现（2026-08-15）。** 与上图一处偏差：文件命名 `<sha256(filePath)>.dirty` 扁平化——
> LinkDesk 文件路径恒为绝对路径（全局唯一），`{workspaceId}/{filePath}` 分层冗余；sha256 等价且免
> 路径长度/非法字符/目录穿越问题（对标 VS Code Backups/ 同款 hashing）。其余照图：脏内容 1s
> debounce 异步落盘（主进程 handler 单源路径约定，池渲染进程零直写）→ 池崩 → 重建 → EditorTab
> `hotExit.load` 恢复 + dirty 标记 → 保存 `hotExit.clear` 删文件；标签关闭（unmount）延迟清备份。

---

## 4. 与 E5.6 双Pool 崩溃恢复的对比

| 维度 | E5.6 双Pool | E5.7 极简Pool |
|:--|:--|:--|
| 崩溃点 | 3 个（SidebarPool + MainPool + OverlayWindow） | 2 个（MainPool + 壳渲染进程） |
| 独立恢复 | ✅ SidebarPool 崩 ≠ MainPool 崩 | ❌ 崩一个 = 全池崩 |
| 恢复时间 | SidebarPool 1-2s / MainPool 3-5s | Pool 2-4s / 壳崩 3-5s（全窗口重建） |
| 壳崩恢复 | 重建 BrowserWindow（无兜底） | workspace 持久化 + lastLayout 兜底 + Phase 12 IPC 重注册闭环 |
| 编辑器状态保持 | MainPool 崩时编辑器同样丢失 | 同样丢失——依赖 Hot Exit |
| 心跳 | 每个 Pool 独立心跳 | 1 个心跳 |
| 代码量 | ~150 行（3 套恢复逻辑） | ~50 行（1 套） |
| tabState 安全 | tabState 在壳渲染进程——不随任何 Pool 崩溃丢失 | 同——壳渲染进程存活，tabState 不随 WCV 重建丢失 |


## 5. 边缘情况

### 5.1 快速连续崩溃

```
Pool 崩溃 → 重建 → 又崩溃 → 又重建 → ...
  防护: 10s 内崩溃 3 次 → 停止自动重建 → 显示 "LinkDesk 遇到问题" 静态 HTML
```

> **E5.7#103（2026-08-16）：** 错误页加"重试"按钮。裸 renderer（data: URL，无 preload/IPC）点击重试 = 导航到 `linkdesk-retry://` 当信号——主进程 `will-navigate` 拦截（`web-contents-created` 全局挂一次，覆盖每次重建的新池 wc）→ 清 `rebuildStopped` 恢复重建链。**熔断窗口计数不清零**——重试后立刻再崩仍落回错误页，不无限循环。

### 5.2 崩溃时正在拖拽

```
拖拽标签页中 → Pool 崩溃 → 重建
  → 拖拽状态丢失——mousedown 已释放
  → tabState 中 tab 仍在原 group——恢复正确
```

### 5.3 崩溃时正在编辑

```
Monaco 编辑中 → Pool 崩溃 → 重建
  → Hot Exit 恢复未保存内容
  → 光标位置丢失（Monaco 的 viewState 可持久化——远期优化）
```

### 5.4 壳崩

```
壳渲染进程崩 → 全窗口重建 → tabState 从 workspace 持久化恢复
  → 持久化未覆盖的新建标签页丢失——接受（等同应用重启）
  → 插件命令注册：Phase 12 完成后插件 mount 时自动 IPC 重注册；未完成前壳崩后命令注册丢失
  → 未保存编辑器内容：Hot Exit 兜底（同 Pool 崩）
```

---

> 📖 架构全景 → [01-极简Pool设计.md](../01-极简Pool设计.md)
> 📖 执行清单 → [E5.7-执行清单.md](../E5.7-执行清单.md)
