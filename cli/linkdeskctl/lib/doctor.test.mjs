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
      if (id === "serial-monitor.copy") throw coded("ENOTACTIVE", "入口没认领");
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
        return { commandId: payload.commandId, result: null };
      },
    });
    const out = await runDoctor({ call, profile: "file-tree" });
    const skipped = out.filter((r) => r.skip).map((r) => r.id);
    expect(skipped).toEqual(["a-view-code", "a-poststate", "a-teardown", "a-async-op"]);
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
