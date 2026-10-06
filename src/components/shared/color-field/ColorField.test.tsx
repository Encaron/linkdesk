/**
 * @vitest-environment jsdom
 * ColorField（尾巴 T1）：色块几何／悬停提示属性／即时写语义／点击回调原样交事件。
 * 零 @src/core import——纯 UI 行为断言。
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

import ColorField from "./ColorField";

afterEach(() => {
  cleanup();
});

describe("ColorField", () => {
  it("色块取当前值作背景，并挂悬停提示（零延迟）", () => {
    const { container } = render(
      <ColorField value="#8a6ff0" onChange={() => {}} />,
    );
    const swatch = container.querySelector(".ldk-color-field__swatch") as HTMLElement;
    // jsdom 会把 hex 归一成 rgb(...)——断言归一后的形态，避免把 jsdom 的序列化习惯当成契约
    expect(swatch.style.background).toBe("rgb(138, 111, 240)");
    expect(swatch.getAttribute("data-hint")).toBe("#8a6ff0");
    expect(swatch.getAttribute("data-hint-delay")).toBe("0");
  });

  it("文本框即时写：每次输入即回调（不是失焦提交）", () => {
    const onChange = vi.fn();
    const { container } = render(<ColorField value="" onChange={onChange} />);
    const input = container.querySelector("input.ldk-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "#fff" } });
    expect(onChange).toHaveBeenCalledWith("#fff");
  });

  it("点色块把事件原样交给调用方（共享层不弹调色层）", () => {
    const onSwatchClick = vi.fn();
    const { container } = render(
      <ColorField value="#000" onChange={() => {}} onSwatchClick={onSwatchClick} />,
    );
    fireEvent.click(container.querySelector(".ldk-color-field__swatch") as HTMLElement);
    expect(onSwatchClick).toHaveBeenCalledTimes(1);
    expect(onSwatchClick.mock.calls[0][0].type).toBe("click");
  });

  it("未给 onSwatchClick 时点击不抛错（可选回调）", () => {
    const { container } = render(<ColorField value="#000" onChange={() => {}} />);
    expect(() =>
      fireEvent.click(container.querySelector(".ldk-color-field__swatch") as HTMLElement),
    ).not.toThrow();
  });
});
