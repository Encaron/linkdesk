/**
 * useMemoryMonitor — 内存使用监控（E2a #6）。
 *
 * 每 10s 采样 `performance.memory`（Chromium 专有 API），
 * JS heap > 80% 限制 → toast 告警。
 *
 * `recordMount(pluginId)` / `recordUnmount(pluginId)` ——
 * 插件 mount 记录基线，unmount 对比——检测是否泄漏。
 * 注意：GC 运行时机影响精度——仅趋势检测，不能定位泄漏源。
 *
 * 对标 VS Code 的 memory watch 机制，但更轻量。
 */

import { useEffect, useRef } from "react";
import { pushToast } from "../core/toast";

/** JS heap 使用率超过此阈值时告警 */
const HEAP_WARNING_RATIO = 0.8;
/** 采样间隔 ms */
const POLL_INTERVAL = 10_000;

// 模块级基线注册表——插件 mount → 记录基线，unmount → 对比
const baselines = new Map<string, number>();

export function recordMount(pluginId: string): void {
  if (!(performance as any).memory) return;
  baselines.set(pluginId, (performance as any).memory.usedJSHeapSize);
}

export function recordUnmount(pluginId: string): { delta: number } {
  if (!(performance as any).memory) return { delta: 0 };
  const baseline = baselines.get(pluginId);
  baselines.delete(pluginId);
  if (baseline === undefined) return { delta: 0 };
  return { delta: (performance as any).memory.usedJSHeapSize - baseline };
}

/**
 * 全局内存监控——App mount 时调用一次。
 * 每 10s 检查 JS heap 使用率，> 80% → toast 告警。
 */
export function useMemoryMonitor(): void {
  const lastWarnedRef = useRef(false);

  useEffect(() => {
    const mem = (performance as any).memory as
      | { usedJSHeapSize: number; jsHeapSizeLimit: number }
      | undefined;
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
