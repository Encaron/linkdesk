/**
 * 事件总线 IPC 处理器（Block 3b）——发布鉴权 → 广播 → 审计。
 *
 * 回执信封同 device（contextBridge 抛错丢 code）：成功 `{ok:true, recipients, dropped}`；
 * 失败 `{ok:false, code, message, hint?, details?}`（`EEVENTUNDECLARED` / `EBADARGS`）。
 *
 * 投递 = `IpcBridge.broadcast(IPC.eventBus.bus, { eventId, payload, from })`：池/壳都收得到；
 * 是否处理由订阅方按 `eventId` 决定（声明用于发现/审计；同池共享上下文的限制见 04 §8.2）。
 */

import { ipcMain } from 'electron';
import { eventBus } from '../../services/eventBus.js';
import { auditEventPublish } from '../../services/eventAudit.js';
import { DEVICE_ERROR_CODES as C } from '../../services/deviceSession/codes.js';
import { IPC } from '../channels.js';
import { IpcBridge } from '../ipc-bridge.js';
import { failReply } from './reply.js';

let _registered = false;

interface PublishPayload {
  eventId?: unknown;
  payload?: unknown;
  ownerPluginId?: unknown;
  scope?: unknown;
}

export function registerEventHandlers(): void {
  if (_registered) return;
  _registered = true;

  ipcMain.handle(IPC.eventBus.publish, async (_event, req: PublishPayload) => {
    try {
      const hostScope = req?.scope === 'host';
      const owner = hostScope ? '__shell__' : (typeof req?.ownerPluginId === 'string' ? req.ownerPluginId : '');
      if (!hostScope && !owner) {
        return failReply(Object.assign(new Error('池侧 publish 必须带 ownerPluginId'), { code: C.BAD_ARGS, hint: '见 04 §8.2' }));
      }
      const eventId = typeof req?.eventId === 'string' ? req.eventId : '';
      const result = eventBus.publish({ pluginId: owner, eventId, payload: req?.payload });
      const message = { eventId, payload: req?.payload, from: owner };
      if (result.recipients > 0) {
        IpcBridge.active?.broadcast(IPC.eventBus.bus, message, undefined, true);
      }
      auditEventPublish({ eventId, from: owner, recipients: result.recipients, dropped: result.dropped });
      return { ok: true, ...result };
    } catch (e) {
      return failReply(e, 'EERROR');
    }
  });
}
