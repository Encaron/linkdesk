/**
 * 协议注册表 IPC 处理器——E5.6#11.5h。
 *
 * ⚠️ E5.6#14-fix：此文件已废弃——preload-pool.ts 的 protocol.* 已改为走 plugins:call
 * 代理到壳渲染进程（IpcBridgeHandler），因为主进程 ProtocolRegistry 为空（跨进程模块实例隔离）。
 * 保留此文件仅作 fallback——若 ipcMain.handle 无人调用，Phase 8 统一清理。
 *
 * 池插件通过 lk.protocol.* 访问壳侧的 ProtocolRegistry。
 * 只暴露可序列化字段（id/name/pluginId/mode）——parseLine/parseBinary/detect 函数不可跨进程。
 */

import { ipcMain } from 'electron';
import {
  listProtocols,
  getActiveProtocolId,
  setActiveProtocol,
} from '../../src/core/registry/ProtocolRegistry.js';

export function registerProtocolHandlers(): void {
  ipcMain.handle('protocol:listProtocols', () => {
    return listProtocols().map((p) => ({
      id: p.id,
      name: p.name,
      pluginId: p.pluginId,
      mode: p.mode,
    }));
  });

  ipcMain.handle('protocol:getActiveProtocolId', () => {
    return getActiveProtocolId();
  });

  ipcMain.handle('protocol:setActiveProtocolId', (_event, protocolId: string) => {
    setActiveProtocol(protocolId);
  });
}
