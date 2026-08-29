/**
 * 资产字体两步机制——作者自带 woff2/ttf/otf → @font-face 注册 → 族名写 --font-*（#50.17，叶子模块）。
 * font-family 不能吃 url()——资产相对路径必须先注册 @font-face 拿族名，再写族名；系统族名直接写。
 * 依赖：ThemeRegistry（资产路径归属插件域）+ getPluginAssetPath（linkdesk:// 解析）+ trackRegistration（卸载清理）。
 */

import { trackRegistration } from "../../../registry/registrationTracker";
// E5.8#50.17：资产字体两步机制——相对路径 → getPluginAssetPath 解析 linkdesk://（硬约束 12 同族）→ @font-face → 族名
import { getPluginAssetPath } from "../../../utils/path/pluginAssetPath";
import { ThemeRegistry } from "../../../registry/appearance/ThemeRegistry";
import type { FontFaceSpec } from "../../../types/ipc/events"; // 广播给池复刻 @font-face（池独立文档，不跨文档继承）
import type { ThemeAppearance, ThemeRecipe } from "../../../types/theme";

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

/** 按扩展名推断 src format 提示——未知扩展不写（浏览器自嗅探）。
 *  E5.8#133.4：export 供插件加载器（contributions.ts 图标主题自定义字体）复用——单一权威，禁止两处漂移 */
export function fontFormatOf(url: string): string | undefined {
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
