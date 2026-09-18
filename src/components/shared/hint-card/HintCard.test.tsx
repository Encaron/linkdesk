/**
 * E6#120 壳 HintCard 单测——保底四条（08 号档 §二第二步 ⑤）＋ 正控 ＋ 定位纯函数。
 *
 * 为什么值得一条测试（08 号档 §一.6 的 knip 口径）：保底四条的失效方向都是静默的——空文案出空壳、
 * 锚卸载卡残留、触屏点了没反应、空间不足裁字——眼睛不盯着就发现不了；`computeCardPosition` 是
 * 翻面/夹紧判据的单一实现，纯函数直接钉（jsdom 没有真布局，集成层面量不了）。
 */
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { computeCardPosition, default as HintCard } from "./HintCard";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("HintCard（E6#120 · 通用悬停说明卡）", () => {
  it("正控：悬停意图延时后出卡——文案渲染、title/note 各就位、aria-describedby 指向卡", () => {
    vi.useFakeTimers();
    render(
      <HintCard lines={["line one.", "line two."]} title="Status" note="footer note.">
        <button type="button">anchor</button>
      </HintCard>,
    );
    expect(screen.queryByRole("tooltip")).toBeNull(); // 延时未到不出卡
    fireEvent.mouseEnter(screen.getByText("anchor").parentElement!);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    const card = screen.getByRole("tooltip");
    expect(card.className).toBe("ldk-hint-card");
    expect(card.id).toBeTruthy();
    expect(screen.getByText("line one.")).toBeTruthy();
    expect(screen.getByText("line two.")).toBeTruthy();
    expect(screen.getByText("Status").className).toBe("ldk-hint-card-title");
    expect(screen.getByText("footer note.").className).toBe("ldk-hint-card-note");
    expect(screen.getByText("anchor").parentElement!.getAttribute("aria-describedby")).toBe(card.id);
  });

  it("保底④：空文案 ⇒ 不出卡、不出空壳（children 原样返回，连包装都不加）", () => {
    render(
      <HintCard lines={[]}>
        <button type="button">anchor</button>
      </HintCard>,
    );
    fireEvent.mouseEnter(screen.getByText("anchor"));
    fireEvent.focus(screen.getByText("anchor"));
    fireEvent.click(screen.getByText("anchor"));
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.getByText("anchor").closest(".ldk-hint-card-host")).toBeNull();
  });

  it("保底①：锚卸载 ⇒ 卡立刻收（portal 随组件整体卸载，结构上不可能残留）", () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <HintCard lines={["one line."]}>
        <button type="button">anchor</button>
      </HintCard>,
    );
    fireEvent.mouseEnter(screen.getByText("anchor").parentElement!);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole("tooltip")).toBeTruthy();
    unmount();
    expect(document.querySelector(".ldk-hint-card")).toBeNull();
  });

  it("保底③：触屏降级——点按出卡（无 hover 路径不许「没反应」）、点外收", () => {
    render(
      <HintCard lines={["one line."]}>
        <button type="button">anchor</button>
      </HintCard>,
    );
    const host = screen.getByText("anchor").parentElement!;
    fireEvent.click(host);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.pointerDown(document.body, { bubbles: true });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("Esc ＋ 失焦两个出口（保底②的键盘路径；与触屏那条用不同开法——点按 vs Tab 聚焦）", () => {
    render(
      <HintCard lines={["one line."]} openDelayMs={0}>
        <button type="button">anchor</button>
      </HintCard>,
    );
    const host = screen.getByText("anchor").parentElement!;
    fireEvent.focus(host); // 开法不同：键盘路径走聚焦出卡
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.keyDown(host, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(host);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.blur(host);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("知情出口：鼠标移开收（leave 立刻关，不等计时器）", () => {
    vi.useFakeTimers();
    render(
      <HintCard lines={["one line."]}>
        <button type="button">anchor</button>
      </HintCard>,
    );
    const host = screen.getByText("anchor").parentElement!;
    fireEvent.mouseEnter(host);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.mouseLeave(host);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("computeCardPosition（翻面 ＋ 夹紧——保底② 单一实现）", () => {
  const vp = { width: 1000, height: 800 };
  const anchor = { top: 100, bottom: 120, left: 500 };
  const card = { width: 300, height: 100 };

  it("空间充足 ⇒ 首选面原样（锚下缘 + 6px 间距）", () => {
    expect(computeCardPosition(anchor, card, vp, "bottom")).toEqual({
      top: 126,
      left: 500,
      placement: "bottom",
    });
  });

  it("下面贴不下、上面贴得下 ⇒ 翻面到 top（⛔ 不裁字）", () => {
    const nearBottom = { top: 700, bottom: 720, left: 500 };
    const r = computeCardPosition(nearBottom, card, vp, "bottom");
    expect(r.placement).toBe("top");
    expect(r.top).toBe(700 - 100 - 6);
  });

  it("两面都不够 ⇒ 夹紧到视口边缘（不许裁字也不许跑出屏）", () => {
    const huge = { width: 300, height: 900 }; // 卡比视口还高
    const r = computeCardPosition(anchor, huge, vp, "bottom");
    expect(r.top).toBe(8); // EDGE_PX
  });

  it("右缘溢出 ⇒ 左夹紧（格 5 信息栏贴窗口右缘的那条）", () => {
    const r = computeCardPosition({ top: 100, bottom: 120, left: 990 }, card, vp, "bottom");
    expect(r.left).toBe(1000 - 300 - 8);
  });
});
