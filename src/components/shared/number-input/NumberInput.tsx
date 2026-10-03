/**
 * NumberInput——带 +/- 步进按钮的数字输入。
 * E5#57: 替代原生 <input type="number"> spinner——暗色/亮色主题统一外观。
 *
 * 壳侧实现——uiHint: "fontSize" 与普通 number 配置项共用此组件。
 *
 * 单一容器模型（2026-10-04 主题适配）：边框 / 圆角 / 高度只写在外框一处，内部三段
 * （− / 值格 / ＋）零边框零圆角，靠外框的 `overflow: hidden` 沿轮廓裁切。
 * 🔴 中间那格**不再借用全仓输入框的类名**——仓里那条输入框圆角规则是单类名，
 * 会按加载顺序抢赢外框，主题圆角一大就露出「半圆 ＋ 胶囊」（本案症状②）。
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
    <div className="ldk-number-input" style={style}>
      <button
        className="ldk-number-input-btn"
        data-dir="down"
        onClick={handleStepDown}
        disabled={atMin}
        tabIndex={-1}
        aria-label={t("减少")}
      >−</button>
      {/* 值单元格：值与单位同格、同一条居中轴——单位不再是容器的 flex 兄弟（本案症状③） */}
      <div className="ldk-number-input-cell">
        <input
          className="ldk-number-input-field"
          type="text"
          inputMode="numeric"
          value={value}
          aria-label={t("数值")}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!isNaN(n)) onChange(clamp(n));
          }}
        />
        {unit ? <span className="ldk-number-input-unit">{unit}</span> : null}
      </div>
      <button
        className="ldk-number-input-btn"
        data-dir="up"
        onClick={handleStepUp}
        disabled={atMax}
        tabIndex={-1}
        aria-label={t("增加")}
      >+</button>
    </div>
  );
}
