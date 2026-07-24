/**
 * useHeartbeat — JS 主线程心跳看门狗（E2a #5）。
 *
 * 每 500ms 向主进程发送 heartbeat IPC。主进程若 2s 未收到心跳，
 * 判定 JS 主线程死循环/卡死，弹出原生对话框 "应用无响应" [刷新] [等待]。
 *
 * 这是检测，不是恢复——单 WebView 下无法杀掉死循环的 JS 线程。
 * E3 多 WebView 后升级为只重载卡死的 WebView。
 *
 * 用法：App 组件 mount 时调用一次 useHeartbeat()。
 */
import { useEffect } from "react";

const HEARTBEAT_INTERVAL = 500; // ms

function sendHeartbeat(): void {
  try {
    (window as any).linkdesk?.events?.heartbeat();
  } catch {
    // preload 未就绪时静默——心跳是安全气囊，不崩应用
  }
}

export function useHeartbeat(): void {
  useEffect(() => {
    sendHeartbeat(); // 首次立即发送
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    return () => clearInterval(interval);
  }, []);
}
