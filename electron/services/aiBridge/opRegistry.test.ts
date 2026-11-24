/**
 * op 注册表单测——四态 / TTL / 容量淘汰（纯逻辑直打，注入 now/newId）。
 */
import { describe, it, expect } from "vitest";
import { createOpRegistry, OP_TTL_MS, OP_MAX_ENTRIES } from "./opRegistry.js";

function fixedClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("op 注册表：状态机（封闭四态）", () => {
  it("start ⇒ running；settle ⇒ done 带 result 与 elapsedMs", () => {
    const clock = fixedClock();
    const reg = createOpRegistry({ now: clock.now, newId: () => "op_00000001" });
    const { opId, startedAt } = reg.start();
    expect(opId).toBe("op_00000001");
    expect(startedAt).toBe(new Date(1_000_000).toISOString());
    expect(reg.status(opId)?.state).toBe("running");

    clock.advance(1500);
    reg.settle(opId, { hello: "world" });
    const v = reg.status(opId)!;
    expect(v.state).toBe("done");
    expect(v.result).toEqual({ hello: "world" });
    expect(v.elapsedMs).toBe(1500);
  });

  it("fail ⇒ failed 带统一错误信封（code/message/hint）", () => {
    const clock = fixedClock();
    const reg = createOpRegistry({ now: clock.now });
    const { opId } = reg.start();
    reg.fail(opId, { code: "EUNKNOWN", message: "boom" });
    const v = reg.status(opId)!;
    expect(v.state).toBe("failed");
    expect(v.error).toEqual({ code: "EUNKNOWN", message: "boom" });
  });

  it("未知 opId ⇒ null（调用方回 ENOTFOUND）", () => {
    const reg = createOpRegistry();
    expect(reg.status("op_deadbeef")).toBeNull();
  });

  it("已结算后再 fail 不翻转（终态只认第一次结算）", () => {
    const reg = createOpRegistry();
    const { opId } = reg.start();
    reg.settle(opId, 1);
    reg.fail(opId, { code: "EUNKNOWN", message: "x" });
    expect(reg.status(opId)!.state).toBe("done");
  });
});

describe("op 注册表：TTL（默认 10 分钟，惰性过期）", () => {
  it("running 超过 TTL ⇒ expired，且 result 被释放", () => {
    const clock = fixedClock();
    const reg = createOpRegistry({ now: clock.now });
    const { opId } = reg.start();
    clock.advance(OP_TTL_MS - 1);
    expect(reg.status(opId)!.state).toBe("running");
    clock.advance(2);
    expect(reg.status(opId)!.state).toBe("expired");
  });

  it("done 记录过 TTL 不清状态，但 result 释放（防大回执钉内存）", () => {
    const clock = fixedClock();
    const reg = createOpRegistry({ now: clock.now });
    const { opId } = reg.start();
    reg.settle(opId, { big: "x".repeat(100) });
    clock.advance(OP_TTL_MS + 1);
    const v = reg.status(opId)!;
    expect(v.state).toBe("done");
    expect(v.result).toBeUndefined();
  });

  it("TTL 可注入（测试/未来按需调）", () => {
    const clock = fixedClock();
    const reg = createOpRegistry({ now: clock.now, ttlMs: 100 });
    const { opId } = reg.start();
    clock.advance(101);
    expect(reg.status(opId)!.state).toBe("expired");
  });
});

describe("op 注册表：容量（500 上限，先淘汰最老终态）", () => {
  it("超上限淘汰最老的**已终态**；running 永不淘汰", () => {
    const clock = fixedClock();
    let n = 0;
    const reg = createOpRegistry({ now: clock.now, maxEntries: 3, newId: () => `op_${String(++n).padStart(8, "0")}` });
    const a = reg.start().opId;
    reg.settle(a, 1);
    clock.advance(1);
    const b = reg.start().opId;
    reg.settle(b, 2);
    clock.advance(1);
    const c = reg.start().opId; // running
    clock.advance(1);
    reg.start(); // 第 4 条 ⇒ 触发淘汰（应淘汰 a，最老终态）
    expect(reg.status(a)).toBeNull();
    expect(reg.status(b)!.state).toBe("done");
    expect(reg.status(c)!.state).toBe("running");
  });

  it("默认上限常量 = 500", () => {
    expect(OP_MAX_ENTRIES).toBe(500);
  });
});
