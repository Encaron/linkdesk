/**
 * ThemeRegistry 单测——E5.8#50.15 Recipe+Colorway 解析 + Recipe 存储。
 * 测试夹具一律虚构值（demo-recipe/Demo Recipe——硬约束 21 测试卫生）。
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { parseThemeRecipe, ThemeRegistry } from "./ThemeRegistry";
import { rollback } from "../registrationTracker";
import type { ThemeContribution } from "../../api/types";

const FALLBACK: ThemeContribution = {
  id: "demo-recipe",
  label: "Demo Recipe",
  uiTheme: "dark",
  path: "recipe.json",
};

/* ── parseThemeRecipe：05 schema 新格式 ── */

describe("parseThemeRecipe — 05 schema 新格式", () => {
  it("colorways[] → Recipe（id/name/type/appearance/colorways）", () => {
    const recipe = parseThemeRecipe(
      {
        id: "demo-recipe",
        name: "Demo Recipe",
        type: "light",
        /* jscpd:ignore-start -- 05 schema 新格式 appearance fixture：demo-recipe 数据在 parse（本文件）与 merge（recipe.test.ts）两测试面各自需要完整字面量，故意重复（.jscpd.json ignorePattern 支持） */
        appearance: {
          radius: { sm: 6, lg: 12 },
          glass: { blur: 14, tint: "rgba(255,255,255,0.4)", radius: 10 },
          font: { ui: "Noto Sans SC", mono: "JetBrains Mono" },
          background: { image: "assets/bg.png", opacity: 0.8 },
          // E5.8#132：appearance.surface（per-surface 精调域）删——玻璃表面形态归 appearance.glass（blur 已在上）
        },
        colorways: [
          { id: "dew", name: "露", colors: { "bg-window": "#FFFBF5", accent: "#2BA876" } },
          { id: "mint", name: "薄荷", colors: { "bg-window": "#F7FBF8", accent: "#3E9E8C" } },
        ],
        /* jscpd:ignore-end */
      },
      FALLBACK
    );
    expect(recipe).not.toBeNull();
    expect(recipe!.id).toBe("demo-recipe");
    expect(recipe!.name).toBe("Demo Recipe");
    expect(recipe!.type).toBe("light");
    expect(recipe!.colorways).toHaveLength(2);
    expect(recipe!.colorways[0]).toEqual({ id: "dew", name: "露", colors: { "bg-window": "#FFFBF5", accent: "#2BA876" } });
    expect(recipe!.appearance?.radius).toEqual({ sm: 6, lg: 12 });
    expect(recipe!.appearance?.glass?.blur).toBe(14);
    expect(recipe!.appearance?.font?.mono).toBe("JetBrains Mono");
    expect(recipe!.appearance?.background?.opacity).toBe(0.8);
    // E5.8#132：surface 域删——appearance.surface 不再解析（per-surface 精调死键）
  });

  it("colorways 缺失 colors → 过滤；空列表 → null", () => {
    expect(parseThemeRecipe({ colorways: [{ id: "a", name: "A" }] }, FALLBACK)).toBeNull();
    expect(parseThemeRecipe({ colorways: [] }, FALLBACK)).toBeNull();
    expect(parseThemeRecipe({}, FALLBACK)).toBeNull();
  });

  it("缺 id/name/type → 回退 fallback manifest（id/name 从 tc，type 从 uiTheme）", () => {
    const recipe = parseThemeRecipe({ colorways: [{ id: "c1", name: "C1", colors: { bg: "#000" } }] }, FALLBACK);
    expect(recipe!.id).toBe("demo-recipe");
    expect(recipe!.name).toBe("Demo Recipe");
    expect(recipe!.type).toBe("dark");
  });

  it("colors 过滤非字符串值", () => {
    const recipe = parseThemeRecipe(
      { id: "demo", name: "D", type: "dark", colorways: [{ id: "c", name: "C", colors: { bg: "#000", n: 42, ok: true } }] },
      FALLBACK
    );
    expect(recipe!.colorways[0].colors).toEqual({ bg: "#000" });
  });
});

/* ── parseThemeRecipe：旧格式过渡包装（决策 F 只读新格式——解析边界包装成 Recipe） ── */

describe("parseThemeRecipe — 旧格式过渡包装", () => {
  it("平铺 colors + 顶层 surface/background → 单配色 Recipe（appearance.glass/background）", () => {
    const recipe = parseThemeRecipe(
      {
        type: "dark",
        colors: { "bg-window": "#0B1020", accent: "#7C3AED" },
        surface: { type: "glass", blur: 24, radius: 12, inset: 1 },
        background: { image: "linkdesk://demo/bg.svg", opacity: 0.9 },
      },
      FALLBACK
    );
    expect(recipe!.colorways).toHaveLength(1);
    expect(recipe!.colorways[0]).toEqual({
      id: "demo-recipe",
      name: "Demo Recipe",
      colors: { "bg-window": "#0B1020", accent: "#7C3AED" },
    });
    expect(recipe!.appearance?.glass).toEqual({ type: "glass", blur: 24, radius: 12, inset: 1 });
    expect(recipe!.appearance?.background?.image).toBe("linkdesk://demo/bg.svg");
    expect(recipe!.appearance?.radius).toBeUndefined();
  });

  it("有 colors 但 type 非法 → 回退 uiTheme；无 colors → null", () => {
    const ok = parseThemeRecipe({ type: "highContrast", colors: { bg: "#000" } }, FALLBACK);
    expect(ok!.type).toBe("dark");
    expect(parseThemeRecipe({ type: "dark" }, FALLBACK)).toBeNull();
  });
});

/* ── ThemeRegistry Recipe 存储 ── */

describe("ThemeRegistry — registerRecipe / 查询 / 回滚", () => {
  const disposers: Array<() => void> = [];
  afterEach(() => {
    for (const d of disposers.splice(0)) d();
  });
  const fallbackC: ThemeContribution = { id: "demo-recipe", label: "Demo Recipe", uiTheme: "dark", path: "r.json" };

  function recipe(id: string, name: string, type: "light" | "dark" = "dark") {
    return { id, name, type, colorways: [{ id: "c", name: "C", colors: { bg: "#000" } }] };
  }

  it("registerRecipe → getRecipe/getRecipes/getRecipesByPlugin", () => {
    disposers.push(ThemeRegistry.registerRecipe(recipe("demo-recipe", "Demo Recipe"), "demo-plugin"));
    expect(ThemeRegistry.getRecipe("demo-recipe")?.name).toBe("Demo Recipe");
    expect(ThemeRegistry.getRecipes().some((r) => r.id === "demo-recipe")).toBe(true);
    expect(ThemeRegistry.getRecipesByPlugin("demo-plugin")).toContain("demo-recipe");
  });

  it("同名重复注册 → 后注册者覆盖（warn）", () => {
    disposers.push(ThemeRegistry.registerRecipe(recipe("demo-recipe", "One"), "plugin-a"));
    disposers.push(ThemeRegistry.registerRecipe(recipe("demo-recipe", "Two"), "plugin-b"));
    expect(ThemeRegistry.getRecipe("demo-recipe")?.name).toBe("Two");
  });

  it("disposer 回滚——删当前占位者；后注册者覆盖后 dispose 不误删新占位者", () => {
    ThemeRegistry.registerRecipe(recipe("demo-recipe", "One"), "plugin-a");
    ThemeRegistry.registerRecipe(recipe("demo-recipe", "Two"), "plugin-b");
    // 卸载 plugin-a（先卸载方）——当前占位者是 Two，plugin-a 的 disposer 不应误删新占位者
    rollback("plugin-a");
    expect(ThemeRegistry.getRecipe("demo-recipe")?.name).toBe("Two");
    expect(ThemeRegistry.getRecipesByPlugin("plugin-a")).not.toContain("demo-recipe");
    // E5.8#61 审计#3：卸载 plugin-b → 回填被覆盖的旧占位者 One（非删空——插件卸载不吞前一个配方）
    rollback("plugin-b");
    expect(ThemeRegistry.getRecipe("demo-recipe")?.name).toBe("One");
    expect(ThemeRegistry.getRecipeOwner("demo-recipe")).toBe("plugin-a");
    ThemeRegistry.unregisterRecipe("demo-recipe"); // 清理残留——One 的 disposer 已随 rollback 耗尽，直删恢复测试前状态
  });

  it("getRecipe 未注册 → undefined", () => {
    expect(ThemeRegistry.getRecipe("no-such")).toBeUndefined();
  });

  it("壳兜底注册（无 pluginId）→ 无归属 + 插件配方覆盖不告警 + 不追踪", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // 壳兜底配方无归属——getRecipeOwner 应为 undefined
      const fallback = ThemeRegistry.registerRecipe(recipe("demo-fallback", "Fallback"), undefined);
      expect(ThemeRegistry.getRecipe("demo-fallback")?.name).toBe("Fallback");
      expect(ThemeRegistry.getRecipeOwner("demo-fallback")).toBeUndefined();
      // 插件配方覆盖兜底——无归属 → 不告警（registerTheme 同款语义）
      const plugin = ThemeRegistry.registerRecipe(recipe("demo-fallback", "Plugin"), "plugin-a");
      expect(ThemeRegistry.getRecipe("demo-fallback")?.name).toBe("Plugin");
      expect(warn).not.toHaveBeenCalled();
      expect(ThemeRegistry.getRecipesByPlugin("plugin-a")).toContain("demo-fallback");
      // E5.8#61 审计#3：插件 dispose → 回填壳兜底配方（原实现删空——插件覆盖兜底后卸载，兜底会话内丢失，
      // 重启才恢复）；兜底配方恢复且无归属（owner 清空）
      plugin();
      expect(ThemeRegistry.getRecipe("demo-fallback")?.name).toBe("Fallback");
      expect(ThemeRegistry.getRecipeOwner("demo-fallback")).toBeUndefined();
      expect(ThemeRegistry.getRecipesByPlugin("plugin-a")).not.toContain("demo-fallback");
      // 兜底裸 disposer 幂等（不复活、不误删新占位者）——此时占位者即兜底自身 → 删空
      fallback();
      expect(ThemeRegistry.getRecipe("demo-fallback")).toBeUndefined();
    } finally {
      warn.mockRestore();
    }
  });

  it("parseThemeRecipe → registerRecipe 端到端（loader 接线形状）", () => {
    const parsed = parseThemeRecipe(
      { id: "demo-recipe", name: "Demo Recipe", type: "dark", colorways: [{ id: "c", name: "C", colors: { bg: "#000" } }] },
      fallbackC
    )!;
    disposers.push(ThemeRegistry.registerRecipe(parsed, "demo-plugin"));
    expect(ThemeRegistry.getRecipe("demo-recipe")?.appearance).toBeUndefined();
    expect(ThemeRegistry.getRecipe("demo-recipe")?.colorways[0].name).toBe("C");
  });
});
