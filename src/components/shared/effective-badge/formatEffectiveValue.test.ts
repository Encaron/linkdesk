/**
 * formatEffectiveValue 单测（「设置控件-词表正典与共享化」阶段 3.3 · 判据 C）。
 *
 * 钉「呈现形态按值驱动、零 token 键知识」：色值配色块、字体栈截首族（去引号）、其余原样。
 * 平移自设置仓时语义一字未改，故断言即原行为。fixture 全虚构（硬约束 21）。
 */
import { describe, it, expect } from "vitest";
import { formatEffectiveValue } from "./formatEffectiveValue";

describe("formatEffectiveValue", () => {
  it("rgba/hsl 色值 ⇒ 带色块", () => {
    expect(formatEffectiveValue("rgba(30, 30, 30, 0.5)")).toEqual({
      label: "rgba(30, 30, 30, 0.5)",
      color: "rgba(30, 30, 30, 0.5)",
    });
    expect(formatEffectiveValue("hsl(210, 80%, 50%)").color).toBe("hsl(210, 80%, 50%)");
  });

  it("#hex 色值（3/4/6/8 位）⇒ 带色块", () => {
    for (const hex of ["#abc", "#abcd", "#1A8CE8", "#1A8CE8FF"]) {
      expect(formatEffectiveValue(hex)).toEqual({ label: hex, color: hex });
    }
  });

  it("字体栈 ⇒ 截首族（逗号前段）", () => {
    expect(formatEffectiveValue("-apple-system, BlinkMacSystemFont, sans-serif")).toEqual({
      label: "-apple-system",
    });
  });

  it("首族带引号 ⇒ 去引号", () => {
    expect(formatEffectiveValue('"Segoe UI", Tahoma, sans-serif').label).toBe("Segoe UI");
    expect(formatEffectiveValue("'Fira Code', monospace").label).toBe("Fira Code");
  });

  it("无逗号的普通值 ⇒ 原样、无色块", () => {
    expect(formatEffectiveValue("127.0.0.1:9333")).toEqual({ label: "127.0.0.1:9333" });
  });
});
