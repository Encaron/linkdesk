/**
 * 串口 IPC 处理器
 *
 * E1 步 2：注册 ipcMain.handle('serial:*') + 数据推送桥接。
 * 对标 Tauri 的 #[tauri::command] 宏——每个 Rust 命令对应一个 IPC handler。
 *
 * 通信模型：
 *   renderer 请求 → invoke → main process 执行 → 返回结果
 *   main process 推送 → IpcBridge.broadcast（plugin:push 包装，壳+池双侧） → renderer events.on
 */

import { ipcMain } from 'electron';
import { serialService } from '../../services/serial-service.js';
// E5.7#97：OpenPortConfig 归口 wire 契约（serial-service 只 import 不 re-export——原双份定义已删）
import type { OpenPortConfig } from '../../../src/core/types/ipc/serial';
import { IPC } from '../channels.js';
import { IpcBridge } from '../ipc-bridge.js';

let _registered = false;

/**
 * 注册所有串口 IPC 处理器。
 * E5.8#6.5：数据推送唯一路径 = IpcBridge.broadcast（plugin:push 发壳+发池）——原壳 direct +
 * 池手动遍历双发删除；IpcBridge.active 恒指最新实例，壳崩重建自动换（不再需要 _mainWindow 引用）。
 */
export function registerSerialHandlers(): void {
  // 将 serial-service 的数据推送到渲染进程。
  // setCallbacks 是覆盖式设置——必须在 guard 之前，每次调用重绑（回调走 IpcBridge.active 取最新实例）。
  serialService.setCallbacks({
    // E5.8#6.5-regress-2：流数据 storeForReplay=false——串口高频数据不入 lastBroadcasts 重放（原直发不重放）
    onData: (text) => { IpcBridge.active?.broadcast(IPC.serial.data, text, undefined, false); },
    onStats: (stats) => { IpcBridge.active?.broadcast(IPC.serial.stats, stats, undefined, false); },
    onSystem: (msg) => { IpcBridge.active?.broadcast(IPC.serial.system, msg, undefined, false); },
  });

  if (_registered) return;
  _registered = true;

  // ── 请求-响应处理器（对标 Tauri #[tauri::command]）──

  // 枚举可用串口
  ipcMain.handle(IPC.serial.listPorts, async () => {
    return serialService.listPorts();
  });

  // 查询当前状态（F5 刷新恢复）
  // E5.8#26 D5 双形态：无参 → 全口数组 / 有参 → 单口快照
  ipcMain.handle(IPC.serial.getStatus, (_event, portName?: string) => {
    if (portName) return serialService.getStatus(portName);
    return serialService.getStatus();
  });

  // 打开串口
  ipcMain.handle(IPC.serial.openPort, async (_event, cfg: OpenPortConfig) => {
    await serialService.openPort(cfg);
  });

  // 关闭串口——E5.8#26 D2：portName 可选（缺省唯一口语义）
  ipcMain.handle(IPC.serial.closePort, async (_event, portName?: string) => {
    await serialService.closePort(portName);
  });

  // 发送字节数据——portName 可选
  ipcMain.handle(IPC.serial.sendData, (_event, data: number[], portName?: string) => {
    return serialService.sendData(data, portName);
  });

  // 发送文本（支持编码）——portName 可选
  ipcMain.handle(IPC.serial.sendText, (_event, text: string, encoding: string, portName?: string) => {
    return serialService.sendText(text, encoding, portName);
  });

  // DTR / RTS 控制信号——portName 可选
  ipcMain.handle(IPC.serial.setDtr, async (_event, enable: boolean, portName?: string) => {
    await serialService.setDtr(enable, portName);
  });

  ipcMain.handle(IPC.serial.setRts, async (_event, enable: boolean, portName?: string) => {
    await serialService.setRts(enable, portName);
  });
}
