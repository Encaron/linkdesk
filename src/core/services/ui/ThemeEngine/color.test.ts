/**
 * E5.8#151 tint 强制半透明——capTintAlpha 单元测试（颜色串 alpha 封顶）。
 * 覆盖：hex（3/4/6/8 位）/ rgb()/rgba()（逗号/空格 + 可选 / alpha，通道/alpha 支持 %）/
 * 已 ≤ max 零改动（aurora 0.35 原样）/ 未解析（named/hsl/var/transparent）原样。
 */

import { describe, it, expect } from "vitest";
import { capTintAlpha, compositeColor, opaqueColor, readableSurfaceBase, resolvePolarity } from "./color";

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

  it("opaqueColor：去 alpha 保 RGB；未知颜色不猜", () => {
    expect(opaqueColor("rgba(22, 32, 62, 0.55)")).toBe("rgb(22,32,62)");
    expect(opaqueColor("#1B1B20")).toBe("rgb(27,27,32)");
    expect(opaqueColor("var(--x)")).toBeNull();
  });

  it("compositeColor：半透面压到基色上（solid 真值）；实色同 opaqueColor；不可解析 → null", () => {
    // 整窗主视觉「白色 10% 提亮层」压到月夜深底 —— 结果必须是深的，不是纯白
    expect(compositeColor("rgba(255,255,255,0.10)", "rgb(10,14,20)")).toBe("rgb(35,38,44)");
    expect(compositeColor("#1B1813", "rgb(10,14,20)")).toBe("rgb(27,24,19)");
    expect(compositeColor("rgba(10,14,20,0.30)", "rgb(10,14,20)")).toBe("rgb(10,14,20)");
    expect(compositeColor("var(--x)", "rgb(0,0,0)")).toBeNull();
  });

  it("readableSurfaceBase：白字遇白色高亮卡片 → 退深窗底；白字遇深卡 → 保留卡片色", () => {
    expect(readableSurfaceBase("#FFFFFF", ["rgba(255,255,255,0.10)", "rgba(10,14,20,0.30)"])).toBe("rgb(10,14,20)");
    expect(readableSurfaceBase("#FFFFFF", ["#2D2D2D", "#1E1E1E"])).toBe("rgb(45,45,45)");
    expect(readableSurfaceBase("#2D2D2D", ["#F5F5F5", "#FFFFFF"])).toBe("rgb(245,245,245)");
  });
});

describe("resolvePolarity — 2026-11-24 极性归一化（声明 type 只作 hint）", () => {
  it("亮底深字 → light；暗底亮字 → dark", () => {
    expect(resolvePolarity({ "text-primary": "#1F160D", "bg-window-solid": "rgb(255,255,255)" })).toBe("light");
    expect(resolvePolarity({ "text-primary": "#FFF7E6", "bg-window-solid": "rgb(10,14,20)" })).toBe("dark");
  });

  it("跨明暗配色：声明 hint 与生效 token 冲突 ⇒ 以 token 为准", () => {
    // 暗配方 + 亮色 colorway：hint=dark，但生效是亮底深字
    expect(resolvePolarity({ "text-primary": "#1F160D", "bg-card-solid": "rgb(255,253,248)" }, "dark")).toBe("light");
    // 亮配方 + 暗色 colorway
    expect(resolvePolarity({ "text-primary": "#FFF7E6", "bg-window-solid": "rgb(16,16,20)" }, "light")).toBe("dark");
  });

  it("表面键优先级：-solid > bg-window > bg-card；玻璃合成后以 solid 为准", () => {
    expect(resolvePolarity({
      "text-primary": "#FFFFFF",
      "bg-window-solid": "rgb(0,0,0)",
      "bg-window": "rgba(255,255,255,0.9)",
    })).toBe("dark");
  });

  it("解析不出 / 缺键 → 回落 hint； hint 也无 → light", () => {
    expect(resolvePolarity({ "text-primary": "var(--text-primary)", "bg-window-solid": "color-mix(in srgb, #fff 40%, transparent)" }, "dark")).toBe("dark");
    expect(resolvePolarity({})).toBe("light");
  });

  it("相等亮度按 dark（亮字压暗面）——避免黑底纯黑字被误判亮色", () => {
    expect(resolvePolarity({ "text-primary": "#777777", "bg-window-solid": "rgb(119,119,119)" })).toBe("dark");
  });
});
