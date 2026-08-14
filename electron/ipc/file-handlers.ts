/**
 * 文件系统 IPC 处理器
 *
 * E1 步 3：对标 Tauri @tauri-apps/plugin-fs + @tauri-apps/api/path。
 * 所有文件 I/O 走此入口——E2c 归一化后成为唯一入口。
 */

import { ipcMain, BrowserWindow } from 'electron';
import { fileService } from '../services/file-service.js';
import type { WindowManager } from '../window-manager.js';

// E5.7#36：壳崩重建复用本函数——引用始终刷新（watcher 广播回调读模块引用），IPC 通道只注册一次
let _windowManager: WindowManager | undefined;
let _registered = false;

// E5#80：windowManager 用于广播文件变更到所有插件 WebView
export function registerFileHandlers(windowManager?: WindowManager): void {
  _windowManager = windowManager;
  if (_registered) return;
  _registered = true;
  // ── 路径 ──

  ipcMain.handle('path:appDataDir', () => {
    return fileService.appDataDir();
  });

  ipcMain.handle('path:join', (_event, ...parts: string[]) => {
    return fileService.join(...parts);
  });

  // ── 文件 I/O ──

  ipcMain.handle('filesystem:readTextFile', async (_event, filePath: string) => {
    return fileService.readTextFile(filePath);
  });

  ipcMain.handle('filesystem:writeTextFile', async (_event, filePath: string, data: string) => {
    await fileService.writeTextFile(filePath, data);
  });

  ipcMain.handle('filesystem:exists', (_event, filePath: string) => {
    return fileService.exists(filePath);
  });

  ipcMain.handle('filesystem:createDir', async (_event, dirPath: string) => {
    await fileService.createDir(dirPath);
  });

  ipcMain.handle('filesystem:readdir', async (_event, dirPath: string) => {
    return fileService.readdir(dirPath);
  });

  ipcMain.handle('filesystem:copy', async (_event, src: string, dest: string) => {
    await fileService.copy(src, dest);
  });

  ipcMain.handle('filesystem:remove', async (_event, dirPath: string) => {
    await fileService.remove(dirPath);
  });

  // ── E2c #13 新增：listDir / readBinaryFile / watch ──

  ipcMain.handle('filesystem:listDir', async (_event, dirPath: string) => {
    return fileService.listDir(dirPath);
  });

  ipcMain.handle('filesystem:readBinaryFile', async (_event, filePath: string) => {
    return fileService.readBinaryFile(filePath);
  });

  // E4V#40w——GBK 编码保存
  ipcMain.handle('filesystem:writeBinaryFile', async (_event, filePath: string, data: Buffer) => {
    await fileService.writeBinaryFile(filePath, data);
  });

  // E4V#fix: 每个 watcher 独立 IPC 通道——文件树和快捷键系统不再共享 filesystem:changed
  ipcMain.handle('filesystem:watch', (event, dirPath: string) => {
    const watcherId = fileService.watch(dirPath, (change) => {
      if (event.sender.isDestroyed()) return;
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        win.webContents.send(`filesystem:changed:${watcherId}`, change);
      }
      // E5#80 + E5.7#43：广播文件变更到唯一 Pool WebView（per-tab 实例循环已删——
      // 修复潜伏 bug：池内文件树 watcher 此前收不到任何变更）
      if (_windowManager) {
        for (const poolView of _windowManager.getAllPoolViews()) {
          if (!poolView.webContents.isDestroyed()) {
            poolView.webContents.send(`filesystem:changed:${watcherId}`, change);
          }
        }
      }
    });
    return watcherId;
  });

  ipcMain.handle('filesystem:unwatch', (_event, watcherId: number) => {
    fileService.unwatchFile(watcherId);
  });
}
