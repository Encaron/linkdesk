/**
 * 插件管理 IPC 处理器
 *
 * E1 步 3：对标 Tauri Rust plugins.rs 的全部 7 个 #[tauri::command]。
 * 每个 Rust 命令 → 一个 ipcMain.handle('plugins:*') 处理器。
 */

import { app, ipcMain } from 'electron';
import { pluginFileService } from '../../services/plugin-file-service.js';
import { loadProduct } from '../../product.js';
import { IPC } from '../channels.js';
// E6#117：兼容读数——状态算法单点在 src/core/compat/（主进程编译内；渲染/插件零复算）
import { computeCompatibilityReading } from '../../../src/core/compat/compatibility.js';
import { parseManifestJson } from '../../../src/pluginLoader/jsonc.js';
import type { PluginCompatibilityRequest } from '../../../src/core/api/linkdesk-api/types.js';

// E5.7#36：壳崩重建复用本函数——无状态 handler，IPC 通道只注册一次
let _registered = false;

export function registerPluginHandlers(): void {
  if (_registered) return;
  _registered = true;
  // 列出插件目录
  ipcMain.handle(IPC.plugins.listDirs, async () => {
    return pluginFileService.listPluginDirs();
  });

  // 读取 plugin.json
  ipcMain.handle(IPC.plugins.readManifest, async (_event, pluginId: string) => {
    return pluginFileService.readManifest(pluginId);
  });

  // E6#9a：全量发现——[{ pluginId, entry, manifest }]（替代渲染进程 import.meta.glob）
  ipcMain.handle(IPC.plugins.listAll, async () => {
    return pluginFileService.listAllPlugins();
  });

  // E6#9c：全量 manifest——Record<pluginId, PluginManifest>（pluginManifests glob 的 IPC 替代）
  ipcMain.handle(IPC.plugins.readAllManifests, async () => {
    return pluginFileService.readAllPluginManifests();
  });

  // 列出 .disabled/ 目录中的已卸载插件（E5.6#16.7k——启动时扫描并缓存元数据）
  ipcMain.handle(IPC.plugins.listDisabledDirs, async () => {
    return pluginFileService.listDisabledPluginDirs();
  });

  // 解析插件目录绝对路径（Vite /@fs/ 兼容）
  ipcMain.handle(IPC.plugins.resolvePath, (_event, pluginId: string) => {
    return pluginFileService.resolvePath(pluginId);
  });

  // E6#7（1.2-4）：解析插件入口（resolvePath 的兄弟，discovery 族）——{ root, entry, bundle }
  ipcMain.handle(IPC.plugins.resolveEntry, async (_event, pluginId: string) => {
    return pluginFileService.resolveEntry(pluginId);
  });

  // E6#117：兼容读数（只读，main 直答；同 product-handlers 的 env:get 直答先例——不进 PROXY_CHANNELS）
  ipcMain.handle(IPC.plugins.getCompatibility, async (_event, req: PluginCompatibilityRequest) => {
    // 生效 minAppVersion = 加载器执法的那份：已装插件以磁盘 manifest 覆盖调用方供给（未装才吃 catalog）
    let minAppVersion = typeof req?.minAppVersion === 'string' ? req.minAppVersion : null;
    if (pluginFileService.locateDir(req.pluginId)) {
      try {
        minAppVersion = parseManifestJson(await pluginFileService.readManifest(req.pluginId)).minAppVersion ?? null;
      } catch {
        // manifest 读不了 ⇒ 保留调用方供给值（compute 端 null 语义照走，不猜）
      }
    }
    return computeCompatibilityReading(
      { ...req, minAppVersion },
      {
        shellVersion: app.getVersion(),
        shellBuiltAtRaw: loadProduct().date,
        locatePluginDir: (id) => pluginFileService.locateDir(id),
      },
    );
  });
}
