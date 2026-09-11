/**
 * 组内二级标题渲染——E6#87d 自 SettingsView.tsx 的 renderGroupedKeys 逐字搬出（只搬家，零逻辑变更）。
 *
 * ── 组内二级标题（E5.8#78）——按 prop.group 把 keys 归到子标题下渲染（主题组 6 分节）。
 *    无 group 的 key 保持平铺原样（第三方配置零侵入）；组标题字符串走 t() i18n（lang-defaults）。
 *    空桶（搜索过滤后整组无 key）不渲染标题——不显示空标题。归桶逻辑 = grouping.ts 纯函数。
 *    E5.8#90：空桶过滤——外观覆盖/域混搭 两节 dependsOn 挂外观主开关（appearanceMode=custom 才显），
 *    followTheme 下 整组空 → 不渲染空子标题（与搜索过滤后空桶同语义）。
 *    E5.8#98：强调色节不入本过滤——accentSource 独立轴恒显（无 dependsOn），accentColor 只门控
 *    accentSource=custom；强调色不再随外观主开关整组消失（mockup「始终可见」）。
 *    通用化：仅对 appearanceMode 门控的键判空（第三方配置 dependsOn 其他键不可评估，保守保留——
 *    SettingRow 自身 dependsOn 显隐兜底，本过滤只负责「整组空不显示标题」）。
 *    D5 语义显性：themeColor 双语义——custom 模式 = colors 域来源描述（覆盖 schema 静态「配色变体」，
 *    配色区变体语义只在跟随主题下成立；14-档案 §四 #90）。
 */

import { useTranslation } from "react-i18next";
import SettingRow from "./SettingRow";
import { groupSettingsKeys } from "./grouping";
import type { ConfigProperty } from "./types";

export default function GroupedKeys({
  keys,
  allProps,
  appearanceMode,
  userOverrides,
  baselineSeeds,
  effectiveTokens,
  onChange,
}: {
  keys: string[];
  allProps: Record<string, ConfigProperty>;
  /** 外观主开关当前值（未加载时为 undefined——空桶过滤只在它等于 dependsOn.value 时放行） */
  appearanceMode: string | undefined;
  userOverrides: Record<string, unknown>;
  baselineSeeds: Record<string, unknown>;
  effectiveTokens: Record<string, string>;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  return groupSettingsKeys(keys, (k) => allProps[k]?.group ?? "").map((bucket) => {
    const visible = bucket.keys.filter((key) => {
      const dep = allProps[key]?.dependsOn;
      if (dep?.key === "app.appearanceMode") return appearanceMode === dep.value;
      return true;
    });
    if (visible.length === 0) return null;
    return (
      <div key={bucket.group || `flat-${bucket.keys[0]}`} className="settings-subsection">
        {bucket.group && <h3 className="settings-subsection-title">{t(bucket.group)}</h3>}
        {visible.map((key) => (
          <SettingRow
            key={key}
            configKey={key}
            prop={allProps[key]}
            onChange={onChange}
            userOverrides={userOverrides}
            baselineSeeds={baselineSeeds}
            effectiveTokens={effectiveTokens}
            description={
              key === "app.themeColor" && appearanceMode === "custom"
                ? t("颜色域来源——指定主题配方的配色变体（选「跟随主题」= 整体配方配色）")
                : undefined
            }
          />
        ))}
      </div>
    );
  });
}
