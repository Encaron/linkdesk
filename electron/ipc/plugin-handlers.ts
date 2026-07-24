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

  // 安装插件
  ipcMain.handle('plugins:install', async (_event, source: string) => {
    return pluginFileService.installPlugin(source);
  });

  // 卸载插件
  ipcMain.handle('plugins:uninstall', async (_event, pluginId: string) => {
    await pluginFileService.uninstallPlugin(pluginId);
  });

  // 重装插件
  ipcMain.handle('plugins:reinstall', async (_event, pluginId: string) => {
    await pluginFileService.reinstallPlugin(pluginId);
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
