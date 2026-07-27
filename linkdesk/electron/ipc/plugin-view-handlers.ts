/**
 * 插件视图管理 IPC 处理器——壳渲染进程 → 主进程 PluginViewRegistry
 *
 * E3a #29：壳侧 MainContent 通过 IPC 控制插件 WebContentView 的显隐和位置。
 * 每个函数对应一个 ipcMain.handle() 通道。
 */

import { ipcMain } from 'electron';
import type { PluginViewRegistry, ViewBounds } from '../plugin-view-registry.js';

let _registry: PluginViewRegistry | null = null;

export function registerPluginViewHandlers(registry: PluginViewRegistry): void {
  _registry = registry;

  ipcMain.handle('plugin-view:setVisible', (_event, pluginId: string, visible: boolean) => {
    _registry?.setVisible(pluginId, visible);
  });

  ipcMain.handle('plugin-view:setBounds', (_event, pluginId: string, bounds: ViewBounds) => {
    _registry?.setBounds(pluginId, bounds);
  });

  ipcMain.handle('plugin-view:getAllIds', () => {
    return _registry?.getAllPluginIds() ?? [];
  });

  // E3f #58：切换插件 DevTools
  ipcMain.handle('plugin-view:toggleDevTools', (_event, pluginId: string) => {
    _registry?.toggleDevTools?.(pluginId);
  });

  console.log('[plugin-view-handlers] 已注册 4 个 IPC handler');
}
