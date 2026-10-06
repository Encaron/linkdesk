/**
 * formatMb —— 内存告警 MB 数值的**取整成形共享口**（归一化夹 02 批②）。
 *
 * 两处内存告警（壳 useMemoryMonitor 的 JS heap、bridges 的主进程 RSS）此前各自取整：
 * 一个 .toFixed(0)、一个 Math.round——同一件事两份实现（memory two-rulers-one-caliber）。
 *
 * ⚠️ **只收「取整成形」，不收单位换算**：两处采样口径本就不同（渲染进程 bytes vs 主进程 KB），
 * 除数留在各自调用点——⛔ 别把 /1024 与 /1024/1024 硬并成一份，那会把两种口径混为一谈。
 */
export function formatMb(mb: number): string {
  return String(Math.round(mb));
}
