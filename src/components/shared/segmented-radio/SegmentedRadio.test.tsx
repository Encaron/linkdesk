/**
 * @vitest-environment jsdom
 * E5.8#99：SegmentedRadio 通用控件单元测试。
 * 渲染选中态 / 点击换档 / 方向键 roving tabindex / 无线电解语义 / preview 段内渲染 / aria-label
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import SegmentedRadio, { type SegmentedRadioOption } from "./SegmentedRadio";

afterEach(() => cleanup());

function renderRadio(options: SegmentedRadioOption[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
], overrides: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  const props = { options, value: "a", onChange, ariaLabel: "demo", ...overrides };
  const result = render(<SegmentedRadio {...props} />);
  const buttons = result.container.querySelectorAll<HTMLButtonElement>("button[role=radio]");
  return { ...result, buttons, onChange };
}

describe("SegmentedRadio", () => {
  it("渲染全部选项 + 当前值选中（aria-checked）", () => {
    const { buttons } = renderRadio();
    expect(buttons).toHaveLength(3);
    expect(buttons[0].getAttribute("aria-checked")).toBe("true");
    expect(buttons[1].getAttribute("aria-checked")).toBe("false");
  });

  it("roving tabindex——选中档 tabIndex=0，其余 -1", () => {
    const { buttons } = renderRadio();
    expect(buttons[0].tabIndex).toBe(0);
    expect(buttons[1].tabIndex).toBe(-1);
    expect(buttons[2].tabIndex).toBe(-1);
  });

  it("点击 → onChange 对应 value", () => {
    const { buttons, onChange } = renderRadio();
    fireEvent.click(buttons[1]);
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("方向键 → 换档聚焦 + onChange（ArrowRight 前进、ArrowLeft 后退、环绕）", () => {
    const { buttons, onChange } = renderRadio();
    fireEvent.keyDown(buttons[0], { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("b");
    expect(document.activeElement).toBe(buttons[1]);
    // 尾部 ArrowRight → 环绕到首档
    fireEvent.keyDown(buttons[2], { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("a");
    expect(document.activeElement).toBe(buttons[0]);
    // ArrowLeft 后退
    fireEvent.keyDown(buttons[1], { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("a");
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("非方向键不拦截（preventDefault 不触发）", () => {
    const { buttons, onChange } = renderRadio();
    fireEvent.keyDown(buttons[0], { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("preview 段内渲染——内容消费方自持", () => {
    const preview = <span data-testid="preview-sw" />;
    const { container } = renderRadio([
      { value: "a", label: "Alpha", preview },
      { value: "b", label: "Beta" },
    ]);
    expect(container.querySelector('[data-testid="preview-sw"]')).not.toBeNull();
  });

  it("title 透传（完整解释 tooltip）", () => {
    const { buttons } = renderRadio([
      { value: "a", label: "Alpha", title: "Alpha full" },
    ]);
    expect(buttons[0].getAttribute("title")).toBe("Alpha full");
  });

  it("aria-label 传给 radiogroup（读屏）", () => {
    const { container } = renderRadio();
    const group = container.querySelector("[role=radiogroup]")!;
    expect(group.getAttribute("aria-label")).toBe("demo");
  });
});
