/**
 * Electron 主进程入口
 *
 * E1 步 1-5：Electron 壳 + 串口/文件/插件/dialog + linkdesk:// 协议。
 *
 * 架构：单实例锁 + BrowserWindow + preload 加载确认 + linkdesk:// 自定义协议。
 * 对标 VS Code 的主进程管理模式。
 */

import { app, BrowserWindow, ipcMain, protocol, dialog, nativeTheme, Menu, shell } from 'electron';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { registerSerialHandlers } from './ipc/handlers/serial-handlers.js';
import { registerFileHandlers } from './ipc/handlers/file-handlers.js';
import { loadAllPluginManifests, registerManifestRescanHandler } from './plugins/plugin-manifest-loader.js'; // E5.7#48：Registry 主进程化——三表预加载
import { registerPluginHandlers } from './ipc/handlers/plugin-handlers.js';
import { registerDialogHandlers } from './ipc/handlers/dialog-handlers.js';
import { registerEnvHandlers } from './ipc/handlers/env-handlers.js';
import { registerClipboardHandlers } from './ipc/handlers/clipboard-handlers.js';
import { registerRegistryHandlers } from './ipc/handlers/registry-handlers.js'; // E5.7#49：主进程三表直连 IPC
import { registerHotExitHandlers } from './ipc/handlers/hot-exit-handlers.js'; // E5.7#38
import { registerPoolHandlers } from './ipc/handlers/plugin-view-handlers.js'; // E5.6#8d
import { registerLspHandlers } from './ipc/handlers/lsp-handlers.js'; // E4V#40s1
import { registerProtocol } from './plugins/protocol.js';
import { fileService } from './services/file-service.js';
import { WindowManager } from './windows/window-manager.js';
import { syncKeybindings } from './windows/keyboard-router.js'; // E5.5#7-p6
import { IpcBridge } from './ipc/ipc-bridge.js';
import { setupCrashRecovery, replayAfterShellRebuild, type CrashRecoveryDeps } from './windows/crash-recovery.js'; // E5.7#36
import { APP_SCHEME, DEV_SERVER_URL } from './constants.js'; // E5#102b：DEV_SERVER_URL 定义在 constants.ts
import { IPC } from './ipc/channels.js';
// ── 单实例锁 ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ── 窗口引用（后续 SerialService/file-service 需要 mainWindow.webContents.send()）──
let mainWindow: BrowserWindow | null = null;
// E3a #24：插件 WebContentsView 生命周期管理
let windowManager: WindowManager | null = null;
// E3a #26：池渲染进程 ↔ 壳渲染进程 IPC 中继（E5.7#43）
let ipcBridge: IpcBridge | null = null;

const isDev = !app.isPackaged;
let _windowIpcRegistered = false; // E3f #52f：窗口控制 IPC handler 只注册一次
// E5.7#79：最后应用的缩放因子——壳崩重建/池重建（createWindow → createMainPool）后重放。
// 主进程模块级变量在 rebuildShell 中存活（进程不重启），壳侧配置 onApply 在渲染进程加载后才推来。
let _lastZoomFactor = 1;
// E5.7#36：无状态 shell IPC 只注册一次（壳崩重建 createWindow 会再次经过——不 guard 则重复注册抛异常）
let _keyboardSyncRegistered = false;
let _shellIpcRegistered = false;

function createWindow(): void {
  // E3f #51：标题栏暗色化——跟随 LinkDesk 暗色主题
  nativeTheme.themeSource = 'dark';
  // E3f #52：去掉 Electron 默认菜单栏（File/Edit/View/Window）——LinkDesk 用自己的
  Menu.setApplicationMenu(null);

  // E5.7#36：local win——closed 处理器需身份校验（旧窗销毁不得清掉重建后的新引用）
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    icon: isDev
      ? path.join(__dirname, '../../build/icon.ico')
      : path.join(process.resourcesPath, 'icon.ico'), // 打包后 icon.ico 在 extraResources，不在 ASAR 中
    frame: false, // E3f #52f：隐藏原生窗口框架——LinkDesk 自己画 TitleBar
    // E5.8#6.6 hex 豁免：主进程窗口初始背景色（OS 层，渲染进程 CSS 变量不可达；E3f #51 防启动白屏）
    // eslint-disable-next-line linkdesk/no-hardcoded-hex
    backgroundColor: '#1e1e1e', // E3f #51：暗色背景——消除启动白屏
    webPreferences: {
      preload: path.join(__dirname, 'preload-shell.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload 需要访问 Node.js API 做 contextBridge
      backgroundThrottling: false, // E2c fix：禁止 Chromium 节流后台定时器——心跳看门狗失焦时误判"无响应"
    },
    title: 'LinkDesk',
    show: false, // ready-to-show 后再显示，避免白屏闪烁
  });
  mainWindow = win; // E5.7#36：壳崩重建复用 createWindow——模块引用先指向新窗

  // ── 注册 IPC 处理器（E5.7#36：全部幂等——首次注册 + 重建时刷新引用；无状态 handler 重复调用直接跳过）──
  registerPluginHandlers();
  registerDialogHandlers();
  registerEnvHandlers();
  registerClipboardHandlers();
  registerRegistryHandlers();  // E5.7#49：三表直连（数据由 plugin-manifest-loader 预加载）
  registerHotExitHandlers();   // E5.7#38

  // E3a #24：初始化 WindowManager（E5.7#43：PluginViewRegistry 已删）
  windowManager = new WindowManager(win);
  // E5.5#7-p7：壳同步快捷键表到主进程（无窗口引用——只注册一次）
  if (!_keyboardSyncRegistered) {
    _keyboardSyncRegistered = true;
    ipcMain.handle(IPC.keyboard.syncShortcuts, (_event, data) => {
      syncKeybindings(data);
    });
  }
  // E3a #26-#27：初始化 IpcBridge——注册 config/command 代理 + 事件推送通道（换实例摘旧挂新）
  ipcBridge = new IpcBridge(win, windowManager);
  windowManager.setIpcBridge(ipcBridge); // E3c #40：IpcBridge 注入 WindowManager——新 WebView 重放广播

  // E5#74 + E5.8#6.5：serial/lsp/file 推送改走 IpcBridge.broadcast（IpcBridge.active 取最新实例）——
  // lsp/serial 推送无窗引用依赖 → 可无参；file 必须保留 windowManager——isPoolSender 壳/池来源判定靠它
  // （#6.5 回归：误删参数 → _windowManager 恒 undefined → 壳受信写也被当池来源守卫 → 启动弹十几个"工作区外写入确认"）
  registerLspHandlers();   // E5#74c
  registerSerialHandlers(); // E5#74b
  registerFileHandlers(windowManager);              // E5#80
  registerPoolHandlers(windowManager, win);  // E5.6#8e

  // E5.6#9 → E5.7#4：创建唯一 Pool WebContentsView——极简Pool 单 WCV（#12 提前：SidebarPool 已删）
  windowManager.createMainPool();

  // E5.7#79：重放最后缩放因子——壳崩重建时壳配置 onApply 尚未跑（渲染进程加载后才有），
  // 新池默认 100% 会闪一下。首次启动 _lastZoomFactor=1 → no-op。
  if (_lastZoomFactor !== 1) {
    const poolView = windowManager.getPoolView();
    if (poolView && !poolView.webContents.isDestroyed()) {
      poolView.webContents.setZoomFactor(_lastZoomFactor);
    }
  }

  // ── 加载内容：dev 模式从 Vite dev server，prod 模式从 dist/ ──
  if (isDev) {
    win.loadURL(DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  // ready-to-show 后才显示窗口
  win.once('ready-to-show', () => {
    if (win && !win.isDestroyed()) win.show();
  });

  // 🔥 E5#114d 诊断：把渲染进程 console 输出转发到文件——生产环境 F12 禁用
  win.webContents.on('console-message', (_event, _level, message) => {
    try {
      const logFile = path.join(app.getPath('userData'), 'protocol-debug.log');
      const ts = new Date().toISOString();
      fs.appendFileSync(logFile, `[${ts}] [renderer] ${message}\n`);
    } catch { /* ignore */ }
  });

  // E3f #52f：自定义窗口控制（─ □ ×）——TitleBar 按钮 → 主进程窗口操作
  // E5.8#43-2（B3）：按发送者路由——池 TitleBarZone 按钮来自哪个 Pool 窗口就作用于哪个宿主窗
  //（脱出窗点 ─ □ × 作用于自身；壳渲染进程 sender 不在 poolWindows 注册表 → 回退主窗）。
  const hostWindowFor = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): BrowserWindow => {
    const windowId = windowManager?.getWindowIdByWebContents(event.sender) ?? 'main';
    return windowManager?.getHostWindow(windowId) ?? mainWindow!;
  };
  if (!_windowIpcRegistered) {
    _windowIpcRegistered = true;
    ipcMain.on(IPC.window.minimize, (event) => hostWindowFor(event)?.minimize());
    ipcMain.on(IPC.window.maximize, (event) => hostWindowFor(event)?.maximize());
    ipcMain.on(IPC.window.unmaximize, (event) => hostWindowFor(event)?.unmaximize());
    ipcMain.on(IPC.window.close, (event) => hostWindowFor(event)?.close());
    ipcMain.handle(IPC.window.isMaximized, (event) => hostWindowFor(event)?.isMaximized() ?? false);
    // E5.7#79：窗口缩放——壳配置 onApply 推来的因子应用到池 WCV（可见 UI 全在池）。
    // 缓存供 createWindow 重建池后重放（池 WCV 是新 webContents，缩放不随窗口重建保留）。
    ipcMain.on(IPC.window.setZoom, (_event, factor: number) => {
      // Number.isFinite 而非 typeof === "number"——no-restricted-syntax 字符串比较启发式误报
      const n = Number(factor);
      _lastZoomFactor = Number.isFinite(n) ? n : 1;
      const poolView = windowManager?.getPoolView();
      if (poolView && !poolView.webContents.isDestroyed()) {
        poolView.webContents.setZoomFactor(_lastZoomFactor);
      }
    });
    // E3f #58：切换壳窗口 DevTools——多 WebView 未激活时的兜底
    ipcMain.handle(IPC.window.toggleDevTools, () => {
      if (!mainWindow || app.isPackaged) return;
      const wc = mainWindow.webContents;
      wc.isDevToolsOpened() ? wc.closeDevTools() : wc.openDevTools({ mode: 'detach' });
    });
  }
  // E5.8#43-2（B3）：最大化状态 → 该窗池 WCV（TitleBar □/还原按钮态跟随所在窗口）。
  // 原 win.webContents.send 发的是壳渲染进程（index.html）——池是独立 WCV 收不到（E5.7 潜伏缺口），
  // 且脱出窗壳 webContents 无人消费。sendPoolMaximizeChange 按宿主窗反查池定向发送。
  win.on('maximize', () => windowManager?.sendPoolMaximizeChange(win, true));
  win.on('unmaximize', () => windowManager?.sendPoolMaximizeChange(win, false));

  // ── E5.7#36：无状态 shell IPC——无窗口引用，只注册一次 ──
  if (!_shellIpcRegistered) {
    _shellIpcRegistered = true;

    // E4V#18: Shell IPC——revealInOS
    ipcMain.handle(IPC.shell.showItemInFolder, async (_e, p: string) => shell.showItemInFolder(p));

    // E5#108b：文件拖出到桌面——Electron 原生 API。低版本无 startDrag 则静默
    ipcMain.on(IPC.shell.startDrag, (event, filePath: string, iconPath?: string) => {
      if (!filePath) return;
      // E5.7#98：startDrag 是 WebContents 类型化 API——as any 删除，typeof 守卫保留（低版本运行时无此方法）。
      // 本版 typings Item.icon 必填而运行时可选——按需装配后调用点窄化
      const sender = event.sender;
      if (typeof sender.startDrag !== 'function') return;
      const opts: Record<string, unknown> = { file: filePath };
      if (iconPath && fs.existsSync(iconPath)) opts.icon = iconPath;
      else if (process.platform === 'win32') {
        const defIcon = path.join(__dirname, '../../build/icon.ico');
        if (fs.existsSync(defIcon)) opts.icon = defIcon;
      }
      sender.startDrag(opts as unknown as Electron.Item);
    });

    // E4V#19 + E5#22: 在系统终端打开目录——可配置终端类型，不再硬编码 PowerShell
    ipcMain.handle(IPC.shell.openInTerminal, async (_e, dirPath: string, terminalExe?: string, customCommand?: string) => {
      if (process.platform === 'win32') {
        const exe = terminalExe || 'powershell';
        let cmd: string;
        switch (exe) {
          case 'cmd':
            cmd = `start cmd /K "cd /d "${dirPath}""`;
            break;
          case 'wt':
            cmd = `wt -d "${dirPath}"`;
            break;
          case 'git-bash': {
            const gitBashPaths = [
              'C:\\Program Files\\Git\\git-bash.exe',
              'C:\\Program Files (x86)\\Git\\git-bash.exe',
              `${process.env.LOCALAPPDATA}\\Programs\\Git\\git-bash.exe`,
            ];
            const gitBash = gitBashPaths.find(p => fs.existsSync(p));
            if (gitBash) {
              cmd = `start "" "${gitBash}" --cd="${dirPath}"`;
            } else {
              console.error('[shell:openInTerminal] Git Bash 未找到');
              return;
            }
            break;
          }
          case 'custom':
            // 🔥 不硬编码——渲染进程传模板，替换 {{dirPath}} 占位符
            cmd = (customCommand || '').replace(/\{\{dirPath\}\}/g, dirPath);
            if (!cmd) { console.error('[shell:openInTerminal] 自定义命令为空'); return; }
            break;
          case 'powershell':
          default:
            cmd = `start powershell -NoExit -Command "cd '${dirPath}'"`;
            break;
        }
        exec(cmd, (err) => {
          if (err) console.error('[shell:openInTerminal] 启动终端失败:', err);
        });
      } else if (process.platform === 'darwin') {
        exec(`open -a Terminal "${dirPath}"`, (err) => {
          if (err) console.error('[shell:openInTerminal] 启动终端失败:', err);
        });
      } else {
        // Linux（E5#22 bug fix——原来无此分支，走 macOS 命令无效）
        exec(`xdg-open "${dirPath}"`, (err) => {
          if (err) console.error('[shell:openInTerminal] 启动终端失败:', err);
        });
      }
      });
    }

  win.on('closed', () => {
    // E5.7#36：身份校验——壳崩重建先建新窗后毁旧窗，旧窗的 closed 不得清掉新引用
    if (mainWindow !== win) return;
    mainWindow = null;
    // E5.8#43-3（2026-08-22 用户拍板）：主窗关闭 = 整个应用退出——脱出窗一同关闭（quitApp）。
    // 不能靠 window-all-closed（脱出窗还开着时不触发 → 壳死 + 脱出窗变僵尸：池收不到 pushLayout、
    // 键盘路由挂已销毁 mainWindow）。壳 = 主窗 webContents，主窗没了壳就死 → 必须连带退出全部窗口。
    // app.quit() 关全部窗口 → 壳 beforeunload 落盘（syncWriteLayout 含脱出窗 bounds）→ 正常退出。
    app.quit();
  });
}

/**
 * E5.7#36：壳渲染进程崩溃——全窗口重建（设计 §2.1 场景 B）。
 * createWindow 内全部 ipcMain 注册已 once-guard（审计①）——重复调用只刷新引用，不重注册；
 * IpcBridge 换实例摘旧挂新。先建后毁：窗口数不为零，window-all-closed 不触发退出。
 */
function rebuildShell(): void {
  const oldWin = mainWindow;
  const oldWm = windowManager;
  const oldBridge = ipcBridge;
  oldBridge?.dispose(); // 拒绝旧壳未决请求
  oldWm?.dispose();     // 清内存定时器 + 注销 resize 监听 + 销毁旧池
  createWindow();
  replayAfterShellRebuild(crashRecoveryDeps); // 新池就绪后回放 lastLayout 兜底
  if (oldWin && !oldWin.isDestroyed()) oldWin.destroy();
}

// E5.7#36：崩溃恢复接线——getter 闭包运行时读最新引用（重建后自动指向新实例）
const crashRecoveryDeps: CrashRecoveryDeps = {
  getMainWindow: () => mainWindow,
  getWindowManager: () => windowManager,
  rebuildShell,
};

setupCrashRecovery(crashRecoveryDeps);

// E3f #51：渲染进程主题变更 → 同步标题栏 + 窗口背景色
ipcMain.on(IPC.theme.changed, (_event, isDark: boolean) => {
  nativeTheme.themeSource = isDark ? 'dark' : 'light';
  // E5.8#6.6 hex 豁免：窗口背景色随主题（OS 层 setBackgroundColor，CSS 变量不可达）
  // eslint-disable-next-line linkdesk/no-hardcoded-hex
  const bg = isDark ? '#1e1e1e' : '#f5f5f5';
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(bg);
  }
  // E5.6#10f：Pool WebContentsView 背景跟随主题——池创建时 nativeTheme 尚未反映用户主题
  if (windowManager) {
    for (const poolView of windowManager.getAllPoolViews()) {
      if (!poolView.webContents.isDestroyed()) {
        poolView.setBackgroundColor(bg);
      }
    }
  }
});

// ── preload 加载确认（新风险 3 防御——preload 抛异常不进 ErrorBoundary）──
// E5.8#46.11：每次壳加载（fresh+reload）主动 seed 全部池窗 bounds——壳 reload 后注册表 bounds 清空、
// 池不随壳 reload 重发 pool:ready → main.bounds 恒缺直至用户动窗（#46.10 吸附对无 bounds 窗跳过命中）。
// preloadReady 恒在池注册之后触发（windowManager 建于壳页面加载前），此 handler 无需等待窗。
ipcMain.on(IPC.app.preloadReady, () => {
  console.log('[main] preload-shell 加载成功，window.linkdesk 已就绪');
  windowManager?.pushAllWindowBounds();
});

// ── E2a #5：心跳看门狗——检测 JS 主线程死循环/卡死 ──
// 渲染进程每 2s 发 heartbeat。主进程每 3s 检查一次，
// 若超过 30s 未收到 → JS 主线程可能卡死 → 弹出原生对话框。
// 限制：单 WebView 下只能检测，无法恢复。E3 多进程后改为只重载卡死的 WebView。
let lastHeartbeat = 0; // 0 = 尚未收到任何心跳（渲染进程未就绪前不弹窗）
const HEARTBEAT_TIMEOUT = 30_000; // 30s 无心跳 → 判定卡死
const HEARTBEAT_CHECK_INTERVAL = 3000; // 每 3s 检查一次

ipcMain.on(IPC.app.heartbeat, () => {
  lastHeartbeat = Date.now();
});

setInterval(() => {
  if (mainWindow === null || mainWindow.isDestroyed()) return;
  if (lastHeartbeat === 0) return; // 渲染进程未就绪——还没开始发心跳
  const elapsed = Date.now() - lastHeartbeat;
  if (elapsed > HEARTBEAT_TIMEOUT) {
    // 防止重复弹窗——重置计时器避免连续弹出
    lastHeartbeat = Date.now();
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '应用无响应',
      message: 'LinkDesk 界面无响应，可能是插件导致的主线程阻塞。',
      buttons: ['刷新', '等待'],
      defaultId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        app.relaunch();
        app.exit(0);
      }
    });
  }
}, HEARTBEAT_CHECK_INTERVAL);

// ── 注册 linkdesk:// 协议（必须在 app.whenReady 之前声明 privileged）──
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  // E5.6#9h：注册 extension-file 协议——@codingame Monaco 内部虚拟文件系统，
  // 无此注册则 extension-file:// fetch 请求全 404，console 噪音。
  { scheme: "extension-file", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// ── 应用生命周期 ──
app.whenReady().then(() => {
  registerProtocol();
  // E5.7#48：Registry 主进程化——静态声明三表（LangDef/Protocol/FileAssociation）预加载，
  // 必须在 createWindow（池 WCV 创建于其内）之前——首个 IPC 查询到达时表已填好，无竞态窗口。
  // 装/卸/重装重扫通道注册一次；壳崩重建走 rebuildShell→createWindow，不经过 whenReady，
  // 主进程三表数据天然存活、无需重扫。
  registerManifestRescanHandler();
  loadAllPluginManifests();
  createWindow();
});

app.on('window-all-closed', () => {
  fileService.closeAllWatchers();
  app.quit();
});

// 保险：非 window-all-closed 路径退出时（如 app.quit() 直接调用）也清理 watcher
app.on('before-quit', () => {
  // E3a #24：先销毁所有插件 WebContentsView，再关文件 watcher
  windowManager?.dispose();
  ipcBridge?.dispose();
  fileService.closeAllWatchers();
});

app.on('activate', () => {
  // macOS: Dock 图标点击时无窗口 → 重新创建
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 第二个实例启动时 → 聚焦已有窗口
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// 导出窗口引用——后续步 2-4 的 SerialService 等服务需要它推送数据到渲染进程
// E3a #24-#26：导出 WindowManager + IpcBridge（E5.7#43：PluginViewRegistry 已删）
export { mainWindow, windowManager, ipcBridge };
