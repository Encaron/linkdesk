/**
 * 安全订阅 Electron IPC 推送事件（对标 useTauriEvent）。
 *
 * 内部封装 generation counter 模式——防 React StrictMode 双重注册 + 防闭包过期。
 * callbackRef 始终持有最新回调，避免 deps 变更导致重注册。
 *
 * 事件通道映射：
 *   serial-data   → window.linkdesk.serial.onData
 *   serial-stats  → window.linkdesk.serial.onStats
 *   serial-system → window.linkdesk.serial.onSystem
 *
 * B11 教训：listener 必须用 generation counter——StrictMode mount→unmount→mount
 * 会注册两次 listener，第一次的 cleanup 必须取消第一次的 listener 而非第二次的。
 */

import { useEffect, useRef, useState } from "react";

type IpcEventName = "serial-data" | "serial-stats" | "serial-system";

/** 事件通道 → preload 注册器映射。E5.7#98：unknown 兜底——各通道 payload 形状不同，
 *  消费方 useIpcEvent<T> 泛型自行窄化 */
const EVENT_SUBSCRIBERS: Record<IpcEventName, (cb: (payload: unknown) => void) => () => void> = {
  "serial-data":  (cb) => window.linkdesk?.serial?.onData?.(cb) ?? (() => {}),
  "serial-stats": (cb) => window.linkdesk?.serial?.onStats?.(cb) ?? (() => {}),
  "serial-system":(cb) => window.linkdesk?.serial?.onSystem?.(cb) ?? (() => {}),
};

/**
 * callback 模式——每个事件都处理。
 */
export function useIpcEvent<T = string>(
  eventName: IpcEventName,
  callback: (payload: T) => void,
) {
  const [isReady, setIsReady] = useState(false);
  const callbackRef = useRef(callback);
  callbackRef.current = callback; // 始终用最新 callback，避免 deps 导致重注册

  useEffect(() => {
    const genRef = { current: 0 };
    const gen = ++genRef.current;
    let unsubscribe: (() => void) | undefined;

    const hasIpc = !!window.linkdesk?.serial;
    const subscribe = EVENT_SUBSCRIBERS[eventName];
    // wire 是 unknown——消费方声明的 T 在此边界窄化（E5.7#98）
    unsubscribe = subscribe((payload: unknown) => {
      if (genRef.current === gen) callbackRef.current(payload as T);
    });
    if (hasIpc) {
      setIsReady(true);
    }

    return () => {
      genRef.current++;
      unsubscribe?.();
      setIsReady(false);
    };
  }, [eventName]);

  return { isReady };
}

