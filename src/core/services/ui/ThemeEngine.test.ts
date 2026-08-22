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
} from "./ThemeEngine";
import { rollback } from "../../registry/registrationTracker";
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
