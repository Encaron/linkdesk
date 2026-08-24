/**
 * E5.8#65：滑杆 step 推导——renderControl slider 分支选择 step。
 * 背景：bug 2/3——glassOpacity(0-1)/surfaceRadius(0.5-2) 滑杆只出端点值，
 * 根因 = renderControl 不传 step → Slider 默认 step=1 → 浮点区间中间值不可达。
 * 规则：端点非整数（浮点区间）或窄跨度（max-min ≤ 2）→ 0.01 连续可调；
 * 整数宽区间 → 1（现状整数步，零回归）。
 * 端点全整数但跨度小也必须连续（玻璃不透明度 0-1 即此类）——span 判据兜住。
 * 第三方可在 plugin.json contributes.configuration 显式声明 step 覆盖本推导（ConfigProperty.step）。
 */
export function inferSliderStep(min: number, max: number): number {
  const span = max - min;
  if (!Number.isInteger(min) || !Number.isInteger(max) || span <= 2) return 0.01;
  return 1;
}
