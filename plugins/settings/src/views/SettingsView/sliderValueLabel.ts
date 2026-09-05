/**
 * 滑杆值标签格式化——E5.8#77 数值显示。
 * 纯函数零依赖：unit "×" → 倍数前缀 + 1 位小数（mockup ×1.0）；"px" → 数值 + 后缀；
 * 空 → 裸数值（0-1 不透明度 0.45）。渲染端 slider 分支消费。
 * 依赖方向：无（被 renderControl 消费 / sliderValueLabel.test 单测）。
 */

/**
 * 把滑杆当前值格式化为带单位标签。
 * - 非有限值（val 解析失败）→ 空串（防御）。
 * - "×"：前置 + toFixed(1)（×1.0 / ×1.5，mockup 倍数语义）。
 * - 其余单位：数值规整（去尾零）+ 单位后缀（16px / 0.5px）。
 * - 空单位：裸数值（0.45 / 1——不透明度直接显示）。
 */
export function formatSliderValue(v: number, unit?: string): string {
  if (!Number.isFinite(v)) return "";
  const text = unit === "×" ? v.toFixed(1) : String(Number(v.toFixed(2)));
  if (!unit) return text;
  return unit === "×" ? `${unit}${text}` : `${text}${unit}`;
}
