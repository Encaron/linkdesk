/**
 * ThemeEngine/recipe 单元测试——mergeDomains 合并算法（E5.8#50.16，05 §4 继承链）。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mergeDomains, applyOverrides, applyRadiusAbsolute } from "../ThemeEngine";
import { clearConfigurationCache } from "../../configuration/ConfigurationService";
import type { ThemeRecipe } from "../../../types/theme";

describe("ThemeEngine — Recipe 合并算法 mergeDomains（E5.8#50.16，05 §4 继承链）", () => {
  const RECIPE: ThemeRecipe = {
    id: "demo-recipe",
    name: "Demo Recipe",
    type: "dark",
    appearance: {
      radius: { sm: 6, lg: 12 },
      glass: { type: "glass", blur: 14, tint: "rgba(255,255,255,0.4)", radius: 10 },
      font: { ui: "Noto Sans SC", mono: "JetBrains Mono" },
      background: { image: "assets/bg.png", opacity: 0.8 },
      surface: { "menu-blur": 12, "menu-radius": "lg" },
    },
    colorways: [
      { id: "dew", name: "露", colors: { "bg-window": "#FFFBF5", accent: "#2BA876" } },
      { id: "mint", name: "薄荷", colors: { "bg-window": "#F7FBF8", accent: "#3E9E8C" } },
    ],
  };
  const RADIUS_KEYS = ["radius-xs", "radius-sm", "radius-md", "radius-lg", "radius-xl", "radius-2xl"];

  beforeEach(() => {
    clearConfigurationCache();
    const root = document.documentElement;
    for (const key of ["bg-window", "accent", "glass-blur", "bg-image", "font-ui", ...RADIUS_KEYS]) {
      root.style.removeProperty(`--${key}`);
    }
  });

  it("appearance 稀疏 flatten + 当前 colorway 稀疏覆盖", () => {
    const tokens = mergeDomains(RECIPE, "dew", {});
    expect(tokens["radius-sm"]).toBe("6px");
    expect(tokens["radius-lg"]).toBe("12px");
    expect(tokens["glass-blur"]).toBe("14px"); // surfaceVariables（glass 域全机制）
    expect(tokens["font-ui"]).toBe("Noto Sans SC");
    expect(tokens["font-mono"]).toBe("JetBrains Mono");
    expect(tokens["bg-image"]).toBe('url("assets/bg.png")'); // backgroundVariables 包 url()
    expect(tokens["surface-menu-blur"]).toBe("12"); // per-surface pass-through
    expect(tokens["surface-menu-radius"]).toBe("lg");
    // 颜色域稀疏覆盖
    expect(tokens["bg-window"]).toBe("#FFFBF5");
    expect(tokens.accent).toBe("#2BA876");
    // 缺的键/域不写——pill/full 形态值不在 appearance.radius 子集 → 缺省
    expect(tokens["radius-pill"]).toBeUndefined();
    expect(tokens["radius-full"]).toBeUndefined();
  });

  it("colorwayId 缺省 = 配方首配色；未知 id 回退首配色", () => {
    expect(mergeDomains(RECIPE, undefined, {})["bg-window"]).toBe("#FFFBF5");
    expect(mergeDomains(RECIPE, "no-such", {})["accent"]).toBe("#2BA876");
  });

  it("E5.8#85 overrides radius 绝对 px → applyOverrides 路径换算（md 档 = 滑杆值；主题无 md → 直角无层级等值）", () => {
    const tokens = mergeDomains(RECIPE, "dew", { "radius-lg": 12 });
    expect(tokens["radius-lg"]).toBe("12px"); // md 档 = 滑杆值
    expect(tokens["radius-sm"]).toBe("12px"); // 主题 radius.sm 6 / md 缺省 → 等值滑杆
    expect(tokens["radius-md"]).toBe("12px"); // md 缺省 → 壳默认 0 → 等值（不再恒写 0px 清残留）
    expect(tokens["radius-pill"]).toBe("32px"); // radius 覆盖生效 → pill 注入标尺上限（主题无 pill）
  });

  it("overrides 绝对 token → 覆盖主题值（glass-blur 绝对覆盖胜过 appearance.glass.blur）", () => {
    const tokens = mergeDomains(RECIPE, "dew", { "glass-blur": "24px" });
    expect(tokens["glass-blur"]).toBe("24px");
  });

  it("E5.8#85 applyOverrides — radius 绝对 px 换算（md 档 = 滑杆值）；非 radius 绝对写", () => {
    const tokens = { "radius-md": "10px", "glass-blur": "8px" };
    applyOverrides(tokens, { "radius-md": 2, "glass-blur": "16px" });
    expect(tokens["radius-md"]).toBe("2px"); // md 档 = 滑杆值 2（主题 md 10 → 比例 1 → 2px）
    expect(tokens["glass-blur"]).toBe("16px");
  });

  it("E5.8#85 applyOverrides — radius 覆盖生效时 radius-pill clamp 进标尺（主题 999px 胶囊 → 32）", () => {
    const tokens = { "radius-md": "8px", "radius-pill": "999px" };
    applyOverrides(tokens, { "radius-md": 16 });
    expect(tokens["radius-md"]).toBe("16px");
    expect(tokens["radius-pill"]).toBe("32px");
  });

  it("E5.8#85 applyOverrides — radius 覆盖生效且主题无 pill（壳 :root 静态）→ 注入 32px 标尺上限（CDP 实机补齐）", () => {
    const tokens: Record<string, string> = { "radius-md": "8px" }; // 无 pill 键
    applyOverrides(tokens, { "radius-md": 16 });
    expect(tokens["radius-md"]).toBe("16px");
    expect(tokens["radius-pill"]).toBe("32px");
  });

  it("E5.8#85 applyOverrides — 无 radius 覆盖 → pill 原样（followTheme 主题自带胶囊不 clamp）", () => {
    const tokens = { "radius-md": "8px", "radius-pill": "999px" };
    applyOverrides(tokens, { "glass-blur": "16px" });
    expect(tokens["radius-md"]).toBe("8px");
    expect(tokens["radius-pill"]).toBe("999px");
  });

  it("E5.8#85 applyRadiusAbsolute(absPx, tokens) — 有现值按比例；无现值用壳默认（0px → 0）", () => {
    const scaled = applyRadiusAbsolute(8, { "radius-md": "6px" });
    expect(scaled["radius-md"]).toBe("8px");
    expect(scaled["radius-sm"]).toBe("0px"); // 无现值 → 壳默认 0px → 0
    for (const key of RADIUS_KEYS) expect(scaled[key]).toBeDefined();
    expect(scaled["radius-pill"]).toBeUndefined();
  });
});
