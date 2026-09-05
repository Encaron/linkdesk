/**
 * ToastHost——E5.7#16 池侧 Toast 哑渲染器 + 🔥 2026-09-05 退场残骸回归。
 *
 * mock window.linkdesk.toast（preload 同款形状：onShow 快照推送 / dismiss / action）——
 * 组件只消费此命名空间。
 *
 * 覆盖：
 *   1. 入场：快照推送 → 渲染 + 双 rAF 后 toast-fade-in（对齐 InlineInput/QuickPick 的 rAF mock 法）
 *   2. 🔥 退场残骸回归：壳快照移除 toast → 标记 toast-exiting 留在 DOM 渲染退场；
 *      jsdom 无 CSS 过渡 → transitionend 永不触发 —— 旧 bug 使残骸永留 DOM；
 *      修后 EXIT_ANIM_MS+EXIT_CLEANUP_MARGIN_MS 兜底计时器保证移除（幂等 handleExited）
 *   3. 🔥 从未显示的 toast 被撤（入场 rAF 未跑完）——兜底路径同样清理，不依赖入场完成
 *   4. 动作回传：点主按钮 → action(id, actionId)；关闭按钮 → dismiss(id)
 *
 * 哑数据铁律：message/动作标签壳侧已解析，这里用虚构值（硬约束 21）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act, screen } from "@testing-library/react";
import ToastHost from "./ToastHost";
import type { PoolToastData, PoolToastItem } from "../../../core/types/pool/poolToast";

/* ── mock window.linkdesk.toast —— preload-pool 同款形状 ── */

type OnShowCb = (d: PoolToastData) => void;

const mockDismiss = vi.fn<(id: string) => void>();
const mockAction = vi.fn<(id: string, actionId: string) => void>();

let onShowCb: OnShowCb | null = null;

function installToastApi(): void {
  onShowCb = null;
  Object.defineProperty(window, "linkdesk", {
    value: {
      toast: {
        onShow: (cb: OnShowCb) => {
          onShowCb = cb;
          return () => { onShowCb = null; };
        },
        dismiss: (id: string) => mockDismiss(id),
        action: (id: string, actionId: string) => mockAction(id, actionId),
      },
    },
    writable: true,
    configurable: true,
  });
}

function demoItem(id: string): PoolToastItem {
  return { id, message: "演示消息 " + id, iconClass: "codicon-info" };
}

function push(data: PoolToastData): void {
  act(() => {
    onShowCb!(data);
  });
}

/* ── 模拟 rAF —— 入场/退场动画 effect 依赖（命名函数捕获法，对齐 InlineInput.test） ── */

const rafCallbacks: Array<(t: number) => void> = [];
const origRAF = globalThis.requestAnimationFrame;
const origCAF = globalThis.cancelAnimationFrame;

/** 捕获型 rAF——回调入队，不自动跑；由 flushAllFrames 按帧显式冲刷 */
function enqueueRaf(cb: (t: number) => void): number {
  rafCallbacks.push(cb);
  return rafCallbacks.length - 1;
}
/** 未触发的 rAF 置空——effect cleanup 取消句柄用 */
function noopRaf(id: number): void {
  rafCallbacks[id] = () => {};
}
/** 冲刷当前帧的全部 rAF 回调（包 act——内部都是 setState） */
function flushAllFrames(): void {
  act(() => {
    const cbs = rafCallbacks.splice(0);
    for (const cb of cbs) cb(0);
  });
}

/** 退场兜底 = 200ms 过渡 + 80ms 余量——推进超过 280ms 即覆盖兜底触发点 */
const EXIT_FALLBACK_MS = 300;

beforeEach(() => {
  installToastApi();
  mockDismiss.mockClear();
  mockAction.mockClear();
  rafCallbacks.length = 0;
  globalThis.requestAnimationFrame = enqueueRaf as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = noopRaf as typeof cancelAnimationFrame;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  globalThis.requestAnimationFrame = origRAF;
  globalThis.cancelAnimationFrame = origCAF;
});

/* ── 入场/动作 ── */

describe("ToastHost 哑渲染 + 动作回传", () => {
  it("壳推送 → 渲染消息；双 rAF 后进 toast-fade-in（入场完成）", () => {
    render(<ToastHost />);
    push({ toasts: [demoItem("demo-a")], suppressed: false });

    expect(screen.getByText("演示消息 demo-a")).toBeTruthy();

    flushAllFrames();
    flushAllFrames();
    const item = document.querySelector(".toast-item");
    expect(item).not.toBeNull();
    expect(item!.className).toContain("toast-fade-in");
  });

  it("点主按钮 → action(id, actionId) 回传壳；点关闭 → dismiss(id)", () => {
    render(<ToastHost />);
    push({
      toasts: [{
        id: "demo-a",
        message: "演示消息 demo-a",
        iconClass: "codicon-info",
        actions: [{ actionId: "0", label: "重试", isPrimary: true }],
      }],
      suppressed: false,
    });
    flushAllFrames();
    flushAllFrames();

    const primary = document.querySelector(".toast-action-btn.primary") as HTMLButtonElement;
    expect(primary).not.toBeNull();
    fireEvent.click(primary);
    expect(mockAction).toHaveBeenCalledWith("demo-a", "0");

    const closeBtn = document.querySelector(".toast-close-btn") as HTMLButtonElement;
    fireEvent.click(closeBtn);
    expect(mockDismiss).toHaveBeenCalledWith("demo-a");
  });
});

/* ── 🔥 2026-09-05 退场残骸回归 ── */

describe("退场残骸回归（jsdom 无 CSS 过渡 → transitionend 永不触发）", () => {
  it("壳移除已显示的 toast → 进 toast-exiting 留在 DOM 渲染退场；兜底计时器保证移除（旧 bug：永留 opacity 0 残骸）", () => {
    vi.useFakeTimers();
    render(<ToastHost />);
    push({ toasts: [demoItem("demo-1")], suppressed: false });
    flushAllFrames();
    flushAllFrames(); // 入场完成——可见态下被撤（生产实测主路径）
    expect(screen.getByText("演示消息 demo-1")).toBeTruthy();

    // 壳移除 → 进退出态：DOM 保留渲染退场动画（不该瞬间消失）
    push({ toasts: [], suppressed: false });
    const exiting = document.querySelector(".toast-item");
    expect(exiting).not.toBeNull();
    expect(exiting!.className).toContain("toast-exiting");

    // 不退 rAF、无 transitionend（jsdom 本来就不发）→ 仅靠兜底计时器也须从 DOM 移除
    act(() => {
      vi.advanceTimersByTime(EXIT_FALLBACK_MS);
    });
    expect(screen.queryByText("演示消息 demo-1")).toBeNull();
    expect(document.querySelector(".toast-item")).toBeNull();
  });

  it("从未显示的 toast 被撤（入场 rAF 未跑完、visible=false）——兜底路径同样清理，不依赖入场完成", () => {
    vi.useFakeTimers();
    render(<ToastHost />);
    push({ toasts: [demoItem("demo-x")], suppressed: false });
    expect(screen.getByText("演示消息 demo-x")).toBeTruthy();

    // 立即撤——退场 effect 走 !visible 分支：无 rAF，纯兜底计时器
    push({ toasts: [], suppressed: false });
    act(() => {
      vi.advanceTimersByTime(EXIT_FALLBACK_MS);
    });
    expect(screen.queryByText("演示消息 demo-x")).toBeNull();
    expect(document.querySelector(".toast-item")).toBeNull();
  });
});
