/**
 * usePluginIpcEvent——插件侧安全 IPC 事件订阅 Hook
 *
 * E3a #28：IPC 回调模板——供插件 React 组件使用。
 * 封装三个关键模式：
 *
 *   1. ref 桥接——callbackRef 始终持有最新回调
 *      （防 B86 闭包过期：IPC 回调里用到 React state 时，state 值永远是注册时的快照）
 *   2. cleanup——组件 unmount 时自动取消订阅（防内存泄漏）
 *   3. 超时——可选，长时间无事件自动取消订阅
 *
 * 使用示例（对标 useIpcEvent，但走通用 events channel）：
 *
 *   function TerminalView() {
 *     const [text, setText] = useState("");
 *     // callback 里用到 text，但 text 是 state——闭包会过期
 *     // ref 桥接确保总是读到最新值
 *     const textRef = useRef(text);
 *     textRef.current = text;
 *
 *     usePluginIpcEvent("serial:data", (payload: string) => {
 *       setText(textRef.current + payload); // 读最新 text，不是过期快照
 *     });
 *   }
 *
 * 注意：如果 callback 只用 setState 的函数式更新器（prev => prev + x），
 * 则不需要 ref 桥接——函数式更新器本身不读闭包中的 state。
 */

import { useEffect, useRef } from "react";

export function usePluginIpcEvent<T = unknown>(
  channel: string,
  callback: (payload: T) => void,
  opts?: {
    /** 超时后自动取消订阅（ms）。默认永不超时。 */
    timeout?: number;
  }
): void {
  // ── ref 桥接——始终用最新 callback ──
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const linkdesk = window.linkdesk;
    if (!linkdesk?.events?.on) {
      console.warn(`[usePluginIpcEvent] window.linkdesk.events 不可用——preload 未就绪？channel=${channel}`);
      return;
    }

    // 订阅——on() 内部做 channel 过滤。
    // E5.7#97：events.on 载荷面是 unknown（自由字符串通道）——本 hook 泛型 T 是通道契约的具型层，
    // 边界一处 cast：真载荷形状由订阅通道的双方约定保证。
    const unsubscribe = linkdesk.events.on(channel, (payload) => {
      callbackRef.current(payload as T);
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (opts?.timeout && opts.timeout > 0) {
      timer = setTimeout(() => {
        unsubscribe();
      }, opts.timeout);
    }

    // cleanup：unmount 时取消订阅 + 清除超时
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [channel, opts?.timeout]);
}
