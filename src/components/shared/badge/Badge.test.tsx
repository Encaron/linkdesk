/**
 * @vitest-environment jsdom
 * E6#30.14b：壳 Badge/Capsule 基础件单元测试——渲染 children / 类名 / title 透传。
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import Badge from "./Badge";

afterEach(() => cleanup());

describe("Badge", () => {
  it("渲染 children", () => {
    const { getByText } = render(<Badge>Alpha</Badge>);
    expect(getByText("Alpha")).toBeTruthy();
  });

  it("类名 = ldk-badge", () => {
    const { getByText } = render(<Badge>Alpha</Badge>);
    expect(getByText("Alpha").className).toBe("ldk-badge");
  });

  it("title 透传为 data-hint（揭示类 ⇒ 延时归零；⛔ 不出原生 title=）", () => {
    const { getByText } = render(<Badge title="Demo title">Alpha</Badge>);
    const el = getByText("Alpha");
    expect(el.getAttribute("data-hint")).toBe("Demo title");
    expect(el.getAttribute("data-hint-delay")).toBe("0");
    expect(el.getAttribute("title")).toBeNull();
  });

  it("无 title ⇒ 不出提示属性（零噪声）", () => {
    const { getByText } = render(<Badge>Alpha</Badge>);
    const el = getByText("Alpha");
    expect(el.getAttribute("data-hint")).toBeNull();
    expect(el.getAttribute("data-hint-delay")).toBeNull();
  });
});
