/**
 * 🔥 events 共享模块——preload-plugin.ts + preload-shell.ts 共用
 *
 * E3j #77a：归一化。events.on/emit 逻辑在两处 preload 里复制粘贴——
 * 改一处忘一处 = 缝 bug。提取到此模块，一份代码两处 import。
 *
 * E5#61 审计结论：
 * - emit → ipcRenderer.send('plugin:emit') → 主进程 → broadcast → plugin:push → on 回调。
 * - 单次投递，无回环 double-fire。emit 不发本地——全走 IPC 来回。
 * - 壳 emit 会收到自己的事件（主进程回传 plugin:push 到壳），这是设计如此——对标 CoreEvents。
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

/** plugin:push 数据结构——source 标记发送方（E5#61b） */
interface PluginPushData {
  channel: string;
  payload: unknown;
  /** E5#61b：事件来源。"shell" = 壳发出，pluginId = 某插件发出。接收方可选读取。 */
  source?: string;
}

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

/** E5#61c：dev 模式事件日志 */
const DEV_LOG = typeof process !== "undefined"
  && (process.env.NODE_ENV === "development" || !process.env.NODE_ENV);

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

  // E5#74e debug：确认 plugin:push 是否注册 + 是否到达
  console.log(`[${logPrefix}] 即将注册 plugin:push 监听`);
  ipcRenderer.on('plugin:push', (_event, data: PluginPushData) => {
    console.log(`[${logPrefix}] ★ plugin:push 收到! channel=${data.channel}`);
    // E5#61c：dev 模式日志
    if (DEV_LOG) {
      const handlers = subscriptions.get(data.channel);
      const count = handlers?.size ?? 0;
      const source = data.source ? ` ← ${data.source}` : "";
      console.debug(`[events] ${logPrefix} ← "${data.channel}"${source} → ${count} 订阅者`);
    }

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
      if (DEV_LOG) {
        console.debug(`[events] ${logPrefix} → emit "${channel}"`);
      }
      ipcRenderer.send('plugin:emit', { channel, payload });
    },
  };
}
