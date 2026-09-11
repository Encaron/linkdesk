/**
 * SettingRow 行内常量——E6#87d 自 SettingRow.tsx 逐字搬出（只搬家，零逻辑变更）。
 */

// E5.8#6.6 hex 豁免：取色器预设色板（颜色即数据——用户可选值，非样式硬编码）
// eslint-disable-next-line linkdesk/no-hardcoded-hex
export const COLOR_PICKER_PRESETS = ["#0078d4", "#e81123", "#10893e", "#ff8c00", "#6b69d6", "#0099bc"];

// E5.8#99（#6）：来源徽标 UI 元数据——codicon 图标（SVG 字体，随 currentColor 主题化）+ i18n label。
// 只含 user/mix（非默认态才显徽标，降噪；theme 态无徽标 = 主题来源）。deriveSourceBadge 保持纯函数。
export const SOURCE_BADGE_UI: Record<"user" | "mix", { glyph: string; labelKey: string }> = {
  user: { glyph: "codicon-edit", labelKey: "来源：用户覆盖" },
  mix: { glyph: "codicon-arrow-swap", labelKey: "来源：混搭域" },
};
