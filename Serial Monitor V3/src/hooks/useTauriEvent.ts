import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

/**
 * 安全订阅 Tauri 事件（callback 模式，每个事件都处理）。
 * 内部封装 generation counter 模式防 React StrictMode 双重注册。
 */
export function useTauriEvent<T = string>(
  eventName: string,
  callback: (payload: T) => void,
) {
  const [isReady, setIsReady] = useState(false);
  const callbackRef = useRef(callback);
  callbackRef.current = callback; // 始终用最新 callback，避免 deps 导致重注册

  useEffect(() => {
    const genRef = { current: 0 };
    const gen = ++genRef.current;
    let unlisten: (() => void) | undefined;

    listen<T>(eventName, (event) => {
      if (genRef.current === gen) callbackRef.current(event.payload);
    })
      .then((fn) => {
        if (genRef.current === gen) {
          unlisten = fn;
          setIsReady(true);
        } else {
          fn();
        }
      })
      .catch(() => {});

    return () => {
      genRef.current++;
      unlisten?.();
      setIsReady(false);
    };
  }, [eventName]);

  return { isReady };
}

/**
 * 安全订阅 Tauri 事件（state 模式，只保留最新 payload）。
 */
export function useTauriEventState<T = string>(eventName: string) {
  const [data, setData] = useState<T | null>(null);
  const { isReady } = useTauriEvent<T>(eventName, (payload) => setData(payload));
  return { data, isReady };
}
