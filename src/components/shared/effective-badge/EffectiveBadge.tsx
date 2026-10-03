/**
 * EffectiveBadge——「生效值」呈现件（E5.8#155「跟随主题生效值徽标」的视觉收编）。
 *
 * 判据 C 的三层分工，本件是**最下面那层（纯呈现）**：
 * · 判定（哪个 token、跟随主题还是用户覆盖）→ **宿主**（配置读出面把 `effectiveToken` 解成
 *   `{ source, effective? }` 随数据一起给）；
 * · 格式化（字体栈截首族 / 色值配色块）→ 共享函数 `formatEffectiveValue`；
 * · 画（前缀 ＋ 色块 ＋ 值文字）→ **本件**。
 * ⇒ 设置插件、第三方面板、命令面板谁渲染都一样（换个插件也拿到同一个答案）。
 *
 * ⚠️ 与 `ReadOnlyText` 是**组装关系非变种**：值文字段复用 ReadOnlyText 原子画，
 * 本件只管「生效：」前缀 ＋ 色块 ＋ 呈胶囊底 —— 语义/结构/数据来源三样都不同。
 *
 * **显隐由编排层决定**（本件去掉 `mode` prop）：宿主说该显就渲染，说该隐就不渲染；
 * 空值兜底返回 null，但「跟随主题才显」这类判断**不住这里**。
 */
import ReadOnlyText from "../readonly-text/ReadOnlyText";
import "./EffectiveBadge.css";

export interface EffectiveBadgeProps {
  /** 前缀文案（调用方 `t()` 已译，如「生效：」）；缺省 = 只显值 */
  label?: string;
  /** 生效值原文（宿主解好）；空 ⇒ 不渲染 */
  value?: string;
  /** 值为色值形态时给的颜色 ⇒ 行内色块（由 `formatEffectiveValue` 判定，本件不判形态） */
  color?: string;
}

function EffectiveBadge({ label, value, color }: EffectiveBadgeProps) {
  if (!value) return null;
  return (
    <span className="ldk-effective-badge">
      {label ? <span className="ldk-effective-badge-label">{label}</span> : null}
      {color ? <span className="ldk-effective-swatch" style={{ background: color }} aria-hidden="true" /> : null}
      <span className="ldk-effective-badge-value">
        <ReadOnlyText value={value} />
      </span>
    </span>
  );
}

export default EffectiveBadge;
