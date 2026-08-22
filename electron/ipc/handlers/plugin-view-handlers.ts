/**
 * Pool 视图管理 IPC 处理器——壳渲染进程 ↔ 主进程 WindowManager（E5.7 极简Pool）
 *
 * E5.6#8d → E5.7#4：注册单Pool IPC handler——壳↔池通信通道。
 * E5.7#43（Phase 10）：registerPluginViewHandlers 整删——per-tab 插件视图 IPC
 * （plugin-view:create/destroy/setVisible 等 14 通道）随 PluginViewRegistry 消亡。
 * 唯一 WCV，无 zone 路由——poolId 概念全程不出现。
 */

import { app, ipcMain, BrowserWindow } from 'electron';
import type { WindowManager } from '../../windows/window-manager.js'; // E5.6#8d
import { IPC } from '../channels.js';

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
  ipcMain.on(IPC.pool.pushLayout, (_event, layout: unknown) => {
    _windowManager?.pushLayout(layout);
  });

  // Pool→壳：池 React 挂载完成（E5.8#43-1 A3：按 sender 反查 windowId 转发——壳据 windowId 定向推该窗布局）。
  // 主池→'main'，脱出池→脱出窗 id；sender 非注册池来源则兜底 'main'。
  ipcMain.on(IPC.pool.ready, (event) => {
    const windowId = _windowManager?.getWindowIdByWebContents(event.sender) ?? 'main';
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send(IPC.pool.ready, { windowId });
    }
    console.log(`[pool-handlers] Pool 就绪 (windowId=${windowId})`);
  });

  // E5.6#9 → E5.7#4：壳→Pool：切换 Pool DevTools——调试用
  ipcMain.on(IPC.pool.toggleDevTools, () => {
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
  ipcMain.on(IPC.pool.sidebarAction, (_event, action: unknown) => {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send(IPC.pool.sidebarAction, action);
    }
  });

  // E5.6#16.5：Pool→壳——主区 tab 操作（切标签/关闭/拖拽排序/分屏/右键菜单等）。
  // 池组件通过 pool.tabAction() 发送，主进程转发到壳窗口。
  // 壳侧 preload 接收后调 useTabManager 方法。
  ipcMain.on(IPC.pool.tabAction, (_event, action: unknown) => {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send(IPC.pool.tabAction, action);
    }
  });

  // E5.7#15：壳→Pool——QuickPick 哑渲染数据（聪慧→哑：壳序列化 DTO，池纯渲染）
  ipcMain.on(IPC.pool.quickpickShow, (_event, data: unknown) => {
    _windowManager?.pushQuickPick(data);
  });

  // E5.7#15：Pool→壳——QuickPick 动作（select/highlight/close/itemAction），按 key 回传
  ipcMain.on(IPC.pool.quickpickAction, (_event, action: unknown) => {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send(IPC.pool.quickpickAction, action);
    }
  });

  // E5.7#16：壳→Pool——Toast 哑渲染数据（聪慧→哑：壳序列化 DTO，池纯渲染）
  ipcMain.on(IPC.pool.toastShow, (_event, data: unknown) => {
    _windowManager?.pushToast(data);
  });

  // E5.7#16：Pool→壳——Toast 动作（dismiss/action），按 id + actionId 回传
  ipcMain.on(IPC.pool.toastAction, (_event, action: unknown) => {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send(IPC.pool.toastAction, action);
    }
  });

  // E5.7#17：壳→Pool——Dialog 哑渲染数据（聪慧→哑：壳序列化 DTO，池纯渲染）
  ipcMain.on(IPC.pool.dialogShow, (_event, data: unknown) => {
    _windowManager?.pushDialog(data);
  });

  // E5.7#17：Pool→壳——Dialog 动作（confirm/cancel），壳侧 settle Promise
  ipcMain.on(IPC.pool.dialogAction, (_event, action: unknown) => {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send(IPC.pool.dialogAction, action);
    }
  });

  // E5.8#37（Phase 8 类型 B）：壳→Pool——悬浮面板哑渲染数据（聪慧→哑：壳序列化 DTO，池纯渲染）
  ipcMain.on(IPC.pool.floatingPanelShow, (_event, data: unknown) => {
    _windowManager?.pushFloatingPanel(data);
  });

  // E5.8#37：Pool→壳——悬浮面板动作（open-in/close 按 actionId），壳侧 settle
  ipcMain.on(IPC.pool.floatingPanelAction, (_event, action: unknown) => {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send(IPC.pool.floatingPanelAction, action);
    }
  });

  // E5.8#43-1（A4）：壳→主——创建脱出池窗（壳驱动：壳生成 windowId + bounds，主进程只执行窗口+池生命周期）
  ipcMain.on(IPC.pool.createWindow, (_event, opts: { windowId: string; width?: number; height?: number; x?: number; y?: number }) => {
    if (!opts?.windowId) {
      console.error('[pool-handlers] createWindow 缺 windowId');
      return;
    }
    _windowManager?.createPoolWindow(opts);
  });

  // E5.8#43-1（A4）：壳→主——关闭脱出池窗（空窗自灭/并回主窗口销毁；tab 归属已由壳先行处理）
  ipcMain.on(IPC.pool.closeWindow, (_event, windowId: string) => {
    _windowManager?.closePoolWindow(windowId);
  });

  // E5.7#12.5：pool:set-bounds 已死链删除——bounds 换主进程（window-manager syncPoolBounds）
  console.log('[pool-handlers] 已注册 15 个 pool IPC handler（pool:push-layout / pool:ready / pool:toggleDevTools / pool:sidebar-action / pool:tab-action / pool:quickpick-show / pool:quickpick-action / pool:toast-show / pool:toast-action / pool:dialog-show / pool:dialog-action / pool:floating-panel-show / pool:floating-panel-action / pool:create-window / pool:close-window）');
}
