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
import { ICON_GLOW_ON_LIGHT_INK, ICON_GLOW_ON_DARK_INK, MANAGED_TOKEN_KEYS } from "./constants";
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

  it("applyRecipe 集成——挂底图 → :root --icon-glow 暗晕（RECIPE dark 默认亮墨）；fontTone=dark 换成亮晕", () => {
    applyRemoteConfigChange("app.backgroundImage", "linkdesk-userdata://bg.png");
    applyRecipe(RECIPE, "dew");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-image")).not.toBe("");
    expect(root.style.getPropertyValue("--icon-glow")).toBe(ICON_GLOW_ON_LIGHT_INK);
    // 显式暗墨 → 晕翻转
    applyRemoteConfigChange("app.fontTone", "dark");
    applyRecipe(RECIPE, "dew");
    expect(root.style.getPropertyValue("--icon-glow")).toBe(ICON_GLOW_ON_DARK_INK);
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
