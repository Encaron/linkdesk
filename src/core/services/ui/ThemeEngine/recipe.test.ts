/**
 * ThemeEngine/recipe 单元测试——mergeDomains 合并算法（E5.8#50.16，05 §4 继承链）。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mergeDomains, applyOverrides, applyRadiusAbsolute, RADIUS_SCALE_KEYS, FONT_SIZE_STEPS, FONT_SIZE_BASE_PX } from "../ThemeEngine";
import { clearConfigurationCache } from "../../configuration/ConfigurationService";
import type { ThemeRecipe } from "../../../types/theme";

describe("ThemeEngine — Recipe 合并算法 mergeDomains（E5.8#50.16，05 §4 继承链）", () => {
  const RECIPE: ThemeRecipe = {
    id: "demo-recipe",
    name: "Demo Recipe",
    type: "dark",
    appearance: {
      radius: { sm: 6, lg: 12 },
      glass: { type: "glass", blur: 14, tint: "rgba(255,255,255,0.4)", radius: 10 },
      font: { ui: "Noto Sans SC", mono: "JetBrains Mono" },
      background: { image: "assets/bg.png", opacity: 0.8 },
      surface: { "menu-blur": 12, "menu-radius": "lg" },
    },
    colorways: [
      { id: "dew", name: "露", colors: { "bg-window": "#FFFBF5", accent: "#2BA876" } },
      { id: "mint", name: "薄荷", colors: { "bg-window": "#F7FBF8", accent: "#3E9E8C" } },
    ],
  };
  // E5.8 Phase 11.15 归一化：radius 键清单单一权威——不再手抄字面量，直接引用引擎常量
  const RADIUS_KEYS = RADIUS_SCALE_KEYS;

  beforeEach(() => {
    clearConfigurationCache();
    const root = document.documentElement;
    for (const key of ["bg-window", "accent", "glass-blur", "bg-image", "font-ui", ...RADIUS_KEYS]) {
      root.style.removeProperty(`--${key}`);
    }
  });

  it("appearance 稀疏 flatten + 当前 colorway 稀疏覆盖", () => {
    const tokens = mergeDomains(RECIPE, "dew", {});
    expect(tokens["radius-sm"]).toBe("6px");
    expect(tokens["radius-lg"]).toBe("12px");
    expect(tokens["glass-blur"]).toBe("14px"); // surfaceVariables（glass 域全机制）
    expect(tokens["font-ui"]).toBe("Noto Sans SC");
    expect(tokens["font-mono"]).toBe("JetBrains Mono");
    expect(tokens["bg-image"]).toBe('url("assets/bg.png")'); // backgroundVariables 包 url()
    expect(tokens["surface-menu-blur"]).toBe("12"); // per-surface pass-through
    expect(tokens["surface-menu-radius"]).toBe("lg");
    // 颜色域稀疏覆盖
    expect(tokens["bg-window"]).toBe("#FFFBF5");
    expect(tokens.accent).toBe("#2BA876");
    // 缺的键/域不写——pill/full 形态值不在 appearance.radius 子集 → 缺省
    expect(tokens["radius-pill"]).toBeUndefined();
    expect(tokens["radius-full"]).toBeUndefined();
  });

  it("colorwayId 缺省 = 配方首配色；未知 id 回退首配色", () => {
    expect(mergeDomains(RECIPE, undefined, {})["bg-window"]).toBe("#FFFBF5");
    expect(mergeDomains(RECIPE, "no-such", {})["accent"]).toBe("#2BA876");
  });

  it("E5.8 参考系根治 overrides radius 绝对 px → applyOverrides 路径平铺（全档 = 滑杆值）", () => {
    const tokens = mergeDomains(RECIPE, "dew", { "radius-lg": 12 });
    expect(tokens["radius-lg"]).toBe("12px"); // 全档 = 滑杆值
    expect(tokens["radius-sm"]).toBe("12px"); // 主题 tier 不再影响（平铺 = 滑杆值）
    expect(tokens["radius-md"]).toBe("12px"); // 平铺 = 滑杆值（不再恒写 0px 清残留）
    expect(tokens["radius-pill"]).toBe("12px"); // E5.8 用户审计 #2：radius 覆盖生效 → pill 直写滑杆值（主题无 pill）
  });

  it("overrides 绝对 token → 覆盖主题值（glass-blur 绝对覆盖胜过 appearance.glass.blur）", () => {
    const tokens = mergeDomains(RECIPE, "dew", { "glass-blur": "24px" });
    expect(tokens["glass-blur"]).toBe("24px");
  });

  it("E5.8#85 applyOverrides — radius 绝对 px 换算（md 档 = 滑杆值）；非 radius 绝对写", () => {
    const tokens = { "radius-md": "10px", "glass-blur": "8px" };
    applyOverrides(tokens, { "radius-md": 2, "glass-blur": "16px" });
    expect(tokens["radius-md"]).toBe("2px"); // 全档 = 滑杆值 2（平铺）
    expect(tokens["glass-blur"]).toBe("16px");
  });

  it("E5.8 用户审计 #2 applyOverrides — radius 覆盖生效时 radius-pill 直写滑杆值（主题 999px 胶囊 → 16）", () => {
    const tokens = { "radius-md": "8px", "radius-pill": "999px" };
    applyOverrides(tokens, { "radius-md": 16 });
    expect(tokens["radius-md"]).toBe("16px");
    expect(tokens["radius-pill"]).toBe("16px");
  });

  it("E5.8 用户审计 #2 applyOverrides — radius 覆盖生效且主题无 pill（壳 :root 静态）→ 直写滑杆值 16px", () => {
    const tokens: Record<string, string> = { "radius-md": "8px" }; // 无 pill 键
    applyOverrides(tokens, { "radius-md": 16 });
    expect(tokens["radius-md"]).toBe("16px");
    expect(tokens["radius-pill"]).toBe("16px");
  });

  it("E5.8#85 applyOverrides — 无 radius 覆盖 → pill 原样（followTheme 主题自带胶囊不 clamp）", () => {
    const tokens = { "radius-md": "8px", "radius-pill": "999px" };
    applyOverrides(tokens, { "glass-blur": "16px" });
    expect(tokens["radius-md"]).toBe("8px");
    expect(tokens["radius-pill"]).toBe("999px");
  });

  it("E5.8 用户审计 #2 — radius 覆盖 0px（直角）→ pill 0px 方块胶囊；8px → 渐进圆角", () => {
    const square: Record<string, string> = { "radius-md": "8px" };
    applyOverrides(square, { "radius-md": 0 });
    expect(square["radius-pill"]).toBe("0px");
    const soft: Record<string, string> = { "radius-md": "8px" };
    applyOverrides(soft, { "radius-md": 8 });
    expect(soft["radius-pill"]).toBe("8px");
  });

  it("E5.8 参考系根治 applyRadiusAbsolute(8) — 六档平铺全 = 滑杆值（删主题比例）", () => {
    const scaled = applyRadiusAbsolute(8);
    for (const key of RADIUS_KEYS) expect(scaled[key]).toBe("8px"); // 全档 = 滑杆值
    expect(scaled["radius-pill"]).toBeUndefined();
    expect(scaled["radius-full"]).toBeUndefined();
  });

  it("E5.8#104 配方圆角 clamp 进系统标尺 [0,32]——全胶囊主题 999px → 32px（full 相对几何排除）", () => {
    const pillRecipe: ThemeRecipe = {
      id: "pill-demo",
      name: "Pill Demo",
      type: "dark",
      appearance: {
        radius: { xs: 999, sm: 999, md: 999, lg: 999, xl: 999, "2xl": 999, pill: 999, full: 999 },
        glass: { type: "glass", blur: 14, radius: 999 },
        surface: { radius: 999 },
      },
      colorways: [{ id: "c", name: "C", colors: {} }],
    };
    const tokens = mergeDomains(pillRecipe, "c", {});
    // 六档 + pill 全 clamp 进标尺——根治「全胶囊主题圆角可设极大」（配方→token 路径此前绕过 clampRadiusPx）
    for (const key of ["radius-xs", "radius-sm", "radius-md", "radius-lg", "radius-xl", "radius-2xl", "radius-pill"]) {
      expect(tokens[key]).toBe("32px");
    }
    expect(tokens["radius-full"]).toBeUndefined(); // 相对几何值壳管理，配方不写不 clamp
    expect(tokens["surface-radius"]).toBe("32px"); // glass.radius + surface.radius 双写同 clamp
    expect(tokens["glass-blur"]).toBe("14px"); // 非 radius 键不受 clamp 影响
  });
});

describe("ThemeEngine — Phase 12 字号比例（E5.8#160：--ui-scale + --font-size-* 引擎发射）", () => {
  it("ui-font-scale 100 → --ui-scale 1 + 各档基准 px（⑤ 新设计默认，非现状收敛值）", () => {
    const tokens: Record<string, string> = {};
    applyOverrides(tokens, { "ui-font-scale": 100 });
    expect(tokens["ui-scale"]).toBe("1");
    for (const step of FONT_SIZE_STEPS) {
      expect(tokens[`font-size-${step}`]).toBe(`${FONT_SIZE_BASE_PX[step]}px`);
    }
    // 基准值抽样对齐档案 §三.2（⑤ 拍板）
    expect(tokens["font-size-sm"]).toBe("13px"); // UI 主文本对齐 VS Code
    expect(tokens["font-size-md"]).toBe("14px"); // 文件树 name 比 VS Code 资源管理器大 1px
    expect(tokens["font-size-lg"]).toBe("16px"); // 文件树 icon
    expect(tokens["font-size-4xl"]).toBe("30px");
  });

  it("ui-font-scale 125 → --ui-scale 1.25 + 乘后 px（JS 预算，消费零计算）", () => {
    const tokens: Record<string, string> = {};
    applyOverrides(tokens, { "ui-font-scale": 125 });
    expect(tokens["ui-scale"]).toBe("1.25");
    expect(tokens["font-size-sm"]).toBe("16.25px");
    expect(tokens["font-size-md"]).toBe("17.5px");
    expect(tokens["font-size-lg"]).toBe("20px");
    expect(tokens["font-size-4xl"]).toBe("37.5px");
  });

  it("ui-font-scale 非有限数 → 回退默认 ratio 1（防御，不崩）", () => {
    const tokens: Record<string, string> = {};
    applyOverrides(tokens, { "ui-font-scale": "abc" });
    expect(tokens["ui-scale"]).toBe("1");
    expect(tokens["font-size-md"]).toBe("14px");
  });

  it("无 ui-font-scale 覆盖 → 字号块整块跳过（getThemeBaseTokens 纯基线 {} 语义，零污染）", () => {
    const tokens: Record<string, string> = {};
    applyOverrides(tokens, { "glass-blur": "16px" });
    expect(tokens["ui-scale"]).toBeUndefined();
    expect(tokens["font-size-md"]).toBeUndefined();
    expect(tokens["glass-blur"]).toBe("16px");
  });

  it("ui-font-scale 不落绝对 token（② 通道排除——不写 --ui-font-scale）", () => {
    const tokens: Record<string, string> = {};
    applyOverrides(tokens, { "ui-font-scale": 125 });
    expect(tokens["ui-font-scale"]).toBeUndefined();
  });

  it("mergeDomains 全链透传——ui-font-scale 覆盖经 mergeDomains 合并出字号 token（theme:changed 载荷齐备）", () => {
    const local: ThemeRecipe = {
      id: "local-demo",
      name: "Local Demo",
      type: "dark",
      colorways: [{ id: "c", name: "C", colors: { "bg-window": "#112233", accent: "#445566" } }],
    };
    const tokens = mergeDomains(local, "c", { "ui-font-scale": 150 });
    expect(tokens["ui-scale"]).toBe("1.5");
    expect(tokens["font-size-md"]).toBe("21px");
    // 主题/配方 token 不受字号块影响（并集共存）
    expect(tokens["bg-window"]).toBe("#112233");
    expect(tokens["accent"]).toBe("#445566");
  });
});
