/**
 * 配方/配色显示名（2026-09-30 实机立案「app.theme 卡片指认不明」；2026-10-01「我不要双语了」翻面）。
 * 覆盖：**一律过 t()**——归属（宿主兜底 / 插件配方）**不再是显示名的判据**；
 *       未登记 id 不崩；真实兜底配方的名字（「内置」/「内置浅色」）走同一份 key 体系；
 *       ⛔ 反向对照：旧的归属二分判据 `isHostRecipe` 已从本模块导出面退场（不许借尸还魂）。
 * 夹具：虚构配方名（硬约束 21）；i18n 用桩包一层，让「有没有过 t()」可断言。
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// i18n 桩——把 key 包成 [key]：**任何**名字过了 t() 就看得到括号，没过（原样返回）一定不带括号
vi.mock("../../../../i18n", () => ({ default: { t: (key: string) => `[${key}]` } }));

import { ThemeRegistry } from "../../../registry/appearance/ThemeRegistry";
import { registerFallbackThemes } from "./registry";
import { recipeDisplayName, colorwayDisplayName } from "./naming";

let disposers: Array<() => void> = [];

afterEach(() => {
  for (const d of disposers) d();
  disposers = [];
});

describe("配方显示名（ThemeEngine/naming）", () => {
  it("宿主兜底与插件配方走**同一条** t() 路（区分归属的旧规则已退场）", () => {
    disposers.push(
      ThemeRegistry.registerRecipe(
        { id: "demo-host", name: "Demo Builtin", type: "dark", colorways: [{ id: "demo-host-cw", name: "Demo Shade", colors: {} }] },
        undefined
      ),
      ThemeRegistry.registerRecipe(
        { id: "demo-plugin-x.recipe", name: "Demo Recipe", type: "light", colorways: [{ id: "demo-cw-x", name: "Alpha", colors: {} }] },
        "demo-plugin-x"
      )
    );
    // 归属仍可判（ThemeRegistry 那边照旧），但显示名不再看它——两边同款
    expect(recipeDisplayName({ name: "Demo Builtin" })).toBe("[Demo Builtin]");
    expect(recipeDisplayName({ name: "Demo Recipe" })).toBe("[Demo Recipe]");
    expect(colorwayDisplayName("Demo Shade")).toBe("[Demo Shade]");
    expect(colorwayDisplayName("Alpha")).toBe("[Alpha]");
  });

  it("插件名同样过 t()——中文原文作 key，译名住**插件自己的字典**（缺译文静默回退原文）", () => {
    expect(recipeDisplayName({ name: "薄荷苏打" })).toBe("[薄荷苏打]");
    expect(colorwayDisplayName("海盐薄荷")).toBe("[海盐薄荷]");
  });

  it("未登记的 id ⇒ 不抛错（名字取的是 name，与登记无关）", () => {
    expect(recipeDisplayName({ name: "Demo Unknown" })).toBe("[Demo Unknown]");
  });

  it("真实兜底配方：名字不再是颜色词（Dark/Light）——「内置」/「内置浅色」", () => {
    registerFallbackThemes();
    const dark = ThemeRegistry.getRecipe("dark");
    const light = ThemeRegistry.getRecipe("light");
    expect(dark?.name).toBe("内置");
    expect(light?.name).toBe("内置浅色");
    // 过 t() 后仍是同一份 key 体系（测试桩不插值，看的是「确实取了字典」）
    expect(recipeDisplayName({ name: dark!.name })).toBe("[内置]");
    expect(colorwayDisplayName(dark!.colorways[0].name)).toBe("[深色]");
  });

  it("导出面：isHostRecipe 已退场（归属二分规则不许复活）", async () => {
    const mod = await import("./naming");
    expect(Object.keys(mod).sort()).toEqual(["colorwayDisplayName", "recipeDisplayName"]);
  });
});
