/**
 * 插件视图管理 IPC 处理器——壳渲染进程 → 主进程 PluginViewRegistry
 *
 * E3f #58c：多 WebView 渲染——plugin-view:create 加载真实 React 页面（取代 #58a 占位 HTML）。
 * 每个函数对应一个 ipcMain.handle() 通道。
 */

import { app, ipcMain, BrowserWindow } from 'electron';
import type { PluginViewRegistry, ViewBounds } from '../plugin-view-registry.js';

let _registry: PluginViewRegistry | null = null;
let _mainWindow: BrowserWindow | null = null;

export function registerPluginViewHandlers(registry: PluginViewRegistry, mainWindow: BrowserWindow): void {
  _registry = registry;
  _mainWindow = mainWindow;

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

  // E3f #58d：销毁插件 WebView——插件卸载/注销时调用
  ipcMain.handle('plugin-view:destroy', (_event, pluginId: string) => {
    _registry?.unregisterPlugin(pluginId);
  });

  // E3f #58c：创建插件 WebView——加载 plugin-view.html（React 自举页面）
  ipcMain.handle('plugin-view:create', (_event, pluginId: string) => {
    const isDev = !app.isPackaged;
    const url = isDev
      ? `http://localhost:1420/plugin-view.html?plugin-view=${pluginId}`
      // 生产环境通过 linkdesk:// 协议加载（需确保 dist/plugin-view.html 已构建并部署到协议映射的路径）
      : `linkdesk://${pluginId}/plugin-view.html?plugin-view=${pluginId}`;
    _registry?.registerPlugin(pluginId, url);
  });

  // #58e 修复：插件 WebView 渲染完成通知——主进程转发到壳窗口
  ipcMain.on('plugin-view:ready', (_event, pluginId: string) => {
    // E5#10a：诊断——追踪主进程是否收到 ready 信号并成功转发
    console.log(`[E5#10a-main] received plugin-view:ready for "${pluginId}", _mainWindow=${!!_mainWindow}, destroyed=${_mainWindow?.isDestroyed()}`);
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send('plugin-view:ready', pluginId);
      console.log(`[E5#10a-main] forwarded to shell window`);
    } else {
      console.warn(`[E5#10a-main] ⚠️ NOT forwarded — _mainWindow missing or destroyed`);
    }
  });

  console.log('[plugin-view-handlers] 已注册 7 个 IPC handler');
}
