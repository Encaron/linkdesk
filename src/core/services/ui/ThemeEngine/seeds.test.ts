/**
 * ThemeEngine/seeds 单元测试——外观覆盖读取 getAppearanceOverrides（E5.8#50.10）/ 反推播种（#50.19）/ 切主题重播种（#88）。
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getAppearanceOverrides,
  applyOverrides,
  applyRecipe,
  applyTheme,
  applyRadiusAbsolute,
  getThemeBaseTokens,
  getAppliedAccent,
  applyAccentColor,
  deriveAppearanceSeeds,
  deriveAppearanceSeedMap,
  deriveReseedPlan,
  APPEARANCE_OVERRIDE_KEYS,
  CONFIG_NONE_SENTINEL,
  SYSTEM_FONT_STACK,
  SYSTEM_MONO_FONT_STACK,
  FONT_TONE_LIGHT_TEXT,
  FONT_TONE_DARK_TEXT,
  FONT_TONE_TEXT_KEYS,
  RADIUS_SCALE_KEYS,
} from "../ThemeEngine";
import {
  applyRemoteConfigChange, clearConfigurationCache, hasConfigurationValue,
} from "../../configuration/ConfigurationService";
import { rollback } from "../../../registry/registrationTracker";
import { ThemeRegistry } from "../../../registry/appearance/ThemeRegistry";
import { MOCK_THEME, RECIPE } from "./testFixtures.mock";
import type { ThemeRecipe } from "../../../types/theme";

describe("ThemeEngine — 外观覆盖 getAppearanceOverrides（E5.8#50.10）", () => {
  // E5.8 Phase 11.15 归一化：radius 键清单单一权威——不再手抄字面量，直接引用引擎常量
  const RADIUS_KEYS = RADIUS_SCALE_KEYS;
  // E5.8#80：带 glass.surface.radius=10 的配方——zone 圆角第二通道测试基准（--surface-radius=10px）
  const ZONE_RECIPE: ThemeRecipe = {
    id: "demo-zone-radius",
    name: "Demo Zone Radius",
    type: "dark",
    appearance: {
      radius: { sm: 6, lg: 12 },
      glass: { type: "glass", blur: 14, radius: 10 },
    },
    colorways: [{ id: "base", name: "Base", colors: { "bg-window": "#101014" } }],
  };
  const GLASS_VARS = [
    "glass-blur", "glass-opacity", "glass-tint", "bg-image",
  ];
  beforeEach(() => {
    clearConfigurationCache(); // 清空上一测试的 applyRemoteConfigChange 残留
    const root = document.documentElement;
    for (const key of [...GLASS_VARS, ...RADIUS_KEYS]) {
      root.style.removeProperty(`--${key}`);
    }
  });

  it("E5.8#85 neutral 默认 → radius 不覆盖（presence 门控），玻璃/背景不覆盖", () => {
    const overrides = getAppearanceOverrides();
    expect(overrides["glass-blur"]).toBeUndefined();
    expect(overrides["glass-opacity"]).toBeUndefined();
    expect(overrides["glass-tint"]).toBeUndefined();
    expect(overrides["bg-image"]).toBeUndefined();
    for (const key of RADIUS_KEYS) expect(overrides[key]).toBeUndefined(); // 无覆盖 = 主题圆角
    expect(overrides["surface-radius"]).toBeUndefined();
  });

  it("glassBlur 偏离默认 → glass-blur 覆盖", () => {
    applyRemoteConfigChange("app.glassBlur", 15);
    expect(getAppearanceOverrides()["glass-blur"]).toBe("15px");
  });

  it("E5.8#112 glassOpacity 0.5 → 不写 glass-opacity token（用户值走合成层，不污染 tint 盖片）", () => {
    applyRemoteConfigChange("app.glassOpacity", 0.5);
    expect(getAppearanceOverrides()["glass-opacity"]).toBeUndefined();
  });

  it("glassTint 非空 → glass-tint 覆盖", () => {
    applyRemoteConfigChange("app.glassTint", "#123456");
    expect(getAppearanceOverrides()["glass-tint"]).toBe("#123456");
  });

  it("backgroundImage 旧版 plain 绝对路径 → 受控协议 URL（E5.8#64：file:// 被沙箱拦截）", () => {
    applyRemoteConfigChange("app.backgroundImage", "C:\\Users\\feng\\AppData\\Roaming\\linkdesk\\appearance\\bg.png");
    expect(getAppearanceOverrides()["bg-image"]).toBe('url("linkdesk-userdata://appearance/bg.png")');
  });

  it("backgroundImage 旧版 plain 路径含空格中文 → basename 编码进受控协议 URL", () => {
    applyRemoteConfigChange("app.backgroundImage", "C:\\AppData\\linkdesk\\appearance\\背景 图.png");
    expect(getAppearanceOverrides()["bg-image"]).toBe('url("linkdesk-userdata://appearance/%E8%83%8C%E6%99%AF%20%E5%9B%BE.png")');
  });

  it("backgroundImage 已是受控协议 URL → 原样 url() 包裹（值已协议化，幂等）", () => {
    applyRemoteConfigChange("app.backgroundImage", "linkdesk-userdata://appearance/bg.png");
    expect(getAppearanceOverrides()["bg-image"]).toBe('url("linkdesk-userdata://appearance/bg.png")');
  });

  it("backgroundImage 已是主题资产协议 URL（linkdesk://）→ 原样包裹", () => {
    applyRemoteConfigChange("app.backgroundImage", "linkdesk://demo-theme/assets/bg.png");
    expect(getAppearanceOverrides()["bg-image"]).toBe('url("linkdesk://demo-theme/assets/bg.png")');
  });

  it("fontFamily 非空 → font-ui 覆盖（E5.8#50.19：用户级字体写 --font-ui）", () => {
    applyRemoteConfigChange("app.fontFamily", "SimSun");
    expect(getAppearanceOverrides()["font-ui"]).toBe("SimSun");
  });

  it("fontFamily 空 → font-ui 不覆盖（跟随主题）", () => {
    applyRemoteConfigChange("app.fontFamily", "");
    expect(getAppearanceOverrides()["font-ui"]).toBeUndefined();
  });

  /* ── E5.8#87 显式「无」哨兵 __none__——绝对无图/系统字体（盖掉主题/mix），空 ≠ 无（空 = 回主题）── */

  it("E5.8#87 backgroundImage __none__ → bg-image none（绝对无图，盖掉主题全景图）", () => {
    applyRemoteConfigChange("app.backgroundImage", CONFIG_NONE_SENTINEL);
    expect(getAppearanceOverrides()["bg-image"]).toBe("none");
  });

  it("E5.8#87 backgroundImage 空 → bg-image 不覆盖（回主题，非 none）", () => {
    applyRemoteConfigChange("app.backgroundImage", "");
    expect(getAppearanceOverrides()["bg-image"]).toBeUndefined();
  });

  it("E5.8#87 zoneBackgroundImage __none__ → surface-bg-image none（绝对无分区图，盖掉主题 zones 纹理）", () => {
    applyRemoteConfigChange("app.zoneBackgroundImage", CONFIG_NONE_SENTINEL);
    const overrides = getAppearanceOverrides();
    expect(overrides["surface-bg-image"]).toBe("none");
    expect(overrides["surface-bg-repeat"]).toBeUndefined(); // 无图 → 不量测 zones
    expect(overrides["surface-bg-zones"]).toBeUndefined();
  });

  it("E5.8#87 fontFamily __none__ → font-ui = 系统默认栈（绝对系统默认，不跟随主题字体资产）", () => {
    applyRemoteConfigChange("app.fontFamily", CONFIG_NONE_SENTINEL);
    expect(getAppearanceOverrides()["font-ui"]).toBe(SYSTEM_FONT_STACK);
  });

  it("E5.8#85 surfaceRadius presence → 六键全写 md 档绝对 px（clamp 进标尺）", () => {
    applyRemoteConfigChange("app.surfaceRadius", 12);
    const overrides = getAppearanceOverrides();
    for (const key of RADIUS_KEYS) expect(overrides[key]).toBe("12");
  });

  /* ── E5.8 Phase 12 #163 播种/复位语义——字号独立全局轴 ── */

  it("E5.8#163 uiFontScale 不进 APPEARANCE_OVERRIDE_KEYS（不随 custom 播种/切主题重播种——独立轴，F4 全模式生效的结构保证）", () => {
    expect(APPEARANCE_OVERRIDE_KEYS).not.toContain("app.uiFontScale");
  });

  it("E5.8#163 uiFontScale unset → 恒写 ui-font-scale 100（字号轴恒发射，ratio 1 = ⑤ 新基线）", () => {
    expect(getAppearanceOverrides()["ui-font-scale"]).toBe("100");
  });

  it("E5.8#163 uiFontScale 用户值跟随（125 → 恒写 125；本键不读 appearanceMode——followTheme 也保持，仅 unset→默认 1）", () => {
    applyRemoteConfigChange("app.uiFontScale", 125);
    expect(getAppearanceOverrides()["ui-font-scale"]).toBe("125");
  });

  it("E5.8#85 surfaceRadius 越界 999 → 钳到 32；负 → 0（消费侧 clamp 延续 #56）", () => {
    applyRemoteConfigChange("app.surfaceRadius", 999);
    for (const key of RADIUS_KEYS) expect(getAppearanceOverrides()[key]).toBe("32");
    applyRemoteConfigChange("app.surfaceRadius", -5);
    for (const key of RADIUS_KEYS) expect(getAppearanceOverrides()[key]).toBe("0");
  });

  /* ── E5.8#85 zone 圆角绝对化（原 #80 第二通道改绝对 px）——app.zoneRadius 开关 + app.zoneRadiusScale 绝对 px（surface-radius）── */

  it("#85 neutral——surface-radius 不覆盖（presence 门控；主题自带 surface.radius 原样）", () => {
    const overrides = getAppearanceOverrides();
    expect(overrides["surface-radius"]).toBeUndefined();
  });

  it("#85 zoneRadius 关 → surface-radius 覆盖 = \"0px\"（直角短路值）", () => {
    applyRemoteConfigChange("app.zoneRadius", false);
    expect(getAppearanceOverrides()["surface-radius"]).toBe("0px");
  });

  it("#85 zoneRadius 开 + zoneRadiusScale 12 → 绝对 12（数字串，applyOverrides ①b 解析为 12px）", () => {
    applyRemoteConfigChange("app.zoneRadius", true);
    applyRemoteConfigChange("app.zoneRadiusScale", 12);
    expect(getAppearanceOverrides()["surface-radius"]).toBe("12");
  });

  it("#85 zoneRadiusScale 越界 999 → 钳到 32（标尺 clamp）", () => {
    applyRemoteConfigChange("app.zoneRadiusScale", 999);
    expect(getAppearanceOverrides()["surface-radius"]).toBe("32");
  });

  it("#85 applyOverrides——surface-radius 绝对 px 直写（不乘主题基准：直角主题 0 死区根治）", () => {
    const tokens = { "surface-radius": "0px" }; // 直角主题基准 0
    applyOverrides(tokens, { "surface-radius": "16" });
    expect(tokens["surface-radius"]).toBe("16px");
  });

  it("#85 applyOverrides——\"0px\" 短路强制直角（开关关，忽略主题 surface.radius）", () => {
    const tokens = { "surface-radius": "12px" };
    applyOverrides(tokens, { "surface-radius": "0px" });
    expect(tokens["surface-radius"]).toBe("0px");
  });

  it("#85 applyOverrides——无 surface-radius 覆盖 → 不动该键", () => {
    const tokens = { "surface-radius": "12px" };
    applyOverrides(tokens, { "radius-md": "16", "glass-blur": "16px" });
    expect(tokens["surface-radius"]).toBe("12px");
  });

  it("#85 applyRecipe——zoneRadiusScale 12 → surface-radius 12px（组件 radius-* 不受 zoneRadiusScale 影响）", () => {
    applyRemoteConfigChange("app.zoneRadiusScale", 12);
    applyRecipe(ZONE_RECIPE); // overrides 缺省 = getAppearanceOverrides（surface-radius 绝对 12px）
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-radius")).toBe("12px");
    expect(root.style.getPropertyValue("--radius-sm")).toBe("6px"); // 组件圆角不受 zoneRadiusScale（两轴独立）
  });

  it("#85 applyRecipe——zoneRadius 关 → surface-radius 0px（直角），radius-* 仍主题值", () => {
    applyRemoteConfigChange("app.zoneRadius", false);
    applyRecipe(ZONE_RECIPE);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-radius")).toBe("0px");
    expect(root.style.getPropertyValue("--radius-sm")).toBe("6px");
  });

  /* ── E5.8 缝系统——--surface-inset 宿主派生（Content vs Space Ownership：主题 inset 数据废弃，
     半径≠0 → 每格半缝 2px / 半径 0px 或缺省 → 贴死 0px）。法则在 applyOverrides ③，覆盖全部路径。 ── */

  it("缝法则 applyOverrides——radius≠0 → surface-inset 派生 2px（每格半缝）", () => {
    const tokens: Record<string, string> = { "surface-radius": "16px" };
    applyOverrides(tokens, {});
    expect(tokens["surface-inset"]).toBe("2px");
  });

  it("缝法则 applyOverrides——radius 0px → surface-inset 0px（直角贴死）", () => {
    const tokens: Record<string, string> = { "surface-radius": "0px" };
    applyOverrides(tokens, {});
    expect(tokens["surface-inset"]).toBe("0px");
  });

  it("缝法则 applyOverrides——无 surface-radius（缺省）→ 0px 贴死", () => {
    const tokens: Record<string, string> = {};
    applyOverrides(tokens, {});
    expect(tokens["surface-inset"]).toBe("0px");
  });

  it("缝法则 applyRecipe——zoneRadiusScale 12 → --surface-inset 2px（圆角开留缝）", () => {
    applyRemoteConfigChange("app.zoneRadius", true);
    applyRemoteConfigChange("app.zoneRadiusScale", 12);
    applyRecipe(ZONE_RECIPE);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-radius")).toBe("12px");
    expect(root.style.getPropertyValue("--surface-inset")).toBe("2px");
  });

  it("缝法则 applyRecipe——zoneRadius 关 → --surface-inset 0px（圆角关贴死，与直角短路同门）", () => {
    applyRemoteConfigChange("app.zoneRadius", false);
    applyRecipe(ZONE_RECIPE);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-radius")).toBe("0px");
    expect(root.style.getPropertyValue("--surface-inset")).toBe("0px");
  });

  /* ── E5.8#81 zone 表面背景覆盖入口——app.zoneBackgroundImage（写 surface-bg-*，与全窗 bg-image 并存）── */

  it("#81 zoneBackgroundImage 非空 → surface-bg-image + repeat no-repeat + zones 1 覆盖（并存全窗）", () => {
    applyRemoteConfigChange("app.zoneBackgroundImage", "linkdesk-userdata://appearance/zone-bg.png");
    const overrides = getAppearanceOverrides();
    expect(overrides["surface-bg-image"]).toBe('url("linkdesk-userdata://appearance/zone-bg.png")');
    expect(overrides["surface-bg-repeat"]).toBe("no-repeat");
    expect(overrides["surface-bg-zones"]).toBe("1");
  });

  it("#81 zoneBackgroundImage 空 → 不写 surface-bg-*（回主题自带 zones 纹理）", () => {
    applyRemoteConfigChange("app.zoneBackgroundImage", "");
    const overrides = getAppearanceOverrides();
    expect(overrides["surface-bg-image"]).toBeUndefined();
    expect(overrides["surface-bg-zones"]).toBeUndefined();
  });

  it("#81 两图并存——app.backgroundImage 与 app.zoneBackgroundImage 同设 → bg-image 与 surface-bg-image 双覆盖", () => {
    applyRemoteConfigChange("app.backgroundImage", "linkdesk-userdata://appearance/full-bg.png");
    applyRemoteConfigChange("app.zoneBackgroundImage", "linkdesk-userdata://appearance/zone-bg.png");
    const overrides = getAppearanceOverrides();
    expect(overrides["bg-image"]).toBe('url("linkdesk-userdata://appearance/full-bg.png")');
    expect(overrides["surface-bg-image"]).toBe('url("linkdesk-userdata://appearance/zone-bg.png")');
  });

  it("#81 applyRecipe——zoneBackgroundImage 覆盖胜主题 zones 纹理（surface-bg-image 换用户图）", () => {
    applyRemoteConfigChange("app.zoneBackgroundImage", "linkdesk-userdata://appearance/zone-bg.png");
    applyRecipe(ZONE_RECIPE);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--surface-bg-image"))
      .toBe('url("linkdesk-userdata://appearance/zone-bg.png")');
    expect(root.style.getPropertyValue("--surface-bg-zones")).toBe("1");
    expect(root.style.getPropertyValue("--bg-image")).toBe("none"); // 无全窗背景
  });

  it("E5.8#56 审计#2——glassBlur 显式拖到 0（端点，presence）→ glass-blur 覆盖 0px（模糊真关）", () => {
    applyRemoteConfigChange("app.glassBlur", 0);
    expect(getAppearanceOverrides()["glass-blur"]).toBe("0px");
  });

  it("E5.8#112——glassOpacity 显式拖到 1（端点，presence）→ 不写 glass-opacity token（用户值走合成层，合成 alpha=1 即真不透明）", () => {
    applyRemoteConfigChange("app.glassOpacity", 1);
    expect(getAppearanceOverrides()["glass-opacity"]).toBeUndefined();
  });

  it("E5.8#56——hasConfigurationValue presence 语义：未写 false、applyRemoteConfigChange 后 true（reset 摘除 → 回 neutral）", () => {
    expect(hasConfigurationValue("app.glassBlur")).toBe(false);
    applyRemoteConfigChange("app.glassBlur", 0);
    expect(hasConfigurationValue("app.glassBlur")).toBe(true);
  });

  it("E5.8 参考系根治——applyRadiusAbsolute 越界 clamp：absPx 999 → 钳到 32（settings.json 直写 999 不再 999× 圆角）", () => {
    const scaled = applyRadiusAbsolute(999);
    for (const key of RADIUS_KEYS) expect(scaled[key]).toBe("32px"); // 全档 = 滑杆 clamp 值
  });

  it("E5.8 参考系根治——applyRadiusAbsolute 负越界 clamp：absPx -1 → 钳到 0（方角），非负数取反", () => {
    const scaled = applyRadiusAbsolute(-1);
    for (const key of RADIUS_KEYS) expect(scaled[key]).toBe("0px");
  });

  it("E5.8 参考系根治——applyRadiusAbsolute 合法域：六档平铺全 = 滑杆值（跨主题一致，删主题比例）", () => {
    const scaled = applyRadiusAbsolute(12);
    for (const key of RADIUS_KEYS) expect(scaled[key]).toBe("12px"); // 全档 = 滑杆值
  });

  it("E5.8 参考系根治 applyRadiusAbsolute — 返回六档键集、不含形态值（形态键由 applyOverrides ①c/其余路径管）", () => {
    const scaled = applyRadiusAbsolute(16);
    for (const key of RADIUS_KEYS) expect(scaled[key]).toBe("16px");
    expect(scaled["radius-pill"]).toBeUndefined();
    expect(scaled["radius-full"]).toBeUndefined();
  });

  it("E5.8 参考系根治 applyRadiusAbsolute(0) — 0 方角档：六档全 0px，形态值仍排除", () => {
    const scaled = applyRadiusAbsolute(0);
    for (const key of RADIUS_KEYS) expect(scaled[key]).toBe("0px");
    expect(scaled["radius-pill"]).toBeUndefined();
    expect(scaled["radius-full"]).toBeUndefined();
  });

  it("applyTheme 折叠覆盖——glassBlur 覆盖胜过主题 surface.blur", () => {
    applyRemoteConfigChange("app.glassBlur", 15);
    applyTheme({ ...MOCK_THEME, surface: { type: "glass", blur: 8 } });
    expect(document.documentElement.style.getPropertyValue("--glass-blur")).toBe("15px");
  });

  it("E5.8#60 F1.1——APPEARANCE_OVERRIDE_KEYS = 全 13 键含 app.fontFamily（单一来源防回归；#80/#81 +zone 三键；#94/#95/#96 镜像补槽四键；#97 撤销后无 surfaceTexture）", () => {
    // 设置层外观覆盖 key 全集——壳命令（startup appearanceMode onApply）与插件 API（theme.resetAppearance）复位共用
    expect([...APPEARANCE_OVERRIDE_KEYS]).toEqual([
      "app.surfaceRadius", "app.glassBlur", "app.glassOpacity",
      "app.glassTint", "app.backgroundImage", "app.fontFamily",
      "app.zoneRadius", "app.zoneRadiusScale", "app.zoneBackgroundImage",
      "app.backgroundOpacity", "app.backgroundMask", "app.fontFamilyMono", "app.glassSaturate",
    ]);
    // 每键确与 getAppearanceOverrides 读的配置键对齐（写多了 reset 摘不到、写少了残留覆盖）
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.fontFamily"); // 插件侧旧表漏此键 → 复位后字体不回基线
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.surfaceRadius");
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.zoneRadius");
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.zoneRadiusScale");
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.zoneBackgroundImage");
    // E5.8#94/#95/#96 镜像补槽四键（主题可表达必有槽——reseed 计划/复位必须覆盖，写少了残留覆盖）
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.backgroundOpacity");
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.backgroundMask");
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.fontFamilyMono");
    expect(APPEARANCE_OVERRIDE_KEYS).toContain("app.glassSaturate");
    // E5.8#97 撤销（2026-08-26 用户拍板）——app.surfaceTexture 不入本表（纹理=主题插件内容资产，壳无纹理槽）
    expect(APPEARANCE_OVERRIDE_KEYS).not.toContain("app.surfaceTexture");
  });

  /* ── E5.8#94/#95/#96 镜像补槽覆盖读取——主题可表达属性 ⇒ 设置面必有槽（14-档案 §十）── */

  it("E5.8#115 backgroundOpacity 显式写过 → bg-opacity + surface-bg-opacity 双覆盖（统一底图+镜像/纹理；1 = neutral 也是显式意图，presence 门控）", () => {
    applyRemoteConfigChange("app.backgroundOpacity", 0.4);
    expect(getAppearanceOverrides()["bg-opacity"]).toBe("0.4");
    expect(getAppearanceOverrides()["surface-bg-opacity"]).toBe("0.4");
  });

  it("E5.8#115 backgroundOpacity 未写 → 零 bg-opacity/surface-bg-opacity 覆盖（跟随主题）", () => {
    expect(getAppearanceOverrides()["bg-opacity"]).toBeUndefined();
    expect(getAppearanceOverrides()["surface-bg-opacity"]).toBeUndefined();
  });

  it("E5.8#94 backgroundMask 显式写过 → bg-mask 覆盖", () => {
    applyRemoteConfigChange("app.backgroundMask", 0.3);
    expect(getAppearanceOverrides()["bg-mask"]).toBe("0.3");
  });

  it("E5.8#95 fontFamilyMono 族名 → font-mono 覆盖（--font-mono 契约）", () => {
    applyRemoteConfigChange("app.fontFamilyMono", "Cascadia Code");
    expect(getAppearanceOverrides()["font-mono"]).toBe("Cascadia Code");
  });

  it("E5.8#95 fontFamilyMono=__none__ → 系统等宽栈（绝对系统默认，不跟随主题 mono 资产）", () => {
    applyRemoteConfigChange("app.fontFamilyMono", "__none__");
    expect(getAppearanceOverrides()["font-mono"]).toBe(SYSTEM_MONO_FONT_STACK);
  });

  it("E5.8#95 fontFamilyMono 空/未写 → 零 font-mono 覆盖（跟随主题）", () => {
    expect(getAppearanceOverrides()["font-mono"]).toBeUndefined();
  });

  it("E5.8#96 glassSaturate 显式写过 → glass-saturate 覆盖（presence 门控，端点 1 neutral 照常生效）", () => {
    applyRemoteConfigChange("app.glassSaturate", 1.5);
    expect(getAppearanceOverrides()["glass-saturate"]).toBe("1.5");
    // neutral 端点也是显式意图（值对比会把端点误判为未覆盖 → presence 门控）
    applyRemoteConfigChange("app.glassSaturate", 1);
    expect(getAppearanceOverrides()["glass-saturate"]).toBe("1");
  });

  it("E5.8#96 glassSaturate 未写 → 零 glass-saturate 覆盖（跟随主题）", () => {
    expect(getAppearanceOverrides()["glass-saturate"]).toBeUndefined();
  });

  /* ── E5.8#94/#95/#96 播种反推——deriveAppearanceSeeds 读生效 token 反向播种（进 custom 单写点）── */

  it("E5.8#94/#95/#96 deriveAppearanceSeeds — 背景可读性/玻璃饱和度 neutral 缺省反推；等宽字体播种恒空（#154）", () => {
    const seeds = deriveAppearanceSeeds({
      "bg-opacity": "0.8",
      "bg-mask": "0.25",
      "font-mono": "JetBrains Mono",
      "glass-saturate": "1.4",
    });
    expect(seeds.backgroundOpacity).toBe(0.8);
    expect(seeds.backgroundMask).toBe(0.25);
    // E5.8#154：等宽字体播种恒空——token 反推不再物质化（域来源 mixFont 唯一通道）
    expect(seeds.fontFamilyMono).toBe("");
    expect(seeds.glassSaturate).toBe(1.4);
  });

  it("E5.8#94/#95/#96 deriveAppearanceSeeds — 缺省 neutral（bg-opacity 1 / bg-mask 0 / 空 mono / saturate 1）", () => {
    const seeds = deriveAppearanceSeeds({});
    expect(seeds.backgroundOpacity).toBe(1);
    expect(seeds.backgroundMask).toBe(0);
    expect(seeds.fontFamilyMono).toBe("");
    expect(seeds.glassSaturate).toBe(1);
  });

  it("E5.8#115 deriveAppearanceSeeds — surface-bg-opacity 优先反推（用户统一覆盖镜像/纹理后的当前背景不透明度）", () => {
    const seeds = deriveAppearanceSeeds({ "surface-bg-opacity": "0.55", "bg-opacity": "0.8" });
    expect(seeds.backgroundOpacity).toBe(0.55);
    // 无 surface-bg-opacity（旧主题）→ 回退 bg-opacity
    expect(deriveAppearanceSeeds({ "bg-opacity": "0.3" }).backgroundOpacity).toBe(0.3);
  });

  it("E5.8#94/#95/#96 deriveAppearanceSeedMap — 13 覆盖键全集含补槽四键（reseed 计划/徽标基准共用）", () => {
    const seedMap = deriveAppearanceSeedMap({
      "bg-opacity": "0.7",
      "bg-mask": "0.2",
      "font-mono": "Consolas",
      "glass-saturate": "1.2",
    });
    expect(seedMap["app.backgroundOpacity"]).toBe(0.7);
    expect(seedMap["app.backgroundMask"]).toBe(0.2);
    // E5.8#154：等宽字体播种恒空（映射直用 deriveAppearanceSeeds 值）
    expect(seedMap["app.fontFamilyMono"]).toBe("");
    expect(seedMap["app.glassSaturate"]).toBe(1.2);
  });

  it("E5.8#94/#95/#96 deriveReseedPlan — 补槽四键未修改 → 切主题反推新基准填标尺", () => {
    const writes = deriveReseedPlan(
      { "app.backgroundOpacity": 1, "app.backgroundMask": 0, "app.fontFamilyMono": "", "app.glassSaturate": 1 },
      { "app.backgroundOpacity": 0.6, "app.backgroundMask": 0.3, "app.fontFamilyMono": "Consolas", "app.glassSaturate": 1.5 },
      {}
    );
    const byKey = Object.fromEntries(writes.map((w) => [w.key, w.value]));
    expect(byKey["app.backgroundOpacity"]).toBe(0.6);
    expect(byKey["app.backgroundMask"]).toBe(0.3);
    expect(byKey["app.fontFamilyMono"]).toBe("Consolas");
    expect(byKey["app.glassSaturate"]).toBe(1.5);
  });

  /* ── E5.8#91 文字极性槽——app.fontTone 显式选档 → 系统双字系标尺覆盖 text-*（非主题色板值）；
     跟随主题/未写 → 零覆盖（主题 type 决定极性，colorway text-* 原样）── */

  it("E5.8#91 fontTone=light → text-primary/secondary/muted = 系统亮字系（深底用）", () => {
    applyRemoteConfigChange("app.fontTone", "light");
    const overrides = getAppearanceOverrides();
    expect(overrides["text-primary"]).toBe(FONT_TONE_LIGHT_TEXT[0]);
    expect(overrides["text-secondary"]).toBe(FONT_TONE_LIGHT_TEXT[1]);
    expect(overrides["text-muted"]).toBe(FONT_TONE_LIGHT_TEXT[2]);
  });

  it("E5.8#91 fontTone=dark → text-primary/secondary/muted = 系统暗字系（浅底用）", () => {
    applyRemoteConfigChange("app.fontTone", "dark");
    const overrides = getAppearanceOverrides();
    expect(overrides["text-primary"]).toBe(FONT_TONE_DARK_TEXT[0]);
    expect(overrides["text-secondary"]).toBe(FONT_TONE_DARK_TEXT[1]);
    expect(overrides["text-muted"]).toBe(FONT_TONE_DARK_TEXT[2]);
  });

  it("E5.8#91 fontTone=followTheme → 零 text-* 覆盖（主题 type 决定极性）", () => {
    applyRemoteConfigChange("app.fontTone", "followTheme");
    const overrides = getAppearanceOverrides();
    for (const key of FONT_TONE_TEXT_KEYS) expect(overrides[key]).toBeUndefined();
  });

  it("E5.8#91 fontTone 未写 → 零 text-* 覆盖（default=followTheme 语义）", () => {
    const overrides = getAppearanceOverrides();
    for (const key of FONT_TONE_TEXT_KEYS) expect(overrides[key]).toBeUndefined();
  });

  it("E5.8#91 fontTone 与 mix 共存——appearanceMode=custom 时显式档照常覆盖（fontTone 非 mix 来源键，无竞争）", () => {
    applyRemoteConfigChange("app.fontTone", "dark");
    applyRemoteConfigChange("app.appearanceMode", "custom");
    const overrides = getAppearanceOverrides();
    expect(overrides["text-primary"]).toBe(FONT_TONE_DARK_TEXT[0]);
    expect(overrides["text-secondary"]).toBe(FONT_TONE_DARK_TEXT[1]);
  });
});

describe("ThemeEngine — deriveAppearanceSeeds 反推播种（E5.8#50.19，08 §2）", () => {
  it("E5.8#85 圆角反推绝对 px——surfaceRadius = 当前 radius-md 实际值（非主题比值）；越界 clamp 标尺", () => {
    const seeds = deriveAppearanceSeeds({ "radius-md": "12px", "surface-radius": "10px" });
    expect(seeds.surfaceRadius).toBe(12);
    expect(deriveAppearanceSeeds({ "radius-md": "20px" }).surfaceRadius).toBe(20);
    expect(deriveAppearanceSeeds({ "radius-md": "2px" }).surfaceRadius).toBe(2);
    expect(deriveAppearanceSeeds({ "radius-md": "999px" }).surfaceRadius).toBe(32); // clamp 标尺
  });

  it("E5.8#85 zoneRadiusPx 播种——当前 surface-radius 实际 px；无 token → 0（直角）", () => {
    expect(deriveAppearanceSeeds({ "surface-radius": "10px" }).zoneRadiusPx).toBe(10);
    expect(deriveAppearanceSeeds({ "surface-radius": "999px" }).zoneRadiusPx).toBe(32); // clamp 标尺
    expect(deriveAppearanceSeeds({}).zoneRadiusPx).toBe(0);
  });

  it("E5.8#85 无 radius token / 直角主题 → 播种 0（方角起点，非比值 1）", () => {
    expect(deriveAppearanceSeeds({}).surfaceRadius).toBe(0);
    expect(deriveAppearanceSeeds({ "radius-md": "0px" }).surfaceRadius).toBe(0);
  });

  it("玻璃绝对播种——token 值直播；tint 剥 transparent → 空", () => {
    const seeds = deriveAppearanceSeeds({
      "glass-blur": "18px",
      "glass-opacity": "0.4",
      "glass-tint": "rgba(10,20,30,0.5)",
    });
    expect(seeds.glassBlur).toBe(18);
    expect(seeds.glassOpacity).toBe(0.4);
    expect(seeds.glassTint).toBe("rgba(10,20,30,0.5)");
    expect(deriveAppearanceSeeds({ "glass-tint": "transparent" }).glassTint).toBe("");
  });

  it("E5.8#154 背景图播种恒空——token 反推不再物质化（域来源 mixBackground 唯一通道）；none/缺省 → 空", () => {
    const seeds = deriveAppearanceSeeds({ "bg-image": 'url("C:/app/bg.png")' });
    expect(seeds.backgroundImage).toBe("");
    expect(deriveAppearanceSeeds({ "bg-image": "none" }).backgroundImage).toBe("");
    expect(deriveAppearanceSeeds({}).backgroundImage).toBe("");
  });

  it("E5.8#81 zoneBackgroundImage——zones 模式（surface-bg-zones=1）反推 surface-bg-image 剥 url()", () => {
    const seeds = deriveAppearanceSeeds({
      "surface-bg-image": 'url("linkdesk-userdata://appearance/zone-bg.png")',
      "surface-bg-zones": "1",
    });
    expect(seeds.zoneBackgroundImage).toBe("linkdesk-userdata://appearance/zone-bg.png");
  });

  it("E5.8#81 zoneBackgroundImage——纹理模式（zones=0）播种空（不把 repeat 纹理错播成 zones 切片）", () => {
    // 纸纹纹理：surface-bg-image 有值但 zones=0（repeat 平铺）——播种空 = 跟随主题
    const seeds = deriveAppearanceSeeds({
      "surface-bg-image": 'url("linkdesk://demo-theme/resources/paper.png")',
      "surface-bg-zones": "0",
    });
    expect(seeds.zoneBackgroundImage).toBe("");
    // none/缺省 → 空
    expect(deriveAppearanceSeeds({ "surface-bg-image": "none", "surface-bg-zones": "1" }).zoneBackgroundImage).toBe("");
    expect(deriveAppearanceSeeds({}).zoneBackgroundImage).toBe("");
  });

  it("E5.8#154 字体播种恒空——系统族名/资产族都跟随主题（__ld_ 边界并入恒空语义）", () => {
    expect(deriveAppearanceSeeds({ "font-ui": "SimSun" }).fontFamily).toBe("");
    expect(deriveAppearanceSeeds({ "font-ui": "__ld_demo-plugin_serif" }).fontFamily).toBe("");
  });
});

describe("ThemeEngine — E5.8#88 切主题重播种 + 徽标基准（deriveAppearanceSeedMap/deriveReseedPlan/getThemeBaseTokens/getAppliedAccent）", () => {
  const PLUGIN = "demo-reseed";

  beforeEach(() => {
    clearConfigurationCache();
    rollback(PLUGIN);
    const root = document.documentElement;
    for (const key of ["bg-window", "accent", "font-ui", "radius-sm", "radius-lg", "glass-blur"]) {
      root.style.removeProperty(`--${key}`);
    }
    root.removeAttribute("data-theme");
    ThemeRegistry.registerRecipe(RECIPE, PLUGIN);
    // 清 recipe 活动态（applyTheme flat 桥接置 currentRecipeId=null）——getThemeBaseTokens 无活动配方分支需干净起点
    applyTheme(MOCK_THEME);
  });

  it("deriveAppearanceSeedMap — 13 覆盖键 → 种子值全集映射（键=配置 key，单写点）", () => {
    const map = deriveAppearanceSeedMap({
      "radius-md": "8px",
      "surface-radius": "10px",
      "glass-blur": "18px",
      "glass-opacity": "0.4",
      "glass-tint": "rgba(10,20,30,0.5)",
      "bg-image": 'url("C:/app/bg.png")',
      "font-ui": "SimSun",
      "surface-bg-image": 'url("linkdesk-userdata://appearance/zone.png")',
      "surface-bg-zones": "1",
    });
    expect(map).toEqual({
      "app.surfaceRadius": 8,
      "app.glassBlur": 18,
      "app.glassOpacity": 0.4,
      "app.glassTint": "rgba(10,20,30,0.5)",
      // E5.8#154：背景/字体播种恒空——即使 token 有生效值也不物质化（跟随主题，域来源唯一通道）
      "app.backgroundImage": "",
      "app.fontFamily": "",
      "app.zoneRadius": true,
      "app.zoneRadiusScale": 10,
      "app.zoneBackgroundImage": "linkdesk-userdata://appearance/zone.png",
      // E5.8#94/#95/#96 镜像补槽四键（输入未写 → neutral 缺省反推）
      "app.backgroundOpacity": 1,
      "app.backgroundMask": 0,
      "app.fontFamilyMono": "",
      "app.glassSaturate": 1,
    });
    // 缺省 token → 零值/空（不抛）——zoneBackgroundImage 需 zones=1
    const empty = deriveAppearanceSeedMap({});
    expect(empty["app.surfaceRadius"]).toBe(0);
    // E5.8#112：无玻璃主题播种玻璃面不透明度 = 系统默认 0.5（非哨兵 1——根治合成全实拖 blur 无玻璃感）
    expect(empty["app.glassOpacity"]).toBe(0.5);
    expect(empty["app.zoneRadius"]).toBe(true);
    expect(empty["app.zoneBackgroundImage"]).toBe("");
    expect(empty["app.backgroundImage"]).toBe("");
    expect(empty["app.backgroundOpacity"]).toBe(1);
    expect(empty["app.backgroundMask"]).toBe(0);
    expect(empty["app.fontFamilyMono"]).toBe("");
    expect(empty["app.glassSaturate"]).toBe(1);
    expect(empty["app.surfaceTexture"]).toBeUndefined();
  });

  it("deriveReseedPlan — 未修改（无 stored）→ 反推新基准填标尺；新旧同值跳过", () => {
    const oldBaseline = { "app.surfaceRadius": 8, "app.glassBlur": 0, "app.backgroundImage": "" };
    const newBaseline = { "app.surfaceRadius": 12, "app.glassBlur": 4, "app.backgroundImage": "" };
    const plan = deriveReseedPlan(oldBaseline, newBaseline, {});
    expect(plan).toEqual([
      { key: "app.surfaceRadius", value: 12 },
      { key: "app.glassBlur", value: 4 },
      { key: "app.backgroundImage", value: "" },
    ]);
  });

  it("deriveReseedPlan — 未修改（stored === 旧基准，含播种态/恰与主题同值）→ 随新主题重基线", () => {
    const oldBaseline = { "app.surfaceRadius": 8 };
    const newBaseline = { "app.surfaceRadius": 12 };
    // stored 8 === 旧基准 8 → 非用户偏离（进 custom 播种值）→ 重播种到新基准
    expect(deriveReseedPlan(oldBaseline, newBaseline, { "app.surfaceRadius": 8 })).toEqual([
      { key: "app.surfaceRadius", value: 12 },
    ]);
    // 新旧同值 → 跳过（零副作用无谓广播）
    expect(deriveReseedPlan({ "app.surfaceRadius": 8 }, { "app.surfaceRadius": 8 }, { "app.surfaceRadius": 8 })).toEqual([]);
  });

  it("deriveReseedPlan — 用户显式修改（偏离旧基准）→ 保留不写", () => {
    const oldBaseline = { "app.surfaceRadius": 8 };
    const newBaseline = { "app.surfaceRadius": 12 };
    expect(deriveReseedPlan(oldBaseline, newBaseline, { "app.surfaceRadius": 14 })).toEqual([]);
  });

  it("E5.8#154 附带修正——播种改空后显式字体选择恒判显式保留（旧逻辑非空==旧基准误判未修改丢选择）", () => {
    // 播种改空前：主题生效字体物质化成 app.fontFamily（旧基准非空），用户显式选的同值字被误判
    // 「未修改」（stored === 旧基准）→ 切主题重播种丢用户选择。改空后旧基准恒 "" → 显式非空恒判显式保留。
    const oldBaseline = { "app.fontFamily": "" }; // 新播种语义：字体基准恒空
    const newBaseline = { "app.fontFamily": "Cascadia Mono" };
    // 用户显式选了 SimSun（非空 ≠ 空基准）→ 保留不写（不随切主题被重播种吞）
    expect(deriveReseedPlan(oldBaseline, newBaseline, { "app.fontFamily": "SimSun" })).toEqual([]);
    // 跟随主题（空 == 基准空）→ 未修改 → 自动跟随新主题填新基准
    expect(deriveReseedPlan(oldBaseline, newBaseline, { "app.fontFamily": "" })).toEqual([
      { key: "app.fontFamily", value: "Cascadia Mono" },
    ]);
  });

  it("deriveReseedPlan — 空串（跟随主题/清除）≠ 旧基准非空 → 保留自动跟随新主题", () => {
    const oldBaseline = { "app.backgroundImage": "old-bg.png" };
    const newBaseline = { "app.backgroundImage": "new-bg.png" };
    expect(deriveReseedPlan(oldBaseline, newBaseline, { "app.backgroundImage": "" })).toEqual([]);
    // 显式 __none__（绝对无）偏离旧基准 → 真实用户选择保留
    expect(deriveReseedPlan(oldBaseline, newBaseline, { "app.backgroundImage": "__none__" })).toEqual([]);
    // zoneRadius=false 偏离播种 true → 保留（用户显式关闭分区圆角）
    expect(deriveReseedPlan({ "app.zoneRadius": true }, { "app.zoneRadius": true }, { "app.zoneRadius": false })).toEqual([]);
  });

  it("getThemeBaseTokens — 无覆盖纯基线（recipe 模式）；外观覆盖配置不影响（overrides={} 显式）", () => {
    applyRecipe(RECIPE, "mint", {});
    const base = getThemeBaseTokens();
    expect(base["accent"]).toBe("#3E9E8C"); // mint 配色 accent
    expect(base["glass-blur"]).toBe("14px"); // 主题原生 appearance.glass
    expect(base["font-ui"]).toBe("Noto Sans SC");
    // 设外观覆盖后仍纯基线——重播种判定「无覆盖时主题给什么」不能被用户值污染
    applyRemoteConfigChange("app.surfaceRadius", 20);
    applyRemoteConfigChange("app.glassBlur", 6);
    expect(getThemeBaseTokens()["glass-blur"]).toBe("14px");
    expect(getThemeBaseTokens()["accent"]).toBe("#3E9E8C");
  });

  it("getThemeBaseTokens — 无活动配方 → {}（startup 早期降级为全保留）", () => {
    expect(getThemeBaseTokens()).toEqual({});
  });

  it("getAppliedAccent — applyAccentColor 追踪最近实际应用强调色（C4 权威在引擎，非 DOM 读）", () => {
    applyAccentColor("#123456");
    expect(getAppliedAccent()).toBe("#123456");
    applyAccentColor("#abcdef");
    expect(getAppliedAccent()).toBe("#abcdef");
  });
});
