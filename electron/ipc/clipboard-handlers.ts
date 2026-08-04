/**
 * 剪贴板 IPC 处理器。
 * E5#29a：补 clipboard:readText / clipboard:writeText——preload-plugin 已暴露但主进程缺 handler。
 */

import { ipcMain, clipboard } from 'electron';

export function registerClipboardHandlers(): void {
  ipcMain.handle('clipboard:readText', () => {
    return clipboard.readText();
  });

  ipcMain.handle('clipboard:writeText', (_event, text: string) => {
    clipboard.writeText(text);
  });
}
