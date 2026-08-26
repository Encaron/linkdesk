/**
 * token 计算与提交——变量零值化 / 生效变量全集 / 写 :root + 广播单一写入点 / 覆盖集应用（radius 绝对化 + 缝法则）。
 * 依赖：constants（标尺/零值/混搭域表）+ state（最近提交键集）。纯函数只算不改；commitTokens 是唯一写 :root 点。
 */

import { CoreEvents } from "../../../react/events/CoreEvents";
// E5.8#50.15：质感类型下沉 core/types/theme.ts（05 schema 配方数据模型）
import type { ThemeSurface, ThemeBackground, ThemeDomain } from "../../../types/theme";
import type { Theme } from "./registry";
// E5.8#50.17：广播给池复刻 @font-face（池独立文档，不跨文档继承）
import type { FontFaceSpec } from "../../../types/ipc/events";
import { getLastCommittedKeys, setLastCommittedKeys } from "./state";
import {
  SURFACE_ZERO, BACKGROUND_ZERO, RADIUS_SCALE_KEYS, clampRadiusPx,
  MANAGED_TOKEN_KEYS, SURFACE_SEAM_INSET_PX, SURFACE_COLOR_KEYS,
} from "./constants";
// E5.8 Phase 11.16：表面合成规格类型——type-only 引用（seeds 生产 getGlassSurfaceSpec，合成在 apply 层消费；
//  erasure 后无运行时依赖，seeds⇄apply 循环仍由 state 破）
import type { GlassSurfaceSpec } from "./seeds";

/** E5.8#104：配方圆角域 flatten——主题配方 appearance.radius → radius-* token，绝对 px 统一 clamp 进标尺
 *  [0,32]（radius-full 相对几何 50% 排除，壳管理）。recipe.ts flattenAppearance（单配方）与 mix.ts
 *  domainTokens case "radius"（混搭）两路径共用——根治「全胶囊主题圆角可设极大」：配方→token 路径曾绕过
 *  clampRadiusPx（#85 只 clamp 覆盖路径，用户审计#2 恢复 followTheme 999px 原样 = 回归），999px 原样进 CSS。
 *  纯函数只算不改。 */
export function flattenRadiusTokens<K extends string>(
  radius: Partial<Record<K, number>> | undefined,
  tokens: Record<string, string>
): void {
  if (!radius) return;
  for (const [key, value] of Object.entries(radius)) {
    if (value != null && Number.isFinite(Number(value)) && key !== "full") {
      tokens[`radius-${key}`] = `${clampRadiusPx(Number(value))}px`;
    }
  }
}

/** 玻璃 + 悬浮面板 + per-surface 纹理变量——缺省 = 零值 */
export function surfaceVariables(surface?: ThemeSurface): Record<string, string> {
  const vars: Record<string, string> = { ...SURFACE_ZERO };
  if (!surface) return vars;
  // E5.8#50.28：纹理与 glass 正交——⑬ 纸纹分区不带玻璃也能用 per-surface 平铺纹理
  if (surface.texture != null && surface.texture !== "") {
    // 已 url() 包裹则原样写；否则包裹（background-image 需 url()）
    vars["surface-bg-image"] = /^url\(/i.test(surface.texture.trim()) ? surface.texture : `url("${surface.texture}")`;
    vars["surface-bg-repeat"] = "repeat";
    if (surface.textureOpacity != null) vars["surface-bg-opacity"] = String(surface.textureOpacity);
  }
  // 悬浮面板形态（radius/shadow）——与 glass 材质正交：⑬⑭ 分区主题无玻璃也要圆角（接缝露底色）。
  //   inset 不再由主题数据决定——缝=宿主所有（Content vs Space Ownership），applyOverrides 缝法则统一派生
  // E5.8#104：surface.radius 绝对 px 同 clamp 进标尺 [0,32]——主题配方 surface-radius 不可超系统标尺
  if (surface.radius != null) vars["surface-radius"] = `${clampRadiusPx(surface.radius)}px`;
  // 投影浮起 → 映射六域悬浮 token（JS 不硬编码 shadow 值——#50.14 已 token 化）
  if (surface.shadow === true) vars["surface-shadow"] = "var(--shadow-lift)";

  if (surface.type !== "glass") return vars;
  if (surface.blur != null) vars["glass-blur"] = `${surface.blur}px`;
  if (surface.saturate != null) vars["glass-saturate"] = String(surface.saturate);
  if (surface.tint != null) vars["glass-tint"] = surface.tint;
  if (surface.opacity != null) vars["glass-opacity"] = String(surface.opacity);
  if (surface.specular != null) vars["glass-specular"] = String(surface.specular);
  // E5.8#63：高光基色 token——发丝光边颜色（缺省白）；alpha 仍走 glass-specular（消费侧 color-mix 组合）
  if (surface.specularColor != null) vars["glass-specular-color"] = surface.specularColor;
  if (surface.morph != null) vars["glass-morph"] = `${surface.morph}ms`;
  return vars;
}

/** 图片背景变量——缺省 = 零值（panorama = 现全窗语义；zones = 切片挂 zone 表面） */
export function backgroundVariables(background?: ThemeBackground): Record<string, string> {
  const vars: Record<string, string> = { ...BACKGROUND_ZERO };
  if (!background) return vars;
  const mode = background.mode ?? "panorama";
  if (background.image != null && background.image !== "") {
    // 已 url() 包裹则原样写；否则包裹（background-image 需 url()）
    const url = /^url\(/i.test(background.image.trim()) ? background.image : `url("${background.image}")`;
    if (mode === "zones") {
      // ⑭ 影像分区：图不铺全窗（BackgroundLayer 留 none，缝露底座色）——挂 5 zone 表面做切片；
      // 尺寸/每 zone 负偏移由池侧按自身窗口量测注入（多窗各自尺寸，见 preload-pool/surface-zones）
      vars["surface-bg-image"] = url;
      vars["surface-bg-repeat"] = "no-repeat";
      vars["surface-bg-zones"] = "1";
      if (background.opacity != null) vars["surface-bg-opacity"] = String(background.opacity);
    } else {
      // 全景模式：全窗底图（BackgroundLayer 清晰底，缝露图）+ 镜像切片挂主表面。
      // E5.8#102 根因：主表面 ::before 的 backdrop-filter 采不到兄弟 .background-layer
      // （pool-root 合成边界），只能采自身 ::after——镜像让 glassBlur 重新控制主表面磨砂。
      // 独立标记 --surface-bg-mirror（不借 zones 标记——zones===1 被 deriveAppearanceSeeds
      // 反推 zoneBackgroundImage，混用会把全景误报成用户分区图）；量测通道与 zones 共用。
      vars["bg-image"] = url;
      vars["surface-bg-image"] = url;
      vars["surface-bg-repeat"] = "no-repeat";
      vars["surface-bg-mirror"] = "1";
      if (background.opacity != null) vars["surface-bg-opacity"] = String(background.opacity);
    }
  }
  if (background.opacity != null && mode !== "zones") vars["bg-opacity"] = String(background.opacity);
  if (background.mask != null && mode !== "zones") vars["bg-mask"] = String(background.mask);
  // E5.8#63：遮罩基色 token——暗化层颜色（缺省黑）；alpha 仍走 bg-mask（消费侧 color-mix 组合）。同 mask 只 panorama 生效
  if (background.maskColor != null && mode !== "zones") vars["bg-mask-color"] = background.maskColor;
  return vars;
}

/**
 * E5.8#50.6：计算生效 CSS 变量全集（键不带 `--` 前缀——与广播/池侧 `--${k}` 注入惯例一致）。
 * colors + 玻璃 + 背景 + 悬浮——缺省域/键 = 默认零值（无玻璃无图无悬浮）→ 现有主题零变化。
 * 写入 :root 与广播共用此函数——同一变量集，幂等。
 */
export function getThemeVariables(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme.colors)) {
    vars[key] = value;
  }
  Object.assign(vars, surfaceVariables(theme.surface));
  Object.assign(vars, backgroundVariables(theme.background));
  return vars;
}

/* ── E5.8#50.16：写 :root + 广播单一写入点（applyTheme/applyRecipe 共用） ── */

/**
 * 提交生效 token 集到 :root + 广播 theme:changed + 事件。
 * 陈旧 token 清理：上一次 commit 写过、本次没写的键 removeProperty——换配方/换 flat 主题无残留。
 * （accent 三键经 applyAccentColor 单独写，不在提交集内，不受清理影响。）
 */
export function commitTokens(
  variables: Record<string, string>,
  themeType: "light" | "dark",
  state: { recipeId: string; colorwayId?: string; domains?: ThemeDomain[] },
  fontFaces?: FontFaceSpec[]
): void {
  // E3f #51：先发 IPC 通知主进程——和 CSS 渲染并行，标题栏不落后
  const linkdesk = window.linkdesk;
  linkdesk?.events?.notifyTheme?.(themeType === "dark");

  const root = document.documentElement;
  // E2c #19h A1：清上一次提交的陈旧键——防止换配方残留
  const lastCommittedKeys = getLastCommittedKeys();
  if (lastCommittedKeys) {
    for (const key of lastCommittedKeys) {
      if (!(key in variables)) root.style.removeProperty(`--${key}`);
    }
  }
  for (const [key, value] of Object.entries(variables)) {
    root.style.setProperty(`--${key}`, value);
  }
  setLastCommittedKeys(Object.keys(variables));
  root.setAttribute("data-theme", themeType);

  // E3b #35：广播 CSS 变量到所有插件 WebView——跨进程主题同步
  // E5.8#50.17：fontFaces 随载荷带给池——池侧复刻 @font-face（独立文档，壳注册的不生效）
  // E5.8#50.18：recipeId/colorwayId/domains 随载荷——recipe 态提交（domains 恒非空）带；flat applyTheme（无 domains）缺省
  // E5.8#84：广播载荷剔除 accent 三键——accent 唯一来源 = accent:changed（applyAccentColor）。
  //   壳侧 :root 全量写（含 accent）与 applyAccentColor 在同一同步任务 → 无跨帧机会；
  //   池侧两条独立 IPC 各占一任务 → 若 theme:changed 也带 recipe accent，--accent 与 accent:changed
  //   跨帧落地振荡（recipe↔custom）→ .toggle.on 的 transition: background 150ms 反复重启 = 开关闪。
  //   剔除后池侧 --accent 只经 accent:changed 单源写入，振荡根治。
  if (linkdesk?.bridge?.broadcast) {
    const broadcastVars: Record<string, string> = {};
    for (const [k, v] of Object.entries(variables)) {
      if (k === "accent" || k === "accent-hover" || k === "accent-light") continue;
      broadcastVars[k] = v;
    }
    linkdesk.bridge.broadcast("theme:changed", {
      themeId: state.recipeId,
      themeType,
      variables: broadcastVars,
      ...(fontFaces?.length ? { fontFaces } : {}),
      ...(state.domains?.length
        ? { recipeId: state.recipeId, colorwayId: state.colorwayId ?? "", domains: state.domains }
        : {}),
    });
  }

  // E2c #19h A5：通知所有订阅者——多 WebView 跨进程主题同步 + UI 联动
  CoreEvents.onDidChangeTheme.fire({ theme: state.recipeId });
}

/** 当前生效 token 集（合并后，含 :root 壳默认继承）——appearanceMode→custom 播种、混搭预览（06 §2）。
 *  来源 = getComputedStyle 解析：① 最近提交的合并集（appearance + colorway 颜色 + overrides）② 引擎管理 token 全集（壳默认零值）。
 *  权威在引擎（多窗一致，对标 #54 计数权威上移教训），非某窗 DOM 快照。 */
export function getEffectiveTokens(): Record<string, string> {
  const tokens: Record<string, string> = {};
  const cs = getComputedStyle(document.documentElement);
  const keys = new Set<string>([...MANAGED_TOKEN_KEYS, ...(getLastCommittedKeys() ?? [])]);
  for (const key of keys) {
    const value = cs.getPropertyValue(`--${key}`).trim();
    if (value) tokens[key] = value;
  }
  return tokens;
}

/* ── E5.8#50.10：用户外观配置覆盖主题基线（对标 accent 覆盖 theme accent 同款）。
   neutral 默认值 = 不覆盖：glassBlur 0 / glassOpacity 1 / glassTint 空 / backgroundImage 空——
   偏离默认 → 覆盖；改回默认 → 还原主题基线（玻璃主题零影响）。
   surfaceRadius 恒写——不写会残留上一次缩放值（scale 1 = 写基准，幂等清残留）。
   单一写入点：applyTheme 末尾 getAppearanceOverrides() 合并进 variables → 一次写 :root + 一次广播。 */

/** 读静态 :root 壳默认（index.css）——非 getComputedStyle（会吞主题写入的 radius，基址被污染）。
 *  扫所有样式表里 :root 规则的 --* 自定义属性；跨域/受限 sheet 跳过；jsdom 无样式表 → 空 map。 */
function readCssRootDefaults(): Record<string, string> {
  const map: Record<string, string> = {};
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList | null = null;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // 跨域样式表读不到——跳过
      }
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        if (
          rule instanceof CSSStyleRule &&
          rule.selectorText &&
          rule.selectorText.replace(/\s/g, "").includes(":root")
        ) {
          for (const prop of Array.from(rule.style)) {
            if (prop.startsWith("--")) map[prop] = rule.style.getPropertyValue(prop).trim();
          }
        }
      }
    }
  } catch {
    // 任何 DOM 异常 → 空 map（调用方回退 0px）
  }
  return map;
}

/** 六档 radius token 基准——读静态 :root 壳默认（与主题写入隔离），模块缓存防复合缩放。
 *  E5.8#50.19：export——appearanceMode→custom 播种反推 scale 系数（当前 radius-md ÷ 主题原值）消费。 */
let _baseRadius: Record<string, string> | null = null;
export function getBaseRadius(): Record<string, string> {
  if (_baseRadius) return _baseRadius;
  const defaults = readCssRootDefaults();
  const base: Record<string, string> = {};
  for (const key of RADIUS_SCALE_KEYS) {
    base[key] = defaults[`--${key}`] ?? "0px";
  }
  _baseRadius = base;
  return base;
}

/**
 * E5.8#85：圆角绝对化——app.surfaceRadius = 组件圆角「md 档」绝对 px → --radius-xs~2xl 六档。
 * 语义：滑杆值 = 系统标尺上标准组件圆角 px（0 方角 / 32 最圆润，RADIUS_MAX_PX 标尺）；其余档按当前主题
 * tier 相对 md 的比例换算（保主题层级性格 + 播种视觉不变），统一 clamp 进 [0,32]。
 * 主题 md ≤ 0（直角主题无层级）→ 六档等值滑杆值。tokens 传入 → 比例基准取主题现值；键缺省 → :root 壳默认。
 * 形态值（--radius-pill/--radius-full）排除不缩放（08 §3）。纯函数只算不改。消费侧 clamp（#56 延续）——
 * 越界直写钳到标尺域。
 */
export function applyRadiusAbsolute(absPx: number, tokens?: Record<string, string>): Record<string, string> {
  const s = clampRadiusPx(absPx);
  const base = getBaseRadius();
  const md = parseFloat(tokens?.["radius-md"]?.trim() || base["radius-md"] || "0");
  const vars: Record<string, string> = {};
  for (const key of RADIUS_SCALE_KEYS) {
    const current = tokens?.[key];
    const source = current !== undefined && current.trim() !== "" ? current : (base[key] ?? "0px");
    const px = parseFloat(source);
    const ratio = md > 0 && Number.isFinite(px) ? px / md : 1; // 直角/无层级主题 → 等值
    vars[key] = `${clampRadiusPx(ratio * s)}px`;
  }
  return vars;
}

/**
 * 应用覆盖集到生效 token 集——radius scale 系数 JS 乘算（对主题现值/壳默认，恒写六档清残留）；
 * 绝对 token 直接覆盖（glass-* / bg-* / font-* 等）。纯函数只算不改。05 §4 第 ④ 步。
 */
export function applyOverrides(
  tokens: Record<string, string>,
  overrides: Record<string, string | number>
): Record<string, string> {
  // ① E5.8#85：组件圆角绝对 px——overrides 携带 radius-* 六键（getAppearanceOverrides presence 门控写 md 档 absPx）
  //   applyRadiusAbsolute 对当前主题 tier 按比例换算全六档并 clamp 进 [0,32]。
  let radiusAbs: number | null = null;
  for (const [token, value] of Object.entries(overrides)) {
    if ((RADIUS_SCALE_KEYS as readonly string[]).includes(token)) {
      const n = Number(value);
      if (Number.isFinite(n)) radiusAbs = n;
      else tokens[token] = String(value); // 已是 px 的 radius 覆盖（防御）→ 绝对写
    }
  }
  if (radiusAbs != null) Object.assign(tokens, applyRadiusAbsolute(radiusAbs, tokens));
  // ①b E5.8#85：zone 圆角绝对 px——app.zoneRadiusScale = 分区圆角 px（"0px" = 开关关强制直角短路）；
  //   直写当前 surface-radius token（绝对，不乘主题基准——根治直角主题 0px 死区 A1）。
  const zoneRadiusVal = overrides["surface-radius"];
  if (zoneRadiusVal !== undefined) {
    if (zoneRadiusVal === "0px") {
      tokens["surface-radius"] = "0px";
    } else {
      const zonePx = Number(zoneRadiusVal);
      if (Number.isFinite(zonePx)) tokens["surface-radius"] = `${clampRadiusPx(zonePx)}px`;
    }
  }
  // ①c E5.8 用户审计 #2：radius-pill 形态值 = 滑杆值（clamp 标尺）——用户圆角覆盖生效时胶囊/旋钮随滑杆
  //   （滑杆 0 → 0px 方块胶囊 + 方块旋钮；≥10 → 浏览器 clamp 半边长天然成胶囊）；
  //   followTheme（radiusAbs==null）pill 保持主题原样（默认 999px 胶囊）；本键恒绝对 px，% 分支为 radius-full 语义不涉。
  if (radiusAbs != null) {
    tokens["radius-pill"] = `${clampRadiusPx(radiusAbs)}px`;
  }
  // ② 绝对 token 覆盖
  for (const [token, value] of Object.entries(overrides)) {
    if ((RADIUS_SCALE_KEYS as readonly string[]).includes(token)) continue;
    if (token === "surface-radius") continue; // ①b 已处理，② 不落绝对
    tokens[token] = String(value);
  }
  // ③ 缝法则（E5.8 缝系统）：--surface-inset 由圆角派生——宿主所有、所有主题统一、与 app.zoneRadius 开关耦合。
  //   直角（surface-radius = 0px/缺省）→ 贴死 0px；圆角开 → 每格半缝（相邻格 = 2× 半缝 = 4px 内部缝）。
  //   放在 ② 之后 = 最终值赢（主题/overrides 任何旧 inset 数据都无条件覆盖，主题 inset 已废弃）。
  tokens["surface-inset"] =
    (tokens["surface-radius"] ?? "0px") === "0px" ? "0px" : `${SURFACE_SEAM_INSET_PX}px`;
  return tokens;
}

/* ── E5.8 Phase 11.16：玻璃系统标尺化——表面合成（applyOverrides 之后、commitTokens 之前调用） ── */

/**
 * 合成玻璃表面——玻璃激活时把表面配色键变半透明（玻璃 = 系统表面层，非主题材质域）：
 * 对 tokens 里存在的每个 SURFACE_COLOR_KEYS 键：
 *   恒写 <key>-solid = 原值（合成引用源 + 主题素材存档）；
 *   激活 → <key> = color-mix(in srgb, var(--<key>-solid) calc(var(--glass-surface-alpha)*100%), transparent)
 *     ——预乘插值只缩 alpha 不漂 RGB（rgba(11,16,32,.55) 50% transparent → rgba(11,16,32,.275)），
 *     库内先例 index.css --glass-specular-line；Electron/Chromium 支持 var()/calc() 进 color-mix 百分比。
 *   未激活 → <key> 原值（零变化回主题原生）。
 * 写 glass-surface-alpha = spec.alpha（激活时 color-mix 引用源；未激活惰性无消费）。
 * 只合成 tokens 里存在的键——主题没写的表面色 = CSS :root 壳默认，不碰。
 * 调用点：applyTheme/applyRecipe 在 applyOverrides 之后、commitTokens 之前（绝不放
 * mergeDomains/applyOverrides/mergeMixDomains 内部——getThemeBaseTokens「无覆盖纯基线」
 * 语义，放进去污染基线）。纯函数只算不改。
 */
export function synthesizeGlassSurfaces(tokens: Record<string, string>, spec: GlassSurfaceSpec): void {
  for (const key of SURFACE_COLOR_KEYS) {
    const value = tokens[key];
    if (value == null || value.trim() === "") continue;
    tokens[`${key}-solid`] = value;
    if (spec.active) {
      tokens[key] = `color-mix(in srgb, var(--${key}-solid) calc(var(--glass-surface-alpha) * 100%), transparent)`;
    }
  }
  tokens["glass-surface-alpha"] = String(spec.alpha);
}

/**
 * E5.8#105：panorama 镜像可见门控——--surface-bg-mirror 标记的全景镜像只在玻璃磨砂激活（blur>0）时可见。
 * 根因（用户「整窗主视觉的图给前景也上图」）：镜像 ::after 是 ::before 磨砂的采样源，但 blur=0 时
 * backdrop-filter 恒等 → 未磨砂的镜像原图直显在表面（前景也有图，回归 #102 前「后景有图、前景无图」）。
 * blur>0 → 镜像透明度 = 主题 surface-bg-opacity（供采样磨砂，表面玻璃显形）；blur=0 → 0（表面回
 * 主题半透明底，背景图层照片透出 = #102 前行为）。zones 切片（surface-bg-zones=1）/ 纹理（repeat）
 * 不经 mirror 标记 → 不受影响恒显。CSS 消费：surface ::after opacity 读本 token（缺省回 surface-bg-opacity）。
 * 调用点：applyTheme/applyRecipe 合成后、commitTokens 前（同 synthesizeGlassSurfaces）。纯函数只算不改。
 */
export function gateMirrorVisibility(tokens: Record<string, string>): void {
  if (tokens["surface-bg-mirror"] !== "1") return;
  const blur = parseFloat(tokens["glass-blur"] ?? "0") || 0;
  tokens["surface-bg-mirror-opacity"] = blur > 0 ? (tokens["surface-bg-opacity"] ?? "1") : "0";
}
