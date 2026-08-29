/**
 * ThemeEngine/migration 单元测试——schema 迁移公式（v2 圆角绝对化 / v3 glass wash / v4 单一外观轴）。
 */

import { describe, it, expect } from "vitest";
import {
  deriveRadiusAbsoluteMigration,
  deriveGlassOpacityAbsoluteMigration,
  resolveMergedAppearanceMode,
} from "../ThemeEngine";

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
