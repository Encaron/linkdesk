/**
 * SettingRow——单个设置行（IPC 读写 + 声明式显隐 + 齿轮菜单 + 色块取色）。
 * 自壳迁入（E5.8#41.14）：@src/core 三依赖全消除——useConfigurationValueIpc → 插件本地 hook；
 * MENU_SLOTS.SettingItemGear → 本地常量（菜单槽 id 是壳稳定契约面，壳 coreCommands 已注册该槽菜单项）。
 * E6#54c：共享组件（ContextMenu/ColorPicker）走 @linkdesk/ui。
 * 依赖方向：SettingRow → renderControl + @linkdesk/ui + hooks/helpers/types；被聚合器 SettingsView 消费。
 */

import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ColorPicker, ContextMenu } from "@linkdesk/ui";
import { useConfigurationValueIpc, useConfigurationValuesIpc } from "../hooks/useConfigurationValueIpc";
import renderControl from "./renderControl";
import { lk } from "./helpers";
import { deriveSourceBadge } from "./deriveSourceBadge";
import { resolveEffectiveBadge, formatEffectiveValue } from "./effectiveBadge";
import type { ConfigProperty } from "./types";

/** 设置项齿轮菜单槽——壳 MenuRegistry.MENU_SLOTS.SettingItemGear 稳定槽 id（菜单项由壳 coreCommands 注册） */
const SETTING_ITEM_GEAR_MENU = "settingItemGear";

// E5.8#6.6 hex 豁免：取色器预设色板（颜色即数据——用户可选值，非样式硬编码）
// eslint-disable-next-line linkdesk/no-hardcoded-hex
const COLOR_PICKER_PRESETS = ["#0078d4", "#e81123", "#10893e", "#ff8c00", "#6b69d6", "#0099bc"];

// E5.8#99（#6）：来源徽标 UI 元数据——codicon 图标（SVG 字体，随 currentColor 主题化）+ i18n label。
// 只含 user/mix（非默认态才显徽标，降噪；theme 态无徽标 = 主题来源）。deriveSourceBadge 保持纯函数。
const SOURCE_BADGE_UI: Record<"user" | "mix", { glyph: string; labelKey: string }> = {
  user: { glyph: "codicon-edit", labelKey: "来源：用户覆盖" },
  mix: { glyph: "codicon-arrow-swap", labelKey: "来源：混搭域" },
};

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
  const [gearAnchor, setGearAnchor] = useState<{ x: number; y: number } | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [colorPickerAnchor, setColorPickerAnchor] = useState<{ x: number; y: number } | null>(null);

  // IPC 版 hook——替代 useConfigurationValue
  const currentValue = useConfigurationValueIpc(configKey);
  const depValue = useConfigurationValueIpc(prop?.dependsOn?.key ?? "");
  // E5.8#87：来源徽标——sourceKey 声明槽才派生（appearanceMode 覆盖 9 键；第三方键零侵入）。
  // E5.8#90：域来源生效门控读外观主开关 app.appearanceMode（app.mixMode 已删）+ 域来源值走 IPC 订阅；
  // 无 sourceKey 时空 key 退化为 depValue 同款无订阅污染。
  const mode = useConfigurationValueIpc<string>("app.appearanceMode");
  const sourceValue = useConfigurationValueIpc(prop?.sourceKey ?? "");
  const badge = prop?.sourceKey
    ? deriveSourceBadge({
        sourceKey: prop.sourceKey,
        userValue: userOverrides[configKey],
        baseline: baselineSeeds[configKey],
        mode,
        sourceValue,
      })
    : null;
  // E5.8#155：跟随主题生效值徽标——跟随主题态（非用户修改）显示行实际生效值（对标 VS Code「从默认值继承」）。
  // 与来源徽标同源判定（isFollowingThemeValue = deriveSourceBadge 用户条件取反）：theme/mix 态都算跟随主题
  // （mix 态实际值来自混搭域，生效 token 即混搭来源生效值）；user 态不显（已显 ✏️ 用户覆盖）。
  // E5.8#155 归一化：token 映射声明进 schema（prop.effectiveToken，对齐 sourceKey 先例）——本行零映射表，
  // 声明键 + 生效 token 集解析；展示形态 formatEffectiveValue 按值驱动（色块/首族），token 语义零知识。
  const effectiveBadgeRaw = resolveEffectiveBadge(
    prop?.effectiveToken,
    effectiveTokens,
    userOverrides[configKey],
    baselineSeeds[configKey],
  );
  const effectiveBadge = effectiveBadgeRaw
    ? { ...effectiveBadgeRaw, ...formatEffectiveValue(effectiveBadgeRaw.value) }
    : null;
  // E5.8#50.26：actionDisabledAll——动作按钮禁用条件（混搭复位「6 来源全跟随主题 → 置灰」）：
  // 全部 {key,value} 匹配当前配置值时禁用（mockup 01 updateMixReset 同款 `!anyCustom`）
  const actionKeys = prop?.actionDisabledAll?.map((c) => c.key) ?? [];
  const actionValues = useConfigurationValuesIpc(actionKeys);
  const actionDisabled = (prop?.actionDisabledAll ?? []).every((c) => actionValues[c.key] === c.value);

  const handleChange = useCallback(
    async (value: unknown) => {
      try {
        await lk().set(configKey, value);
        onChange();
      } catch (e) {
        console.error("[SettingsView] 设置失败:", configKey, e);
      }
    },
    [configKey, onChange],
  );

  // 齿轮打开前设 context key
  const handleGearClick = useCallback(async () => {
    try {
      window.linkdesk?.contextKey?.set("settingKey", configKey);
      // E5.8 用户审计 #3：跟随主题门控——键声明 resetsToTheme 才显示齿轮「跟随主题」项
      // （coreCommands when="settingModified && settingFollowTheme"——通用设置插件零外观知识）
      window.linkdesk?.contextKey?.set("settingFollowTheme", !!prop?.resetsToTheme);
      // E5.8#158：默认项语义——resetsToDefault 键齿轮「重置此设置」改写 __none__（真默认），
      // when=settingResetsToDefault || (settingModified && !settingFollowTheme)（coreCommands）
      window.linkdesk?.contextKey?.set("settingResetsToDefault", !!prop?.resetsToDefault);
      // inspectConfiguration 异步获取修改状态——wire 面 unknown，IPC 边界收窄（主进程组装 { userValue, ... }）
      const insp = await lk().inspectConfiguration(configKey) as { userValue?: unknown } | undefined;
      window.linkdesk?.contextKey?.set("settingModified", insp?.userValue !== undefined);
    } catch { /* 静默 */ }
    const rect = gearRef.current?.getBoundingClientRect();
    if (rect) {
      setGearAnchor({ x: rect.left, y: rect.bottom + 4 });
    }
  }, [configKey, prop]);

  // 齿轮关闭——清理 context key
  const handleGearClose = useCallback(() => {
    setGearAnchor(null);
    window.linkdesk?.contextKey?.set("settingKey", undefined);
    window.linkdesk?.contextKey?.set("settingModified", false);
    window.linkdesk?.contextKey?.set("settingFollowTheme", false);
    window.linkdesk?.contextKey?.set("settingResetsToDefault", false);
  }, []);

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
