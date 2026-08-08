/**
 * 插件视图管理 IPC 处理器——壳渲染进程 → 主进程 PluginViewRegistry
 *
 * E3f #58c：多 WebView 渲染——plugin-view:create 加载真实 React 页面（取代 #58a 占位 HTML）。
 * 每个函数对应一个 ipcMain.handle() 通道。
 */

import { app, ipcMain, BrowserWindow } from 'electron';
import type { PluginViewRegistry, ViewBounds } from '../plugin-view-registry.js';
import { DEV_SERVER_URL } from '../../shared/constants.js'; // E5#102b

let _registry: PluginViewRegistry | null = null;
let _mainWindow: BrowserWindow | null = null;

export function registerPluginViewHandlers(registry: PluginViewRegistry, mainWindow: BrowserWindow): void {
  _registry = registry;
  _mainWindow = mainWindow;

  ipcMain.handle('plugin-view:setVisible', (_event, pluginId: string, visible: boolean) => {
    _registry?.setVisible(pluginId, visible);
    // E5.5#7 Bug B fix：WebView 变为可见后转移键盘焦点——与 setVisible 同 handler，同步执行无竞态
    if (visible) {
      _registry?.getView(pluginId)?.webContents.focus();
    }
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

  // E5.5#7 Bug B fix：聚焦插件 WebView——切换标签页后转移键盘焦点
  ipcMain.handle('plugin-view:focus', (_event, pluginId: string) => {
    const view = _registry?.getView(pluginId);
    view?.webContents.focus();
  });

  // E5.5#3c：保活宽限期——关闭标签页时不立即销毁，60s 内重开可复用
  ipcMain.handle('plugin-view:scheduleDestroy', (_event, pluginId: string) => {
    _registry?.scheduleDestroy(pluginId);
  });
  ipcMain.handle('plugin-view:cancelDestroy', (_event, pluginId: string) => {
    return _registry?.cancelDestroy(pluginId) ?? false;
  });

  // E3f #58c：创建插件 WebView——加载 plugin-view.html（React 自举页面）
  ipcMain.handle('plugin-view:create', (_event, pluginId: string) => {
    const isDev = !app.isPackaged;
    const url = isDev
      ? `${DEV_SERVER_URL}/plugin-view.html?plugin-view=${pluginId}`
      // 生产环境通过 linkdesk:// 协议加载（需确保 dist/plugin-view.html 已构建并部署到协议映射的路径）
      : `linkdesk://${pluginId}/plugin-view.html?plugin-view=${pluginId}`;
    _registry?.registerPlugin(pluginId, url);
  });

  // #58e 修复：插件 WebView 渲染完成通知——主进程转发到壳窗口
  ipcMain.on('plugin-view:ready', (_event, pluginId: string) => {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send('plugin-view:ready', pluginId);
    }
  });

  console.log('[plugin-view-handlers] 已注册 8 个 IPC handler');
}
