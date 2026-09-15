/**
 * @vitest-environment jsdom
 * E5.8#30.17（审视 ④）：Combobox 单元测试。
 * 覆盖提交语义三态（选择下拉项 / Enter / 失焦）——🔥 文本无变更不触发 onChange
 * （防误触发重副作用：波特率变更会关旧重开端口），是本组件最危险的行为面。
 *
 * 零 @src/core import——下拉视觉复用 SelectBox 类，测试只断言行为。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

import Combobox from "./Combobox";

const OPTIONS = ["9600", "19200", "38400", "57600", "115200", "230400"];

beforeEach(() => {
  // OverlayPortal 用 window/document——jsdom 已提供；清 body 残留 portal
  document.body.innerHTML = "";
  // jsdom 无 scrollIntoView 实现——滚动高亮项 stub（SelectBox 同款滚动 effect）
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

function renderCombobox(overrides: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  const props = {
    value: "115200",
    options: OPTIONS,
    onChange,
    ...overrides,
  };
  const result = render(<Combobox {...props} />);
  const input = result.container.querySelector("input")!;
  // 下拉面板经 Portal 渲染到 body——用 body 查询
  const dropdownItems = () => document.querySelectorAll(".ldk-selectbox-item");
  return { ...result, input, onChange, dropdownItems };
}

describe("Combobox", () => {
  it("渲染初始 value + 可编辑 input", () => {
    const { input } = renderCombobox();
    expect(input.value).toBe("115200");
    expect(input.getAttribute("inputMode")).toBe("text");
  });

  it("inputMode='numeric' → input 带 numeric 属性（波特率手输场景）", () => {
    const { input } = renderCombobox({ inputMode: "numeric" });
    expect(input.getAttribute("inputMode")).toBe("numeric");
  });

  it("聚焦 → 下拉打开，显示全量选项", () => {
    const { input, dropdownItems } = renderCombobox();
    fireEvent.focus(input);
    expect(dropdownItems().length).toBe(OPTIONS.length);
  });

  it("选择下拉项 → onChange(该值) + 下拉关闭", () => {
    const { input, onChange, dropdownItems } = renderCombobox();
    fireEvent.focus(input);
    const item = Array.from(dropdownItems()).find((el) => el.textContent === "230400")!;
    fireEvent.mouseDown(item);
    expect(onChange).toHaveBeenCalledWith("230400");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(dropdownItems().length).toBe(0); // 关闭
  });

  it("Enter 提交高亮项——ArrowDown 后 Enter → onChange(下一项)", () => {
    const { input, onChange } = renderCombobox();
    fireEvent.focus(input); // 高亮当前值 115200
    fireEvent.keyDown(input, { key: "ArrowDown" }); // → 230400
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("230400");
  });

  it("输入非标值 + Enter → onChange(手输值)（Combobox 相对 SelectBox 的核心增量）", () => {
    const { input, onChange } = renderCombobox();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "250000" } }); // 不在候选列表
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("250000");
  });

  it("🔥 失焦文本无变更 → 不触发 onChange（防误触发重开端口）", () => {
    const { input, onChange } = renderCombobox();
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("失焦文本有变更 → onChange(变更值)", () => {
    const { input, onChange } = renderCombobox();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "9600" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("9600");
  });

  it("Escape → 文本回退为 value + 下拉关闭 + 不触发 onChange", () => {
    const { input, onChange, dropdownItems } = renderCombobox();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("115200");
    expect(dropdownItems().length).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("输入过滤——输入 '23' 只显示匹配候选", () => {
    const { input, dropdownItems } = renderCombobox();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "23" } });
    const items = Array.from(dropdownItems()).map((el) => el.textContent);
    expect(items).toEqual(["230400"]);
  });

  it("disabled → input 禁用 + combobox 挂 ldk-selectbox-disabled 类（pointer-events 阻断交互）", () => {
    const { container, input } = renderCombobox({ disabled: true });
    expect((input as HTMLInputElement).disabled).toBe(true);
    // jsdom 无法模拟浏览器对 disabled input 的 focus 阻断（fireEvent 直接派发事件），
    // 故断言视觉/交互层守卫类——真实浏览器中 disabled input 收不到 focus。
    expect(container.querySelector(".combobox")!.className).toContain("ldk-selectbox-disabled");
  });
});
