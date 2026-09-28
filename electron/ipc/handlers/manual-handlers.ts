/**
 * AI 操作手册 IPC 处理器——M3 `AI#16`。
 *
 * main 直答（`product-handlers.ts` 先例：主进程持有数据、只读、无副作用 ⇒ `ipcMain.handle` 直接回传）。
 * **`app:getAiManual` 不进 PROXY_CHANNELS**——PROXY 那套会给每个通道再挂一层 `ipcMain.handle`
 * 转发到壳渲染进程；双登记（本 handler ＋ IpcBridge proxy 同通道）⇒ 启动即抛
 * "Attempted to register a second handler"。main 直答的域一律不进 PROXY（同款：`app.*` 两条、
 * `update.*` 四条）。
 *
 * 🔴 **本通道只给壳**：`preload-shell.ts` 的 `buildShellApp()` 里暴露，池 preload 不注入 ⇒
 * 第三方插件根本调不到（手册是**壳自己的面**——同发行说明的理由：插件没有读宿主操作手册的理由，
 * 且有理由也不该由壳代念；插件要自述请走 `contributes.commands` 的 `description`/`params`）。
 *
 * 数据源 = `electron/services/ai-manual.ts`（单一权威）。永不抛：无手册 ⇒ `chapters: []`。
 */

import { ipcMain } from 'electron';
import { aiManualPayload } from '../../services/ai-manual.js';
import { IPC } from '../channels.js';

// E5.7#36：壳崩重建复用——无状态 handler，IPC 通道只注册一次
let _registered = false;

export function registerManualHandlers(): void {
  if (_registered) return;
  _registered = true;

  // 只读：手册全量（章清单 ＋ 每章 markdown ＋ 版本号 ＋ 手册根路径）
  ipcMain.handle(IPC.app.getAiManual, () => aiManualPayload());
}
