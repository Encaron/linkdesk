/**
 * Electron 主进程入口
 *
 * E1 步 1：创建 BrowserWindow 加载 LinkDesk UI。
 * 串口/文件/插件管理服务在步 2-4 逐步接入。
 *
 * 架构：单实例锁 + BrowserWindow + preload 加载确认。
 * 对标 VS Code 的主进程管理模式。
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM 兼容——__dirname 在 ES 模块中不可用，需手动派生
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── 单实例锁 ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ── 窗口引用（后续 SerialService/file-service 需要 mainWindow.webContents.send()）──
let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload-shell.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload 需要访问 Node.js API 做 contextBridge
    },
    title: 'LinkDesk',
    show: false, // ready-to-show 后再显示，避免白屏闪烁
  });

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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── preload 加载确认（新风险 3 防御——preload 抛异常不进 ErrorBoundary）──
ipcMain.on('preload-ready', () => {
  console.log('[main] preload-shell 加载成功，window.linkdesk 已就绪');
});

// ── 应用生命周期 ──
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
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
export { mainWindow };
