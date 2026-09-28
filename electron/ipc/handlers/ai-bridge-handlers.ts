/**
 * AI 接入状态 IPC 处理器——M4 `AI#38.4`（设置页状态行数据源）。
 *
 * main 直答（`manual-handlers.ts` 先例：**不进 PROXY_CHANNELS**——双登记会抛
 * "Attempted to register a second handler"；只暴露给壳，`preload-shell.ts` 注入、池 preload 不给）。
 *
 * 通道 = `app:getAiBridge`，一个动作参数分发读/写：
 *   · `{action:"get"}`（缺省）→ 状态快照（`buildAiBridgeInfo()`）；
 *   · `{action:"regenerateToken"}` → 先重新生成凭据（旧凭据立即失效）再回快照。
 *
 * 数据源 = `services/aiBridge/info.ts`（只出数据不出文字——显示话术在壳命令里 t()）。
 */

import { ipcMain } from 'electron';
import { handleAiBridgeRequest, type AiBridgeInfoRequest } from '../../services/aiBridge/info.js';
import { IPC } from '../channels.js';

// E5.7#36：壳崩重建复用——无状态 handler，IPC 通道只注册一次
let _registered = false;

export function registerAiBridgeHandlers(): void {
  if (_registered) return;
  _registered = true;

  ipcMain.handle(IPC.app.getAiBridge, (_event, req: AiBridgeInfoRequest | undefined) => handleAiBridgeRequest(req));
}
