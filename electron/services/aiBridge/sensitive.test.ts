/**
 * 敏感动作确认回路单测——M4 `AI#29`。
 *
 * 钉的是四件**可机械查的事实**（真机读数在交接条里）：
 *   ① 名单与自述面**同一份**（`askFirstCatalog` 派生自名单，⛔ 不手抄）；
 *   ② **门开在动作上**，不是开在入口上——`exec` / `notifyAction` 两条执行路都拦敏感命令，
 *      且都在**执行之前**拦（负控：没点头就绝不去碰命令面）；
 *   ③ 未点头 = `EUSERDENIED`（机读 code）且**动作不执行**（fail-closed）；
 *   ④ ⛔ **确认面不可被 AI 代答**：操作表里没有任何「应答/取消」面（AI 自己点同意 = 这道门白修）。
 *
 * 桩只用到 `ctx.shellRequest`（结构型 `AskContext`），不碰 electron / net；fixture 全虚构（硬约束 21）。
 */

import { describe, it, expect } from "vitest";
import {
  ASK_FIRST_COMMANDS,
  ASK_FIRST_OPS,
  ASK_TIMEOUT_MS,
  USER_DENIED,
  askFirstCatalog,
  askFirstRuleForCommand,
  askFirstRuleForOp,
  askUser,
  confirmPrompt,
  userDenied,
} from "./sensitive.js";
import { OPS, coded } from "./whitelist.js";
import { IPC } from "../../ipc/channels.js";

/* ── 假 ctx：记下每次壳请求，按脚本作答 ── */

interface RecordedCall {
  channel: string;
  args: unknown[];
  timeoutMs?: number;
}

function fakeCtx(answers: Record<string, unknown>) {
  const calls: RecordedCall[] = [];
  return {
    calls,
    ctx: {
      shellRequest: async (channel: string, args: unknown[], timeoutMs?: number): Promise<unknown> => {
        calls.push({ channel, args, timeoutMs });
        const key = channel === IPC.commands.execute ? String(args[0]) : channel;
        if (key in answers) return answers[key];
        // 未预设的通道一律答「成功」的空结果——测试关心的是**门有没有拦**，不是命令执行细节
        return {};
      },
    },
  };
}

const CONFIRM_OK = { [IPC.dialog.confirm]: true };
const CONFIRM_NO = { [IPC.dialog.confirm]: false };

describe("敏感名单与自述面（AI#29）", () => {
  it("自述面从名单派生：ops/commands 逐条一致（改名单即改自述，⛔ 不可能漂移）", () => {
    const catalog = askFirstCatalog();
    expect(catalog.ops).toEqual(ASK_FIRST_OPS);
    expect(catalog.commands).toEqual(ASK_FIRST_COMMANDS);
    expect(catalog.note.length).toBeGreaterThan(0);
  });

  it("名单非空（⚠️ 空名单会让本尺恒绿——存量真有一条不可回退的动作）", () => {
    expect(ASK_FIRST_COMMANDS.length).toBeGreaterThan(0);
    expect(ASK_FIRST_OPS.map((r) => r.id)).toContain("install");
  });

  it("每条名单都写清了 what/why（确认框正文靠它，⛔ 不是裸 id）", () => {
    for (const r of [...ASK_FIRST_COMMANDS, ...ASK_FIRST_OPS]) {
      expect(r.what.length).toBeGreaterThan(0);
      expect(r.why.length).toBeGreaterThan(0);
    }
  });

  it("名单表外一律不问（⛔ 别把确认框撒成噪音——那会训练用户闭眼点同意）", () => {
    expect(askFirstRuleForCommand("core.closeTab")).toBeNull();
    expect(askFirstRuleForCommand("app.openAiManual")).toBeNull();
    expect(askFirstRuleForOp("exec")).toBeNull(); // exec 的敏感性看**目标命令**，不看 op 本身
    expect(askFirstRuleForCommand("update.openUpdateFlow")?.id).toBe("update.openUpdateFlow");
  });

  it("确认框正文统一形状：what + subject + 「不点 = 不执行」", () => {
    const text = confirmPrompt("安装插件", "E:/tmp/demo.linkdesk-plugin");
    expect(text).toContain("AI 请求安装插件");
    expect(text).toContain("E:/tmp/demo.linkdesk-plugin");
    expect(text).toContain("不点 = 不执行");
  });

  it("未点头的错误带机读 code（客户端按 code 分类，⛔ 不是 EERROR、更不是成功）", () => {
    const e = userDenied("安装插件", "E:/tmp/demo.linkdesk-plugin");
    expect(e.code).toBe(USER_DENIED);
    expect(e.code).toBe("EUSERDENIED");
    expect(e.message).toContain("没点头就不执行");
  });
});

describe("统一确认回路 askUser（AI#29：唯一弹框出口）", () => {
  it("用户点头 ⇒ 放行，且走的是既有 dialog:confirm 通道（零新 IPC）", async () => {
    const { ctx, calls } = fakeCtx(CONFIRM_OK);
    await askUser(ctx, "安装插件", "E:/tmp/demo.linkdesk-plugin");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.channel).toBe(IPC.dialog.confirm);
    expect(calls[0]!.timeoutMs).toBe(ASK_TIMEOUT_MS); // 等的是人，不是服务——预算以分钟计
  });

  it("用户取消 / 关框（false）⇒ EUSERDENIED，动作**不执行**", async () => {
    const { ctx } = fakeCtx(CONFIRM_NO);
    await expect(askUser(ctx, "安装插件", "x")).rejects.toMatchObject({ code: "EUSERDENIED" });
  });

  it("壳没应答（拿不到答复）⇒ 上抛，同样不放行（fail-closed：拿不到答复 ≠ 得到同意）", async () => {
    const ctx = { shellRequest: async (): Promise<unknown> => { throw coded("ESHELLTIMEOUT", "壳无应答"); } };
    await expect(askUser(ctx, "安装插件", "x")).rejects.toMatchObject({ code: "ESHELLTIMEOUT" });
  });

  it("⛔ 只有布尔 true 才算点头（真值不代表同意——undefined/null/字符串一律拒）", async () => {
    for (const answer of [undefined, null, "true", 1, {}]) {
      const ctx = { shellRequest: async (): Promise<unknown> => answer };
      await expect(askUser(ctx, "安装插件", "x")).rejects.toMatchObject({ code: "EUSERDENIED" });
    }
  });
});

describe("门开在动作上：exec / notifyAction 的执行出口（AI#29）", () => {
  /** exec 先要过存在性检查（现取命令面）——桩里给一条命令面 */
  const commandList = [{ id: "update.openUpdateFlow" }, { id: "core.closeTab" }];

  function execCtx(dialogAnswer: boolean) {
    const calls: RecordedCall[] = [];
    const ctx = {
      shellRequest: async (channel: string, args: unknown[]): Promise<unknown> => {
        calls.push({ channel, args });
        if (channel === IPC.plugins.call && args[0] === "getCommands") return commandList;
        if (channel === IPC.dialog.confirm) return dialogAnswer;
        return { ok: true };
      },
    };
    return { calls, ctx };
  }

  const executed = (calls: RecordedCall[]) => calls.filter((c) => c.channel === IPC.commands.execute);

  it("敏感命令 + 用户点头 ⇒ 先弹框再执行（顺序可查）", async () => {
    const { ctx, calls } = execCtx(true);
    const out = (await OPS.exec!.run({ commandId: "update.openUpdateFlow" }, ctx as never)) as { commandId: string };
    expect(out.commandId).toBe("update.openUpdateFlow");
    expect(calls.map((c) => c.channel)).toEqual([IPC.plugins.call, IPC.dialog.confirm, IPC.commands.execute]);
  });

  it("🔴 敏感命令 + 用户不点头 ⇒ EUSERDENIED，且**一次都没碰命令面**（这是本格的主负控）", async () => {
    const { ctx, calls } = execCtx(false);
    await expect(OPS.exec!.run({ commandId: "update.openUpdateFlow" }, ctx as never)).rejects.toMatchObject({
      code: "EUSERDENIED",
    });
    expect(executed(calls)).toHaveLength(0);
  });

  it("普通命令 ⇒ 不问，行为与从前一致（只查存在性 + 执行）", async () => {
    const { ctx, calls } = execCtx(true);
    await OPS.exec!.run({ commandId: "core.closeTab" }, ctx as never);
    expect(calls.map((c) => c.channel)).toEqual([IPC.plugins.call, IPC.commands.execute]);
  });

  it("不存在的命令 ⇒ EUNKNOWN，且**不弹框**（对不存在的命令弹框只是骚扰）", async () => {
    const { ctx, calls } = execCtx(true);
    await expect(OPS.exec!.run({ commandId: "no.such.command" }, ctx as never)).rejects.toMatchObject({ code: "EUNKNOWN" });
    expect(calls.some((c) => c.channel === IPC.dialog.confirm)).toBe(false);
  });

  it("notifyAction 的按钮指向敏感命令 ⇒ 同样要点头；不点头则按钮不执行", async () => {
    for (const [answer, expectErr] of [[false, true] as const, [true, false] as const]) {
      const calls: RecordedCall[] = [];
      const ctx = {
        shellRequest: async (channel: string, args: unknown[]): Promise<unknown> => {
          calls.push({ channel, args });
          if (channel === IPC.plugins.call && args[0] === "listNotifications") {
            return { groups: [{ items: [{ id: "n1", actions: [{ label: "重启并更新", command: "update.openUpdateFlow" }] }] }] };
          }
          if (channel === IPC.dialog.confirm) return answer;
          return { ok: true };
        },
      };
      const run = OPS.notifyAction!.run({ notificationId: "n1", action: "重启并更新" }, ctx as never);
      if (expectErr) {
        await expect(run).rejects.toMatchObject({ code: "EUSERDENIED" });
        expect(executed(calls)).toHaveLength(0);
      } else {
        await expect(run).resolves.toMatchObject({ pressed: true, command: "update.openUpdateFlow" });
        expect(executed(calls)).toHaveLength(1);
      }
    }
  });

  it("install + 用户不点头 ⇒ EUSERDENIED（⛔ 不再返回 installed:false 那种「账面无错、其实没装」的形状）", async () => {
    const { ctx, calls } = fakeCtx(CONFIRM_NO);
    await expect(OPS.install!.run({ source: "E:/tmp/demo.linkdesk-plugin" }, ctx as never)).rejects.toMatchObject({
      code: "EUSERDENIED",
    });
    expect(calls.some((c) => c.channel === IPC.plugins.call)).toBe(false); // 连装的那一步都没发
  });

  it("install + 用户点头 ⇒ 正常走安装（结果形状不变，含 job）", async () => {
    const { ctx } = fakeCtx({ ...CONFIRM_OK, [IPC.plugins.call]: { success: true, pluginId: "demo" } });
    await expect(OPS.install!.run({ source: "E:/tmp/demo.linkdesk-plugin" }, ctx as never)).resolves.toMatchObject({
      installed: true,
    });
  });
});

describe("⛔ 确认面不可被 AI 代答（AI#29 边界①）", () => {
  it("操作表里没有任何「应答确认框」的面——AI 只能发起询问，不能自己点同意", () => {
    const answerish = Object.keys(OPS).filter((op) => /^(dialog|answer|respond|confirm|approve|resolve)/i.test(op));
    expect(answerish).toEqual([]);
  });

  it("操作级错误仍从 whitelist 出口可取（构造器搬家后调用方零改动）", () => {
    expect(coded("EDEMO", "演示").code).toBe("EDEMO");
  });
});
