/**
 * 对话框 IPC 处理器
 *
 * E1 步 4：对标 Tauri @tauri-apps/plugin-dialog。
 * 提供文件/文件夹选择对话框。
 */

import { dialog, ipcMain } from 'electron';

export function registerDialogHandlers(): void {
  // 打开选择对话框（文件或目录）——对标 Tauri dialog.open()
  ipcMain.handle('dialog:open', async (_event, options?: {
    title?: string;
    directory?: boolean;
    filters?: { name: string; extensions: string[] }[];
  }) => {
    const result = await dialog.showOpenDialog({
      title: options?.title ?? (options?.directory ? '选择目录' : '选择文件'),
      filters: options?.filters,
      properties: options?.directory ? ['openDirectory'] : ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
}
