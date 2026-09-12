/**
 * useUpdateState——壳侧更新状态 hook 单测（E6#57.9c）。
 *
 * 逐条钉住 `useUpdateState.ts` 文件头的三条设计约束——这三条**都是"写反了也照样能跑"的那种**
 * （订阅晚一步 / 快照盖广播 / 引用计数漏减），只有单测能拦住：
 * ① 引用计数：两个消费者共享**一份** IPC 订阅，最后一个卸载才拆（硬约束 19）；
 * ② 订阅先于拉初值：`onStateChanged` 必须早于 `getState` 被调用（壳 preload 无回放缓冲）；
 * ③ 广播不回头：`getState()` 快照回来时若已收到广播 ⇒ 丢掉快照（不许用旧态盖新态）。
 * 外加非壳环境退化（无 `window.linkdesk` ⇒ 停在 uninitialized，不抛）。
 *
 * 🔴 被测模块持有**模块级单例**（`_state`/`_refCount`/订阅句柄）——每个用例 `vi.resetModules()` +
 * 动态 import 拿一份干净模块（对标 `electron/services/serial-service.test.ts` 的单例手法）；
 * 静态 import 会让上一个用例的状态漏进下一个。
 *
 * fixture 全虚构（硬约束 21）：版本号 9.9.9 / 0.0.1、URL 走 `.invalid` 保留域。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { UpdateState, UpdateInfo } from "../core/types/ipc/update";

/** 更新描述桩——字段值全虚构（`.invalid` = RFC 2606 保留域，永不解析） */
const INFO: UpdateInfo = {
  version: "9.9.9",
  currentVersion: "0.0.1",
  publishedAt: "2026-01-01T00:00:00Z",
  releaseNotesUrl: "https://demo.invalid/releases/v9.9.9",
};

type HookModule = typeof import("./useUpdateState");

interface Stub {
  /** `getState` 调用次数 */
  getStateCalls: () => number;
  /** 调用序——`["onStateChanged","getState"]` 即约束 ② 成立 */
  order: string[];
  /** 当前活着的订阅回调数（0 = 已拆） */
  listenerCount: () => number;
  /** 模拟主进程广播一次状态迁移 */
  emit: (state: UpdateState) => void;
  /** 让挂起的 `getState()` 以该快照 resolve */
  resolveSnapshot: (state: UpdateState) => void;
  /** 让挂起的 `getState()` reject */
  rejectSnapshot: (err: unknown) => void;
}

/** 装壳 preload 的 `window.linkdesk.update` 桩——`getState` 故意挂起，由用例决定何时 resolve（构造竞态） */
function installStub(): Stub {
  const handlers = new Set<(state: UpdateState) => void>();
  const order: string[] = [];
  let resolveSnapshot: ((state: UpdateState) => void) | undefined;
  let rejectSnapshot: ((err: unknown) => void) | undefined;
  let getStateCalls = 0;

  const update = {
    getState: () => {
      getStateCalls += 1;
      order.push("getState");
      return new Promise<UpdateState>((res, rej) => {
        resolveSnapshot = res;
        rejectSnapshot = rej;
      });
    },
    onStateChanged: (cb: (state: UpdateState) => void) => {
      order.push("onStateChanged");
      handlers.add(cb);
      return () => { handlers.delete(cb); };
    },
    checkForUpdates: async () => ({ type: "idle" }) as UpdateState,
    downloadUpdate: async () => ({ type: "idle" }) as UpdateState,
    quitAndInstall: async () => {},
  };
  (window as unknown as { linkdesk: unknown }).linkdesk = { update };

  return {
    getStateCalls: () => getStateCalls,
    order,
    listenerCount: () => handlers.size,
    emit: (state) => { for (const cb of [...handlers]) cb(state); },
    resolveSnapshot: (state) => { resolveSnapshot?.(state); },
    rejectSnapshot: (err) => { rejectSnapshot?.(err); },
  };
}

/** 干净的模块实例（模块级单例随 import 重来） */
let mod: HookModule;

beforeEach(async () => {
  vi.resetModules();
  mod = await import("./useUpdateState");
});

afterEach(() => {
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
  vi.restoreAllMocks();
});

describe("useUpdateState（约束 ② 订阅先于拉初值）", () => {
  it("挂载即先订阅、后拉初值，初值由 getState 快照落定", async () => {
    const stub = installStub();
    const { result } = renderHook(() => mod.useUpdateState());

    // ② 顺序：先 onStateChanged 再 getState——反过来写会丢掉这段窗口里的迁移
    expect(stub.order).toEqual(["onStateChanged", "getState"]);
    // 快照未回 ⇒ 停在状态机起点，不假装"已就绪"
    expect(result.current).toEqual({ type: "uninitialized" });

    await act(async () => { stub.resolveSnapshot({ type: "idle" }); });

    expect(result.current).toEqual({ type: "idle" });
  });

  it("广播驱动迁移——每个消费者都拿到新态", async () => {
    const stub = installStub();
    const { result } = renderHook(() => mod.useUpdateState());
    await act(async () => { stub.resolveSnapshot({ type: "idle" }); });

    act(() => {
      stub.emit({ type: "downloading", update: INFO, progress: { transferred: 5, total: 10, percent: 50 } });
    });

    expect(result.current).toMatchObject({ type: "downloading", progress: { percent: 50 } });
  });
});

describe("useUpdateState（约束 ③ 广播不回头）", () => {
  it("广播先到 ⇒ 更旧的 getState 快照被丢弃，状态不回退", async () => {
    const stub = installStub();
    const { result } = renderHook(() => mod.useUpdateState());

    // 广播（迁移通知）先于快照（异步、发出时刻更早）到达
    act(() => { stub.emit({ type: "checking" }); });
    expect(result.current).toEqual({ type: "checking" });

    // 快照这才回来——若采用它，UI 会永久停在 idle 直到下次迁移
    await act(async () => { stub.resolveSnapshot({ type: "idle" }); });

    expect(result.current).toEqual({ type: "checking" });
  });

  it("订阅后无广播 ⇒ 快照照常采用（约束 ③ 不是「永不采用」）", async () => {
    const stub = installStub();
    const { result } = renderHook(() => mod.useUpdateState());

    await act(async () => { stub.resolveSnapshot({ type: "available", update: INFO }); });

    expect(result.current).toMatchObject({ type: "available", update: { version: "9.9.9" } });
  });
});

describe("useUpdateState（约束 ① 引用计数）", () => {
  it("两个消费者共享一份订阅；最后一个卸载才拆", async () => {
    const stub = installStub();
    const first = renderHook(() => mod.useUpdateState());
    const second = renderHook(() => mod.useUpdateState());

    // 第二份消费者复用同一订阅，不重复注册（硬约束 19：模块级常驻监听 = 僵尸回调）
    expect(stub.getStateCalls()).toBe(1);
    expect(stub.listenerCount()).toBe(1);

    // 广播同时到达两个消费者
    act(() => { stub.emit({ type: "checking" }); });
    expect(first.result.current).toEqual({ type: "checking" });
    expect(second.result.current).toEqual({ type: "checking" });

    // 走掉一个 ⇒ 订阅仍在（另一个还要用）
    first.unmount();
    expect(stub.listenerCount()).toBe(1);

    // 全走 ⇒ 拆干净；此后广播不再触达任何人
    second.unmount();
    expect(stub.listenerCount()).toBe(0);
  });

  it("全卸后重挂：重开一份订阅并重新拉初值（unmount → remount 不悬空）", async () => {
    const stub = installStub();
    const first = renderHook(() => mod.useUpdateState());
    await act(async () => { stub.resolveSnapshot({ type: "idle" }); });
    first.unmount();
    expect(stub.listenerCount()).toBe(0);

    const again = renderHook(() => mod.useUpdateState());

    expect(stub.order.filter((c) => c === "onStateChanged")).toHaveLength(2);
    expect(stub.getStateCalls()).toBe(2);
    // 重挂直接吃已有态（模块级 _state 领先于本次 render），不闪回 uninitialized
    expect(again.result.current).toEqual({ type: "idle" });
  });
});

describe("useUpdateState（退化与非抛错面）", () => {
  it("无 window.linkdesk（vitest / 预览页）⇒ 停在 uninitialized，不抛", () => {
    // 不装桩——`getShellUpdateApi()` 返回 undefined，_start 直接 return
    const { result } = renderHook(() => mod.useUpdateState());

    expect(result.current).toEqual({ type: "uninitialized" });
    expect(mod.getShellUpdateApi()).toBeUndefined();
  });

  it("getState() 被拒 ⇒ 记一条 console.error，不抛进 React 树", async () => {
    const stub = installStub();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => mod.useUpdateState());

    await act(async () => { stub.rejectSnapshot(new Error("通道未注册")); });

    expect(spy).toHaveBeenCalled();
    expect(result.current).toEqual({ type: "uninitialized" });
    expect(stub.listenerCount()).toBe(1); // 订阅不受影响，后续广播仍能纠正
  });
});
