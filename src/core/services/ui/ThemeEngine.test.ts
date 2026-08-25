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
  applyRadiusScale,
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
  normalizeThemeValue,
  getMixProfile,
  getRadiusSourcePx,
  mergeMixDomains,
  MIX_FOLLOW_THEME,
  syncThemeColorConfig,
  APPEARANCE_OVERRIDE_KEYS,
  isMixSourceOwner,
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

  it("带悬浮面板 surface → 写入 radius/inset/shadow（shadow:true → 映射 --shadow-lift）", () => {
    applyTheme({ ...MOCK_THEME, surface: { type: "glass", radius: 10, inset: 8, shadow: true } });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-radius")).toBe("10px");
    expect(root.style.getPropertyValue("--surface-inset")).toBe("8px");
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
      surface: { texture: "linkdesk://demo-zones/paper.svg", textureOpacity: 0.45, radius: 8, inset: 4 },
    });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-bg-image")).toBe('url("linkdesk://demo-zones/paper.svg")');
    expect(root.style.getPropertyValue("--surface-bg-repeat")).toBe("repeat");
    expect(root.style.getPropertyValue("--surface-bg-opacity")).toBe("0.45");
    expect(root.style.getPropertyValue("--surface-bg-zones")).toBe("0");
    // glass 变量仍零值——纹理与 glass 正交
    expect(root.style.getPropertyValue("--glass-blur")).toBe("0px");
  });

  it("无 glass 的 surface（⑬⑭ 分区）→ radius/inset 仍生效（悬浮形态与玻璃材质正交）", () => {
    applyTheme({ ...MOCK_THEME, surface: { texture: "tile.svg", radius: 8, inset: 4 } });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-radius")).toBe("8px");
    expect(root.style.getPropertyValue("--surface-inset")).toBe("4px");
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

  it("neutral 默认 → 仅 radius 键恒写，玻璃/背景不覆盖", () => {
    const overrides = getAppearanceOverrides();
    expect(overrides["glass-blur"]).toBeUndefined();
    expect(overrides["glass-opacity"]).toBeUndefined();
    expect(overrides["glass-tint"]).toBeUndefined();
    expect(overrides["bg-image"]).toBeUndefined();
    for (const key of RADIUS_KEYS) expect(overrides[key]).toBeDefined();
    // --radius-pill/--radius-full 形态值不乘不入覆盖集
    expect(overrides["radius-pill"]).toBeUndefined();
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

  it("surfaceRadius 偏离默认 → 缩放 radius 六键仍全写", () => {
    applyRemoteConfigChange("app.surfaceRadius", 1.5);
    const overrides = getAppearanceOverrides();
    for (const key of RADIUS_KEYS) expect(overrides[key]).toBeDefined();
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

  it("E5.8#56 审计#4——applyRadiusScale 越界 clamp：scale 5 → 钳到 2（settings.json 直写 5 不再 5× 圆角）", () => {
    const scaled = applyRadiusScale(5, { "radius-md": "8px" });
    expect(scaled["radius-md"]).toBe("16px"); // 8 × clamp(2) 非 8 × 5=40px
  });

  it("E5.8#56 审计#4——applyRadiusScale 负越界 clamp：scale -1 → 钳到 0（方角），非负数取反", () => {
    const scaled = applyRadiusScale(-1, { "radius-md": "8px" });
    expect(scaled["radius-md"]).toBe("0px");
  });

  it("E5.8#56——applyRadiusScale 合法域内不变：scale 1.5 → 8×1.5=12px", () => {
    const scaled = applyRadiusScale(1.5, { "radius-md": "8px" });
    expect(scaled["radius-md"]).toBe("12px");
  });

  it("applyRadiusScale — 返回六档键集、不含形态值（数值来自 :root 基准，jsdom 无 CSS = 0px）", () => {
    const scaled = applyRadiusScale(2);
    for (const key of RADIUS_KEYS) expect(scaled[key]).toBeDefined();
    expect(scaled["radius-pill"]).toBeUndefined();
    expect(scaled["radius-full"]).toBeUndefined();
  });

  it("applyRadiusScale(0) — 0 方角档（E5.8#68）：六档全 0px 方角，形态值仍排除", () => {
    const scaled = applyRadiusScale(0, { "radius-md": "12px", "radius-sm": "6px", "radius-lg": "16px" });
    for (const key of RADIUS_KEYS) expect(scaled[key]).toBe("0px");
    expect(scaled["radius-pill"]).toBeUndefined();
    expect(scaled["radius-full"]).toBeUndefined();
  });

  it("applyTheme 折叠覆盖——glassBlur 覆盖胜过主题 surface.blur", () => {
    applyRemoteConfigChange("app.glassBlur", 15);
    applyTheme({ ...MOCK_THEME, surface: { type: "glass", blur: 8 } });
    expect(document.documentElement.style.getPropertyValue("--glass-blur")).toBe("15px");
  });

  it("E5.8#60 F1.1——APPEARANCE_OVERRIDE_KEYS = 全 6 键含 app.fontFamily（单一来源防回归）", () => {
    // 设置层外观覆盖 key 全集——壳命令（startup appearanceMode onApply）与插件 API（theme.resetAppearance）复位共用
    expect([...APPEARANCE_OVERRIDE_KEYS]).toEqual([
      "app.surfaceRadius", "app.glassBlur", "app.glassOpacity",
      "app.glassTint", "app.backgroundImage", "app.fontFamily",
    ]);
    // 每键确与 getAppearanceOverrides 读的配置键对齐（写多了 reset 摘不到、写少了残留覆盖）
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.fontFamily"); // 插件侧旧表漏此键 → 复位后字体不回基线
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.surfaceRadius");
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

  it("overrides radius scale 系数 → 对主题现值 JS 乘算（pill/full 不乘）", () => {
    const tokens = mergeDomains(RECIPE, "dew", { "radius-lg": 1.5 });
    expect(tokens["radius-lg"]).toBe("18px"); // 12 × 1.5
    expect(tokens["radius-sm"]).toBe("9px"); // 6 × 1.5
    // 主题没写的档 → 壳默认乘算（jsdom 无 CSS 基址 0px → 恒写 0px 清残留）
    expect(tokens["radius-md"]).toBe("0px");
    expect(tokens["radius-pill"]).toBeUndefined();
  });

  it("overrides 绝对 token → 覆盖主题值（glass-blur 绝对覆盖胜过 appearance.glass.blur）", () => {
    const tokens = mergeDomains(RECIPE, "dew", { "glass-blur": "24px" });
    expect(tokens["glass-blur"]).toBe("24px");
  });

  it("applyOverrides — radius 系数对 tokens 现值乘算；非 radius 绝对写", () => {
    const tokens = { "radius-md": "10px", "glass-blur": "8px" };
    applyOverrides(tokens, { "radius-md": 2, "glass-blur": "16px" });
    expect(tokens["radius-md"]).toBe("20px");
    expect(tokens["glass-blur"]).toBe("16px");
  });

  it("applyRadiusScale(scale, tokens) — 有现值乘现值；无现值用壳默认（0px）", () => {
    const scaled = applyRadiusScale(2, { "radius-md": "6px" });
    expect(scaled["radius-md"]).toBe("12px");
    expect(scaled["radius-sm"]).toBe("0px");
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
  it("圆角反推 scale——当前 radius-md ÷ 主题原值，clamp 0-2（E5.8#68：0 方角档不再下限 0.5）", () => {
    const seeds = deriveAppearanceSeeds({ "radius-md": "12px" }, 8);
    expect(seeds.surfaceRadius).toBe(1.5);
    expect(deriveAppearanceSeeds({ "radius-md": "20px" }, 8).surfaceRadius).toBe(2);
    expect(deriveAppearanceSeeds({ "radius-md": "2px" }, 8).surfaceRadius).toBe(0.3);
  });

  it("主题原值 ≤ 0 / 无 radius token → scale 回退 1（非归零）", () => {
    expect(deriveAppearanceSeeds({ "radius-md": "10px" }, 0).surfaceRadius).toBe(1);
    expect(deriveAppearanceSeeds({}, 8).surfaceRadius).toBe(1);
  });

  it("玻璃绝对播种——token 值直播；tint 剥 transparent → 空", () => {
    const seeds = deriveAppearanceSeeds({
      "glass-blur": "18px",
      "glass-opacity": "0.4",
      "glass-tint": "rgba(10,20,30,0.5)",
    }, 8);
    expect(seeds.glassBlur).toBe(18);
    expect(seeds.glassOpacity).toBe(0.4);
    expect(seeds.glassTint).toBe("rgba(10,20,30,0.5)");
    expect(deriveAppearanceSeeds({ "glass-tint": "transparent" }, 8).glassTint).toBe("");
  });

  it("背景剥 url() 存受控路径；none/缺省 → 空", () => {
    const seeds = deriveAppearanceSeeds({ "bg-image": 'url("C:/app/bg.png")' }, 8);
    expect(seeds.backgroundImage).toBe("C:/app/bg.png");
    expect(deriveAppearanceSeeds({ "bg-image": "none" }, 8).backgroundImage).toBe("");
    expect(deriveAppearanceSeeds({}, 8).backgroundImage).toBe("");
  });

  it("字体播种跳过资产族（__ld_ 前缀只显示不选，#50.20 边界）；系统族名直播", () => {
    expect(deriveAppearanceSeeds({ "font-ui": "SimSun" }, 8).fontFamily).toBe("SimSun");
    expect(deriveAppearanceSeeds({ "font-ui": "__ld_demo-plugin_serif" }, 8).fontFamily).toBe("");
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

  it("getMixProfile — 缺省全 followTheme；读 app.mix* 配置", () => {
    const p1 = getMixProfile();
    for (const d of ["colors", "font", "radius", "glass", "background", "surface"] as const) {
      expect(p1[d]).toBe(MIX_FOLLOW_THEME);
    }
    applyRemoteConfigChange("app.themeColor", "mint"); // E5.8#82：colors 域来源并入 app.themeColor（app.mixColor 删）
    applyRemoteConfigChange("app.mixFont", "demo-radius");
    const p2 = getMixProfile();
    expect(p2.colors).toBe("mint");
    expect(p2.font).toBe("demo-radius");
    expect(p2.radius).toBe(MIX_FOLLOW_THEME);
  });

  it("mergeMixDomains — 每域各自取来源（颜色=配方+配色；圆角=来源配方；跟随域=基础配方）", () => {
    const profile: MixProfile = {
      colors: "mint",
      font: MIX_FOLLOW_THEME,
      radius: "demo-radius",
      glass: MIX_FOLLOW_THEME,
      background: MIX_FOLLOW_THEME,
      surface: MIX_FOLLOW_THEME,
    };
    const tokens = mergeMixDomains(RECIPE, RECIPE.colorways[0], profile, {});
    expect(tokens["bg-window"]).toBe("#F7FBF8"); // 颜色域 → mint 配色
    expect(tokens["accent"]).toBe("#3E9E8C");
    expect(tokens["radius-lg"]).toBe("4px"); // 圆角域 → demo-radius
    expect(tokens["radius-sm"]).toBe("2px");
    expect(tokens["font-ui"]).toBe("Noto Sans SC"); // 字体域跟随 → 基础配方
    expect(tokens["glass-blur"]).toBe("14px"); // 玻璃域跟随 → 基础配方
  });

  it("mergeMixDomains — 来源配方缺失 → 回退基础配方（域不空窗）", () => {
    const profile: MixProfile = {
      colors: "mint",
      font: "demo-missing",
      radius: MIX_FOLLOW_THEME,
      glass: MIX_FOLLOW_THEME,
      background: MIX_FOLLOW_THEME,
      surface: MIX_FOLLOW_THEME,
    };
    const tokens = mergeMixDomains(RECIPE, RECIPE.colorways[0], profile, {});
    expect(tokens["font-ui"]).toBe("Noto Sans SC"); // 缺失来源 → 基础配方兜底
    expect(tokens["bg-window"]).toBe("#F7FBF8"); // 颜色域仍按来源
  });

  it("applyRecipe mix — 配色跟颜色域来源；圆角跟圆角域；明暗/activeRecipe 跟基础配方", () => {
    applyRemoteConfigChange("app.mixMode", "mix");
    applyRemoteConfigChange("app.themeColor", "mint"); // E5.8#82：colors 域来源 = app.themeColor
    applyRemoteConfigChange("app.mixRadius", "demo-radius");
    applyRecipe(RECIPE, "dew", {});
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--bg-window")).toBe("#F7FBF8"); // 颜色域 → mint
    expect(root.style.getPropertyValue("--accent")).toBe("#3E9E8C");
    expect(root.style.getPropertyValue("--radius-lg")).toBe("4px"); // 圆角域 → demo-radius
    expect(root.style.getPropertyValue("--glass-blur")).toBe("14px"); // 玻璃域跟随 → 基础配方
    expect(root.getAttribute("data-theme")).toBe("dark"); // 明暗跟基础配方
    expect(getActiveRecipe()).toEqual({ recipeId: "demo-recipe", colorwayId: "dew" });
    expect(getCurrentTheme()?.colors.accent).toBe("#3E9E8C"); // 快照 accent 跟混搭颜色域来源
  });

  it("E5.8#59 审计#7——applyRecipe mix：currentTheme.surface/background 取混搭各域生效来源（非基础配方）", () => {
    // 虚构 fixture：玻璃域来源 demo-glass（blur 24/tint）与背景域来源 demo-bg——基础配方 RECIPE glass.blur=14 无 background
    const GLASS_SRC: ThemeRecipe = {
      id: "demo-glass", name: "Demo Glass", type: "light",
      appearance: { glass: { type: "glass", blur: 24, tint: "#123456", opacity: 0.4 } },
      colorways: [{ id: "c", name: "C", colors: {} }],
    };
    const BG_SRC: ThemeRecipe = {
      id: "demo-bg", name: "Demo Bg", type: "light",
      appearance: { background: { image: "assets/b.png", opacity: 0.8, mask: 0.3 } },
      colorways: [{ id: "c", name: "C", colors: {} }],
    };
    ThemeRegistry.registerRecipe(GLASS_SRC, PLUGIN);
    ThemeRegistry.registerRecipe(BG_SRC, PLUGIN);
    applyRemoteConfigChange("app.mixMode", "mix");
    applyRemoteConfigChange("app.mixGlass", "demo-glass");
    applyRemoteConfigChange("app.mixBackground", "demo-bg");
    applyRecipe(RECIPE, "dew", {});
    const t = getCurrentTheme();
    expect(t?.surface?.blur).toBe(24); // 玻璃域来源 demo-glass（修复前取基础配方 blur 14）
    expect(t?.surface?.tint).toBe("#123456");
    expect(t?.background?.image).toBe("assets/b.png"); // 背景域来源 demo-bg（修复前 undefined）
    expect(t?.background?.opacity).toBe(0.8);
    expect(t?.colors.accent).toBe("#2BA876"); // 颜色域 followTheme → 基础配方 dew——域独立性零回归
  });

  it("E5.8#59——mix 来源缺 glass 域 → currentTheme.surface 回退基础配方该域（缺域回退同 mergeMixDomains）", () => {
    const NO_GLASS: ThemeRecipe = {
      id: "demo-noglass", name: "Demo NoGlass", type: "light",
      appearance: { radius: { sm: 4 } },
      colorways: [{ id: "c", name: "C", colors: {} }],
    };
    ThemeRegistry.registerRecipe(NO_GLASS, PLUGIN);
    applyRemoteConfigChange("app.mixMode", "mix");
    applyRemoteConfigChange("app.mixGlass", "demo-noglass");
    applyRecipe(RECIPE, "dew", {});
    expect(getCurrentTheme()?.surface?.blur).toBe(14); // 来源缺 glass 域 → 基础配方 RECIPE 兜底
  });

  it("applyRecipe mix — mixFont 资产字体来源 → 族名写 --font-ui + @font-face 落 DOM", () => {
    ThemeRegistry.registerRecipe(RECIPE_ASSET, PLUGIN);
    applyRemoteConfigChange("app.mixMode", "mix");
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
    applyRemoteConfigChange("app.mixMode", "mix");
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
    const NO_RADIUS: ThemeRecipe = {
      id: "demo-noradius", name: "Demo NoRadius", type: "light",
      appearance: { font: { ui: "Arial" } },
      colorways: [{ id: "c", name: "C", colors: {} }],
    };
    ThemeRegistry.registerRecipe(NO_RADIUS, PLUGIN);
    const profile: MixProfile = {
      colors: MIX_FOLLOW_THEME,
      font: MIX_FOLLOW_THEME,
      radius: "demo-noradius", // 来源存在但无 radius 域
      glass: MIX_FOLLOW_THEME,
      background: MIX_FOLLOW_THEME,
      surface: MIX_FOLLOW_THEME,
    };
    const tokens = mergeMixDomains(RECIPE, RECIPE.colorways[0], profile, {});
    expect(tokens["radius-sm"]).toBe("6px"); // 回退基础配方 RECIPE radius.sm=6
    expect(tokens["radius-lg"]).toBe("12px");
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

  it("E5.8#57 审计#3——getRadiusSourcePx：mix 下读圆角域来源配方原生 radius-md 当播种分母（二次缩放根治）", () => {
    // 虚构 fixture：demo-base（radius.md 8）+ demo-src（radius.md 20）两配方
    const BASE: ThemeRecipe = {
      id: "demo-base", name: "Demo Base", type: "light",
      appearance: { radius: { md: 8, lg: 16 } },
      colorways: [{ id: "c", name: "C", colors: {} }],
    };
    const SRC: ThemeRecipe = {
      id: "demo-src", name: "Demo Src", type: "light",
      appearance: { radius: { md: 20, lg: 40 } },
      colorways: [{ id: "c", name: "C", colors: {} }],
    };
    ThemeRegistry.registerRecipe(BASE, PLUGIN);
    ThemeRegistry.registerRecipe(SRC, PLUGIN);
    applyRemoteConfigChange("app.theme", "demo-base");
    applyRemoteConfigChange("app.mixMode", "mix");
    applyRemoteConfigChange("app.mixRadius", "demo-src");
    applyRecipe(BASE, "c", {});
    // mix：生效 radius 来自 demo-src → 分母 = 来源原生 20（旧逻辑活动配方 8）
    expect(getRadiusSourcePx()).toBe(20);
    // 播种反推：生效 20 ÷ 来源 20 = scale 1（旧 20÷8=2.5 → clamp 2 → 20×2=40 暴涨）
    expect(deriveAppearanceSeeds({ "radius-md": "20px" }, getRadiusSourcePx()).surfaceRadius).toBe(1);
    // mix 但圆角域 followTheme → 分母 = 活动配方原生 8（跟随域不误取来源）
    applyRemoteConfigChange("app.mixRadius", MIX_FOLLOW_THEME);
    expect(getRadiusSourcePx()).toBe(8);
    // 非 mix 零回归：分母 = 活动配方原生 8
    applyRemoteConfigChange("app.mixMode", "recipe");
    expect(getRadiusSourcePx()).toBe(8);
  });

  it("E5.8#61 审计#1——isMixSourceOwner：mix 域配置引用其配方/配色 → true；引用他人/未引用 → false", () => {
    // E5.8#82：colors 域来源只在 mix 模式成立（recipe 模式下 themeColor 是真配色 id 非混搭来源）——先置 mix
    applyRemoteConfigChange("app.mixMode", "mix");
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
    // 圆角域 = 配方粒度：demo-radius 归 demo-mix → true
    applyRemoteConfigChange("app.mixRadius", "demo-radius");
    expect(isMixSourceOwner(PLUGIN)).toBe(true);
    applyRemoteConfigChange("app.mixRadius", MIX_FOLLOW_THEME);
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

  it("pill-bubble — 全胶囊 radius 域（八档 999px + 悬浮形态 radius999/inset8/shadow + 泡泡糖）", () => {
    const { recipe } = loadRealRecipe(
      "plugins/user/theme-pill/themes/pill-bubble.json",
      "pill-bubble", "全胶囊 Pill Bubble", "light",
    );
    expect(recipe).not.toBeNull();
    expect(recipe!.appearance?.radius).toEqual({
      xs: 999, sm: 999, md: 999, lg: 999, xl: 999, "2xl": 999, pill: 999, full: 999,
    });
    const tokens = mergeDomains(recipe!);
    expect(tokens["radius-md"]).toBe("999px"); // tab 胶囊
    expect(tokens["radius-pill"]).toBe("999px");
    expect(tokens["surface-radius"]).toBe("999px"); // zone 胶囊化
    expect(tokens["surface-inset"]).toBe("8px"); // 留缝
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
      opacity: 0.55, specular: 0.6, morph: 200, radius: 12, inset: 1, shadow: true,
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
    expect(tokens["glass-opacity"]).toBe("0.55");
    expect(tokens["glass-specular"]).toBe("0.6");
    expect(tokens["glass-morph"]).toBe("200ms");
    expect(tokens["surface-radius"]).toBe("12px");
    expect(tokens["surface-inset"]).toBe("1px");
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
    expect(recipe!.appearance?.glass).toEqual({ radius: 8, inset: 4 });
    expect(recipe!.appearance?.background).toEqual({
      mode: "zones", image: "linkdesk://theme-zones/resources/zones-bg.svg", opacity: 0.95,
    });
    expect(recipe!.colorways).toHaveLength(1);
    expect(recipe!.colorways[0].id).toBe("image");
    const tokens = mergeDomains(recipe!);
    expect(tokens["surface-radius"]).toBe("8px");
    expect(tokens["surface-inset"]).toBe("4px");
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
      radius: 8, inset: 4,
    });
    expect(recipe!.appearance?.background).toBeUndefined(); // 旧无 background
    expect(recipe!.colorways).toHaveLength(1);
    expect(recipe!.colorways[0].id).toBe("paper");
    const tokens = mergeDomains(recipe!);
    expect(tokens["surface-bg-image"]).toBe('url("linkdesk://theme-zones/resources/paper-texture.svg")');
    expect(tokens["surface-bg-repeat"]).toBe("repeat"); // 纹理平铺
    expect(tokens["surface-bg-opacity"]).toBe("0.45");
    expect(tokens["surface-radius"]).toBe("8px");
    expect(tokens["surface-inset"]).toBe("4px");
    expect(tokens["bg-window"]).toBe("#ECE7DC");
    expect(tokens["accent"]).toBe("#B45309");
  });
});
