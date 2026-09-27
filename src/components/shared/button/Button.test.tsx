/**
 * @vitest-environment jsdom
 * E5.8#99：Button 实心动作按钮单元测试。
 * 渲染 children / 点击回调 / disabled 阻断 / title 透传 / type 默认 button
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import Button from "./Button";

afterEach(() => cleanup());

describe("Button", () => {
  it("渲染 children", () => {
    const { getByRole } = render(<Button>Alpha</Button>);
    expect(getByRole("button").textContent).toBe("Alpha");
  });

  it("点击 → onClick 触发", () => {
    const onClick = vi.fn();
    const { getByRole } = render(<Button onClick={onClick}>Alpha</Button>);
    fireEvent.click(getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled → 不触发 onClick", () => {
    const onClick = vi.fn();
    const { getByRole } = render(<Button onClick={onClick} disabled>Alpha</Button>);
    fireEvent.click(getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("title 透传为 data-hint（⛔ 不出原生 title=——那是 Chromium 小方框）", () => {
    const { getByRole } = render(<Button title="Demo title">Alpha</Button>);
    const btn = getByRole("button");
    expect(btn.getAttribute("data-hint")).toBe("Demo title");
    expect(btn.getAttribute("title")).toBeNull();
  });

  it("有可见文字 ⇒ 不让 aria-label 盖掉无障碍名（WCAG 2.5.3）", () => {
    const { getByRole } = render(<Button title="Demo title">Alpha</Button>);
    expect(getByRole("button").getAttribute("aria-label")).toBeNull();
  });

  it("图标型（无文字子代）⇒ 提示文案兼当无障碍名", () => {
    const { getByRole } = render(
      <Button title="Demo title">
        <span className="codicon codicon-add" />
      </Button>,
    );
    expect(getByRole("button").getAttribute("aria-label")).toBe("Demo title");
  });

  it("type 默认 button，可覆盖", () => {
    const { getByRole } = render(<Button>Alpha</Button>);
    expect(getByRole("button").getAttribute("type")).toBe("button");
  });

  it("缺省 variant = 无修饰类（现状不变）", () => {
    const { getByRole } = render(<Button>Alpha</Button>);
    expect(getByRole("button").className).toBe("ldk-button");
  });

  it.each(["success", "danger", "ghost"] as const)("variant=%s → ldk-button--%s 修饰类", (v) => {
    const { getByRole } = render(<Button variant={v}>Alpha</Button>);
    expect(getByRole("button").className).toBe(`ldk-button ldk-button--${v}`);
  });
});
