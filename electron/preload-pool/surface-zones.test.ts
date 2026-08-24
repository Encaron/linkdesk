/**
 * E5.8#62 审计#3 回归守卫——surface-zones 收敛判据。
 *
 * 原判据硬编码 found===ZONE_SELECTORS.length（5）判全量挂载 → 脱出窗（仅 titlebar+main 2 zone）
 * 每切 zones 主题 15×200ms 重试风暴 + 永不归零静默放弃。新判据以「本窗实际 zone 集」为准：
 * 命中 >0 连续 2 轮稳定 = 收敛；命中 0（react mount 竞态）轮询封顶；found 增长重置稳定计数（迟挂 zone 不遗漏）。
 *
 * jsdom 无真实布局——getBoundingClientRect 全零 → 负偏移断言 "0px 0px"（确定性）。
 * fake timers 驱动 200ms 重试轮；vi.getTimerCount() 归零 = 已收敛不再调度（风暴守卫）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { measureSurfaceZones } from "./surface-zones";

/** 构建 zones 模式 DOM——documentElement 打 zones 标记 + 挂指定 class 的 zone 元素（选择器与 ZONE_SELECTORS 一致） */
function setupZones(...keys: string[]): void {
  const root = document.documentElement;
  root.style.setProperty("--surface-bg-zones", "1");
  document.body.innerHTML = "";
  for (const key of keys) {
    const el = document.createElement("div");
    el.className = key;
    document.body.appendChild(el);
  }
}

function zonePos(key: string): string {
  return document.documentElement.style.getPropertyValue(`--surface-${key}-bg-position`);
}

describe("surface-zones 收敛判据（E5.8#62 审计#3）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 清上一测试的残留 timer + 模块级计数器（zones 关 → cancelRetry）
    document.documentElement.style.removeProperty("--surface-bg-zones");
    measureSurfaceZones();
    vi.clearAllTimers();
    document.body.innerHTML = "";
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("脱出窗 2 zone——量测收敛不风暴（原 found<5 会 15×200ms 重试风暴）", () => {
    setupZones("titlebar", "main-zone");
    measureSurfaceZones();
    expect(zonePos("titlebar")).toBe("0px 0px");
    expect(zonePos("main-zone")).toBe("0px 0px");
    expect(zonePos("status-bar")).toBe(""); // 本窗不存在的 zone 不写
    // 收敛后不再调度——推完 3s timer 归零（旧实现 found<5 满 15 轮才停）
    vi.advanceTimersByTime(3000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("主窗 5 zone——全量量测后收敛", () => {
    setupZones("titlebar", "icon-bar", "side-panel", "main-zone", "status-bar");
    measureSurfaceZones();
    expect(zonePos("status-bar")).toBe("0px 0px");
    expect(zonePos("icon-bar")).toBe("0px 0px");
    expect(zonePos("side-panel")).toBe("0px 0px");
    vi.advanceTimersByTime(1000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("迟挂载 zone——命中数增长重置稳定计数，不提前收敛漏收", () => {
    setupZones("titlebar", "main-zone");
    measureSurfaceZones();
    vi.advanceTimersByTime(200); // 第 2 轮：仍 2 → stable=1（未收敛）
    // 迟挂 status-bar——found 增长 → 重置稳定计数继续轮询
    const sb = document.createElement("div");
    sb.className = "status-bar";
    document.body.appendChild(sb);
    vi.advanceTimersByTime(200); // 第 3 轮：found=3 > 2 → 量测命中迟挂 zone
    expect(zonePos("status-bar")).toBe("0px 0px");
    vi.advanceTimersByTime(600); // 收敛——不再调度
    expect(vi.getTimerCount()).toBe(0);
  });

  it("zones 模式但 0 zone——轮询封顶后静默放弃（不无限风暴）", () => {
    setupZones(); // 无任何 zone（空布局/选择器失配）
    measureSurfaceZones();
    vi.advanceTimersByTime(4000); // 超过 15×200ms 封顶
    expect(vi.getTimerCount()).toBe(0);
  });
});
