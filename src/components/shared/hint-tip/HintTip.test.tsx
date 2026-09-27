/**
 * HintTip 组件（糖）单测——04「悬停提示系统」件 1。
 *
 * 这一件薄到只有一处职责：**把 props 写成属性**。它的失效方向全是静默的——
 * 包了一层宿主 DOM（破坏调用方的 flex/`>`/`:nth-child` 假设）、无内容却写了空属性、
 * 非元素子代时抛错——所以值得钉住。
 *
 * 🔴 最关键的一条：**DOM 结构必须逐字节不变**（唯一子代原样，属性挂上去而已）。
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import HintTip from "./HintTip";

describe("HintTip（属性糖）", () => {
  it("label ⇒ 只写 data-hint，DOM 结构不变（唯一子代原样，不包宿主层）", () => {
    const { container } = render(
      <HintTip label="Minimize">
        <button type="button">−</button>
      </HintTip>,
    );
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("data-hint")).toBe("Minimize");
    expect(container.innerHTML).toBe('<button type="button" data-hint="Minimize">−</button>');
  });

  it("command ⇒ 只写 data-hint-command（文案与快捷键由渲染器查命令表补）", () => {
    render(
      <HintTip command="workbench.action.closeTab">
        <button type="button">×</button>
      </HintTip>,
    );
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("data-hint-command")).toBe("workbench.action.closeTab");
    expect(btn.hasAttribute("data-hint")).toBe(false);
  });

  it("label + command 并存 ⇒ 两个属性都在（文案优先、快捷键仍自动带——渲染器口径）", () => {
    render(
      <HintTip label="Close this one" command="workbench.action.closeTab">
        <button type="button">×</button>
      </HintTip>,
    );
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("data-hint")).toBe("Close this one");
    expect(btn.getAttribute("data-hint-command")).toBe("workbench.action.closeTab");
  });

  it("placement / openDelayMs ⇒ 属性为字符串（DOM 属性本来就是串）", () => {
    render(
      <HintTip label="Truncated label" placement="bottom" openDelayMs={0}>
        <span>A very long name…</span>
      </HintTip>,
    );
    const el = screen.getByText("A very long name…");
    expect(el.getAttribute("data-hint-placement")).toBe("bottom");
    expect(el.getAttribute("data-hint-delay")).toBe("0");
  });

  it("保底④：既无 label 又无 command ⇒ 子代**原样**返回（零属性、零空壳）", () => {
    const { container } = render(
      <HintTip>
        <button type="button">−</button>
      </HintTip>,
    );
    expect(container.innerHTML).toBe('<button type="button">−</button>');
  });

  it("保底④：label 为空串 ⇒ 同样原样返回（⛔ 不写 data-hint=\"\"——空属性进 DOM 是噪声）", () => {
    const { container } = render(
      <HintTip label="">
        <button type="button">−</button>
      </HintTip>,
    );
    expect(container.innerHTML).toBe('<button type="button">−</button>');
  });
});
