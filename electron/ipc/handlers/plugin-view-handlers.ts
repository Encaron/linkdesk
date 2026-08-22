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

  // 壳→Pool：推送布局快照——按 windowId 定向（缺省 'main'，E5.7#4 单 WCV 直推；E5.8#43-2 脱出窗按 id 推送）
  ipcMain.on(IPC.pool.pushLayout, (_event, layout: unknown, windowId?: string) => {
    _windowManager?.pushLayout(layout, windowId);
  });

  // Pool→壳：池 React 挂载完成（E5.8#43-1 A3：按 sender 反查 windowId 转发——壳据 windowId 定向推该窗布局）。
  // 主池→'main'，脱出池→脱出窗 id；sender 非注册池来源则兜底 'main'。
  ipcMain.on(IPC.pool.ready, (event) => {
    const windowId = _windowManager?.getWindowIdByWebContents(event.sender) ?? 'main';
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send(IPC.pool.ready, { windowId });
    }
    // E5.8#44-B：补推窗口 bounds——主窗启动时壳注册表 bounds 恒缺（moved/resized 上报只在用户移动后触发），
    // TabBar 命中检测需权威 bounds（视口 rect 转 screen 坐标）。脱出窗 created 已带 bounds，同样幂等补推。
    _windowManager?.pushWindowBounds(windowId);
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
  // E5.8#44-B：按 sender 反查 windowId 注入 sourceWindowId（#43-4 权威窗口身份——池永远不知自身
  // windowId）。壳读 sourceWindowId 判源窗（releaseOutsideWindow 拖出源 / detach 同窗不并）。
  ipcMain.on(IPC.pool.tabAction, (event, action: unknown) => {
    const sourceWindowId = _windowManager?.getWindowIdByWebContents(event.sender) ?? 'main';
    const shellAction = typeof action === 'object' && action !== null ? { ...action, sourceWindowId } : action;
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send(IPC.pool.tabAction, shellAction);
    }
  });

  // E5.8#44-B：池→壳——TabBar viewport rects 上报（吸附/释放并窗命中检测数据源）。
  // 池组件 pool.tabBarRects(rects) 发送，主进程按 sender 解析 windowId 附上转发壳——
  // 窗口 bounds 壳已掌握（onWindowBoundsChanged），视口 rect 转 screen 坐标壳做（bounds.x + rect.left）。
  ipcMain.on(IPC.pool.tabBarRects, (event, rects: unknown) => {
    const windowId = _windowManager?.getWindowIdByWebContents(event.sender) ?? 'main';
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send(IPC.pool.tabBarRects, { windowId, rects });
    }
  });

  // E5.8#44-C：池→壳——拖拽位置上报（拎起后 mousemove 全程——吸附命中检测数据源）。
  // 池组件 pool.dragPosition(pos) 发送，主进程按 sender 解析 sourceWindowId 附上转发壳——
  // 壳排除源窗命中（窗内拖拽 = 非跨窗吸附，天然清提示）；窗外命中目标窗 TabBar → 下发高亮。
  ipcMain.on(IPC.pool.dragPosition, (event, pos: unknown) => {
    const sourceWindowId = _windowManager?.getWindowIdByWebContents(event.sender) ?? 'main';
    const shellPos = typeof pos === 'object' && pos !== null ? { ...pos, sourceWindowId } : pos;
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send(IPC.pool.dragPosition, shellPos);
    }
  });

  // E5.8#44-C：壳→池——吸附提示（目标窗 TabBar 高亮/清除）——按 windowId 定向推送（targetWindowId 壳命中解析）。
  ipcMain.on(IPC.pool.adsorbHint, (_event, hint: unknown, windowId: string) => {
    _windowManager?.pushAdsorbHint(hint, windowId);
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
  console.log('[pool-handlers] 已注册 18 个 pool IPC handler（pool:push-layout / pool:ready / pool:toggleDevTools / pool:sidebar-action / pool:tab-action / pool:tabbar-rects / pool:drag-position / pool:adsorb-hint / pool:quickpick-show / pool:quickpick-action / pool:toast-show / pool:toast-action / pool:dialog-show / pool:dialog-action / pool:floating-panel-show / pool:floating-panel-action / pool:create-window / pool:close-window）');
}
