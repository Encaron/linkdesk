/**
 * updateAutoRetry 单测——#57.9g（04 池「更新检查遇匿名限流」A 案后半，2026-09-27）。
 *
 * 逐条对 08-调度归属与失败重试 §2.4 的判据草案：
 *   1. 单测·序列——桩一个可重试失败，断言退避序列的字面值（1min → 5min → 20min，共 3 棒，
 *      每棒载荷恒为 `checkForUpdates(false)` 后台语义值）；
 *   2. 负控·分类真的生效——确定性失败（not-found / invalid-response / asset-missing）一次都不重试；
 *   3. 负控·上限真的生效——三棒全败后停手，不再有第四棒；
 *   4. 出声不吞——重试全程静默（不推任何提示条）由结构保证：本模块对通知面零调用，
 *      `useUpdateNotifications.test.ts` 的既有判据（后台静默）不因接线而变。
 * 外加五问④ 的互动两条：手动重查再败 ⇒ 从第一棒重起；撞车（checking）⇒ 链原地保留。
 *
 * 手法：假的壳 preload 更新面（`window.linkdesk.update` 桩）+ 假定时器——与 useUpdateScheduler.test.ts
 * 同款。fixture 全虚构（硬约束 21）。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RETRY_DELAYS_MS, noteCheckOutcome, __resetUpdateAutoRetryForTests } from "./updateAutoRetry";
import type { UpdateState } from "../core/types/ipc/update";

const checkForUpdates = vi.fn(async () => ({ type: "idle" }) as UpdateState);

/** 最小桩——本模块只消费 `checkForUpdates` 一条（有意不同于 useUpdateScheduler.test.ts 的全形桩，避免重复克隆） */
function installShellApi(): void {
  (window as unknown as { linkdesk: unknown }).linkdesk = { update: { checkForUpdates } };
}

/** 可重试失败的结局——code 按需覆盖 */
function failWith(code: string): UpdateState {
  return { type: "idle", lastError: { code, message: `demo 失败（${code}）` } } as UpdateState;
}

beforeEach(() => {
  checkForUpdates.mockClear();
  checkForUpdates.mockImplementation(async () => ({ type: "idle" }) as UpdateState);
  installShellApi();
  vi.useFakeTimers();
});

afterEach(() => {
  __resetUpdateAutoRetryForTests();
  vi.useRealTimers();
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
});

/** 推进 t 毫秒并让在途的微任务落定（重试棒是 async） */
async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("#57.9g 判据 1——退避序列的字面值", () => {
  it("三棒按 1min → 5min → 20min 退避，每棒载荷恒为 checkForUpdates(false)", async () => {
    checkForUpdates.mockResolvedValue(failWith("rate-limited"));
    noteCheckOutcome(failWith("network")); // 原始失败（后台或手动，链的起点）

    await advance(RETRY_DELAYS_MS[0] - 1);
    expect(checkForUpdates).not.toHaveBeenCalled();
    await advance(1);
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
    expect(checkForUpdates).toHaveBeenLastCalledWith(false); // 后台语义值（07 §4.1）

    await advance(RETRY_DELAYS_MS[1] - 1);
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(checkForUpdates).toHaveBeenCalledTimes(2);

    await advance(RETRY_DELAYS_MS[2] - 1);
    expect(checkForUpdates).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(checkForUpdates).toHaveBeenCalledTimes(3);
  });
});

describe("#57.9g 判据 2——分类真的生效（负控）", () => {
  it("确定性失败一次都不重试——没有「全都重试」的退化实现", async () => {
    for (const code of ["not-found", "invalid-response", "asset-missing", "version-unparsable", "checksum-mismatch"]) {
      noteCheckOutcome(failWith(code));
    }
    await advance(RETRY_DELAYS_MS[0] + RETRY_DELAYS_MS[1] + RETRY_DELAYS_MS[2] + 1_000);
    expect(checkForUpdates).not.toHaveBeenCalled();
  });

  it("成功结局撤链——失败后（重试未发）检查成功了 ⇒ 待发的棒撤掉", async () => {
    noteCheckOutcome(failWith("rate-limited"));
    noteCheckOutcome({ type: "idle" }); // 已最新——撤链
    await advance(RETRY_DELAYS_MS[0] + RETRY_DELAYS_MS[2] + 1_000);
    expect(checkForUpdates).not.toHaveBeenCalled();
  });

  it("available（重试或手动查到了新版本）同样撤链", async () => {
    noteCheckOutcome(failWith("network"));
    noteCheckOutcome({
      type: "available",
      update: {
        version: "9.9.9",
        currentVersion: "0.2.18",
        publishedAt: "2026-09-27T00:00:00Z",
        releaseNotesUrl: "https://example.invalid/tag/v9.9.9",
        downloadUrl: "https://example.invalid/download.exe",
      },
    } as UpdateState);
    await advance(RETRY_DELAYS_MS[0] + RETRY_DELAYS_MS[2] + 1_000);
    expect(checkForUpdates).not.toHaveBeenCalled();
  });
});

describe("#57.9g 判据 3——上限真的生效（负控）", () => {
  it("三棒全败后停手——往后无论推多久都不再有第四棒", async () => {
    checkForUpdates.mockResolvedValue(failWith("rate-limited"));
    noteCheckOutcome(failWith("network"));

    await advance(RETRY_DELAYS_MS[0] + RETRY_DELAYS_MS[1] + RETRY_DELAYS_MS[2]);
    expect(checkForUpdates).toHaveBeenCalledTimes(3);

    await advance(RETRY_DELAYS_MS[0] * 10);
    expect(checkForUpdates).toHaveBeenCalledTimes(3);
  });
});

describe("五问④——与手动检查的互动", () => {
  it("手动重查再败 ⇒ 链从第一棒重起（不是接着旧棒数等）", async () => {
    noteCheckOutcome(failWith("rate-limited")); // 原始失败 → 链在 t0+60s 待发
    await advance(30_000);
    noteCheckOutcome(failWith("network")); // 用户手动重查，又败 → 重起：t30+60s = t90s

    await advance(30_000); // t60s——旧链若未被重起，这里会发棒
    expect(checkForUpdates).not.toHaveBeenCalled();

    await advance(30_000); // t90s——新链的第一棒
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("撞车（结局是 checking）⇒ 在途不动链：待发的棒保留、到点照发", async () => {
    noteCheckOutcome(failWith("rate-limited"));
    await advance(30_000);
    noteCheckOutcome({ type: "checking" } as UpdateState); // 手动检查恰在途

    await advance(RETRY_DELAYS_MS[0] - 30_000);
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
    expect(checkForUpdates).toHaveBeenLastCalledWith(false);
  });
});

describe("边界", () => {
  it("null 结局（非壳环境）忽略——不立链也不炸", () => {
    expect(() => noteCheckOutcome(null)).not.toThrow();
  });

  it("重试棒抛异常（检查腿契约违反）⇒ 撤链不再续，不炸", async () => {
    checkForUpdates.mockRejectedValue(new Error("检查腿契约违反"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    noteCheckOutcome(failWith("network"));

    await advance(RETRY_DELAYS_MS[0]);
    expect(spy).toHaveBeenCalled();
    await advance(RETRY_DELAYS_MS[1] + RETRY_DELAYS_MS[2] + 1_000);
    expect(checkForUpdates).toHaveBeenCalledTimes(1); // 不因异常而重排
    spy.mockRestore();
  });
});
