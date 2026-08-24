/**
 * E5.8#65：inferSliderStep 推导测试——浮点区间/窄跨度 → 0.01，整数宽区间 → 1。
 * 覆盖真实消费者：glassOpacity(0-1) / surfaceRadius(0.5-2) / glassBlur(0-32)。
 */

import { describe, it, expect } from "vitest";
import { inferSliderStep } from "./sliderStep";

describe("inferSliderStep — 滑杆 step 推导", () => {
  it("玻璃不透明度 0-1（整端点窄跨度）→ 0.01 连续（bug 2 根因用例）", () => {
    expect(inferSliderStep(0, 1)).toBe(0.01);
  });

  it("圆角缩放 0.5-2（浮点端点）→ 0.01 连续（bug 3 根因用例）", () => {
    expect(inferSliderStep(0.5, 2)).toBe(0.01);
  });

  it("玻璃模糊 0-32（整数宽区间）→ 1 现状零回归", () => {
    expect(inferSliderStep(0, 32)).toBe(1);
  });

  it("整数宽区间（如字号 8-72）→ 1", () => {
    expect(inferSliderStep(8, 72)).toBe(1);
  });

  it("整数窄跨度 0-2 → 0.01（三档对连续滑杆太粗）", () => {
    expect(inferSliderStep(0, 2)).toBe(0.01);
  });

  it("浮点端点 + 整数端点混合 0-1.5 → 0.01", () => {
    expect(inferSliderStep(0, 1.5)).toBe(0.01);
  });

  it("min === max 退化 → 0.01（不崩）", () => {
    expect(inferSliderStep(5, 5)).toBe(0.01);
  });
});
