/**
 * 分段控件段内预览两原子——文字极性（Aa 样本）＋强调色来源（色块）。
 * E6#87d 自设置仓 `toneControls.tsx` 的 FontTonePreview 抽出（判据 A：只搬预览原子，
 * 两个 handler 留设置仓变薄绑定）。纯展示、零宿主耦合、零语义——「哪个 hint 值显示哪种
 * 极性/色块」的映射住消费方。
 *
 * 几何＝单一 swatch（52×30 ＋ var(--radius-sm)），两原子共用（设置页原归一化结论 #3）。
 * 颜色全走 CSS 变量（硬约束 1）：极性取样壳 `--tone-*` 实色标尺；自定义强调色读 `--accent`
 * （applyAccentColor 恒写 effective accent——三态全对，声明式读，零 IPC 零 DOM 读）。
 */

import "./SegmentPreview.css";

/** `Aa` 分半/单半样本——halves 为极性名单（"deep" | "light"），消费方按 hint 值给 */
export function SegmentPreviewText({ halves }: { halves: readonly string[] }) {
  return (
    <span className="ldk-segment-preview" aria-hidden="true">
      {halves.map((polarity, i) => (
        <span key={i} className={`ldk-segment-preview__half ldk-segment-preview__half--${polarity}`}>
          Aa
        </span>
      ))}
    </span>
  );
}

/** 色块样本——split = 中性分半（「主题决定强调色」示意）；accent = 实时生效强调色 */
export function SegmentPreviewSwatch({ variant }: { variant: "split" | "accent" }) {
  return <span className={`ldk-segment-preview ldk-segment-preview--${variant}`} aria-hidden="true" />;
}
