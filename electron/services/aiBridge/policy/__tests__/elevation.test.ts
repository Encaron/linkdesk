/**
 * 执行闸 ＋ 提权回路单测——本档的**核心验收**（`02-执行闸与防自提权.md` §二/§四）。
 *
 * 钉的六件事：
 *   ① `userOnly` 命令经 AI 正门（`exec`）一律 `EPROTECTED`，且**不碰命令面**（L2）；
 *   ② `read` 档下 R1/R2 一律 `EPOLICYDENIED`，**不弹框**（S1）；
 *   ③ 档位读不到/损坏 ⇒ 按 `ask`（S8，见 policyState 测）；
 *   ④ 提权：用户允许 ⇒ 经壳命令 `aiPolicy.setMode` 写档位（批准不经命令面，但**写档位**走唯一写点）；
 *   ⑤ 提权：用户拒绝 ⇒ `{granted:false}`、档位不变；超时 ⇒ 上抛（没点头 = 不存在）；
 *   ⑥ 提权：`full` 要两次确认（D8）；⛔ 没有「AI 自己批准」的通道。
 */

import { afterEach, beforeEach, describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { IPC } from "../../../../ipc/channels.js";
import { OPS } from "../../whitelist.js";
import {
  POLICY_SET_MODE_COMMAND,
  elevationPrompt,
  requestElevationFlow,
} from "../elevation.js";
import { setPolicySettingsFile } from "../policyState.js";
import type { PolicyMode } from "../modes.js";

interface Call {
  channel: string;
  args: unknown[];
  timeoutMs?: number;
}

/** 假 ctx：命令面 + 可编排的弹框答复 */
function fakeCtx(opts: {
  commands?: Array<{ id: string; userOnly?: boolean }>;
  dialog?: boolean | (() => unknown);
}) {
  const calls: Call[] = [];
  const commands = opts.commands ?? [{ id: "update.openUpdateFlow" }, { id: "core.closeTab" }];
  const ctx = {
    shellRequest: async (channel: string, args: unknown[], timeoutMs?: number): Promise<unknown> => {
      calls.push({ channel, args, timeoutMs });
      if (channel === IPC.plugins.call && args[0] === "getCommands") return commands;
      if (channel === IPC.dialog.confirm) {
        return typeof opts.dialog === "function" ? opts.dialog() : (opts.dialog ?? true);
      }
      return { ok: true };
    },
  };
  return { calls, ctx };
}

const executed = (calls: Call[]) => calls.filter((c) => c.channel === IPC.commands.execute);
const dialogShown = (calls: Call[]) => calls.some((c) => c.channel === IPC.dialog.confirm);

/** 断言「弹了框、用户没点头、一次都没执行」——S2/S8 共用同一组事实 */
async function expectDialogDenied(ctx: unknown, calls: Call[], commandId = "core.closeTab"): Promise<void> {
  await expect(OPS.exec!.run({ commandId }, ctx as never)).rejects.toMatchObject({ code: "EUSERDENIED" });
  expect(dialogShown(calls)).toBe(true);
  expect(executed(calls)).toHaveLength(0);
}

/** 每个用例一份临时 settings.json（策略每次现读） */
let dir = "";
let settingsFile = "";

function setMode(mode: string | null): void {
  if (mode === null) {
    fs.rmSync(settingsFile, { force: true });
    return;
  }
  fs.writeFileSync(settingsFile, JSON.stringify({ "ai.policy.mode": mode }), "utf8");
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ld-gate-"));
  settingsFile = path.join(dir, "settings.json");
  setPolicySettingsFile(settingsFile);
  setMode("auto");
});

afterEach(() => {
  setPolicySettingsFile(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("L2 命令锁：userOnly 命令 AI 永远不可调", () => {
  const protectedList = [{ id: "aiPolicy.setMode", userOnly: true }, { id: "core.closeTab" }];

  it("🔴 `userOnly` 命令经 exec ⇒ EPROTECTED，且**不弹框、不执行**（主负控）", async () => {
    setMode("full"); // 即便完全访问也不放行——这不是档位问题
    const { ctx, calls } = fakeCtx({ commands: protectedList });
    await expect(OPS.exec!.run({ commandId: "aiPolicy.setMode", args: ["full"] }, ctx as never)).rejects.toMatchObject({
      code: "EPROTECTED",
    });
    expect(dialogShown(calls)).toBe(false);
    expect(executed(calls)).toHaveLength(0);
  });

  it("负控对照：同一条命令去掉 userOnly 元数据 ⇒ 不再 EPROTECTED（证明判据真是元数据）", async () => {
    setMode("auto");
    const { ctx, calls } = fakeCtx({ commands: [{ id: "aiPolicy.setMode", userOnly: false }] });
    await OPS.exec!.run({ commandId: "aiPolicy.setMode", args: ["full"] }, ctx as never);
    expect(executed(calls)).toHaveLength(1);
  });

  it("元数据缺失（undefined）⇒ 不按 userOnly 拦（缺省 = AI 可调，受档位约束）", async () => {
    const { ctx, calls } = fakeCtx({ commands: [{ id: "core.closeTab" }] });
    await OPS.exec!.run({ commandId: "core.closeTab" }, ctx as never);
    expect(executed(calls)).toHaveLength(1);
  });
});

describe("档位闸：read 档拒绝、ask 档弹框、auto 档静默", () => {
  it("S1：`read` 档执行 R1 命令 ⇒ EPOLICYDENIED，**不弹框、不执行**", async () => {
    setMode("read");
    const { ctx, calls } = fakeCtx({ dialog: true });
    await expect(OPS.exec!.run({ commandId: "core.closeTab" }, ctx as never)).rejects.toMatchObject({
      code: "EPOLICYDENIED",
    });
    expect(dialogShown(calls)).toBe(false);
    expect(executed(calls)).toHaveLength(0);
  });

  it("S2：`ask` 档执行 R1 命令 ⇒ 弹唯一确认框；拒绝 ⇒ EUSERDENIED，不执行", async () => {
    setMode("ask");
    const { ctx, calls } = fakeCtx({ dialog: false });
    await expectDialogDenied(ctx, calls);
  });

  it("S3：`auto` 档执行 R1 命令 ⇒ 静默执行（无弹框）", async () => {
    setMode("auto");
    const { ctx, calls } = fakeCtx({ dialog: true });
    await OPS.exec!.run({ commandId: "core.closeTab" }, ctx as never);
    expect(dialogShown(calls)).toBe(false);
    expect(executed(calls)).toHaveLength(1);
  });

  it("S4：`auto` 档 install 仍弹框（D9：装 = 问一声，不因档位取消）", async () => {
    setMode("auto");
    const { ctx, calls } = fakeCtx({ dialog: false });
    await expect(OPS.install!.run({ source: "E:/tmp/demo.linkdesk-plugin" }, ctx as never)).rejects.toMatchObject({
      code: "EUSERDENIED",
    });
    expect(dialogShown(calls)).toBe(true);
  });

  it("S5：`full` 档 install 不弹框（用户已明确全权），照常安装", async () => {
    setMode("full");
    const { ctx, calls } = fakeCtx({ dialog: true });
    await expect(OPS.install!.run({ source: "E:/tmp/demo.linkdesk-plugin" }, ctx as never)).resolves.toMatchObject({
      installed: true,
    });
    expect(dialogShown(calls)).toBe(false);
  });

  it("S8：settings.json 损坏 ⇒ 按 ask 处理（R1 命令弹框而非静默）", async () => {
    fs.writeFileSync(settingsFile, "{ broken", "utf8");
    const { ctx, calls } = fakeCtx({ dialog: false });
    await expect(OPS.exec!.run({ commandId: "core.closeTab" }, ctx as never)).rejects.toMatchObject({
      code: "EUSERDENIED",
    });
    expect(dialogShown(calls)).toBe(true);
  });
});

describe("提权回路：只问不答，批准写档位", () => {
  const target: PolicyMode = "auto";

  it("提权框正文写清「当前档 → 目标档 / 原因 / 常驻」（D2 不藏常驻事实）", () => {
    const text = elevationPrompt("ask", target, "需要连续整理 12 个主题插件的资料");
    expect(text).toContain("逐次确认");
    expect(text).toContain("自主");
    expect(text).toContain("需要连续整理 12 个主题插件的资料");
    expect(text).toContain("一直有效");
  });

  it("S7：用户允许 ⇒ 经壳命令 aiPolicy.setMode 写档位（不是 AI 能调的命令面）", async () => {
    setMode("ask");
    const { ctx, calls } = fakeCtx({ dialog: true });
    const out = await requestElevationFlow(ctx as never, { mode: "auto", reason: "批量整理" });
    expect(out).toEqual({ granted: true, mode: "auto" });
    const execs = executed(calls);
    expect(execs).toHaveLength(1);
    expect(execs[0]!.args.slice(0, 3)).toEqual([POLICY_SET_MODE_COMMAND, undefined, "auto"]);
    expect(execs[0]!.args[3]).toMatchObject({ via: "elevation" });
  });

  it("用户拒绝 ⇒ {granted:false}，不写档位", async () => {
    setMode("ask");
    const { ctx, calls } = fakeCtx({ dialog: false });
    const out = await requestElevationFlow(ctx as never, { mode: "auto", reason: "批量整理" });
    expect(out).toEqual({ granted: false, code: "EUSERDENIED" });
    expect(executed(calls)).toHaveLength(0);
  });

  it("无人应答 ⇒ 上抛 ESHELLTIMEOUT（没点头 = 没发生），不写档位", async () => {
    setMode("ask");
    const ctx = {
      shellRequest: async (channel: string, args: unknown[]): Promise<unknown> => {
        if (channel === IPC.dialog.confirm) throw Object.assign(new Error("壳无应答"), { code: "ESHELLTIMEOUT" });
        return {};
      },
    };
    await expect(requestElevationFlow(ctx as never, { mode: "auto", reason: "x" })).rejects.toMatchObject({
      code: "ESHELLTIMEOUT",
    });
  });

  it("D8：升到 full 要两次确认（第一次说明后果，第二次确认常驻）", async () => {
    setMode("auto");
    let confirmations = 0;
    const { ctx } = fakeCtx({ dialog: () => { confirmations += 1; return true; } });
    const out = await requestElevationFlow(ctx as never, { mode: "full", reason: "需要连续执行 R3" });
    expect(out).toEqual({ granted: true, mode: "full" });
    expect(confirmations).toBe(2);
  });

  it("升到 full 时第二次确认被拒 ⇒ 不写档位", async () => {
    setMode("auto");
    let confirmations = 0;
    const { ctx } = fakeCtx({ dialog: () => { confirmations += 1; return confirmations === 1; } });
    const out = await requestElevationFlow(ctx as never, { mode: "full", reason: "x" });
    expect(out).toEqual({ granted: false, code: "EUSERDENIED" });
    expect(confirmations).toBe(2);
  });

  it("请求同档 ⇒ 直接 granted（不打扰用户）", async () => {
    setMode("auto");
    const { ctx, calls } = fakeCtx({ dialog: true });
    expect(await requestElevationFlow(ctx as never, { mode: "auto", reason: "x" })).toEqual({
      granted: true,
      mode: "auto",
    });
    expect(dialogShown(calls)).toBe(false);
  });

  it("请求降档 / 非法档 / 空理由 ⇒ EARGS（⛔ 不许降档当提权走）", async () => {
    setMode("full");
    const { ctx } = fakeCtx({ dialog: true });
    await expect(requestElevationFlow(ctx as never, { mode: "read", reason: "x" })).rejects.toMatchObject({ code: "EARGS" });
    await expect(requestElevationFlow(ctx as never, { mode: "root", reason: "x" })).rejects.toMatchObject({ code: "EARGS" });
    await expect(requestElevationFlow(ctx as never, { mode: "full", reason: "  " })).rejects.toMatchObject({ code: "EARGS" });
  });

  it("⛔ 操作表里没有「批准提权」的面（AI 只能请求）", () => {
    const approvers = Object.keys(OPS).filter((op) => /^(approve|grant|setMode|setPolicy|answer)/i.test(op));
    expect(approvers).toEqual([]);
    expect(Object.keys(OPS)).toContain("requestElevation");
  });
});
