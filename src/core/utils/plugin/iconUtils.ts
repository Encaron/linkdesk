/**
 * 插件图标解析 —— 单一真相来源。
 * IconBar / PluginDetailPoolView / PluginIcon / TabBar / WelcomeView 全部引用此文件。
 *
 * E2c #19j-icon：图标路径相对插件目录（对标 VS Code），通过 linkdesk:// 协议访问。
 * 插件作者只需把 icon 文件放在自己插件目录下，plugin.json 声明文件名即可。
 *
 * 设计依据：[[phase4-design-decisions]] §16 + VS Code extension icon 解析（manifest.icon + galleryBanner）
 */

import type { PluginManifest } from "../../api/types";

export interface ResolvedIcon {
  /** Lucide 图标名——iconSource: "lucide" 时返回 "Package" / "Folder" 等 */
  lucide?: string;
  /** img src——非 codicon 图标时返回 linkdesk:// 协议路径 */
  src?: string;
  /** codicon CSS class——codicon 图标时返回 "codicon-xxx" */
  codicon?: string;
  /** emoji fallback——无 lucide/src/codicon 时用 */
  emoji?: string;
}

/**
 * 从 manifest 解析图标。
 * - iconSource: "codicon" → { codicon: "codicon-{icon}" }
 * - iconSource: "svg" | "url" → { src: icon（直接当 URL 用）}
 * - 无 iconSource → { src: "linkdesk://{pluginId}/{icon}" }
 *   - icon 含 "." → 当完整文件名（如 "icon.svg"）
 *   - icon 不含 "." → 自动加 .png（如 "icon" → "icon.png"）
 * - 全无 → { emoji: "📄" }
 */
export function resolvePluginIcon(pluginId: string, manifest: PluginManifest | { icon?: string; iconSource?: string }): ResolvedIcon {
  const icon = manifest.icon;
  const source = (manifest as PluginManifest).iconSource;

  // E5#100: Lucide 图标优先
  if (source === "lucide" && icon) {
    return { lucide: icon };
  }

  if (source === "codicon" && icon) {
    return { codicon: `codicon-${icon}` };
  }

  if (icon && (source === "svg" || source === "url")) {
    return { src: icon };
  }

  if (icon) {
    // iconSource 未显式声明 → 根据 icon 值推断（对齐 schema default: "codicon"）
    // 含 / 或 . → 文件路径（如 "resources/icon.png"）；否则 → codicon 名（如 "terminal"）
    if (icon.includes("/") || icon.includes(".")) {
      const filename = icon.includes(".") ? icon : `${icon}.png`;
      return { src: `linkdesk://${pluginId}/${filename}` };
    }
    return { codicon: `codicon-${icon}` };
  }

  return { emoji: "📄" };
}
