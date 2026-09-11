/**
 * SettingRow——单个设置行（IPC 读写 + 声明式显隐 + 齿轮菜单 + 色块取色）。
 * 自壳迁入（E5.8#41.14）：@src/core 三依赖全消除——useConfigurationValue（壳）→ useConfigurationValueIpc → 插件本地 hook；
 * MENU_SLOTS.SettingItemGear → 本地常量（菜单槽 id 是壳稳定契约面，壳 coreCommands 已注册该槽菜单项）。
 * E6#54c：共享组件（ContextMenu/ColorPicker）走 @linkdesk/ui。
 * E6#87d：行私有件归拢到同名夹 `SettingRow/`（值读写 / 齿轮开合 / 两个行尾徽标 / 行内常量）。
 * 依赖方向：SettingRow → renderControl + @linkdesk/ui + hooks/types + 同名夹；被聚合器 SettingsView 消费。
 */

import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ColorPicker, ContextMenu } from "@linkdesk/ui";
import renderControl from "./renderControl";
import type { ConfigProperty } from "./types";
import { COLOR_PICKER_PRESETS, SOURCE_BADGE_UI } from "./SettingRow/constants";
import { SETTING_ITEM_GEAR_MENU, useSettingRowGear } from "./SettingRow/gearMenu";
import { useSettingRowBadges } from "./SettingRow/useSettingRowBadges";
import { useSettingRowValue } from "./SettingRow/useSettingRowValue";

function SettingRow({
  configKey,
  prop,
  onChange,
  userOverrides,
  baselineSeeds,
  effectiveTokens,
  description,
}: {
  configKey: string;
  prop: ConfigProperty | undefined;
  onChange: () => void;
  /** E5.8#87：用户覆盖集（getUserSettings）——来源徽标 presence 派生（无 override = 主题 🎨） */
  userOverrides: Record<string, unknown>;
  /** E5.8#88：主题/混搭基准种子集（theme.getBaselineSeeds）——「已修改」徽标 value-vs-baseline 判定基准 */
  baselineSeeds: Record<string, unknown>;
  /** E5.8#155：生效 token 集（theme.getEffectiveTokens）——跟随主题生效值徽标数据源 */
  effectiveTokens: Record<string, string>;
  /** E5.8#90 D5：动态描述覆盖——外观模式等运行时语义（如 themeColor 配色区/域来源双语境）覆盖 schema 静态描述 */
  description?: string;
}) {
  const { t } = useTranslation();
  const gearRef = useRef<HTMLButtonElement>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [colorPickerAnchor, setColorPickerAnchor] = useState<{ x: number; y: number } | null>(null);

  const { currentValue, depValue, actionDisabled, handleChange } = useSettingRowValue(configKey, prop, onChange);
  const { badge, effectiveBadge } = useSettingRowBadges({
    configKey,
    prop,
    userOverrides,
    baselineSeeds,
    effectiveTokens,
  });
  const { gearAnchor, handleGearClick, handleGearClose } = useSettingRowGear(gearRef, configKey, prop);

  if (!prop) return null;

  // 声明式条件显隐
  if (prop.dependsOn && depValue !== prop.dependsOn.value) return null;

  return (
    <div className="settings-row" id={`setting-row-${configKey}`}>
      <div className="settings-row-info">
        <div className="settings-row-label-line">
          <label className="settings-row-label">{configKey}</label>
          {/* E5.8#87+#99：来源徽标——只显非默认态（#6 降噪）：改过 ✏️ / 混搭域来源 🔀；
              theme 态无徽标 = 主题来源（清除后徽标消失 = 一眼可见「回主题」，对标 VS Code 非默认态才点显） */}
          {badge === "user" || badge === "mix" ? (
            <span
              className={`settings-source-badge settings-source-badge--${badge}`}
              title={t(SOURCE_BADGE_UI[badge].labelKey)}
            >
              <span className={`codicon ${SOURCE_BADGE_UI[badge].glyph}`} aria-hidden="true" />
              {t(SOURCE_BADGE_UI[badge].labelKey)}
            </span>
          ) : null}
        </div>
        <span className="settings-row-desc">{t(description ?? prop.description ?? "")}</span>
      </div>
      <div className="settings-row-control">
        {renderControl(prop, currentValue, handleChange, t, (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setColorPickerAnchor({ x: rect.right + 4, y: rect.top });
          setColorPickerOpen(true);
        }, actionDisabled)}
        {/* E5.8#155：跟随主题生效值徽标——控件容器内、控件右侧（行尾/齿轮左），跟随主题态才现。
            放容器内与控件同一条垂直中心线（容器 align-items:center）——贴住控件而非浮在行中间；
            字体行「生效：‹首族名›」/ 玻璃色行「生效：‹rgba› + 色块」——播种改空后补回「实际生效成什么」可见性 */}
        {effectiveBadge && (
          <span className="settings-effective-badge" title={t("当前跟随主题实际生效的值")}>
            <span className="settings-effective-badge-label">{t("生效：")}</span>
            {effectiveBadge.color && (
              <span
                className="settings-effective-swatch"
                style={{ background: effectiveBadge.color }}
                aria-hidden="true"
              />
            )}
            <span className="settings-effective-badge-value">{effectiveBadge.label}</span>
          </span>
        )}
      </div>
      {/* hover 齿轮 */}
      <button
        ref={gearRef}
        className="settings-row-gear"
        title={t("更多操作")}
        onClick={handleGearClick}
      >
        <span className="codicon codicon-gear" />
      </button>
      {gearAnchor && (
        /* E5.8#92：非模态变体——行内轻量菜单不吞首击（backdrop 吞击 = 每次 gear 后首击被吃 →
           命中区漂移根因，14-档案 §七）；右键 context menu 保留模态（VS Code 语义）。 */
        <ContextMenu
          menuId={SETTING_ITEM_GEAR_MENU}
          anchor={gearAnchor}
          context={{ settingKey: configKey }}
          onClose={handleGearClose}
          variant="non-modal"
        />
      )}
      {/* 色块点击 → ColorPicker */}
      {prop.renderHint === "color" && (
        <ColorPicker
          open={colorPickerOpen}
          value={String(currentValue ?? prop.default ?? "")}
          onChange={(hex) => handleChange(hex)}
          onClose={() => setColorPickerOpen(false)}
          anchor={colorPickerAnchor}
          presets={COLOR_PICKER_PRESETS}
        />
      )}
    </div>
  );
}

export default SettingRow;
