/**
 * formatSliderValue 单元测试——E5.8#77 slider 数值标签格式化。
 * 纯函数无 DOM——jsdom 环境零依赖，覆盖 ×倍数 / px / 裸数值 / 防御。
 */

import { describe, it, expect } from "vitest";
import { formatSliderValue } from "./sliderValueLabel";

describe("formatSliderValue — E5.8#77 slider 数值标签", () => {
  it("× 倍数——前置 + 1 位小数（mockup ×1.0）", () => {
    expect(formatSliderValue(1, "×")).toBe("×1.0");
    expect(formatSliderValue(1.5, "×")).toBe("×1.5");
    expect(formatSliderValue(0, "×")).toBe("×0.0");
    expect(formatSliderValue(2, "×")).toBe("×2.0");
  });

  it("px 像素——数值 + 后缀，去尾零", () => {
    expect(formatSliderValue(16, "px")).toBe("16px");
    expect(formatSliderValue(0, "px")).toBe("0px");
    expect(formatSliderValue(0.5, "px")).toBe("0.5px");
    expect(formatSliderValue(3.14, "px")).toBe("3.14px");
  });

  it("空单位——裸数值（0-1 不透明度直接显示）", () => {
    expect(formatSliderValue(0.45)).toBe("0.45");
    expect(formatSliderValue(1)).toBe("1");
    expect(formatSliderValue(0.35)).toBe("0.35");
    expect(formatSliderValue(0)).toBe("0");
  });

  it("防御——非有限值返回空串", () => {
    expect(formatSliderValue(NaN, "×")).toBe("");
    expect(formatSliderValue(Number.POSITIVE_INFINITY, "px")).toBe("");
    expect(formatSliderValue(Number.NaN)).toBe("");
  });
});
