/**
 * 环境信息 IPC 处理器。
 * E2c #13b：暴露 appDataDir + pluginDataDir 到渲染进程。
 */

import { ipcMain } from 'electron';
import { envService } from '../../services/env-service.js';
import { IPC } from '../channels.js';

// E5.7#36：壳崩重建复用本函数——无状态 handler，IPC 通道只注册一次
let _registered = false;

export function registerEnvHandlers(): void {
  if (_registered) return;
  _registered = true;
  ipcMain.handle(IPC.env.get, (_event, pluginId?: string) => {
    return {
      appDataDir: envService.appDataDir(),
      pluginsRootDir: envService.pluginsRootDir(),
      appPluginsDir: envService.appPluginsDir(),
      pluginDataDir: pluginId ? envService.pluginDataDir(pluginId) : undefined,
      pluginCacheDir: pluginId ? envService.pluginCacheDir(pluginId) : undefined,
      pluginExportsDir: pluginId ? envService.pluginExportsDir(pluginId) : undefined,
    };
  });
}
