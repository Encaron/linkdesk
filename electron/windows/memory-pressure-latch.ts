/**
 * 内存压力上升沿闩——E6#73g（18 档 §五 G 配套 / B2）。
 *
 * **为什么单独一个文件**：这段是**状态机**，而 off-by-one 恰好住在状态机的边界上
 * （「回落解锁」写反 → 高水位期间要么永不再发、要么每轮都发）。抽成纯函数即可单测穷举，
 * 与同目录 `focus-router.ts` 同一条理由：纯函数，单测独立、不起 Electron。
 *
 * **被替代的旧行为**：`checkMemoryPressure()` 此前**无迟滞、无「已警告过」状态**——
 * 只要 Working Set 挂着超阈值，每 30s 就发一条新 id 的 toast ⇒ 通知面板被**每 30 秒弹一次**，
 * 用户关一次弹一次（18 档 B2 实证）。
 */

/** RSS 超过 1GB 触发告警（MemoryInfo.workingSetSize 单位是 KB） */
export const MEMORY_PRESSURE_THRESHOLD = 1024 * 1024; // 1GB = 1,048,576 KB

/**
 * 回落水位——迟滞的另一半。回到这个值以下才解锁下一次告警。
 *
 * 取 0.9 而非 1.0：贴着阈值抖动（1.001 ↔ 0.999）每一轮都会被判成「新的一次越过」，
 * 迟滞形同虚设——留 10% 死区把抖动吃掉。壳内 `useMemoryMonitor` 的 80%/70% 是同一条思路
 * （那里是 JS heap 占比，这里是进程 Working Set 绝对值；两个面各测各的，不合并）。
 */
export const MEMORY_PRESSURE_RESET = MEMORY_PRESSURE_THRESHOLD * 0.9; // 921,600 KB

/**
 * 一次采样 → 该不该发 + 下一轮的闩值。纯函数，无副作用、无模块状态。
 *
 * 顺序要紧：**先判回落再判越过**。反过来的话，高水位期间闩恒为 true ⇒ 永远进不了回落分支
 * ⇒ 解锁永不发生（本轮修的就是「永不发」的反面，别再写歪）。
 *
 * @param latched 上一轮的闩（true = 已发过、还没回落）
 * @param totalRSS 本轮采样的 Working Set（KB）
 */
export function memoryPressureLatch(
  latched: boolean,
  totalRSS: number,
  threshold: number = MEMORY_PRESSURE_THRESHOLD,
  resetAt: number = MEMORY_PRESSURE_RESET,
): { latched: boolean; emit: boolean } {
  if (latched && totalRSS < resetAt) return { latched: false, emit: false };
  if (!latched && totalRSS > threshold) return { latched: true, emit: true };
  return { latched, emit: false };
}
