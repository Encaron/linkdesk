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
import * as path from 'path';
import { registerSerialHandlers } from './ipc/serial-handlers.js';
import { registerFileHandlers } from './ipc/file-handlers.js';
import { registerPluginHandlers } from './ipc/plugin-handlers.js';
import { registerDialogHandlers } from './ipc/dialog-handlers.js';
import { registerEnvHandlers } from './ipc/env-handlers.js';
import { registerPluginViewHandlers } from './ipc/plugin-view-handlers.js'; // E3a #29
import { registerLspHandlers } from './ipc/lsp-handlers.js'; // E4V#40s1
import { registerProtocol } from './protocol.js';
import { fileService } from './services/file-service.js';
import { WindowManager } from './window-manager.js';
import { PluginViewRegistry } from './plugin-view-registry.js';
import { IpcBridge } from './ipc-bridge.js';
import { APP_SCHEME } from './constants.js';
// ── 单实例锁 ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ── 窗口引用（后续 SerialService/file-service 需要 mainWindow.webContents.send()）──
let mainWindow: BrowserWindow | null = null;
// E3a #24：插件 WebContentsView 生命周期管理
let windowManager: WindowManager | null = null;
// E3a #25：插件 ID→View 映射 + bounds 管理 + 重载
let pluginViewRegistry: PluginViewRegistry | null = null;
// E3a #26：插件 WebView ↔ 壳渲染进程 IPC 中继
let ipcBridge: IpcBridge | null = null;

const isDev = !app.isPackaged;
let _windowIpcRegistered = false; // E3f #52f：窗口控制 IPC handler 只注册一次

function createWindow(): void {
  // E3f #51：标题栏暗色化——跟随 LinkDesk 暗色主题
  nativeTheme.themeSource = 'dark';
  // E3f #52：去掉 Electron 默认菜单栏（File/Edit/View/Window）——LinkDesk 用自己的
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    icon: path.join(__dirname, '../build/icon.ico'), // 任务栏/窗口图标——dev 用 build/icon.ico
    frame: false, // E3f #52f：隐藏原生窗口框架——LinkDesk 自己画 TitleBar
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

  // ── 注册 IPC 处理器（不依赖 WindowManager 的先注册）──
  registerFileHandlers();
  registerPluginHandlers();
  registerDialogHandlers();
  registerEnvHandlers();

  // E3a #24：初始化 WindowManager
  windowManager = new WindowManager(mainWindow);
  // E3a #25：初始化 PluginViewRegistry（包装 WindowManager）
  pluginViewRegistry = new PluginViewRegistry(windowManager);
  // E3a #29：注册插件视图管理 IPC handler——壳侧 MainContent 通过它控制 WebView 显隐/位置
  registerPluginViewHandlers(pluginViewRegistry, mainWindow);
  // E4V#40s1：LSP spawn handler——渲染进程启动语言服务器
  registerLspHandlers(mainWindow);
  // E3a #26-#27：初始化 IpcBridge——注册 config/command 代理 + 事件推送通道
  ipcBridge = new IpcBridge(mainWindow, windowManager);
  windowManager.setIpcBridge(ipcBridge); // E3c #40：IpcBridge 注入 WindowManager——新 WebView 重放广播

  // E5#74b：串口数据广播到插件 WebView（依赖 WindowManager + IpcBridge 就绪）
  registerSerialHandlers(mainWindow, windowManager);

  // ── 加载内容：dev 模式从 Vite dev server，prod 模式从 dist/ ──
  if (isDev) {
    mainWindow.loadURL('http://localhost:1420');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // ready-to-show 后才显示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // E3f #52f：自定义窗口控制（─ □ ×）——TitleBar 按钮 → 主进程窗口操作
  if (!_windowIpcRegistered) {
    _windowIpcRegistered = true;
    ipcMain.on('window:minimize', () => mainWindow?.minimize());
    ipcMain.on('window:maximize', () => mainWindow?.maximize());
    ipcMain.on('window:unmaximize', () => mainWindow?.unmaximize());
    ipcMain.on('window:close', () => mainWindow?.close());
    ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
    // E3f #58：切换壳窗口 DevTools——多 WebView 未激活时的兜底
    ipcMain.handle('window:toggleDevTools', () => {
      if (!mainWindow || app.isPackaged) return;
      const wc = mainWindow.webContents;
      wc.isDevToolsOpened() ? wc.closeDevTools() : wc.openDevTools({ mode: 'detach' });
    });
  }
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximize-change', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximize-change', false));

  // E4V#18: Shell IPC——revealInOS
  ipcMain.handle('shell:showItemInFolder', async (_e, p: string) => shell.showItemInFolder(p));

  // E4V#19: 在系统终端打开目录——Windows 走 PowerShell，macOS 走 Terminal
  ipcMain.handle('shell:openInTerminal', async (_e, dirPath: string) => {
    const cmd = process.platform === 'win32'
      ? `start powershell -NoExit -Command "cd '${dirPath}'"`
      : `open -a Terminal "${dirPath}"`;
    exec(cmd, (err) => {
      if (err) console.error('[shell:openInTerminal] 启动终端失败:', err);
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// E3f #51：渲染进程主题变更 → 同步标题栏 + 窗口背景色
ipcMain.on('theme-changed', (_event, isDark: boolean) => {
  nativeTheme.themeSource = isDark ? 'dark' : 'light';
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(isDark ? '#1e1e1e' : '#f5f5f5');
  }
});

// ── preload 加载确认（新风险 3 防御——preload 抛异常不进 ErrorBoundary）──
ipcMain.on('preload-ready', () => {
  console.log('[main] preload-shell 加载成功，window.linkdesk 已就绪');
});

// ── E2a #5：心跳看门狗——检测 JS 主线程死循环/卡死 ──
// 渲染进程每 2s 发 heartbeat。主进程每 3s 检查一次，
// 若超过 30s 未收到 → JS 主线程可能卡死 → 弹出原生对话框。
// 限制：单 WebView 下只能检测，无法恢复。E3 多进程后改为只重载卡死的 WebView。
let lastHeartbeat = 0; // 0 = 尚未收到任何心跳（渲染进程未就绪前不弹窗）
const HEARTBEAT_TIMEOUT = 30_000; // 30s 无心跳 → 判定卡死
const HEARTBEAT_CHECK_INTERVAL = 3000; // 每 3s 检查一次

ipcMain.on('heartbeat', () => {
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
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// ── 应用生命周期 ──
app.whenReady().then(() => {
  registerProtocol();
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
// E3a #24-#26：导出 WindowManager + PluginViewRegistry + IpcBridge——MainContent 等需要它们
export { mainWindow, windowManager, pluginViewRegistry, ipcBridge };
