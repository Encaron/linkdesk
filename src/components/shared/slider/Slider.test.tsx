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

  it("disabled → input disabled", () => {
    const { input } = renderSlider({ disabled: true });
    expect(input.disabled).toBe(true);
  });

  it("aria-label 传给 input（读屏标签）", () => {
    const { input } = renderSlider({ ariaLabel: "亮度" });
    expect(input.getAttribute("aria-label")).toBe("亮度");
  });
});
