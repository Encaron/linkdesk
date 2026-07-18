import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

/**
 * 安全订阅 Tauri 事件。
 * 内部封装 generation counter 模式防 React StrictMode 双重注册。
 *
 * @returns data — 最新事件 payload，isReady — 监听注册完毕
 */
export function useTauriEvent<T = string>(eventName: string) {
  const [data, setData] = useState<T | null>(null);
  const [isReady, setIsReady] = useState(false);
  const genRef = useRef(0);

  useEffect(() => {
    const gen = ++genRef.current;
    let unlisten: (() => void) | undefined;

    listen<T>(eventName, (event) => {
      if (genRef.current === gen) setData(event.payload);
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

  return { data, isReady };
}
