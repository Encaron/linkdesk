/**
 * 重启前落盘注册表（2026-11-25 · 独立窗白屏的第三处根因）。
 *
 * `shell.relaunch` 的实现是 `app.exit(0)`（`electron/main.ts` 明写「不被任何 beforeunload 拦截」）
 * ⇒ 这条路上 renderer 的 beforeunload **不会跑**。所以 `relaunchApp()` 必须主动
 * `flushLayoutSync()` 把布局（含脱出窗 tabs）落盘，否则重启后的窗只有壳没有内容。
 *
 * 本文件钉的是**注册表的可调用性**：注册了 ⇒ 被调用；没注册/抛错 ⇒ 静默（落盘失败不许挡住重启）。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { flushLayoutSync, registerLayoutFlush } from "./LayoutService";

afterEach(() => {
  registerLayoutFlush(null);
});

describe("registerLayoutFlush / flushLayoutSync", () => {
  it("注册后 flush 调到同一个函数（壳把它的 writeNow 注进来）", () => {
    const fn = vi.fn();
    registerLayoutFlush(fn);
    flushLayoutSync();
    expect(fn).toHaveBeenCalledTimes(1);
    flushLayoutSync();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("注销后静默 no-op", () => {
    const fn = vi.fn();
    registerLayoutFlush(fn);
    registerLayoutFlush(null);
    expect(() => flushLayoutSync()).not.toThrow();
    expect(fn).not.toHaveBeenCalled();
  });

  it("落盘器抛错不能挡住重启", () => {
    registerLayoutFlush(() => {
      throw new Error("disk full");
    });
    expect(() => flushLayoutSync()).not.toThrow();
  });
});
