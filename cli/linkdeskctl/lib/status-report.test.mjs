/**
 * M4 `AI#59`：`status` / `ping` 报告面的**钉子**（`lib/status-report.mjs`）。
 *
 * 这个文件存在的理由（别删）：CLI 此前**一行测试都没有**，于是下面两条缺陷活到了 0.2.23 出厂版，
 * 是「会话 15 真机边界扫描」才扫出来的——
 *   ① 探活的真实故障码被吞 ⇒ 一律报 `CONNECT_FAILED`（同一情形 `ping` 报 `EAUTH`）；
 *   ② 探活跳过认人 ⇒ 记录 pid 与应答 pid 错配时照样报「在服务」（同记录下 `tabs` 报 `STALE_IDENTITY`）。
 * 负控**必须真的会红**：把上面任一修法撤回（改回 `classify({error:null})` 或去掉认人），本文件立刻红。
 */

import { describe, expect, it } from "vitest";

import { BridgeError } from "./bridge-client.mjs";
import { fmtInFlight, renderStatus, resolvedServedBy } from "./status-report.mjs";

/** 夹具：一只「自己活着」的记录——pid 用测试进程自己的，`classify` 的存活判定必然为真。 */
function recordFixture(over = {}) {
  return {
    v: 1,
    mode: "tcp",
    pid: process.pid,
    appName: "linkdesk",
    userData: "C:\\fixture",
    appVersion: "0.2.23",
    startedAt: "2026-09-29T00:00:00.000Z",
    enabled: true,
    listening: true,
    endpoint: { transport: "tcp", host: "127.0.0.1", port: 50931 },
    lastError: null,
    ...over,
  };
}
function foundFixture(over = {}) {
  const record = over.record === undefined ? recordFixture() : over.record;
  return { record, recordPath: "C:\\fixture\\ai-bridge.json", searched: ["C:\\fixture"], ...over };
}
/** 探活应答（`ping` 的 result）：`pid` = **真应答者** */
function liveFixture(over = {}) {
  return {
    pid: process.pid,
    appName: "linkdesk",
    appVersion: "0.2.23",
    transport: "tcp",
    endpoint: { transport: "tcp", host: "127.0.0.1", port: 50931 },
    uptimeMs: 1105_000,
    shellWindows: 1,
    servedShellWindow: "main",
    ...over,
  };
}

describe("status 分诊：谁在服务 / 为什么没成（AI#59）", () => {
  it("正控①：探活成功且 pid 对齐 ⇒ SERVING（正常路径一字不变）", () => {
    const out = renderStatus(foundFixture(), liveFixture(), null);
    expect(out.state.code).toBe("SERVING");
    expect(out.text).toContain("在服务");
    expect(out.text).toContain("操作目标 = main");
  });

  it("正控②：探活没连上（REFUSED）⇒ 仍报 RECORD_OK（离线分诊语义保住，退出码 0）", () => {
    const out = renderStatus(foundFixture(), null, new BridgeError("REFUSED", "连 127.0.0.1:50931 被拒（pid 1 还活着）", "稍等重试"));
    expect(out.state.code).toBe("RECORD_OK");
    expect(out.state.message).toContain("REFUSED");
  });

  it("正控③：没有记录 ⇒ NO_RECORD（离线可用没被破坏）", () => {
    const out = renderStatus({ record: null, recordPath: null, searched: ["C:\\fixture"] }, null, null);
    expect(out.state.code).toBe("NO_RECORD");
    expect(out.text).toContain("没有通道记录");
  });

  it("正控④：开关关着（没探活、也没异常）⇒ SWITCH_OFF（按记录字段分诊）", () => {
    const out = renderStatus(foundFixture({ record: recordFixture({ mode: "off", enabled: false }) }), null, null);
    expect(out.state.code).toBe("SWITCH_OFF");
  });

  it("正控⑤：普通 Error 探活异常 ⇒ CONNECT_FAILED（存量语义不变）", () => {
    const out = renderStatus(foundFixture(), null, Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }));
    expect(out.state.code).toBe("RECORD_OK");
    expect(out.state.message).toContain("CONNECT_FAILED");
  });

  // ── 负控：修法被撤回就必须红 ──

  it("🔴 负控①：探活报 EAUTH（凭据不对）⇒ 必须报 EAUTH，⛔ 不许压成 CONNECT_FAILED", () => {
    const err = new BridgeError("EAUTH", "凭据不对（token 不匹配）——用 ai-bridge.token 里那份", null);
    const out = renderStatus(foundFixture(), null, err);
    expect(out.state.code).toBe("EAUTH");
    expect(out.state.message).toContain("凭据");
    expect(out.text).not.toContain("稍等重试"); // 真修法不是重试
  });

  it("🔴 负控②：探活报 EPROTO（版本不匹配）⇒ 必须如实报，不被压平", () => {
    const out = renderStatus(foundFixture(), null, new BridgeError("EPROTO", "应答不是合法 JSON", "版本不匹配？"));
    expect(out.state.code).toBe("EPROTO");
  });

  it("🔴 负控③：应答 pid ≠ 记录 pid ⇒ STALE_IDENTITY（M5「存在 ≠ 是它」），⛔ 不许报在服务", () => {
    const out = renderStatus(foundFixture(), liveFixture({ pid: process.pid + 999 }), null);
    expect(out.state.code).toBe("STALE_IDENTITY");
    expect(out.text).not.toContain("状态      在服务");
    expect(out.state.message).toContain(String(process.pid + 999));
  });

  it("🔴 负控④：STALE_IDENTITY 也不能被「连不上」类豁免吞掉（它不是网络故障）", () => {
    const out = renderStatus(foundFixture(), null, new BridgeError("STALE_IDENTITY", "有人应答，但不是记录里那个进程", "指对 --user-data-dir"));
    expect(out.state.code).toBe("STALE_IDENTITY");
  });
});

describe("在办相位那一行（AI#60）：status 让 AI **拉**得到「还在跑 / 正等人点头」", () => {
  const inflight = [
    { op: "exec", phase: "shell", what: "commands:execute", ms: 3200 },
    { op: "install", phase: "ask-user", what: "安装插件", ms: 61_000 },
  ];

  it("正控①：两相位各有说法（等人点头那半带「去软件里点它」）", () => {
    expect(fmtInFlight(inflight)).toBe("exec（壳侧等待 commands:execute · 3.2s） · install（等人点头 · 61.0s · 去软件里点它）");
  });

  it("正控②：SERVING 且有人点头在等 ⇒ 正文多一行 `在办`，机读面带 `inFlight`", () => {
    const out = renderStatus(foundFixture(), liveFixture({ inFlight: inflight }), null);
    expect(out.state.code).toBe("SERVING");
    expect(out.text).toContain("在办      ");
    expect(out.state.inFlight).toEqual(inflight);
  });

  it("负控①：没有在办请求（老版内核缺字段 / 空数组）⇒ ⛔ 不许多印一行、也不许多一个字段", () => {
    for (const live of [liveFixture(), liveFixture({ inFlight: [] })]) {
      const out = renderStatus(foundFixture(), live, null);
      expect(out.text).not.toContain("在办");
      expect(out.state).not.toHaveProperty("inFlight");
    }
  });
});

describe("ping 信封的 servedBy = 谁在服务（AI#59）", () => {
  it("正控①：认人通过（servedBy 有值）⇒ 就用它", () => {
    expect(resolvedServedBy(4242, { pid: 4242 }, recordFixture())).toBe(4242);
  });

  it("🔴 负控①：ping 跳过认人 ⇒ 取**真应答者** result.pid，⛔ 不许拿记录 pid 兜底谎报", () => {
    expect(resolvedServedBy(null, { pid: 80164 }, recordFixture({ pid: 76092 }))).toBe(80164);
  });

  it("正控②：真应答者也不在（理论上不该发生）⇒ 退回记录 pid 兜底", () => {
    expect(resolvedServedBy(null, {}, recordFixture({ pid: 76092 }))).toBe(76092);
  });
});
