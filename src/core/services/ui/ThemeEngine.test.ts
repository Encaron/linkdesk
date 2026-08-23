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
} from "./ThemeEngine";
import { rollback } from "../../registry/registrationTracker";
import { applyRemoteConfigChange, clearConfigurationCache } from "../configuration/ConfigurationService";
import type { Theme } from "./ThemeEngine";

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
  it("registerFallbackThemes — 注册 Dark/Light 且幂等", () => {
    registerFallbackThemes();
    const themes = getAvailableThemes();
    expect(themes).toContain("Dark");
    expect(themes).toContain("Light");
    // 幂等——重复调用不重复注册
    const before = themes.length;
    registerFallbackThemes();
    expect(getAvailableThemes().length).toBe(before);
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

  it("backgroundImage Windows 反斜杠路径 → url() 归一化正斜杠", () => {
    applyRemoteConfigChange("app.backgroundImage", "C:\\Users\\feng\\bg.png");
    expect(getAppearanceOverrides()["bg-image"]).toBe('url("C:/Users/feng/bg.png")');
  });

  it("surfaceRadius 偏离默认 → 缩放 radius 六键仍全写", () => {
    applyRemoteConfigChange("app.surfaceRadius", 1.5);
    const overrides = getAppearanceOverrides();
    for (const key of RADIUS_KEYS) expect(overrides[key]).toBeDefined();
  });

  it("applyRadiusScale — 返回六档键集、不含形态值（数值来自 :root 基准，jsdom 无 CSS = 0px）", () => {
    const scaled = applyRadiusScale(2);
    for (const key of RADIUS_KEYS) expect(scaled[key]).toBeDefined();
    expect(scaled["radius-pill"]).toBeUndefined();
    expect(scaled["radius-full"]).toBeUndefined();
  });

  it("applyTheme 折叠覆盖——glassBlur 覆盖胜过主题 surface.blur", () => {
    applyRemoteConfigChange("app.glassBlur", 15);
    applyTheme({ ...MOCK_THEME, surface: { type: "glass", blur: 8 } });
    expect(document.documentElement.style.getPropertyValue("--glass-blur")).toBe("15px");
  });
});
