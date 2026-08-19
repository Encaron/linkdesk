/**
 * 🔥 events 共享模块——preload-pool.ts + preload-shell.ts 共用
 *
 * E5#79 重写：去 subscriptions Map dispatch，改 serial.onData 模式——
 * 每个 events.on(channel, cb) 注册独立 ipcRenderer.on(IPC.plugin.push, handler)。
 * contextBridge 代理回调不复存在 subscriptions 中——直接在 ipcRenderer 监听器里调用。
 *
 * 使用：
 *   import { createEventSystem } from './ipc/event-system';
 *   const { on, emit } = createEventSystem(ipcRenderer, {
 *     logPrefix: 'preload-pool',
 *     extraHandlers: { [IPC.theme.changed]: (payload) => { ... } },
 *   });
 */
import type { IpcRenderer, IpcRendererEvent } from 'electron';
import { IPC } from './channels';
// E5.7#97：plugin:push 信封归口 src/core/types/ipc/events.ts（原本地 PluginPushData 移走）
import type { PluginPushEnvelope } from '../../src/core/types/ipc/events';

type EventCallback = (payload: unknown) => void;

type ExtraHandlers = Record<string, (payload: unknown) => void>;

export interface EventSystemOptions {
  logPrefix: string;
  extraHandlers?: ExtraHandlers;
}

export interface EventSystemApi {
  // E5.7#97：on 泛型化——载荷类型按订阅方 cb 推断（listenDirect 同款模式）。
  // 通道契约类型（ConfigurationChangedPayload 等）可直传，不再逆变报错。
  on<T = unknown>(channel: string, cb: (payload: T) => void): () => void;
  emit(channel: string, payload: unknown): void;
}

export function createEventSystem(
  ipcRenderer: IpcRenderer,
  options: EventSystemOptions,
): EventSystemApi {
  const { logPrefix, extraHandlers } = options;

  // 额外处理器（theme:changed CSS 注入等）——独立于 per-callback 监听器
  if (extraHandlers) {
    ipcRenderer.on(IPC.plugin.push, (_event, data: PluginPushEnvelope) => {
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
    on<T = unknown>(channel: string, cb: (payload: T) => void): () => void {
      const handler = (_event: IpcRendererEvent, data: PluginPushEnvelope) => {
        if (data.channel === channel) {
          // wire 载荷面 unknown——通道契约类型由订阅方 cb 泛型收窄，边界一处 cast
          try { cb(data.payload as T); } catch { /* contextBridge 回调静默失败 */ }
        }
      };
      ipcRenderer.on(IPC.plugin.push, handler);
      return () => { ipcRenderer.removeListener(IPC.plugin.push, handler); };
    },

    emit(channel: string, payload: unknown): void {
      // E5.6#9e：DEV_LOG 模式 console.debug 洪水——emit 每次调用→启动时 keybindings:changed 等 ~20 次
      ipcRenderer.send(IPC.plugin.emit, { channel, payload });
    },
  };
}

export interface ListenDirectOptions {
  /** 抑制 plugin:push 通道告警——壳侧直接接收主进程 send 时传 true */
  skipPushWarning?: boolean;
}

/**
 * 🔥 归一化：直接 IPC channel 监听——替代 makeListener + 裸 ipcRenderer.on。
 * 返回 unsubscribe 函数。所有 preload 脚本共用此入口。
 * 对标 createEventSystem.on 的模式，但监听直接 IPC channel 而非 plugin:push 分发。
 *
 * ⚠️ 仅用于主进程直接 view.webContents.send(channel, data) 的通道（serial/p2p）。
 * IpcBridge.broadcast() 推送的事件走 plugin:push 分发 → 必须用 events.on()，不能用此函数。
 * 壳 preload 的 config:changed 走主进程直发 mainWindow.webContents.send → listenDirect 正确，
 * 传 { skipPushWarning: true } 抑制告警。
 * 详见 preload-pool.ts 文件头"IPC 通道铁律"。
 */
// E5.7#97：cb 改为泛型 T——按订阅方 cb 推断载荷 tuple，替代 (...args: any[])。
// 泛型保持逆变正确性：(text: string) => void 可传入，比 unknown[] 更宽容。
export function listenDirect<T extends unknown[]>(
  ipcRenderer: IpcRenderer,
  channel: string,
  cb: (...args: T) => void,
  options?: ListenDirectOptions,
): () => void {
  // ── E5.5#7c: 运行时告警——channel 名匹配已知 plugin:push 分发通道时静默失效 ──
  // 这些 channel 的壳侧推送走 IpcBridge.broadcast → plugin:push 分发到池渲染进程，
  // 池 preload 用 listenDirect 监听的是直接 IPC 通道（不带 plugin:push 包装），永远收不到。
  // 壳 preload 的 config:changed/contextKey:changed 走主进程直发 mainWindow.webContents.send，
  // 用 listenDirect 是正确的——传 { skipPushWarning: true } 跳过告警。
  if (!options?.skipPushWarning) {
    const PUSH_CHANNELS = [
      IPC.config.changed,
      IPC.theme.changed,
      'lang:changed',
      'plugin-state:changed',
      IPC.contextKey.changed,
      'plugin:installed',
      'plugin:uninstalled',
      // E5.7#81：安装进度——壳 loader emit → 主进程 → 池广播（走 plugin:push 分发）
      'plugin:installProgress',
      'window:zoomLevelChanged',
    ];
    if (PUSH_CHANNELS.includes(channel)) {
      console.error(
        `[event-system] 🔴 listenDirect("${channel}") 错误！` +
        ` "${channel}" 走 plugin:push 分发，必须用 events.on("${channel}", cb)，不是 listenDirect。` +
        ` 直接 IPC 通道加 :direct 后缀（如 "mydata:direct"）可跳过此告警。` +
        ` 壳 preload 确认主进程直发 → 传 {{ skipPushWarning: true }}。` +
        ` 详见 preload-pool.ts 文件头"IPC 通道铁律"。`,
      );
    }
  }

  const handler = (_event: IpcRendererEvent, ...args: T) => cb(...args);
  // E5.6#9e：DEV_LOG 模式 console.debug 洪水——listenDirect 每次调用→启动时 config:changed/settings:* 等 ~30 次
  ipcRenderer.on(channel, handler);
  return () => { ipcRenderer.removeListener(channel, handler); };
}
