/**
 * E5.8 Phase 11.16：玻璃系统标尺化——表面合成单元测试。
 * 玻璃 = 系统表面层（非主题材质域）：玻璃激活 → 表面配色键合成半透明（color-mix 缩 alpha，
 * 半透明面透出背景/图，backdrop-filter 磨砂显形）；未激活 → 零变化回主题原生。
 * 覆盖：synthesizeGlassSurfaces 纯函数 / getGlassSurfaceSpec presence 门控 / applyRecipe+applyTheme
 * 集成 / 播种无污染。虚构 fixture（硬约束 21：demo-recipe/Demo Glass Surface）。
 */

import { describe, it, expect, beforeEach } from "vitest";
// E5.8 Phase 11.15 3b：synthesizeGlassSurfaces/getGlassSurfaceSpec 从门面撤出（仅内部消费）——测试直引本体
import { synthesizeGlassSurfaces } from "./tokens";
import { getGlassSurfaceSpec } from "./seeds";
import { applyRecipe, applyTheme, deriveAppearanceSeeds } from "../ThemeEngine";
import { SURFACE_COLOR_KEYS, GLASS_SURFACE_DEFAULT_ALPHA } from "../ThemeEngine";
import { applyRemoteConfigChange, clearConfigurationCache } from "../../configuration/ConfigurationService";
import { RECIPE } from "./testFixtures.mock";

/** 合成 color-mix 串形状（与 synthesizeGlassSurfaces 产物同构） */
function mixFor(key: string): string {
  return `color-mix(in srgb, var(--${key}-solid) calc(var(--glass-surface-alpha) * 100%), transparent)`;
}

describe("ThemeEngine — 玻璃系统标尺化（Phase 11.16）", () => {
  beforeEach(() => {
    clearConfigurationCache();
    const root = document.documentElement;
    for (const key of [
      "bg-window", "bg-card", "bg-window-solid", "bg-card-solid", "glass-surface-alpha",
      "glass-blur", "glass-opacity",
    ]) {
      root.style.removeProperty(`--${key}`);
    }
    root.removeAttribute("data-theme");
  });

  /* ── synthesizeGlassSurfaces 纯函数 ── */

  it("激活 → 表面键合成半透明 color-mix + solid 原值存档 + alpha 值；非表面键不被碰", () => {
    const tokens: Record<string, string> = {
      "bg-window": "rgba(18, 16, 12, 0.55)",
      "bg-card": "#1B1813",
      "bg-image": 'url("bg.png")',
      "bg-opacity": "0.9",
      "bg-mask": "0.3",
    };
    synthesizeGlassSurfaces(tokens, { active: true, alpha: 0.4 });
    expect(tokens["bg-window"]).toBe(mixFor("bg-window"));
    expect(tokens["bg-window-solid"]).toBe("rgba(18, 16, 12, 0.55)");
    expect(tokens["bg-card"]).toBe(mixFor("bg-card"));
    expect(tokens["bg-card-solid"]).toBe("#1B1813");
    expect(tokens["glass-surface-alpha"]).toBe("0.4");
    // 背景图/不透明度/遮罩键不在白名单——绝不碰（前缀匹配会误伤）
    expect(tokens["bg-image"]).toBe('url("bg.png")');
    expect(tokens["bg-opacity"]).toBe("0.9");
    expect(tokens["bg-mask"]).toBe("0.3");
  });

  it("未激活 → 表面键原值（零变化回主题原生）+ solid 恒写 + alpha 缺省 0.5", () => {
    const tokens: Record<string, string> = { "bg-window": "#FBF8F2", "bg-card": "#FFF0F5" };
    synthesizeGlassSurfaces(tokens, { active: false, alpha: GLASS_SURFACE_DEFAULT_ALPHA });
    expect(tokens["bg-window"]).toBe("#FBF8F2");
    expect(tokens["bg-card"]).toBe("#FFF0F5");
    expect(tokens["bg-window-solid"]).toBe("#FBF8F2"); // solid 恒写——合成引用源 + 主题素材存档
    expect(tokens["bg-card-solid"]).toBe("#FFF0F5");
    expect(tokens["glass-surface-alpha"]).toBe("0.5");
  });

  it("只合成 tokens 里存在的键——主题没写的表面色（CSS :root 壳默认）不碰；空值跳过", () => {
    const tokens: Record<string, string> = { "bg-window": "#fff" };
    synthesizeGlassSurfaces(tokens, { active: true, alpha: 0.5 });
    expect(tokens["bg-window"]).toBe(mixFor("bg-window"));
    expect(tokens["bg-titlebar"]).toBeUndefined(); // 未声明 → 不合成不写
    expect(tokens["bg-titlebar-solid"]).toBeUndefined();
    expect(tokens["bg-input"]).toBeUndefined();
    // 空值键跳过（防御：主题写了空串）
    const empty: Record<string, string> = { "bg-window": "", "bg-card": "   " };
    synthesizeGlassSurfaces(empty, { active: true, alpha: 0.5 });
    expect(empty["bg-window"]).toBe("");
    expect(empty["bg-window-solid"]).toBeUndefined();
    expect(empty["bg-card"]).toBe("   ");
  });

  it("SURFACE_COLOR_KEYS 白名单——8 表面色键，bg-image/opacity/mask 绝不在列（防前缀匹配误伤）", () => {
    expect(SURFACE_COLOR_KEYS).toEqual([
      "bg-window", "bg-titlebar", "bg-status", "bg-icon-bar", "bg-side-panel", "bg-toolbar", "bg-card", "bg-input",
    ]);
    for (const key of ["bg-image", "bg-opacity", "bg-mask", "bg-mask-color"]) {
      expect(SURFACE_COLOR_KEYS).not.toContain(key);
    }
  });

  /* ── E5.8#125 zone 切片图合成透明度（glass-surface-bg-opacity）── */

  it("#125 激活 + zone 切片图 → 派生 glass-surface-bg-opacity = 原值 × alpha（glassOpacity=0 全透见全窗背景）", () => {
    const tokens: Record<string, string> = {
      "bg-window": "#101014",
      "surface-bg-image": 'url("zone.png")',
      "surface-bg-opacity": "1",
    };
    synthesizeGlassSurfaces(tokens, { active: true, alpha: 0 });
    expect(tokens["glass-surface-bg-opacity"]).toBe("0");
    // alpha 0.4 → 0.4
    synthesizeGlassSurfaces(tokens, { active: true, alpha: 0.4 });
    expect(tokens["glass-surface-bg-opacity"]).toBe("0.4");
  });

  it("#125 激活 + 用户已设 surface-bg-opacity（#115 backgroundOpacity 双写）→ 相乘（原值 × alpha）", () => {
    const tokens: Record<string, string> = {
      "surface-bg-image": 'url("zone.png")',
      "surface-bg-opacity": "0.5",
    };
    synthesizeGlassSurfaces(tokens, { active: true, alpha: 0.6 });
    expect(tokens["glass-surface-bg-opacity"]).toBe("0.3");
  });

  it("#125 未激活 → 不写派生键（CSS 回退 surface-bg-opacity 原值，零变化）", () => {
    const tokens: Record<string, string> = { "surface-bg-image": 'url("zone.png")', "surface-bg-opacity": "0.7" };
    synthesizeGlassSurfaces(tokens, { active: false, alpha: GLASS_SURFACE_DEFAULT_ALPHA });
    expect(tokens["glass-surface-bg-opacity"]).toBeUndefined();
    expect(tokens["surface-bg-opacity"]).toBe("0.7"); // 原键不动
  });

  it("#125 激活但无 zone 切片图（surface-bg-image: none / 未写）→ 不写派生键（panorama 无 ::after 图）", () => {
    for (const tokens of [
      { "bg-image": 'url("bg.png")' }, // 无 surface-bg-image（panorama 只挂 background-layer）
      { "surface-bg-image": "none" },
      { "surface-bg-image": "" },
    ] as Array<Record<string, string>>) {
      synthesizeGlassSurfaces(tokens, { active: true, alpha: 0 });
      expect(tokens["glass-surface-bg-opacity"]).toBeUndefined();
    }
  });

  /* ── getGlassSurfaceSpec presence 门控 ── */

  it("未配置任何玻璃键 → 未激活", () => {
    expect(getGlassSurfaceSpec()).toEqual({ active: false, alpha: GLASS_SURFACE_DEFAULT_ALPHA });
  });

  it("四玻璃键各自触发激活（presence 门控——端点值也是显式意图）", () => {
    for (const [key, value] of [
      ["app.glassBlur", 12],
      ["app.glassOpacity", 1], // 端点 1 = 显式不透明意图
      ["app.glassTint", "#112233"],
      ["app.glassSaturate", 1.2],
    ] as const) {
      clearConfigurationCache();
      applyRemoteConfigChange(key, value);
      expect(getGlassSurfaceSpec().active).toBe(true);
    }
  });

  it("激活但 opacity 未写 → alpha 系统默认 0.5（拍板——全不透明主题只拖 blur 也立刻见玻璃）", () => {
    applyRemoteConfigChange("app.glassBlur", 12);
    const spec = getGlassSurfaceSpec();
    expect(spec.active).toBe(true);
    expect(spec.alpha).toBe(GLASS_SURFACE_DEFAULT_ALPHA);
  });

  it("写了 opacity → alpha 用其值（0 全透见背景 / 1 主题原生）", () => {
    applyRemoteConfigChange("app.glassOpacity", 0.4);
    expect(getGlassSurfaceSpec().alpha).toBe(0.4);
    clearConfigurationCache();
    applyRemoteConfigChange("app.glassOpacity", 1);
    expect(getGlassSurfaceSpec().alpha).toBe(1);
    clearConfigurationCache();
    applyRemoteConfigChange("app.glassOpacity", 0);
    expect(getGlassSurfaceSpec().alpha).toBe(0);
  });

  /* ── applyRecipe / applyTheme 集成 ── */

  it("applyRecipe 集成——玻璃激活 → :root 表面键 color-mix + solid + alpha；玻璃覆盖照常直写", () => {
    applyRemoteConfigChange("app.glassBlur", 15);
    applyRemoteConfigChange("app.glassOpacity", 0.4);
    applyRecipe(RECIPE, "dew");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-window")).toBe(mixFor("bg-window"));
    expect(root.style.getPropertyValue("--bg-window-solid")).toBe("#FFFBF5");
    expect(root.style.getPropertyValue("--glass-surface-alpha")).toBe("0.4");
    expect(root.style.getPropertyValue("--glass-blur")).toBe("15px"); // 覆盖直写不受合成影响
  });

  it("applyRecipe 集成——重置玻璃（清配置）→ bg-window 回主题原生（合成停），solid/alpha 恒写", () => {
    applyRemoteConfigChange("app.glassBlur", 15);
    applyRecipe(RECIPE, "dew");
    clearConfigurationCache();
    applyRecipe(RECIPE, "dew");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-window")).toBe("#FFFBF5"); // 零变化回主题原生
    expect(root.style.getPropertyValue("--bg-window-solid")).toBe("#FFFBF5"); // solid 恒写
    expect(root.style.getPropertyValue("--glass-surface-alpha")).toBe("0.5"); // alpha 缺省
    expect(root.style.getPropertyValue("--glass-blur")).toBe("14px"); // 回主题基线（RECIPE glass.blur）
  });

  it("#125 applyRecipe 集成——zone 图 + glassOpacity=0 → :root glass-surface-bg-opacity 落 0；重置玻璃回主题基线", () => {
    applyRemoteConfigChange("app.zoneBackgroundImage", "linkdesk-userdata://zone.png");
    applyRemoteConfigChange("app.glassOpacity", 0);
    applyRecipe(RECIPE, "dew");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--glass-surface-bg-opacity")).toBe("0");
    // 清 glassOpacity → 玻璃未激活 → 派生键不写（CSS 回退 surface-bg-opacity 原值 1）
    clearConfigurationCache();
    applyRecipe(RECIPE, "dew");
    expect(root.style.getPropertyValue("--glass-surface-bg-opacity")).toBe("");
  });

  it("#125 applyRecipe 集成——zone 图 + 玻璃激活默认 alpha 0.5 → 派生键 0.5（用户只拖 blur 也见切片淡出）", () => {
    applyRemoteConfigChange("app.zoneBackgroundImage", "linkdesk-userdata://zone.png");
    applyRemoteConfigChange("app.glassBlur", 15);
    applyRecipe(RECIPE, "dew");
    expect(document.documentElement.style.getPropertyValue("--glass-surface-bg-opacity")).toBe("0.5");
  });

  it("applyTheme 集成——含 bg-window 主题：未激活零变化 → 激活 surface 合成", () => {
    const theme = { name: "Demo Glass Surface", type: "dark" as const, colors: { "bg-window": "#101014", "bg-card": "#1A1A22" } };
    applyTheme(theme);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-window")).toBe("#101014");
    expect(root.style.getPropertyValue("--bg-window-solid")).toBe("#101014");
    applyRemoteConfigChange("app.glassBlur", 15);
    applyTheme(theme);
    expect(root.style.getPropertyValue("--bg-window")).toBe(mixFor("bg-window"));
    expect(root.style.getPropertyValue("--bg-card")).toBe(mixFor("bg-card"));
    expect(root.style.getPropertyValue("--bg-window-solid")).toBe("#101014");
  });

  /* ── 播种无污染 ── */

  it("播种无污染——deriveAppearanceSeeds 读 token 原值，不读合成表面键（color-mix bg-window 不干扰）", () => {
    const seeds = deriveAppearanceSeeds({
      "bg-window": mixFor("bg-window"), // 合成后的表面键
      "bg-window-solid": "#FBF8F2",
      "glass-surface-alpha": "0.4",
      "glass-opacity": "0.8", // 与原值（0.4）不同——验证读 token 非合成 alpha
      "glass-blur": "18px",
      "radius-md": "8px",
      "surface-radius": "10px",
    });
    expect(seeds.glassOpacity).toBe(0.8); // 读 --glass-opacity 原值，非合成 alpha 0.4
    expect(seeds.glassBlur).toBe(18);
    expect(seeds.surfaceRadius).toBe(8);
    expect(seeds.zoneRadiusPx).toBe(10);
  });

  it("E5.8#112 无玻璃主题播种——全哨兵（SURFACE_ZERO）→ 玻璃面不透明度默认 0.5（根治播种 1 绕过拍板默认 → 合成全实、拖 blur 无玻璃感）", () => {
    expect(deriveAppearanceSeeds({}).glassOpacity).toBe(GLASS_SURFACE_DEFAULT_ALPHA);
    // 显式全零哨兵（主题无 surface glass）同理
    expect(deriveAppearanceSeeds({
      "glass-blur": "0px",
      "glass-saturate": "1",
      "glass-tint": "transparent",
      "glass-opacity": "1",
    }).glassOpacity).toBe(GLASS_SURFACE_DEFAULT_ALPHA);
    // 配方面声明玻璃（任一键偏离哨兵）→ 反推配方面 opacity 作基线（原行为保留）
    expect(deriveAppearanceSeeds({ "glass-blur": "18px", "glass-opacity": "0.275" }).glassOpacity).toBe(0.275);
  });
});
