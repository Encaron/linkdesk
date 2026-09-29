/**
 * 生长格 `AI#60`：**超时三分类**的钉子（`lib/bridge-client.mjs`）。
 *
 * 这个文件存在的理由（别删）：真机 `0.2.23 → 0.2.24` 整跳上，`linkdeskctl exec update.openUpdateFlow`
 * 明明执行成功（下载推进到 100%、装完重启），AI 那侧却只拿到 `[ESHELLTIMEOUT] 壳无应答` ＋ 退出码 1
 * ⇒ **与「什么都没发生」不可分辨** ⇒ AI 会重试、或向用户报「失败」。
 * 本文件钉住两件：
 *   ① 纯函数 `classifyTimeout`——「还在跑 / 正等人点头 / 真没应答」三种读数**各是各的**；
 *   ② 真 socket 上的整跳——客户端预算用完那一刻，用第二次 `ping` 回读相位再分类
 *      （⛔ 探不透 = 不硬判：原样报原错，不许编一个结论）。
 *
 * 负控**必须真的会红**：把 `callBridge` 里的 `probeInFlight()` 去掉（直接 `throw e`），② 的三条立刻红；
 * 把 `classifyTimeout` 的 `ask-user` 分支删掉，`EASKPENDING` 那条红。
 */

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { BridgeError, callBridge, classifyTimeout, PROBE_TIMEOUT_MS } from "./bridge-client.mjs";

/* ── ① 纯函数：三种读数各是各的 ── */

describe("classifyTimeout（相位 → 三个 code）", () => {
  it("在办里有 ask-user ⇒ EASKPENDING（等人点头，不是失败）", () => {
    const err = classifyTimeout({
      op: "exec",
      timeoutMs: 5000,
      inFlight: [{ op: "exec", phase: "ask-user", what: "执行敏感命令「update.openUpdateFlow」", ms: 61_000 }],
    });
    expect(err).toBeInstanceOf(BridgeError);
    expect(err.code).toBe("EASKPENDING");
    expect(err.message).toContain("等你点头");
    expect(err.message).toContain("61000 毫秒");
    expect(err.message).toContain("update.openUpdateFlow");
    expect(err.hint).toContain("别重试");
  });

  it("在办非空（无 ask-user）⇒ EPENDING（还在跑）", () => {
    const err = classifyTimeout({
      op: "exec",
      timeoutMs: 5000,
      inFlight: [
        { op: "exec", phase: "shell", what: "commands:execute", ms: 3200 },
        { op: "tabs", phase: "op", what: null, ms: 900 },
      ],
    });
    expect(err.code).toBe("EPENDING");
    expect(err.message).toContain("还在跑");
    expect(err.message).toContain("另有 1 条");
  });

  it("在办是空数组 ⇒ TIMEOUT 且文案是「真没应答」（有证据才敢这么说）", () => {
    const err = classifyTimeout({ op: "tabs", timeoutMs: 5000, inFlight: [] });
    expect(err.code).toBe("TIMEOUT");
    expect(err.message).toContain("真没应答");
    expect(err.message).toContain("5000ms");
  });

  it("探不透（null / 字段缺席 / 老版内核）⇒ 返回 null，交回原错（⛔ 不硬判）", () => {
    for (const inFlight of [null, undefined, "x", {}]) {
      expect(classifyTimeout({ op: "exec", timeoutMs: 5000, inFlight })).toBeNull();
    }
  });
});

/* ── ② 真 socket 整跳：客户端预算用完 ⇒ 回读相位 ⇒ 分类 ── */

/** 一只假内核：按 handler 决定回不回（返回 null = 不回，让客户端自己超时） */
function startFakeBridge(handler) {
  const seen = [];
  const server = net.createServer((socket) => {
    let buf = "";
    socket.setEncoding("utf8");
    socket.on("error", () => {});
    socket.on("data", (chunk) => {
      buf += chunk;
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      const req = JSON.parse(buf.slice(0, nl));
      seen.push(req.op);
      const reply = handler(req);
      if (reply) socket.end(JSON.stringify(reply) + "\n");
      // 不回也不断（保持连接挂着 = 客户端等到自己超时）——不许 destroy：那会变成另一种故障
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        seen,
        port: server.address().port,
        // 挂着的连接先斩再关（客户端超时后本会自己 destroy；斩是为了 close 不吊死）
        close: () =>
          new Promise((r) => {
            server.closeAllConnections?.();
            server.close(r);
          }),
      });
    });
  });
}

/** 夹具目录：记录里的 pid 用测试进程自己的（`classify` 的存活判定必然为真） */
function fixtureDir(port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ldk-bridge-client-"));
  fs.writeFileSync(
    path.join(dir, "ai-bridge.json"),
    JSON.stringify({
      v: 1,
      mode: "tcp",
      pid: process.pid,
      appName: "linkdesk",
      appVersion: "0.0.0-test",
      enabled: true,
      startedAt: new Date(0).toISOString(),
      endpoint: { transport: "tcp", host: "127.0.0.1", port },
    }),
  );
  fs.writeFileSync(path.join(dir, "ai-bridge.token"), "test-token");
  return dir;
}

const dirs = [];
const bridges = [];
afterEach(async () => {
  await Promise.all(bridges.splice(0).map((b) => b.close()));
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/**
 * 跑一次「真请求必超时」的调用：`exec` 那条不回，`ping` 回给定正文。
 * ⚠️ `inFlight: undefined` = 老版内核（应答里根本没这个字段）。
 */
async function timeoutRun({ inFlight }) {
  const bridge = await startFakeBridge((req) =>
    req.op === "ping" ? { ok: true, result: { pid: process.pid, ...(inFlight === undefined ? {} : { inFlight }) } } : null,
  );
  bridges.push(bridge);
  const dir = fixtureDir(bridge.port);
  dirs.push(dir);
  const p = callBridge("exec", { commandId: "update.openUpdateFlow" }, { userDataDirs: [dir], timeoutMs: 300 });
  return { p, bridge };
}

describe("callBridge 超时整跳（第二次 ping 回读相位）", () => {
  it("服务端还在跑 ⇒ EPENDING（不是「无应答」）", async () => {
    const { p, bridge } = await timeoutRun({
      inFlight: [{ op: "exec", phase: "shell", what: "commands:execute", ms: 3000 }],
    });
    const err = await p.then(
      () => null,
      (e) => e,
    );
    expect(err.code).toBe("EPENDING");
    expect(err.message).toContain("还在跑");
    // 三次请求：认人 ping → exec（超时）→ 探活 ping（AI#60 的第二次廉价请求）
    expect(bridge.seen).toEqual(["ping", "exec", "ping"]);
  });

  it("服务端正等人点头 ⇒ EASKPENDING（今天必须不再是「对面卡住了」）", async () => {
    const { p } = await timeoutRun({
      inFlight: [{ op: "exec", phase: "ask-user", what: "执行敏感命令「update.openUpdateFlow」", ms: 12_000 }],
    });
    const err = await p.then(
      () => null,
      (e) => e,
    );
    expect(err.code).toBe("EASKPENDING");
    expect(err.message).toContain("等你点头");
    expect(err.hint).toContain("Enter");
  });

  it("服务端没在办任何请求 ⇒ TIMEOUT（真没应答）", async () => {
    const { p } = await timeoutRun({ inFlight: [] });
    const err = await p.then(
      () => null,
      (e) => e,
    );
    expect(err.code).toBe("TIMEOUT");
    expect(err.message).toContain("真没应答");
  });

  it("负控：老版内核（应答里没有 inFlight）⇒ ⛔ 不硬判，原样报原错", async () => {
    const { p, bridge } = await timeoutRun({ inFlight: undefined });
    const err = await p.then(
      () => null,
      (e) => e,
    );
    expect(err.code).toBe("TIMEOUT");
    expect(err.message).not.toContain("真没应答"); // 没有证据就不许这么说
    expect(err.hint).toContain("不一定是失败");
    expect(bridge.seen).toEqual(["ping", "exec", "ping"]);
  });

  it("负控：探活本身没回（连 ping 都答不上）⇒ 原样报原错（⛔ 探不透不是新故障）", async () => {
    // 什么都不答的服务端；`identityCheck:false` 让第一条 ping 出局，好把「探活也没回」单独隔离出来。
    // ⚠️ 这条会真等一次探活预算（`PROBE_TIMEOUT_MS`）——那是它要证明的事，别改成假钟。
    const bridge = await startFakeBridge(() => null);
    bridges.push(bridge);
    const dir = fixtureDir(bridge.port);
    dirs.push(dir);
    const err = await callBridge("exec", { commandId: "x" }, { userDataDirs: [dir], timeoutMs: 300, identityCheck: false }).then(
      () => null,
      (e) => e,
    );
    expect(err.code).toBe("TIMEOUT");
    expect(err.message).toContain("无应答");
    expect(bridge.seen).toEqual(["exec", "ping"]); // 真请求 ＋ 探活（探活也没答）
    expect(PROBE_TIMEOUT_MS).toBeLessThanOrEqual(2000); // 探活预算不许变成第二轮长等待
  });
});
