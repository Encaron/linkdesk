/**
 * 串口 IPC 处理器
 *
 * E1 步 2：注册 ipcMain.handle('serial:*') + 数据推送桥接。
 * 对标 Tauri 的 #[tauri::command] 宏——每个 Rust 命令对应一个 IPC handler。
 *
 * 通信模型：
 *   renderer 请求 → invoke → main process 执行 → 返回结果
 *   main process 推送 → webContents.send → renderer ipcRenderer.on
 */

import { BrowserWindow, ipcMain } from 'electron';
import { serialService, OpenPortConfig } from '../services/serial-service.js';
import type { WindowManager } from '../window-manager.js';

// E5.7#36：壳崩重建复用本函数——引用始终刷新（推送回调读模块引用），IPC 通道只注册一次
let _mainWindow: BrowserWindow | null = null;
let _windowManager: WindowManager | undefined;
let _registered = false;

/**
 * 注册所有串口 IPC 处理器。
 * E5#74b：windowManager 用于广播串口数据到插件 WebView。
 */
export function registerSerialHandlers(mainWindow: BrowserWindow, windowManager?: WindowManager): void {
  _mainWindow = mainWindow;
  _windowManager = windowManager;

  // 将 serial-service 的数据推送到渲染进程。
  // setCallbacks 是覆盖式设置——必须在 guard 之前，重建后回调需指向新窗口/新 WM。
  serialService.setCallbacks({
    onData: (text) => {
      if (_mainWindow && !_mainWindow.isDestroyed()) {
        _mainWindow.webContents.send('serial:data', text);
      }
      // E5#74b + E5.5#9d：广播到所有实例 WebView
      if (_windowManager) {
        for (const instanceId of _windowManager.getAllInstanceIds()) {
          _windowManager.getPluginView(instanceId)?.webContents.send('serial:data', text);
        }
        // E5.6 Pool 模型 → E5.7#4：广播到唯一 Pool WebView（#12 提前——SidebarPool 已删）
        for (const poolView of _windowManager.getAllPoolViews()) {
          if (!poolView.webContents.isDestroyed()) {
            poolView.webContents.send('serial:data', text);
          }
        }
      }
    },
    onStats: (stats) => {
      if (_mainWindow && !_mainWindow.isDestroyed()) {
        _mainWindow.webContents.send('serial:stats', stats);
      }
      if (_windowManager) {
        for (const instanceId of _windowManager.getAllInstanceIds()) {
          _windowManager.getPluginView(instanceId)?.webContents.send('serial:stats', stats);
        }
        // E5.6 Pool 模型 → E5.7#4：广播到唯一 Pool WebView
        for (const poolView of _windowManager.getAllPoolViews()) {
          if (!poolView.webContents.isDestroyed()) {
            poolView.webContents.send('serial:stats', stats);
          }
        }
      }
    },
    onSystem: (msg) => {
      if (_mainWindow && !_mainWindow.isDestroyed()) {
        _mainWindow.webContents.send('serial:system', msg);
      }
      if (_windowManager) {
        for (const instanceId of _windowManager.getAllInstanceIds()) {
          _windowManager.getPluginView(instanceId)?.webContents.send('serial:system', msg);
        }
        // E5.6 Pool 模型 → E5.7#4：广播到唯一 Pool WebView
        for (const poolView of _windowManager.getAllPoolViews()) {
          if (!poolView.webContents.isDestroyed()) {
            poolView.webContents.send('serial:system', msg);
          }
        }
      }
    },
  });

  if (_registered) return;
  _registered = true;

  // ── 请求-响应处理器（对标 Tauri #[tauri::command]）──

  // 枚举可用串口
  ipcMain.handle('serial:listPorts', async () => {
    return serialService.listPorts();
  });

  // 查询当前状态（F5 刷新恢复）
  ipcMain.handle('serial:getStatus', () => {
    return serialService.getStatus();
  });

  // 打开串口
  ipcMain.handle('serial:openPort', async (_event, cfg: OpenPortConfig) => {
    await serialService.openPort(cfg);
  });

  // 关闭串口
  ipcMain.handle('serial:closePort', async () => {
    await serialService.closePort();
  });

  // 发送字节数据
  ipcMain.handle('serial:sendData', (_event, data: number[]) => {
    return serialService.sendData(data);
  });

  // 发送文本（支持编码）
  ipcMain.handle('serial:sendText', (_event, text: string, encoding: string) => {
    return serialService.sendText(text, encoding);
  });

  // DTR / RTS 控制信号
  ipcMain.handle('serial:setDtr', async (_event, enable: boolean) => {
    await serialService.setDtr(enable);
  });

  ipcMain.handle('serial:setRts', async (_event, enable: boolean) => {
    await serialService.setRts(enable);
  });
}
