/**
 * 外观资产 IPC 处理器——E5.8#50.11：选择图片拷贝入库（受控来源）。
 * 对标 getAssetPath 受控来源：用户对话框任选路径不能 file:// 直读（Electron 安全模型）——
 * importImage 把源文件拷贝进 userData/appearance/（重名去重），返回受控路径供 app.backgroundImage 持久化。
 * 依赖方向：appearance-handlers → electron/ipc（channels）+ services/file-service；无反向。
 */

import { ipcMain } from 'electron';
import * as path from 'path';
import { IPC } from '../channels.js';
import { fileService } from '../../services/file-service.js';

// E5.7#36：壳崩重建复用本函数——无状态 handler，IPC 通道只注册一次
let _registered = false;

export function registerAppearanceHandlers(): void {
  if (_registered) return;
  _registered = true;

  // 源路径 → userData/appearance/<名> 拷贝（重名追加 -N 去重）→ 返回受控路径
  ipcMain.handle(IPC.appearance.importImage, async (_event, sourcePath: string) => {
    if (!sourcePath || typeof sourcePath !== 'string') {
      throw new Error('importImage: 源路径为空');
    }
    const s = await fileService.stat(sourcePath).catch(() => null);
    if (!s || !s.isFile) {
      throw new Error(`importImage: 源不是文件——${sourcePath}`);
    }

    const dir = fileService.join(fileService.appDataDir(), 'appearance');
    await fileService.createDir(dir);

    const base = path.basename(sourcePath);
    const ext = path.extname(base);
    const stem = path.basename(base, ext);
    let dest = fileService.join(dir, base);
    for (let i = 1; fileService.exists(dest); i++) {
      dest = fileService.join(dir, `${stem}-${i}${ext}`);
    }

    await fileService.copy(sourcePath, dest);
    return dest;
  });
}
