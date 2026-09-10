/**
 * reportError 单测——E6#73g（18 档 §五 G 定级）。
 *
 * 覆盖：severity 缺省 error（既有行为不变）；`wake: false` 能把背景性失败从「弹」降到「只角标」；
 * 不传 wake 时**不落** wake 字段（否则「生产者没表态」与「显式 false」不可区分，
 * 缺省判据 defaultWake 会被绕过）；silent 不落 toast。
 *
 * 注意 `reportError` 里 toast 推送是**动态 import**（避免循环依赖）——断言前必须让微任务队列跑完。
 * fixture 全虚构（硬约束 21：demo-plugin / 演示消息）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { reportError } from "./ErrorService";
import { getToasts, dismissToast } from "../ui/toast";

const PLUGIN = "demo-plugin";

/**
 * 等动态 import 的 promise 链跑完（import → then → pushToast）。
 * ⚠️ 用 `advanceTimersByTimeAsync(0)` 而不是裸 `Promise.resolve()`：假定时器下动态 import 的
 * 解析要多走几轮任务，裸微任务会在 toast 落库**之前**放行断言（写完就飘一位，全组用例集体错位）。
 */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers(); // ttl 计时器不拖慢 suite
  vi.spyOn(console, "error").mockImplementation(() => {}); // reportError 必 console.error——测试里静音
});

afterEach(() => {
  for (const t of getToasts()) dismissToast(t.id);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("reportError——toast 定级（E6#73g）", () => {
  it("缺省 → severity error、wake 走缺省（defaultWake 判为「弹」）", async () => {
    reportError({ message: "演示消息", source: PLUGIN });
    await flush();
    const t = getToasts()[0]!;
    expect(t.severity).toBe("error");
    expect(t.source).toBe(PLUGIN);
    expect(t.wake).toBe(true); // error 级缺省：唤醒
  });

  it("🔴 wake:false → 显式降为「只角标」（背景性失败不许弹面板）", async () => {
    reportError({ message: "演示消息", source: PLUGIN, wake: false });
    await flush();
    expect(getToasts()[0]!.wake).toBe(false);
  });

  it("显式 wake:true → 保住唤醒（不传才会走缺省）", async () => {
    reportError({ message: "演示消息", source: PLUGIN, severity: "info", wake: true });
    await flush();
    const t = getToasts()[0]!;
    expect(t.severity).toBe("info");
    expect(t.wake).toBe(true); // info 级缺省是「不弹」——显式置位必须压过它
  });

  it("silent → 只 console.error，不落 toast", async () => {
    reportError({ message: "演示消息", source: PLUGIN, silent: true });
    await flush();
    expect(getToasts()).toHaveLength(0);
  });
});
