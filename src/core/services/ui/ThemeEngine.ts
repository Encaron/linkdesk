/**
 * 主题引擎——读 JSON 主题文件 → 写 CSS 变量。
 * JSON 是源，CSS 变量是渲染层。用户和 AI 都改 JSON。
 */

import { CoreEvents } from "../../react/events/CoreEvents";
import { trackRegistration } from "../../registry/registrationTracker"; // E5.8#10：register 返 disposer——卸载自动逆序回滚
// E5.8#64：受控背景图 URL 解析——配置值 → 沙箱可加载协议 URL（file:// 绝对路径被拦截）
import { resolveBackgroundImageUrl } from "../../utils/path/userDataImagePath";
// E5.8#50.15：质感类型下沉 core/types/theme.ts（05 schema 配方数据模型）——此处重导出兼容既有消费方
import type { ThemeColors, ThemeSurface, ThemeBackground } from "../../types/theme";
export type { ThemeColors, ThemeSurface, ThemeBackground } from "../../types/theme";
// E5.8#50.16：Recipe + Colorway 合并算法（05 §4 继承链）——ThemeRecipe/ThemeAppearance/ThemeColorway
import type { ThemeRecipe, ThemeAppearance, ThemeColorway, ThemeDomain } from "../../types/theme";
// E5.8#50.17：资产字体两步机制——相对路径 → getPluginAssetPath 解析 linkdesk://（硬约束 12 同族）→ @font-face → 族名
import { getPluginAssetPath } from "../../utils/path/pluginAssetPath";
import { ThemeRegistry } from "../../registry/appearance/ThemeRegistry"; // getRecipeOwner——资产路径归属插件域
import type { FontFaceSpec } from "../../types/ipc/events"; // 广播给池复刻 @font-face（池独立文档，不跨文档继承）

export interface Theme {
  name: string;
  type: "dark" | "light";
  colors: ThemeColors;
  /** 玻璃/悬浮质感（缺省 = 无玻璃无悬浮，现有主题零变化） */
  surface?: ThemeSurface;
  /** 图片背景（缺省 = 无图，现有主题零变化） */
  background?: ThemeBackground;
  /** 提供方插件 ID——单真源：ThemeRegistry.get() fallback 通过此字段找到归属 */
  pluginId?: string;
}

let currentTheme: Theme | null = null;

/* ── E5.8#50.16：Recipe 应用态（applyRecipe 更新；flat applyTheme 清空） ── */
let currentRecipeId: string | null = null;
let currentColorwayId: string | null = null;
/** 最近一次 commit 写过的键集——下一次 commit 清陈旧 token（换配方无残留） */
let _lastCommittedKeys: string[] | null = null;

/** 插件注册的主题——name → Theme */
const pluginThemes = new Map<string, Theme>();

/** 插件 → 主题名列表——卸载时批量清理 */
const _pluginThemeNames = new Map<string, string[]>();

/**
 * Phase 4：注册插件提供的主题。
 * 插件加载器扫描到 type: "theme" 插件后调用此函数。
 * 注册后的主题和内置主题在同一个列表中，不区分来源。
 */
export function registerTheme(theme: Theme, pluginId?: string): () => void {
  // 覆盖 fallback 主题（无 pluginId）不告警——插件主题上位是预期行为
  if (pluginThemes.has(theme.name)) {
    const existing = pluginThemes.get(theme.name)!;
    if (existing.pluginId) {
      console.warn(`[ThemeEngine] 主题 "${theme.name}" 重复注册——后注册者覆盖先注册者`);
    }
  }
  // 单真源：存储 pluginId 到 Theme 对象——ThemeRegistry.get() fallback 通过此字段找到归属
  if (pluginId) {
    theme.pluginId = pluginId;
  }
  pluginThemes.set(theme.name, theme);
  if (pluginId) {
    const names = _pluginThemeNames.get(pluginId) ?? [];
    if (!names.includes(theme.name)) {
      names.push(theme.name);
    }
    _pluginThemeNames.set(pluginId, names);
  }

  // E5.8#10：disposer = 删"这一条"——仅当仍是当前占位者（防删后注册者的覆盖）；
  // 无 pluginId（fallback 主题——非插件域）→ 不追踪，返裸 disposer。
  const dispose = (): void => {
    if (pluginThemes.get(theme.name) === theme) {
      pluginThemes.delete(theme.name);
    }
    if (pluginId) {
      const names = _pluginThemeNames.get(pluginId);
      if (names) {
        const kept = names.filter((n) => n !== theme.name);
        if (kept.length !== names.length) {
          if (kept.length === 0) _pluginThemeNames.delete(pluginId);
          else _pluginThemeNames.set(pluginId, kept);
        }
      }
    }
  };
  return pluginId ? trackRegistration(pluginId, dispose) : dispose;
}

/** E2c #19h A3：注销单个主题 */
export function unregisterTheme(name: string): void {
  pluginThemes.delete(name);
}

/** 获取所有已注册主题的名称（仅插件提供——主题全走 contributes.themes） */
export function getAvailableThemes(): string[] {
  return Array.from(pluginThemes.keys());
}

/** 获取指定插件注册的主题名称——插件卡片齿轮用（VS Code 同款过滤） */
export function getThemesByPlugin(pluginId: string): string[] {
  return _pluginThemeNames.get(pluginId) ?? [];
}

/** 从插件注册表加载主题——三层退路：ThemeRegistry → 找不到抛错（调用方回退到 index.css :root） */
export async function loadTheme(themeName: string): Promise<Theme> {
  const pluginTheme = pluginThemes.get(themeName);
  if (pluginTheme) return pluginTheme;
  throw new Error(`Theme "${themeName}" not found——主题未注册或已被卸载`);
}

/* ── E5.8#50.6：玻璃/背景/悬浮变量零值——主题不带 surface/background 时写入（= 无玻璃无图无悬浮 = 现状零变化） ──
   --bg-mask 默认 0（rgba 遮罩透明度，0 = 无遮罩）；--surface-shadow 默认 none（无浮起）。 */

const SURFACE_ZERO: Record<string, string> = {
  "glass-blur": "0px",
  "glass-saturate": "1",
  "glass-tint": "transparent",
  "glass-opacity": "1",
  "glass-specular": "0",
  "glass-morph": "0ms",
  "surface-radius": "0px",
  "surface-inset": "0px",
  "surface-shadow": "none",
  /* E5.8#50.28/50.29：per-surface 背景零值——纹理（repeat 平铺）/影像切片（no-repeat + 负偏移）共用。
     --surface-bg-zones: 1 标记 zones 模式（池侧 preload 按此门控量测本窗切片坐标，见 preload-pool/surface-zones） */
  "surface-bg-image": "none",
  "surface-bg-repeat": "no-repeat",
  "surface-bg-opacity": "1",
  "surface-bg-size": "auto",
  "surface-bg-zones": "0",
  "surface-titlebar-bg-position": "0 0",
  "surface-icon-bar-bg-position": "0 0",
  "surface-side-panel-bg-position": "0 0",
  "surface-main-zone-bg-position": "0 0",
  "surface-status-bar-bg-position": "0 0",
};

const BACKGROUND_ZERO: Record<string, string> = {
  "bg-image": "none",
  "bg-opacity": "1",
  "bg-mask": "0",
};

/* ── E5.8#50.16：scale 乘算 token 集 + 引擎管理 token 全集 ── */

/** 圆角 scale 乘算 token 集——六档尺寸值；--radius-pill/--radius-full 形态值排除不乘（08 §3 边界，2026-08-24 审视补） */
export const RADIUS_SCALE_KEYS = [
  "radius-xs", "radius-sm", "radius-md", "radius-lg", "radius-xl", "radius-2xl",
] as const;

/** 引擎管理的 token 键全集（去 -- 前缀）——getEffectiveTokens 读当前生效值（含壳默认继承） */
const MANAGED_TOKEN_KEYS: string[] = [
  ...Object.keys(SURFACE_ZERO),
  ...Object.keys(BACKGROUND_ZERO),
  ...RADIUS_SCALE_KEYS,
  "radius-pill", "radius-full",
  "font-ui", "font-mono",
];

/* ── E5.8#50.26：混搭域常量（10-混搭设计 §1/§3——按域换来源，引擎按域合并） ── */

/** 混搭来源「跟随主题」哨兵值——与 app.mix* 默认值对齐（10 §1/§3 定稿） */
export const MIX_FOLLOW_THEME = "followTheme";

/** 混搭域 → 来源配置 key（与 startup.ts MIX_SOURCE_KEYS 同源）——getMixProfile 读配置 */
const MIX_DOMAIN_KEYS: Record<ThemeDomain, string> = {
  colors: "app.mixColor",
  font: "app.mixFont",
  radius: "app.mixRadius",
  glass: "app.mixGlass",
  background: "app.mixBackground",
  surface: "app.mixSurface",
};

/** 混搭域应用顺序——颜色→字体→圆角→玻璃→背景→表面（10 §2 mockup 行序；碰撞后者覆盖） */
const MIX_DOMAIN_ORDER: ThemeDomain[] = ["colors", "font", "radius", "glass", "background", "surface"];

/** glass 域 token 键——surfaceVariables 产物中归玻璃域（glass-* 六键；surface-* 归表面域） */
const GLASS_TOKEN_KEYS = [
  "glass-blur", "glass-saturate", "glass-tint", "glass-opacity", "glass-specular", "glass-morph",
] as const;

/** 玻璃 + 悬浮面板 + per-surface 纹理变量——缺省 = 零值 */
function surfaceVariables(surface?: ThemeSurface): Record<string, string> {
  const vars: Record<string, string> = { ...SURFACE_ZERO };
  if (!surface) return vars;
  // E5.8#50.28：纹理与 glass 正交——⑬ 纸纹分区不带玻璃也能用 per-surface 平铺纹理
  if (surface.texture != null && surface.texture !== "") {
    // 已 url() 包裹则原样写；否则包裹（background-image 需 url()）
    vars["surface-bg-image"] = /^url\(/i.test(surface.texture.trim()) ? surface.texture : `url("${surface.texture}")`;
    vars["surface-bg-repeat"] = "repeat";
    if (surface.textureOpacity != null) vars["surface-bg-opacity"] = String(surface.textureOpacity);
  }
  // 悬浮面板形态（radius/inset/shadow）——与 glass 材质正交：⑬⑭ 分区主题无玻璃也要圆角+留缝（接缝露底色）
  if (surface.radius != null) vars["surface-radius"] = `${surface.radius}px`;
  if (surface.inset != null) vars["surface-inset"] = `${surface.inset}px`;
  // 投影浮起 → 映射六域悬浮 token（JS 不硬编码 shadow 值——#50.14 已 token 化）
  if (surface.shadow === true) vars["surface-shadow"] = "var(--shadow-lift)";

  if (surface.type !== "glass") return vars;
  if (surface.blur != null) vars["glass-blur"] = `${surface.blur}px`;
  if (surface.saturate != null) vars["glass-saturate"] = String(surface.saturate);
  if (surface.tint != null) vars["glass-tint"] = surface.tint;
  if (surface.opacity != null) vars["glass-opacity"] = String(surface.opacity);
  if (surface.specular != null) vars["glass-specular"] = String(surface.specular);
  if (surface.morph != null) vars["glass-morph"] = `${surface.morph}ms`;
  return vars;
}

/** 图片背景变量——缺省 = 零值（panorama = 现全窗语义；zones = 切片挂 zone 表面） */
function backgroundVariables(background?: ThemeBackground): Record<string, string> {
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
      vars["bg-image"] = url;
    }
  }
  if (background.opacity != null && mode !== "zones") vars["bg-opacity"] = String(background.opacity);
  if (background.mask != null && mode !== "zones") vars["bg-mask"] = String(background.mask);
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
function commitTokens(
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
  if (_lastCommittedKeys) {
    for (const key of _lastCommittedKeys) {
      if (!(key in variables)) root.style.removeProperty(`--${key}`);
    }
  }
  for (const [key, value] of Object.entries(variables)) {
    root.style.setProperty(`--${key}`, value);
  }
  _lastCommittedKeys = Object.keys(variables);
  root.setAttribute("data-theme", themeType);

  // E3b #35：广播 CSS 变量到所有插件 WebView——跨进程主题同步
  // E5.8#50.17：fontFaces 随载荷带给池——池侧复刻 @font-face（独立文档，壳注册的不生效）
  // E5.8#50.18：recipeId/colorwayId/domains 随载荷——recipe 态提交（domains 恒非空）带；flat applyTheme（无 domains）缺省
  if (linkdesk?.bridge?.broadcast) {
    linkdesk.bridge.broadcast("theme:changed", {
      themeId: state.recipeId,
      themeType,
      variables,
      ...(fontFaces?.length ? { fontFaces } : {}),
      ...(state.domains?.length
        ? { recipeId: state.recipeId, colorwayId: state.colorwayId ?? "", domains: state.domains }
        : {}),
    });
  }

  // E2c #19h A5：通知所有订阅者——多 WebView 跨进程主题同步 + UI 联动
  CoreEvents.onDidChangeTheme.fire({ theme: state.recipeId });
}

/** 应用主题（flat 桥接）：colors + 玻璃/背景/悬浮 + 用户覆盖 → 写 :root + 广播。 */
export function applyTheme(theme: Theme): void {
  // E5.8#50.6：全量写入 colors + 玻璃/背景/悬浮——玻璃变量每次都写（缺省零值），
  // 玻璃主题切回普通主题自动清零不残留；重复应用幂等。
  const variables = getThemeVariables(theme);
  // E5.8#50.10：用户外观配置覆盖主题基线（radius scale 系数 / 玻璃绝对）——
  // applyOverrides 内 JS 乘算（对主题现值/壳默认），一次写 :root + 一次广播，无双广播竞态。
  applyOverrides(variables, getAppearanceOverrides());
  commitTokens(variables, theme.type, { recipeId: theme.name });
  currentTheme = theme;
  // flat apply 清 recipe 态——两路径互斥（#50.18 IPC 接线后 flat 桥退役）
  currentRecipeId = null;
  currentColorwayId = null;
}

/* ── E5.8#50.16：Recipe 合并算法（05 §4 继承链）+ 应用入口 ── */

/** 解析配色变体——colorwayId 缺省 = 配方首个配色（单配色配方 = 恒首项）。
 *  E5.8#58（审计#6）：空 colorways 防线——空配色回退空色透明配色（不崩；注册路径 parseThemeRecipe
 *  已拒空数组，此兜底覆盖程序化 registerRecipe({colorways:[]}) 等越界入口）。 */
function resolveColorway(recipe: ThemeRecipe, colorwayId?: string): ThemeColorway {
  const found = recipe.colorways.find((c) => c.id === colorwayId);
  if (found) return found;
  if (recipe.colorways.length > 0) return recipe.colorways[0];
  return { id: "", name: "", colors: {} };
}

/** 配方贡献域——colorways 恒贡献 colors；appearance 五风格域稀疏判定（缺的域不声明）。
 *  供 listRecipes 元数据（混搭来源过滤）+ applyRecipe 广播 domains（域级细粒度刷新）共用。 */
export function recipeDomains(recipe: ThemeRecipe): ThemeDomain[] {
  const domains: ThemeDomain[] = ["colors"];
  const a = recipe.appearance;
  if (a?.radius) domains.push("radius");
  if (a?.glass) domains.push("glass");
  if (a?.font) domains.push("font");
  if (a?.background) domains.push("background");
  if (a?.surface) domains.push("surface");
  return domains;
}

/** 风格域 appearance 稀疏 flatten → token map（键去 --，引擎写入时拼回）。
 *  域顺序：radius → glass（surfaceVariables 全机制）→ font → background → surface（per-surface pass-through）；
 *  同键碰撞后者覆盖（surface 最具体排最后）。 */
function flattenAppearance(appearance: ThemeAppearance, tokens: Record<string, string>): void {
  if (appearance.radius) {
    for (const [key, value] of Object.entries(appearance.radius)) {
      if (value != null && Number.isFinite(Number(value))) tokens[`radius-${key}`] = `${value}px`;
    }
  }
  Object.assign(tokens, surfaceVariables(appearance.glass));
  if (appearance.font) {
    if (appearance.font.ui) tokens["font-ui"] = appearance.font.ui;
    if (appearance.font.mono) tokens["font-mono"] = appearance.font.mono;
  }
  Object.assign(tokens, backgroundVariables(appearance.background));
  if (appearance.surface) {
    for (const [key, value] of Object.entries(appearance.surface)) {
      if (value != null) tokens[`surface-${key}`] = String(value);
    }
  }
}

/**
 * E5.8#50.16：05 §4 合并链——稀疏继承，纯函数只算不改：
 *   :root 壳默认（缺的域/键不写 → CSS 继承）
 *   ⊕ recipe.appearance（风格域，稀疏 flatten）
 *   ⊕ 当前 colorway.colors（颜色域，稀疏覆盖）
 *   ⊕ overrides（radius scale 系数 JS 乘算 / 绝对 token 覆盖）
 * 返回生效 token 集（键不带 --）→ 写 :root + 广播共用。
 */
export function mergeDomains(
  recipe: ThemeRecipe,
  colorwayId?: string,
  overrides: Record<string, string | number> = {}
): Record<string, string> {
  const colorway = resolveColorway(recipe, colorwayId);
  const tokens: Record<string, string> = {};
  if (recipe.appearance) flattenAppearance(recipe.appearance, tokens);
  if (colorway?.colors) {
    for (const [key, value] of Object.entries(colorway.colors)) tokens[key] = value;
  }
  applyOverrides(tokens, overrides);
  return tokens;
}

/* ── E5.8#50.26：混搭合并——10 §1/§3 模型「每域各自取来源」── */

/** 混搭档案——6 域来源映射。colors = 配方 id/配色 id/followTheme（决策 B：配方+配色粒度）；
 *  其余域 = 配方 id/followTheme（配方粒度）。 */
export type MixProfile = Record<ThemeDomain, string>;

/** 读当前混搭来源配置 → 档案（mixMode=mix 时引擎消费；缺省 = 全跟随主题） */
export function getMixProfile(): MixProfile {
  const profile = {} as MixProfile;
  for (const [domain, key] of Object.entries(MIX_DOMAIN_KEYS)) {
    profile[domain as ThemeDomain] = String(getConfigurationValue<string>(key) ?? MIX_FOLLOW_THEME);
  }
  return profile;
}

/**
 * E5.8#61 审计#1：指定插件是否为当前混搭来源——任一 mix 域配置引用其配方/配色（颜色域 = 配方+配色粒度）。
 * 卸载/禁用混搭来源后需重应用当前主题——源配方已摘（含 @font-face 清理）但 :root 残留其颜色/字体变量，
 * 重应用走 #58 缺域回退兜底回主题基线（resolveDomainSource 来源缺失 → 基础配方）。
 */
export function isMixSourceOwner(pluginId: string): boolean {
  const profile = getMixProfile();
  for (const [domain, raw] of Object.entries(profile)) {
    const value = raw == null ? "" : String(raw);
    if (!value || value === MIX_FOLLOW_THEME) continue;
    let recipeId: string | undefined;
    if (domain === "colors") {
      const owner = findColorwayOwner(value);
      recipeId = owner ? owner.recipe.id : ThemeRegistry.getRecipe(value)?.id;
    } else {
      recipeId = ThemeRegistry.getRecipe(value)?.id;
    }
    if (recipeId && ThemeRegistry.getRecipeOwner(recipeId) === pluginId) return true;
  }
  return false;
}

/** 按配色 id 找归属配方——颜色域来源 = 配方+配色粒度（决策 B：可选任一配方的任一配色变体） */
function findColorwayOwner(colorwayId: string): { recipe: ThemeRecipe; colorway: ThemeColorway } | undefined {
  for (const recipe of ThemeRegistry.getRecipes()) {
    const colorway = recipe.colorways.find((c) => c.id === colorwayId);
    if (colorway) return { recipe, colorway };
  }
  return undefined;
}

/** 解析某域来源——followTheme → 当前配方；颜色域 = 配方+配色粒度，其余域 = 配方粒度。
 *  来源找不到（配方未注册/已卸载）→ 回退当前配方（followTheme 行为，域不空窗）。 */
function resolveDomainSource(
  domain: ThemeDomain,
  profile: MixProfile,
  baseRecipe: ThemeRecipe,
  baseColorway: ThemeColorway
): { recipe: ThemeRecipe; colorway?: ThemeColorway } {
  const value = profile[domain];
  if (!value || value === MIX_FOLLOW_THEME) {
    return { recipe: baseRecipe, colorway: domain === "colors" ? baseColorway : undefined };
  }
  if (domain === "colors") {
    const owner = findColorwayOwner(value);
    if (owner) return owner;
    const recipe = ThemeRegistry.getRecipe(value);
    if (recipe) return { recipe, colorway: recipe.colorways[0] };
    return { recipe: baseRecipe, colorway: baseColorway };
  }
  const recipe = ThemeRegistry.getRecipe(value);
  return recipe ? { recipe } : { recipe: baseRecipe };
}

/**
 * E5.8#59（审计#7 附注）：混搭域生效来源配方——currentTheme 快照 surface/background 取混搭各域来源。
 * 解析与 mergeMixDomains 完全一致（含 #58 缺域回退：来源配方存在但缺该域 → 基础配方该域不空窗）。
 * 原快照取基础配方 appearance.glass/background，mix 下与生效玻璃/背景来源不符——消费
 * getCurrentTheme().surface 下游（ThemeBrowser 等）拿到错数据。
 */
function resolveMixDomainRecipe(
  domain: "glass" | "background",
  profile: MixProfile,
  baseRecipe: ThemeRecipe,
  baseColorway: ThemeColorway
): ThemeRecipe {
  const source = resolveDomainSource(domain, profile, baseRecipe, baseColorway);
  if (source.recipe !== baseRecipe && !recipeDomains(source.recipe).includes(domain)) {
    return baseRecipe;
  }
  return source.recipe;
}

/** 单域 flatten——混搭按域取来源（10 §1）；缺省域/键 = 零值（surfaceVariables/backgroundVariables 内置）。
 *  域 token 归属（03 §1 表）：colors = 配色 token；font = --font-*；radius = --radius-*；
 *  glass = --glass-*；background = --bg-*（+ zones 切片挂 surface-bg-*）；surface = --surface-*（含 per-surface 透传）。 */
function domainTokens(
  appearance: ThemeAppearance | undefined,
  domain: ThemeDomain,
  colorway?: ThemeColorway
): Record<string, string> {
  const tokens: Record<string, string> = {};
  switch (domain) {
    case "colors":
      if (colorway?.colors) {
        for (const [key, value] of Object.entries(colorway.colors)) tokens[key] = value;
      }
      return tokens;
    case "radius":
      if (appearance?.radius) {
        for (const [key, value] of Object.entries(appearance.radius)) {
          if (value != null && Number.isFinite(Number(value))) tokens[`radius-${key}`] = `${value}px`;
        }
      }
      return tokens;
    case "glass": {
      const sv = surfaceVariables(appearance?.glass);
      for (const key of GLASS_TOKEN_KEYS) tokens[key] = sv[key];
      return tokens;
    }
    case "font":
      if (appearance?.font?.ui) tokens["font-ui"] = appearance.font.ui;
      if (appearance?.font?.mono) tokens["font-mono"] = appearance.font.mono;
      return tokens;
    case "background":
      // backgroundVariables 全量——bg-* + zones 模式切片（surface-bg-*，⑭ 影像分区）
      return backgroundVariables(appearance?.background);
    case "surface": {
      const sv = surfaceVariables(appearance?.glass);
      // E5.8#58（审计#1）：surface-bg-* 零值不写——zones 切片归 background 域（⑭ 影像分区）、
      // 纹理归 surface.texture 显式声明（⑬ 纸纹）。SURFACE_ZERO 的 surface-bg-* 只是「无纹理/无切片」兜底，
      // 表面域整面覆盖会吞掉 background 域 zones 切片（mix 顺序 background→surface 后覆盖）——
      // 单配方路径 flattenAppearance 是 surface 先 background 后（zones 存活），两路径不一致即此。
      const hasTexture = appearance?.surface?.texture != null && appearance.surface.texture !== "";
      for (const [key, value] of Object.entries(sv)) {
        if (key.startsWith("surface-")) {
          if (key.startsWith("surface-bg-") && !hasTexture) continue;
          tokens[key] = value;
        }
      }
      if (appearance?.surface) {
        for (const [key, value] of Object.entries(appearance.surface)) {
          if (value != null) tokens[`surface-${key}`] = String(value);
        }
      }
      return tokens;
    }
  }
}

/** 混搭字体域来源——resolveRecipeFonts 解析后的字体域来源配方（资产族名） */
interface MixFontSource {
  recipeId: string;
  appearance: ThemeAppearance | undefined;
}

/**
 * E5.8#50.26：混搭合并——10 §1/§3 模型：
 *   :root 壳默认（缺的域/键不写 → CSS 继承）
 *   ⊕ 每域各自取来源 flatten（followTheme → 当前配方；颜色域 = 配方+配色）
 *   ⊕ overrides（设置层 scale/绝对覆盖，最上层）
 * 返回生效 token 集（键不带 --）——applyRecipe mix 分支专用；单配方路径仍走 mergeDomains（零回归）。
 */
export function mergeMixDomains(
  baseRecipe: ThemeRecipe,
  baseColorway: ThemeColorway,
  profile: MixProfile,
  overrides: Record<string, string | number>,
  fontSource?: MixFontSource
): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const domain of MIX_DOMAIN_ORDER) {
    let source = resolveDomainSource(domain, profile, baseRecipe, baseColorway);
    // E5.8#58（审计#5）：来源配方存在但缺该域（appearance 稀疏，recipeDomains 不含）→ 回退基础配方该域
    // ——与来源配方缺失同语义（域不空窗整域落 :root）。colors 域恒有 colorways 不触发。
    if (source.recipe !== baseRecipe && !recipeDomains(source.recipe).includes(domain)) {
      source = { recipe: baseRecipe, colorway: domain === "colors" ? baseColorway : undefined };
    }
    // 字体域——源配方资产字体须用已解析 appearance（resolveRecipeFonts 换族名）；其余域用源配方原 appearance
    const appearance =
      domain === "font" && fontSource && source.recipe.id === fontSource.recipeId
        ? fontSource.appearance
        : source.recipe.appearance;
    Object.assign(tokens, domainTokens(appearance, domain, source.colorway));
  }
  applyOverrides(tokens, overrides);
  return tokens;
}

/** 混搭字体域来源配方——followTheme → 当前配方；否则按 app.mixFont 来源（找不到回退当前配方） */
function resolveFontSource(recipe: ThemeRecipe, profile: MixProfile): ThemeRecipe {
  if (!profile.font || profile.font === MIX_FOLLOW_THEME) return recipe;
  return ThemeRegistry.getRecipe(profile.font) ?? recipe;
}

/**
 * 应用配方——mergeDomains → 写 :root + 广播 theme:changed。
 * colorwayId 缺省 = 配方首配色；overrides 缺省 = 读用户外观配置（app.*，getAppearanceOverrides）。
 * 同步 flat 快照到 currentTheme——getCurrentTheme/强调色广播（ThemeBrowser 等 bridge 消费方）兼容。
 */
export function applyRecipe(
  recipe: ThemeRecipe,
  colorwayId?: string,
  overrides?: Record<string, string | number>
): void {
  const colorway = resolveColorway(recipe, colorwayId);
  // E5.8#50.26：mixMode=mix → 混搭合并（每域各自取来源）；否则单配方路径（零回归）。
  const isMix = getConfigurationValue<string>("app.mixMode") === "mix";
  let effective: Record<string, string>;
  let fontFaces: FontFaceSpec[];
  let domains: ThemeDomain[];
  let effectiveColors: Record<string, string> = {};

  if (isMix) {
    const profile = getMixProfile();
    // 字体域来源配方（followTheme → 当前配方）——资产字体两步解析在源配方上（#50.17）
    const fontSource = resolveFontSource(recipe, profile);
    const { appearance: fontAppearance, fontFaces: faces } = resolveRecipeFonts(fontSource);
    effective = mergeMixDomains(recipe, colorway, profile, overrides ?? getAppearanceOverrides(), {
      recipeId: fontSource.id,
      appearance: fontAppearance,
    });
    fontFaces = faces;
    // 混搭下生效集可触及全部域——广播全域（池侧按 variables 全量写入，domains 为细粒度刷新信号）
    domains = MIX_DOMAIN_ORDER;
    // currentTheme 快照用生效配色（accent 跟随主题取混搭颜色域来源的 accent，非整体配方默认）
    effectiveColors = resolveDomainSource("colors", profile, recipe, colorway).colorway?.colors ?? colorway.colors ?? {};
  } else {
    // E5.8#50.17：资产字体两步解析——appearance.font 资产相对路径 → @font-face 注册 + 换族名
    // （副作用在注册；纯合并用解析后的 appearance；fontFaces 广播给池复刻）
    const { appearance, fontFaces: faces } = resolveRecipeFonts(recipe);
    effective = mergeDomains({ ...recipe, appearance }, colorway.id, overrides ?? getAppearanceOverrides());
    fontFaces = faces;
    domains = recipeDomains(recipe);
    effectiveColors = colorway.colors ?? {};
  }

  commitTokens(
    effective,
    recipe.type,
    { recipeId: recipe.id, colorwayId: colorway.id, domains },
    fontFaces
  );
  currentRecipeId = recipe.id;
  currentColorwayId = colorway.id;
  currentTheme = {
    name: recipe.name,
    type: recipe.type,
    colors: effectiveColors,
    // E5.8#59（审计#7 附注）：mix 下 surface/background 取混搭各域生效来源配方——原取基础配方
    // appearance.glass/background 与生效玻璃/背景来源不符（resolveMixDomainRecipe 同 mergeMixDomains 含缺域回退）
    surface: isMix
      ? resolveMixDomainRecipe("glass", getMixProfile(), recipe, colorway).appearance?.glass
      : recipe.appearance?.glass,
    background: isMix
      ? resolveMixDomainRecipe("background", getMixProfile(), recipe, colorway).appearance?.background
      : recipe.appearance?.background,
  };
}

/* ── E5.8#50.17：资产字体两步机制（作者自带 woff2/ttf/otf → @font-face 注册 → 族名写 --font-*）。
   font-family 不能吃 url()——资产相对路径必须先注册 @font-face 拿族名，再写族名；系统族名直接写。 ── */

/** @font-face 会话注册表——已注册族名 → spec（广播给池复刻；重复注册幂等去重） */
const _activeFontFaces = new Map<string, FontFaceSpec>();
/** pluginId → 已注册族名（卸载清理用——移除 style + 摘会话表） */
const _pluginFontFaces = new Map<string, string[]>();

/** 判定 font 域值是否为资产路径（需两步注册）——含路径分隔符或字体扩展名 → 资产；否则 = 系统族名直接写 */
export function isAssetFontPath(value: string): boolean {
  return /[/\\]/.test(value) || /\.(woff2?|ttf|otf)$/i.test(value);
}

/** 族名标识符净化——@font-face font-family 与 --font-* 值共用的合法 ident（pluginId/文件名可含 . 等非法字符） */
function sanitizeFamilyPart(part: string): string {
  return part.replace(/[^A-Za-z0-9_-]/g, "-");
}

/** 文件名去扩展名 + 净化——族名 stem（同文件重复注册去重键） */
function extractFontStem(url: string): string {
  const base = url.split(/[/\\]/).pop() ?? "";
  return sanitizeFamilyPart(base.replace(/\.[^.]+$/, ""));
}

/** 按扩展名推断 src format 提示——未知扩展不写（浏览器自嗅探） */
function fontFormatOf(url: string): string | undefined {
  const ext = url.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
  if (ext === "woff2" || ext === "woff" || ext === "ttf" || ext === "otf") return ext;
  return undefined;
}

/** 注册 @font-face（当前文档 head）——两步机制第一链。幂等：同族名已注册 → 直接返族名不重复插 style。 */
export function ensureFontFace(url: string, pluginId: string): string {
  const family = `__ld_${sanitizeFamilyPart(pluginId)}_${extractFontStem(url)}`;
  if (_activeFontFaces.has(family)) return family;

  const format = fontFormatOf(url);
  const style = document.createElement("style");
  style.id = `ld-ff-${family}`;
  style.textContent =
    `@font-face{font-family:"${family}";src:url("${url}")` +
    `${format ? ` format("${format}")` : ""};font-display:swap}`;
  document.head.appendChild(style);

  _activeFontFaces.set(family, { family, url, format });
  const owned = _pluginFontFaces.get(pluginId) ?? [];
  if (!owned.includes(family)) owned.push(family);
  _pluginFontFaces.set(pluginId, owned);
  return family;
}

/**
 * 解析配方字体域——资产相对路径 → 注册 @font-face + 换族名；系统族名原样。
 * 副作用只在 @font-face 注册；返回：① 换好族名的 appearance（mergeDomains 纯合并消费）
 * ② 本配方涉及的 fontFaces（commitTokens 广播给池复刻——池独立文档，壳注册的不生效）。
 */
export function resolveRecipeFonts(recipe: ThemeRecipe): {
  appearance: ThemeAppearance | undefined;
  fontFaces: FontFaceSpec[];
} {
  const font = recipe.appearance?.font;
  if (!font?.ui && !font?.mono) return { appearance: recipe.appearance, fontFaces: [] };
  const pluginId = ThemeRegistry.getRecipeOwner(recipe.id);
  const resolved: { ui?: string; mono?: string } = {};
  const fontFaces: FontFaceSpec[] = [];
  const seen = new Set<string>();
  for (const key of ["ui", "mono"] as const) {
    const value = font[key];
    if (value == null || value === "") continue;
    if (!isAssetFontPath(value) || !pluginId) {
      resolved[key] = value; // 系统族名直接写 / 找不到归属插件 → 写原值（浏览器回退，作者路径错误场景）
      continue;
    }
    // 已含协议（linkdesk:// / http(s):// / data:）→ 原样；相对路径 → getPluginAssetPath 解析插件资产
    const url = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : getPluginAssetPath(pluginId, value);
    const family = ensureFontFace(url, pluginId);
    resolved[key] = family;
    if (!seen.has(family)) {
      seen.add(family);
      const spec = _activeFontFaces.get(family);
      if (spec) fontFaces.push(spec);
    }
  }
  const appearance: ThemeAppearance = recipe.appearance
    ? { ...recipe.appearance, font: resolved }
    : { font: resolved };
  return { appearance, fontFaces };
}

/** 清理某插件注册的全部 @font-face（卸载回滚）——移除 style + 摘会话表 + 摘插件归属。
 *  被清族名若正生效于 --font-ui/--font-mono → 还原（字体回默认）。幂等。 */
export function cleanupPluginFontFaces(pluginId: string): void {
  const families = _pluginFontFaces.get(pluginId);
  if (families) {
    for (const family of families) {
      document.getElementById(`ld-ff-${family}`)?.remove();
      _activeFontFaces.delete(family);
    }
    _pluginFontFaces.delete(pluginId);
  }
  const root = document.documentElement;
  for (const token of ["font-ui", "font-mono"] as const) {
    const current = root.style.getPropertyValue(`--${token}`).trim();
    if (families?.includes(current)) root.style.removeProperty(`--${token}`);
  }
}

/** 登记卸载清理——插件注册配方时调一次；回滚 disposer 自删守卫键（重装后能再登记）。 */
const _fontCleanupRegistered = new Set<string>();
export function ensurePluginFontFacesCleanup(pluginId: string): void {
  if (_fontCleanupRegistered.has(pluginId)) return;
  _fontCleanupRegistered.add(pluginId);
  trackRegistration(pluginId, () => {
    _fontCleanupRegistered.delete(pluginId);
    cleanupPluginFontFaces(pluginId);
  });
}

/** 当前活动配方/配色——无活动配方（flat apply 态）返回 null */
export function getActiveRecipe(): { recipeId: string; colorwayId: string } | null {
  if (currentRecipeId == null) return null;
  return { recipeId: currentRecipeId, colorwayId: currentColorwayId ?? "" };
}

/**
 * E5.8#70：回写 app.themeColor = 生效配色 id（bug 7 复制为空 + #60 F1.2 下拉谎报同源修复）。
 * applyRecipe 已 resolve 缺省/失效值（followTheme→配方首配色 / custom 空或失效→兜底），本函数把引擎
 * 真实生效配色同步回配置——复制/展示/下拉高亮路径读 app.themeColor 而非空/旧配置值。
 * 仅配置提交路径（startup applyRecipeForConfig）调用——预览（applyRecipe 直调）不落配置。
 * 值已一致不写（防 onApply 重入死循环：写入→onApply→重应用→值已一致→停）。返回是否发生回写（测试断言）。
 */
export function syncThemeColorConfig(recipe: ThemeRecipe): boolean {
  const effective = getActiveRecipe()?.colorwayId ?? recipe.colorways[0]?.id ?? "";
  if (!effective) return false;
  if (getConfigurationValue<string>("app.themeColor") === effective) return false;
  void setConfigurationValue("app.themeColor", effective, "user").catch(() => {});
  return true;
}

/** 当前生效 token 集（合并后，含 :root 壳默认继承）——appearanceMode→custom 播种、混搭预览（06 §2）。
 *  来源 = getComputedStyle 解析：① 最近提交的合并集（appearance + colorway 颜色 + overrides）② 引擎管理 token 全集（壳默认零值）。
 *  权威在引擎（多窗一致，对标 #54 计数权威上移教训），非某窗 DOM 快照。 */
export function getEffectiveTokens(): Record<string, string> {
  const tokens: Record<string, string> = {};
  const cs = getComputedStyle(document.documentElement);
  const keys = new Set<string>([...MANAGED_TOKEN_KEYS, ...(_lastCommittedKeys ?? [])]);
  for (const key of keys) {
    const value = cs.getPropertyValue(`--${key}`).trim();
    if (value) tokens[key] = value;
  }
  return tokens;
}

/**
 * 应用用户自定义强调色——覆盖主题自带的 accent。
 * 预览主题时调用：先 applyTheme（含主题的 accent）再 applyAccentColor（用户的 accent 盖回去）。
 */
export function applyAccentColor(hexColor: string): void {
  document.documentElement.style.setProperty("--accent", hexColor);
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  document.documentElement.style.setProperty(
    "--accent-hover",
    `rgb(${Math.min(255, r + 30)},${Math.min(255, g + 30)},${Math.min(255, b + 30)})`
  );
  document.documentElement.style.setProperty(
    "--accent-light",
    `rgba(${r},${g},${b},0.15)`
  );

  // E5.5#7-fix：广播强调色到所有插件 WebView——对标 applyTheme 的 broadcast
  const accentVars = {
    "--accent": hexColor,
    "--accent-hover": `rgb(${Math.min(255, r + 30)},${Math.min(255, g + 30)},${Math.min(255, b + 30)})`,
    "--accent-light": `rgba(${r},${g},${b},0.15)`,
  };
  const linkdesk = window.linkdesk;
  if (linkdesk?.bridge?.broadcast) {
    linkdesk.bridge.broadcast("accent:changed", {
      themeId: currentTheme?.name ?? "",
      variables: accentVars,
    });
  }
}

/**
 * E5.8#50.21：app.theme 旧值归一化（08 §4 迁移表）——旧 flat 主题名 → 壳内置配方 id。
 * "Dark"→"dark" / "Light"→"light"；其余（配方 id / 未迁移 json 名）恒等。
 * 读时归一化——所有消费 app.theme 的路径都过这里（resolveActiveRecipe / onApply / getActive / revert…）；
 * 启动时另做持久化写回（旧值落盘转新，映射表不弹窗不重置）。
 * #50.25 主题插件迁移 colorways 后，json 名 → 配方 id 的映射在此扩展（08 §4 行 2）。
 */
const THEME_VALUE_MIGRATIONS: Record<string, string> = {
  Dark: "dark",
  Light: "light",
};
export function normalizeThemeValue(value: string | undefined): string | undefined {
  if (!value) return value;
  return THEME_VALUE_MIGRATIONS[value] ?? value;
}

/**
 * 内置兜底配方——在插件加载前注册，确保卸载全部主题插件后设置下拉框仍有 dark/light 配方。
 * 空 colorways（colors: {}）——应用时清空插件变量，index.css :root 硬兜底接管。
 * 插件主题（theme-defaults）后注册同名配方（id "light"）→ 覆盖亮兜底；"dark" 兜底保持空配方
 *   → :root 硬兜底接管（历史 dark.json 调色板）。registerRecipe 无归属不告警。
 * E5.8#50.21：壳兜底从 flat Theme 迁为 Recipe（决策 F 迁移表「壳内置配方 id」），不再进 flat 登记本。
 *
 * 🔥 #59c fix：防重入——React StrictMode 双重 effect 导致本函数在插件加载后再次执行。
 */
let _fallbacksRegistered = false;
export function registerFallbackThemes(): void {
  if (_fallbacksRegistered) return;
  _fallbacksRegistered = true;
  ThemeRegistry.registerRecipe(
    { id: "dark", name: "Dark", type: "dark", colorways: [{ id: "dark", name: "Dark", colors: {} }] },
    undefined
  );
  ThemeRegistry.registerRecipe(
    { id: "light", name: "Light", type: "light", colorways: [{ id: "light", name: "Light", colors: {} }] },
    undefined
  );
}

/** 同步查找主题——ThemeRegistry.get() 单真源 fallback（旧格式主题未在 ThemeRegistry 登记时走此路） */
export function findTheme(themeName: string): Theme | undefined {
  return pluginThemes.get(themeName);
}

/** 获取当前主题 */
export function getCurrentTheme(): Theme | null {
  return currentTheme;
}

/* ── E3f #59d1：强调色归一化——三种路径一条函数 ── */

import { getConfigurationValue, hasConfigurationValue, setConfigurationValue } from "../configuration/ConfigurationService";

/**
 * 获取有效强调色——三种路径归一化：
 *   followTheme + 主题有 accent → 主题色
 *   followTheme + 主题无 accent → 自定义兜底
 *   custom → 自定义色
 *
 * 所有需要强调色的地方（onApply app.theme / ThemeBrowser 预览）都走此函数——
 * 不要各自手写 if/else 判断。
 */
export function getEffectiveAccentColor(): string {
  const mode = (getConfigurationValue("app.accentMode") as string) ?? "custom";
  // E5.8#6.6 hex 豁免：配置读取兜底默认值数据（与 startup.ts 默认值同源）
  // eslint-disable-next-line linkdesk/no-hardcoded-hex
  const customColor = (getConfigurationValue("app.accentColor") as string) ?? "#0078d4";
  if (mode === "followTheme") {
    const theme = getCurrentTheme();
    if (theme?.colors?.accent) return theme.colors.accent;
  }
  return customColor;
}

/* ── E5.8#50.10：用户外观配置覆盖主题基线（对标上块 accent 覆盖 theme accent 同款）。
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
 * E5.8#57（审计#3）：当前 radius 域源配方原生 radius-md——播种反推分母。
 * mix 下生效 radius 来自 mixRadius 来源配方而非活动配方——拿活动配方当分母会把来源半径误判为用户
 * scale 二次放大（来源 20px ÷ 活动 8px = scale 2.5 → clamp 2 → 20×2=40px 暴涨）。
 * 读「当前 radius 域来源」的原生值当分母 → scale ≈ 用户真实偏离量（无覆盖 = 1 不暴涨；有覆盖 = 原 scale 恢复）。
 * 非 mix / followTheme 半径 = 活动配方原值（原行为零回归）。无 radius 域 → :root 壳默认。
 */
export function getRadiusSourcePx(): number {
  const active = getActiveRecipe();
  const baseRecipe = active?.recipeId ? ThemeRegistry.getRecipe(active.recipeId) : undefined;
  const base = baseRecipe?.appearance?.radius?.md;
  if (getConfigurationValue<string>("app.mixMode") === "mix" && baseRecipe) {
    const profile = getMixProfile();
    const source = resolveDomainSource("radius", profile, baseRecipe, baseRecipe.colorways[0]);
    const sourceRadius = source.recipe.appearance?.radius?.md;
    if (sourceRadius != null) return sourceRadius;
  }
  return base ?? parseFloat(getBaseRadius()["radius-md"] ?? "0");
}

/**
 * app.surfaceRadius scale 系数 → --radius-xs~2xl 六档乘算（--radius-pill/--radius-full 形态值排除不乘，08 §3）。
 * tokens 传入 → 对当前生效值乘算（主题 appearance.radius 现值）；键缺省 → :root 壳默认乘算。纯函数只算不改。
 */
export function applyRadiusScale(scale: number, tokens?: Record<string, string>): Record<string, string> {
  // E5.8#56（审计#4）：消费侧 clamp——settings.json/程序化直写 app.surfaceRadius 越界（如 5）被钳到合法域
  // （0 方角 ~ 2 圆润，05 §4 scale 域；#68 后下限 0）。播种方向 deriveAppearanceSeeds 已 clamp，此处守消费端单一写入点。
  const s = Number.isFinite(scale) ? Math.min(2, Math.max(0, scale)) : 1;
  const vars: Record<string, string> = {};
  const base = getBaseRadius();
  for (const key of RADIUS_SCALE_KEYS) {
    const current = tokens?.[key];
    const source = current !== undefined && current.trim() !== "" ? current : (base[key] ?? "0px");
    const px = parseFloat(source);
    vars[key] = Number.isFinite(px) ? `${Math.round(px * s)}px` : "0px";
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
  // ① radius scale 系数——五档同系数（app.surfaceRadius 单一 scale）一次乘算全六档
  let scaleFactor: number | null = null;
  for (const [token, value] of Object.entries(overrides)) {
    if ((RADIUS_SCALE_KEYS as readonly string[]).includes(token)) {
      const n = Number(value);
      if (Number.isFinite(n)) scaleFactor = n;
      else tokens[token] = String(value); // 已是 px 的 radius 覆盖（防御）→ 绝对写
    }
  }
  if (scaleFactor != null) Object.assign(tokens, applyRadiusScale(scaleFactor, tokens));
  // ② 绝对 token 覆盖
  for (const [token, value] of Object.entries(overrides)) {
    if ((RADIUS_SCALE_KEYS as readonly string[]).includes(token)) continue;
    tokens[token] = String(value);
  }
  return tokens;
}

/** 外观覆盖播种值形状——deriveAppearanceSeeds 返回值（08 §2：设置层永远只存用户偏离量） */
export interface AppearanceSeedValues {
  surfaceRadius: number;
  glassBlur: number;
  glassOpacity: number;
  glassTint: string;
  backgroundImage: string;
  fontFamily: string;
}

/**
 * 反推外观覆盖播种值——appearanceMode→custom 瞬间从生效 token 集反推 6 覆盖 key（08 §2）。
 * 纯函数只算不改：surfaceRadius = 当前 radius-md ÷ 主题原值（scale 系数，clamp 0-2）；
 * 玻璃绝对 = token 值直播；bg 剥 url() 存受控路径；font 跳过资产族（__ld_ 前缀 = 插件 @font-face，
 * #50.20 边界：资产族只显示不选，播种空 = 跟随主题）。themeRadiusPx = 主题原值（配方 appearance.radius.md
 * 或 :root 壳默认，调用方解析后传入；≤0 → scale 回退 1）。
 */
export function deriveAppearanceSeeds(
  tokens: Record<string, string>,
  themeRadiusPx: number
): AppearanceSeedValues {
  const effRadiusPx = parseFloat(tokens["radius-md"] ?? "0");
  const scale = themeRadiusPx > 0 && effRadiusPx > 0 ? effRadiusPx / themeRadiusPx : 1;
  const bg = tokens["bg-image"];
  const bgPath = bg && bg !== "none" ? bg.replace(/^url\(["']?/, "").replace(/["']?\)$/, "") : "";
  const fam = tokens["font-ui"];
  return {
    surfaceRadius: Math.min(2, Math.max(0, Math.round(scale * 10) / 10)),
    glassBlur: parseFloat(tokens["glass-blur"] ?? "0") || 0,
    glassOpacity: parseFloat(tokens["glass-opacity"] ?? "1"),
    glassTint: tokens["glass-tint"] && tokens["glass-tint"] !== "transparent" ? tokens["glass-tint"] : "",
    backgroundImage: bgPath,
    fontFamily: fam && !fam.startsWith("__ld_") ? fam : "",
  };
}

/** 设置层外观覆盖配置 key 全集——appearanceMode=custom 播种存这 6 键、reset 摘除这 6 键回主题基线（08 §7.2/§7.3.5）。
 *  单一来源：getAppearanceOverrides 读同键（glass 两键 presence 门控 / 其余空值不覆盖，见下）。
 *  E5.8#60 F1.1：壳命令（startup appearanceMode onApply）与插件 API（theme.resetAppearance）复位共用本表——
 *  插件侧曾只清 5 键漏 app.fontFamily → 第三方复位外观后字体不回基线。 */
export const APPEARANCE_OVERRIDE_KEYS = [
  "app.surfaceRadius", "app.glassBlur", "app.glassOpacity",
  "app.glassTint", "app.backgroundImage", "app.fontFamily",
] as const;

/** 读用户外观配置 → 覆盖集（glass/bg 仅偏离 neutral 时；radius 六键恒写 scale 系数——applyOverrides 内乘算）。 */
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

  const bgImage = getConfigurationValue<string>("app.backgroundImage");
  if (bgImage != null && String(bgImage).trim() !== "") {
    // E5.8#64：配置值 → 沙箱可加载 URL——受控协议 URL（linkdesk-userdata://…）原样 / 旧版 plain 绝对路径
    // 映射受控协议 / 主题资产（linkdesk:// 相对）原样。file:// 绝对路径会被 Chromium 拦截（实机 bug 13）。
    const resolved = resolveBackgroundImageUrl(String(bgImage));
    if (resolved) overrides["bg-image"] = `url("${resolved}")`;
  }

  // E5.8#50.19：app.fontFamily 用户级字体覆盖——族名写 --font-ui（空 = 不覆盖，跟随主题）
  const fontFamily = getConfigurationValue<string>("app.fontFamily");
  if (fontFamily != null && String(fontFamily).trim() !== "") {
    overrides["font-ui"] = String(fontFamily).trim();
  }

  const rawScale = getConfigurationValue<number>("app.surfaceRadius");
  const scale = rawScale == null || !Number.isFinite(Number(rawScale)) ? 1 : Number(rawScale);
  // radius scale 系数恒写（清残留）——applyOverrides 对当前生效值/壳默认乘算，非预先乘 :root 基准
  for (const key of RADIUS_SCALE_KEYS) overrides[key] = String(scale);

  return overrides;
}
