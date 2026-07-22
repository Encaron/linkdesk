/**
 * 插件图标解析 —— 单一真相来源。
 * IconBar / PluginDetailView / MarketplaceSidebar / TabBar / WelcomeView 全部引用此文件。
 *
 * 设计依据：[[phase4-design-decisions]] §16 + VS Code extension icon 解析（manifest.icon + galleryBanner）
 */

import type { PluginManifest } from "../core/types";

export interface ResolvedIcon {
  /** img src——非 codicon 图标时返回路径 */
  src?: string;
  /** codicon CSS class——codicon 图标时返回 "codicon-xxx" */
  codicon?: string;
  /** emoji fallback——既无 src 也无 codicon 时用 */
  emoji?: string;
}

/**
 * 从 manifest 解析图标。
 * - iconSource: "codicon" → { codicon: "codicon-{icon}" }
 * - iconSource: "svg" | "url" → { src: icon }
 * - 无 iconSource → { src: "/assets/icons/{icon}.png" }
 * - icon 含 "." → 当作完整文件名（如 "extensions.svg"）
 * - 全无 → { emoji: "📄" }
 */
export function resolvePluginIcon(manifest: PluginManifest | { icon?: string; iconSource?: string }): ResolvedIcon {
  const icon = manifest.icon;
  const source = (manifest as PluginManifest).iconSource;

  if (source === "codicon" && icon) {
    return { codicon: `codicon-${icon}` };
  }

  if (icon && (source === "svg" || source === "url")) {
    return { src: icon };
  }

  if (icon) {
    // PNG 兜底：含扩展名=直接用，不含=加 .png
    if (icon.includes(".")) return { src: `/assets/icons/${icon}` };
    return { src: `/assets/icons/${icon}.png` };
  }

  return { emoji: "📄" };
}

/** 从 pluginId + manifest 生成默认图标（插件未声明 icon 时使用） */
export function resolvePluginIconById(pluginId: string, manifest?: PluginManifest | { icon?: string; iconSource?: string }): ResolvedIcon {
  if (manifest) return resolvePluginIcon(manifest);
  return { src: `/assets/icons/${pluginId}.png`, emoji: "📄" };
}
