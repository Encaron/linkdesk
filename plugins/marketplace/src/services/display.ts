/**
 * display —— 市场「展示图」裁决域（E6#66 默认展示图 + E6#67 双图标字段）。
 *
 * 双图标模型（14 档案定案 1-6）：
 *   - icon            = 界面小图标（壳图标栏/标签栏只读它——壳零改动，E6#65a 通道已通）
 *   - marketIcon      = 市场展示图（cover art，可画得讲究复杂；svg 资产相对路径，
 *                       省略 source → linkdesk:// 路径推断，同 serial/aurora 正路）
 * 本模块 = 市场层唯一裁决点：市场任何 icon 位先把「展示图」挑成统一 descriptor 再喂共享
 * PluginIcon（resolvePluginIcon/PluginIcon 不改——市场挑好喂进 manifest 参数即可）。
 *
 * 两种消费语义（尺寸不同，图画选择不同——避免把 640 封面压成 28px 小图强行当行内图标）：
 *   - 展示位（详情头大框 / 将来主区商店）：marketIcon ?? icon ?? 默认封面——封面优先，cover 就是为这准备的
 *   - 行内位（列表行小框）：icon ?? marketIcon ?? 默认封面——界面小图标优先，无 icon 才用封面兜底；
 *     两者皆无 → 默认封面（顶替历史 📄 emoji 兜底，E6#66）。
 */

import type { PluginManifest } from "@linkdesk/contracts";
import { DEFAULT_COVER_SVG, DEFAULT_COVER_URI } from "./defaultCoverArt";

export { DEFAULT_COVER_SVG, DEFAULT_COVER_URI };

/**
 * 默认展示封面（E6#66）资产独立成 defaultCoverArt.ts——该文件 = 纯 SVG 资产数据，
 * 被硬编码颜色审计当「资产」豁免（见 check-css-hardcode.mjs EXEMPT_FILES）。本文件是
 * 裁决逻辑，不嵌任何 hex，照常受审。
 */

/** 市场展示图的输入形状——消费方 manifest / 目录条目 / 本地局部，结构兼容直接传 */
export type DisplayArt = Partial<
  Pick<PluginManifest, "icon" | "iconSource" | "marketIcon" | "marketIconSource">
> | null | undefined;

/** 挑出的统一 descriptor 形状——与共享 ManifestIconShape 结构兼容（icon/iconSource 两字段） */
export interface PickedArt {
  icon: string;
  iconSource?: PluginManifest["iconSource"];
}

/** 无任何配图 → 默认封面的 descriptor */
const DEFAULT_ART: PickedArt = { icon: DEFAULT_COVER_URI, iconSource: "url" };

/* ═══ 裁决 ═══ */

/** 从 candidates 按序取首个「有效 marketIcon 位」——manifest/目录条目可混传，谁在前谁优先（已装 manifest 优先） */
function firstMarket(candidates: DisplayArt[]): PickedArt | undefined {
  for (const c of candidates) {
    if (c?.marketIcon) return { icon: c.marketIcon, iconSource: c.marketIconSource };
  }
  return undefined;
}

/** 从 candidates 按序取首个「有效 icon 位」 */
function firstIcon(candidates: DisplayArt[]): PickedArt | undefined {
  for (const c of candidates) {
    if (c?.icon) return { icon: c.icon, iconSource: c.iconSource };
  }
  return undefined;
}

/**
 * 展示位裁决（详情头大框 / 将来商店大屏）：marketIcon ?? icon ?? 默认封面——恒返有效 descriptor。
 * candidates 顺序 = 数据源优先级（如 [已装 manifest, 目录条目]）；返回恒非 undefined，
 * 消费方零分支（顶替历史 codicon-symbol-misc 兜底渲染）。
 */
export function pickDisplayArt(...candidates: DisplayArt[]): PickedArt {
  return firstMarket(candidates) ?? firstIcon(candidates) ?? DEFAULT_ART;
}

/**
 * 行内位裁决（列表行小框）：icon ?? marketIcon ?? 默认封面——恒返有效 descriptor。
 * 界面小图标优先：640 封面是展示位资产，28px 行内不该硬压封面当小图（作者有 icon 就显 icon）；
 * 无 icon 有封面才用封面兜底；两者皆无 → 默认封面（顶替 📄 emoji）。
 */
export function pickRowArt(...candidates: DisplayArt[]): PickedArt {
  return firstIcon(candidates) ?? firstMarket(candidates) ?? DEFAULT_ART;
}
