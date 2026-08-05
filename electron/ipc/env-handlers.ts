/**
 * 环境信息 IPC 处理器。
 * E2c #13b：暴露 appDataDir + pluginDataDir 到渲染进程。
 */

import { ipcMain } from 'electron';
import { envService } from '../services/env-service.js';

export function registerEnvHandlers(): void {
  ipcMain.handle('env:get', (_event, pluginId?: string) => {
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
