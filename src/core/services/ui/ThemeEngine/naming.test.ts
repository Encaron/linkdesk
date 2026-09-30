/**
 * 配方/配色显示名（2026-09-30 用户实机立案「app.theme 卡片指认不明」）。
 * 覆盖：宿主兜底 ⇒ 名字走 t()（壳核心文字）／插件配方 ⇒ 名字原样（作者声明数据，⛔ 不二次 t()）／
 *       未登记 id 不崩／真实兜底配方的名字（「内置」/「内置浅色」，不再是颜色词）。
 * 夹具：虚构配方名（硬约束 21）；i18n 用桩包一层，让「有没有过 t()」可断言。
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// i18n 桩——把 key 包成 [key]：宿主名字过了 t() 就看得到，插件名字原样就不该带括号
vi.mock("../../../../i18n", () => ({ default: { t: (key: string) => `[${key}]` } }));

import { ThemeRegistry } from "../../../registry/appearance/ThemeRegistry";
import { registerFallbackThemes } from "./registry";
import { isHostRecipe, recipeDisplayName, colorwayDisplayName } from "./naming";

let disposers: Array<() => void> = [];

afterEach(() => {
  for (const d of disposers) d();
  disposers = [];
});

describe("配方显示名（ThemeEngine/naming）", () => {
  it("宿主兜底配方 ⇒ 显示名走 t()（壳核心文字归语言包）", () => {
    disposers.push(
      ThemeRegistry.registerRecipe(
        { id: "demo-host", name: "Demo Builtin", type: "dark", colorways: [{ id: "demo-host-cw", name: "Demo Shade", colors: {} }] },
        undefined
      )
    );
    expect(isHostRecipe("demo-host")).toBe(true);
    expect(recipeDisplayName({ id: "demo-host", name: "Demo Builtin" })).toBe("[Demo Builtin]");
    expect(colorwayDisplayName("demo-host", "Demo Shade")).toBe("[Demo Shade]");
  });

  it("插件配方 ⇒ 名字原样（声明数据，⛔ 不二次 t()）", () => {
    disposers.push(
      ThemeRegistry.registerRecipe(
        { id: "demo-plugin-x.recipe", name: "Demo Recipe", type: "light", colorways: [{ id: "demo-cw-x", name: "Alpha", colors: {} }] },
        "demo-plugin-x"
      )
    );
    expect(isHostRecipe("demo-plugin-x.recipe")).toBe(false);
    expect(recipeDisplayName({ id: "demo-plugin-x.recipe", name: "Demo Recipe" })).toBe("Demo Recipe");
    expect(colorwayDisplayName("demo-plugin-x.recipe", "Alpha")).toBe("Alpha");
  });

  it("未登记的 id ⇒ 按宿主兜底处置（无归属插件），不抛错", () => {
    expect(isHostRecipe("nope.nothing")).toBe(true);
    expect(recipeDisplayName({ id: "nope.nothing", name: "Demo Unknown" })).toBe("[Demo Unknown]");
  });

  it("真实兜底配方：名字不再是颜色词（Dark/Light）——「内置」/「内置浅色」", () => {
    registerFallbackThemes();
    const dark = ThemeRegistry.getRecipe("dark");
    const light = ThemeRegistry.getRecipe("light");
    expect(dark?.name).toBe("内置");
    expect(light?.name).toBe("内置浅色");
    // 过 t() 后仍是同一份 key 体系（测试桩不插值，看的是「确实取了字典」）
    expect(recipeDisplayName({ id: "dark", name: dark!.name })).toBe("[内置]");
    expect(colorwayDisplayName("dark", dark!.colorways[0].name)).toBe("[深色]");
  });
});
