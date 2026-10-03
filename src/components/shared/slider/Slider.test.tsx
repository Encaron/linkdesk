/**
 * @vitest-environment jsdom
 * E5.8#50.9：Slider 通用控件单元测试。
 * 渲染 value / onChange / clamp 边界 / 原生 range 键盘可达性（浏览器承担）/ disabled / step / aria-label
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import Slider from "./Slider";

afterEach(() => cleanup());

function renderSlider(overrides: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  const props = { value: 50, min: 0, max: 100, step: 1, onChange, ...overrides };
  const result = render(<Slider {...props} />);
  const input = result.container.querySelector("input[type=range]")! as HTMLInputElement;
  return { ...result, input, onChange };
}

describe("Slider", () => {
  it("渲染当前 value", () => {
    const { input } = renderSlider({ value: 60 });
    expect(input.value).toBe("60");
  });

  it("change → onChange 数值类型", () => {
    const { input, onChange } = renderSlider();
    fireEvent.change(input, { target: { value: "75" } });
    expect(onChange).toHaveBeenCalledWith(75);
  });

  it("clamp——value 超 max 渲染为 max", () => {
    const { input } = renderSlider({ value: 150, max: 100 });
    expect(input.value).toBe("100");
  });

  it("clamp——value 低于 min 渲染为 min", () => {
    const { input } = renderSlider({ value: -5, min: 0 });
    expect(input.value).toBe("0");
  });

  it("原生 range——键盘可达由浏览器承担（type=range 隐式 role=slider + 方向键）", () => {
    const { input } = renderSlider();
    expect(input.getAttribute("type")).toBe("range");
    // 隐式 role="slider" 由浏览器计算（jsdom getAttribute 只读显式属性）——type=range 即键盘可达保证
    expect(input).toBeInstanceOf(HTMLInputElement);
  });

  it("step 生效——step=10 时值按步进对齐", () => {
    const { input, onChange } = renderSlider({ value: 0, step: 10 });
    fireEvent.change(input, { target: { value: "70" } });
    expect(onChange).toHaveBeenCalledWith(70);
  });

  it("step 属性透传到原生 input（E5.8#65——浮点区间 step=0.01 连续可调）", () => {
    const { input } = renderSlider({ step: 0.01 });
    expect(input.getAttribute("step")).toBe("0.01");
    const { input: intInput } = renderSlider({ step: 1 });
    expect(intInput.getAttribute("step")).toBe("1");
  });

  it("disabled → input disabled", () => {
    const { input } = renderSlider({ disabled: true });
    expect(input.disabled).toBe(true);
  });

  it("aria-label 传给 input（读屏标签）", () => {
    const { input } = renderSlider({ ariaLabel: "亮度" });
    expect(input.getAttribute("aria-label")).toBe("亮度");
  });
});

describe("Slider · 值标签（unit / unitPosition，能力扩展 2026-10-03）", () => {
  it("unit 未声明 → 不渲染标签（裸滑杆，历史 DOM 原样）", () => {
    const { container } = renderSlider();
    expect(container.querySelector(".ldk-slider-root")).toBeNull();
    expect(container.querySelector(".ldk-slider-value")).toBeNull();
  });

  it("unit 未声明且无 stepper → 根节点就是 input 本身（零额外 DOM）", () => {
    const { container } = renderSlider();
    expect(container.firstElementChild!.tagName).toBe("INPUT");
  });

  it('unit=""（空串）→ 有标签、无单位（D6：空串 ≠ 未声明——设置页无单位键显示 0.5 靠这条）', () => {
    const { container } = renderSlider({ value: 0.45, unit: "" });
    expect(container.querySelector(".ldk-slider-root")).not.toBeNull();
    expect(container.querySelector(".ldk-slider-value")!.textContent).toBe("0.45");
  });

  it("unit 声明 → 标签 = 值＋单位一体（D1）", () => {
    const { container } = renderSlider({ value: 16, max: 32, unit: "px" });
    expect(container.querySelector(".ldk-slider-value")!.textContent).toBe("16px");
  });

  it("值超界 → 标签显示夹取后的值", () => {
    const { container } = renderSlider({ value: 150, max: 100, unit: "px" });
    expect(container.querySelector(".ldk-slider-value")!.textContent).toBe("100px");
  });

  it("unitPosition 缺省 after → data-pos=after；声明 before 照传", () => {
    const { container } = renderSlider({ unit: "px" });
    expect(container.querySelector<HTMLElement>(".ldk-slider-root")!.dataset.pos).toBe("after");
    const { container: c2 } = renderSlider({ unit: "px", unitPosition: "before" });
    expect(c2.querySelector<HTMLElement>(".ldk-slider-root")!.dataset.pos).toBe("before");
  });
});

describe("Slider · 细调步进（stepper，能力扩展 2026-10-03）", () => {
  function renderStepper(overrides: Record<string, unknown> = {}) {
    const base = renderSlider({ stepper: true, ...overrides });
    const minus = base.container.querySelector<HTMLButtonElement>('.ldk-slider-step[data-dir="-1"]')!;
    const plus = base.container.querySelector<HTMLButtonElement>('.ldk-slider-step[data-dir="1"]')!;
    return { ...base, minus, plus };
  }

  it("stepper 声明 → 渲染 −/＋ 两枚按钮（type=button，可聚焦）", () => {
    const { minus, plus } = renderStepper();
    expect(minus).not.toBeNull();
    expect(plus).not.toBeNull();
    expect(minus.getAttribute("type")).toBe("button");
    // E5：按钮必须可聚焦（⛔ 不做 tabIndex=-1 的偷懒解法）——键盘全链 Tab − → 轨道 → ＋
    expect(minus.getAttribute("tabindex")).toBeNull();
  });

  it("不声明 stepper → 一个按钮 DOM 都不多", () => {
    const { container } = renderSlider({ unit: "px" });
    expect(container.querySelectorAll(".ldk-slider-step")).toHaveLength(0);
  });

  it("＋ 按既有 step 步进（单击单发）", () => {
    const { plus, onChange } = renderStepper({ value: 10, step: 5 });
    plus.click();
    expect(onChange).toHaveBeenCalledWith(15);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("− 步进；浮点步进收敛（E7：step 0.05 不得出现 0.15000000000000002）", () => {
    const { minus, onChange } = renderStepper({ value: 0.2, step: 0.05 });
    minus.click();
    expect(onChange).toHaveBeenCalledWith(0.15);
  });

  it("min/max 夹取——值在 min 时 − 置灰、在 max 时 ＋ 置灰（E6 边界置灰）", () => {
    const atMin = renderStepper({ value: 0, min: 0, max: 100 });
    expect(atMin.minus.disabled).toBe(true);
    expect(atMin.plus.disabled).toBe(false);
    const atMax = renderStepper({ value: 100, min: 0, max: 100 });
    expect(atMax.minus.disabled).toBe(false);
    expect(atMax.plus.disabled).toBe(true);
  });

  it("disabled 联动——滑杆置灰时 −/＋ 同灰（E8），点击不发 onChange", () => {
    const { minus, plus, onChange, input } = renderStepper({ disabled: true });
    expect(input.disabled).toBe(true);
    expect(minus.disabled).toBe(true);
    expect(plus.disabled).toBe(true);
    plus.click();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("aria-label = 「减少/增加」＋控件标签（E12：文案走 t()，不写死）", () => {
    const { minus, plus } = renderStepper({ ariaLabel: "玻璃模糊" });
    expect(minus.getAttribute("aria-label")).toBe("减少 玻璃模糊");
    expect(plus.getAttribute("aria-label")).toBe("增加 玻璃模糊");
  });
});
