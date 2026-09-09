/**
 * 插件图标解析 —— 纯函数（manifest → ResolvedIcon），@linkdesk/ui 图标渲染唯一真相源。
 * E6#54b：自 src/core/utils/plugin/iconUtils.ts 搬入 shared（随包分发）——解耦审计 §三 项 1：
 * 原居 core 时是 PluginIcon（共享组件）的 @src/core import 违规点；函数本体纯（只读 manifest
 * 的 icon/iconSource，零运行时依赖、零 window.linkdesk 调用），搬包零行为变化。
 *
 * 消费方：
 *  - shared PluginIcon.tsx（组件内 resolvePluginIcon(pluginId, manifest)）
 *  - 壳 usePoolSync（iconbar/windowLayout 序列化进 pool 布局前先解析）——两处壳消费维持同源，
 *    pool/PluginIcon 不 import pluginLoader/viewRegistry（特权假设已除）。
 *
 * 设计依据：[[phase4-design-decisions]] §16 + VS Code extension icon 解析（manifest.icon + galleryBanner）
 */
import type { PluginManifest } from "@linkdesk/contracts"; // 仅类型引用；参数按最小结构收缩（函数只读 icon/iconSource）
import { DEFAULT_PLUGIN_IDENTITY_URI } from "./defaultIdentityArt"; // E6#69a 统一默认彩色块——单份共享（壳/市场同 URI）

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

/** manifest 中图标相关的最小结构——函数只消费这两字段，任何 manifest 形状（完整 PluginManifest /
 *  IPC 序列化子集 / 插件列表条目）结构兼容均可直接传入，零跨包类型漂移。 */
export type ManifestIconShape = Pick<PluginManifest, "icon" | "iconSource">;

/**
 * 从 manifest 解析图标。
 * - iconSource: "lucide" → { lucide: icon }
 * - iconSource: "codicon" → { codicon: "codicon-{icon}" }
 * - iconSource: "svg" | "url" → { src: icon（直接当 URL 用）}
 * - 无 iconSource → { src: "linkdesk://{pluginId}/{icon}" }
 *   - icon 含 "." → 当完整文件名（如 "icon.svg"）
 *   - icon 不含 "." → 自动加 .png（如 "icon" → "icon.png"）
 * - 全无 → { emoji: "📄" }
 */
export function resolvePluginIcon(pluginId: string, manifest: ManifestIconShape): ResolvedIcon {
  const icon = manifest.icon;
  const source = manifest.iconSource;

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

/* ═══ E6#69f 插件身份彩色图裁决（三图模型 Type-2）═══
 * 单一实现：壳 windowLayout（标签栏视图标签）+ 市场 display（list/detail）同消费，禁各写一份（防漂移重演）。
 * 语义（#69 改向）：marketIcon = 插件身份彩色图（含市场展示 + 标签栏视图标签，Type-2）；icon = 界面小图标
 * （图标栏 4 只 icon-bar 插件为 Type-1 剪影，壳图标栏只读 icon）。本链取 marketIcon ?? icon → 默认彩色块。 */

/** manifest 中「插件身份彩色图」相关最小结构——marketIcon/icon 任一可裁决（E6#69f） */
export type PluginIdentityShape = Pick<
  PluginManifest,
  "icon" | "iconSource" | "marketIcon" | "marketIconSource"
>;

/** 挑出的统一 descriptor 形状——与 ManifestIconShape 结构兼容（直接可作 PluginIcon manifest / resolvePluginIcon 入参） */
export interface IdentityPicked {
  icon: string;
  iconSource?: PluginManifest["iconSource"];
}

/**
 * 插件身份彩色图裁决——恒返有效 descriptor（顶替历史 📄/640 场景默认）。
 * - marketIcon 在 → 用之（Type-2 身份图；source 缺省 → linkdesk:// 路径推断）
 * - 否则 icon 在 → 用之（非图标栏插件 icon 即 Type-2；图标栏插件 icon 是 Type-1 剪影——标签/市场不消费图标栏图）
 * - 全无 → 统一默认彩色块（E6#69a）
 * candidates 按序（已装 manifest 优先于目录条目——先到的候选先提供字段）。
 */
export function pickIdentityArt(...candidates: Array<PluginIdentityShape | null | undefined>): IdentityPicked {
  for (const c of candidates) if (c?.marketIcon) return { icon: c.marketIcon, iconSource: c.marketIconSource };
  for (const c of candidates) if (c?.icon) return { icon: c.icon, iconSource: c.iconSource };
  return { icon: DEFAULT_PLUGIN_IDENTITY_URI, iconSource: "url" };
}
