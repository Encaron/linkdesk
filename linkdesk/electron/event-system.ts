/**
 * 🔥 events 共享模块——preload-plugin.ts + preload-shell.ts 共用
 *
 * E3j #77a：归一化。events.on/emit 逻辑在两处 preload 里复制粘贴——
 * 改一处忘一处 = 缝 bug。提取到此模块，一份代码两处 import。
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

/** plugin:push 的额外处理器——在 dispatch 给订阅者之前执行 */
export type ExtraHandlers = Record<string, (payload: unknown) => void>;

export interface EventSystemOptions {
  /** 日志前缀——区分 preload-plugin / preload-shell */
  logPrefix: string;
  /** 可选的额外处理器——如 theme:changed CSS 注入、lang:changed 缓存 */
  extraHandlers?: ExtraHandlers;
}

export interface EventSystemApi {
  /** 订阅事件——返回 unsubscribe 函数 */
  on(channel: string, cb: EventCallback): () => void;
  /** 发布事件到大厅——经主进程广播到所有插件 WebView + 壳 */
  emit(channel: string, payload: unknown): void;
}

/**
 * 创建归一化的 events 系统。
 * - 内部管理 Map<channel, Set<callback>> 订阅表
 * - 注册 ipcRenderer.on('plugin:push') 分发器
 * - 返回 { on, emit } API 对象
 */
export function createEventSystem(
  ipcRenderer: IpcRenderer,
  options: EventSystemOptions,
): EventSystemApi {
  const subscriptions = new Map<string, Set<EventCallback>>();
  const { logPrefix, extraHandlers } = options;

  ipcRenderer.on('plugin:push', (_event, data: { channel: string; payload: unknown }) => {
    // 额外处理器优先（theme:changed / lang:changed 等）
    if (extraHandlers) {
      const extra = extraHandlers[data.channel];
      if (extra) {
        try {
          extra(data.payload);
        } catch (e) {
          console.error(`[${logPrefix}] 额外处理器异常 (channel=${data.channel}):`, e);
        }
      }
    }

    // 分发给订阅者
    const handlers = subscriptions.get(data.channel);
    if (!handlers) return;
    for (const fn of handlers) {
      try {
        fn(data.payload);
      } catch (e) {
        console.error(`[${logPrefix}] 事件回调异常 (channel=${data.channel}):`, e);
      }
    }
  });

  return {
    on(channel: string, cb: EventCallback): () => void {
      let set = subscriptions.get(channel);
      if (!set) {
        set = new Set();
        subscriptions.set(channel, set);
      }
      set.add(cb);
      return () => {
        set?.delete(cb);
        if (set && set.size === 0) subscriptions.delete(channel);
      };
    },

    emit(channel: string, payload: unknown): void {
      ipcRenderer.send('plugin:emit', { channel, payload });
    },
  };
}
