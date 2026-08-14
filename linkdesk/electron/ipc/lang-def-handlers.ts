/**
 * LangDef 注册表 IPC 处理器——E5.6#11.5i。
 *
 * 池插件通过 lk.langDef.get(ext) 访问壳侧 LangDefRegistry。
 * 只暴露可序列化字段（id / lsp）——monarch tokenizer 函数不可跨进程。
 */

import { ipcMain } from 'electron';
import { getLangDef } from '../../src/core/registry/LangDefRegistry.js';

// E5.7#36：壳崩重建复用本函数——无状态 handler，IPC 通道只注册一次
let _registered = false;

export function registerLangDefHandlers(): void {
  if (_registered) return;
  _registered = true;
  ipcMain.handle('langDef:get', (_event, extension: string) => {
    const def = getLangDef(extension);
    if (!def) return null;
    return {
      id: def.id,
      lsp: def.lsp ?? null,
    };
  });
}
