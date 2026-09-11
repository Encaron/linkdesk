/**
 * 分段控件的「每态预览」两件——文字极性（fontTone）+ 强调色来源（accentSource）。
 * E6#87d：自 renderControl.tsx 逐字搬出（原件 292 行以下四个自定义控件，另两个去了 imagePicker.tsx）。
 */

import { SegmentedRadio } from "@linkdesk/ui";

/** E5.8#91 文字极性预览半区映射——每态 = 系统双字系标尺两极性取样（深/浅），
 *  CSS 类消费 shell --tone-* 标尺 token（SettingsView.css，色值定义在 index.css :root）——TS 零 hex 零破例。 */
const FONT_TONE_POLARITY_HALVES: Record<string, readonly string[]> = {
  followTheme: ["deep", "light"], // 分半深/浅——主题明暗决定极性（深半亮字 + 浅半暗字并置）
  light: ["deep"], // 亮字（深底用）——深底白字
  dark: ["light"], // 暗字（浅底用）——浅底深字
};

/** 分段控件段内预览 swatch——单一几何（52×30 + var(--radius-sm)，SettingsView.css .settings-segmented-swatch），
 *  fontTone（Aa 分半）+ accentSource（色块）共用（#3 归一化——不再各自造 swatch 变体）。 */
function FontTonePreview({ value }: { value: string }): React.ReactNode {
  const halves = FONT_TONE_POLARITY_HALVES[value];
  if (!halves) return null;
  return (
    <span className="settings-segmented-swatch" aria-hidden="true">
      {halves.map((polarity, j) => (
        <span key={j} className={`settings-font-tone-half settings-font-tone-half--${polarity}`}>
          Aa
        </span>
      ))}
    </span>
  );
}

/**
 * E5.8#98+#99：强调色来源分段控件——两态（跟随主题配方/自定义）+ 段内预览（#3 归一化，对标 #91 每态预览）。
 * 跟随主题配方段 = 中性分半示意「主题决定强调色」（themeable 变量，非运行值——真实主题强调色遍布壳 UI）；
 * 自定义段 = 实时生效强调色——applyAccentColor 恒把 effective accent 写 --accent（自定义色 / 清除回主题 /
 *   跟随主题 三态全对），声明式读 CSS 变量（.settings-segmented-swatch--accent），零 IPC 零 DOM 读。
 * 选项映射（短标签/tooltip）走 mapSegmentedOptions 通用函数（#99 三消费方共用）。无线电语义 + roving tabindex 在壳 SegmentedRadio。
 * （#98 曾用段外生效 swatch——第三 swatch 变体，本号按归一化改为段内预览；E5.8 Phase 11.13 去命令式读数。）
 */
export function AccentSourceControl({
  value,
  options,
  onChange,
  t,
}: {
  value: string;
  options: { value: string; label: string; title: string }[];
  onChange: (v: unknown) => void;
  t: (key: string) => string;
}) {
  return (
    <SegmentedRadio
      value={value}
      ariaLabel={t("强调色来源")}
      options={options.map((opt) => ({
        ...opt,
        preview: opt.value === "custom" ? (
          <span className="settings-segmented-swatch settings-segmented-swatch--accent" aria-hidden="true" />
        ) : (
          <span className="settings-segmented-swatch settings-segmented-swatch--split" aria-hidden="true" />
        ),
      }))}
      onChange={(v) => onChange(v)}
    />
  );
}

/**
 * E5.8#91+#99：文字极性分段控件——三态（跟随主题/亮字/暗字）+ 每态预览方块。
 * 选项映射（短标签/tooltip）走 mapSegmentedOptions 通用函数（#99 三消费方共用）。
 * 预览块取样系统双字系标尺；跟随主题 = 分半深/浅示意「主题明暗决定极性」。
 */
export function FontToneControl({
  value,
  options,
  onChange,
  t,
}: {
  value: string;
  options: { value: string; label: string; title: string }[];
  onChange: (v: unknown) => void;
  t: (key: string) => string;
}) {
  return (
    <SegmentedRadio
      value={value}
      ariaLabel={t("文字极性")}
      options={options.map((opt) => ({ ...opt, preview: <FontTonePreview value={opt.value} /> }))}
      onChange={(v) => onChange(v)}
    />
  );
}
