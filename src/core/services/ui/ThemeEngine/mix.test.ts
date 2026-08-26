/**
 * ThemeEngine/mix 单元测试——混搭合并（E5.8#50.26，10 §1/§3 每域各自取来源）。
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getMixProfile,
  mergeMixDomains,
  applyRecipe,
  applyTheme,
  getActiveRecipe,
  getCurrentTheme,
  deriveAppearanceSeeds,
  isMixSourceOwner,
  syncThemeColorEnum, // E5.8 Phase 11.14：app.themeColor 配色全集 enum 同步
  cleanupPluginFontFaces,
  MIX_FOLLOW_THEME,
} from "../ThemeEngine";
import type { MixProfile } from "../ThemeEngine";
import {
  applyRemoteConfigChange, clearConfigurationCache,
} from "../../configuration/ConfigurationService";
import { rollback } from "../../../registry/registrationTracker";
import { registerConfiguration, getMergedSchema, updateConfigurationEnum } from "../../../registry/ConfigurationRegistry";
import { ThemeRegistry } from "../../../registry/appearance/ThemeRegistry";
import { RECIPE, RECIPE_ASSET, GLASS_VARS, MOCK_THEME } from "./testFixtures.mock";
import type { ThemeRecipe } from "../../../types/theme";

describe("ThemeEngine — 混搭合并（E5.8#50.26，10 §1/§3 每域各自取来源）", () => {
  // 虚构 fixture（硬约束 21）：demo-mix 插件 + demo-recipe/demo-radius 两配方（RECIPE/RECIPE_ASSET/GLASS_VARS = testFixtures 共享）
  const PLUGIN = "demo-mix";
  // 另一配方——圆角域来源（只贡献 radius 域；颜色/字体/玻璃域归 demo-recipe）
  const RADIUS_RECIPE: ThemeRecipe = {
    id: "demo-radius",
    name: "Demo Radius",
    type: "light",
    appearance: { radius: { sm: 2, lg: 4 } },
    colorways: [{ id: "base", name: "Base", colors: {} }],
  };

  beforeEach(() => {
    clearConfigurationCache();
    rollback(PLUGIN);
    cleanupPluginFontFaces(PLUGIN);
    const root = document.documentElement;
    for (const key of [...GLASS_VARS, "bg-window", "accent", "font-ui", "radius-sm", "radius-lg"]) {
      root.style.removeProperty(`--${key}`);
    }
    root.removeAttribute("data-theme");
    ThemeRegistry.registerRecipe(RECIPE, PLUGIN);
    ThemeRegistry.registerRecipe(RADIUS_RECIPE, PLUGIN);
  });

  it("E5.8#97 getMixProfile — 缺省全 followTheme；读四域来源配置（radius/glass 来源键已删——数值域无来源）", () => {
    const p1 = getMixProfile();
    for (const d of ["colors", "font", "background", "surface"] as const) {
      expect(p1[d]).toBe(MIX_FOLLOW_THEME);
    }
    // E5.8#97：radius/glass 域不在混搭档案（来源键删）——profile 缺省 undefined → resolveDomainSource 回退基础配方
    expect(p1.radius).toBeUndefined();
    expect(p1.glass).toBeUndefined();
    applyRemoteConfigChange("app.themeColor", "mint"); // E5.8#82：colors 域来源并入 app.themeColor（app.mixColor 删）
    applyRemoteConfigChange("app.mixFont", "demo-radius");
    const p2 = getMixProfile();
    expect(p2.colors).toBe("mint");
    expect(p2.font).toBe("demo-radius");
    expect(p2.background).toBe(MIX_FOLLOW_THEME);
  });

  it("E5.8#97 mergeMixDomains — 每域各自取来源（颜色=配方+配色；字体/背景/表面=来源配方；radius/glass 无来源恒基础配方）", () => {
    const profile: MixProfile = {
      colors: "mint",
      font: MIX_FOLLOW_THEME,
      background: MIX_FOLLOW_THEME,
      surface: MIX_FOLLOW_THEME,
    };
    const tokens = mergeMixDomains(RECIPE, RECIPE.colorways[0], profile, {});
    expect(tokens["bg-window"]).toBe("#F7FBF8"); // 颜色域 → mint 配色
    expect(tokens["accent"]).toBe("#3E9E8C");
    expect(tokens["radius-lg"]).toBe("12px"); // 数值域来源已删 → 基础配方 RECIPE radius.lg=12（E5.8#97）
    expect(tokens["radius-sm"]).toBe("6px");
    expect(tokens["font-ui"]).toBe("Noto Sans SC"); // 字体域跟随 → 基础配方
    expect(tokens["glass-blur"]).toBe("14px"); // 玻璃域来源已删 → 基础配方 RECIPE glass.blur=14（E5.8#97）
  });

  it("E5.8#104 mergeMixDomains — 配方圆角 clamp 进标尺（domainTokens case radius 同单配方 flattenAppearance 规）", () => {
    const pillBase: ThemeRecipe = {
      id: "demo-pill-base",
      name: "Demo Pill Base",
      type: "dark",
      appearance: {
        radius: { xs: 999, sm: 999, md: 999, lg: 999, xl: 999, "2xl": 999, pill: 999, full: 999 },
      },
      colorways: [{ id: "base", name: "Base", colors: {} }],
    };
    const profile: MixProfile = {
      colors: "base",
      font: MIX_FOLLOW_THEME,
      background: MIX_FOLLOW_THEME,
      surface: MIX_FOLLOW_THEME,
    };
    const tokens = mergeMixDomains(pillBase, pillBase.colorways[0], profile, {});
    // radius/glass 无来源键 → 恒基础配方 → domainTokens case "radius" clamp 进标尺
    for (const key of ["radius-xs", "radius-sm", "radius-md", "radius-lg", "radius-xl", "radius-2xl", "radius-pill"]) {
      expect(tokens[key]).toBe("32px");
    }
    expect(tokens["radius-full"]).toBeUndefined();
  });

  it("mergeMixDomains — 来源配方缺失 → 回退基础配方（域不空窗）", () => {
    const profile: MixProfile = {
      colors: "mint",
      font: "demo-missing",
      background: MIX_FOLLOW_THEME,
      surface: MIX_FOLLOW_THEME,
    };
    const tokens = mergeMixDomains(RECIPE, RECIPE.colorways[0], profile, {});
    expect(tokens["font-ui"]).toBe("Noto Sans SC"); // 缺失来源 → 基础配方兜底
    expect(tokens["bg-window"]).toBe("#F7FBF8"); // 颜色域仍按来源
  });

  it("E5.8#97 applyRecipe mix — 配色跟颜色域来源；radius/glass 恒基础配方；明暗/activeRecipe 跟基础配方", () => {
    applyRemoteConfigChange("app.appearanceMode", "custom");
    applyRemoteConfigChange("app.themeColor", "mint"); // E5.8#82：colors 域来源 = app.themeColor
    applyRecipe(RECIPE, "dew", {});
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-window")).toBe("#F7FBF8"); // 颜色域 → mint
    expect(root.style.getPropertyValue("--accent")).toBe("#3E9E8C");
    expect(root.style.getPropertyValue("--radius-lg")).toBe("12px"); // 数值域来源已删 → 基础配方 radius.lg=12（#97）
    expect(root.style.getPropertyValue("--glass-blur")).toBe("14px"); // 玻璃域来源已删 → 基础配方 glass.blur=14（#97）
    expect(root.getAttribute("data-theme")).toBe("dark"); // 明暗跟基础配方
    expect(getActiveRecipe()).toEqual({ recipeId: "demo-recipe", colorwayId: "dew" });
    expect(getCurrentTheme()?.colors.accent).toBe("#3E9E8C"); // 快照 accent 跟混搭颜色域来源
  });

  it("E5.8#59 审计#7——applyRecipe mix：currentTheme.background 取背景域来源（非基础配方）；glass 无来源恒基础配方", () => {
    // 虚构 fixture：背景域来源 demo-bg——基础配方 RECIPE 无 background、glass.blur=14
    const BG_SRC: ThemeRecipe = {
      id: "demo-bg", name: "Demo Bg", type: "light",
      appearance: { background: { image: "assets/b.png", opacity: 0.8, mask: 0.3 } },
      colorways: [{ id: "c", name: "C", colors: {} }],
    };
    ThemeRegistry.registerRecipe(BG_SRC, PLUGIN);
    applyRemoteConfigChange("app.appearanceMode", "custom");
    applyRemoteConfigChange("app.mixBackground", "demo-bg");
    applyRecipe(RECIPE, "dew", {});
    const t = getCurrentTheme();
    expect(t?.background?.image).toBe("assets/b.png"); // 背景域来源 demo-bg（修复前 undefined）
    expect(t?.background?.opacity).toBe(0.8);
    expect(t?.surface?.blur).toBe(14); // 玻璃域来源已删（E5.8#97）→ 恒基础配方 RECIPE blur 14
    expect(t?.colors.accent).toBe("#2BA876"); // 颜色域 followTheme → 基础配方 dew——域独立性零回归
  });

  it("applyRecipe mix — mixFont 资产字体来源 → 族名写 --font-ui + @font-face 落 DOM", () => {
    ThemeRegistry.registerRecipe(RECIPE_ASSET, PLUGIN);
    applyRemoteConfigChange("app.appearanceMode", "custom");
    applyRemoteConfigChange("app.mixFont", "demo-font-recipe");
    applyRecipe(RECIPE, "dew", {});
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--font-ui")).toBe("__ld_demo-mix_DemoFont"); // 资产 → 两步换族名
    expect(document.getElementById("ld-ff-__ld_demo-mix_DemoFont")).not.toBeNull();
    expect(root.style.getPropertyValue("--bg-window")).toBe("#FFFBF5"); // 颜色域跟随 → dew
  });

  it("E5.8#58 审计#1——mix 下 zones 背景不被 surface 域零值吞掉（surface-bg-* 归 background 域）", () => {
    const ZONES: ThemeRecipe = {
      id: "demo-zones", name: "Demo Zones", type: "light",
      appearance: { background: { mode: "zones", image: "assets/z.png", opacity: 0.9 } },
      colorways: [{ id: "c", name: "C", colors: {} }],
    };
    ThemeRegistry.registerRecipe(ZONES, PLUGIN);
    applyRemoteConfigChange("app.appearanceMode", "custom");
    applyRemoteConfigChange("app.mixBackground", "demo-zones");
    // mixSurface 缺省 followTheme → 基础配方（RECIPE 无 texture）——修复前 surface 域 SURFACE_ZERO 写 zones:0 吞掉切片
    const profile = getMixProfile();
    const tokens = mergeMixDomains(RECIPE, RECIPE.colorways[0], profile, {});
    expect(tokens["surface-bg-zones"]).toBe("1");
    expect(tokens["surface-bg-image"]).toBe('url("assets/z.png")');
    expect(tokens["surface-bg-repeat"]).toBe("no-repeat");
    // surface 域自身零值不残留吞切片
    expect(tokens["surface-bg-image"]).not.toBe("none");
  });

  it("E5.8#58 审计#5——mix 来源配方存在但缺该域 → 回退基础配方该域（域不空窗）", () => {
    // E5.8#97：radius/glass 来源键已删——缺域回退改由幸存域（font）验证（原 demo-noradius 圆角来源场景不再可达）
    const NO_FONT: ThemeRecipe = {
      id: "demo-nofont", name: "Demo NoFont", type: "light",
      appearance: { radius: { sm: 4 } },
      colorways: [{ id: "c", name: "C", colors: {} }],
    };
    ThemeRegistry.registerRecipe(NO_FONT, PLUGIN);
    const profile: MixProfile = {
      colors: MIX_FOLLOW_THEME,
      font: "demo-nofont", // 来源存在但无 font 域
      background: MIX_FOLLOW_THEME,
      surface: MIX_FOLLOW_THEME,
    };
    const tokens = mergeMixDomains(RECIPE, RECIPE.colorways[0], profile, {});
    expect(tokens["font-ui"]).toBe("Noto Sans SC"); // 回退基础配方 RECIPE font.ui
    expect(tokens["radius-sm"]).toBe("6px"); // radius 无来源恒基础配方 RECIPE radius.sm=6（E5.8#97）
  });

  it("E5.8#58 审计#6——registerRecipe({colorways:[]}) + applyRecipe 空配色不崩（resolveColorway 兜底）", () => {
    const EMPTY: ThemeRecipe = {
      id: "demo-empty", name: "Demo Empty", type: "light",
      appearance: { radius: { sm: 4 } },
      colorways: [],
    };
    ThemeRegistry.registerRecipe(EMPTY, PLUGIN);
    expect(() => applyRecipe(EMPTY, undefined, {})).not.toThrow();
    // 空配色 → 无颜色 token，radius 仍写
    expect(document.documentElement.style.getPropertyValue("--radius-sm")).toBe("4px");
  });

  it("E5.8#85 混搭播种——deriveAppearanceSeeds 读生效 token 绝对值（mix 下 radius-md = 混搭来源生效值，#57 二次缩放根治随比例模型废弃）", () => {
    // 生效 token 即混搭来源合并结果——播种绝对值直播，无「分母 ÷ 来源」概念（旧 20÷8=2.5 → 20×2=40 暴涨根治）
    expect(deriveAppearanceSeeds({ "radius-md": "20px", "surface-radius": "0px" }).surfaceRadius).toBe(20);
    expect(deriveAppearanceSeeds({ "radius-md": "8px", "surface-radius": "10px" }).surfaceRadius).toBe(8);
    expect(deriveAppearanceSeeds({ "radius-md": "20px", "surface-radius": "0px" }).zoneRadiusPx).toBe(0);
    // mix 圆角来源 20px 直播播种 = 20（无覆盖 = 视觉不变；旧逻辑分母变来源 20 → scale 1 同收敛）
    expect(deriveAppearanceSeeds({ "radius-md": "20px" }).surfaceRadius).toBe(20);
  });

  it("E5.8#61 审计#1——isMixSourceOwner：mix 域配置引用其配方/配色 → true；引用他人/未引用 → false", () => {
    // E5.8#82：colors 域来源只在 mix 模式成立（recipe 模式下 themeColor 是真配色 id 非混搭来源）——先置 mix
    applyRemoteConfigChange("app.appearanceMode", "custom");
    // 初始无 mix 配置（beforeEach 未设 app.mix*）→ 全 followTheme → false
    expect(isMixSourceOwner(PLUGIN)).toBe(false);
    // 颜色域 = 配色粒度：RECIPE 的 mint 配色归 demo-mix → true（E5.8#82 colors 域来源 = app.themeColor）
    applyRemoteConfigChange("app.themeColor", "mint");
    expect(isMixSourceOwner(PLUGIN)).toBe(true);
    // 引用 demo-mix 配方但对 demo-other 是 false（归属精确到插件）
    expect(isMixSourceOwner("demo-other")).toBe(false);
    // 清空颜色域 → 回 false
    applyRemoteConfigChange("app.themeColor", MIX_FOLLOW_THEME);
    expect(isMixSourceOwner(PLUGIN)).toBe(false);
    // 背景域 = 配方粒度：demo-recipe 归 demo-mix → true（E5.8#97：radius 来源键删，改用幸存域背景）
    applyRemoteConfigChange("app.mixBackground", "demo-recipe");
    expect(isMixSourceOwner(PLUGIN)).toBe(true);
    applyRemoteConfigChange("app.mixBackground", MIX_FOLLOW_THEME);
    expect(isMixSourceOwner(PLUGIN)).toBe(false);
  });

  it("E5.8 Phase 11.14 syncThemeColorEnum — custom 模式 = followTheme + 全配方配色（跨主题配色全集——修复「只当前配方可写」不一致）", () => {
    // 最小配置注册——app.appearanceMode + app.themeColor 进 ConfigurationRegistry（updateConfigurationEnum 消费面）；
    // 注册归 demo-mix → beforeEach rollback(PLUGIN) 自动回收（无需手动 clearConfigurationRegistrations）。
    registerConfiguration(PLUGIN, {
      title: "Demo",
      properties: {
        "app.appearanceMode": { type: "string", default: "followTheme", description: "" },
        "app.themeColor": { type: "string", default: "", description: "" },
      },
    });
    applyRemoteConfigChange("app.appearanceMode", "custom");
    syncThemeColorEnum();
    // RECIPE（dew/mint）+ RADIUS_RECIPE（base）——custom 下全集含跨配方配色；
    // 旧逻辑 enum 只含活动配方配色 → setConfigurationValue 拒绝跨主题写入（用户所见「只有该主题配色可用」）
    expect(getMergedSchema()["app.themeColor"].enum).toEqual([MIX_FOLLOW_THEME, "dew", "mint", "base"]);
  });

  it("E5.8 Phase 11.14 syncThemeColorEnum — followTheme 模式 = 当前活动配方配色（配方内变体）", () => {
    registerConfiguration(PLUGIN, {
      title: "Demo",
      properties: {
        "app.appearanceMode": { type: "string", default: "followTheme", description: "" },
        "app.themeColor": { type: "string", default: "", description: "" },
      },
    });
    applyRecipe(RECIPE, "dew", {}); // 设活动配方（getActiveRecipe 生效）
    syncThemeColorEnum();
    expect(getMergedSchema()["app.themeColor"].enum).toEqual(["dew", "mint"]);
  });

  it("E5.8 Phase 11.14 syncThemeColorEnum — 无活动配方 → 保留上次 enum（不置空——避免下拉变输入框，与 syncAppThemeEnum 同哲学）", () => {
    registerConfiguration(PLUGIN, {
      title: "Demo",
      properties: {
        "app.appearanceMode": { type: "string", default: "followTheme", description: "" },
        "app.themeColor": { type: "string", default: "", description: "" },
      },
    });
    updateConfigurationEnum("app.themeColor", ["dew"]); // 模拟上次 enum
    applyTheme(MOCK_THEME); // flat 应用清 recipe 态（apply.ts 内 setActiveRecipe(null, null)）——模拟无活动配方
    expect(getActiveRecipe()).toBeNull();
    expect(() => syncThemeColorEnum()).not.toThrow();
    expect(getMergedSchema()["app.themeColor"].enum).toEqual(["dew"]);
  });
});
