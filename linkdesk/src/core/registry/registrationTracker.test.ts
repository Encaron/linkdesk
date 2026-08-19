/**
 * registrationTracker 测试——可逆注册核心（E5.8#9）。
 *
 * 验收四项：逆序回滚 / 重复注册 / 卸载后调用安全 / 回滚中断容错。
 * 附：PluginLifecycle.onWillUninstall 自动触发回滚 + hasRegistrations。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PluginLifecycle } from "../../pluginLoader/lifecycle-events";
import { trackRegistration, rollback, hasRegistrations, clearRegistrationLayers } from "./registrationTracker";

const PID = "tracker-test";

describe("registrationTracker — 逆序回滚", () => {
  beforeEach(() => {
    clearRegistrationLayers();
  });

  it("rollback 按 LIFO 逆序执行——后注册的先滚", () => {
    const order: string[] = [];
    trackRegistration(PID, () => { order.push("first"); });
    trackRegistration(PID, () => { order.push("second"); });

    rollback(PID);

    expect(order).toEqual(["second", "first"]);
  });

  it("rollback 未注册的 pluginId → 不抛错", () => {
    expect(() => rollback("never-registered")).not.toThrow();
  });
});

describe("registrationTracker — 重复注册 / 幂等", () => {
  beforeEach(() => {
    clearRegistrationLayers();
  });

  it("同一插件多次 track → 每个 disposer 都跑（逐条清理，非整体覆盖）", () => {
    const ran: string[] = [];
    trackRegistration(PID, () => { ran.push("a"); });
    trackRegistration(PID, () => { ran.push("b"); });

    rollback(PID);

    expect(ran.sort()).toEqual(["a", "b"]);
  });

  it("返回的 disposer 重复调用 → disposer 只执行一次", () => {
    let count = 0;
    const dispose = trackRegistration(PID, () => { count += 1; });

    dispose();
    dispose();
    dispose();

    expect(count).toBe(1);
  });
});

describe("registrationTracker — 卸载后调用安全", () => {
  beforeEach(() => {
    clearRegistrationLayers();
  });

  it("rollback 后手动调 disposer → no-op（done 守卫，不双清）", () => {
    let count = 0;
    const dispose = trackRegistration(PID, () => { count += 1; });

    rollback(PID);
    dispose();

    expect(count).toBe(1);
  });

  it("重复 rollback 同 pluginId → 幂等，不抛错不重跑", () => {
    let count = 0;
    trackRegistration(PID, () => { count += 1; });

    rollback(PID);
    rollback(PID);

    expect(count).toBe(1);
  });
});

describe("registrationTracker — 回滚中断容错", () => {
  beforeEach(() => {
    clearRegistrationLayers();
  });

  it("单 disposer 抛错 → 不中断后续回滚（错误入诊断面，不向上抛）", () => {
    const ran: string[] = [];
    trackRegistration(PID, () => { throw new Error("boom"); });
    trackRegistration(PID, () => { ran.push("after"); });

    // 不抛——回滚吞掉单条错误，后续继续
    expect(() => rollback(PID)).not.toThrow();
    expect(ran).toEqual(["after"]);
  });
});

describe("registrationTracker — PluginLifecycle 自动触发", () => {
  beforeEach(() => {
    clearRegistrationLayers();
  });

  it("fire onWillUninstall → 该插件 disposer 自动逆序回滚（机械保障）", () => {
    const order: string[] = [];
    trackRegistration(PID, () => { order.push("first"); });
    trackRegistration(PID, () => { order.push("second"); });

    PluginLifecycle.onWillUninstall.fire({ pluginId: PID, reason: "uninstall" });

    expect(order).toEqual(["second", "first"]);
  });

  it("其他插件卸载 → 不影响本插件登记（per-plugin 隔离）", () => {
    let ownRan = 0;
    trackRegistration(PID, () => { ownRan += 1; });
    trackRegistration("other-plugin", () => {});

    PluginLifecycle.onWillUninstall.fire({ pluginId: "other-plugin", reason: "uninstall" });

    expect(ownRan).toBe(0);
    expect(hasRegistrations(PID)).toBe(true);
    expect(hasRegistrations("other-plugin")).toBe(false);
  });
});

describe("registrationTracker — hasRegistrations", () => {
  beforeEach(() => {
    clearRegistrationLayers();
  });

  it("track 后有登记 → true；rollback 后 → false", () => {
    expect(hasRegistrations(PID)).toBe(false);
    trackRegistration(PID, () => {});
    expect(hasRegistrations(PID)).toBe(true);
    rollback(PID);
    expect(hasRegistrations(PID)).toBe(false);
  });
});
