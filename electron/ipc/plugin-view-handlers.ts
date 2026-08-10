/**
 * 插件视图管理 IPC 处理器——壳渲染进程 → 主进程 PluginViewRegistry
 *
 * E3f #58c：多 WebView 渲染——plugin-view:create 加载真实 React 页面（取代 #58a 占位 HTML）。
 * E5.5#9c：pluginId→instanceId——所有 handler 参数更新，plugin-view:create 多收 pluginId，
 *         URL query params 从 ?plugin-view= 改为 ?pluginId=&instanceId=，
 *         plugin-view:ready 转发 (instanceId, pluginId)。
 *         新增 plugin-view:getInstanceIdsForPlugin。
 * 每个函数对应一个 ipcMain.handle() 通道。
 */

import { app, ipcMain, BrowserWindow } from 'electron';
import type { PluginViewRegistry, ViewBounds } from '../plugin-view-registry.js';
import type { WindowManager } from '../window-manager.js'; // E5.6#8d
import { DEV_SERVER_URL } from '../../shared/constants.js'; // E5#102b

let _registry: PluginViewRegistry | null = null;
let _mainWindow: BrowserWindow | null = null;

export function registerPluginViewHandlers(registry: PluginViewRegistry, mainWindow: BrowserWindow): void {
  _registry = registry;
  _mainWindow = mainWindow;

  ipcMain.handle('plugin-view:setVisible', (_event, instanceId: string, visible: boolean) => {
    _registry?.setVisible(instanceId, visible);
    // E5.5#7 Bug B fix：WebView 变为可见后转移键盘焦点——与 setVisible 同 handler，同步执行无竞态
    if (visible) {
      _registry?.getView(instanceId)?.webContents.focus();
    }
  });

  ipcMain.handle('plugin-view:setBounds', (_event, instanceId: string, bounds: ViewBounds) => {
    _registry?.setBounds(instanceId, bounds);
  });

  ipcMain.handle('plugin-view:getAllIds', () => {
    return _registry?.getAllInstanceIds() ?? [];
  });

  ipcMain.handle('plugin-view:getInstanceIdsForPlugin', (_event, pluginId: string) => {
    return _registry?.getInstanceIdsForPlugin(pluginId) ?? [];
  });

  // E3f #58：切换插件 DevTools
  ipcMain.handle('plugin-view:toggleDevTools', (_event, instanceId: string) => {
    _registry?.toggleDevTools?.(instanceId);
  });

  // E3f #58d：销毁插件 WebView——插件卸载/注销时调用
  ipcMain.handle('plugin-view:destroy', (_event, instanceId: string) => {
    _registry?.unregisterPlugin(instanceId);
  });

  // E5.5#7 Bug B fix：聚焦插件 WebView——切换标签页后转移键盘焦点
  ipcMain.handle('plugin-view:focus', (_event, instanceId: string) => {
    const view = _registry?.getView(instanceId);
    view?.webContents.focus();
  });

  // E5.5#3c：保活宽限期——关闭标签页时不立即销毁，60s 内重开可复用
  ipcMain.handle('plugin-view:scheduleDestroy', (_event, instanceId: string) => {
    _registry?.scheduleDestroy(instanceId);
  });
  ipcMain.handle('plugin-view:cancelDestroy', (_event, instanceId: string) => {
    return _registry?.cancelDestroy(instanceId) ?? false;
  });

  // E5.5#9：宽限期恢复——按 pluginId 查找仍在宽限期内的旧 instanceId
  ipcMain.handle('plugin-view:findGraceInstance', (_event, pluginId: string) => {
    return _registry?.findGraceInstance(pluginId) ?? null;
  });
  // E5.5#9：宽限期恢复——旧 instanceId → 新 instanceId 重映射（标签页恢复后 ID 可能变化）
  ipcMain.handle('plugin-view:rekeyInstance', (_event, oldInstanceId: string, newInstanceId: string) => {
    return _registry?.rekeyInstance(oldInstanceId, newInstanceId) ?? false;
  });

  // plugin-view:reload——插件重载（预留，当前无调用方）
  ipcMain.handle('plugin-view:reload', (_event, instanceId: string) => {
    _registry?.reloadPlugin(instanceId);
  });

  // E5.6#1：关闭 per-tab WebView 创建——Phase 1 回退到单 WebView
  // E3f #58c + E5.5#9c：创建插件 WebView——加载 plugin-view.html（React 自举页面）
  // signature: (instanceId, pluginId)——每个标签页独立 WebView
  ipcMain.handle('plugin-view:create', (_event, instanceId: string, pluginId: string) => {
    console.error('[E5.6#1] plugin-view:create 被调用但已禁用——per-tab WebView 已关闭。instanceId:', instanceId, 'pluginId:', pluginId);
    return undefined;
    // ---- 以下代码 E5.6 Phase 1 禁用 ----
    // const isDev = !app.isPackaged;
    // const url = isDev
    //   ? `${DEV_SERVER_URL}/plugin-view.html?pluginId=${pluginId}&instanceId=${instanceId}`
    //   : `linkdesk://${pluginId}/plugin-view.html?pluginId=${pluginId}&instanceId=${instanceId}`;
    // _registry?.registerPlugin(instanceId, pluginId, url);
  });

  // #58e 修复 + E5.5#9c：插件 WebView 渲染完成通知——主进程转发到壳窗口
  // 现在转发 (instanceId, pluginId)——壳侧 useWebViewSync 用 instanceId 做 ready 判断
  ipcMain.on('plugin-view:ready', (_event, instanceId: string, pluginId: string) => {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send('plugin-view:ready', instanceId, pluginId);
    }
  });

  console.log('[plugin-view-handlers] 已注册 14 个 IPC handler（13 handle + 1 on）+ getInstanceIdsForPlugin + findGraceInstance + rekeyInstance + reload');
}

/**
 * E5.6#8d：注册双Pool IPC handler——壳↔池通信通道。
 * 暂时和 registerPluginViewHandlers 并存，Phase 8 清理 per-tab WebView 时统一处理。
 */
export function registerPoolHandlers(windowManager: WindowManager, mainWindow: BrowserWindow): void {
  // 壳→Pool：推送布局快照
  ipcMain.on('pool:push-layout', (_event, zone: string, layout: unknown) => {
    const poolView = windowManager.getPoolView(zone as 'sidebar' | 'main');
    if (poolView && !poolView.webContents.isDestroyed()) {
      poolView.webContents.send('pool:layout', layout);
    } else {
      console.warn(`[pool-handlers] push-layout 失败——${zone} Pool 不存在或已销毁`);
    }
  });

  // Pool→壳：池 React 挂载完成
  ipcMain.on('pool:ready', (_event, zone: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pool:ready', zone);
    }
    console.log(`[pool-handlers] ${zone} Pool 就绪`);
  });

  // 壳→Pool：心跳 ping——E5.6#27 崩溃恢复会用到
  ipcMain.on('pool:ping', (_event, zone: string) => {
    const poolView = windowManager.getPoolView(zone as 'sidebar' | 'main');
    if (poolView && !poolView.webContents.isDestroyed()) {
      poolView.webContents.send('pool:pong');
    }
  });

  // Pool→壳：心跳 pong——预留，E5.6#27 崩溃恢复消费
  ipcMain.on('pool:pong', (_event, zone: string) => {
    // 预留——崩溃恢复模块通过监听此事件判断池是否存活
  });

  // E5.6#9c：壳→Pool：同步 Pool bounds——窗口 resize 时壳推送最新 bounds
  ipcMain.on('pool:set-bounds', (_event, zone: string, bounds: { x: number; y: number; width: number; height: number }) => {
    const poolView = windowManager.getPoolView(zone as 'sidebar' | 'main');
    if (!poolView || poolView.webContents.isDestroyed()) return;

    // 侧栏折叠时 zone width → 0——隐藏 Pool，防止空白 WebContentsView 遮挡主区
    if (bounds.width <= 0 || bounds.height <= 0) {
      if (zone === 'sidebar') poolView.setVisible(false);
      return;
    }

    poolView.setBounds(bounds);
    // E5.6#10：SidebarPool 有效 bounds 时设为可见——接管壳 DOM 侧栏区域
    // 后续 resize 重复调用 setVisible(true) 幂等无害。
    // MainPool 暂不设为可见（E5.6#11 再迁移主区）。
    if (zone === 'sidebar') {
      poolView.setVisible(true);
    }
  });

  // E5.6#9：壳→Pool：切换 Pool DevTools——调试用
  ipcMain.on('pool:toggleDevTools', (_event, zone: string) => {
    if (app.isPackaged) return;
    const poolView = windowManager.getPoolView(zone as 'sidebar' | 'main');
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pool:sidebar-action', action);
    }
  });

  // E5.6#12：壳→侧栏折叠/展开→SidebarPool setVisible——进程保持，不 destroy
  ipcMain.on('pool:toggle-sidebar-pool', (_event, visible: boolean) => {
    windowManager.toggleSidebarPool(visible);
  });

  console.log('[pool-handlers] 已注册 8 个 pool IPC handler（pool:push-layout / pool:ready / pool:ping / pool:pong / pool:set-bounds / pool:toggleDevTools / pool:sidebar-action / pool:toggle-sidebar-pool）');
}
