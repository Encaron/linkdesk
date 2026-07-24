/**
 * 文件系统 IPC 处理器
 *
 * E1 步 3：对标 Tauri @tauri-apps/plugin-fs + @tauri-apps/api/path。
 * 所有文件 I/O 走此入口——E2c 归一化后成为唯一入口。
 */

import { ipcMain } from 'electron';
import { fileService } from '../services/file-service.js';

export function registerFileHandlers(): void {
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

  ipcMain.handle('filesystem:mkdir', async (_event, dirPath: string) => {
    await fileService.mkdir(dirPath);
  });

  ipcMain.handle('filesystem:readdir', async (_event, dirPath: string) => {
    return fileService.readdir(dirPath);
  });

  ipcMain.handle('filesystem:copy', async (_event, src: string, dest: string) => {
    await fileService.copyDir(src, dest);
  });

  ipcMain.handle('filesystem:remove', async (_event, dirPath: string) => {
    await fileService.remove(dirPath);
  });
}
