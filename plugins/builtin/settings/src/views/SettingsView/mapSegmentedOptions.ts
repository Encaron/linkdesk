/**
 * E5.8#99：分段单选选项映射——enum + enumDescriptions → { value, label 短, title 全句 }。
 * 短标签 = enumDescription "—" 前段（分段窄放不下全句），tooltip = 全句。
 * 通用 uiHint:"segmented" + fontTone/accentSource 预览覆盖共用（#99 去重——三处选项映射收敛一处）。
 */
import type { ConfigProperty } from "./types";

export function mapSegmentedOptions(
  prop: Pick<ConfigProperty, "enum" | "enumDescriptions">,
  t: (key: string) => string,
): { value: string; label: string; title: string }[] {
  return (prop.enum ?? []).map((v, i) => {
    const full = prop.enumDescriptions?.[i] ? t(prop.enumDescriptions[i]) : t(v);
    return { value: v, label: full.split("—")[0], title: full };
  });
}
