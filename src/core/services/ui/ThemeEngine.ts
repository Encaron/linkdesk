/**
 * 主题引擎——读 JSON 主题文件 → 写 CSS 变量。
 * JSON 是源，CSS 变量是渲染层。用户和 AI 都改 JSON。
 */

import { CoreEvents } from "../../react/events/CoreEvents";
import { trackRegistration } from "../../registry/registrationTracker"; // E5.8#10：register 返 disposer——卸载自动逆序回滚

export interface ThemeColors {
  [key: string]: string;
}

/** E5.8#50.6：玻璃 + 悬浮面板质感字段——主题 JSON `surface`（缺省 = 无玻璃无悬浮） */
export interface ThemeSurface {
  type: "glass";
  /** backdrop blur px——0 = 关 */
  blur?: number;
  /** 饱和度增强——1 = 关 */
  saturate?: number;
  /** 玻璃面叠加色 */
  tint?: string;
  /** 玻璃面不透明度——1 = 不透明 */
  opacity?: number;
  /** 液态玻璃顶部高光强度——0 = 关 */
  specular?: number;
  /** 形变过渡 ms——0 = 关 */
  morph?: number;
  /** 悬浮圆角 px——0 = 直角贴边 */
  radius?: number;
  /** 四周留缝 px——0 = 贴边 */
  inset?: number;
  /** 投影浮起——true = 悬浮投影（引擎映射 --shadow-lift） */
  shadow?: boolean;
}

/** E5.8#50.6：图片背景质感字段——主题 JSON `background`（缺省 = 无图） */
export interface ThemeBackground {
  /** 图片路径——作者提供可解析 URL，引擎写入 `--bg-image` 时 url() 包裹 */
  image?: string;
  /** 图片层不透明度——1 = 不透明 */
  opacity?: number;
  /** 图片遮罩明暗（0-1 rgba 透明度）——0 = 无遮罩 */
  mask?: number;
}

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
};

const BACKGROUND_ZERO: Record<string, string> = {
  "bg-image": "none",
  "bg-opacity": "1",
  "bg-mask": "0",
};

/** 玻璃 + 悬浮面板变量——缺省 = 零值 */
function surfaceVariables(surface?: ThemeSurface): Record<string, string> {
  const vars: Record<string, string> = { ...SURFACE_ZERO };
  if (!surface || surface.type !== "glass") return vars;
  if (surface.blur != null) vars["glass-blur"] = `${surface.blur}px`;
  if (surface.saturate != null) vars["glass-saturate"] = String(surface.saturate);
  if (surface.tint != null) vars["glass-tint"] = surface.tint;
  if (surface.opacity != null) vars["glass-opacity"] = String(surface.opacity);
  if (surface.specular != null) vars["glass-specular"] = String(surface.specular);
  if (surface.morph != null) vars["glass-morph"] = `${surface.morph}ms`;
  if (surface.radius != null) vars["surface-radius"] = `${surface.radius}px`;
  if (surface.inset != null) vars["surface-inset"] = `${surface.inset}px`;
  // 投影浮起 → 映射六域悬浮 token（JS 不硬编码 shadow 值——#50.14 已 token 化）
  if (surface.shadow === true) vars["surface-shadow"] = "var(--shadow-lift)";
  return vars;
}

/** 图片背景变量——缺省 = 零值 */
function backgroundVariables(background?: ThemeBackground): Record<string, string> {
  const vars: Record<string, string> = { ...BACKGROUND_ZERO };
  if (!background) return vars;
  if (background.image != null && background.image !== "") {
    // 已 url() 包裹则原样写；否则包裹（background-image 需 url()）
    vars["bg-image"] = /^url\(/i.test(background.image.trim()) ? background.image : `url("${background.image}")`;
  }
  if (background.opacity != null) vars["bg-opacity"] = String(background.opacity);
  if (background.mask != null) vars["bg-mask"] = String(background.mask);
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

/** 应用主题：清理旧变量 → 写入新变量 → 标记 data-theme → fire 事件 */
export function applyTheme(theme: Theme): void {
  // E3f #51：先发 IPC 通知主进程——和 CSS 渲染并行，标题栏不落后
  const linkdesk = window.linkdesk;
  const isDark = theme.type === "dark";
  linkdesk?.events?.notifyTheme?.(isDark);

  const root = document.documentElement;

  // E2c #19h A1：清理旧主题的 colors 变量——防止残留
  if (currentTheme) {
    for (const key of Object.keys(currentTheme.colors)) {
      root.style.removeProperty(`--${key}`);
    }
  }

  // E5.8#50.6：全量写入 colors + 玻璃/背景/悬浮——玻璃变量每次都写（缺省零值），
  // 玻璃主题切回普通主题自动清零不残留；重复应用幂等。
  const variables = getThemeVariables(theme);
  for (const [key, value] of Object.entries(variables)) {
    root.style.setProperty(`--${key}`, value);
  }
  root.setAttribute("data-theme", theme.type);
  currentTheme = theme;

  // E3b #35：广播 CSS 变量到所有插件 WebView——跨进程主题同步
  if (linkdesk?.bridge?.broadcast) {
    linkdesk.bridge.broadcast("theme:changed", {
      themeId: theme.name,
      themeType: theme.type,
      variables,
    });
  }

  // E2c #19h A5：通知所有订阅者——多 WebView 跨进程主题同步 + UI 联动
  CoreEvents.onDidChangeTheme.fire({ theme: theme.name });
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
 * 内置兜底主题——在插件加载前注册，确保卸载全部主题插件后设置下拉框仍有 Dark/Light。
 * 空 colors——应用时清空插件变量，index.css :root 硬兜底接管。
 * 插件主题（theme-defaults）后注册 → 同名覆盖 → getAvailableThemes() 返回插件版本。
 *
 * 🔥 #59c fix：防重入——React StrictMode 双重 effect 导致本函数在插件加载后再次执行。
 */
let _fallbacksRegistered = false;
export function registerFallbackThemes(): void {
  if (_fallbacksRegistered) return;
  _fallbacksRegistered = true;
  registerTheme({ name: "Dark", type: "dark", colors: {} });
  registerTheme({ name: "Light", type: "light", colors: {} });
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

import { getConfigurationValue } from "../configuration/ConfigurationService";

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
