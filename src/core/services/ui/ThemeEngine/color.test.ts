/**
 * E5.8#151 tint 强制半透明——capTintAlpha 单元测试（颜色串 alpha 封顶）。
 * 覆盖：hex（3/4/6/8 位）/ rgb()/rgba()（逗号/空格 + 可选 / alpha，通道/alpha 支持 %）/
 * 已 ≤ max 零改动（aurora 0.35 原样）/ 未解析（named/hsl/var/transparent）原样。
 */

import { describe, it, expect } from "vitest";
import { capTintAlpha } from "./color";

describe("capTintAlpha — E5.8#151 tint 强制半透明", () => {
  /* ── hex ── */
  it("hex 3 位不透明 → 封顶 rgba(...,0.5)", () => {
    expect(capTintAlpha("#f00")).toBe("rgba(255,0,0,0.5)");
  });
  it("hex 6 位不透明 → 封顶（取色器主格式）", () => {
    expect(capTintAlpha("#ff0000")).toBe("rgba(255,0,0,0.5)");
    expect(capTintAlpha("#FF0000")).toBe("rgba(255,0,0,0.5)"); // 大写
  });
  it("hex 4 位 alpha >0.5 → 封顶", () => {
    expect(capTintAlpha("#f008")).toBe("rgba(255,0,0,0.5)"); // 0x8/0xf≈0.533
  });
  it("hex 8 位 alpha >0.5 → 封顶；≤0.5 → 原样", () => {
    expect(capTintAlpha("#ff000080")).toBe("rgba(255,0,0,0.5)"); // 0x80/255≈0.502
    expect(capTintAlpha("#ff000040")).toBe("#ff000040"); // 0x40/255≈0.251
  });

  /* ── rgb()/rgba() ── */
  it("rgba 逗号 alpha >0.5 → 封顶；≤0.5 → 原串零改动（aurora 先例）", () => {
    expect(capTintAlpha("rgba(255,0,0,0.8)")).toBe("rgba(255,0,0,0.5)");
    expect(capTintAlpha("rgba(59, 77, 148, 0.35)")).toBe("rgba(59, 77, 148, 0.35)");
    expect(capTintAlpha("rgba(255,0,0,0.5)")).toBe("rgba(255,0,0,0.5)"); // 恰在 cap → 原样
  });
  it("rgb 无 alpha → 不透明封顶", () => {
    expect(capTintAlpha("rgb(255,0,0)")).toBe("rgba(255,0,0,0.5)");
    expect(capTintAlpha("rgb(255 0 0)")).toBe("rgba(255,0,0,0.5)");
  });
  it("rgb 空格 + / alpha → 按 alpha 判断", () => {
    expect(capTintAlpha("rgb(255 0 0 / 0.2)")).toBe("rgb(255 0 0 / 0.2)");
    expect(capTintAlpha("rgb(255 0 0 / 0.9)")).toBe("rgba(255,0,0,0.5)");
  });
  it("alpha % 形式 → 换算 0-1", () => {
    expect(capTintAlpha("rgba(255,0,0,80%)")).toBe("rgba(255,0,0,0.5)");
    expect(capTintAlpha("rgba(255,0,0,30%)")).toBe("rgba(255,0,0,30%)");
  });
  it("rgb 通道 % → 换算 0-255", () => {
    expect(capTintAlpha("rgb(100%, 0%, 0%)")).toBe("rgba(255,0,0,0.5)");
  });

  /* ── 未解析 / 边界 ── */
  it("未解析（named/hsl/var/url）→ 原样（21-档案 范围仅 hex+rgb，不猜防误伤）", () => {
    expect(capTintAlpha("transparent")).toBe("transparent");
    expect(capTintAlpha("red")).toBe("red");
    expect(capTintAlpha("hsl(0, 100%, 50%)")).toBe("hsl(0, 100%, 50%)");
    expect(capTintAlpha("var(--glass-tint)")).toBe("var(--glass-tint)");
    expect(capTintAlpha('url("#f00")')).toBe('url("#f00")');
  });
  it("空串 / 纯空白 → 原样", () => {
    expect(capTintAlpha("")).toBe("");
    expect(capTintAlpha("   ")).toBe("   ");
  });
  it("自定义 maxAlpha 参数", () => {
    expect(capTintAlpha("rgba(255,0,0,0.35)", 0.3)).toBe("rgba(255,0,0,0.3)");
    expect(capTintAlpha("rgba(255,0,0,0.35)", 0.3)).not.toBe("rgba(255,0,0,0.5)");
  });
});
