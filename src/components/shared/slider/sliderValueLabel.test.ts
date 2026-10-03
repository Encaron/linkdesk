/**
 * @vitest-environment jsdom
 * 滑杆值标签格式化——E5.8#77 数值显示（自设置仓迁入，2026-10-03 能力搬家）。
 * unit "×" → 倍数前缀 + 1 位小数；"px" → 数值 + 后缀；空 → 裸数值；非有限值防御。
 */

import { describe, it, expect } from "vitest";
import { formatSliderValue } from "./sliderValueLabel";

describe("formatSliderValue", () => {
  it("空 unit → 裸数值（0-1 不透明度 0.45）", () => {
    expect(formatSliderValue(0.45)).toBe("0.45");
    expect(formatSliderValue(0.45, "")).toBe("0.45");
  });

  it("px → 数值 + 后缀", () => {
    expect(formatSliderValue(16, "px")).toBe("16px");
    expect(formatSliderValue(16.5, "px")).toBe("16.5px");
  });

  it("× → 倍数前缀 + 1 位小数（mockup 倍数语义）", () => {
    expect(formatSliderValue(1, "×")).toBe("×1.0");
    expect(formatSliderValue(1.5, "×")).toBe("×1.5");
  });

  it("数值去尾零", () => {
    expect(formatSliderValue(0.5, "px")).toBe("0.5px");
    expect(formatSliderValue(2.0, "px")).toBe("2px");
  });

  it("非有限值 → 空串（防御）", () => {
    expect(formatSliderValue(NaN, "px")).toBe("");
    expect(formatSliderValue(Infinity, "px")).toBe("");
  });
});
