/**
 * ResolvedIcon → IconBarIcon 判别联合转换——标签栏/图标栏序列化唯一转换点。E6#69f/#69g。
 *
 * iconbar.ts（图标栏）与 windowLayout.ts（标签栏）此前各自内联同款映射（src ?? emoji 双源）——
 * 归一化收口到这里：两序列化点同消费，codicon/lucide 不再被丢弃（此前 tab 只留 img/emoji，
 * codicon/lucide 标签图标落空 = #69g 文件标签进不了标签栏的根因）。
 */

import type { IconBarIcon } from "../../core/types/pool/poolLayout";
import type { ResolvedIcon } from "../../components/shared/plugin-icon/iconUtils";

/** manifest → 解析图标 → 池判别联合（哑渲染可消费）。调用方零 switch——输出联合即渲染描述。 */
export function resolvedToIconBarIcon(resolved: ResolvedIcon): IconBarIcon {
  if (resolved.lucide) return { kind: "lucide", name: resolved.lucide };
  if (resolved.codicon) return { kind: "codicon", name: resolved.codicon };
  if (resolved.src) return { kind: "img", src: resolved.src };
  return { kind: "emoji", text: resolved.emoji ?? "📄" };
}
