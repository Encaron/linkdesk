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

  it("title 透传（悬停提示）", () => {
    const { getByText } = render(<Badge title="Demo title">Alpha</Badge>);
    expect(getByText("Alpha").getAttribute("title")).toBe("Demo title");
  });
});
