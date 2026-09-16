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
    // 🔴 E6#111f／1.36 起本 describe 的用例**共用同一个模块级登记本**，而仲裁会在跨用例残留上判红
    //   ⇒ 逐个用例清场（直删 + 还原 spy）：任一条用例中途断言失败，也不给下一条留脏局面。
    for (const r of ThemeRegistry.getRecipes()) ThemeRegistry.unregisterRecipe(r.id);
    vi.restoreAllMocks();
  });
  const fallbackC: ThemeContribution = { id: "demo-recipe", label: "Demo Recipe", uiTheme: "dark", path: "r.json" };

  // ⚠️ `colorwayId` 可覆盖：**配色 id 跨插件也判红**（判据③，配色随配方进来）⇒
  //   想在同一条用例里让两个**不同插件**各注册一条配方，就必须给不同的配色 id（否则第二条被第一条的配色拦下）。
  function recipe(id: string, name: string, type: "light" | "dark" = "dark", colorwayId = "c") {
    return { id, name, type, colorways: [{ id: colorwayId, name: "C", colors: { bg: "#000" } }] };
  }

  it("registerRecipe → getRecipe/getRecipes/getRecipesByPlugin", () => {
    disposers.push(ThemeRegistry.registerRecipe(recipe("demo-recipe", "Demo Recipe"), "demo-plugin"));
    expect(ThemeRegistry.getRecipe("demo-recipe")?.name).toBe("Demo Recipe");
    expect(ThemeRegistry.getRecipes().some((r) => r.id === "demo-recipe")).toBe(true);
    expect(ThemeRegistry.getRecipesByPlugin("demo-plugin")).toContain("demo-recipe");
  });

  // 🔴 E6#111f／1.36 判据③：本用例**翻面**——旧预期是「同名重复注册 → 后注册者覆盖（warn）」，
  //   那是 1.36 明写废除的静默覆盖。跨插件同 id 现在 ⇒ 先者保留 ＋ 拒后者 ＋ console.error（点名双方）。
  it("判据③：跨插件同 id ⇒ 先者保留 ＋ 拒后者 ＋ console.error 点名双方", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    disposers.push(ThemeRegistry.registerRecipe(recipe("demo-recipe", "One"), "plugin-a"));
    const rejected = ThemeRegistry.registerRecipe(recipe("demo-recipe", "Two"), "plugin-b");
    expect(ThemeRegistry.getRecipe("demo-recipe")?.name).toBe("One"); // 先者保留
    expect(ThemeRegistry.getRecipesByPlugin("plugin-b")).not.toContain("demo-recipe"); // 后者没写进去
    expect(err).toHaveBeenCalledTimes(1);
    const line = String(err.mock.calls[0][0]);
    expect(line).toContain("plugin-a");
    expect(line).toContain("plugin-b");
    // 被拒的注册返 no-op disposer：调它不许摘掉先者
    rejected();
    expect(ThemeRegistry.getRecipe("demo-recipe")?.name).toBe("One");
    err.mockRestore();
  });

  it("判据③（配色空间）：异插件的配方带**同配色 id** ⇒ 拒整条配方 ＋ 出声（配色随配方进来，无独立登记本）", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    disposers.push(ThemeRegistry.registerRecipe(recipe("demo-recipe-a", "A"), "plugin-a"));
    // plugin-b 的配方 id 干净（demo-recipe-b），但配色 id 撞了 plugin-a 的 "c"
    const rejected = ThemeRegistry.registerRecipe(recipe("demo-recipe-b", "B"), "plugin-b");
    expect(ThemeRegistry.getRecipe("demo-recipe-b")).toBeUndefined(); // 整条拒，不是只拒配色
    expect(err).toHaveBeenCalledTimes(1);
    // 空间用**账/腿的码**（`space: "colorway"`，与 SDK 腿同一套词汇）＋ 成因句点名是哪条配方
    const line = String(err.mock.calls[0][0]);
    expect(line).toContain('空间 "colorway"');
    expect(line).toContain('配方 "demo-recipe-b"');
    rejected();
    err.mockRestore();
  });

  it("判据④（黄）：**同插件**跨配方同配色 id ⇒ 放行（不拒、不出声——存量反例就是证据）", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    disposers.push(ThemeRegistry.registerRecipe(recipe("demo-recipe-a", "A"), "plugin-a"));
    disposers.push(ThemeRegistry.registerRecipe(recipe("demo-recipe-b", "B"), "plugin-a"));
    expect(ThemeRegistry.getRecipe("demo-recipe-b")).toBeDefined();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("反向负控：**同 pluginId** 重注册同 id ⇒ 第二次生效且零日志（装配路径多阶段）", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    disposers.push(ThemeRegistry.registerRecipe(recipe("demo-recipe", "One"), "plugin-a"));
    disposers.push(ThemeRegistry.registerRecipe(recipe("demo-recipe", "Two"), "plugin-a"));
    expect(ThemeRegistry.getRecipe("demo-recipe")?.name).toBe("Two");
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("E5.8#61 审计#3：disposer 回填被覆盖的旧占位者（同插件重注册路径）＋ 首个 disposer 清空", () => {
    const first = ThemeRegistry.registerRecipe(recipe("demo-recipe", "One"), "plugin-a");
    const second = ThemeRegistry.registerRecipe(recipe("demo-recipe", "Two"), "plugin-a");
    expect(ThemeRegistry.getRecipe("demo-recipe")?.name).toBe("Two");
    second(); // 卸载覆盖者 → 回填 One（插件卸载不吞前一个配方）
    expect(ThemeRegistry.getRecipe("demo-recipe")?.name).toBe("One");
    expect(ThemeRegistry.getRecipeOwner("demo-recipe")).toBe("plugin-a");
    first();
    expect(ThemeRegistry.getRecipe("demo-recipe")).toBeUndefined();
  });

  it("卸载回滚 —— rollback 只摘除该插件的配方，不动别人的", () => {
    ThemeRegistry.registerRecipe(recipe("demo-recipe", "One", "dark", "c-a"), "plugin-a");
    disposers.push(ThemeRegistry.registerRecipe(recipe("demo-other", "Other", "dark", "c-b"), "plugin-b"));
    rollback("plugin-a");
    expect(ThemeRegistry.getRecipe("demo-recipe")).toBeUndefined();
    expect(ThemeRegistry.getRecipe("demo-other")?.name).toBe("Other");
  });

  it("getRecipe 未注册 → undefined", () => {
    expect(ThemeRegistry.getRecipe("no-such")).toBeUndefined();
  });

  // 🔴 E6#111f／1.36 判据⑥：本用例**翻面**——旧预期是「插件配方覆盖壳兜底不告警」，1.36 明写废除。
  //   无证照顶替宿主兜底条目 ⇒ 拒 ＋ console.error。
  it("壳兜底注册（无 pluginId）→ 无归属；判据⑥：无证照顶替 ⇒ 拒 ＋ console.error（1.36 起不再静默）", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // 壳兜底配方无归属——getRecipeOwner 应为 undefined
      const fallback = ThemeRegistry.registerRecipe(recipe("demo-fallback", "Fallback"), undefined);
      expect(ThemeRegistry.getRecipe("demo-fallback")?.name).toBe("Fallback");
      expect(ThemeRegistry.getRecipeOwner("demo-fallback")).toBeUndefined();
      // 插件顶替兜底——无证照 ⇒ 拒
      const rejected = ThemeRegistry.registerRecipe(recipe("demo-fallback", "Plugin"), "plugin-a");
      expect(ThemeRegistry.getRecipe("demo-fallback")?.name).toBe("Fallback"); // 兜底保留
      expect(ThemeRegistry.getRecipesByPlugin("plugin-a")).not.toContain("demo-fallback");
      expect(err).toHaveBeenCalledTimes(1);
      rejected(); // no-op disposer 不许动兜底
      expect(ThemeRegistry.getRecipe("demo-fallback")?.name).toBe("Fallback");
      // 兜底裸 disposer 幂等（不复活、不误删新占位者）——此时占位者即兜底自身 → 删空
      fallback();
      expect(ThemeRegistry.getRecipe("demo-fallback")).toBeUndefined();
    } finally {
      err.mockRestore();
    }
  });

  it("判据⑥（唯一静默例外）：有证照的官方实现者接替宿主兜底 ⇒ 静默上位 ＋ disposer 回填兜底", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // 宿主兜底 `light`（配方 ＋ 配色同 id——账的 recipe/colorway 两栏都含 light）
      const fallback = ThemeRegistry.registerRecipe(
        { id: "light", name: "Host Light", type: "light", colorways: [{ id: "light", name: "Light", colors: {} }] },
        undefined
      );
      // 账 `appearanceIdGrants.light = ["theme-defaults"]` ⇒ 唯一静默例外
      const granted = ThemeRegistry.registerRecipe(
        { id: "light", name: "Light", type: "light", colorways: [{ id: "light", name: "Light", colors: {} }] },
        "theme-defaults"
      );
      expect(ThemeRegistry.getRecipe("light")?.name).toBe("Light");
      expect(ThemeRegistry.getRecipeOwner("light")).toBe("theme-defaults");
      expect(err).not.toHaveBeenCalled(); // 🔴 静默——这是设计里的交接，不是顶替
      granted();
      expect(ThemeRegistry.getRecipe("light")?.name).toBe("Host Light"); // 回填兜底
      fallback();
      expect(ThemeRegistry.getRecipe("light")).toBeUndefined();
    } finally {
      err.mockRestore();
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
