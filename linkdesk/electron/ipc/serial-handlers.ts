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
import { serialService, OpenPortConfig } from '../services/serial-service';

/**
 * 注册所有串口 IPC 处理器。
 * 在 main.ts 的 app.whenReady() 中调用一次。
 */
export function registerSerialHandlers(mainWindow: BrowserWindow): void {
  // 将 serial-service 的数据推送到渲染进程
  serialService.setCallbacks({
    onData: (text) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('serial:data', text);
      }
    },
    onStats: (stats) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('serial:stats', stats);
      }
    },
    onSystem: (msg) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('serial:system', msg);
      }
    },
  });

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
