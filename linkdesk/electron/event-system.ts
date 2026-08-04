/**
 * 🔥 events 共享模块——preload-plugin.ts + preload-shell.ts 共用
 *
 * E5#79 重写：去 subscriptions Map dispatch，改 serial.onData 模式——
 * 每个 events.on(channel, cb) 注册独立 ipcRenderer.on('plugin:push', handler)。
 * contextBridge 代理回调不复存在 subscriptions 中——直接在 ipcRenderer 监听器里调用。
 *
 * 使用：
 *   import { createEventSystem } from './event-system';
 *   const { on, emit } = createEventSystem(ipcRenderer, {
 *     logPrefix: 'preload-plugin',
 *     extraHandlers: { 'theme:changed': (payload) => { ... } },
 *   });
 */
import type { IpcRenderer } from 'electron';

type EventCallback = (payload: unknown) => void;

interface PluginPushData {
  channel: string;
  payload: unknown;
  source?: string;
}

export type ExtraHandlers = Record<string, (payload: unknown) => void>;

export interface EventSystemOptions {
  logPrefix: string;
  extraHandlers?: ExtraHandlers;
}

export interface EventSystemApi {
  on(channel: string, cb: EventCallback): () => void;
  emit(channel: string, payload: unknown): void;
}

const DEV_LOG = typeof process !== "undefined"
  && (process.env.NODE_ENV === "development" || !process.env.NODE_ENV);

export function createEventSystem(
  ipcRenderer: IpcRenderer,
  options: EventSystemOptions,
): EventSystemApi {
  const { logPrefix, extraHandlers } = options;

  // 额外处理器（theme:changed CSS 注入等）——独立于 per-callback 监听器
  if (extraHandlers) {
    ipcRenderer.on('plugin:push', (_event, data: PluginPushData) => {
      const extra = extraHandlers[data.channel];
      if (extra) {
        try { extra(data.payload); } catch (e) {
          console.error(`[${logPrefix}] 额外处理器异常 (channel=${data.channel}):`, e);
        }
      }
    });
  }

  return {
    /** E5#79：每个订阅注册独立 ipcRenderer.on——contextBridge 回调不被 subscriptions 存储 */
    on(channel: string, cb: EventCallback): () => void {
      const handler = (_event: any, data: PluginPushData) => {
        if (data.channel === channel) {
          try { cb(data.payload); } catch { /* contextBridge 回调静默失败 */ }
        }
      };
      ipcRenderer.on('plugin:push', handler);
      return () => { ipcRenderer.removeListener('plugin:push', handler); };
    },

    emit(channel: string, payload: unknown): void {
      if (DEV_LOG) console.debug(`[events] ${logPrefix} → emit "${channel}"`);
      ipcRenderer.send('plugin:emit', { channel, payload });
    },
  };
}
