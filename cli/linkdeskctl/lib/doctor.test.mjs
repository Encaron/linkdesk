/**
 * doctor 单测——断言纯编排层直打（假 call 服务，不起活实例）。
 *
 * 覆盖：正控全绿（serial/file-tree 两 profile）＋ 每条判据的负控（坏形状必须红，且带
 * expected/actual/repro 三件套）＋ `-k` 过滤与未知断言报错。
 * 命令 id 恒虚构/官方样本 id（⛔ 造新插件名；serial-monitor/file-tree 是 profile 数据不是特判）。
 */
import { describe, it, expect } from "vitest";
import { runDoctor, DOCTOR_ASSERTIONS } from "./doctor.mjs";

const coded = (code, msg = "err") => {
  const e = new Error(msg);
  e.code = code;
  return e;
};

/** 假 call——按 op/commandId 服务；overrides 逐键覆盖 */
function makeCall(overrides = {}) {
  const describeResult = overrides.describe ?? {
    commands: [{ id: "serial-monitor.listPorts", risk: "R0", riskSource: "declared" }],
    commandCount: 1,
  };
  return async (op, payload) => {
    if (op === "ping") return overrides.ping ?? { pid: 123 };
    if (op === "describe") return describeResult;
    if (op === "exec") {
      if (overrides.exec) return overrides.exec(payload.commandId, payload);
      const id = payload.commandId;
      if (id.endsWith("doctor-no-such")) throw coded("EUNKNOWNCOMMAND", "不存在");
      if (id === "serial-monitor.copy") throw coded("EVIEWREQUIRED", "先 open-tab");
      if (id === "serial-monitor.openPort") throw coded("ENOTFOUND", "无设备");
      if (id === "serial-monitor.receiveStatus") return { commandId: id, result: {} };
      if (id === "serial-monitor.closePort") return { commandId: id, result: { ok: true } };
      return { commandId: id, result: null };
    }
    throw new Error(`意料之外的 op: ${op}`);
  };
}

describe("doctor 正控（serial profile）", () => {
  it("好形状全绿：7 条断言全过（a-poststate 走「带码失败合法」支）", async () => {
    const out = await runDoctor({ call: makeCall() });
    expect(out.map((r) => r.id)).toEqual(DOCTOR_ASSERTIONS.map((a) => a.id));
    for (const r of out) expect(r.pass, `${r.id}: ${r.actual}`).toBe(true);
  });

  it("file-tree profile（非硬件领域）同一条断言链也成立（无样本的断言跳过）", async () => {
    const call = makeCall({
      exec: (_id, payload) => {
        if (payload.commandId.endsWith("doctor-no-such")) throw coded("EUNKNOWNCOMMAND", "不存在");
        // 1.0.38：rename 的版本前置——冲突先于落盘（a-conflict 的真样本）
        if (payload.commandId === "file-tree.rename") {
          const e = coded("ECONFLICT", "树状态已变化");
          e.details = { stateVersion: 1 };
          throw e;
        }
        return { commandId: payload.commandId, result: null };
      },
    });
    const out = await runDoctor({ call, profile: "file-tree" });
    const skipped = out.filter((r) => r.skip).map((r) => r.id);
    expect(skipped).toEqual(["a-view-code", "a-poststate", "a-teardown", "a-async-op", "a-state-keys", "a-idempotent", "a-device-truth", "a-device-owner", "a-event-flow"]);
    for (const r of out.filter((x) => !x.skip)) expect(r.pass, `${r.id}: ${r.actual}`).toBe(true);
  });

  it("只跑一条（-k）", async () => {
    const out = await runDoctor({ call: makeCall(), only: "a-unknown-code" });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a-unknown-code");
    expect(out[0].pass).toBe(true);
  });

  it("未知断言 ⇒ 报错", async () => {
    await expect(runDoctor({ call: makeCall(), only: "no-such" })).rejects.toThrow(/未知断言/);
  });
});

describe("doctor 负控（坏形状必须红，且带三件套）", () => {
  it("描述面缺 riskSource ⇒ a-desc-shape 红", async () => {
    const call = makeCall({
      describe: { commands: [{ id: "serial-monitor.listPorts", risk: "R0" }], commandCount: 1 },
    });
    const out = await runDoctor({ call, only: "a-desc-shape" });
    expect(out[0].pass).toBe(false);
    expect(out[0]).toMatchObject({ expected: expect.any(String), actual: expect.stringContaining("坏条目"), repro: expect.any(String) });
  });

  it("commandCount 与 commands.length 不一致 ⇒ 红", async () => {
    const call = makeCall({ describe: { commands: [{ id: "x", risk: "R0", riskSource: "fallback" }], commandCount: 2 } });
    const out = await runDoctor({ call, only: "a-desc-shape" });
    expect(out[0].pass).toBe(false);
  });

  it("不存在的命令居然执行成功 ⇒ a-unknown-code 红", async () => {
    const call = makeCall({ exec: () => ({ commandId: "x", result: null }) });
    const out = await runDoctor({ call, only: "a-unknown-code" });
    expect(out[0].pass).toBe(false);
    expect(out[0].actual).toContain("成功");
  });

  it("视图命令回 ENOTACTIVE（入口没认领）⇒ a-view-code 红（Block 1 转严，⛔ 混读成可达性正常）", async () => {
    const call = makeCall({ exec: () => { throw coded("ENOTACTIVE", "入口没认领"); } });
    const out = await runDoctor({ call, only: "a-view-code" });
    expect(out[0].pass).toBe(false);
    expect(out[0].actual).toContain("入口没认领");
  });

  it("视图命令回 EUNKNOWNCOMMAND（声明丢了）⇒ a-view-code 红", async () => {
    const call = makeCall({ exec: () => { throw coded("EUNKNOWNCOMMAND", "不存在"); } });
    const out = await runDoctor({ call, only: "a-view-code" });
    expect(out[0].pass).toBe(false);
  });

  it("回执嵌套第二层信封 ⇒ a-exec-depth 红", async () => {
    const call = makeCall({
      exec: (_id, payload) => ({ commandId: payload.commandId, result: { commandId: "inner", result: 1 } }),
    });
    const out = await runDoctor({ call, only: "a-exec-depth" });
    expect(out[0].pass).toBe(false);
  });

  it("变更命令成功但后置状态为 {} ⇒ a-poststate 红", async () => {
    const call = makeCall({
      exec: (_id, payload) => {
        if (payload.commandId === "serial-monitor.openPort") return { commandId: payload.commandId, result: { ok: true } };
        if (payload.commandId === "serial-monitor.receiveStatus") return { commandId: payload.commandId, result: {} };
        if (payload.commandId.endsWith("doctor-no-such")) throw coded("EUNKNOWNCOMMAND", "不存在");
        if (payload.commandId === "serial-monitor.copy") throw coded("ENOTACTIVE", "入口没认领");
        return { commandId: payload.commandId, result: null };
      },
    });
    const out = await runDoctor({ call, only: "a-poststate" });
    expect(out[0].pass).toBe(false);
    expect(out[0].actual).toContain("{}");
  });

  it("变更命令裸失败（EERROR）⇒ a-poststate 红（失败也必须带可判读码）", async () => {
    const call = makeCall({
      exec: (_id, payload) => {
        if (payload.commandId === "serial-monitor.openPort") throw coded("EERROR", "internal");
        return { commandId: payload.commandId, result: null };
      },
    });
    const out = await runDoctor({ call, only: "a-poststate" });
    expect(out[0].pass).toBe(false);
  });
});

describe("a-view-code 前置：插件视图已开着 ⇒ skip（不改写为假红）", () => {
  const tabsWithSerial = {
    windows: [{ windowId: "main", groups: [{ id: "main", tabs: [{ id: "t1", pluginId: "serial-monitor" }] }] }],
  };

  function ctxWithTabs(tabsResult) {
    return {
      shellRequest: async (channel, args) => {
        if (channel === "plugins:call" && args[0] === "getCommands") return [{ id: "serial-monitor.copy", activation: "view", risk: "R1" }];
        if (channel === "plugins:call" && args[0] === "list") return [];
        if (channel === "plugins:call" && args[0] === "listTabs") return tabsResult;
        if (channel === "commands:execute") return { commandId: "x", result: null };
        return { ok: true };
      },
    };
  }

  it("serial 视图开着 ⇒ a-view-code 跳过并说明前提", async () => {
    const out = await runDoctor({ call: (op2, payload) => Promise.resolve(op2 === "tabs" ? tabsWithSerial : { commandId: "x", result: null }), only: "a-view-code" });
    expect(out[0].pass).toBe(true);
    expect(out[0].skip).toBe(true);
    expect(out[0].note).toContain("视图已开着");
  });
});


/** state-probe 假服务：实现真实的状态机（版本/幂等由测试桩代替宿主——断的是 doctor 的判据） */
function makeStateCall(opts = {}) {
  let st = { value: 0, stateVersion: 0, updatedAt: null };
  const seen = new Map();
  const stateReturns = [
    { name: "value", type: "number" },
    { name: "stateVersion", type: "number" },
    { name: "updatedAt", type: "string", optional: true },
  ];
  const describe = {
    commands: [
      { id: "state-probe.readState", risk: "R0", riskSource: "declared", returns: stateReturns },
      { id: "state-probe.writeValue", risk: "R1", riskSource: "declared", params: [{ name: "value" }, { name: "expectedVersion" }, { name: "idempotencyKey" }], returns: stateReturns },
      { id: "state-probe.reset", risk: "R1", riskSource: "declared", returns: stateReturns },
    ],
    commandCount: 3,
  };
  const call = async (op, payload) => {
    if (op === "ping") return { pid: 1 };
    if (op === "describe") return opts.describe ?? describe;
    if (op !== "exec") return null;
    const id = payload.commandId;
    const args = payload.args ?? [];
    if (id === "state-probe.reset") {
      st = { value: 0, stateVersion: 0, updatedAt: new Date().toISOString() };
      return { commandId: id, result: { ...st } };
    }
    if (id === "state-probe.readState") return { commandId: id, result: { ...st, ...(opts.extraKey ? { extra: 1 } : {}) } };
    if (id === "state-probe.writeValue") {
      const a = (args[0] && typeof args[0] === "object") ? args[0] : {};
      if (a.expectedVersion !== undefined && a.expectedVersion !== st.stateVersion) {
        const e = coded("ECONFLICT", "版本冲突");
        if (!opts.conflictWithoutDetails) e.details = { stateVersion: st.stateVersion };
        throw e;
      }
      if (a.idempotencyKey && seen.has(a.idempotencyKey) && !opts.noReplay) {
        return { commandId: id, result: { ...seen.get(a.idempotencyKey), replayed: true } };
      }
      st = { value: a.value, stateVersion: st.stateVersion + 1, updatedAt: new Date().toISOString() };
      if (a.idempotencyKey) seen.set(a.idempotencyKey, { ...st });
      return { commandId: id, result: { ...st } };
    }
    throw coded("EUNKNOWNCOMMAND", "不存在");
  };
  return call;
}

describe("doctor · state-probe（T-B 纯软件状态样本）", () => {
  it("正控：a-state-keys / a-idempotent / a-conflict 全绿（其余断言也成立）", async () => {
    const out = await runDoctor({ call: makeStateCall(), profile: "state-probe" });
    for (const r of out) expect(r.pass, `${r.id}: ${r.actual}`).toBe(true);
    expect(out.find((r) => r.id === "a-idempotent").skip).toBeUndefined();
    expect(out.find((r) => r.id === "a-conflict").skip).toBeUndefined();
  });

  it("负控：实收回执出现未声明键 ⇒ a-state-keys 红", async () => {
    const out = await runDoctor({ call: makeStateCall({ extraKey: true }), profile: "state-probe", only: "a-state-keys" });
    expect(out[0].pass).toBe(false);
    expect(out[0].actual).toContain("extra");
  });

  it("负控：同键第二次没有 replayed ⇒ a-idempotent 红", async () => {
    const out = await runDoctor({ call: makeStateCall({ noReplay: true }), profile: "state-probe", only: "a-idempotent" });
    expect(out[0].pass).toBe(false);
  });

  it("负控：ECONFLICT 不带 details.stateVersion ⇒ a-conflict 红", async () => {
    const out = await runDoctor({ call: makeStateCall({ conflictWithoutDetails: true }), profile: "state-probe", only: "a-conflict" });
    expect(out[0].pass).toBe(false);
    expect(out[0].actual).toContain("code=ECONFLICT");
  });
});


/** device-probe 假服务：注册表语义的最小子集（acquire/release/state/recover） */
function makeDeviceCall() {
  let session = null; // {sessionId, owner}
  const describe = {
    commands: [
      { id: "device-probe.state", risk: "R0", riskSource: "declared", activation: "entry", returns: [] },
      { id: "device-probe.acquire", risk: "R1", riskSource: "declared", activation: "entry" },
      { id: "device-probe.release", risk: "R1", riskSource: "declared", activation: "entry" },
      { id: "device-probe.recover", risk: "R1", riskSource: "declared", activation: "entry" },
    ],
    commandCount: 4,
  };
  const call = async (op, payload) => {
    if (op === "ping") return { pid: 1 };
    if (op === "describe") return describe;
    if (op !== "exec") return null;
    const id = payload.commandId;
    const a = (payload.args && payload.args[0] && typeof payload.args[0] === "object") ? payload.args[0] : {};
    if (id === "device-probe.state") {
      return { commandId: id, result: { sessions: session ? [{ deviceKey: a.endpoint ?? "ep", open: true, devicePresent: true, stale: false, ownerSessionId: session.sessionId, sessionId: session.sessionId }] : [] } };
    }
    if (id === "device-probe.acquire") {
      if (session) throw Object.assign(coded("EBUSY", "占用"), { details: { ownerSessionId: session.sessionId } });
      session = { sessionId: "dev_1", owner: a.owner ?? "device-probe" };
      return { commandId: id, result: { sessionId: "dev_1", state: { deviceKey: a.endpoint, open: true, devicePresent: true, stale: false, ownerSessionId: "dev_1" } } };
    }
    if (id === "device-probe.release") {
      if (!session) return { commandId: id, result: { released: true, already: true } };
      if (a.owner && a.owner !== session.owner) throw coded("EBADARGS", "非属主");
      session = null;
      return { commandId: id, result: { released: true } };
    }
    throw coded("EUNKNOWNCOMMAND", "不存在");
  };
  return call;
}

describe("doctor · device-probe（Block 3a 设备会话样本）", () => {
  it("正控：a-device-truth / a-device-owner 全绿，其余按 profile 跳过", async () => {
    const out = await runDoctor({ call: makeDeviceCall(), profile: "device-probe", endpoint: "127.0.0.1:9100" });
    const dev = out.filter((r) => r.id.startsWith("a-device-"));
    expect(dev.map((r) => r.id)).toEqual(["a-device-truth", "a-device-owner"]);
    for (const r of dev) expect(r.pass, `${r.id}: ${r.actual}`).toBe(true);
  });

  it("负控：他主 acquire 回成功（不 EBUSY）⇒ a-device-owner 红", async () => {
    const base = makeDeviceCall();
    const call = async (op, payload) => {
      if (op === "exec" && payload.commandId === "device-probe.acquire" && payload.args?.[0]?.owner === "doctor-b") {
        return { commandId: payload.commandId, result: { sessionId: "dev_2", state: { open: true } } };
      }
      return base(op, payload);
    };
    const out = await runDoctor({ call, profile: "device-probe", endpoint: "127.0.0.1:9100", only: "a-device-owner" });
    expect(out[0].pass).toBe(false);
  });

  it("未给 --endpoint ⇒ 两条设备断言 skip（不是假绿）", async () => {
    const out = await runDoctor({ call: makeDeviceCall(), profile: "device-probe", only: "a-device-truth", endpoint: "" });
    expect(out[0].skip).toBe(true);
  });
});
