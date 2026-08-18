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
import { serialService } from '../../services/serial-service.js';
// E5.7#97：OpenPortConfig 归口 wire 契约（serial-service 只 import 不 re-export——原双份定义已删）
import type { OpenPortConfig } from '../../../src/core/types/ipc/serial';
import type { WindowManager } from '../../windows/window-manager.js';
import { IPC } from '../channels.js';

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
        _mainWindow.webContents.send(IPC.serial.data, text);
      }
      // E5#74b + E5.7#43：广播到唯一 Pool WebView（per-tab 实例循环已删）
      if (_windowManager) {
        for (const poolView of _windowManager.getAllPoolViews()) {
          if (!poolView.webContents.isDestroyed()) {
            poolView.webContents.send(IPC.serial.data, text);
          }
        }
      }
    },
    onStats: (stats) => {
      if (_mainWindow && !_mainWindow.isDestroyed()) {
        _mainWindow.webContents.send(IPC.serial.stats, stats);
      }
      if (_windowManager) {
        for (const poolView of _windowManager.getAllPoolViews()) {
          if (!poolView.webContents.isDestroyed()) {
            poolView.webContents.send(IPC.serial.stats, stats);
          }
        }
      }
    },
    onSystem: (msg) => {
      if (_mainWindow && !_mainWindow.isDestroyed()) {
        _mainWindow.webContents.send(IPC.serial.system, msg);
      }
      if (_windowManager) {
        for (const poolView of _windowManager.getAllPoolViews()) {
          if (!poolView.webContents.isDestroyed()) {
            poolView.webContents.send(IPC.serial.system, msg);
          }
        }
      }
    },
  });

  if (_registered) return;
  _registered = true;

  // ── 请求-响应处理器（对标 Tauri #[tauri::command]）──

  // 枚举可用串口
  ipcMain.handle(IPC.serial.listPorts, async () => {
    return serialService.listPorts();
  });

  // 查询当前状态（F5 刷新恢复）
  ipcMain.handle(IPC.serial.getStatus, () => {
    return serialService.getStatus();
  });

  // 打开串口
  ipcMain.handle(IPC.serial.openPort, async (_event, cfg: OpenPortConfig) => {
    await serialService.openPort(cfg);
  });

  // 关闭串口
  ipcMain.handle(IPC.serial.closePort, async () => {
    await serialService.closePort();
  });

  // 发送字节数据
  ipcMain.handle(IPC.serial.sendData, (_event, data: number[]) => {
    return serialService.sendData(data);
  });

  // 发送文本（支持编码）
  ipcMain.handle(IPC.serial.sendText, (_event, text: string, encoding: string) => {
    return serialService.sendText(text, encoding);
  });

  // DTR / RTS 控制信号
  ipcMain.handle(IPC.serial.setDtr, async (_event, enable: boolean) => {
    await serialService.setDtr(enable);
  });

  ipcMain.handle(IPC.serial.setRts, async (_event, enable: boolean) => {
    await serialService.setRts(enable);
  });
}
