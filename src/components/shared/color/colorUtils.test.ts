/**
 * colorUtils——颜色解析/格式化的唯一实现（ColorPicker 2）。
 * 覆盖 hex/rgb(a)/hsl(a)、alpha 边界、变量表达式与格式输出口径。
 */

import { describe, it, expect } from "vitest";
import {
  formatColor,
  hsvToRgb,
  isCssVariableExpression,
  parseColor,
  rgbToHsv,
} from "./colorUtils";

describe("parseColor", () => {
  it("hex 3/6/8 位", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#8a6ff0")).toEqual({ r: 138, g: 111, b: 240, a: 1 });
    expect(parseColor("#8a6ff080")!.a).toBeCloseTo(128 / 255, 5);
  });

  it("rgb()/rgba()：逗号、空格、斜杠、百分比 alpha 全接受", () => {
    expect(parseColor("rgb(1, 2, 3)")).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(parseColor("rgb(1 2 3 / 50%)")).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(parseColor("rgba(255,247,230,0.62)")).toEqual({ r: 255, g: 247, b: 230, a: 0.62 });
  });

  it("hsl()/hsla()", () => {
    expect(parseColor("hsl(0, 100%, 50%)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor("hsla(120 100% 50% / 0.25)")).toEqual({ r: 0, g: 255, b: 0, a: 0.25 });
  });

  it("越界钳制", () => {
    expect(parseColor("rgba(300,0,0,1.5)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor("rgba(0,0,0,-1)")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it("非法值与 CSS 变量表达式 → null", () => {
    expect(parseColor("")).toBeNull();
    expect(parseColor("nope")).toBeNull();
    expect(parseColor("#12345")).toBeNull();
    expect(parseColor("var(--glass-tint)")).toBeNull();
    expect(parseColor("color-mix(in srgb, #fff 50%, transparent)")).toBeNull();
    expect(isCssVariableExpression(" var(--x) ")).toBe(true);
    expect(isCssVariableExpression("#fff")).toBe(false);
  });
});

describe("formatColor — 唯一输出口径", () => {
  it("allowAlpha=false 或 a=1 → hex（旧值零变化）", () => {
    expect(formatColor({ r: 138, g: 111, b: 240, a: 1 }, false)).toBe("#8a6ff0");
    expect(formatColor({ r: 138, g: 111, b: 240, a: 0.4 }, false)).toBe("#8a6ff0");
  });

  it("allowAlpha=true 且 a<1 → rgba，alpha 保留 2 位", () => {
    expect(formatColor({ r: 255, g: 247, b: 230, a: 0.62 }, true)).toBe("rgba(255,247,230,0.62)");
    expect(formatColor({ r: 255, g: 247, b: 230, a: 1 / 3 }, true)).toBe("rgba(255,247,230,0.33)");
    expect(formatColor({ r: 255, g: 247, b: 230, a: 1 }, true)).toBe("#fff7e6");
    expect(formatColor({ r: 255, g: 247, b: 230, a: 0 }, true)).toBe("rgba(255,247,230,0)");
  });
});

describe("hsv ↔ rgb", () => {
  it("往返稳定（整数色）", () => {
    for (const hex of ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#8a6ff0"]) {
      const c = parseColor(hex)!;
      const hsv = rgbToHsv(c.r, c.g, c.b);
      expect(hsvToRgb(hsv.h, hsv.s, hsv.v)).toEqual([c.r, c.g, c.b]);
    }
  });
});
