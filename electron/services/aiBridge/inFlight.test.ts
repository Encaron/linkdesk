/**
 * 生长格 `AI#60` 内核侧的钉子——**相位登记表 ＋ 执行上下文那条缝**（`index.ts`）。
 *
 * 钉住四件（都在 electron-free 面，⛔ 不起窗口、⛔ 不等真超时）：
 *   ① 相位进出：`begin` = `op` ⇒ 壳请求改写为 `shell`（`what` = 通道名）⇒ `done` 出表；
 *   ② 🔴 **等人点头期间不被改写**——`ask-user` 期间那条确认框请求不许把相位写成 `shell`
 *      （写成 `shell` 客户端就会读成「命令在跑」，而真相是「软件里弹着框等人」⇒ AI 会重试）；
 *   ③ `identity().inFlight` **剔除自己**——`ping` 探活本身也是一条在办请求，不剔除 ⇒ 每次探活都
 *      「看见自己」⇒ 客户端永远读到「还在跑」，那是**必然说谎**；
 *   ④ 出表**无论成败**（成功 / 抛错 / 用户不点头，走 `finally`）。
 *
 * 负控**必须真的会红**：去掉 `opContextFor` 里那条 `phase() !== 'ask-user'` 判定 ⇒ ② 红；
 * 把 `registry.snapshot(handle.id)` 的 `handle.id` 换成 `null` ⇒ ③ 红；把 `done()` 从 `finally` 摘掉 ⇒ ④ 红。
 */

import { describe, expect, it } from "vitest";

// 🔴 共享桩必须先于 SUT import（SUT 顶部 `import { app } from 'electron'`）
import { electronMock } from "../electron-mock.js";
void electronMock;

import { IPC } from "../../ipc/channels.js";
import { createInFlightRegistry, opContextFor } from "./index.js";
import type { BridgeOpContext } from "./whitelist.js";
import { askUser, USER_DENIED } from "./sensitive.js";

/** 一只假内核上下文（`opContextFor` 的 `base`）：壳请求只记账、每秒表由本文件自己造 */
function fakeBase(shellReply: (channel: string) => unknown = () => null) {
  const calls: Array<{ channel: string; phase: string | undefined }> = [];
  const base: BridgeOpContext = {
    shellRequest: async (channel: string) => {
      calls.push({ channel, phase: undefined }); // phase 由用例注入（要读当刻相位）
      return shellReply(channel);
    },
    identity: () => ({ pid: 4242, marker: 'base' }),
    ledgerEntries: () => [],
  };
  return { base, calls };
}

describe("相位登记表（createInFlightRegistry）", () => {
  it("begin ⇒ op；set ⇒ 改写；done ⇒ 出表（快照形状含 ms）", () => {
    let t = 1_000;
    const reg = createInFlightRegistry(() => t);
    const h = reg.begin('exec');
    expect(reg.snapshot()).toEqual([{ op: 'exec', phase: 'op', what: null, ms: 0 }]);
    t = 4_200;
    h.set('shell', 'commands:execute');
    expect(reg.snapshot()).toEqual([{ op: 'exec', phase: 'shell', what: 'commands:execute', ms: 3_200 }]);
    expect(h.phase()).toBe('shell');
    h.done();
    expect(reg.snapshot()).toEqual([]);
    expect(reg.size()).toBe(0);
  });

  it("剔除自己（selfId）——ping 探活不许「看见自己」", () => {
    const reg = createInFlightRegistry(() => 0);
    const self = reg.begin('ping');
    const other = reg.begin('exec');
    expect(reg.snapshot()).toHaveLength(2);
    expect(reg.snapshot(self.id)).toEqual([{ op: 'exec', phase: 'op', what: null, ms: 0 }]);
    self.done();
    expect(reg.snapshot(other.id)).toEqual([]);
  });

  it("多份登记表互不干扰（工厂——单测可各造一份）", () => {
    const a = createInFlightRegistry(() => 0);
    const b = createInFlightRegistry(() => 0);
    a.begin('exec');
    expect(a.size()).toBe(1);
    expect(b.size()).toBe(0);
    expect(a.begin('exec').id).toBe(2); // 编号各自单调，⛔ 不共享计数器
  });
});

describe("opContextFor（执行上下文那条缝）", () => {
  it("壳请求把相位改写成 shell（what = 通道名），identity 回填 inFlight", async () => {
    const { base } = fakeBase();
    const reg = createInFlightRegistry(() => 0);
    const { ctx, done } = opContextFor('exec', base, reg);

    await ctx.shellRequest(IPC.commands.execute, ['a']);
    expect(reg.snapshot()).toEqual([{ op: 'exec', phase: 'shell', what: IPC.commands.execute, ms: 0 }]);
    // 身份面 = base 的原字段 ＋ inFlight（**自己不在里面**）
    expect(ctx.identity()).toEqual({ pid: 4242, marker: 'base', inFlight: [] });

    done();
    expect(reg.size()).toBe(0);
  });

  it("🔴 等人点头期间不被那条确认框请求改写（否则客户端读成「命令在跑」）", async () => {
    const reg = createInFlightRegistry(() => 0);
    const seen: Array<string | undefined> = [];
    const base: BridgeOpContext = {
      shellRequest: async () => {
        seen.push(reg.snapshot()[0]?.phase); // 请求发出的**当刻**相位
        return true; // 用户点了同意
      },
      identity: () => ({}),
      ledgerEntries: () => [],
    };
    const { ctx, done } = opContextFor('install', base, reg);

    await askUser(ctx, '安装插件', 'demo-plugin');
    expect(seen).toEqual(['ask-user']); // 确认框那条请求看到的是 ask-user，⛔ 不是 shell
    expect(reg.snapshot()[0].phase).toBe('op'); // 问完出相位（后续真请求会再标 shell）
    done();
  });

  it("用户不点头（false）⇒ 抛 EUSERDENIED，且相位照样出表（finally）", async () => {
    const reg = createInFlightRegistry(() => 0);
    const base: BridgeOpContext = {
      shellRequest: async () => false,
      identity: () => ({}),
      ledgerEntries: () => [],
    };
    const { ctx, done } = opContextFor('install', base, reg);
    await expect(askUser(ctx, '安装插件', 'demo-plugin')).rejects.toMatchObject({ code: USER_DENIED });
    expect(reg.snapshot()[0].phase).toBe('op');
    done();
    expect(reg.size()).toBe(0);
  });

  it("并发两条：互相看得见（客户端探活据此说「另有 N 条」）", () => {
    const reg = createInFlightRegistry(() => 0);
    const { base } = fakeBase();
    const a = opContextFor('exec', base, reg);
    const b = opContextFor('tabs', base, reg);
    expect((a.ctx.identity() as { inFlight: unknown[] }).inFlight).toEqual([{ op: 'tabs', phase: 'op', what: null, ms: 0 }]);
    expect(reg.size()).toBe(2);
    a.done();
    b.done();
  });
});
