/**
 * 对话框 IPC 处理器
 *
 * E1 步 4：对标 Tauri @tauri-apps/plugin-dialog。
 * 提供文件/文件夹选择对话框。
 */

import { dialog, ipcMain } from 'electron';
import { IPC } from '../channels.js';
// E5.7#97：DialogOpenOptions 归口 src/core/types/ipc/dialogs.ts（与 linkdesk-api 同源——原双份手工对齐）
import type { DialogOpenOptions } from '../../../src/core/types/ipc/dialogs';

// E5.7#36：壳崩重建复用本函数——无状态 handler，IPC 通道只注册一次
let _registered = false;

export function registerDialogHandlers(): void {
  if (_registered) return;
  _registered = true;
  // 打开选择对话框（文件或目录）——对标 Tauri dialog.open()
  ipcMain.handle(IPC.dialog.open, async (_event, options?: DialogOpenOptions) => {
    const result = await dialog.showOpenDialog({
      title: options?.title ?? (options?.directory ? '选择目录' : '选择文件'),
      filters: options?.filters,
      properties: options?.directory ? ['openDirectory'] : ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
}
