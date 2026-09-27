/**
 * @vitest-environment jsdom
 * E5.8#30.17（审视 ④）：Combobox 单元测试。
 * 覆盖提交语义三态（选择下拉项 / Enter / 失焦）——🔥 文本无变更不触发 onChange
 * （防误触发重副作用：波特率变更会关旧重开端口），是本组件最危险的行为面。
 *
 * 2026-09-27 补第二组：**点击面**（鼠标点箭头 / 点 field 死区）。改前 12 条全是
 * 键盘/焦点/取值路径，鼠标点击面一条没有 ⇒ 「箭头只能关不能开」这个 bug 在测试里
 * 完全不可见（用户实机挑出）。
 *
 * 零 @src/core import——下拉视觉复用 SelectBox 类，测试只断言行为。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";

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
  // 点击面归一（2026-09-27）后的两个可点区域：field 整块 / 箭头 span
  const field = result.container.querySelector(".ldk-combobox-field") as HTMLElement;
  const arrow = result.container.querySelector(".ldk-selectbox-arrow") as HTMLElement;
  // 下拉面板经 Portal 渲染到 body——用 body 查询
  const dropdownItems = () => document.querySelectorAll(".ldk-selectbox-item");
  return { ...result, input, field, arrow, onChange, dropdownItems };
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

  it("disabled → input 禁用 + ldk-combobox 挂 ldk-selectbox-disabled 类（pointer-events 阻断交互）", () => {
    const { container, input } = renderCombobox({ disabled: true });
    expect((input as HTMLInputElement).disabled).toBe(true);
    // jsdom 无法模拟浏览器对 disabled input 的 focus 阻断（fireEvent 直接派发事件），
    // 故断言视觉/交互层守卫类——真实浏览器中 disabled input 收不到 focus。
    expect(container.querySelector(".ldk-combobox")!.className).toContain("ldk-selectbox-disabled");
  });
});

/**
 * 点击面归一（2026-09-27）——用户实机挑出「点击很受限、很难用」。
 *
 * 改前只有 `<input>` 自己的像素管用：箭头 span 无点击处理、field 无点击处理
 * ⇒ 点它们既不聚焦也不开下拉；且开着时点箭头会让输入框失焦 ⇒ onBlur→commit→关闭
 * ⇒ **箭头只能关、不能开**。以下六条把两个半面都钉住。
 *
 * ⚠️ `fireEvent.mouseDown` 只派发事件，**不执行浏览器「mousedown 默认聚焦」**——
 * 故凡依赖聚焦链的用例都由被测代码自己 `input.focus()`（分支 ①/③ 都显式做了），
 * 这恰好也让测试验证了「焦点确实被驱动」这件事（断言 activeElement）。
 */
describe("Combobox 点击面（鼠标路径）", () => {
  it("🔥 点箭头（关着）→ 下拉打开 + 输入框获得焦点", () => {
    const { input, arrow, dropdownItems } = renderCombobox();
    expect(dropdownItems().length).toBe(0); // 起始关闭
    fireEvent.mouseDown(arrow);
    expect(dropdownItems().length).toBe(OPTIONS.length);
    expect(document.activeElement).toBe(input); // 顺带驱动了聚焦链
  });

  it("点箭头（开着）→ 下拉关闭，且文本无变更不触发 onChange（失焦提交语义不破）", () => {
    const { arrow, onChange, dropdownItems } = renderCombobox();
    fireEvent.mouseDown(arrow); // 开
    expect(dropdownItems().length).toBe(OPTIONS.length);
    fireEvent.mouseDown(arrow); // 关
    expect(dropdownItems().length).toBe(0);
    expect(onChange).not.toHaveBeenCalled(); // 🔥 无变更不触发——与「点外面」同语义
  });

  it("箭头关掉时文本有变更 → 提交（复用失焦链，不新增第二套提交路径）", () => {
    const { input, arrow, onChange, dropdownItems } = renderCombobox();
    fireEvent.mouseDown(arrow); // 开（顺带聚焦）
    fireEvent.change(input, { target: { value: "250000" } });
    fireEvent.mouseDown(arrow); // 关 → blur → commit
    expect(onChange).toHaveBeenCalledWith("250000");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(dropdownItems().length).toBe(0);
  });

  it("🔥 Escape 关掉后点箭头能重新开（「已聚焦但已关」态：onFocus 不再触发，靠显式 setOpen）", () => {
    const { input, arrow, dropdownItems } = renderCombobox();
    // 真聚焦（fireEvent.focus 只派发事件、不设 activeElement）——act 包住聚焦引发的 setState
    act(() => input.focus());
    fireEvent.keyDown(input, { key: "Escape" }); // 关掉但焦点仍在输入框
    expect(dropdownItems().length).toBe(0);
    expect(document.activeElement).toBe(input);
    fireEvent.mouseDown(arrow);
    expect(dropdownItems().length).toBe(OPTIONS.length);
  });

  it("点 field 内边距（原死区）→ 输入框获得焦点 + 下拉打开", () => {
    const { field, input, dropdownItems } = renderCombobox();
    expect(document.activeElement).not.toBe(input);
    fireEvent.mouseDown(field); // e.target = field 本身（不是 input、不是箭头）
    expect(document.activeElement).toBe(input);
    expect(dropdownItems().length).toBe(OPTIONS.length);
  });

  it("点输入框本身 → 保持打开（原生路径不被打断：拖动选字/定位光标）", () => {
    const { input, dropdownItems } = renderCombobox();
    fireEvent.focus(input);
    expect(dropdownItems().length).toBe(OPTIONS.length);
    fireEvent.mouseDown(input); // 分支 ② 早退——不该关
    expect(dropdownItems().length).toBe(OPTIONS.length);
  });

  it("箭头 aria-hidden——键盘开关是 ↑/↓/Enter/Escape，装饰字形不进可访问树", () => {
    const { arrow } = renderCombobox();
    expect(arrow.getAttribute("aria-hidden")).toBe("true");
  });
});
