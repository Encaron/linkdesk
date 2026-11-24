/**
 * AiPolicyPicker 单测——受控组件 / 键盘 / aria（`01-设计/03` §2.2）。
 *
 * 🔴 钉的是「它只是画」：`onChange` 只上报（组件内**没有**配置写入），缺省不画提示条。
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AiPolicyPicker, { type AiPolicyCapability, type AiPolicyOption } from "./AiPolicyPicker";

// 文案常量放 JSX 之外（fixture 不走 t()；⚠️ 只为本文件断言用）
const ARIA = "AI 权限档位";
const NOTE = "会一直有效";
const RESET = "改成自主";

const OPTIONS: AiPolicyOption[] = [
  { value: "read", label: "只读", description: "AI 只能查看，不能修改。" },
  { value: "ask", label: "逐次确认", description: "AI 每次修改前都会询问你。" },
  { value: "auto", label: "自主", description: "日常修改由 AI 完成。" },
  { value: "full", label: "完全访问", description: "所有操作都不再询问。" },
];

const CAPS: AiPolicyCapability[] = [
  { label: "查看", decision: "allow" },
  { label: "打开标签", decision: "deny" },
];

describe("AiPolicyPicker", () => {
  it("radiogroup ＋ 每段 radio，选中项 aria-checked=true", () => {
    render(<AiPolicyPicker value="auto" options={OPTIONS} onChange={() => {}} ariaLabel={ARIA} />);
    const group = screen.getByRole("radiogroup", { name: "AI 权限档位" });
    expect(group).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(4);
    expect(screen.getByRole("radio", { name: "自主" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "只读" }).getAttribute("aria-checked")).toBe("false");
  });

  it("点击别的段只上报 onChange（⛔ 不自己写配置/不改选中态）", () => {
    const onChange = vi.fn();
    render(<AiPolicyPicker value="auto" options={OPTIONS} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "只读" }));
    expect(onChange).toHaveBeenCalledWith("read");
    // 受控：值仍由调用方决定
    expect(screen.getByRole("radio", { name: "自主" }).getAttribute("aria-checked")).toBe("true");
  });

  it("键盘：→ 选下一档、End 选最后一档、Home 选第一档（焦点落在选中段）", () => {
    const onChange = vi.fn();
    const { rerender } = render(<AiPolicyPicker value="read" options={OPTIONS} onChange={onChange} />);
    const group = screen.getByRole("radiogroup");
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("ask");
    rerender(<AiPolicyPicker value="ask" options={OPTIONS} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("full");
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("read");
  });

  it("disabled ⇒ 点击与键盘都不上报，且按钮禁用", () => {
    const onChange = vi.fn();
    render(<AiPolicyPicker value="auto" options={OPTIONS} disabled onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "只读" }));
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowLeft" });
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByRole("radio", { name: "只读" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("full ＋ note ＋ onReset ⇒ 出现常驻提示与「改成自主」按钮（其它档不画）", () => {
    const onReset = vi.fn();
    const { rerender } = render(
      <AiPolicyPicker value="auto" options={OPTIONS} onChange={() => {}} note={NOTE} onReset={onReset} resetLabel={RESET} />,
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: RESET })).toBeNull();
    rerender(
      <AiPolicyPicker value="full" options={OPTIONS} onChange={() => {}} note={NOTE} onReset={onReset} resetLabel={RESET} />,
    );
    expect(screen.getByRole("status").textContent).toContain(NOTE);
    fireEvent.click(screen.getByRole("button", { name: "改成自主" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("当前档说明与能力摘要都渲染（文案由调用方传入，⛔ 组件不内建话术）", () => {
    render(
      <AiPolicyPicker value="auto" options={OPTIONS} capabilities={CAPS} onChange={() => {}} />,
    );
    expect(screen.getByText("日常修改由 AI 完成。")).toBeTruthy();
    expect(screen.getByText("允许")).toBeTruthy();
    expect(screen.getByText("不允许")).toBeTruthy();
  });

  it("能力摘要不出现 emoji（结论一律文字）", () => {
    const { container } = render(
      <AiPolicyPicker value="auto" options={OPTIONS} capabilities={CAPS} onChange={() => {}} />,
    );
    expect(/[🌀-🫿☀-➿]/u.test(container.textContent ?? "")).toBe(false);
  });
});
