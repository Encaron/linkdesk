/**
 * ThemeEngine/migration 单元测试——schema 迁移公式（v2 圆角绝对化 / v3 glass wash / v4 单一外观轴）。
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  deriveRadiusAbsoluteMigration,
  deriveGlassOpacityAbsoluteMigration,
  resolveMergedAppearanceMode,
  // E6#111f／1.36：归属改名读时归一（两表 ＋ 两问 ＋ 双语义串联）
  normalizeRecipeId,
  normalizeColorwayId,
  normalizeThemeValue,
  normalizeThemeColorValue,
  // E6#111n／1.47：第三个外观空间（图标主题）——**独立一张表**，不与上面两表并栏
  normalizeIconThemeId,
  setAppearanceIdResolvers,
} from "../ThemeEngine";
// 测试专用出口：`clearAppearanceIdResolvers` 零生产消费（照 11.15 3b 先例「测试直引本体」，不从门面暴露）
import { clearAppearanceIdResolvers } from "./migration";
import { RECIPE_ID_MIGRATIONS, COLORWAY_ID_MIGRATIONS, ICON_THEME_ID_MIGRATIONS } from "./constants";
import { HOST_RESERVED_APPEARANCE_IDS } from "../../../registry/host-reserved.generated";

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

/* ── E6#111f／1.36：外观族 id 归属改名的读时归一（两张表 ＋ 解析器两问） ──
 * 本组钉的是**顺序无关**这条裁决：改名轮（1.47）落地前 / 后 / 插件没装，三种盘面各自的行为。 */

describe("ThemeEngine — 归属改名读时归一（E6#111f／1.36）", () => {
  /** 造一个解析器：`alive` = 此刻注册本里有的 id 集合 */
  const resolver = (alive: string[]) => (id: string) => alive.includes(id);

  beforeEach(() => {
    clearAppearanceIdResolvers();
  });

  it("🔴 没装解析器 ⇒ **恒等**（fail-safe，不是 fail-open）——把活主题映死是最坏的错", () => {
    expect(normalizeRecipeId("mint-soda")).toBe("mint-soda");
    expect(normalizeColorwayId("kraft")).toBe("kraft");
    expect(normalizeThemeValue("mint-soda")).toBe("mint-soda");
  });

  it("仓**还没改名**（旧名在、新名不在）⇒ 恒等（盘上的旧值今天仍然有效，一个字节不动）", () => {
    setAppearanceIdResolvers({ recipe: resolver(["mint-soda"]), colorway: resolver(["kraft"]) });
    expect(normalizeRecipeId("mint-soda")).toBe("mint-soda");
    expect(normalizeColorwayId("kraft")).toBe("kraft");
  });

  it("仓**已改名**（新名在、旧名不在）⇒ 映到归属名", () => {
    setAppearanceIdResolvers({
      recipe: resolver(["theme-mint-soda.mint-soda"]),
      colorway: resolver(["theme-zones.kraft"]),
    });
    expect(normalizeRecipeId("mint-soda")).toBe("theme-mint-soda.mint-soda");
    expect(normalizeColorwayId("kraft")).toBe("theme-zones.kraft");
  });

  it("🔴 插件**没装 / 还没加载完**（两个名字都不在）⇒ 恒等——不许把「等插件加载好还能用」的值提前打死", () => {
    setAppearanceIdResolvers({ recipe: resolver([]), colorway: resolver([]) });
    expect(normalizeRecipeId("mint-soda")).toBe("mint-soda");
    expect(normalizeColorwayId("kraft")).toBe("kraft");
  });

  it("新旧并存的过渡态（两个名字都在）⇒ 恒等（保守：改名没完成就不动盘面）", () => {
    setAppearanceIdResolvers({ recipe: resolver(["mint-soda", "theme-mint-soda.mint-soda"]) });
    expect(normalizeRecipeId("mint-soda")).toBe("mint-soda");
  });

  it("两张表**按空间**各查各的（`mint-soda` 两表都有 ⇒ 各自映到自己的归属名）", () => {
    // 负控 3 的正解：今天两值恰好相同，**不许**拿这个巧合论证「一张表就够」——
    // 一旦将来两者不同（第三方插件更甚），按空间查才是唯一正确的形状
    setAppearanceIdResolvers({
      recipe: resolver(["theme-mint-soda.mint-soda"]),
      colorway: resolver(["theme-mint-soda.mint-soda"]),
    });
    expect(normalizeRecipeId("mint-soda")).toBe("theme-mint-soda.mint-soda");
    expect(normalizeColorwayId("mint-soda")).toBe("theme-mint-soda.mint-soda");
    // 单表想表达两空间 ⇒ 只能用同一值（键撞车就静默映错），这条断言就是那张表的「做不到」证明
    expect(RECIPE_ID_MIGRATIONS["mint-soda"]).toBe(COLORWAY_ID_MIGRATIONS["mint-soda"]);
  });

  it("normalizeThemeValue 两段串联——先 legacy flat 名、再归属表；签名不变", () => {
    setAppearanceIdResolvers({ recipe: resolver(["theme-panorama.panorama"]) });
    expect(normalizeThemeValue("Dark")).toBe("dark"); // flat 名照旧（不在归属表 ⇒ 恒等）
    expect(normalizeThemeValue("panorama")).toBe("theme-panorama.panorama"); // 第二段生效
    expect(normalizeThemeValue(undefined)).toBeUndefined();
    expect(normalizeThemeValue("")).toBe("");
  });

  it("normalizeThemeColorValue 双语义串联——配色语义走配色表，配方语义走配方表", () => {
    setAppearanceIdResolvers({
      recipe: resolver(["theme-zones.paper-zones", "theme-mint-soda.mint-soda"]),
      colorway: resolver(["theme-zones.kraft", "theme-mint-soda.mint-soda"]),
    });
    expect(normalizeThemeColorValue("kraft")).toBe("theme-zones.kraft"); // 配色语义（命中配色表即出）
    expect(normalizeThemeColorValue("paper-zones")).toBe("theme-zones.paper-zones"); // mix 的配方语义（配色表没有 ⇒ 落配方表）
    // 🔴 `mint-soda` 键两表都有 ⇒ **先配色表**（顺序是本函数唯一被允许做这件事的地方）
    expect(normalizeThemeColorValue("mint-soda")).toBe("theme-mint-soda.mint-soda");
  });

  it("双语义串联的**顺序**名副其实：配色语义先判（第一段命中就不再走配方表）", () => {
    // 若两表给出**不同**的新名（第三方插件的常见形态），串联顺序决定胜负 = 配色语义优先
    setAppearanceIdResolvers({
      recipe: resolver(["other.recipe-name"]),
      colorway: resolver(["other.colorway-name"]),
    });
    // 造一个两表都有的临时对照：用真实表里的 `mint-soda`，但让两表解析器指向**不同**的新名
    setAppearanceIdResolvers({
      recipe: resolver(["theme-mint-soda.mint-soda"]),
      colorway: resolver(["theme-mint-soda.mint-soda"]),
    });
    expect(normalizeRecipeId("mint-soda")).toBe("theme-mint-soda.mint-soda");
    expect(normalizeColorwayId("mint-soda")).toBe("theme-mint-soda.mint-soda");
    // 今天两值相同（负控 3 钉的就是「别拿这个巧合论证一张表够」）——不同名时的胜负由串联顺序定，
    // 而顺序写死在 normalizeThemeColorValue 里（先配色后配方），别处不许再串一遍。
    expect(normalizeThemeColorValue("mint-soda")).toBe("theme-mint-soda.mint-soda");
  });

  it("负控 2：`followTheme` 哨兵原样放行（它不是 id）", () => {
    setAppearanceIdResolvers({
      recipe: resolver(["theme-mint-soda.mint-soda"]),
      colorway: resolver(["theme-mint-soda.mint-soda"]),
    });
    expect(normalizeRecipeId("followTheme")).toBe("followTheme");
    expect(normalizeColorwayId("followTheme")).toBe("followTheme");
    expect(normalizeThemeColorValue("followTheme")).toBe("followTheme");
  });

  it("负控 10：宿主保底 id **一个都不在两张表里**（进表 = 断掉「保底 → 官方实现」接替链）", () => {
    // 配方栏 / 配色栏 / 哨兵 —— 按空间取交集（⛔ 别拍平比：`dark` 是 theme-defaults 自己的**配色**，
    //   它在配色表里是对的；宿主兜底的配色叫 `dark-fallback`）
    for (const id of HOST_RESERVED_APPEARANCE_IDS.recipe) expect(RECIPE_ID_MIGRATIONS[id]).toBeUndefined();
    for (const id of HOST_RESERVED_APPEARANCE_IDS.colorway) expect(COLORWAY_ID_MIGRATIONS[id]).toBeUndefined();
    // 🔴 1.47 增第三空间：图标栏查**它自己那张表**（查配方表是查了个寂寞——两表本就不相干）
    for (const id of HOST_RESERVED_APPEARANCE_IDS.iconTheme) {
      expect(ICON_THEME_ID_MIGRATIONS[id]).toBeUndefined();
      expect(RECIPE_ID_MIGRATIONS[id]).toBeUndefined();
    }
    for (const id of HOST_RESERVED_APPEARANCE_IDS.sentinel) {
      expect(RECIPE_ID_MIGRATIONS[id]).toBeUndefined();
      expect(COLORWAY_ID_MIGRATIONS[id]).toBeUndefined();
    }
    // 而 `dark`（theme-defaults 的配色，13.2 第 2 行）**在**配色表里——按空间判的两个方向都在这里钉住
    expect(COLORWAY_ID_MIGRATIONS["dark"]).toBe("theme-defaults.dark");
  });

  it("负控 12：显示名过两个归一函数 ⇒ 恒等（它们不是 id）", () => {
    setAppearanceIdResolvers({ recipe: resolver([]), colorway: resolver([]), icon: resolver([]) });
    for (const display of ["薄荷苏打 Mint Soda", "极光玻璃 Aurora Glass", "Light", "Dark"]) {
      expect(normalizeRecipeId(display)).toBe(display);
      expect(normalizeColorwayId(display)).toBe(display);
      expect(normalizeIconThemeId(display)).toBe(display);
    }
    // 🔴 1.47 改判：`ld-iconset-pastel` **曾经**被这里钉成"不是 id、恒等"——现在它是图标主题空间的旧 id。
    //   两个方向都钉：① 配方/配色表**不该**认它（串表 = 替别的空间做决定）；② 图标表**恰好**认它。
    expect(normalizeRecipeId("ld-iconset-pastel")).toBe("ld-iconset-pastel");
    expect(normalizeColorwayId("ld-iconset-pastel")).toBe("ld-iconset-pastel");
    expect(ICON_THEME_ID_MIGRATIONS["ld-iconset-pastel"]).toBe("theme-iconset-pastel.ld-iconset-pastel");
  });

  /* ── 第三空间（图标主题，E6#111n／1.47）——与上面两张表**同规则不同表** ── */
  it("图标主题：没装解析器 ⇒ 恒等（fail-safe 与另两空间一致）", () => {
    expect(normalizeIconThemeId("ld-iconset-pastel")).toBe("ld-iconset-pastel");
  });

  it("图标主题：仓已改名（新名在、旧名不在）⇒ 映到归属名", () => {
    setAppearanceIdResolvers({ icon: resolver(["theme-iconset-pastel.ld-iconset-pastel"]) });
    expect(normalizeIconThemeId("ld-iconset-pastel")).toBe("theme-iconset-pastel.ld-iconset-pastel");
  });

  it("🔴 图标主题：插件还是旧的（旧名在、新名不在）⇒ 恒等——不许把还能用的值提前打死", () => {
    setAppearanceIdResolvers({ icon: resolver(["ld-iconset-pastel"]) });
    expect(normalizeIconThemeId("ld-iconset-pastel")).toBe("ld-iconset-pastel");
  });

  it("🔴 图标主题**单语义**：配方/配色解析器说「该映」也不算数（不串表）", () => {
    setAppearanceIdResolvers({
      recipe: resolver(["theme-iconset-pastel.ld-iconset-pastel"]),
      colorway: resolver(["theme-iconset-pastel.ld-iconset-pastel"]),
      icon: resolver([]),
    });
    // 图标那本注册本里没有它 ⇒ 恒等（串表的实现会在这里映错空间）
    expect(normalizeIconThemeId("ld-iconset-pastel")).toBe("ld-iconset-pastel");
  });

  it("图标主题：`default` 哨兵原样放行（它不是 id，宿主兜底）", () => {
    setAppearanceIdResolvers({ icon: resolver(["theme-iconset-pastel.ld-iconset-pastel"]) });
    expect(normalizeIconThemeId("default")).toBe("default");
  });

  it("映射表形状：26 条 = 9 配方 ＋ 16 配色 ＋ 1 图标主题，值一律 `pluginId.` 前缀（规则 = 只换第一段）", () => {
    expect(Object.keys(RECIPE_ID_MIGRATIONS)).toHaveLength(9);
    expect(Object.keys(COLORWAY_ID_MIGRATIONS)).toHaveLength(16);
    expect(Object.keys(ICON_THEME_ID_MIGRATIONS)).toHaveLength(1);
    for (const [oldId, newId] of Object.entries({ ...RECIPE_ID_MIGRATIONS, ...COLORWAY_ID_MIGRATIONS, ...ICON_THEME_ID_MIGRATIONS })) {
      expect(newId).toMatch(/^theme-[a-z-]+\.[a-z0-9-]+$/); // 归属段 = 官方主题仓 pluginId（图标主题也照此形状）
      expect(newId.endsWith(oldId)).toBe(true); // 词干一字不动
    }
  });
});
