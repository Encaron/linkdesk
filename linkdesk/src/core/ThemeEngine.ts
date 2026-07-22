/**
 * 主题引擎——读 JSON 主题文件 → 写 CSS 变量。
 * JSON 是源，CSS 变量是渲染层。用户和 AI 都改 JSON。
 */

export interface ThemeColors {
  [key: string]: string;
}

export interface Theme {
  name: string;
  type: "dark" | "light";
  colors: ThemeColors;
}

let currentTheme: Theme | null = null;

/** 插件注册的主题——name → Theme */
const pluginThemes = new Map<string, Theme>();

/**
 * Phase 4：注册插件提供的主题。
 * 插件加载器扫描到 type: "theme" 插件后调用此函数。
 * 注册后的主题和内置主题在同一个列表中，不区分来源。
 */
export function registerTheme(theme: Theme): void {
  pluginThemes.set(theme.name, theme);
}

/** 获取所有已注册主题的名称（内置 + 插件） */
export function getAvailableThemes(): string[] {
  return Array.from(pluginThemes.keys());
}

/** 从 URL 加载主题 JSON（Vite 下 themes/ 目录通过 public 可访问） */
export async function loadTheme(themeName: string): Promise<Theme> {
  // Phase 4：先查插件注册的主题
  const pluginTheme = pluginThemes.get(themeName);
  if (pluginTheme) return pluginTheme;

  const res = await fetch(`/themes/${themeName.toLowerCase()}.json`);
  if (!res.ok) throw new Error(`Theme "${themeName}" not found`);
  return res.json();
}

/** 应用主题：把 JSON 的所有颜色写入 CSS 变量 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--${key}`, value);
  }
  root.setAttribute("data-theme", theme.type);
  currentTheme = theme;
}

/** 获取当前主题 */
export function getCurrentTheme(): Theme | null {
  return currentTheme;
}
