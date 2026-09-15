/**
 * Slider——通用滑杆控件（E5.8#50.9）。
 * 外观设置第一个消费者（#50.10 玻璃五配置滑杆），插件以后也要用——壳先行建设通用 API 面。
 * 视觉对标 mockup 帧 3（01-图片玻璃态-mockup.html .slider：4px 圆角轨道 + accent 填充 + 12px 圆点 thumb）。
 * 实现：原生 <input type="range"> 样式化——Chromium 免费给拖拽/键盘（方向键/Home/End/PageUp/PageDown）/
 * 无障碍（原生 range = role="slider" + aria-valuemin/max/now），不手写 pointer 拖拽状态机（B 类 bug 高发区）。
 * 填充 = inline `--slider-pct` CSS 变量 → linear-gradient（mockup fill 语义，见 Slider.css）。
 * prefers-reduced-motion：原生 range 无动画，天然满足（无 transition 可禁）。
 */

import "./Slider.css";

interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** 无障碍标签（设置行 label 由 SettingRow 显示，此处供读屏） */
  ariaLabel?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

function Slider({ value, onChange, min = 0, max = 100, step = 1, ariaLabel, disabled, style }: SliderProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const pct = max > min ? ((clamp(value) - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      className="ldk-slider"
      value={clamp(value)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ...style, "--slider-pct": `${pct}%` } as React.CSSProperties}
    />
  );
}

export default Slider;
