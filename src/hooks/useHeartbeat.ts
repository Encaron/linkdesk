/**
 * useHeartbeat — JS 主线程心跳看门狗（E2a #5）。
 *
 * 每 2s 向主进程发送 heartbeat IPC。主进程若 10s 未收到心跳，
 * 判定 JS 主线程死循环/卡死，弹出原生对话框 "应用无响应" [刷新] [等待]。
 *
 * 参数设计：2s 间隔避免 Chromium 后台定时器节流误杀；
 * 10s 超时足够容忍 GC 暂停和短暂卡顿，真死循环才会触发。
 *
 * 这是检测，不是恢复——单 WebView 下无法杀掉死循环的 JS 线程。
 * E3 多 WebView 后升级为只重载卡死的 WebView。
 */

import { useEffect } from "react";

/** 心跳发送间隔——2s 不被 Chromium 节流 */
const HEARTBEAT_INTERVAL = 2000;

function sendHeartbeat(): void {
  try {
    window.linkdesk?.events?.heartbeat?.();
  } catch {
    // preload 未就绪时静默
  }
}

export function useHeartbeat(): void {
  useEffect(() => {
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    return () => clearInterval(interval);
  }, []);
}
