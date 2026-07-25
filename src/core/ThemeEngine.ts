/**
 * 主题引擎——读 JSON 主题文件 → 写 CSS 变量。
 * JSON 是源，CSS 变量是渲染层。用户和 AI 都改 JSON。
 */

import { getAssetPath } from "./assetPath";
import { CoreEvents } from "./CoreEvents";

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

/** 插件 → 主题名列表——卸载时批量清理 */
const _pluginThemeNames = new Map<string, string[]>();

/** 内置主题名——这些不从插件注册来，直接从 themes/*.json 加载 */
const BUILTIN_THEMES = ["Dark", "Light"];

/**
 * Phase 4：注册插件提供的主题。
 * 插件加载器扫描到 type: "theme" 插件后调用此函数。
 * 注册后的主题和内置主题在同一个列表中，不区分来源。
 */
export function registerTheme(theme: Theme, pluginId?: string): void {
  // E2c #19h A2：冲突检测——同名主题后注册者覆盖，console.warn
  if (pluginThemes.has(theme.name)) {
    console.warn(`[ThemeEngine] 主题 "${theme.name}" 重复注册——后注册者覆盖先注册者`);
  }
  pluginThemes.set(theme.name, theme);
  if (pluginId) {
    const names = _pluginThemeNames.get(pluginId) ?? [];
    names.push(theme.name);
    _pluginThemeNames.set(pluginId, names);
  }
}

/** E2c #19h A3：注销单个主题 */
export function unregisterTheme(name: string): void {
  pluginThemes.delete(name);
}

/** E2c #19h A3：注销插件的全部主题——插件卸载时 lifecycle 调用 */
export function unregisterPluginThemes(pluginId: string): void {
  const names = _pluginThemeNames.get(pluginId);
  if (names) {
    for (const name of names) pluginThemes.delete(name);
    _pluginThemeNames.delete(pluginId);
  }
}

/** 获取所有已注册主题的名称（内置 + 插件） */
export function getAvailableThemes(): string[] {
  // E2c #19h A4：补内置主题——getAvailableThemes 漏掉 Dark/Light
  const pluginNames = Array.from(pluginThemes.keys());
  // 去重：插件可能覆盖内置主题
  return [...new Set([...BUILTIN_THEMES, ...pluginNames])];
}

/** 从 URL 加载主题 JSON（Vite 下 themes/ 目录通过 public 可访问） */
export async function loadTheme(themeName: string): Promise<Theme> {
  // Phase 4：先查插件注册的主题
  const pluginTheme = pluginThemes.get(themeName);
  if (pluginTheme) return pluginTheme;

  const res = await fetch(getAssetPath(`themes/${themeName.toLowerCase()}.json`));
  if (!res.ok) throw new Error(`Theme "${themeName}" not found`);
  return res.json();
}

/** 应用主题：清理旧变量 → 写入新变量 → 标记 data-theme → fire 事件 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  // E2c #19h A1：清理旧主题的所有 CSS 变量——防止残留
  if (currentTheme) {
    for (const key of Object.keys(currentTheme.colors)) {
      root.style.removeProperty(`--${key}`);
    }
  }

  // 写入新变量
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--${key}`, value);
  }
  root.setAttribute("data-theme", theme.type);
  currentTheme = theme;

  // E2c #19h A5：通知所有订阅者——多 WebView 跨进程主题同步 + UI 联动
  CoreEvents.onDidChangeTheme.fire({ theme: theme.name });
}

/** 获取当前主题 */
export function getCurrentTheme(): Theme | null {
  return currentTheme;
}
