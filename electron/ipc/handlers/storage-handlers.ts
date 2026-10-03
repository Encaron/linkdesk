/**
 * 存储 IPC 处理器——「打开缓存目录」设置行（04-软件更新/待抉择池/设置页-打开缓存目录 3.3）。
 * 对标 appearance:reveal-storage（E5.8#153）：主进程解析路径并 openPath 开**目录内容**，
 * 池内零路径知识；目录缺省也建（打开即见存储位置，空目录同样合法）；openPath 失败 fail-loud 抛错。
 *
 * 🔴 缓存目录的**唯一解析点**（落点契约铁律 3：任何地方不许存第二份路径）——
 *   生效路径 = settings.json 的 `app.storage.cacheDir`（非空字符串），否则 = userData 默认位
 *   （读盘直答，对标 theme-seed 的 settings.json 平键读取；本轮软件内没有改地址的口子，
 *   值恒空 ⇒ 恒走默认位，但解析按契约写全，将来安装器播种/改址无需动这里）。
 * 依赖方向：storage-handlers → electron/ipc（channels）+ services/file-service；无反向。
 */

import { ipcMain, shell } from 'electron';
import { IPC } from '../channels.js';
import { fileService } from '../../services/file-service.js';

// E5.7#36：壳崩重建复用本函数——无状态 handler，IPC 通道只注册一次
let _registered = false;

/** 当前生效缓存目录——settings.json 平键 `app.storage.cacheDir`（空/缺/读不动 = userData 默认位） */
async function resolveEffectiveCacheDir(): Promise<string> {
  const fallback = fileService.appDataDir();
  try {
    const raw = await fileService.readTextFile(fileService.join(fallback, 'settings.json'));
    const settings = JSON.parse(raw) as Record<string, unknown>;
    const v = settings['app.storage.cacheDir'];
    return typeof v === 'string' && v.trim() !== '' ? v : fallback;
  } catch {
    return fallback; // 没有 settings.json / 读不动 = 默认位（首次启动常态，不是错误）
  }
}

export function registerStorageHandlers(): void {
  if (_registered) return;
  _registered = true;

  // 只读读数——设置页「存储」只读路径行（statusCommand storage.cacheDirStatus）的数据源
  ipcMain.handle(IPC.storage.cacheDir, async () => {
    return resolveEffectiveCacheDir();
  });

  // 打开缓存目录——先建目录再 openPath（目录可能尚未建出，⛔ 不弹"找不到"），非模态
  ipcMain.handle(IPC.storage.revealCache, async () => {
    const dir = await resolveEffectiveCacheDir();
    await fileService.createDir(dir);
    const err = await shell.openPath(dir);
    if (err) {
      throw new Error(`打开缓存目录失败: ${err}`);
    }
  });
}
