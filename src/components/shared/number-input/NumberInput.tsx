/**
 * NumberInput——带 +/- 步进按钮的数字输入。
 * E5#57: 替代原生 <input type="number"> spinner——暗色/亮色主题统一外观。
 *
 * 壳侧实现——uiHint: "fontSize" 与普通 number 配置项共用此组件。
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import "./NumberInput.css";

interface NumberInputProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** E5.8 Phase 12 #161：数值单位后缀（如 "％"）——schema unit 声明走 i18n（F10）；空 = 裸数值 */
  unit?: string;
  style?: React.CSSProperties;
}

export default function NumberInput({ value, onChange, min, max, step = 1, unit, style }: NumberInputProps) {
  const { t } = useTranslation();
  const clamp = useCallback(
    (v: number) => {
      let c = v;
      if (min !== undefined) c = Math.max(min, c);
      if (max !== undefined) c = Math.min(max, c);
      return c;
    },
    [min, max],
  );

  const handleStepDown = () => onChange(clamp(value - step));
  const handleStepUp = () => onChange(clamp(value + step));

  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;

  return (
    <div className="number-input" style={style}>
      <button
        className="number-input-btn"
        onClick={handleStepDown}
        disabled={atMin}
        tabIndex={-1}
        aria-label={t("减少")}
      >−</button>
      <input
        className="input number-input-field"
        type="text"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!isNaN(n)) onChange(clamp(n));
        }}
        style={{ width: 56, textAlign: "center" }}
      />
      {/* E5.8 Phase 12 #161：unit 后缀夹在 input 与 + 之间——+ 保持 :last-child 右圆角不破 */}
      {unit ? <span className="number-input-unit">{unit}</span> : null}
      <button
        className="number-input-btn"
        onClick={handleStepUp}
        disabled={atMax}
        tabIndex={-1}
        aria-label={t("增加")}
      >+</button>
    </div>
  );
}
