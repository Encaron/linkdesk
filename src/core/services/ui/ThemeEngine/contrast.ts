/**
 * 高对比派生（2026-11-24 · 主题极性归一化 Phase 6）——用户级「对比度」与明暗极性正交。
 *
 * 定位：`app.contrastMode = "high"` 时，在**玻璃/背景合成之后、commit 之前**把承载文字的
 * 表面与墨色推成最大对比（不换极性、不动 accent 身份）。作者若提供了 `traits.contrast="high"`
 * 的 colorway，优先用作者值（调用方判断），本函数只做「没有专用 colorway 时的安全派生」。
 *
 * 为什么不做自动色相计算：高对比的职责是**可读性**，不是调色；只动「面 / 字 / 边框 / 压图墨」，
 * 保留强调色与材质语义，避免对主题作者的设计做不可预测的重排。
 */

import { getConfigurationValue } from "../../configuration/ConfigurationService";
import { SURFACE_COLOR_KEYS } from "./constants";

/** 用户是否要求高对比（缺省 = standard） */
export function highContrastEnabled(): boolean {
  return getConfigurationValue<string>("app.contrastMode") === "high";
}

/**
 * 从当前极性派生安全高对比 token（原地写）。
 * - 暗极性：黑面白字；亮极性：白面黑字。
 * - 表面族（含 -solid）全部拍成实色；内容面/媒体面同步，保证卡片、浮层、压图文字都可读。
 * - 边框/分隔线用墨色，焦点/分隔不靠低对比灰。
 * - accent 不动（身份保留）；text-on-accent 由 applyAccentColor 按 accent 亮度单独负责。
 */
export function applyHighContrast(tokens: Record<string, string>, polarity: "light" | "dark"): void {
  const dark = polarity === "dark";
  const surface = dark ? "black" : "white";
  const ink = dark ? "white" : "black";
  const secondary = dark ? "color-mix(in srgb, white 90%, black)" : "color-mix(in srgb, black 88%, white)";
  const muted = dark ? "color-mix(in srgb, white 78%, black)" : "color-mix(in srgb, black 76%, white)";

  for (const key of SURFACE_COLOR_KEYS) {
    tokens[key] = surface;
    tokens[`${key}-solid`] = surface;
  }
  tokens["text-primary"] = ink;
  tokens["text-secondary"] = secondary;
  tokens["text-muted"] = muted;
  tokens["border"] = ink;
  tokens["separator"] = ink;
  tokens["surface-reading"] = surface;
  tokens["surface-reading-strong"] = surface;
  tokens["surface-media-scrim"] = surface;
  tokens["surface-ink"] = ink;
  tokens["surface-media-ink"] = ink;
}
