/**
 * serial 域内安全订阅 hook——serial 后门推流（onData/onStats/onSystem）的 React 订阅封装。
 * E6#15h 归位（08-共享hook归位.md §三）：serial 后门是"知道对方是谁"的紧耦合专线、只有本插件消费
 * → 非 @linkdesk/ui 泛用零件，从壳 src/hooks 迁回本插件（域内代码归域）。泛用 IPC 订阅另有
 * usePluginIpcEvent（src/core/react，走通用 window.linkdesk.events.on）——两传输不同，勿混。
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
 *  消费方 useIpcEvent<T> 泛型自行窄化。
 *  E5.8#28：serial 三通道载荷对象化（SerialDataPayload/SerialStatsPayload/SerialSystemPayload，
 *  带 portName 路由键）——消费方 `useIpcEvent<SerialDataPayload>("serial-data", ...)` 取 payload.portName 过滤 */
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

