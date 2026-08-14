/**
 * Pool 视图管理 IPC 处理器——壳渲染进程 ↔ 主进程 WindowManager（E5.7 极简Pool）
 *
 * E5.6#8d → E5.7#4：注册单Pool IPC handler——壳↔池通信通道。
 * E5.7#43（Phase 10）：registerPluginViewHandlers 整删——per-tab 插件视图 IPC
 * （plugin-view:create/destroy/setVisible 等 14 通道）随 PluginViewRegistry 消亡。
 * 唯一 WCV，无 zone 路由——poolId 概念全程不出现。
 */

import { app, ipcMain, BrowserWindow } from 'electron';
import type { WindowManager } from '../window-manager.js'; // E5.6#8d

let _mainWindow: BrowserWindow | null = null;
let _windowManager: WindowManager | null = null;
// E5.7#36：壳崩重建复用本函数——引用始终刷新（handler 闭包运行时读），IPC 通道只注册一次
let _poolHandlersRegistered = false;

/**
 * E5.6#8d → E5.7#4：注册单Pool IPC handler——壳↔池通信通道。
 * E5.7 极简Pool：唯一 WCV，无 zone 路由——poolId 概念全程不出现。
 */
export function registerPoolHandlers(windowManager: WindowManager, mainWindow: BrowserWindow): void {
  _windowManager = windowManager;
  _mainWindow = mainWindow;
  if (_poolHandlersRegistered) return;
  _poolHandlersRegistered = true;

  // 壳→Pool：推送布局快照——单 WCV 直推（E5.7#4）
  ipcMain.on('pool:push-layout', (_event, layout: unknown) => {
    _windowManager?.pushLayout(layout);
  });

  // Pool→壳：池 React 挂载完成（preload-pool 仍带 zone='' 发送——inert 参数，链路不变）
  ipcMain.on('pool:ready', (_event, zone: string) => {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send('pool:ready', zone);
    }
    console.log('[pool-handlers] Pool 就绪');
  });

  // E5.6#9 → E5.7#4：壳→Pool：切换 Pool DevTools——调试用
  ipcMain.on('pool:toggleDevTools', () => {
    if (app.isPackaged) return;
    const poolView = _windowManager?.getPoolView();
    if (poolView && !poolView.webContents.isDestroyed()) {
      if (poolView.webContents.isDevToolsOpened()) {
        poolView.webContents.closeDevTools();
      } else {
        poolView.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });

  // E5.6#11i：Pool→壳——侧栏写操作（reorder/setCollapsed/setVisible）。
  // 池组件通过 pool.sidebarAction() 发送，主进程转发到壳窗口。
  // 壳侧 preload 接收后调 ViewContainerService 方法。
  ipcMain.on('pool:sidebar-action', (_event, action: unknown) => {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send('pool:sidebar-action', action);
    }
  });

  // E5.6#16.5：Pool→壳——主区 tab 操作（切标签/关闭/拖拽排序/分屏/右键菜单等）。
  // 池组件通过 pool.tabAction() 发送，主进程转发到壳窗口。
  // 壳侧 preload 接收后调 useTabManager 方法。
  ipcMain.on('pool:tab-action', (_event, action: unknown) => {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send('pool:tab-action', action);
    }
  });

  // E5.7#15：壳→Pool——QuickPick 哑渲染数据（聪慧→哑：壳序列化 DTO，池纯渲染）
  ipcMain.on('pool:quickpick-show', (_event, data: unknown) => {
    _windowManager?.pushQuickPick(data);
  });

  // E5.7#15：Pool→壳——QuickPick 动作（select/highlight/close/itemAction），按 key 回传
  ipcMain.on('pool:quickpick-action', (_event, action: unknown) => {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send('pool:quickpick-action', action);
    }
  });

  // E5.7#16：壳→Pool——Toast 哑渲染数据（聪慧→哑：壳序列化 DTO，池纯渲染）
  ipcMain.on('pool:toast-show', (_event, data: unknown) => {
    _windowManager?.pushToast(data);
  });

  // E5.7#16：Pool→壳——Toast 动作（dismiss/action），按 id + actionId 回传
  ipcMain.on('pool:toast-action', (_event, action: unknown) => {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send('pool:toast-action', action);
    }
  });

  // E5.7#17：壳→Pool——Dialog 哑渲染数据（聪慧→哑：壳序列化 DTO，池纯渲染）
  ipcMain.on('pool:dialog-show', (_event, data: unknown) => {
    _windowManager?.pushDialog(data);
  });

  // E5.7#17：Pool→壳——Dialog 动作（confirm/cancel），壳侧 settle Promise
  ipcMain.on('pool:dialog-action', (_event, action: unknown) => {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send('pool:dialog-action', action);
    }
  });

  // E5.7#12.5：pool:set-bounds 已死链删除——bounds 换主进程（window-manager syncPoolBounds）
  console.log('[pool-handlers] 已注册 11 个 pool IPC handler（pool:push-layout / pool:ready / pool:toggleDevTools / pool:sidebar-action / pool:tab-action / pool:quickpick-show / pool:quickpick-action / pool:toast-show / pool:toast-action / pool:dialog-show / pool:dialog-action）');
}
