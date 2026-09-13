/**
 * Registry IPC 处理器——E5.7#49。
 *
 * 主进程三表（LangDef / Protocol / FileAssociation）的直接 IPC 接收端——
 * Registry 主进程化后，数据由 plugin-manifest-loader 预加载进主进程实例，
 * 池渲染进程经 preload-pool 直连这些通道（2 跳代理拉直为 1 跳）。
 * 只暴露可序列化字段：LangDef 剥 monarch tokenizer、Protocol 剥 parseLine/detect（JS 函数不可跨进程）。
 *
 * 通道名与旧代理保持一致（langDef:get / protocol:listProtocols / …）——池侧 API 面零改动。
 * E5.7#36：无状态 handler——IPC 通道只注册一次（壳崩重建复用不重注册）。
 */

import { ipcMain } from 'electron';
import { getLangDef } from '../../../src/core/registry/languages/LangDefRegistry.js';
import {
  listProtocols,
  getActiveProtocolId,
  setActiveProtocol,
} from '../../../src/core/registry/ProtocolRegistry.js';
import { getPluginFor } from '../../../src/core/services/files/FileAssociationService.js';
import { IPC } from '../channels.js';
import { getIntegrationState, setIntegrationEnabled, type OsIntegrationKind } from '../../services/registry-integration.js'; // E6#45f

let _registered = false;

export function registerRegistryHandlers(): void {
  if (_registered) return;
  _registered = true;

  ipcMain.handle(IPC.langDef.get, (_event, extension: string) => {
    const def = getLangDef(extension);
    if (!def) return null;
    return {
      id: def.id,
      lsp: def.lsp ?? null,
    };
  });

  ipcMain.handle(IPC.protocol.listProtocols, () =>
    listProtocols().map((p) => ({
      id: p.id,
      name: p.name,
      pluginId: p.pluginId,
      mode: p.mode,
    }))
  );

  ipcMain.handle(IPC.protocol.getActiveProtocolId, () => getActiveProtocolId());

  ipcMain.handle(IPC.protocol.setActiveProtocolId, (_event, protocolId: string) => {
    setActiveProtocol(protocolId);
  });

  // E5.7#50：FileAssociation 直连——原 PROXY_CHANNELS 代理（主进程→壳）拉直为主进程直答
  ipcMain.handle(IPC.fileAssociation.getPluginFor, (_event, extension: string) =>
    getPluginFor(extension)
  );

  // E6#45f：OS 集成开关——读现状 / 开-关某项（写 HKCU 注册表，per-user 免提权；幂等）。
  // exePath = process.execPath（dev 下为 electron.exe——不做特判：dev 验的就是这条链）
  ipcMain.handle(IPC.registry.getIntegrationState, () => getIntegrationState());
  ipcMain.handle(IPC.registry.setIntegrationEnabled, (_event, kind: OsIntegrationKind, enabled: boolean) =>
    setIntegrationEnabled(kind, enabled, process.execPath)
  );
}
