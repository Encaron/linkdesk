/**
 * 主题前景可读性 · 第 1 刀：图标反向光晕——合成单元测试（契约 [01 §二] / 任务 [04 D3·D4]）。
 * 挂底图（生效 --bg-image ≠ none/空）时按墨色极性发一道 drop-shadow（亮墨 → 暗晕，暗墨 → 亮晕）；
 * 未挂底图 → 值 none（无病不加晕，零变化回现状）。
 * 覆盖：synthesizeIconGlow 纯函数 / getIconGlowSpec 极性档 / applyRecipe+applyTheme 集成 /
 * MANAGED_TOKEN_KEYS 收录。虚构 fixture（硬约束 21）。
 */

import { describe, it, expect, beforeEach } from "vitest";
// 与 glass-surface 同例：两个函数从门面撤出（仅内部消费）——测试直引本体
import { synthesizeIconGlow } from "./tokens";
import { getIconGlowSpec } from "./seeds";
import { applyRecipe } from "../ThemeEngine";
// 光晕常量与发射清单**不从门面出**（仅引擎内部消费，facade 不暴露）——直引本体（同 glass-surface 惯例）
import { ICON_GLOW_ON_LIGHT_INK, ICON_GLOW_ON_DARK_INK, INK_POLARITY_CROSSOVER, MANAGED_TOKEN_KEYS } from "./constants";
import { colorLuminance } from "./color";
import { applyRemoteConfigChange, clearConfigurationCache } from "../../configuration/ConfigurationService";
import { RECIPE } from "./testFixtures.mock";

describe("ThemeEngine — 图标反向光晕（第 1 刀）", () => {
  beforeEach(() => {
    clearConfigurationCache();
    const root = document.documentElement;
    root.style.removeProperty("--icon-glow");
    root.style.removeProperty("--bg-image");
    root.removeAttribute("data-theme");
  });

  /* ── synthesizeIconGlow 纯函数 ── */

  it("挂底图 + 暗墨（inkLight=false）→ 亮晕；挂底图 + 亮墨（inkLight=true）→ 暗晕（单色反向）", () => {
    const dark = { "bg-image": 'url("bg.png")' } as Record<string, string>;
    synthesizeIconGlow(dark, { inkLight: false });
    expect(dark["icon-glow"]).toBe(ICON_GLOW_ON_DARK_INK);

    const light = { "bg-image": 'url("bg.png")' } as Record<string, string>;
    synthesizeIconGlow(light, { inkLight: true });
    expect(light["icon-glow"]).toBe(ICON_GLOW_ON_LIGHT_INK);
  });

  it("未挂底图（缺键 / 空串 / none）→ 值 none（无病不加晕，零变化回现状）", () => {
    for (const tokens of [
      {}, // 缺键（主题无背景图）
      { "bg-image": "" },
      { "bg-image": "   " },
      { "bg-image": "none" },
      { "bg-image": "none " }, // 判据 trim 后比对
    ] as Array<Record<string, string>>) {
      synthesizeIconGlow(tokens, { inkLight: true });
      expect(tokens["icon-glow"]).toBe("none");
    }
  });

  it("判据只认生效 --bg-image——只挂 --surface-bg-image（zones 切片）不发晕（缺口已记 04 §六）", () => {
    const tokens: Record<string, string> = { "surface-bg-image": 'url("zone.png")' };
    synthesizeIconGlow(tokens, { inkLight: true });
    expect(tokens["icon-glow"]).toBe("none");
  });

  /* ── 9.4：极性以**生效墨色**为准（text-primary 亮度），档位只兜底 ── */

  it("9.4 生效墨色亮度压过档位——亮墨 hex 即使档位说暗墨，也发暗晕", () => {
    const tokens: Record<string, string> = { "bg-image": 'url("bg.png")', "text-primary": "#4EC9B0" };
    synthesizeIconGlow(tokens, { inkLight: false });
    expect(tokens["icon-glow"]).toBe(ICON_GLOW_ON_LIGHT_INK);
  });

  it("9.4 回归：主题 type=dark ＋ 自配暗墨（档位亮）⇒ 亮晕，不再与墨同向（同向＝不隔离）", () => {
    const tokens: Record<string, string> = { "bg-image": 'url("bg.png")', "text-primary": "#1A2A2D" };
    synthesizeIconGlow(tokens, { inkLight: true });
    expect(tokens["icon-glow"]).toBe(ICON_GLOW_ON_DARK_INK);
    const pure: Record<string, string> = { "bg-image": 'url("bg.png")', "text-primary": "#1A1A1A" };
    synthesizeIconGlow(pure, { inkLight: true });
    expect(pure["icon-glow"]).toBe(ICON_GLOW_ON_DARK_INK);
  });

  it("9.4 墨色解析不出（color-mix / var / named）⇒ 回落档位判据（零行为倒退，两个方向都验）", () => {
    for (const value of ["color-mix(in srgb, var(--text-primary) 78%, transparent)", "var(--text-primary)", "hsl(200 50% 50%)", ""]) {
      const light = { "bg-image": 'url("bg.png")', "text-primary": value } as Record<string, string>;
      synthesizeIconGlow(light, { inkLight: true });
      expect(light["icon-glow"]).toBe(ICON_GLOW_ON_LIGHT_INK);
      const dark = { "bg-image": 'url("bg.png")', "text-primary": value } as Record<string, string>;
      synthesizeIconGlow(dark, { inkLight: false });
      expect(dark["icon-glow"]).toBe(ICON_GLOW_ON_DARK_INK);
    }
  });

  it("9.4 分界取等对比交叉点 0.179——刚过判亮墨（配暗晕），刚不及判暗墨（配亮晕）", () => {
    // #777777 / #757575 夹在 0.179 两侧（L≈0.1845 / 0.1780）——若把阈值取 0.5，两者都会翻错
    const above = { "bg-image": 'url("bg.png")', "text-primary": "#777777" } as Record<string, string>;
    synthesizeIconGlow(above, { inkLight: false });
    expect(above["icon-glow"]).toBe(ICON_GLOW_ON_LIGHT_INK);
    const below = { "bg-image": 'url("bg.png")', "text-primary": "#757575" } as Record<string, string>;
    synthesizeIconGlow(below, { inkLight: true });
    expect(below["icon-glow"]).toBe(ICON_GLOW_ON_DARK_INK);
  });

  it("9.4 colorLuminance——hex 3/6 位 / rgb() / 百分号通道可算；未知名颜色 → null（不猜）", () => {
    expect(colorLuminance("#fff")).toBeCloseTo(1, 5);
    expect(colorLuminance("#000")).toBeCloseTo(0, 5);
    expect(colorLuminance("rgb(255,255,255)")).toBeCloseTo(1, 5);
    expect(colorLuminance("rgb(100% 100% 100%)")).toBeCloseTo(1, 5);
    expect(colorLuminance("#4EC9B0")).toBeGreaterThan(INK_POLARITY_CROSSOVER);
    expect(colorLuminance("#1A2A2D")).toBeLessThan(INK_POLARITY_CROSSOVER);
    for (const bad of ["", "color-mix(in srgb, #fff 50%, transparent)", "var(--x)", "currentcolor", "transparent"]) {
      expect(colorLuminance(bad)).toBeNull();
    }
  });

  /* ── getIconGlowSpec 极性档（源头与 text-* 覆盖同源） ── */

  it("未显式 fontTone → 跟随配方类型（dark=亮墨 / light=暗墨）", () => {
    expect(getIconGlowSpec("dark")).toEqual({ inkLight: true });
    expect(getIconGlowSpec("light")).toEqual({ inkLight: false });
  });

  it("fontTone 显式档压过配方类型（E8：图标跟着文字极性翻）", () => {
    applyRemoteConfigChange("app.fontTone", "dark");
    expect(getIconGlowSpec("dark")).toEqual({ inkLight: false }); // 暗主题 + 暗墨 → 亮晕
    expect(getIconGlowSpec("light")).toEqual({ inkLight: false });
    clearConfigurationCache();
    applyRemoteConfigChange("app.fontTone", "light");
    expect(getIconGlowSpec("light")).toEqual({ inkLight: true }); // 亮主题 + 亮墨 → 暗晕
    expect(getIconGlowSpec("dark")).toEqual({ inkLight: true });
    clearConfigurationCache();
    applyRemoteConfigChange("app.fontTone", "followTheme"); // 非显式 → 回配方类型
    expect(getIconGlowSpec("dark")).toEqual({ inkLight: true });
  });

  /* ── 引擎发射清单 ── */

  it("--icon-glow 进 MANAGED_TOKEN_KEYS（提交时纳入管理，切换主题可清理）", () => {
    expect(MANAGED_TOKEN_KEYS).toContain("icon-glow");
  });

  /* ── applyRecipe 集成 ── */

  it("applyRecipe 集成——挂底图 → :root --icon-glow 随**生效 text-primary 亮度**翻（亮墨暗晕 / 暗墨亮晕）", () => {
    applyRemoteConfigChange("app.backgroundImage", "linkdesk-userdata://bg.png");
    const root = document.documentElement;
    const glow = (): string => root.style.getPropertyValue("--icon-glow");
    // null → NaN ⇒ 断言必挂（缺墨色时本测试失效，不许蒙混过关）
    const inkLum = (): number => colorLuminance(root.style.getPropertyValue("--text-primary")) ?? Number.NaN;

    applyRemoteConfigChange("app.fontTone", "light"); // 生效亮墨
    applyRecipe(RECIPE, "dew");
    expect(root.style.getPropertyValue("--bg-image")).not.toBe("");
    expect(inkLum()).toBeGreaterThan(INK_POLARITY_CROSSOVER);
    expect(glow()).toBe(ICON_GLOW_ON_LIGHT_INK);

    applyRemoteConfigChange("app.fontTone", "dark"); // 生效暗墨 → 晕跟着翻（E8）
    applyRecipe(RECIPE, "dew");
    expect(inkLum()).toBeLessThan(INK_POLARITY_CROSSOVER);
    expect(glow()).toBe(ICON_GLOW_ON_DARK_INK);
  });

  it("applyRecipe 集成——清底图 → --icon-glow 落 none（无病不加晕）", () => {
    applyRemoteConfigChange("app.backgroundImage", "linkdesk-userdata://bg.png");
    applyRecipe(RECIPE, "dew");
    expect(document.documentElement.style.getPropertyValue("--icon-glow")).toBe(ICON_GLOW_ON_LIGHT_INK);
    clearConfigurationCache();
    applyRecipe(RECIPE, "dew");
    expect(document.documentElement.style.getPropertyValue("--icon-glow")).toBe("none");
  });
});
