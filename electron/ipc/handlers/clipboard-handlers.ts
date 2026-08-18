/**
 * 剪贴板 IPC 处理器。
 * E5#29a：补 clipboard:readText / clipboard:writeText。
 * E5#108a：补 clipboard:writeFileList——文件树 Ctrl+C → 系统剪贴板 CF_HDROP。
 */

import { ipcMain, clipboard } from 'electron';
import { IPC } from '../channels.js';

// E5.7#36：壳崩重建复用本函数——无状态 handler，IPC 通道只注册一次
let _registered = false;

export function registerClipboardHandlers(): void {
  if (_registered) return;
  _registered = true;
  ipcMain.handle(IPC.clipboard.readText, () => {
    return clipboard.readText();
  });

  ipcMain.handle(IPC.clipboard.writeText, (_event, text: string) => {
    clipboard.writeText(text);
  });

  // E5#108a：文件列表写入系统剪贴板
  ipcMain.handle(IPC.clipboard.writeFileList, (_event, paths: string[]) => {
    if (!paths || paths.length === 0) return;
    try {
      if (process.platform === 'win32') {
        clipboard.writeBuffer('CF_HDROP', buildCFHDROP(paths));
      } else if (process.platform === 'darwin') {
        clipboard.writeBuffer('NSFilenamesPboardType', Buffer.from(paths.join('\0'), 'utf-8'));
      } else {
        clipboard.writeBuffer('text/uri-list', Buffer.from(paths.map(p => `file://${p}`).join('\n'), 'utf-8'));
      }
    } catch (e) {
      console.error('[clipboard:writeFileList] 失败:', e);
    }
  });
}

/** 构造 Windows DROPFILES 结构——CF_HDROP 二进制格式 */
function buildCFHDROP(paths: string[]): Buffer {
  const DROPFILES_SIZE = 20;
  const header = Buffer.alloc(DROPFILES_SIZE, 0);
  header.writeUInt32LE(DROPFILES_SIZE, 0); // pFiles
  // pt.x(4) pt.y(4) fNC(4) 已为 0
  header.writeUInt32LE(1, 16);            // fWide = 1 (Unicode)

  const parts: Buffer[] = [header];
  for (const p of paths) parts.push(Buffer.from(p + '\0', 'ucs2'));
  parts.push(Buffer.from('\0', 'ucs2')); // double null
  return Buffer.concat(parts);
}
