/**
 * memory-pressure-latch 单测——E6#73g（18 档 B2）。
 *
 * 覆盖点：越过阈值**只发一次**（这是 B2 的正面修复）；必须真回落才解锁；
 * 贴着阈值抖动不许骗过迟滞（B2 的死区）；回落中途没发过不产生幽灵告警。
 * 无 fixture 依赖（纯数值），不涉真实插件/文案。
 */
import { describe, it, expect } from "vitest";
import { memoryPressureLatch, MEMORY_PRESSURE_THRESHOLD, MEMORY_PRESSURE_RESET } from "./memory-pressure-latch";

const T = MEMORY_PRESSURE_THRESHOLD;

/** 连续采样——把闩值一路传下去（真运行时的形状：类字段在轮次间保持） */
function sample(series: number[]): boolean[] {
  let latched = false;
  const emitted: boolean[] = [];
  for (const rss of series) {
    const next = memoryPressureLatch(latched, rss);
    latched = next.latched;
    emitted.push(next.emit);
  }
  return emitted;
}

describe("memoryPressureLatch", () => {
  it("首次越过阈值 → 发一次", () => {
    expect(sample([T + 1])).toEqual([true]);
  });

  it("🔴 高水位持续 N 轮 → 只发第一轮（此前是每 30s 弹一次面板）", () => {
    expect(sample([T + 1, T + 500, T + 1, T + 99999])).toEqual([true, false, false, false]);
  });

  it("回落到水位以下 → 解锁；再越过 → 第二次发", () => {
    expect(sample([T + 1, MEMORY_PRESSURE_RESET - 1, T + 1])).toEqual([true, false, true]);
  });

  it("回落后没再越过 → 不发（解锁 ≠ 发一条）", () => {
    expect(sample([T + 1, MEMORY_PRESSURE_RESET - 1, T - 1])).toEqual([true, false, false]);
  });

  it("阈值下正常水位 → 永不发（含恰好等于阈值）", () => {
    expect(sample([0, 1, T, T - 1])).toEqual([false, false, false, false]);
  });

  it("🔴 死区：贴着阈值抖动不许骗过迟滞（1.001 ↔ 0.999 来回跳）", () => {
    // 抖动幅度远小于 10% 死区——一个闩周期内只该发一次
    expect(sample([T + 1, T - 1, T + 1, T - 1, T + 1])).toEqual([true, false, false, false, false]);
  });

  it("恰好落在回落水位上 → **不**解锁（判据是严格小于）", () => {
    expect(sample([T + 1, MEMORY_PRESSURE_RESET, T + 1])).toEqual([true, false, false]);
  });

  it("落地即回落的单轮抖动 → 只发一次", () => {
    expect(sample([T + 1, 0, T + 1, 0, T + 1])).toEqual([true, false, true, false, true]);
  });

  it("回落水位落在阈值之下（死区为正）——常量关系护栏", () => {
    expect(MEMORY_PRESSURE_RESET).toBeLessThan(MEMORY_PRESSURE_THRESHOLD);
  });
});
