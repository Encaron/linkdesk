/**
 * 环境信息 IPC 处理器。
 * E2c #13b：暴露 appDataDir + pluginDataDir 到渲染进程。
 */

import { ipcMain } from 'electron';
import { envService } from '../../services/env-service.js';
import { machineFingerprint } from '../../services/machine-fingerprint.js';
import { IPC } from '../channels.js';

// E5.7#36：壳崩重建复用本函数——无状态 handler，IPC 通道只注册一次
let _registered = false;

export function registerEnvHandlers(): void {
  if (_registered) return;
  _registered = true;
  ipcMain.handle(IPC.env.get, async (_event, pluginId?: string) => {
    return {
      appDataDir: envService.appDataDir(),
      pluginsRootDir: envService.pluginsRootDir(),
      appPluginsDir: envService.appPluginsDir(),
      // E6#7（1.2-4）：用户安装包代码根——.linkdesk-plugin 解压家（loader/PluginInstallService 读家）
      userPluginsDir: envService.userPluginsDir(),
      pluginDataDir: pluginId ? envService.pluginDataDir(pluginId) : undefined,
      pluginCacheDir: pluginId ? envService.pluginCacheDir(pluginId) : undefined,
      pluginExportsDir: pluginId ? envService.pluginExportsDir(pluginId) : undefined,
      // R4-1.3（I21）：机器指纹——许可验签机器绑定比对源（模块级缓存：进程内只算一次）
      machineFingerprint: await machineFingerprint(),
    };
  });
}
