/**
 * 插件间事件总线（Block 3b）——**声明式发布**的宿主侧唯一实现。
 *
 * 规格：`docs/04-软件更新/待抉择池/通用能力底盘/04-插件间事件契约.md §八`。
 *
 * 判据：
 *   · 发布者只能发自己 manifest `events.publishes` 声明过的 id（⛔ 猜/发他人事件）；
 *   · recipients = 声明订阅该 id 的其它插件数（第一版 fire-and-forget，不排队、不重放）；
 *   · 0 订阅方 ⇒ dropped=1（日志如实记，⛔ 静默堆积）；
 *   · 壳不认识任何业务事件名——全部来自声明。
 *
 * 本模块零 IO（声明查找可注入）——纯逻辑可单测；广播由 IPC handler 负责。
 */

import { DEVICE_ERROR_CODES as C, codedDeviceError } from './deviceSession/codes.js';
import { allPluginEvents, pluginEvents, type PluginEventsDecl } from '../plugins/plugin-manifest-loader.js';

export interface PublishInput {
  /** 发布者（池侧必填；`__shell__` = 宿主内部） */
  pluginId: string;
  eventId: string;
  payload?: unknown;
}

export interface PublishResult {
  recipients: number;
  dropped: number;
}

interface EventBusDeps {
  declOf(pluginId: string): PluginEventsDecl | null;
  all(): Array<{ pluginId: string; events: PluginEventsDecl }>;
}

export function createEventBus(deps: EventBusDeps) {
  return {
    /** 发布鉴权＋统计；通过 ⇒ 调用方广播，失败 ⇒ 带码上抛 */
    publish(input: PublishInput): PublishResult {
      const pluginId = input?.pluginId;
      const eventId = input?.eventId;
      if (typeof pluginId !== 'string' || !pluginId) {
        throw codedDeviceError(C.BAD_ARGS, 'publish 需要 pluginId（属主自声明）');
      }
      if (typeof eventId !== 'string' || !eventId) {
        throw codedDeviceError(C.BAD_ARGS, 'publish 需要 eventId');
      }
      if (pluginId !== '__shell__') {
        const decl = deps.declOf(pluginId);
        const declared = !!decl && decl.publishes.some((p) => p && p.id === eventId);
        if (!declared) {
          throw codedDeviceError(
            C.EVENT_UNDECLARED,
            `事件 "${eventId}" 未在插件 "${pluginId}" 的 publishes 声明`,
            '在 plugin.json 根字段 events.publishes 声明（04 §8.1）；⛔ 发未声明事件',
            { eventId, pluginId },
          );
        }
      }
      const recipients = deps.all().filter(
        (x) => x.pluginId !== pluginId && x.events.subscribes.some((s) => s && s.id === eventId),
      ).length;
      // 第一版投递策略 = fire-and-forget：没人订阅就丢（记 dropped，⛔ 队列堆积）
      return { recipients, dropped: recipients === 0 ? 1 : 0 };
    },
  };
}

/** 生产实例：声明来自已加载 manifest */
export const eventBus = createEventBus({
  declOf: pluginEvents,
  all: allPluginEvents,
});
