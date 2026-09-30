/**
 * 配方来源与显示名（2026-09-30 用户实机立案「app.theme 卡片指认不明」）。
 * 覆盖：宿主兜底 ⇒ `{kind:"host"}` ＋ 名字走 t()（壳核心文字）／插件配方 ⇒ `{kind:"plugin"}` ＋
 *       名字原样（作者声明数据，⛔ 不二次 t()）／插件显示名解析器装配与缺席退化（报 pluginId，不裸崩）／
 *       未登记 id 不崩／真实兜底配方（`registerFallbackThemes`）的名字不再是颜色词。
 * 夹具：虚构配方名（硬约束 21）；i18n 用桩包一层，让「有没有过 t()」可断言。
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// i18n 桩——把 key 包成 [key]：宿主名字过了 t() 就看得到，插件名字原样就不该带括号
vi.mock("../../../../i18n", () => ({ default: { t: (key: string) => `[${key}]` } }));

import { ThemeRegistry } from "../../../registry/appearance/ThemeRegistry";
import { registerFallbackThemes } from "./registry";
import {
  isHostRecipe,
  recipeSourceOf,
  recipeDisplayName,
  colorwayDisplayName,
  setPluginNameResolver,
  clearPluginNameResolver,
} from "./source";

let disposers: Array<() => void> = [];

/** 插件贡献的一条配方（虚构值——硬约束 21）；两处用例共用，免 jscpd 判重 */
function registerPluginRecipe(): void {
  disposers.push(
    ThemeRegistry.registerRecipe(
      {
        id: "demo-plugin-x.recipe",
        name: "Demo Recipe",
        type: "light",
        colorways: [{ id: "demo-cw-x", name: "Alpha", colors: {} }],
      },
      "demo-plugin-x"
    )
  );
}

afterEach(() => {
  for (const d of disposers) d();
  disposers = [];
  clearPluginNameResolver();
});

describe("配方来源（ThemeEngine/source）", () => {
  it("宿主兜底配方 ⇒ kind=host，显示名走 t()（壳核心文字归语言包）", () => {
    disposers.push(
      ThemeRegistry.registerRecipe(
        { id: "demo-host", name: "Demo Builtin", type: "dark", colorways: [{ id: "demo-host-cw", name: "Demo Builtin", colors: {} }] },
        undefined
      )
    );
    expect(isHostRecipe("demo-host")).toBe(true);
    expect(recipeSourceOf("demo-host")).toEqual({ kind: "host" });
    expect(recipeDisplayName({ id: "demo-host", name: "Demo Builtin" })).toBe("[Demo Builtin]");
    expect(colorwayDisplayName("demo-host", "Demo Builtin")).toBe("[Demo Builtin]");
  });

  it("插件配方 ⇒ kind=plugin；名字原样（声明数据，⛔ 不二次 t()）", () => {
    registerPluginRecipe();
    // 解析器**未装配**（App 层没跑）⇒ 退化为 pluginId，不裸崩
    expect(recipeSourceOf("demo-plugin-x.recipe")).toEqual({ kind: "plugin", pluginId: "demo-plugin-x", name: "demo-plugin-x" });
    expect(recipeDisplayName({ id: "demo-plugin-x.recipe", name: "Demo Recipe" })).toBe("Demo Recipe");
    expect(colorwayDisplayName("demo-plugin-x.recipe", "Alpha")).toBe("Alpha");
  });

  it("装配插件显示名解析器 ⇒ 报插件显示名（解析器缺席只退化，装配后即生效）", () => {
    setPluginNameResolver((id) => (id === "demo-plugin-x" ? "演示插件" : undefined));
    registerPluginRecipe();
    expect(recipeSourceOf("demo-plugin-x.recipe")).toEqual({ kind: "plugin", pluginId: "demo-plugin-x", name: "演示插件" });
  });

  it("未登记的 id ⇒ 按宿主兜底处置（无归属插件），不抛错", () => {
    expect(recipeSourceOf("nope.nothing")).toEqual({ kind: "host" });
    expect(recipeDisplayName({ id: "nope.nothing", name: "Demo Unknown" })).toBe("[Demo Unknown]");
  });

  it("真实兜底配方：名字不再是颜色词（Dark/Light）——与插件卡并列也不会被读成一套", () => {
    registerFallbackThemes();
    const dark = ThemeRegistry.getRecipe("dark");
    const light = ThemeRegistry.getRecipe("light");
    expect(dark?.name).toBe("内置深色");
    expect(light?.name).toBe("内置浅色");
    // 过 t() 后仍是同一份 key 体系（测试桩不插值，看的是「确实取了字典」）
    expect(recipeDisplayName({ id: "dark", name: dark!.name })).toBe("[内置深色]");
  });
});
