/**
 * ThemeEngine/apply 单元测试——applyTheme（flat 桥）/ applyRecipe / getActiveRecipe / getEffectiveTokens。
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  applyTheme,
  getCurrentTheme,
  applyRecipe,
  getActiveRecipe,
  getEffectiveTokens,
  syncThemeColorConfig,
} from "../ThemeEngine";
import {
  applyRemoteConfigChange, clearConfigurationCache, getConfigurationValue,
} from "../../configuration/ConfigurationService";
import type { ThemeRecipe } from "../../../types/theme";
import { MOCK_THEME, MOCK_THEME2, RECIPE, RECIPE_NO_COLOR, GLASS_VARS } from "./testFixtures.mock";

describe("ThemeEngine — applyTheme / getCurrentTheme", () => {
  beforeEach(() => {
    // 清理旧 CSS 变量
    const root = document.documentElement;
    for (const key of ["bg", "fg", "accent"]) {
      root.style.removeProperty(`--${key}`);
    }
    root.removeAttribute("data-theme");
  });

  it("applyTheme — 设置 CSS 变量到 :root", () => {
    applyTheme(MOCK_THEME);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg")).toBe("#000");
    expect(root.style.getPropertyValue("--fg")).toBe("#fff");
    expect(root.style.getPropertyValue("--accent")).toBe("#ff0000");
  });

  it("applyTheme — 设置 data-theme 属性", () => {
    applyTheme(MOCK_THEME);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("applyTheme — 新主题清理旧主题的 CSS 变量", () => {
    applyTheme(MOCK_THEME);
    applyTheme(MOCK_THEME2);
    const root = document.documentElement;
    // 旧主题的变量（accent）应被清除
    expect(root.style.getPropertyValue("--accent")).toBe("");
    // 新主题的变量存在
    expect(root.style.getPropertyValue("--bg")).toBe("#fff");
    expect(root.style.getPropertyValue("--fg")).toBe("#000");
  });

  it("getCurrentTheme — applyTheme 后返回当前主题", () => {
    applyTheme(MOCK_THEME);
    expect(getCurrentTheme()?.name).toBe("Test Dark");
  });
});

describe("ThemeEngine — applyRecipe / getActiveRecipe / getEffectiveTokens（E5.8#50.16）", () => {
  // RECIPE / RECIPE_NO_COLOR / GLASS_VARS = testFixtures 共享 fixture
  beforeEach(() => {
    clearConfigurationCache();
    const root = document.documentElement;
    for (const key of [...GLASS_VARS, "bg-window", "accent", "font-ui", "radius-sm", "radius-lg"]) {
      root.style.removeProperty(`--${key}`);
    }
    root.removeAttribute("data-theme");
  });

  it("applyRecipe — 写 :root 生效 token + data-theme + getActiveRecipe", () => {
    applyRecipe(RECIPE, "dew", {});
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--radius-lg")).toBe("12px");
    expect(root.style.getPropertyValue("--glass-blur")).toBe("14px");
    expect(root.style.getPropertyValue("--font-ui")).toBe("Noto Sans SC");
    expect(root.style.getPropertyValue("--bg-window")).toContain("color-mix(in srgb, var(--bg-window-solid)");
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(getActiveRecipe()).toEqual({ recipeId: "demo-recipe", colorwayId: "dew" });
  });

  it("applyRecipe — colorwayId 指定配色生效", () => {
    applyRecipe(RECIPE, "mint", {});
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#3E9E8C");
    expect(getActiveRecipe()?.colorwayId).toBe("mint");
  });

  it("applyRecipe — flat 快照同步（getCurrentTheme 兼容 bridge 消费方）", () => {
    applyRecipe(RECIPE, "mint", {});
    const t = getCurrentTheme();
    expect(t?.name).toBe("Demo Recipe");
    expect(t?.type).toBe("dark");
    expect(t?.colors.accent).toBe("#3E9E8C");
    expect(t?.surface?.blur).toBe(14); // appearance.glass → flat surface
  });

  it("换配方 — 陈旧 token 清理（前配方 glass-blur/color 不残留）", () => {
    applyRecipe(RECIPE, "dew", {});
    applyRecipe(RECIPE_NO_COLOR, "plain", {});
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--glass-blur")).toBe("");
    expect(root.style.getPropertyValue("--font-ui")).toBe("");
    expect(root.style.getPropertyValue("--accent")).toBe("");
    expect(root.style.getPropertyValue("--bg-window")).toBe("#FAFAFA");
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(getActiveRecipe()).toEqual({ recipeId: "demo-plain", colorwayId: "plain" });
  });

  it("getEffectiveTokens — 读当前生效 token 集（含壳默认继承的玻璃零值）", () => {
    applyRecipe(RECIPE, "dew", {});
    const tokens = getEffectiveTokens();
    expect(tokens["glass-blur"]).toBe("14px");
    expect(tokens["bg-window"]).toContain("color-mix(in srgb, var(--bg-window-solid)");
    expect(tokens["radius-lg"]).toBe("12px");
    expect(tokens["font-ui"]).toBe("Noto Sans SC");
  });

  it("applyRecipe 后 applyTheme（flat 桥）→ recipe 态清空", () => {
    applyRecipe(RECIPE, "dew", {});
    applyTheme({ name: "Test Light", type: "light", colors: { bg: "#fff" } });
    expect(getActiveRecipe()).toBeNull();
  });

  // E5.8#84：广播载荷剔除 accent 组四键（含 text-on-accent）——theme:changed 携带 recipe accent 与 accent:changed 两条
  // IPC 在池侧跨帧落地 → --accent 振荡 → .toggle.on transition 反复重启 = 开关闪（CDP 实测 11 次紫↔红）。
  // 壳 :root 全量写（含 accent）不动——与 applyAccentColor 同任务无跨帧机会。
  it("applyRecipe — 广播 theme:changed 剔除 accent 组四键（壳 :root 仍写 accent）", () => {
    const payloads: unknown[] = [];
    const linkdesk = (window as unknown as { linkdesk?: { bridge?: { broadcast: (ch: string, p: unknown) => void } } }).linkdesk;
    const original = linkdesk?.bridge?.broadcast;
    linkdesk!.bridge = { broadcast: (ch, p) => payloads.push({ ch, p }) };
    try {
      applyRecipe(RECIPE, "dew", {});
      const root = document.documentElement;
      // 壳 :root 仍写 --accent（theme:changed 全量变量的副作用，随后 applyAccentColor 覆盖）
      expect(root.style.getPropertyValue("--accent")).toBe("#2BA876");
      const themeChanged = payloads.find((p) => (p as { ch: string }).ch === "theme:changed") as { p: { variables: Record<string, string> } } | undefined;
      expect(themeChanged).toBeDefined();
      const vars = themeChanged!.p.variables;
      expect(vars["accent"]).toBeUndefined();
      expect(vars["accent-hover"]).toBeUndefined();
      expect(vars["accent-light"]).toBeUndefined();
      expect(vars["text-on-accent"]).toBeUndefined();
      expect(vars["bg-window"]).toContain("color-mix(in srgb, var(--bg-window-solid)"); // 非 accent 键正常携带（玻璃主题已合成）
      expect(vars["radius-lg"]).toBe("12px");
    } finally {
      if (original) linkdesk!.bridge = { broadcast: original }; else delete linkdesk!.bridge;
    }
  });

  // E5.8#70：app.themeColor 回写生效配色——bug 7 复制为空 / #60 F1.2 下拉谎报同源修复
  it("syncThemeColorConfig — 回写生效配色 id（缺省 colorwayId → 配方首配色）", () => {
    applyRecipe(RECIPE, undefined, {});
    expect(getActiveRecipe()?.colorwayId).toBe("dew");
    expect(syncThemeColorConfig(RECIPE)).toBe(true);
    expect(getConfigurationValue("app.themeColor")).toBe("dew");
  });

  it("syncThemeColorConfig — 值已一致不写（幂等，防 onApply 重入死循环）", () => {
    applyRecipe(RECIPE, "mint", {});
    syncThemeColorConfig(RECIPE); // 首次写
    expect(getConfigurationValue("app.themeColor")).toBe("mint");
    expect(syncThemeColorConfig(RECIPE)).toBe(false); // 二次——值已一致
    expect(getConfigurationValue("app.themeColor")).toBe("mint");
  });

  it("syncThemeColorConfig — 失效 storedColor 兜底 → 覆盖旧值为生效配色（F1.2 UI 谎报）", () => {
    applyRemoteConfigChange("app.themeColor", "stale-old"); // 旧配方配色 id
    applyRecipe(RECIPE, "stale-old", {}); // resolveColorway 兜底 → colorways[0]
    expect(getActiveRecipe()?.colorwayId).toBe("dew");
    expect(syncThemeColorConfig(RECIPE)).toBe(true);
    expect(getConfigurationValue("app.themeColor")).toBe("dew");
  });

  it("syncThemeColorConfig — custom 用户有效选择保留（值一致不覆盖）", () => {
    applyRemoteConfigChange("app.themeColor", "mint");
    applyRecipe(RECIPE, "mint", {});
    expect(getActiveRecipe()?.colorwayId).toBe("mint");
    expect(syncThemeColorConfig(RECIPE)).toBe(false);
    expect(getConfigurationValue("app.themeColor")).toBe("mint");
  });
});

describe("applyRecipe — 高对比轴使用作者配色（2026-11-24 去重）", () => {
  const HIGH_RECIPE: ThemeRecipe = {
    id: "demo-high",
    name: "Demo High",
    type: "dark",
    colorways: [
      { id: "base", name: "Base", colors: { "bg-window": "rgba(10, 14, 20, 0.40)", "text-primary": "#FFFFFF", accent: "#FFB85C" } },
      { id: "hi-dark", name: "High Dark", colors: { "bg-window": "#000000", "text-primary": "#FFFFFF" }, traits: { contrast: "high" } },
      { id: "hi-light", name: "High Light", colors: { "bg-window": "#FFFFFF", "text-primary": "#000000" }, traits: { contrast: "high" } },
    ],
  };

  beforeEach(() => {
    clearConfigurationCache();
  });

  it("标准档 → 用用户选择的普通配色", () => {
    applyRecipe(HIGH_RECIPE, "base", {});
    expect(getEffectiveTokens()["bg-window"]).toBe("rgba(10, 14, 20, 0.40)");
    expect(getActiveRecipe()?.colorwayId).toBe("base");
  });

  it("高对比档 → 取同极性作者高对比配色的色彩，用户选择不变", () => {
    applyRemoteConfigChange("app.contrastMode", "high");
    applyRecipe(HIGH_RECIPE, "base", {});
    expect(getEffectiveTokens()["bg-window"]).toBe("#000000");
    expect(getActiveRecipe()?.colorwayId).toBe("base");
  });
});
