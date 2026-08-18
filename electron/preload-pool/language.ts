/**
 * Pool preload 语言域——_langCache/_langSubscribers + language 命名空间。
 * E5.8#0d.10-4b：自 preload-pool.ts 拆出——语言资源缓存（getInitial 读 + lang:changed 写入并
 * 通知订阅）。onLangChanged 供 events.ts 的 extraHandlers 调用（跨文件单点写入）。
 * 依赖方向：language → electron/ipc（channels）；events → language（onLangChanged）；无反向。
 */

import { ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels';

type LangCacheShape = { lang: string; resources: Record<string, unknown> };

let _langCache: LangCacheShape | null = null;
const _langSubscribers = new Set<(data: LangCacheShape) => void>();

/** lang:changed 单点写入——events.ts extraHandlers 调用（原 preload-pool.ts events 内联逻辑） */
export function onLangChanged(data: LangCacheShape): void {
  _langCache = data;
  for (const fn of _langSubscribers) {
    try { fn(_langCache); } catch (e) {
      console.error('[preload-pool] lang:changed 回调异常:', e);
    }
  }
}

/** language 命名空间——查询/切换 + getInitial 读缓存 + onChange 订阅 */
export function buildLanguage() {
  return {
    getCurrent: () => ipcRenderer.invoke(IPC.plugins.call, 'getCurrentLanguage'),
    getAvailable: () => ipcRenderer.invoke(IPC.plugins.call, 'getAvailableLanguages'),
    set: (langId: string) => ipcRenderer.invoke(IPC.config.set, 'app.language', langId),
    getInitial: () => _langCache,
    onChange: (cb: (data: LangCacheShape) => void) => {
      _langSubscribers.add(cb);
      return () => { _langSubscribers.delete(cb); };
    },
  };
}
