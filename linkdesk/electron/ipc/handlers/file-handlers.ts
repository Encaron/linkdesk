/**
 * 文件系统 IPC 处理器
 *
 * E1 步 3：对标 Tauri @tauri-apps/plugin-fs + @tauri-apps/api/path。
 * 所有文件 I/O 走此入口——E2c 归一化后成为唯一入口。
 * E5.7#63.5：写操作接 filesystem-guard 路径守卫——池来源（插件）归一化 +
 * 危险目录拒绝 + workspace 外用户确认；壳来源（受信）直通。读操作放行。
 */

import { ipcMain, BrowserWindow } from 'electron';
import type { WebContents } from 'electron';
import { fileService } from '../../services/file-service.js';
import { guardPoolWrite } from '../../services/filesystem-guard.js';
import type { WindowManager } from '../../windows/window-manager.js';
import { IPC, filesystemChanged } from '../channels.js';

// E5.7#36：壳崩重建复用本函数——引用始终刷新（watcher 广播回调读模块引用），IPC 通道只注册一次
let _windowManager: WindowManager | undefined;
let _registered = false;

/** E5.7#63.5：sender 是否池渲染进程——守卫只对插件沙箱边界生效；windowManager 缺失按不受信处理（安全方向） */
function isPoolSender(sender: WebContents): boolean {
  if (!_windowManager) return true;
  return _windowManager.getAllPoolViews().some((v) => !v.webContents.isDestroyed() && v.webContents === sender);
}

// E5#80：windowManager 用于广播文件变更到所有插件 WebView
export function registerFileHandlers(windowManager?: WindowManager): void {
  _windowManager = windowManager;
  if (_registered) return;
  _registered = true;
  // ── 路径 ──

  ipcMain.handle(IPC.path.appDataDir, () => {
    return fileService.appDataDir();
  });

  ipcMain.handle(IPC.path.join, (_event, ...parts: string[]) => {
    return fileService.join(...parts);
  });

  // ── 文件 I/O ──

  ipcMain.handle(IPC.filesystem.readTextFile, async (_event, filePath: string) => {
    return fileService.readTextFile(filePath);
  });

  ipcMain.handle(IPC.filesystem.writeTextFile, async (event, filePath: string, data: string) => {
    await guardPoolWrite(event.sender, isPoolSender(event.sender), filePath, 'writeTextFile');
    await fileService.writeTextFile(filePath, data);
  });

  ipcMain.handle(IPC.filesystem.exists, (_event, filePath: string) => {
    return fileService.exists(filePath);
  });

  ipcMain.handle(IPC.filesystem.createDir, async (event, dirPath: string) => {
    await guardPoolWrite(event.sender, isPoolSender(event.sender), dirPath, 'createDir', true);
    await fileService.createDir(dirPath);
  });

  ipcMain.handle(IPC.filesystem.readdir, async (_event, dirPath: string) => {
    return fileService.readdir(dirPath);
  });

  ipcMain.handle(IPC.filesystem.copy, async (event, src: string, dest: string) => {
    // src 是读侧放行——守卫只查写侧 dest
    await guardPoolWrite(event.sender, isPoolSender(event.sender), dest, 'copy');
    await fileService.copy(src, dest);
  });

  ipcMain.handle(IPC.filesystem.remove, async (event, dirPath: string) => {
    await guardPoolWrite(event.sender, isPoolSender(event.sender), dirPath, 'remove');
    await fileService.remove(dirPath);
  });

  // ── E2c #13 新增：listDir / readBinaryFile / watch ──

  ipcMain.handle(IPC.filesystem.listDir, async (_event, dirPath: string) => {
    return fileService.listDir(dirPath);
  });

  ipcMain.handle(IPC.filesystem.readBinaryFile, async (_event, filePath: string) => {
    return fileService.readBinaryFile(filePath);
  });

  // E4V#40w——GBK 编码保存
  ipcMain.handle(IPC.filesystem.writeBinaryFile, async (event, filePath: string, data: Buffer) => {
    await guardPoolWrite(event.sender, isPoolSender(event.sender), filePath, 'writeBinaryFile');
    await fileService.writeBinaryFile(filePath, data);
  });

  // E4V#fix: 每个 watcher 独立 IPC 通道——文件树和快捷键系统不再共享 filesystem:changed
  ipcMain.handle(IPC.filesystem.watch, (event, dirPath: string) => {
    const watcherId = fileService.watch(dirPath, (change) => {
      if (event.sender.isDestroyed()) return;
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        win.webContents.send(filesystemChanged(watcherId), change);
      }
      // E5#80 + E5.7#43：广播文件变更到唯一 Pool WebView（per-tab 实例循环已删——
      // 修复潜伏 bug：池内文件树 watcher 此前收不到任何变更）
      if (_windowManager) {
        for (const poolView of _windowManager.getAllPoolViews()) {
          if (!poolView.webContents.isDestroyed()) {
            poolView.webContents.send(filesystemChanged(watcherId), change);
          }
        }
      }
    });
    return watcherId;
  });

  ipcMain.handle(IPC.filesystem.unwatch, (_event, watcherId: number) => {
    fileService.unwatchFile(watcherId);
  });
}
