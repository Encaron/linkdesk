/**
 * ThemeEngine 单元测试——register/unregister/getAvailable/loadTheme/applyTheme/回退到 CSS 兜底。
 * #36l1：核心 Registry/Service 层 vitest 覆盖。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerTheme,
  unregisterTheme,
  getAvailableThemes,
  getThemesByPlugin,
  loadTheme,
  applyTheme,
  findTheme,
  getCurrentTheme,
  registerFallbackThemes,
  getThemeVariables,
  getAppearanceOverrides,
  applyRadiusAbsolute,
  applyOverrides,
  mergeDomains,
  applyRecipe,
  getActiveRecipe,
  getEffectiveTokens,
  isAssetFontPath,
  ensureFontFace,
  resolveRecipeFonts,
  cleanupPluginFontFaces,
  ensurePluginFontFacesCleanup,
  deriveAppearanceSeeds,
  deriveAppearanceSeedMap,
  deriveReseedPlan,
  getThemeBaseTokens,
  getAppliedAccent,
  applyAccentColor,
  getEffectiveAccentColor,
  deriveRadiusAbsoluteMigration,
  deriveGlassOpacityAbsoluteMigration,
  resolveMergedAppearanceMode,
  normalizeThemeValue,
  getMixProfile,
  mergeMixDomains,
  MIX_FOLLOW_THEME,
  syncThemeColorConfig,
  APPEARANCE_OVERRIDE_KEYS,
  isMixSourceOwner,
  CONFIG_NONE_SENTINEL,
  SYSTEM_FONT_STACK,
  SYSTEM_MONO_FONT_STACK,
  FONT_TONE_LIGHT_TEXT,
  FONT_TONE_DARK_TEXT,
  FONT_TONE_TEXT_KEYS,
} from "./ThemeEngine";
import type { MixProfile } from "./ThemeEngine";
import { rollback } from "../../registry/registrationTracker";
import { ThemeRegistry, parseThemeRecipe } from "../../registry/appearance/ThemeRegistry";
import {
  applyRemoteConfigChange, clearConfigurationCache, getConfigurationValue, hasConfigurationValue,
} from "../configuration/ConfigurationService";
import type { Theme } from "./ThemeEngine";
import type { ThemeRecipe } from "../../types/theme";
import fs from "node:fs";
import path from "node:path";

const MOCK_THEME: Theme = {
  name: "Test Dark",
  type: "dark",
  colors: { bg: "#000", fg: "#fff", accent: "#ff0000" },
};

const MOCK_THEME2: Theme = {
  name: "Test Light",
  type: "light",
  colors: { bg: "#fff", fg: "#000" },
};

/* 真实主题 JSON 读取 helper（模块级单份，避免 jscpd 同款复制）——
 * 读 plugins/user/theme-* 真实 recipe 文件 → parseThemeRecipe → 返回 { raw, recipe }。 */
const ROOT = process.cwd();
function loadRealRecipe(rel: string, id: string, label: string, uiTheme: "light" | "dark") {
  const raw = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const recipe = parseThemeRecipe(JSON.parse(raw), { id, label, uiTheme, path: rel });
  return { raw, recipe };
}

/* 共享配方 fixture（虚构值，硬约束 21）——applyRecipe / 资产字体 / 混搭 三组 describe 复用：
 * 模块级单份定义，避免 jscpd 同款复制（每 describe 各写一份 = 重复代码）。 */
const RECIPE: ThemeRecipe = {
  id: "demo-recipe",
  name: "Demo Recipe",
  type: "dark",
  appearance: {
    radius: { sm: 6, lg: 12 },
    glass: { type: "glass", blur: 14 },
    font: { ui: "Noto Sans SC" },
  },
  colorways: [
    { id: "dew", name: "露", colors: { "bg-window": "#FFFBF5", accent: "#2BA876" } },
    { id: "mint", name: "薄荷", colors: { "bg-window": "#F7FBF8", accent: "#3E9E8C" } },
  ],
};
const RECIPE_NO_COLOR: ThemeRecipe = {
  id: "demo-plain",
  name: "Demo Plain",
  type: "light",
  colorways: [{ id: "plain", name: "Plain", colors: { "bg-window": "#FAFAFA" } }],
};
const RECIPE_ASSET: ThemeRecipe = {
  id: "demo-font-recipe",
  name: "Demo Font Recipe",
  type: "dark",
  appearance: { font: { ui: "./resources/DemoFont.woff2" } },
  colorways: [{ id: "base", name: "Base", colors: { "bg-window": "#101014" } }],
};
const GLASS_VARS = ["glass-blur", "glass-saturate", "glass-tint", "glass-opacity", "glass-specular", "glass-specular-color", "glass-morph"];

describe("ThemeEngine — registerTheme / unregisterTheme", () => {
  beforeEach(() => {
    // 清理当前主题状态
    for (const name of getAvailableThemes()) {
      unregisterTheme(name);
    }
  });

  it("registerTheme — 注册后 getAvailableThemes 包含该主题", () => {
    registerTheme(MOCK_THEME);
    expect(getAvailableThemes()).toContain("Test Dark");
  });

  it("registerTheme — 带 pluginId 时 getThemesByPlugin 可查询", () => {
    registerTheme(MOCK_THEME, "my-plugin");
    expect(getThemesByPlugin("my-plugin")).toContain("Test Dark");
  });

  it("registerTheme — 内部存储 pluginId 到 Theme 对象", () => {
    registerTheme(MOCK_THEME, "my-plugin");
    const theme = findTheme("Test Dark");
    expect(theme?.pluginId).toBe("my-plugin");
  });

  it("registerTheme — 覆盖无 pluginId 的 fallback 主题不告警", () => {
    // Fallback themes have no pluginId
    registerTheme({ name: "Dark", type: "dark", colors: {} });
    // Plugin theme overwrites fallback — should not warn (only logged)
    registerTheme({ name: "Dark", type: "dark", colors: { bg: "#111" } }, "theme-dark");
    const theme = findTheme("Dark");
    expect(theme?.pluginId).toBe("theme-dark");
  });

  it("unregisterTheme — 注销后 getAvailableThemes 不含该主题", () => {
    registerTheme(MOCK_THEME);
    unregisterTheme("Test Dark");
    expect(getAvailableThemes()).not.toContain("Test Dark");
  });

  // E5.8#12：unregisterPluginThemes 已删——插件主题经 tracker 逆序回滚（rollback 同语义）
  it("卸载回滚 — 插件主题经 rollback 清空（getThemesByPlugin 同步摘除）", () => {
    registerTheme(MOCK_THEME, "my-plugin");
    registerTheme(MOCK_THEME2, "my-plugin");
    rollback("my-plugin");
    expect(getAvailableThemes()).not.toContain("Test Dark");
    expect(getAvailableThemes()).not.toContain("Test Light");
    expect(getThemesByPlugin("my-plugin")).toEqual([]);
  });

  it("卸载回滚 — 不影响其他插件的主题", () => {
    registerTheme(MOCK_THEME, "plugin-a");
    registerTheme(MOCK_THEME2, "plugin-b");
    rollback("plugin-a");
    expect(getAvailableThemes()).toContain("Test Light");
    expect(getAvailableThemes()).not.toContain("Test Dark");
  });
});

describe("ThemeEngine — loadTheme / findTheme", () => {
  beforeEach(() => {
    for (const name of getAvailableThemes()) {
      unregisterTheme(name);
    }
  });

  it("loadTheme — 已注册主题返回 Theme 对象", async () => {
    registerTheme(MOCK_THEME);
    const theme = await loadTheme("Test Dark");
    expect(theme.name).toBe("Test Dark");
    expect(theme.colors.bg).toBe("#000");
  });

  it("loadTheme — 未注册主题抛异常", async () => {
    await expect(loadTheme("Nonexistent")).rejects.toThrow("not found");
  });

  it("findTheme — 已注册返回 Theme，未注册返回 undefined", () => {
    registerTheme(MOCK_THEME);
    expect(findTheme("Test Dark")).toBeDefined();
    expect(findTheme("Nonexistent")).toBeUndefined();
  });
});

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

describe("ThemeEngine — surface/background 玻璃机制（E5.8#50.6）", () => {
  // 玻璃/背景/悬浮零值变量——applyTheme 每次全量写入，测试间清理防残留
  const GLASS_VARS = [
    "glass-blur", "glass-saturate", "glass-tint", "glass-opacity",
    "glass-specular", "glass-morph", "bg-image", "bg-opacity", "bg-mask",
    "surface-radius", "surface-inset", "surface-shadow",
  ];
  beforeEach(() => {
    const root = document.documentElement;
    for (const key of GLASS_VARS) {
      root.style.removeProperty(`--${key}`);
    }
    root.removeAttribute("data-theme");
  });

  it("无 surface/background 的主题 → 写入玻璃零值（无玻璃无图无悬浮）", () => {
    applyTheme(MOCK_THEME);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--glass-blur")).toBe("0px");
    expect(root.style.getPropertyValue("--glass-saturate")).toBe("1");
    expect(root.style.getPropertyValue("--glass-tint")).toBe("transparent");
    expect(root.style.getPropertyValue("--glass-opacity")).toBe("1");
    expect(root.style.getPropertyValue("--glass-specular")).toBe("0");
    expect(root.style.getPropertyValue("--glass-morph")).toBe("0ms");
    expect(root.style.getPropertyValue("--bg-image")).toBe("none");
    expect(root.style.getPropertyValue("--bg-opacity")).toBe("1");
    expect(root.style.getPropertyValue("--bg-mask")).toBe("0");
    expect(root.style.getPropertyValue("--surface-radius")).toBe("0px");
    expect(root.style.getPropertyValue("--surface-inset")).toBe("0px");
    expect(root.style.getPropertyValue("--surface-shadow")).toBe("none");
  });

  it("带 glass surface → 写入玻璃六键", () => {
    applyTheme({
      ...MOCK_THEME,
      surface: { type: "glass", blur: 18, saturate: 1.5, tint: "rgba(0,0,0,0.2)", opacity: 0.9, specular: 0.6, morph: 400 },
    });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--glass-blur")).toBe("18px");
    expect(root.style.getPropertyValue("--glass-saturate")).toBe("1.5");
    expect(root.style.getPropertyValue("--glass-tint")).toBe("rgba(0,0,0,0.2)");
    expect(root.style.getPropertyValue("--glass-opacity")).toBe("0.9");
    expect(root.style.getPropertyValue("--glass-specular")).toBe("0.6");
    expect(root.style.getPropertyValue("--glass-morph")).toBe("400ms");
  });

  it("带 specularColor glass → 写入 glass-specular-color（E5.8#63 高光基色契约化）", () => {
    applyTheme({
      ...MOCK_THEME,
      surface: { type: "glass", specular: 0.6, specularColor: "#ffe08a" },
    });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--glass-specular")).toBe("0.6");
    expect(root.style.getPropertyValue("--glass-specular-color")).toBe("#ffe08a");
    // 缺省（无 specularColor）→ SURFACE_ZERO 白
    applyTheme({ ...MOCK_THEME, surface: { type: "glass", specular: 0.4 } });
    expect(root.style.getPropertyValue("--glass-specular-color")).toBe("#ffffff");
  });

  it("带悬浮面板 surface → 写入 radius/shadow（shadow:true → 映射 --shadow-lift）；inset 宿主派生 2px（缝法则）", () => {
    applyTheme({ ...MOCK_THEME, surface: { type: "glass", radius: 10, shadow: true } });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-radius")).toBe("10px");
    expect(root.style.getPropertyValue("--surface-inset")).toBe("2px");
    expect(root.style.getPropertyValue("--surface-shadow")).toBe("var(--shadow-lift)");
  });

  it("带 background → 写入 bg-image（url 包裹）/opacity/mask", () => {
    applyTheme({ ...MOCK_THEME, background: { image: "assets/aurora.jpg", opacity: 0.9, mask: 0.88 } });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-image")).toBe('url("assets/aurora.jpg")');
    expect(root.style.getPropertyValue("--bg-opacity")).toBe("0.9");
    expect(root.style.getPropertyValue("--bg-mask")).toBe("0.88");
  });

  it("带 maskColor background → 写入 bg-mask-color（E5.8#63 遮罩基色契约化）；zones 模式不写（同 mask）", () => {
    applyTheme({ ...MOCK_THEME, background: { image: "bg.png", mask: 0.3, maskColor: "#0a1e3f" } });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-mask")).toBe("0.3");
    expect(root.style.getPropertyValue("--bg-mask-color")).toBe("#0a1e3f");
    // zones 模式——mask/maskColor 均不写（切片挂 zone 表面，遮罩不适用）
    applyTheme({ ...MOCK_THEME, background: { image: "bg.png", mode: "zones", mask: 0.3, maskColor: "#0a1e3f" } });
    expect(root.style.getPropertyValue("--bg-mask")).not.toBe("0.3");
    expect(root.style.getPropertyValue("--bg-mask-color")).toBe("#000000"); // 回到 BACKGROUND_ZERO 默认
  });

  it("玻璃主题切回无质感主题 → 玻璃变量清零不残留", () => {
    applyTheme({ ...MOCK_THEME, surface: { type: "glass", blur: 18, radius: 10 }, background: { image: "bg.png" } });
    applyTheme(MOCK_THEME2);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--glass-blur")).toBe("0px");
    expect(root.style.getPropertyValue("--surface-radius")).toBe("0px");
    expect(root.style.getPropertyValue("--bg-image")).toBe("none");
  });

  it("getThemeVariables — 键不带 -- 前缀（与广播/池侧 --${k} 注入惯例一致）", () => {
    const vars = getThemeVariables({
      ...MOCK_THEME,
      surface: { type: "glass", blur: 12 },
      background: { image: "bg.png" },
    });
    expect(vars["glass-blur"]).toBe("12px");
    expect(vars["bg-image"]).toBe('url("bg.png")');
    expect(vars.bg).toBe("#000");
    expect(vars["--bg"]).toBeUndefined();
  });

  it("带 surface.texture → 写 per-surface 纹理变量（repeat + opacity，无 glass 也可用）", () => {
    applyTheme({
      ...MOCK_THEME,
      surface: { texture: "linkdesk://demo-zones/paper.svg", textureOpacity: 0.45, radius: 8 },
    });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-bg-image")).toBe('url("linkdesk://demo-zones/paper.svg")');
    expect(root.style.getPropertyValue("--surface-bg-repeat")).toBe("repeat");
    expect(root.style.getPropertyValue("--surface-bg-opacity")).toBe("0.45");
    expect(root.style.getPropertyValue("--surface-bg-zones")).toBe("0");
    // glass 变量仍零值——纹理与 glass 正交
    expect(root.style.getPropertyValue("--glass-blur")).toBe("0px");
  });

  it("无 glass 的 surface（⑬⑭ 分区）→ radius 生效；inset 宿主派生 2px（悬浮形态与玻璃材质正交）", () => {
    applyTheme({ ...MOCK_THEME, surface: { texture: "tile.svg", radius: 8 } });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-radius")).toBe("8px");
    expect(root.style.getPropertyValue("--surface-inset")).toBe("2px");
    expect(root.style.getPropertyValue("--surface-bg-image")).toBe('url("tile.svg")');
    // 玻璃键仍零值——无 glass type 不写玻璃
    expect(root.style.getPropertyValue("--glass-blur")).toBe("0px");
  });

  it("background.mode=zones → 写 per-surface 切片变量（no-repeat + zones 标记），不铺全窗 bg-image", () => {
    applyTheme({
      ...MOCK_THEME,
      background: { mode: "zones", image: "linkdesk://demo-zones/bg.svg", opacity: 0.95 },
    });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-bg-image")).toBe('url("linkdesk://demo-zones/bg.svg")');
    expect(root.style.getPropertyValue("--surface-bg-repeat")).toBe("no-repeat");
    expect(root.style.getPropertyValue("--surface-bg-zones")).toBe("1");
    expect(root.style.getPropertyValue("--surface-bg-opacity")).toBe("0.95");
    expect(root.style.getPropertyValue("--bg-image")).toBe("none");
  });

  it("background 无 mode（默认 panorama）→ 现全窗语义不变", () => {
    applyTheme({ ...MOCK_THEME, background: { image: "bg.png", opacity: 0.9 } });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-image")).toBe('url("bg.png")');
    expect(root.style.getPropertyValue("--surface-bg-zones")).toBe("0");
    expect(root.style.getPropertyValue("--surface-bg-image")).toBe("none");
  });

  it("无 surface 无 background → per-surface 背景零值（zones 0 / image none / 5 zone 位置 0 0）", () => {
    applyTheme(MOCK_THEME);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-bg-zones")).toBe("0");
    expect(root.style.getPropertyValue("--surface-bg-image")).toBe("none");
    expect(root.style.getPropertyValue("--surface-main-zone-bg-position")).toBe("0 0");
    expect(root.style.getPropertyValue("--surface-status-bar-bg-position")).toBe("0 0");
  });

  it("zones 主题切回无质感主题 → per-surface 变量清零不残留", () => {
    applyTheme({ ...MOCK_THEME, background: { mode: "zones", image: "bg.svg" } });
    applyTheme(MOCK_THEME2);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-bg-zones")).toBe("0");
    expect(root.style.getPropertyValue("--surface-bg-image")).toBe("none");
    expect(root.style.getPropertyValue("--surface-titlebar-bg-position")).toBe("0 0");
  });
});

describe("ThemeEngine — registerFallbackThemes", () => {
  it("registerFallbackThemes — 注册 dark/light 壳内置配方且幂等", () => {
    registerFallbackThemes();
    expect(ThemeRegistry.getRecipe("dark")).toBeDefined();
    expect(ThemeRegistry.getRecipe("light")).toBeDefined();
    // 幂等——重复调用不重复注册
    const before = ThemeRegistry.getRecipes().length;
    registerFallbackThemes();
    expect(ThemeRegistry.getRecipes().length).toBe(before);
  });

  it("normalizeThemeValue — legacy Dark/Light → 壳内置配方 id，其余恒等", () => {
    expect(normalizeThemeValue("Dark")).toBe("dark");
    expect(normalizeThemeValue("Light")).toBe("light");
    // 配方 id / 未迁移 json 名 / 空值恒等
    expect(normalizeThemeValue("mint-soda")).toBe("mint-soda");
    expect(normalizeThemeValue("薄荷苏打 Mint Soda")).toBe("薄荷苏打 Mint Soda");
    expect(normalizeThemeValue(undefined)).toBeUndefined();
  });
});

describe("ThemeEngine — 外观覆盖 getAppearanceOverrides（E5.8#50.10）", () => {
  const RADIUS_KEYS = ["radius-xs", "radius-sm", "radius-md", "radius-lg", "radius-xl", "radius-2xl"];
  // E5.8#80：带 glass.surface.radius=10 的配方——zone 圆角第二通道测试基准（--surface-radius=10px）
  const ZONE_RECIPE: ThemeRecipe = {
    id: "demo-zone-radius",
    name: "Demo Zone Radius",
    type: "dark",
    appearance: {
      radius: { sm: 6, lg: 12 },
      glass: { type: "glass", blur: 14, radius: 10 },
    },
    colorways: [{ id: "base", name: "Base", colors: { "bg-window": "#101014" } }],
  };
  const GLASS_VARS = [
    "glass-blur", "glass-opacity", "glass-tint", "bg-image",
  ];
  beforeEach(() => {
    clearConfigurationCache(); // 清空上一测试的 applyRemoteConfigChange 残留
    const root = document.documentElement;
    for (const key of [...GLASS_VARS, ...RADIUS_KEYS]) {
      root.style.removeProperty(`--${key}`);
    }
  });

  it("E5.8#85 neutral 默认 → radius 不覆盖（presence 门控），玻璃/背景不覆盖", () => {
    const overrides = getAppearanceOverrides();
    expect(overrides["glass-blur"]).toBeUndefined();
    expect(overrides["glass-opacity"]).toBeUndefined();
    expect(overrides["glass-tint"]).toBeUndefined();
    expect(overrides["bg-image"]).toBeUndefined();
    for (const key of RADIUS_KEYS) expect(overrides[key]).toBeUndefined(); // 无覆盖 = 主题圆角
    expect(overrides["surface-radius"]).toBeUndefined();
  });

  it("glassBlur 偏离默认 → glass-blur 覆盖", () => {
    applyRemoteConfigChange("app.glassBlur", 15);
    expect(getAppearanceOverrides()["glass-blur"]).toBe("15px");
  });

  it("glassOpacity 0.5 → glass-opacity 覆盖", () => {
    applyRemoteConfigChange("app.glassOpacity", 0.5);
    expect(getAppearanceOverrides()["glass-opacity"]).toBe("0.5");
  });

  it("glassTint 非空 → glass-tint 覆盖", () => {
    applyRemoteConfigChange("app.glassTint", "#123456");
    expect(getAppearanceOverrides()["glass-tint"]).toBe("#123456");
  });

  it("backgroundImage 旧版 plain 绝对路径 → 受控协议 URL（E5.8#64：file:// 被沙箱拦截）", () => {
    applyRemoteConfigChange("app.backgroundImage", "C:\\Users\\feng\\AppData\\Roaming\\linkdesk\\appearance\\bg.png");
    expect(getAppearanceOverrides()["bg-image"]).toBe('url("linkdesk-userdata://appearance/bg.png")');
  });

  it("backgroundImage 旧版 plain 路径含空格中文 → basename 编码进受控协议 URL", () => {
    applyRemoteConfigChange("app.backgroundImage", "C:\\AppData\\linkdesk\\appearance\\背景 图.png");
    expect(getAppearanceOverrides()["bg-image"]).toBe('url("linkdesk-userdata://appearance/%E8%83%8C%E6%99%AF%20%E5%9B%BE.png")');
  });

  it("backgroundImage 已是受控协议 URL → 原样 url() 包裹（值已协议化，幂等）", () => {
    applyRemoteConfigChange("app.backgroundImage", "linkdesk-userdata://appearance/bg.png");
    expect(getAppearanceOverrides()["bg-image"]).toBe('url("linkdesk-userdata://appearance/bg.png")');
  });

  it("backgroundImage 已是主题资产协议 URL（linkdesk://）→ 原样包裹", () => {
    applyRemoteConfigChange("app.backgroundImage", "linkdesk://demo-theme/assets/bg.png");
    expect(getAppearanceOverrides()["bg-image"]).toBe('url("linkdesk://demo-theme/assets/bg.png")');
  });

  it("fontFamily 非空 → font-ui 覆盖（E5.8#50.19：用户级字体写 --font-ui）", () => {
    applyRemoteConfigChange("app.fontFamily", "SimSun");
    expect(getAppearanceOverrides()["font-ui"]).toBe("SimSun");
  });

  it("fontFamily 空 → font-ui 不覆盖（跟随主题）", () => {
    applyRemoteConfigChange("app.fontFamily", "");
    expect(getAppearanceOverrides()["font-ui"]).toBeUndefined();
  });

  /* ── E5.8#87 显式「无」哨兵 __none__——绝对无图/系统字体（盖掉主题/mix），空 ≠ 无（空 = 回主题）── */

  it("E5.8#87 backgroundImage __none__ → bg-image none（绝对无图，盖掉主题全景图）", () => {
    applyRemoteConfigChange("app.backgroundImage", CONFIG_NONE_SENTINEL);
    expect(getAppearanceOverrides()["bg-image"]).toBe("none");
  });

  it("E5.8#87 backgroundImage 空 → bg-image 不覆盖（回主题，非 none）", () => {
    applyRemoteConfigChange("app.backgroundImage", "");
    expect(getAppearanceOverrides()["bg-image"]).toBeUndefined();
  });

  it("E5.8#87 zoneBackgroundImage __none__ → surface-bg-image none（绝对无分区图，盖掉主题 zones 纹理）", () => {
    applyRemoteConfigChange("app.zoneBackgroundImage", CONFIG_NONE_SENTINEL);
    const overrides = getAppearanceOverrides();
    expect(overrides["surface-bg-image"]).toBe("none");
    expect(overrides["surface-bg-repeat"]).toBeUndefined(); // 无图 → 不量测 zones
    expect(overrides["surface-bg-zones"]).toBeUndefined();
  });

  it("E5.8#87 fontFamily __none__ → font-ui = 系统默认栈（绝对系统默认，不跟随主题字体资产）", () => {
    applyRemoteConfigChange("app.fontFamily", CONFIG_NONE_SENTINEL);
    expect(getAppearanceOverrides()["font-ui"]).toBe(SYSTEM_FONT_STACK);
  });

  it("E5.8#85 surfaceRadius presence → 六键全写 md 档绝对 px（clamp 进标尺）", () => {
    applyRemoteConfigChange("app.surfaceRadius", 12);
    const overrides = getAppearanceOverrides();
    for (const key of RADIUS_KEYS) expect(overrides[key]).toBe("12");
  });

  it("E5.8#85 surfaceRadius 越界 999 → 钳到 32；负 → 0（消费侧 clamp 延续 #56）", () => {
    applyRemoteConfigChange("app.surfaceRadius", 999);
    for (const key of RADIUS_KEYS) expect(getAppearanceOverrides()[key]).toBe("32");
    applyRemoteConfigChange("app.surfaceRadius", -5);
    for (const key of RADIUS_KEYS) expect(getAppearanceOverrides()[key]).toBe("0");
  });

  /* ── E5.8#85 zone 圆角绝对化（原 #80 第二通道改绝对 px）——app.zoneRadius 开关 + app.zoneRadiusScale 绝对 px（surface-radius）── */

  it("#85 neutral——surface-radius 不覆盖（presence 门控；主题自带 surface.radius 原样）", () => {
    const overrides = getAppearanceOverrides();
    expect(overrides["surface-radius"]).toBeUndefined();
  });

  it("#85 zoneRadius 关 → surface-radius 覆盖 = \"0px\"（直角短路值）", () => {
    applyRemoteConfigChange("app.zoneRadius", false);
    expect(getAppearanceOverrides()["surface-radius"]).toBe("0px");
  });

  it("#85 zoneRadius 开 + zoneRadiusScale 12 → 绝对 12（数字串，applyOverrides ①b 解析为 12px）", () => {
    applyRemoteConfigChange("app.zoneRadius", true);
    applyRemoteConfigChange("app.zoneRadiusScale", 12);
    expect(getAppearanceOverrides()["surface-radius"]).toBe("12");
  });

  it("#85 zoneRadiusScale 越界 999 → 钳到 32（标尺 clamp）", () => {
    applyRemoteConfigChange("app.zoneRadiusScale", 999);
    expect(getAppearanceOverrides()["surface-radius"]).toBe("32");
  });

  it("#85 applyOverrides——surface-radius 绝对 px 直写（不乘主题基准：直角主题 0 死区根治）", () => {
    const tokens = { "surface-radius": "0px" }; // 直角主题基准 0
    applyOverrides(tokens, { "surface-radius": "16" });
    expect(tokens["surface-radius"]).toBe("16px");
  });

  it("#85 applyOverrides——\"0px\" 短路强制直角（开关关，忽略主题 surface.radius）", () => {
    const tokens = { "surface-radius": "12px" };
    applyOverrides(tokens, { "surface-radius": "0px" });
    expect(tokens["surface-radius"]).toBe("0px");
  });

  it("#85 applyOverrides——无 surface-radius 覆盖 → 不动该键", () => {
    const tokens = { "surface-radius": "12px" };
    applyOverrides(tokens, { "radius-md": "16", "glass-blur": "16px" });
    expect(tokens["surface-radius"]).toBe("12px");
  });

  it("#85 applyRecipe——zoneRadiusScale 12 → surface-radius 12px（组件 radius-* 不受 zoneRadiusScale 影响）", () => {
    applyRemoteConfigChange("app.zoneRadiusScale", 12);
    applyRecipe(ZONE_RECIPE); // overrides 缺省 = getAppearanceOverrides（surface-radius 绝对 12px）
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-radius")).toBe("12px");
    expect(root.style.getPropertyValue("--radius-sm")).toBe("6px"); // 组件圆角不受 zoneRadiusScale（两轴独立）
  });

  it("#85 applyRecipe——zoneRadius 关 → surface-radius 0px（直角），radius-* 仍主题值", () => {
    applyRemoteConfigChange("app.zoneRadius", false);
    applyRecipe(ZONE_RECIPE);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-radius")).toBe("0px");
    expect(root.style.getPropertyValue("--radius-sm")).toBe("6px");
  });

  /* ── E5.8 缝系统——--surface-inset 宿主派生（Content vs Space Ownership：主题 inset 数据废弃，
     半径≠0 → 每格半缝 2px / 半径 0px 或缺省 → 贴死 0px）。法则在 applyOverrides ③，覆盖全部路径。 ── */

  it("缝法则 applyOverrides——radius≠0 → surface-inset 派生 2px（每格半缝）", () => {
    const tokens: Record<string, string> = { "surface-radius": "16px" };
    applyOverrides(tokens, {});
    expect(tokens["surface-inset"]).toBe("2px");
  });

  it("缝法则 applyOverrides——radius 0px → surface-inset 0px（直角贴死）", () => {
    const tokens: Record<string, string> = { "surface-radius": "0px" };
    applyOverrides(tokens, {});
    expect(tokens["surface-inset"]).toBe("0px");
  });

  it("缝法则 applyOverrides——无 surface-radius（缺省）→ 0px 贴死", () => {
    const tokens: Record<string, string> = {};
    applyOverrides(tokens, {});
    expect(tokens["surface-inset"]).toBe("0px");
  });

  it("缝法则 applyRecipe——zoneRadiusScale 12 → --surface-inset 2px（圆角开留缝）", () => {
    applyRemoteConfigChange("app.zoneRadius", true);
    applyRemoteConfigChange("app.zoneRadiusScale", 12);
    applyRecipe(ZONE_RECIPE);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-radius")).toBe("12px");
    expect(root.style.getPropertyValue("--surface-inset")).toBe("2px");
  });

  it("缝法则 applyRecipe——zoneRadius 关 → --surface-inset 0px（圆角关贴死，与直角短路同门）", () => {
    applyRemoteConfigChange("app.zoneRadius", false);
    applyRecipe(ZONE_RECIPE);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-radius")).toBe("0px");
    expect(root.style.getPropertyValue("--surface-inset")).toBe("0px");
  });

  /* ── E5.8#81 zone 表面背景覆盖入口——app.zoneBackgroundImage（写 surface-bg-*，与全窗 bg-image 并存）── */

  it("#81 zoneBackgroundImage 非空 → surface-bg-image + repeat no-repeat + zones 1 覆盖（并存全窗）", () => {
    applyRemoteConfigChange("app.zoneBackgroundImage", "linkdesk-userdata://appearance/zone-bg.png");
    const overrides = getAppearanceOverrides();
    expect(overrides["surface-bg-image"]).toBe('url("linkdesk-userdata://appearance/zone-bg.png")');
    expect(overrides["surface-bg-repeat"]).toBe("no-repeat");
    expect(overrides["surface-bg-zones"]).toBe("1");
  });

  it("#81 zoneBackgroundImage 空 → 不写 surface-bg-*（回主题自带 zones 纹理）", () => {
    applyRemoteConfigChange("app.zoneBackgroundImage", "");
    const overrides = getAppearanceOverrides();
    expect(overrides["surface-bg-image"]).toBeUndefined();
    expect(overrides["surface-bg-zones"]).toBeUndefined();
  });

  it("#81 两图并存——app.backgroundImage 与 app.zoneBackgroundImage 同设 → bg-image 与 surface-bg-image 双覆盖", () => {
    applyRemoteConfigChange("app.backgroundImage", "linkdesk-userdata://appearance/full-bg.png");
    applyRemoteConfigChange("app.zoneBackgroundImage", "linkdesk-userdata://appearance/zone-bg.png");
    const overrides = getAppearanceOverrides();
    expect(overrides["bg-image"]).toBe('url("linkdesk-userdata://appearance/full-bg.png")');
    expect(overrides["surface-bg-image"]).toBe('url("linkdesk-userdata://appearance/zone-bg.png")');
  });

  it("#81 applyRecipe——zoneBackgroundImage 覆盖胜主题 zones 纹理（surface-bg-image 换用户图）", () => {
    applyRemoteConfigChange("app.zoneBackgroundImage", "linkdesk-userdata://appearance/zone-bg.png");
    applyRecipe(ZONE_RECIPE);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-bg-image"))
      .toBe('url("linkdesk-userdata://appearance/zone-bg.png")');
    expect(root.style.getPropertyValue("--surface-bg-zones")).toBe("1");
    expect(root.style.getPropertyValue("--bg-image")).toBe("none"); // 无全窗背景
  });

  it("E5.8#56 审计#2——glassBlur 显式拖到 0（端点，presence）→ glass-blur 覆盖 0px（模糊真关）", () => {
    applyRemoteConfigChange("app.glassBlur", 0);
    expect(getAppearanceOverrides()["glass-blur"]).toBe("0px");
  });

  it("E5.8#56 审计#2——glassOpacity 显式拖到 1（端点，presence）→ glass-opacity 覆盖 1（真不透明）", () => {
    applyRemoteConfigChange("app.glassOpacity", 1);
    expect(getAppearanceOverrides()["glass-opacity"]).toBe("1");
  });

  it("E5.8#56——hasConfigurationValue presence 语义：未写 false、applyRemoteConfigChange 后 true（reset 摘除 → 回 neutral）", () => {
    expect(hasConfigurationValue("app.glassBlur")).toBe(false);
    applyRemoteConfigChange("app.glassBlur", 0);
    expect(hasConfigurationValue("app.glassBlur")).toBe(true);
  });

  it("E5.8#85——applyRadiusAbsolute 越界 clamp：absPx 999 → 钳到 32（settings.json 直写 999 不再 999× 圆角）", () => {
    const scaled = applyRadiusAbsolute(999, { "radius-md": "8px" });
    expect(scaled["radius-md"]).toBe("32px");
  });

  it("E5.8#85——applyRadiusAbsolute 负越界 clamp：absPx -1 → 钳到 0（方角），非负数取反", () => {
    const scaled = applyRadiusAbsolute(-1, { "radius-md": "8px" });
    expect(scaled["radius-md"]).toBe("0px");
  });

  it("E5.8#85——applyRadiusAbsolute 合法域：md 档 = 滑杆值；其余档按主题比例换算", () => {
    const scaled = applyRadiusAbsolute(12, { "radius-md": "8px", "radius-sm": "4px", "radius-lg": "12px" });
    expect(scaled["radius-md"]).toBe("12px"); // md = 滑杆值
    expect(scaled["radius-sm"]).toBe("6px"); // 4/8 × 12
    expect(scaled["radius-lg"]).toBe("18px"); // 12/8 × 12
  });

  it("E5.8#85 applyRadiusAbsolute — 返回六档键集、不含形态值（jsdom 无 CSS 基址 0px → md=0 直角无层级 → 等值滑杆）", () => {
    const scaled = applyRadiusAbsolute(16);
    for (const key of RADIUS_KEYS) expect(scaled[key]).toBeDefined();
    expect(scaled["radius-pill"]).toBeUndefined();
    expect(scaled["radius-full"]).toBeUndefined();
    expect(scaled["radius-md"]).toBe("16px"); // 等值
  });

  it("E5.8#85 applyRadiusAbsolute(0) — 0 方角档：六档全 0px，形态值仍排除", () => {
    const scaled = applyRadiusAbsolute(0, { "radius-md": "12px", "radius-sm": "6px", "radius-lg": "16px" });
    for (const key of RADIUS_KEYS) expect(scaled[key]).toBe("0px");
    expect(scaled["radius-pill"]).toBeUndefined();
    expect(scaled["radius-full"]).toBeUndefined();
  });

  it("applyTheme 折叠覆盖——glassBlur 覆盖胜过主题 surface.blur", () => {
    applyRemoteConfigChange("app.glassBlur", 15);
    applyTheme({ ...MOCK_THEME, surface: { type: "glass", blur: 8 } });
    expect(document.documentElement.style.getPropertyValue("--glass-blur")).toBe("15px");
  });

  it("E5.8#60 F1.1——APPEARANCE_OVERRIDE_KEYS = 全 13 键含 app.fontFamily（单一来源防回归；#80/#81 +zone 三键；#94/#95/#96 镜像补槽四键；#97 撤销后无 surfaceTexture）", () => {
    // 设置层外观覆盖 key 全集——壳命令（startup appearanceMode onApply）与插件 API（theme.resetAppearance）复位共用
    expect([...APPEARANCE_OVERRIDE_KEYS]).toEqual([
      "app.surfaceRadius", "app.glassBlur", "app.glassOpacity",
      "app.glassTint", "app.backgroundImage", "app.fontFamily",
      "app.zoneRadius", "app.zoneRadiusScale", "app.zoneBackgroundImage",
      "app.backgroundOpacity", "app.backgroundMask", "app.fontFamilyMono", "app.glassSaturate",
    ]);
    // 每键确与 getAppearanceOverrides 读的配置键对齐（写多了 reset 摘不到、写少了残留覆盖）
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.fontFamily"); // 插件侧旧表漏此键 → 复位后字体不回基线
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.surfaceRadius");
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.zoneRadius");
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.zoneRadiusScale");
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.zoneBackgroundImage");
    // E5.8#94/#95/#96 镜像补槽四键（主题可表达必有槽——reseed 计划/复位必须覆盖，写少了残留覆盖）
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.backgroundOpacity");
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.backgroundMask");
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.fontFamilyMono");
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.glassSaturate");
    // E5.8#97 撤销（2026-08-26 用户拍板）——app.surfaceTexture 不入本表（纹理=主题插件内容资产，壳无纹理槽）
    expect(APPEARANCE_OVERRIDE_KEYS).not.toContain("app.surfaceTexture");
  });

  /* ── E5.8#94/#95/#96 镜像补槽覆盖读取——主题可表达属性 ⇒ 设置面必有槽（14-档案 §十）── */

  it("E5.8#94 backgroundOpacity 显式写过 → bg-opacity 覆盖（1 = neutral 也是显式意图，presence 门控）", () => {
    applyRemoteConfigChange("app.backgroundOpacity", 0.4);
    expect(getAppearanceOverrides()["bg-opacity"]).toBe("0.4");
  });

  it("E5.8#94 backgroundOpacity 未写 → 零 bg-opacity 覆盖（跟随主题）", () => {
    expect(getAppearanceOverrides()["bg-opacity"]).toBeUndefined();
  });

  it("E5.8#94 backgroundMask 显式写过 → bg-mask 覆盖", () => {
    applyRemoteConfigChange("app.backgroundMask", 0.3);
    expect(getAppearanceOverrides()["bg-mask"]).toBe("0.3");
  });

  it("E5.8#95 fontFamilyMono 族名 → font-mono 覆盖（--font-mono 契约）", () => {
    applyRemoteConfigChange("app.fontFamilyMono", "Cascadia Code");
    expect(getAppearanceOverrides()["font-mono"]).toBe("Cascadia Code");
  });

  it("E5.8#95 fontFamilyMono=__none__ → 系统等宽栈（绝对系统默认，不跟随主题 mono 资产）", () => {
    applyRemoteConfigChange("app.fontFamilyMono", "__none__");
    expect(getAppearanceOverrides()["font-mono"]).toBe(SYSTEM_MONO_FONT_STACK);
  });

  it("E5.8#95 fontFamilyMono 空/未写 → 零 font-mono 覆盖（跟随主题）", () => {
    expect(getAppearanceOverrides()["font-mono"]).toBeUndefined();
  });

  it("E5.8#96 glassSaturate 显式写过 → glass-saturate 覆盖（presence 门控，端点 1 neutral 照常生效）", () => {
    applyRemoteConfigChange("app.glassSaturate", 1.5);
    expect(getAppearanceOverrides()["glass-saturate"]).toBe("1.5");
    // neutral 端点也是显式意图（值对比会把端点误判为未覆盖 → presence 门控）
    applyRemoteConfigChange("app.glassSaturate", 1);
    expect(getAppearanceOverrides()["glass-saturate"]).toBe("1");
  });

  it("E5.8#96 glassSaturate 未写 → 零 glass-saturate 覆盖（跟随主题）", () => {
    expect(getAppearanceOverrides()["glass-saturate"]).toBeUndefined();
  });

  /* ── E5.8#94/#95/#96 播种反推——deriveAppearanceSeeds 读生效 token 反向播种（进 custom 单写点）── */

  it("E5.8#94/#95/#96 deriveAppearanceSeeds — 背景可读性/等宽字体/玻璃饱和度 neutral 缺省反推", () => {
    const seeds = deriveAppearanceSeeds({
      "bg-opacity": "0.8",
      "bg-mask": "0.25",
      "font-mono": "JetBrains Mono",
      "glass-saturate": "1.4",
    });
    expect(seeds.backgroundOpacity).toBe(0.8);
    expect(seeds.backgroundMask).toBe(0.25);
    expect(seeds.fontFamilyMono).toBe("JetBrains Mono");
    expect(seeds.glassSaturate).toBe(1.4);
  });

  it("E5.8#94/#95/#96 deriveAppearanceSeeds — 缺省 neutral（bg-opacity 1 / bg-mask 0 / 空 mono / saturate 1）", () => {
    const seeds = deriveAppearanceSeeds({});
    expect(seeds.backgroundOpacity).toBe(1);
    expect(seeds.backgroundMask).toBe(0);
    expect(seeds.fontFamilyMono).toBe("");
    expect(seeds.glassSaturate).toBe(1);
  });

  it("E5.8#94/#95/#96 deriveAppearanceSeedMap — 13 覆盖键全集含补槽四键（reseed 计划/徽标基准共用）", () => {
    const seedMap = deriveAppearanceSeedMap({
      "bg-opacity": "0.7",
      "bg-mask": "0.2",
      "font-mono": "Consolas",
      "glass-saturate": "1.2",
    });
    expect(seedMap["app.backgroundOpacity"]).toBe(0.7);
    expect(seedMap["app.backgroundMask"]).toBe(0.2);
    expect(seedMap["app.fontFamilyMono"]).toBe("Consolas");
    expect(seedMap["app.glassSaturate"]).toBe(1.2);
  });

  it("E5.8#94/#95/#96 deriveReseedPlan — 补槽四键未修改 → 切主题反推新基准填标尺", () => {
    const writes = deriveReseedPlan(
      { "app.backgroundOpacity": 1, "app.backgroundMask": 0, "app.fontFamilyMono": "", "app.glassSaturate": 1 },
      { "app.backgroundOpacity": 0.6, "app.backgroundMask": 0.3, "app.fontFamilyMono": "Consolas", "app.glassSaturate": 1.5 },
      {}
    );
    const byKey = Object.fromEntries(writes.map((w) => [w.key, w.value]));
    expect(byKey["app.backgroundOpacity"]).toBe(0.6);
    expect(byKey["app.backgroundMask"]).toBe(0.3);
    expect(byKey["app.fontFamilyMono"]).toBe("Consolas");
    expect(byKey["app.glassSaturate"]).toBe(1.5);
  });

  /* ── E5.8#91 文字极性槽——app.fontTone 显式选档 → 系统双字系标尺覆盖 text-*（非主题色板值）；
     跟随主题/未写 → 零覆盖（主题 type 决定极性，colorway text-* 原样）── */

  it("E5.8#91 fontTone=light → text-primary/secondary/muted = 系统亮字系（深底用）", () => {
    applyRemoteConfigChange("app.fontTone", "light");
    const overrides = getAppearanceOverrides();
    expect(overrides["text-primary"]).toBe(FONT_TONE_LIGHT_TEXT[0]);
    expect(overrides["text-secondary"]).toBe(FONT_TONE_LIGHT_TEXT[1]);
    expect(overrides["text-muted"]).toBe(FONT_TONE_LIGHT_TEXT[2]);
  });

  it("E5.8#91 fontTone=dark → text-primary/secondary/muted = 系统暗字系（浅底用）", () => {
    applyRemoteConfigChange("app.fontTone", "dark");
    const overrides = getAppearanceOverrides();
    expect(overrides["text-primary"]).toBe(FONT_TONE_DARK_TEXT[0]);
    expect(overrides["text-secondary"]).toBe(FONT_TONE_DARK_TEXT[1]);
    expect(overrides["text-muted"]).toBe(FONT_TONE_DARK_TEXT[2]);
  });

  it("E5.8#91 fontTone=followTheme → 零 text-* 覆盖（主题 type 决定极性）", () => {
    applyRemoteConfigChange("app.fontTone", "followTheme");
    const overrides = getAppearanceOverrides();
    for (const key of FONT_TONE_TEXT_KEYS) expect(overrides[key]).toBeUndefined();
  });

  it("E5.8#91 fontTone 未写 → 零 text-* 覆盖（default=followTheme 语义）", () => {
    const overrides = getAppearanceOverrides();
    for (const key of FONT_TONE_TEXT_KEYS) expect(overrides[key]).toBeUndefined();
  });

  it("E5.8#91 fontTone 与 mix 共存——appearanceMode=custom 时显式档照常覆盖（fontTone 非 mix 来源键，无竞争）", () => {
    applyRemoteConfigChange("app.fontTone", "dark");
    applyRemoteConfigChange("app.appearanceMode", "custom");
    const overrides = getAppearanceOverrides();
    expect(overrides["text-primary"]).toBe(FONT_TONE_DARK_TEXT[0]);
    expect(overrides["text-secondary"]).toBe(FONT_TONE_DARK_TEXT[1]);
  });
});

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

describe("ThemeEngine — applyRecipe / getActiveRecipe / getEffectiveTokens（E5.8#50.16）", () => {
  // RECIPE / RECIPE_NO_COLOR / GLASS_VARS = 模块级共享 fixture（见文件顶部）
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
    expect(root.style.getPropertyValue("--bg-window")).toBe("#FFFBF5");
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
    expect(tokens["bg-window"]).toBe("#FFFBF5");
    expect(tokens["radius-lg"]).toBe("12px");
    expect(tokens["font-ui"]).toBe("Noto Sans SC");
  });

  it("applyRecipe 后 applyTheme（flat 桥）→ recipe 态清空", () => {
    applyRecipe(RECIPE, "dew", {});
    applyTheme({ name: "Test Light", type: "light", colors: { bg: "#fff" } });
    expect(getActiveRecipe()).toBeNull();
  });

  // E5.8#84：广播载荷剔除 accent 三键——theme:changed 携带 recipe accent 与 accent:changed 两条
  // IPC 在池侧跨帧落地 → --accent 振荡 → .toggle.on transition 反复重启 = 开关闪（CDP 实测 11 次紫↔红）。
  // 壳 :root 全量写（含 accent）不动——与 applyAccentColor 同任务无跨帧机会。
  it("applyRecipe — 广播 theme:changed 剔除 accent 三键（壳 :root 仍写 accent）", () => {
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
      expect(vars["bg-window"]).toBe("#FFFBF5"); // 非 accent 键正常携带
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

describe("ThemeEngine — 资产字体两步机制（E5.8#50.17，@font-face → 族名写 --font-*）", () => {
  // 虚构 fixture（硬约束 21）：demo-font 插件 + DemoFont.woff2 资产——不指向真实插件
  const PLUGIN = "demo-font";
  const ASSET_REL = "./resources/DemoFont.woff2";
  const ASSET_URL = "linkdesk://demo-font/resources/DemoFont.woff2";
  const FAMILY = "__ld_demo-font_DemoFont";

  // RECIPE_ASSET = 模块级共享 fixture（文件顶部）；此处只用其资产相对路径 + 归属 demo-font 插件
  const RECIPE_SYSTEM: ThemeRecipe = {
    id: "demo-system-recipe",
    name: "Demo System Recipe",
    type: "dark",
    appearance: { font: { ui: "Noto Sans SC", mono: "Consolas" } },
    colorways: [{ id: "base", name: "Base", colors: {} }],
  };

  beforeEach(() => {
    rollback(PLUGIN); // 清上一测试的 recipe 登记 + 字体清理 disposer
    cleanupPluginFontFaces(PLUGIN); // 清会话表 + 摘归属 + 移除 DOM style（幂等）
    const root = document.documentElement;
    root.style.removeProperty("--font-ui");
    root.style.removeProperty("--font-mono");
  });

  it("isAssetFontPath — 路径/扩展名 → 资产；系统族名 → 直接写", () => {
    expect(isAssetFontPath("./resources/DemoFont.woff2")).toBe(true);
    expect(isAssetFontPath("resources/DemoFont.woff2")).toBe(true);
    expect(isAssetFontPath("C:\\fonts\\DemoFont.ttf")).toBe(true);
    expect(isAssetFontPath("DemoFont.otf")).toBe(true);
    expect(isAssetFontPath("Noto Sans SC")).toBe(false);
    expect(isAssetFontPath("SimSun")).toBe(false);
    expect(isAssetFontPath("Consolas")).toBe(false);
  });

  it("ensureFontFace — 注册 @font-face style + 会话表 + 幂等（同 URL 二次调用不重复插）", () => {
    const family = ensureFontFace(ASSET_URL, PLUGIN);
    expect(family).toBe(FAMILY);
    const style = document.getElementById(`ld-ff-${FAMILY}`) as HTMLStyleElement | null;
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain(`font-family:"${FAMILY}"`);
    expect(style!.textContent).toContain(`url("${ASSET_URL}")`);
    expect(style!.textContent).toContain('format("woff2")');
    expect(document.head.querySelectorAll(`style[id='ld-ff-${FAMILY}']`).length).toBe(1);
    // 幂等——同 URL 不重复插
    ensureFontFace(ASSET_URL, PLUGIN);
    expect(document.head.querySelectorAll(`style[id='ld-ff-${FAMILY}']`).length).toBe(1);
  });

  it("resolveRecipeFonts — 资产相对路径 → 族名 + fontFaces 表；系统族名原样", () => {
    ThemeRegistry.registerRecipe(RECIPE_ASSET, PLUGIN);
    const { appearance, fontFaces } = resolveRecipeFonts(RECIPE_ASSET);
    expect(appearance?.font?.ui).toBe(FAMILY); // 资产 → 两步换族名
    expect(fontFaces).toHaveLength(1);
    expect(fontFaces[0]).toEqual({ family: FAMILY, url: ASSET_URL, format: "woff2" });

    const sys = resolveRecipeFonts(RECIPE_SYSTEM);
    expect(sys.appearance?.font?.ui).toBe("Noto Sans SC"); // 系统族名直接写
    expect(sys.appearance?.font?.mono).toBe("Consolas");
    expect(sys.fontFaces).toHaveLength(0);
  });

  it("resolveRecipeFonts — 无归属插件（未登记）→ 资产写原值不注册（浏览器回退）", () => {
    const { appearance, fontFaces } = resolveRecipeFonts(RECIPE_ASSET); // 未 registerRecipe
    expect(appearance?.font?.ui).toBe(ASSET_REL);
    expect(fontFaces).toHaveLength(0);
    expect(document.getElementById(`ld-ff-${FAMILY}`)).toBeNull();
  });

  it("applyRecipe — 资产字体全链路：--font-ui 写族名 + @font-face style 落 DOM", () => {
    ThemeRegistry.registerRecipe(RECIPE_ASSET, PLUGIN);
    applyRecipe(RECIPE_ASSET, "base", {});
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--font-ui")).toBe(FAMILY); // 两步机制第二链：写族名不写 url()
    expect(document.getElementById(`ld-ff-${FAMILY}`)).not.toBeNull();
    expect(root.style.getPropertyValue("--bg-window")).toBe("#101014");
  });

  it("cleanupPluginFontFaces — 移除 style + 生效族名还原 --font-ui（字体回默认）", () => {
    ThemeRegistry.registerRecipe(RECIPE_ASSET, PLUGIN);
    applyRecipe(RECIPE_ASSET, "base", {});
    expect(document.documentElement.style.getPropertyValue("--font-ui")).toBe(FAMILY);
    cleanupPluginFontFaces(PLUGIN);
    expect(document.getElementById(`ld-ff-${FAMILY}`)).toBeNull();
    expect(document.documentElement.style.getPropertyValue("--font-ui")).toBe(""); // 还原回 :root 默认
  });

  it("ensurePluginFontFacesCleanup — 卸载 rollback 触发字体清理（卸插件 → 字体回默认验收）", () => {
    ThemeRegistry.registerRecipe(RECIPE_ASSET, PLUGIN);
    ensurePluginFontFacesCleanup(PLUGIN);
    applyRecipe(RECIPE_ASSET, "base", {});
    expect(document.getElementById(`ld-ff-${FAMILY}`)).not.toBeNull();
    rollback(PLUGIN);
    expect(document.getElementById(`ld-ff-${FAMILY}`)).toBeNull();
    expect(document.documentElement.style.getPropertyValue("--font-ui")).toBe("");
  });

  it("ensurePluginFontFacesCleanup — 幂等：多配方重复登记不重复挂 disposer（重装可再登记）", () => {
    ensurePluginFontFacesCleanup(PLUGIN);
    ensurePluginFontFacesCleanup(PLUGIN);
    ensurePluginFontFacesCleanup(PLUGIN);
    ensureFontFace(ASSET_URL, PLUGIN);
    rollback(PLUGIN);
    expect(document.getElementById(`ld-ff-${FAMILY}`)).toBeNull();
    // 重装后能再登记（守卫键被 disposer 自删）
    ensurePluginFontFacesCleanup(PLUGIN);
    ensureFontFace(ASSET_URL, PLUGIN);
    expect(document.getElementById(`ld-ff-${FAMILY}`)).not.toBeNull();
  });
});

describe("ThemeEngine — deriveAppearanceSeeds 反推播种（E5.8#50.19，08 §2）", () => {
  it("E5.8#85 圆角反推绝对 px——surfaceRadius = 当前 radius-md 实际值（非主题比值）；越界 clamp 标尺", () => {
    const seeds = deriveAppearanceSeeds({ "radius-md": "12px", "surface-radius": "10px" });
    expect(seeds.surfaceRadius).toBe(12);
    expect(deriveAppearanceSeeds({ "radius-md": "20px" }).surfaceRadius).toBe(20);
    expect(deriveAppearanceSeeds({ "radius-md": "2px" }).surfaceRadius).toBe(2);
    expect(deriveAppearanceSeeds({ "radius-md": "999px" }).surfaceRadius).toBe(32); // clamp 标尺
  });

  it("E5.8#85 zoneRadiusPx 播种——当前 surface-radius 实际 px；无 token → 0（直角）", () => {
    expect(deriveAppearanceSeeds({ "surface-radius": "10px" }).zoneRadiusPx).toBe(10);
    expect(deriveAppearanceSeeds({ "surface-radius": "999px" }).zoneRadiusPx).toBe(32); // clamp 标尺
    expect(deriveAppearanceSeeds({}).zoneRadiusPx).toBe(0);
  });

  it("E5.8#85 无 radius token / 直角主题 → 播种 0（方角起点，非比值 1）", () => {
    expect(deriveAppearanceSeeds({}).surfaceRadius).toBe(0);
    expect(deriveAppearanceSeeds({ "radius-md": "0px" }).surfaceRadius).toBe(0);
  });

  it("玻璃绝对播种——token 值直播；tint 剥 transparent → 空", () => {
    const seeds = deriveAppearanceSeeds({
      "glass-blur": "18px",
      "glass-opacity": "0.4",
      "glass-tint": "rgba(10,20,30,0.5)",
    });
    expect(seeds.glassBlur).toBe(18);
    expect(seeds.glassOpacity).toBe(0.4);
    expect(seeds.glassTint).toBe("rgba(10,20,30,0.5)");
    expect(deriveAppearanceSeeds({ "glass-tint": "transparent" }).glassTint).toBe("");
  });

  it("背景剥 url() 存受控路径；none/缺省 → 空", () => {
    const seeds = deriveAppearanceSeeds({ "bg-image": 'url("C:/app/bg.png")' });
    expect(seeds.backgroundImage).toBe("C:/app/bg.png");
    expect(deriveAppearanceSeeds({ "bg-image": "none" }).backgroundImage).toBe("");
    expect(deriveAppearanceSeeds({}).backgroundImage).toBe("");
  });

  it("E5.8#81 zoneBackgroundImage——zones 模式（surface-bg-zones=1）反推 surface-bg-image 剥 url()", () => {
    const seeds = deriveAppearanceSeeds({
      "surface-bg-image": 'url("linkdesk-userdata://appearance/zone-bg.png")',
      "surface-bg-zones": "1",
    });
    expect(seeds.zoneBackgroundImage).toBe("linkdesk-userdata://appearance/zone-bg.png");
  });

  it("E5.8#81 zoneBackgroundImage——纹理模式（zones=0）播种空（不把 repeat 纹理错播成 zones 切片）", () => {
    // 纸纹纹理：surface-bg-image 有值但 zones=0（repeat 平铺）——播种空 = 跟随主题
    const seeds = deriveAppearanceSeeds({
      "surface-bg-image": 'url("linkdesk://demo-theme/resources/paper.png")',
      "surface-bg-zones": "0",
    });
    expect(seeds.zoneBackgroundImage).toBe("");
    // none/缺省 → 空
    expect(deriveAppearanceSeeds({ "surface-bg-image": "none", "surface-bg-zones": "1" }).zoneBackgroundImage).toBe("");
    expect(deriveAppearanceSeeds({}).zoneBackgroundImage).toBe("");
  });

  it("字体播种跳过资产族（__ld_ 前缀只显示不选，#50.20 边界）；系统族名直播", () => {
    expect(deriveAppearanceSeeds({ "font-ui": "SimSun" }).fontFamily).toBe("SimSun");
    expect(deriveAppearanceSeeds({ "font-ui": "__ld_demo-plugin_serif" }).fontFamily).toBe("");
  });
});

describe("ThemeEngine — E5.8#88 切主题重播种 + 徽标基准（deriveAppearanceSeedMap/deriveReseedPlan/getThemeBaseTokens/getAppliedAccent）", () => {
  const PLUGIN = "demo-reseed";

  beforeEach(() => {
    clearConfigurationCache();
    rollback(PLUGIN);
    const root = document.documentElement;
    for (const key of ["bg-window", "accent", "font-ui", "radius-sm", "radius-lg", "glass-blur"]) {
      root.style.removeProperty(`--${key}`);
    }
    root.removeAttribute("data-theme");
    ThemeRegistry.registerRecipe(RECIPE, PLUGIN);
    // 清 recipe 活动态（applyTheme flat 桥接置 currentRecipeId=null）——getThemeBaseTokens 无活动配方分支需干净起点
    applyTheme(MOCK_THEME);
  });

  it("deriveAppearanceSeedMap — 13 覆盖键 → 种子值全集映射（键=配置 key，单写点）", () => {
    const map = deriveAppearanceSeedMap({
      "radius-md": "8px",
      "surface-radius": "10px",
      "glass-blur": "18px",
      "glass-opacity": "0.4",
      "glass-tint": "rgba(10,20,30,0.5)",
      "bg-image": 'url("C:/app/bg.png")',
      "font-ui": "SimSun",
      "surface-bg-image": 'url("linkdesk-userdata://appearance/zone.png")',
      "surface-bg-zones": "1",
    });
    expect(map).toEqual({
      "app.surfaceRadius": 8,
      "app.glassBlur": 18,
      "app.glassOpacity": 0.4,
      "app.glassTint": "rgba(10,20,30,0.5)",
      "app.backgroundImage": "C:/app/bg.png",
      "app.fontFamily": "SimSun",
      "app.zoneRadius": true,
      "app.zoneRadiusScale": 10,
      "app.zoneBackgroundImage": "linkdesk-userdata://appearance/zone.png",
      // E5.8#94/#95/#96 镜像补槽四键（输入未写 → neutral 缺省反推）
      "app.backgroundOpacity": 1,
      "app.backgroundMask": 0,
      "app.fontFamilyMono": "",
      "app.glassSaturate": 1,
    });
    // 缺省 token → 零值/空（不抛）——zoneBackgroundImage 需 zones=1
    const empty = deriveAppearanceSeedMap({});
    expect(empty["app.surfaceRadius"]).toBe(0);
    expect(empty["app.glassOpacity"]).toBe(1);
    expect(empty["app.zoneRadius"]).toBe(true);
    expect(empty["app.zoneBackgroundImage"]).toBe("");
    expect(empty["app.backgroundImage"]).toBe("");
    expect(empty["app.backgroundOpacity"]).toBe(1);
    expect(empty["app.backgroundMask"]).toBe(0);
    expect(empty["app.fontFamilyMono"]).toBe("");
    expect(empty["app.glassSaturate"]).toBe(1);
    expect(empty["app.surfaceTexture"]).toBeUndefined();
  });

  it("deriveReseedPlan — 未修改（无 stored）→ 反推新基准填标尺；新旧同值跳过", () => {
    const oldBaseline = { "app.surfaceRadius": 8, "app.glassBlur": 0, "app.backgroundImage": "" };
    const newBaseline = { "app.surfaceRadius": 12, "app.glassBlur": 4, "app.backgroundImage": "" };
    const plan = deriveReseedPlan(oldBaseline, newBaseline, {});
    expect(plan).toEqual([
      { key: "app.surfaceRadius", value: 12 },
      { key: "app.glassBlur", value: 4 },
      { key: "app.backgroundImage", value: "" },
    ]);
  });

  it("deriveReseedPlan — 未修改（stored === 旧基准，含播种态/恰与主题同值）→ 随新主题重基线", () => {
    const oldBaseline = { "app.surfaceRadius": 8 };
    const newBaseline = { "app.surfaceRadius": 12 };
    // stored 8 === 旧基准 8 → 非用户偏离（进 custom 播种值）→ 重播种到新基准
    expect(deriveReseedPlan(oldBaseline, newBaseline, { "app.surfaceRadius": 8 })).toEqual([
      { key: "app.surfaceRadius", value: 12 },
    ]);
    // 新旧同值 → 跳过（零副作用无谓广播）
    expect(deriveReseedPlan({ "app.surfaceRadius": 8 }, { "app.surfaceRadius": 8 }, { "app.surfaceRadius": 8 })).toEqual([]);
  });

  it("deriveReseedPlan — 用户显式修改（偏离旧基准）→ 保留不写", () => {
    const oldBaseline = { "app.surfaceRadius": 8 };
    const newBaseline = { "app.surfaceRadius": 12 };
    expect(deriveReseedPlan(oldBaseline, newBaseline, { "app.surfaceRadius": 14 })).toEqual([]);
  });

  it("deriveReseedPlan — 空串（跟随主题/清除）≠ 旧基准非空 → 保留自动跟随新主题", () => {
    const oldBaseline = { "app.backgroundImage": "old-bg.png" };
    const newBaseline = { "app.backgroundImage": "new-bg.png" };
    expect(deriveReseedPlan(oldBaseline, newBaseline, { "app.backgroundImage": "" })).toEqual([]);
    // 显式 __none__（绝对无）偏离旧基准 → 真实用户选择保留
    expect(deriveReseedPlan(oldBaseline, newBaseline, { "app.backgroundImage": "__none__" })).toEqual([]);
    // zoneRadius=false 偏离播种 true → 保留（用户显式关闭分区圆角）
    expect(deriveReseedPlan({ "app.zoneRadius": true }, { "app.zoneRadius": true }, { "app.zoneRadius": false })).toEqual([]);
  });

  it("getThemeBaseTokens — 无覆盖纯基线（recipe 模式）；外观覆盖配置不影响（overrides={} 显式）", () => {
    applyRecipe(RECIPE, "mint", {});
    const base = getThemeBaseTokens();
    expect(base["accent"]).toBe("#3E9E8C"); // mint 配色 accent
    expect(base["glass-blur"]).toBe("14px"); // 主题原生 appearance.glass
    expect(base["font-ui"]).toBe("Noto Sans SC");
    // 设外观覆盖后仍纯基线——重播种判定「无覆盖时主题给什么」不能被用户值污染
    applyRemoteConfigChange("app.surfaceRadius", 20);
    applyRemoteConfigChange("app.glassBlur", 6);
    expect(getThemeBaseTokens()["glass-blur"]).toBe("14px");
    expect(getThemeBaseTokens()["accent"]).toBe("#3E9E8C");
  });

  it("getThemeBaseTokens — 无活动配方 → {}（startup 早期降级为全保留）", () => {
    expect(getThemeBaseTokens()).toEqual({});
  });

  it("getAppliedAccent — applyAccentColor 追踪最近实际应用强调色（C4 权威在引擎，非 DOM 读）", () => {
    applyAccentColor("#123456");
    expect(getAppliedAccent()).toBe("#123456");
    applyAccentColor("#abcdef");
    expect(getAppliedAccent()).toBe("#abcdef");
  });
});

describe("ThemeEngine — deriveRadiusAbsoluteMigration 旧圆角倍数→绝对 px（E5.8#85 补课，schemaMigrations v2）", () => {
  it("主题基准 md × 倍数 → 绝对 px（1.15×6=6.9→7；zone 死区 0×1.36=0）", () => {
    // baseTokens = mergeDomains 无 overrides（主题原生 radius 域）；dark 无 radius → 缺省走 getBaseRadius 壳默认
    const out = deriveRadiusAbsoluteMigration(
      { surfaceRadius: 1.15, zoneRadiusScale: 1.36 },
      { "radius-md": "6px", "surface-radius": "0px" }
    );
    expect(out).toEqual({ "app.surfaceRadius": 7, "app.zoneRadiusScale": 0 });
  });

  it("主题自定 radius 域——基准取主题 radius-md（非壳默认）：8×1.15=9.2→9", () => {
    const out = deriveRadiusAbsoluteMigration(
      { surfaceRadius: 1.15 },
      { "radius-md": "8px", "surface-radius": "6px" }
    );
    expect(out["app.surfaceRadius"]).toBe(9);
  });

  it("非死区 zone——主题 surface-radius 基准 × zoneScale：6×1.36=8.16→8", () => {
    const out = deriveRadiusAbsoluteMigration(
      { zoneRadiusScale: 1.36 },
      { "radius-md": "6px", "surface-radius": "6px" }
    );
    expect(out["app.zoneRadiusScale"]).toBe(8);
  });

  it("presence 门控——旧值不存在（全新安装/从未设过）→ 不产出对应键（零变更零写）", () => {
    expect(deriveRadiusAbsoluteMigration({}, { "radius-md": "6px" })).toEqual({});
    expect(deriveRadiusAbsoluteMigration({ surfaceRadius: 1.15 }, { "radius-md": "6px" })).toEqual({
      "app.surfaceRadius": 7,
    });
    expect(deriveRadiusAbsoluteMigration({ zoneRadiusScale: 1.36 }, { "surface-radius": "0px" })).toEqual({
      "app.zoneRadiusScale": 0,
    });
  });

  it("clamp 进系统标尺——基准越界（999px）×倍数 → 钳 32", () => {
    const out = deriveRadiusAbsoluteMigration(
      { surfaceRadius: 2, zoneRadiusScale: 2 },
      { "radius-md": "999px", "surface-radius": "32px" }
    );
    expect(out).toEqual({ "app.surfaceRadius": 32, "app.zoneRadiusScale": 32 });
  });

  it("主题无 radius 域 → 回退 getBaseRadius 壳默认（与旧 source=tokens[key]||base[key] 同基准）", () => {
    // 无 radius-md / surface-radius → 壳默认（jsdom 环境 getBaseRadius 读 :root → 0px，故断言 0）
    const out = deriveRadiusAbsoluteMigration(
      { surfaceRadius: 1.15, zoneRadiusScale: 1.36 },
      {}
    );
    expect(out["app.surfaceRadius"]).toBe(0);
    expect(out["app.zoneRadiusScale"]).toBe(0);
  });
});

describe("ThemeEngine — deriveGlassOpacityAbsoluteMigration 旧 wash 语义→绝对透明度（E5.8#86，schemaMigrations v3）", () => {
  it("旧 wash 1（label「1 不透明」实为 tint 0.5）→ 绝对 0.5（视觉零变化）", () => {
    expect(deriveGlassOpacityAbsoluteMigration(1)).toEqual({ "app.glassOpacity": 0.5 });
  });

  it("旧 wash 0.5 → 绝对 0.25（tint 层 opacity 直用值，旧视觉 0.5×0.5=0.25 保持）", () => {
    expect(deriveGlassOpacityAbsoluteMigration(0.5)).toEqual({ "app.glassOpacity": 0.25 });
  });

  it("presence 门控——旧值不存在（全新安装/从未写过）→ 零变更零写（跟随新默认 0.5）", () => {
    expect(deriveGlassOpacityAbsoluteMigration(undefined)).toEqual({});
  });

  it("端点——旧 0 → 绝对 0（全透见背景图）；clamp 越界防御（旧值域已 0-1，×0.5 恒在域内）", () => {
    expect(deriveGlassOpacityAbsoluteMigration(0)).toEqual({ "app.glassOpacity": 0 });
    expect(deriveGlassOpacityAbsoluteMigration(2)).toEqual({ "app.glassOpacity": 1 });
  });
});

describe("ThemeEngine — resolveMergedAppearanceMode 旧三枚举→单一外观轴（E5.8#90，schemaMigrations v4）", () => {
  it("任一旧枚举表达自定义意图 → custom（appearanceMode=custom / mixMode=mix / accentMode=custom 各自成立）", () => {
    expect(resolveMergedAppearanceMode({ appearanceMode: "custom" })).toBe("custom");
    expect(resolveMergedAppearanceMode({ mixMode: "mix" })).toBe("custom");
    expect(resolveMergedAppearanceMode({ accentMode: "custom" })).toBe("custom");
    // 多个旧枚举同时自定义——同收敛 custom
    expect(resolveMergedAppearanceMode({ appearanceMode: "custom", mixMode: "mix", accentMode: "custom" })).toBe("custom");
  });

  it("旧枚举全缺省/默认值（无自定义意图）→ followTheme", () => {
    expect(resolveMergedAppearanceMode({})).toBe("followTheme");
    expect(resolveMergedAppearanceMode({ appearanceMode: "followTheme", mixMode: "followTheme", accentMode: "followTheme" })).toBe("followTheme");
    expect(resolveMergedAppearanceMode({ appearanceMode: "followTheme" })).toBe("followTheme");
  });

  it("appearanceMode 已在新轴（已迁值）→ 重跑幂等零变化", () => {
    expect(resolveMergedAppearanceMode({ appearanceMode: "custom", mixMode: "mix" })).toBe("custom");
    expect(resolveMergedAppearanceMode({ appearanceMode: "followTheme", mixMode: "mix" })).toBe("custom"); // 曾开 mix 但已迁 → 仍 custom
  });
});

describe("ThemeEngine — getEffectiveAccentColor 强调色独立轴（E5.8#98，accentSource 解耦外观主开关，schemaMigrations v5）", () => {
  beforeEach(() => {
    clearConfigurationCache();
  });

  it("accentSource=followTheme + 主题有 accent → 主题色（外观主开关 followTheme）", () => {
    applyTheme(MOCK_THEME); // accent #ff0000
    applyRemoteConfigChange("app.appearanceMode", "followTheme");
    applyRemoteConfigChange("app.accentSource", "followTheme");
    applyRemoteConfigChange("app.accentColor", "#112233"); // 写但忽略——来源跟随主题
    expect(getEffectiveAccentColor()).toBe("#ff0000");
  });

  it("accentSource=followTheme + 外观主开关 custom → 仍主题色（强调色独立轴，不随外观主开关）", () => {
    applyTheme(MOCK_THEME);
    applyRemoteConfigChange("app.appearanceMode", "custom");
    applyRemoteConfigChange("app.accentSource", "followTheme");
    applyRemoteConfigChange("app.accentColor", "#112233");
    expect(getEffectiveAccentColor()).toBe("#ff0000");
  });

  it("accentSource=custom → 自定义色（外观主开关 followTheme 也生效——只调强调色不调外观）", () => {
    applyTheme(MOCK_THEME);
    applyRemoteConfigChange("app.appearanceMode", "followTheme");
    applyRemoteConfigChange("app.accentSource", "custom");
    applyRemoteConfigChange("app.accentColor", "#112233");
    expect(getEffectiveAccentColor()).toBe("#112233");
  });

  it("accentSource 缺省（未写）→ 跟随主题（?? followTheme 陷阱防护）", () => {
    applyTheme(MOCK_THEME);
    applyRemoteConfigChange("app.appearanceMode", "custom"); // 旧外观主开关不越权
    expect(getEffectiveAccentColor()).toBe("#ff0000");
  });

  it("accentSource=followTheme + 主题无 accent → 自定义兜底", () => {
    applyTheme(MOCK_THEME2); // 无 accent 域
    applyRemoteConfigChange("app.accentSource", "followTheme");
    applyRemoteConfigChange("app.accentColor", "#445566");
    expect(getEffectiveAccentColor()).toBe("#445566");
  });

  // E5.8#99（#5）：accentColor 清除语义——清除（空串）→ 跟随主题强调色（对标 backgroundImage/fontFamily 三键清除）
  it("accentSource=custom + 清除（空串）→ 跟随主题强调色", () => {
    applyTheme(MOCK_THEME); // accent #ff0000
    applyRemoteConfigChange("app.appearanceMode", "followTheme");
    applyRemoteConfigChange("app.accentSource", "custom");
    applyRemoteConfigChange("app.accentColor", ""); // 清除
    expect(getEffectiveAccentColor()).toBe("#ff0000");
  });

  it("accentSource=custom + 清除 + 主题无 accent → 系统默认兜底（数据默认）", () => {
    applyTheme(MOCK_THEME2); // 无 accent 域
    applyRemoteConfigChange("app.accentSource", "custom");
    applyRemoteConfigChange("app.accentColor", "");
    expect(getEffectiveAccentColor()).toBe("#0078d4");
  });
});

describe("ThemeEngine — 混搭合并（E5.8#50.26，10 §1/§3 每域各自取来源）", () => {
  // 虚构 fixture（硬约束 21）：demo-mix 插件 + demo-recipe/demo-radius 两配方（RECIPE/RECIPE_ASSET/GLASS_VARS = 模块级共享）
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
});

/* ── E5.8#50.27：真实极限壳主题端到端裁决——gallery ①⑨⑩ 壳真实落地。
   读取 plugins/user/theme-{songti,terminal,pill} 真实主题 JSON（#50.27 验收「制作真实主题插件做端到端最终裁决」）。
   例外依据：验证真实接线而必须用真 id/真数据（硬约束 21 豁免区）——虚构 fixture 无法裁决「gallery 配方 ↔ 引擎」契约。 */
describe("ThemeEngine — 真实极限壳主题（E5.8#50.27，gallery 端到端裁决）", () => {
  it("songti-print — 宋体印刷体 font 域（ui=SimSun 全 UI 宋体；形制现状直角 isolate 字族轴）", () => {
    const { recipe } = loadRealRecipe(
      "plugins/user/theme-songti/themes/songti-print.json",
      "songti-print", "宋体印刷体 Songti Print", "light",
    );
    expect(recipe).not.toBeNull();
    expect(recipe!.type).toBe("light");
    expect(recipe!.appearance?.font).toEqual({ ui: "SimSun", mono: "Cascadia Mono" });
    const tokens = mergeDomains(recipe!);
    expect(tokens["font-ui"]).toBe("SimSun");
    expect(tokens["font-mono"]).toBe("Cascadia Mono");
    expect(tokens["radius-sm"]).toBeUndefined(); // 形制零值——不写 --radius-*（继承现状直角）
    expect(tokens["bg-window"]).toBe("#FBF8F2"); // 纸白墨黑
    expect(tokens["accent"]).toBe("#4A463E");
  });

  it("terminal-monofont — 终端机 font 域（ui+mono 全 Cascadia Mono 等宽族；形制现状直角）", () => {
    const { recipe } = loadRealRecipe(
      "plugins/user/theme-terminal/themes/terminal-monofont.json",
      "terminal-monofont", "终端机 Terminal Mono", "dark",
    );
    expect(recipe).not.toBeNull();
    expect(recipe!.appearance?.font).toEqual({ ui: "Cascadia Mono", mono: "Cascadia Mono" });
    const tokens = mergeDomains(recipe!);
    expect(tokens["font-ui"]).toBe("Cascadia Mono");
    expect(tokens["font-mono"]).toBe("Cascadia Mono");
    expect(tokens["radius-sm"]).toBeUndefined();
    expect(tokens["bg-window"]).toBe("#0C0C0C"); // 终端黑底
    expect(tokens["accent"]).toBe("#00E676"); // 磷光绿
    expect(tokens["status-connected"]).toBe("#00E676");
  });

  it("pill-bubble — 全胶囊 radius 域（七档 999px 绝对圆角 + radius-full 去键继承 :root 50% + 悬浮形态 radius999/shadow + 泡泡糖）", () => {
    const { recipe } = loadRealRecipe(
      "plugins/user/theme-pill/themes/pill-bubble.json",
      "pill-bubble", "全胶囊 Pill Bubble", "light",
    );
    expect(recipe).not.toBeNull();
    // E5.8#85：radius-full 相对几何值 50%（:root 继承）——配方不写绝对 px（去键即继承）
    expect(recipe!.appearance?.radius).toEqual({
      xs: 999, sm: 999, md: 999, lg: 999, xl: 999, "2xl": 999, pill: 999,
    });
    expect(recipe!.appearance?.radius?.full).toBeUndefined();
    const tokens = mergeDomains(recipe!);
    expect(tokens["radius-md"]).toBe("999px"); // tab 胶囊
    expect(tokens["radius-pill"]).toBe("999px");
    expect(tokens["surface-radius"]).toBe("999px"); // zone 胶囊化
    expect(tokens["surface-inset"]).toBe("2px"); // 缝法则宿主派生——主题 inset 数据已废弃，radius≠0 → 每格半缝
    expect(tokens["surface-shadow"]).toBe("var(--shadow-lift)"); // 投影浮起
    expect(tokens["glass-specular"]).toBe("0.4"); // 发丝光边（gallery surface.border 意图 = specular 派生）
    expect(tokens["bg-window"]).toBe("#FFF0F5");
    expect(tokens["accent"]).toBe("#D6336C"); // 泡泡糖
  });

  it("panorama — 整窗主视觉 background 域（mode:panorama 全窗铺图 + 低遮罩 0.15 + zone 半透明让位，chrome 让位给影像）", () => {
    const { recipe } = loadRealRecipe(
      "plugins/user/theme-panorama/themes/panorama.json",
      "panorama", "整窗主视觉 Main Visual", "dark",
    );
    expect(recipe).not.toBeNull();
    expect(recipe!.type).toBe("dark");
    expect(recipe!.appearance?.background).toEqual({
      mode: "panorama",
      image: "linkdesk://theme-panorama/resources/sailor-moon.jpg",
      opacity: 1,
      mask: 0.15,
    });
    const tokens = mergeDomains(recipe!);
    expect(tokens["bg-image"]).toBe('url("linkdesk://theme-panorama/resources/sailor-moon.jpg")'); // 全窗铺图
    expect(tokens["bg-opacity"]).toBe("1");
    expect(tokens["bg-mask"]).toBe("0.15"); // 低遮罩——图几乎全露
    expect(tokens["bg-mask-color"]).toBe("#000000"); // 遮罩基色缺省黑
    expect(tokens["radius-sm"]).toBeUndefined(); // 形制现状直角——不写 --radius-*（继承现状）
    expect(tokens["font-ui"]).toBeUndefined(); // 字体系统默认——不写 --font-ui
    expect(tokens["bg-window"]).toBe("rgba(10, 14, 20, 0.30)"); // zone 半透明让位给图
    expect(tokens["accent"]).toBe("#FFB85C"); // 月夜暖光
  });
});

/* ── E5.8#74：旧格式主题迁移新格式——决策 F「零向后兼容读」兑现。
   极光玻璃/影像分区/纸纹分区 3 主题从旧格式（顶层 colors+surface+background）纯数据迁移到
   { id, name, type, appearance, colorways[] }。本测试断言新格式字段 + mergeDomains token 与迁移前逐键一致（零回归）。 */
describe("ThemeEngine — 旧格式主题迁移新格式（E5.8#74，决策 F）", () => {
  it("aurora-glass — 极光玻璃（appearance.glass 全玻璃+悬浮形态 + background 全窗图，colorway 单配色）", () => {
    const { recipe } = loadRealRecipe(
      "plugins/user/theme-aurora-glass/aurora-glass.json",
      "aurora-glass", "极光玻璃 Aurora Glass", "dark",
    );
    expect(recipe).not.toBeNull();
    expect(recipe!.id).toBe("aurora-glass");
    expect(recipe!.type).toBe("dark");
    // 旧顶层 surface → appearance.glass（ThemeSurface 全字段）
    expect(recipe!.appearance?.glass).toEqual({
      type: "glass", blur: 24, saturate: 1.25, tint: "rgba(59, 77, 148, 0.35)",
      opacity: 0.275, specular: 0.6, morph: 200, radius: 12, shadow: true,
    });
    expect(recipe!.appearance?.background).toEqual({
      image: "linkdesk://theme-aurora-glass/resources/aurora-bg.svg", opacity: 0.9, mask: 0.3,
    });
    expect(recipe!.colorways).toHaveLength(1);
    expect(recipe!.colorways[0].id).toBe("aurora");
    // 旧顶层 colors → colorways[0].colors（半透明紫 bg-titlebar 保留）
    expect(recipe!.colorways[0].colors?.["bg-titlebar"]).toBe("rgba(16, 26, 51, 0.55)");
    const tokens = mergeDomains(recipe!);
    expect(tokens["glass-blur"]).toBe("24px");
    expect(tokens["glass-saturate"]).toBe("1.25");
    expect(tokens["glass-tint"]).toBe("rgba(59, 77, 148, 0.35)");
    expect(tokens["glass-opacity"]).toBe("0.275");
    expect(tokens["glass-specular"]).toBe("0.6");
    expect(tokens["glass-morph"]).toBe("200ms");
    expect(tokens["surface-radius"]).toBe("12px");
    expect(tokens["surface-inset"]).toBe("2px"); // 缝法则——主题 inset 数据已废弃，radius≠0 → 每格半缝
    expect(tokens["surface-shadow"]).toBe("var(--shadow-lift)");
    expect(tokens["bg-image"]).toBe('url("linkdesk://theme-aurora-glass/resources/aurora-bg.svg")');
    expect(tokens["bg-opacity"]).toBe("0.9");
    expect(tokens["bg-mask"]).toBe("0.3");
    expect(tokens["bg-window"]).toBe("rgba(11, 16, 32, 0.55)");
    expect(tokens["accent"]).toBe("#7C3AED");
  });

  it("image-zones — 影像分区（appearance.glass 悬浮形态 + background.mode:zones 连续切片）", () => {
    const { recipe } = loadRealRecipe(
      "plugins/user/theme-zones/image-zones.json",
      "image-zones", "影像分区 Image Zones", "dark",
    );
    expect(recipe).not.toBeNull();
    expect(recipe!.id).toBe("image-zones");
    expect(recipe!.type).toBe("dark");
    expect(recipe!.appearance?.glass).toEqual({ radius: 8 });
    expect(recipe!.appearance?.background).toEqual({
      mode: "zones", image: "linkdesk://theme-zones/resources/zones-bg.svg", opacity: 0.95,
    });
    expect(recipe!.colorways).toHaveLength(1);
    expect(recipe!.colorways[0].id).toBe("image");
    const tokens = mergeDomains(recipe!);
    expect(tokens["surface-radius"]).toBe("8px");
    expect(tokens["surface-inset"]).toBe("2px"); // 缝法则——radius≠0 → 每格半缝
    // zones 模式——图挂 zone 表面，不写全窗 --bg-image
    expect(tokens["surface-bg-image"]).toBe('url("linkdesk://theme-zones/resources/zones-bg.svg")');
    expect(tokens["surface-bg-repeat"]).toBe("no-repeat");
    expect(tokens["surface-bg-zones"]).toBe("1");
    expect(tokens["surface-bg-opacity"]).toBe("0.95");
    expect(tokens["bg-image"]).toBe("none"); // zones 模式——全窗层零值（图只挂 zone 表面）
    expect(tokens["bg-window"]).toBe("#12100C");
    expect(tokens["accent"]).toBe("#E8923C");
  });

  it("paper-zones — 纸纹分区（appearance.glass texture 平铺纹理 + 悬浮形态，无 background）", () => {
    const { recipe } = loadRealRecipe(
      "plugins/user/theme-zones/paper-zones.json",
      "paper-zones", "纸纹分区 Paper Zones", "light",
    );
    expect(recipe).not.toBeNull();
    expect(recipe!.id).toBe("paper-zones");
    expect(recipe!.type).toBe("light");
    expect(recipe!.appearance?.glass).toEqual({
      texture: "linkdesk://theme-zones/resources/paper-texture.svg", textureOpacity: 0.45,
      radius: 8,
    });
    expect(recipe!.appearance?.background).toBeUndefined(); // 旧无 background
    expect(recipe!.colorways).toHaveLength(1);
    // E5.8 主题过老修正：配色 id 全局唯一契约（theme.ts L92）——kraft 避 songti-print 同款 "paper" 冲突
    expect(recipe!.colorways[0].id).toBe("kraft");
    const tokens = mergeDomains(recipe!);
    expect(tokens["surface-bg-image"]).toBe('url("linkdesk://theme-zones/resources/paper-texture.svg")');
    expect(tokens["surface-bg-repeat"]).toBe("repeat"); // 纹理平铺
    expect(tokens["surface-bg-opacity"]).toBe("0.45");
    expect(tokens["surface-radius"]).toBe("8px");
    expect(tokens["surface-inset"]).toBe("2px"); // 缝法则——radius≠0 → 每格半缝
    expect(tokens["bg-window"]).toBe("#ECE7DC");
    expect(tokens["accent"]).toBe("#B45309");
  });
});
