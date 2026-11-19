/**
 * @vitest-environment jsdom
 * TransientToastStack 组件测——04 任务清单 Q3 组件面：
 *   × 常驻占位（02 B23：按钮**恒渲染**——不依赖 hover；像素级 rect 断言归 Q4 真机）/ Esc 关当前条（B22）/
 *   过期巡查 emit 回程 + B21 hover 全栈暂停 / 动作点击回程（notif:action index:0）/ 空栈零 DOM。
 * fixture 全虚构值（硬约束 21：demo-* 与明显虚构文案）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import TransientToastStack from "./TransientToastStack";
import type { ToastStackLayout } from "../../../core/types/pool/poolLayout";

const emitted: Array<[string, unknown]> = [];

beforeEach(() => {
  emitted.length = 0;
  (window as unknown as { linkdesk: unknown }).linkdesk = {
    events: { emit: (channel: string, payload?: unknown) => emitted.push([channel, payload]) },
  };
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
  vi.useRealTimers();
});

const item = (id: string, ttlMs: number, extra?: Partial<ToastStackLayout["items"][number]>) => ({
  id,
  message: `演示提示 ${id}`,
  severity: "info" as const,
  expiresAt: Date.now() + ttlMs,
  ...extra,
});

describe("TransientToastStack", () => {
  it("空栈 → 零 DOM（穿透纪律：容器零 hit area）", () => {
    const { container } = render(<TransientToastStack stack={{ items: [] }} />);
    expect(container.querySelector(".ldk-tt-stack")).toBeNull();
  });

  it("× 常驻占位（B23）：× 按钮**恒渲染**——不渲染时才叫依赖 hover（像素 rect 归 Q4 真机）", () => {
    const { getByRole } = render(
      <TransientToastStack stack={{ items: [item("demo-t1", 60_000)], dismissLabel: "关闭" }} />,
    );
    const x = getByRole("button", { name: "关闭" });
    expect(x).toBeTruthy();
    expect(x.className).toBe("ldk-tt-x");
  });

  it("× 点击 → notif:dismiss 回壳（单一写入路径）", () => {
    const { getByRole } = render(
      <TransientToastStack stack={{ items: [item("demo-t1", 60_000)], dismissLabel: "关闭" }} />,
    );
    fireEvent.click(getByRole("button", { name: "关闭" }));
    expect(emitted).toContainEqual(["notif:dismiss", "demo-t1"]);
  });

  it("动作点击 → notif:action {id, index:0}（壳端 executeCommand 经桥路由插件命令）", () => {
    const { getByText } = render(
      <TransientToastStack
        stack={{ items: [item("demo-t2", 60_000, { action: { title: "演示动作", command: "demo.cmd" } })] }}
      />,
    );
    fireEvent.click(getByText("演示动作"));
    expect(emitted).toContainEqual(["notif:action", { id: "demo-t2", index: 0 }]);
  });

  it("B22 Esc：焦点不在条上 → 关最新一条", () => {
    const { container } = render(
      <TransientToastStack
        stack={{ items: [item("demo-t1", 60_000), item("demo-t2", 60_000)], dismissLabel: "关闭" }}
      />,
    );
    fireEvent.keyDown(container.querySelector(".ldk-tt-stack")!, { key: "Escape" });
    expect(emitted).toContainEqual(["notif:dismiss", "demo-t2"]);
  });

  it("B22 Esc：焦点在某条内 → 关那一条（data-tt-id 回溯）", () => {
    const { container } = render(
      <TransientToastStack
        stack={{ items: [item("demo-t1", 60_000), item("demo-t2", 60_000)], dismissLabel: "关闭" }}
      />,
    );
    const first = container.querySelector<HTMLElement>('[data-tt-id="demo-t1"]')!;
    first.focus();
    fireEvent.keyDown(first, { key: "Escape" });
    expect(emitted).toContainEqual(["notif:dismiss", "demo-t1"]);
  });

  it("到期巡查：TTL 过 → notif:dismiss 回壳（B34 time-based：恢复后按时间戳一次判清）", () => {
    vi.useFakeTimers();
    const { container } = render(
      <TransientToastStack stack={{ items: [item("demo-t1", 300)], dismissLabel: "关闭" }} />,
    );
    vi.advanceTimersByTime(400);
    expect(emitted).toContainEqual(["notif:dismiss", "demo-t1"]);
    void container;
  });

  it("B21 hover 全栈暂停：栈内指针停留期间过期不回壳", () => {
    vi.useFakeTimers();
    const { container } = render(
      <TransientToastStack stack={{ items: [item("demo-t1", 300)], dismissLabel: "关闭" }} />,
    );
    fireEvent.mouseEnter(container.querySelector(".ldk-tt-stack")!);
    vi.advanceTimersByTime(500);
    expect(emitted).toHaveLength(0);
    fireEvent.mouseLeave(container.querySelector(".ldk-tt-stack")!);
    vi.advanceTimersByTime(100);
    expect(emitted).toContainEqual(["notif:dismiss", "demo-t1"]);
  });
});
