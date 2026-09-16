/**
 * ThemeEngine/registry 单元测试——register/unregister/getAvailable/loadTheme/findTheme/registerFallbackThemes。
 * #36l1：核心 Registry/Service 层 vitest 覆盖。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
// E5.8 Phase 11.15 3b：unregisterTheme/getThemesByPlugin 从门面撤出——registry 测试直引本体
import { unregisterTheme, getThemesByPlugin } from "./registry";
import {
  registerTheme,
  getAvailableThemes,
  loadTheme,
  findTheme,
  registerFallbackThemes,
  normalizeThemeValue,
} from "../ThemeEngine";
import { rollback } from "../../../registry/registrationTracker";
import { ThemeRegistry } from "../../../registry/appearance/ThemeRegistry";
import { MOCK_THEME, MOCK_THEME2 } from "./testFixtures.mock";

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

  // 🔴 E6#111f／1.36 判据⑥：本用例**翻面**——旧预期是「覆盖无 pluginId 的 fallback 不告警」，
  //   那是 1.36 明写**废除**的行为（「覆盖宿主兜底要出声」）。flat 本键 = 显示名 ⇒ `reservedFace:false`
  //   （不判「是不是宿主保留面」），但**⑥那条分支照判**：占位者无 pluginId ⇒ 拒 ＋ console.error。
  it("registerTheme — 覆盖无 pluginId 的条目 ⇒ 拒 ＋ console.error（判据⑥：1.36 起不再静默）", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    registerTheme({ name: "Dark", type: "dark", colors: {} }); // 无 pluginId = 宿主侧条目
    const dispose = registerTheme({ name: "Dark", type: "dark", colors: { bg: "#111" } }, "theme-dark");
    const theme = findTheme("Dark");
    expect(theme?.pluginId).toBeUndefined(); // 先者保留——后注册者**没写进去**
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain("theme-dark"); // 点名本次登记者
    // 被拒的注册返 no-op disposer：调用它**不许**把先者那条摘掉
    dispose();
    expect(findTheme("Dark")).toBeDefined();
    spy.mockRestore();
  });

  it("registerTheme — 反向负控：同 pluginId 重注册 ⇒ 第二次生效且**零日志**（装配路径多阶段）", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    registerTheme({ name: "Dark", type: "dark", colors: {} }, "theme-dark");
    const second = registerTheme({ name: "Dark", type: "dark", colors: { bg: "#222" } }, "theme-dark");
    expect(findTheme("Dark")?.colors).toEqual({ bg: "#222" }); // 后者生效
    expect(spy).not.toHaveBeenCalled(); // 不出声
    second();
    expect(findTheme("Dark")).toBeUndefined(); // 真 disposer（与 no-op 那支相反）
    spy.mockRestore();
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
