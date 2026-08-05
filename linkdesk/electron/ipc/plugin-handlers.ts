/**
 * 插件管理 IPC 处理器
 *
 * E1 步 3：对标 Tauri Rust plugins.rs 的全部 7 个 #[tauri::command]。
 * 每个 Rust 命令 → 一个 ipcMain.handle('plugins:*') 处理器。
 */

import { ipcMain } from 'electron';
import { pluginFileService } from '../services/plugin-file-service.js';

export function registerPluginHandlers(): void {
  // 列出插件目录
  ipcMain.handle('plugins:listDirs', async () => {
    return pluginFileService.listPluginDirs();
  });

  // 读取 plugin.json
  ipcMain.handle('plugins:readManifest', async (_event, pluginId: string) => {
    return pluginFileService.readManifest(pluginId);
  });

  // 解析插件目录绝对路径（Vite /@fs/ 兼容）
  ipcMain.handle('plugins:resolvePath', (_event, pluginId: string) => {
    return pluginFileService.resolvePath(pluginId);
  });
}
