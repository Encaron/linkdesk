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

  // E3f #58a：创建插件 WebView——占位 HTML，真渲染后续迁移
  ipcMain.handle('plugin-view:create', (_event, pluginId: string) => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Plugin: ${pluginId}</title>
<style>body{background:#1e1e1e;color:#888;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;font-size:14px;margin:0}</style></head>
<body><div>🔌 ${pluginId}</div></body></html>`;
    _registry?.registerPlugin(pluginId, `data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });

  console.log('[plugin-view-handlers] 已注册 5 个 IPC handler');
}
