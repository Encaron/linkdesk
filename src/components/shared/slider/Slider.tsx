/**
 * Slider——通用滑杆控件（E5.8#50.9）。
 * 外观设置第一个消费者（#50.10 玻璃五配置滑杆），插件以后也要用——壳先行建设通用 API 面。
 * 视觉对标 mockup 帧 3（01-图片玻璃态-mockup.html .slider：4px 圆角轨道 + accent 填充 + 12px 圆点 thumb）。
 * 实现：原生 <input type="range"> 样式化——Chromium 免费给拖拽/键盘（方向键/Home/End/PageUp/PageDown）/
 * 无障碍（原生 range = role="slider" + aria-valuemin/max/now），不手写 pointer 拖拽状态机（B 类 bug 高发区）。
 * 填充 = inline `--slider-pct` CSS 变量 → linear-gradient（mockup fill 语义，见 Slider.css）。
 * prefers-reduced-motion：原生 range 无动画，天然满足（无 transition 可禁）。
 *
 * 能力扩展（2026-10-03，docs/04-软件更新/待抉择池/滑杆件-Slider能力扩展）——
 * 「值标签」与「细调步进」自设置仓包裹层下沉进组件（D3：组件自带能力，声明即显、不声明即无）：
 * - unit / unitPosition：值标签（当前值＋单位一体，D1）。⚠️ 空串 ≠ 未声明——未声明 = 不渲染标签
 *   （裸滑杆）；"" = 有标签无单位（如设置页不透明度的 0.5）。方位 D5：before/after 贴「按钮对」外侧，
 *   above/below 脱离行内流居中压轨道中线（配置键一律用缺省 after——上下方位撑破固定行高）。
 * - stepper：轨道两侧常驻 −/＋（D2，单击单发、长按连发不做）；按 step 步进、min/max 夹取、
 *   触边置灰、disabled 联动；步进按 step 小数位收敛浮点误差（E7）。按钮可聚焦（E5——
 *   ⛔ 不做「不可聚焦」的偷懒解法），键盘全链 = Tab − → 轨道 → ＋。
 * 结构（E13）：声明了任一能力时根节点 = .ldk-slider-root 网格盒；两者都不声明 = 返回裸 input
 * （与历史 DOM 逐字节一致，第三方零感知）。.ldk-slider 类名仍留在 input 上（后代选择器兼容）；
 * style prop 仍落在 input 上（不改既有 API 语义）。
 */

import { useTranslation } from "react-i18next";
import "./Slider.css";
import { formatSliderValue } from "./sliderValueLabel";

type UnitPosition = "before" | "after" | "above" | "below";

interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** 单位文案（px / ms / × / 毫米…由声明者自定）——声明了才有值标签；空串 = 有标签无单位 */
  unit?: string;
  /** 值标签方位（缺省 after）；above/below 只留插件自绘场景（撑破固定行高） */
  unitPosition?: UnitPosition;
  /** 轨道两侧 −/＋ 细调按钮（常驻，单击单发）；不声明 = 一个 DOM 都不多 */
  stepper?: boolean;
  /** 无障碍标签（设置行 label 由 SettingRow 显示，此处供读屏；stepper 按钮连带「减少/增加」＋此标签） */
  ariaLabel?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit,
  unitPosition = "after",
  stepper = false,
  ariaLabel,
  disabled,
  style,
}: SliderProps) {
  const { t } = useTranslation();
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  /** E7 浮点步进误差：按 step 的小数位收敛（0.05 步进连点不得出现 0.30000000000000004） */
  const snap = (v: number) => Number(v.toFixed((String(step).split(".")[1] ?? "").length));
  const shown = clamp(value);
  const pct = max > min ? ((shown - min) / (max - min)) * 100 : 0;
  const input = (
    <input
      type="range"
      className="ldk-slider"
      value={shown}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ...style, "--slider-pct": `${pct}%` } as React.CSSProperties}
    />
  );
  // 裸滑杆——两项能力都未声明 = 历史形态原样（不包裹、不多一个 DOM）
  if (unit === undefined && !stepper) return input;

  const atMin = shown <= min;
  const atMax = shown >= max;
  const stepTo = (dir: -1 | 1) => onChange(clamp(snap(shown + dir * step)));
  const stepBtn = (dir: -1 | 1) => (
    <button
      type="button"
      className="ldk-slider-step"
      data-dir={dir}
      disabled={disabled || (dir === -1 ? atMin : atMax)}
      aria-label={`${t(dir === -1 ? "减少" : "增加")}${ariaLabel ? ` ${ariaLabel}` : ""}`}
      onClick={() => stepTo(dir)}
    >
      <svg viewBox="0 0 10 10" fill="none" aria-hidden="true">
        {dir === -1 ? (
          <path d="M1.5 5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        ) : (
          <path d="M5 1.5v7M1.5 5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
  return (
    <span className="ldk-slider-root" data-pos={unit === undefined ? undefined : unitPosition} data-stepper={stepper}>
      {stepper && stepBtn(-1)}
      {input}
      {stepper && stepBtn(1)}
      {unit !== undefined && <span className="ldk-slider-value">{formatSliderValue(shown, unit)}</span>}
    </span>
  );
}

export default Slider;
