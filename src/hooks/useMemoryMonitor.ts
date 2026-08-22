/**
 * useMemoryMonitor — 内存使用监控（E2a #6）。
 *
 * 每 10s 采样 `performance.memory`（Chromium 专有 API），
 * JS heap > 80% 限制 → toast 告警。
 *
 * 对标 VS Code 的 memory watch 机制，但更轻量。
 * E5.8#2：recordMount/recordUnmount（插件基线泄漏检测）已删——零消费方（E2a #6 预留未接线）。
 */

import { useEffect, useRef } from "react";
import { pushToast } from "../core/services/ui/NotificationService";

/** JS heap 使用率超过此阈值时告警 */
const HEAP_WARNING_RATIO = 0.8;
/** 采样间隔 ms */
const POLL_INTERVAL = 10_000;

// E5.7#98：Chromium 专有 performance.memory——非标准 API，窄类型声明替代 as any
interface ChromiumMemory {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
  totalJSHeapSize?: number;
}

function getChromiumMemory(): ChromiumMemory | undefined {
  return (performance as Performance & { memory?: ChromiumMemory }).memory;
}

/**
 * 全局内存监控——App mount 时调用一次。
 * 每 10s 检查 JS heap 使用率，> 80% → toast 告警。
 */
export function useMemoryMonitor(): void {
  const lastWarnedRef = useRef(false);

  useEffect(() => {
    const mem = getChromiumMemory();
    if (!mem) return; // 非 Chromium 内核——静默

    const interval = setInterval(() => {
      const ratio = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
      if (ratio > HEAP_WARNING_RATIO && !lastWarnedRef.current) {
        lastWarnedRef.current = true;
        const usedMB = (mem.usedJSHeapSize / 1024 / 1024).toFixed(0);
        const limitMB = (mem.jsHeapSizeLimit / 1024 / 1024).toFixed(0);
        pushToast({
          message: `内存使用率偏高（${usedMB}MB / ${limitMB}MB），建议关闭不活跃的插件`,
          severity: "warning",
        });
      }
      // 回落到 70% 以下 → 重置告警状态，下次再超阈值可以再次告警
      if (ratio < 0.7) {
        lastWarnedRef.current = false;
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, []);
}
