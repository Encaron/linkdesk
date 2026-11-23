/**
 * @vitest-environment jsdom
 *
 * FallbackFace 冒烟（2026-11-24 错误态与降级脸-UI化）：
 *   · 三变体 → 图标/语义色 class 与 role；
 *   · 三尺度 → 容器 class；panel/micro 不渲染详情披露；
 *   · 动作区 → 有 onRetry 才出主按钮，secondary 并列；
 *   · 诊断详情 → full 才渲染，键值成对。
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import FallbackFace from "./FallbackFace";

afterEach(cleanup);

describe("FallbackFace — 变体与语义", () => {
  it("crash：error 图标 + role=alert", () => {
    const { container } = render(<FallbackFace variant="crash" title="Crash demo" />);
    const root = container.querySelector(".ldk-fallback")!;
    expect(root.className).toContain("ldk-fallback--crash");
    expect(root.getAttribute("role")).toBe("alert");
    expect(container.querySelector(".ldk-fallback-icon")!.className).toContain("codicon-error");
  });

  it("missing：puzzle 图标 + role=status（中性，不点 --error）", () => {
    const { container } = render(<FallbackFace variant="missing" title="Plugin unavailable" />);
    const root = container.querySelector(".ldk-fallback")!;
    expect(root.getAttribute("role")).toBe("status");
    expect(container.querySelector(".ldk-fallback-icon")!.className).toContain("codicon-puzzle");
    expect(root.className).not.toContain("--crash");
  });
});

describe("FallbackFace — 尺度", () => {
  it("缺省 full；panel/micro 落对应 class", () => {
    const { container, rerender } = render(<FallbackFace variant="crash" title="x" />);
    expect(container.querySelector(".ldk-fallback")!.className).toContain("ldk-fallback--full");
    rerender(<FallbackFace variant="crash" scale="panel" title="x" />);
    expect(container.querySelector(".ldk-fallback")!.className).toContain("ldk-fallback--panel");
    rerender(<FallbackFace variant="crash" scale="micro" title="x" />);
    expect(container.querySelector(".ldk-fallback")!.className).toContain("ldk-fallback--micro");
  });

  it("micro 不渲染说明；panel/full 渲染", () => {
    const { container, rerender } = render(
      <FallbackFace variant="crash" title="x" description="one line" />
    );
    expect(container.querySelector(".ldk-fallback-desc")).not.toBeNull();
    rerender(<FallbackFace variant="crash" scale="micro" title="x" description="one line" />);
    expect(container.querySelector(".ldk-fallback-desc")).toBeNull();
  });

  it("详情只在 full 尺度渲染", () => {
    const detail = [{ label: "plugin id", value: "demo" }];
    const { container, rerender } = render(
      <FallbackFace variant="crash" title="x" detail={detail} />
    );
    expect(container.querySelector(".ldk-fallback-detail")).not.toBeNull();
    rerender(<FallbackFace variant="crash" scale="panel" title="x" detail={detail} />);
    expect(container.querySelector(".ldk-fallback-detail")).toBeNull();
  });
});

describe("FallbackFace — 动作", () => {
  it("onRetry 出主按钮并可点；secondary 并列", () => {
    const retry = vi.fn();
    const second = vi.fn();
    const { container } = render(
      <FallbackFace
        variant="crash"
        title="x"
        onRetry={retry}
        secondary={{ label: "Open store", onClick: second }}
      />
    );
    const buttons = container.querySelectorAll<HTMLButtonElement>(".ldk-fallback-btn");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].className).toContain("--primary");
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("无动作不出动作区", () => {
    const { container } = render(<FallbackFace variant="missing" title="x" />);
    expect(container.querySelector(".ldk-fallback-actions")).toBeNull();
  });
});
