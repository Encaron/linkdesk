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

  it("title 透传（tooltip）", () => {
    const { getByRole } = render(<Button title="Demo title">Alpha</Button>);
    expect(getByRole("button").getAttribute("title")).toBe("Demo title");
  });

  it("type 默认 button，可覆盖", () => {
    const { getByRole } = render(<Button>Alpha</Button>);
    expect(getByRole("button").getAttribute("type")).toBe("button");
  });
});
