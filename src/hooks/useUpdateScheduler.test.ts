/**
 * useUpdateScheduler——壳侧后台检查更新调度器单测（E6#57.9d）。
 *
 * 钉住 `useUpdateScheduler.ts` 的三条对外行为（都是"写错了也照样跑得起来"的时序，只有单测能拦）：
 * ① `auto` 档：mount 后 **30 秒**首次检查，此后**每 4 小时**一次，载荷恒为 `checkForUpdates(false)`
 *    （`false` = 后台，07 §4.1 显式语义值）；
 * ② `manual` 档：**一次都不自动发**——且不留空定时器；
 * ③ 切档即时生效（#57.9e 判据）：改 `app.update.mode` → 旧定时器拆掉、新档立刻接管；
 *    卸载（unmount）同样拆干净，不留跨用例泄漏的定时器。
 * 外加非壳环境退化（无 `window.linkdesk` ⇒ 到点静默不发、不抛）。
 *
 * 手法：假的配置服务（`vi.mock`）+ 假的壳 preload 更新面（`window.linkdesk.update` 桩）+ 假定时器。
 * 频率常量从实现侧 import——**不在测试里复读 30_000 / 4h 的字面量**，否则改常量测试仍绿（假门禁）。
 *
 * fixture 全虚构（硬约束 21）；URL 走 `.invalid` 保留域。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { INITIAL_DELAY_MS, CHECK_INTERVAL_MS } from "./useUpdateScheduler";

/** 假配置服务——壳侧配置读写的唯一入口（本档只用到读 + 变更通知两条） */
const cfg = vi.hoisted(() => {
  const listeners = new Set<(key: string) => void>();
  return {
    values: new Map<string, unknown>(),
    listeners,
    /** 模拟用户改配置：先写值，再广播变更键 */
    set(key: string, value: unknown) {
      this.values.set(key, value);
      for (const cb of [...listeners]) cb(key);
    },
  };
});

vi.mock("../core/services/configuration/ConfigurationService", () => ({
  getConfigurationValue: (key: string) => cfg.values.get(key),
  onDidChangeConfiguration: (cb: (key: string) => void) => {
    cfg.listeners.add(cb);
    return () => { cfg.listeners.delete(cb); };
  },
}));

/** 壳 preload 更新面桩——调度器只消费 `checkForUpdates` */
const checkForUpdates = vi.fn(async () => ({ type: "idle" }));

function installShellApi(): void {
  (window as unknown as { linkdesk: unknown }).linkdesk = {
    update: {
      checkForUpdates,
      getState: async () => ({ type: "idle" }),
      onStateChanged: () => () => {},
      downloadUpdate: async () => ({ type: "idle" }),
      quitAndInstall: async () => {},
    },
  };
}

beforeEach(() => {
  cfg.values.clear();
  cfg.listeners.clear();
  checkForUpdates.mockClear();
  checkForUpdates.mockImplementation(async () => ({ type: "idle" }));
  cfg.values.set("app.update.mode", "auto");
  installShellApi();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
});

const MODE_KEY = "app.update.mode";

/** 挂载调度器（import 在文件顶层——本档不需要干净模块，模块内无单例状态） */
async function mount() {
  const { useUpdateScheduler } = await import("./useUpdateScheduler");
  return renderHook(() => useUpdateScheduler());
}

describe("useUpdateScheduler（auto 档 ①）", () => {
  it("30 秒前不发；到点发一次（context=false），此后每 4 小时一次", async () => {
    const { unmount } = await mount();

    await act(async () => { await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS - 1); });
    expect(checkForUpdates).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
    // 后台检查必须显式传 false——省略参数是另一回事（07 §4.1）
    expect(checkForUpdates).toHaveBeenLastCalledWith(false);

    await act(async () => { await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS); });
    expect(checkForUpdates).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS); });
    expect(checkForUpdates).toHaveBeenCalledTimes(3);

    unmount();
  });

  it("卸载即拆定时器——此后不再发", async () => {
    const { unmount } = await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS); });
    expect(checkForUpdates).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 3); });

    expect(checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("后台检查被拒 ⇒ 记一条 console.error，不炸 React 树", async () => {
    checkForUpdates.mockImplementation(async () => { throw new Error("检查腿契约违反"); });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = await mount();

    await act(async () => { await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS); });

    expect(spy).toHaveBeenCalled();
    unmount();
    spy.mockRestore();
  });
});

describe("useUpdateScheduler（manual 档 ②）", () => {
  it("manual ⇒ 5 小时内一次都不自动发", async () => {
    cfg.values.set(MODE_KEY, "manual");
    const { unmount } = await mount();

    await act(async () => { await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS + CHECK_INTERVAL_MS * 2); });

    expect(checkForUpdates).not.toHaveBeenCalled();
    unmount();
  });
});

describe("useUpdateScheduler（切档即时生效 ③）", () => {
  it("auto → manual：旧定时器拆掉，此后不发", async () => {
    const { unmount } = await mount();

    // 首次还没到点就切 manual
    await act(async () => { cfg.set(MODE_KEY, "manual"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS + CHECK_INTERVAL_MS * 2); });

    expect(checkForUpdates).not.toHaveBeenCalled();
    unmount();
  });

  it("manual → auto：按新档立刻起算（30 秒 + 4 小时周期）", async () => {
    cfg.values.set(MODE_KEY, "manual");
    const { unmount } = await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS); });
    expect(checkForUpdates).not.toHaveBeenCalled();

    await act(async () => { cfg.set(MODE_KEY, "auto"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS); });
    expect(checkForUpdates).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS); });
    expect(checkForUpdates).toHaveBeenCalledTimes(2);

    unmount();
  });

  it("只认自己那个配置键——无关键变更不重起定时器", async () => {
    const { unmount } = await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS - 1); });

    // 无关键（虚构名）变更：若误把已跑的时间清零，首次检查会被推迟到 60 秒
    await act(async () => { cfg.set("demo.other.key", "x"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });

    expect(checkForUpdates).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe("useUpdateScheduler（非壳环境退化）", () => {
  it("无 window.linkdesk ⇒ 到点静默不发、不抛", async () => {
    delete (window as unknown as { linkdesk?: unknown }).linkdesk;
    const { unmount } = await mount();

    await act(async () => { await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS + CHECK_INTERVAL_MS); });

    expect(checkForUpdates).not.toHaveBeenCalled();
    unmount();
  });
});
