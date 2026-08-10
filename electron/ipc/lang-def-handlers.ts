/**
 * LangDef 注册表 IPC 处理器——E5.6#11.5i。
 *
 * 池插件通过 lk.langDef.get(ext) 访问壳侧 LangDefRegistry。
 * 只暴露可序列化字段（id / lsp）——monarch tokenizer 函数不可跨进程。
 */

import { ipcMain } from 'electron';
import { getLangDef } from '../../src/core/registry/LangDefRegistry.js';

export function registerLangDefHandlers(): void {
  ipcMain.handle('langDef:get', (_event, extension: string) => {
    const def = getLangDef(extension);
    if (!def) return null;
    return {
      id: def.id,
      lsp: def.lsp ?? null,
    };
  });
}
