/**
 * 外观覆盖播种 + 读覆盖集——appearanceMode=custom 反推播种 / 切主题重播种计划 / 当前覆盖集（08 §2：设置层永远只存用户偏离量）。
 * 依赖：constants（标尺/哨兵/字栈）+ state（getActiveRecipe）+ recipe（resolveColorway/mergeDomains）+
 * mix（mergeMixDomains/getMixProfile）+ ConfigurationService + resolveBackgroundImageUrl。
 * 不依赖 apply——seeds⇄apply 循环由 state 破（见 state.ts 模块头）。
 */

import { resolveBackgroundImageUrl } from "../../../utils/path/userDataImagePath";
import { getConfigurationValue, hasConfigurationValue } from "../../configuration/ConfigurationService";
import { ThemeRegistry } from "../../../registry/appearance/ThemeRegistry";
import {
  RADIUS_SCALE_KEYS, clampRadiusPx, CONFIG_NONE_SENTINEL, SYSTEM_FONT_STACK, SYSTEM_MONO_FONT_STACK,
  FONT_TONE_LIGHT_TEXT, FONT_TONE_DARK_TEXT, GLASS_SURFACE_DEFAULT_ALPHA,
} from "./constants";
import { getActiveRecipe } from "./state";
import { resolveColorway, mergeDomains } from "./recipe";
import { getMixProfile, mergeMixDomains } from "./mix";

/** 设置层外观覆盖配置 key 全集——appearanceMode=custom 播种存这 14 键、reset 摘除这 14 键回主题基线（08 §7.2/§7.3.5）。
 *  单一来源：getAppearanceOverrides 读同键（glass 两键 presence 门控 / 其余空值不覆盖，见下）。
 *  E5.8#60 F1.1：壳命令（startup appearanceMode onApply）与插件 API（theme.resetAppearance）复位共用本表——
 *  插件侧曾只清 5 键漏 app.fontFamily → 第三方复位外观后字体不回基线。
 *  E5.8#80：+app.zoneRadius/app.zoneRadiusScale——zone 圆角第二通道（外观覆盖子节，同随 custom 播种/复位）。
 *  E5.8#81：+app.zoneBackgroundImage——zone 表面背景覆盖（与全窗 --bg-image 并存）。
 *  E5.8#94/#95/#96：+app.backgroundOpacity/app.backgroundMask/app.fontFamilyMono/app.glassSaturate——
 *  镜像补槽键（13 覆盖键全集；种子/复位/插件 reset/重播种计划单写点同表）。
 *  E5.8#97 撤销（2026-08-26 用户拍板）：app.surfaceTexture 曾入本表，撤——纹理=主题插件内容资产，
 *  壳不提供纹理通道（14-档案 §十一 补记）。 */
export const APPEARANCE_OVERRIDE_KEYS = [
  "app.surfaceRadius", "app.glassBlur", "app.glassOpacity",
  "app.glassTint", "app.backgroundImage", "app.fontFamily",
  "app.zoneRadius", "app.zoneRadiusScale", "app.zoneBackgroundImage",
  "app.backgroundOpacity", "app.backgroundMask", "app.fontFamilyMono", "app.glassSaturate",
] as const;

/** 外观覆盖播种值形状——deriveAppearanceSeeds 返回值（08 §2：设置层永远只存用户偏离量） */
export interface AppearanceSeedValues {
  surfaceRadius: number;
  zoneRadiusPx: number; // E5.8#85：zone 分区圆角绝对 px（随 custom 播种/复位）
  glassBlur: number;
  glassOpacity: number;
  glassTint: string;
  backgroundImage: string;
  fontFamily: string;
  zoneBackgroundImage: string; // E5.8#81：zone 表面背景覆盖（zones 模式才播种）
  backgroundOpacity: number; // E5.8#94：背景图不透明度（缺省 1 = 原图）
  backgroundMask: number; // E5.8#94：背景遮罩明暗（缺省 0 = 无遮罩）
  fontFamilyMono: string; // E5.8#95：等宽字体（缺省空 = 跟随主题）
  glassSaturate: number; // E5.8#96：玻璃饱和度（缺省 1 = neutral 原图）
}

/**
 * 反推外观覆盖播种值——appearanceMode→custom 瞬间从生效 token 集反推覆盖 key（08 §2：设置层永远只存用户偏离量）。
 * 纯函数只算不改。E5.8#85：圆角绝对化——surfaceRadius = 当前生效 radius-md 绝对值 px（非主题比值，根治
 * A8「播种显示比值」；mix 下 token 即混搭来源生效值，天然含 #57 二次缩放根治——比例模型分母概念废弃）。
 * zoneRadiusPx = 当前生效 surface-radius 绝对值 px。玻璃绝对 = token 值直播；bg 剥 url() 存受控路径；
 * font 跳过资产族（__ld_ 前缀 = 插件 @font-face，#50.20 边界：资产族只显示不选，播种空 = 跟随主题）。
 * E5.8#81：zoneBackgroundImage 仅 zones 模式（surface-bg-zones===1）反推 surface-bg-image（切片语义）；
 * 纹理主题（repeat 平铺，zones=0）播种空 = 跟随主题——避免把 repeat 纹理错播成 zones 切片（视觉变）。
 */
export function deriveAppearanceSeeds(tokens: Record<string, string>): AppearanceSeedValues {
  const bg = tokens["bg-image"];
  const bgPath = bg && bg !== "none" ? bg.replace(/^url\(["']?/, "").replace(/["']?\)$/, "") : "";
  const fam = tokens["font-ui"];
  const monoFam = tokens["font-mono"];
  const zoneBg = tokens["surface-bg-image"];
  const zoneBgPath = zoneBg && zoneBg !== "none" && tokens["surface-bg-zones"] === "1"
    ? zoneBg.replace(/^url\(["']?/, "").replace(/["']?\)$/, "")
    : "";
  return {
    surfaceRadius: clampRadiusPx(parseFloat(tokens["radius-md"] ?? "0")),
    zoneRadiusPx: clampRadiusPx(parseFloat(tokens["surface-radius"] ?? "0")),
    glassBlur: parseFloat(tokens["glass-blur"] ?? "0") || 0,
    glassOpacity: parseFloat(tokens["glass-opacity"] ?? "1"),
    glassTint: tokens["glass-tint"] && tokens["glass-tint"] !== "transparent" ? tokens["glass-tint"] : "",
    backgroundImage: bgPath,
    fontFamily: fam && !fam.startsWith("__ld_") ? fam : "",
    zoneBackgroundImage: zoneBgPath,
    // E5.8#94/#95/#96：镜像补槽播种——缺省 neutral（bg-opacity 1 / bg-mask 0 / mono 空 = 跟随主题 / saturate 1）
    backgroundOpacity: parseFloat(tokens["bg-opacity"] ?? "1") || 0,
    backgroundMask: parseFloat(tokens["bg-mask"] ?? "0") || 0,
    fontFamilyMono: monoFam && !monoFam.startsWith("__ld_") ? monoFam : "",
    glassSaturate: parseFloat(tokens["glass-saturate"] ?? "1") || 0,
  };
}

/** E5.8#88：外观覆盖播种值全集映射——9 覆盖键 → 主题基准种子值（键值直用：设置页徽标基准 + 切主题重播种）。
 *  deriveAppearanceSeeds 的 token 形状 → 配置键形状（app.zoneRadius 布尔恒 true——seedAppearanceOverrides 先例）。
 *  单写点：startup seedAppearanceOverrides 改走本映射（播种时机统一——进 custom + 切主题同一哲学）。 */
export function deriveAppearanceSeedMap(tokens: Record<string, string>): Record<string, unknown> {
  const seeds = deriveAppearanceSeeds(tokens);
  return {
    "app.surfaceRadius": seeds.surfaceRadius,
    "app.glassBlur": seeds.glassBlur,
    "app.glassOpacity": seeds.glassOpacity,
    "app.glassTint": seeds.glassTint,
    "app.backgroundImage": seeds.backgroundImage,
    "app.fontFamily": seeds.fontFamily,
    "app.zoneRadius": true,
    "app.zoneRadiusScale": seeds.zoneRadiusPx,
    "app.zoneBackgroundImage": seeds.zoneBackgroundImage,
    // E5.8#94/#95/#96：镜像补槽键（同一映射——播种/徽标基准/切主题重播种全走这里）
    "app.backgroundOpacity": seeds.backgroundOpacity,
    "app.backgroundMask": seeds.backgroundMask,
    "app.fontFamilyMono": seeds.fontFamilyMono,
    "app.glassSaturate": seeds.glassSaturate,
  };
}

/**
 * E5.8#88：切主题重播种计划——给定旧/新基准种子图 + 当前用户覆盖值，输出需写入新基准的键（纯函数只算不改）。
 * 策略 A（14-档案 #88 §六 3）：用户显式修改（存了值且偏离旧主题基线）→ 保留不写；未修改（含与旧基准同值/未存）
 * → 按新主题反推填标尺。空值 ""（跟随主题/清除回主题）≠ 旧基准非空 → 视为显式「跟随主题」保留（自动跟随新主题）。
 * 值不变跳过（无谓广播/持久化——#59 收敛先例）。调用方：startup app.theme onApply（await batch 落盘）。 */
export function deriveReseedPlan(
  oldBaseline: Record<string, unknown>,
  newBaseline: Record<string, unknown>,
  stored: Record<string, unknown>
): Array<{ key: string; value: unknown }> {
  const writes: Array<{ key: string; value: unknown }> = [];
  for (const key of APPEARANCE_OVERRIDE_KEYS) {
    const storedValue = stored[key];
    // 显式修改 → 保留（用户偏离旧主题基线的选择不随主题切换被覆盖）
    if (storedValue !== undefined && storedValue !== oldBaseline[key]) continue;
    // 未修改 → 反推新基准填标尺；与现状同值跳过（零副作用）
    if (storedValue !== newBaseline[key]) writes.push({ key, value: newBaseline[key] });
  }
  return writes;
}

/**
 * E5.8#88：主题/混搭基准 token——当前活动配方/配色按域合并，**无外观覆盖**（14-档案 #88 策略 A）。
 * recipe 模式 = mergeDomains 无 overrides（主题原生 appearance + 配色）；mix 模式 = mergeMixDomains 无 overrides
 * （各域来源生效——重播种/徽标基准须「无覆盖时主题给什么」，不能读 getEffectiveTokens（含覆盖，被污染））。
 * 无活动配方 → {}（startup 早期 app.theme onApply 无前主题 → 调用方自然降级为全保留）。
 * 消费方：切主题重播种（startup app.theme onApply）+ getBaselineSeeds API（设置页已修改徽标基准）。
 */
export function getThemeBaseTokens(): Record<string, string> {
  const active = getActiveRecipe();
  if (!active) return {};
  const recipe = ThemeRegistry.getRecipe(active.recipeId);
  if (!recipe) return {};
  const colorway = resolveColorway(recipe, active.colorwayId || undefined);
  // E5.8#90：外观模型合并——app.mixMode 删，外观主开关 appearanceMode=custom 即「按域混搭」。
  if (getConfigurationValue<string>("app.appearanceMode") === "custom") {
    return mergeMixDomains(recipe, colorway, getMixProfile(), {});
  }
  return mergeDomains(recipe, colorway.id, {});
}

/** E5.8 Phase 11.16：玻璃系统标尺化——表面合成规格（apply 层在 applyOverrides 后消费）。
 *  active = 任一玻璃键（blur/opacity/tint/saturate）被显式配置（presence 门控，同 #56）——玻璃激活。
 *  alpha = 表面合成不透明度（0 全透见背景 / 1 主题原生）：显式写了 opacity 用其值；
 *  激活但没动 opacity → 系统默认 GLASS_SURFACE_DEFAULT_ALPHA（0.5，拍板——保证全不透明主题
 *  只拖 blur 也立刻见玻璃）。未激活 → active=false（表面零变化回主题原生，alpha 惰性无消费）。 */
export interface GlassSurfaceSpec {
  active: boolean;
  alpha: number;
}
export function getGlassSurfaceSpec(): GlassSurfaceSpec {
  const active =
    hasConfigurationValue("app.glassBlur") ||
    hasConfigurationValue("app.glassOpacity") ||
    hasConfigurationValue("app.glassTint") ||
    hasConfigurationValue("app.glassSaturate");
  const opacity = getConfigurationValue<number>("app.glassOpacity");
  const alpha =
    hasConfigurationValue("app.glassOpacity") && opacity != null
      ? Number(opacity)
      : GLASS_SURFACE_DEFAULT_ALPHA;
  return { active, alpha };
}

/** 读用户外观配置 → 覆盖集（glass/bg 仅偏离 neutral 时；radius/zone presence 门控写绝对 px——applyOverrides 内换算）。
 *  E5.8#85：圆角不再「恒写」——presence 门控（同 glass #56）：配置被显式写过即覆盖，reset 摘除 key → 回主题基线。 */
export function getAppearanceOverrides(): Record<string, string> {
  const overrides: Record<string, string> = {};

  // E5.8#56（审计#2）：glass 两键 neutral 判定改 presence 语义——glassBlur=0（关闭）/ glassOpacity=1（不透明）
  // 是端点值也是 neutral 默认，值对比会把「用户显式拖到端点」误判为未覆盖 → 模糊关不掉/变不了不透明。
  // 改：配置被显式写过（hasConfigurationValue）即覆盖，端点值=显式意图照常生效；reset 摘除 key → 回主题基线。
  const blur = getConfigurationValue<number>("app.glassBlur");
  if (hasConfigurationValue("app.glassBlur") && blur != null) overrides["glass-blur"] = `${Number(blur)}px`;

  const opacity = getConfigurationValue<number>("app.glassOpacity");
  if (hasConfigurationValue("app.glassOpacity") && opacity != null) overrides["glass-opacity"] = String(opacity);

  const tint = getConfigurationValue<string>("app.glassTint");
  if (tint != null && String(tint).trim() !== "") overrides["glass-tint"] = String(tint).trim();

  // E5.8#96：玻璃饱和度——app.glassSaturate 显式写过即覆盖 --glass-saturate（1 = neutral 原图 / 0 去饱和 / 2 加倍）。
  // presence 门控（同 glass 两键 #56）：端点 1 = neutral 也是默认，值对比会把「显式拖到 neutral」误判为未覆盖。
  const saturate = getConfigurationValue<number>("app.glassSaturate");
  if (hasConfigurationValue("app.glassSaturate") && saturate != null) overrides["glass-saturate"] = String(saturate);

  const bgImage = getConfigurationValue<string>("app.backgroundImage");
  if (bgImage != null && String(bgImage).trim() !== "") {
    const trimmed = String(bgImage).trim();
    if (trimmed === CONFIG_NONE_SENTINEL) {
      // E5.8#87：显式「无背景」——真无图（盖掉主题 --bg-image，含 mix 来源/全景模式），CSS none
      overrides["bg-image"] = "none";
    } else {
      // E5.8#64：配置值 → 沙箱可加载 URL——受控协议 URL（linkdesk-userdata://…）原样 / 旧版 plain 绝对路径
      // 映射受控协议 / 主题资产（linkdesk:// 相对）原样。file:// 绝对路径会被 Chromium 拦截（实机 bug 13）。
      const resolved = resolveBackgroundImageUrl(trimmed);
      if (resolved) overrides["bg-image"] = `url("${resolved}")`;
    }
  }

  // E5.8#94：背景图不透明度/遮罩明暗——app.backgroundOpacity（0 全透 / 1 原图）/ app.backgroundMask（0 无遮罩 / 1 全黑）。
  // presence 门控：显式写过即覆盖（默认 1 / 0 = neutral 也是端点，值对比会误判「显式拖到 neutral」为未覆盖）。
  const bgOpacity = getConfigurationValue<number>("app.backgroundOpacity");
  if (hasConfigurationValue("app.backgroundOpacity") && bgOpacity != null) overrides["bg-opacity"] = String(bgOpacity);
  const bgMask = getConfigurationValue<number>("app.backgroundMask");
  if (hasConfigurationValue("app.backgroundMask") && bgMask != null) overrides["bg-mask"] = String(bgMask);

  // E5.8#81：zone 表面背景覆盖入口——写 --surface-bg-image（与全窗 --bg-image 并存非互斥：全窗垫底、
  // zone 浮 surface 表面，缝隙/透明处露全窗 = 预期，痛点 12 双背景语义）。surface-bg-zones=1 触发
  // 池侧量测 zone 坐标（preload-pool/surface-zones，同主题 background.mode:zones 机制）——用户图浮各 zone
  // 表面；no-repeat 对齐 zones 切片语义。清空 → 不写任何键 → 回主题自带 zones 纹理/无 zone 图。
  const zoneBgImage = getConfigurationValue<string>("app.zoneBackgroundImage");
  if (zoneBgImage != null && String(zoneBgImage).trim() !== "") {
    const trimmedZone = String(zoneBgImage).trim();
    if (trimmedZone === CONFIG_NONE_SENTINEL) {
      // E5.8#87：显式「无分区背景」——真无 zone 图（盖掉主题 zones 纹理/mix 来源切片）
      overrides["surface-bg-image"] = "none";
    } else {
      const resolvedZone = resolveBackgroundImageUrl(trimmedZone);
      if (resolvedZone) {
        overrides["surface-bg-image"] = `url("${resolvedZone}")`;
        overrides["surface-bg-repeat"] = "no-repeat";
        overrides["surface-bg-zones"] = "1";
      }
    }
  }

  // E5.8#50.19：app.fontFamily 用户级字体覆盖——族名写 --font-ui（空 = 不覆盖，跟随主题）
  // E5.8#87：显式「系统字体」（__none__）= 绝对系统默认栈（不跟随主题字体资产），写 :root 同款默认
  const fontFamily = getConfigurationValue<string>("app.fontFamily");
  if (fontFamily != null && String(fontFamily).trim() !== "") {
    const trimmedFont = String(fontFamily).trim();
    overrides["font-ui"] = trimmedFont === CONFIG_NONE_SENTINEL ? SYSTEM_FONT_STACK : trimmedFont;
  }

  // E5.8#95：等宽字体槽——app.fontFamilyMono 覆盖 --font-mono（空 = 不覆盖跟随主题；__none__ = 系统等宽栈）。
  const monoFamily = getConfigurationValue<string>("app.fontFamilyMono");
  if (monoFamily != null && String(monoFamily).trim() !== "") {
    const trimmedMono = String(monoFamily).trim();
    overrides["font-mono"] = trimmedMono === CONFIG_NONE_SENTINEL ? SYSTEM_MONO_FONT_STACK : trimmedMono;
  }

  // E5.8#85：圆角绝对化——app.surfaceRadius = 组件圆角 md 档绝对 px 0→32。presence 门控（同 glass #56）：
  // 配置被显式写过即覆盖（端点 0 = 方角意图照常）；reset 摘除 key → 回主题基线。无「恒写」——不写即主题。
  const radiusAbs = getConfigurationValue<number>("app.surfaceRadius");
  if (hasConfigurationValue("app.surfaceRadius") && radiusAbs != null) {
    const absPx = clampRadiusPx(Number(radiusAbs));
    for (const key of RADIUS_SCALE_KEYS) overrides[key] = String(absPx);
  }

  // E5.8#85：zone 圆角绝对化——app.zoneRadiusScale = 分区圆角绝对 px 0→32（presence 门控）。
  // 开关 off = 强制 0px 直角（短路值 "0px"，applyOverrides 区分）；on = 滑杆 px 直写 surface-radius。
  const zoneRadius = getConfigurationValue<boolean>("app.zoneRadius");
  const rawZonePx = getConfigurationValue<number>("app.zoneRadiusScale");
  if (zoneRadius === false) {
    overrides["surface-radius"] = "0px";
  } else if (hasConfigurationValue("app.zoneRadiusScale") && rawZonePx != null && Number.isFinite(Number(rawZonePx))) {
    overrides["surface-radius"] = String(clampRadiusPx(Number(rawZonePx)));
  }

  // E5.8#91：文字极性槽——app.fontTone 显式选档覆盖 text-primary/secondary/muted（系统双字系标尺，
  // 非锚主题值）；跟随主题 = 不写任何键（主题 type 决定极性，colorway text-* 原样）。fontTone 独立于
  // appearanceMode（非覆盖键，不随 custom 播种/复位）——显式选档切主题自动保留。
  // 覆盖后置：applyOverrides ② 通道绝对写——recipe 与 mix 路径都读本函数（applyRecipe 传入），显式档压过 mix colors 来源。
  const fontTone = getConfigurationValue<string>("app.fontTone");
  if (fontTone === "light") {
    overrides["text-primary"] = FONT_TONE_LIGHT_TEXT[0];
    overrides["text-secondary"] = FONT_TONE_LIGHT_TEXT[1];
    overrides["text-muted"] = FONT_TONE_LIGHT_TEXT[2];
  } else if (fontTone === "dark") {
    overrides["text-primary"] = FONT_TONE_DARK_TEXT[0];
    overrides["text-secondary"] = FONT_TONE_DARK_TEXT[1];
    overrides["text-muted"] = FONT_TONE_DARK_TEXT[2];
  }

  return overrides;
}
