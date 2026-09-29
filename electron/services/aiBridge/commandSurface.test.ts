/**
 * 命令面「可见性」两半单测——生长格 `AI#54`（2026-09-29 用户拍板 = 壳侧兜底）。
 *
 * 钉的是四件**可机械查的事实**：
 *   ① `pickPendingCommands` 是**差集**而不是清单搬运——已注册的不列 · 坏条目跳过（清单是用户可写的
 *      JSON，宁可少列不可崩）· 同 id 去重 · 输出有序；`needs` 里给出**照做即可**的那一步；
 *   ② `settleCommandSurface` 只在「连续静默」时收工，**且永远有上限**——到 `capMs` 如实回
 *      `settled:false`（⛔ 不抛错：标签确实开了），且**不会多睡一轮把 cap 撑破**；
 *   ③ 桥级（`OPS`）三处接线：`describe.commandsPending` 走的是**声明面**（⛔ 与执行面 `commands` 分开）、
 *      `exec` 撞到「已声明未注册」给**带指引的** `EUNKNOWN` 且**不碰执行面**、`openTab` 把本次新挂牌的
 *      命令 id 一并交回；
 *   ④ 未注册且未声明的 id 仍走**原样的**干巴 `EUNKNOWN`（⛔ 别把「不在命令面」误报成「先开视图」）。
 *
 * ⏱ 时间全部注入（`sleep` / `now` 假钟）⇒ 上限那几条**零真实等待**；桥级 `openTab` 走默认预算
 *    （≈400ms，一次）——不注入是为让「默认值本身可用」也在测里。
 * ⛔ 不测「池侧挂载 ⇒ 插件注册 ⇒ `commands:register` 回传」这条链本身：那要真壳 + 真插件，
 *    归真机读数（交接条），这里只钉壳侧看的这一面。
 * 桩只用到 `ctx.shellRequest` / `identity` / `ledgerEntries`（结构型 `BridgeOpContext`），
 * 本模块族不 import electron ⇒ **不需要 electron 桩**；fixture 全虚构（硬约束 21）。
 */

import { describe, it, expect } from "vitest";
import { pickPendingCommands, settleCommandSurface } from "./commandSurface.js";
import { OPS, type BridgeOpContext } from "./whitelist.js";
import { IPC } from "../../ipc/channels.js";

/* ── ① 声明面差集 ── */

describe("pickPendingCommands——已声明、未注册的差集", () => {
  it("列出未注册的声明命令（带标题/说明/指引），已注册的不列", () => {
    const plugins = [
      {
        pluginId: "file-tree",
        manifest: {
          contributes: {
            commands: [
              { id: "file-tree.compareWithSelected", title: "与选中项比较", description: "对两个文件做 diff" },
              { id: "core.ping" }, // 已注册 ⇒ 不列
            ],
          },
        },
      },
    ];
    const pending = pickPendingCommands(plugins, [{ id: "core.ping" }]);
    expect(pending).toEqual([
      {
        id: "file-tree.compareWithSelected",
        title: "与选中项比较",
        description: "对两个文件做 diff",
        pluginId: "file-tree",
        needs: "先 open-tab file-tree（该插件的视图挂载后才注册）",
      },
    ]);
  });

  it("同 id 多处声明只留第一条 + 按 id 排序（确定性）", () => {
    const plugins = [
      { pluginId: "b", manifest: { contributes: { commands: [{ id: "z.cmd", title: "后声明的" }] } } },
      { pluginId: "a", manifest: { contributes: { commands: [{ id: "z.cmd", title: "先声明的" }, { id: "a.cmd" }] } } },
    ];
    const pending = pickPendingCommands(plugins, []);
    expect(pending.map((p) => p.id)).toEqual(["a.cmd", "z.cmd"]);
    // ⚠️ 「第一条」= **清单数组里先出现的那个**（`b` 插件）——⛔ 不是按 id 排序后的先者，
    //    排序只决定**输出**顺序，不决定**去重**归属（同一 id 的落点跟着清单顺序走）。
    expect(pending[1].title).toBe("后声明的");
    expect(pending[1].pluginId).toBe("b");
  });

  it("坏条目一律跳过，不崩（清单是用户可写的 JSON）", () => {
    const plugins = [
      { pluginId: "", manifest: { contributes: { commands: [{ id: "orphan.cmd" }] } } }, // 没有插件 id
      { pluginId: "p1", manifest: null }, // 没有 manifest
      { pluginId: "p2", manifest: { contributes: {} } }, // 没有 commands
      { pluginId: "p3", manifest: { contributes: { commands: "不是数组" } } },
      {
        pluginId: "p4",
        manifest: { contributes: { commands: [{ id: "" }, { id: 42 }, null, { title: "没有 id" }, { id: "ok.cmd" }] } },
      },
      null, // 清单本身可能是坏条目
    ];
    expect(pickPendingCommands(plugins as never, []).map((p) => p.id)).toEqual(["ok.cmd"]);
  });

  it("注册面里坏形状的条目不影响判定（非 string / 空 id 视为没有）", () => {
    const plugins = [{ pluginId: "p", manifest: { contributes: { commands: [{ id: "x" }] } } }];
    expect(pickPendingCommands(plugins, [{ id: 42 }, { id: "" }, {}, null]).map((p) => p.id)).toEqual(["x"]);
  });

  it("全已注册 ⇒ 空表（⛔ 不是把 commands 抄一遍）", () => {
    const plugins = [{ pluginId: "p", manifest: { contributes: { commands: [{ id: "a" }, { id: "b" }] } } }];
    expect(pickPendingCommands(plugins, [{ id: "a" }, { id: "b" }])).toEqual([]);
  });
});

/* ── ② 落定等待（假钟：零真实等待） ── */

/** 假钟——`sleep` 只把虚拟时间推前，不打真实定时器；`read` 脚本化每次返回一份命令面。 */
function fakeClock(frames: string[][]) {
  let t = 0;
  let reads = 0;
  return {
    sleep: async (ms: number) => {
      t += ms;
    },
    now: () => t,
    read: async () => {
      const frame = frames[Math.min(reads, frames.length - 1)] ?? [];
      reads += 1;
      return [...frame];
    },
    elapsed: () => t,
    reads: () => reads,
  };
}

describe("settleCommandSurface——等命令面落定，但有上限", () => {
  it("一直稳定 ⇒ 立刻按静默判定收工，added 为空", async () => {
    const clock = fakeClock([["a", "b"]]);
    const out = await settleCommandSurface(clock.read, ["a", "b"], {
      quietMs: 250, capMs: 2000, stepMs: 100, sleep: clock.sleep, now: clock.now,
    });
    expect(out).toEqual({ ids: ["a", "b"], added: [], polls: 3, settled: true });
    expect(clock.elapsed()).toBe(300); // 静默攒够 250ms 即停，不空转到 cap
  });

  it("等到「晚注册」的那一批落进来才算完，并把新增的 id 交回", async () => {
    // 前两次读还是老样子，第三次才多出 file-tree.compareWithSelected（= 视图挂载后注册）
    const clock = fakeClock([["a"], ["a"], ["a", "late.cmd"], ["a", "late.cmd"], ["a", "late.cmd"], ["a", "late.cmd"]]);
    const out = await settleCommandSurface(clock.read, ["a"], {
      quietMs: 250, capMs: 2000, stepMs: 100, sleep: clock.sleep, now: clock.now,
    });
    expect(out.settled).toBe(true);
    expect(out.ids).toEqual(["a", "late.cmd"]);
    expect(out.added).toEqual(["late.cmd"]);
    expect(out.polls).toBe(6); // 1 次变动 + 3 次静默
  });

  it("命令面一直在变 ⇒ 到 capMs 收工，如实 settled:false，⛔ 不抛错", async () => {
    let n = 0;
    const clock = fakeClock([]);
    const read = async () => ["a", ...Array.from({ length: (n += 1) }, (_, i) => `x${i}`)];
    const out = await settleCommandSurface(read, ["a"], {
      quietMs: 250, capMs: 300, stepMs: 100, sleep: clock.sleep, now: clock.now,
    });
    expect(out.settled).toBe(false);
    expect(clock.elapsed()).toBe(300); // 恰好到上限
    expect(out.polls).toBe(3);
    expect(out.added).toContain("x0");
  });

  it("剩余预算不足一个轮询间隔时不多睡一轮（⛔ 别把 cap 撑破）", async () => {
    const clock = fakeClock([["a"], ["a"]]);
    const out = await settleCommandSurface(clock.read, ["a"], {
      quietMs: 250, capMs: 150, stepMs: 100, sleep: clock.sleep, now: clock.now,
    });
    expect(out.settled).toBe(false);
    expect(out.polls).toBe(2);
    expect(clock.elapsed()).toBe(150); // 100 + min(100, 50)
  });

  it("ids 去重且有序（壳侧读数的形状与测试对齐用同一份）", async () => {
    const clock = fakeClock([["b", "a", "b"]]);
    const out = await settleCommandSurface(clock.read, [], {
      quietMs: 250, capMs: 2000, stepMs: 100, sleep: clock.sleep, now: clock.now,
    });
    expect(out.ids).toEqual(["a", "b"]);
    expect(out.added).toEqual(["a", "b"]);
  });

  it("added 有上限（异常插件挂牌上千条时不把回执撑爆）", async () => {
    const many = Array.from({ length: 100 }, (_, i) => `c${i}`);
    const clock = fakeClock([many]);
    const out = await settleCommandSurface(clock.read, [], {
      quietMs: 250, capMs: 2000, stepMs: 100, sleep: clock.sleep, now: clock.now, maxAdded: 3,
    });
    // 截断作用在**排序后**的增量上 ⇒ 取到的是字典序前三（`c10` 先于 `c2`）——上限是防撑爆，不是挑「重要的」
    expect(out.added).toEqual(["c0", "c1", "c10"]);
    expect(out.ids).toHaveLength(100); // ids 仍给全量（截断只作用在回执的增量上）
  });

  it("默认预算不撑破 MCP 侧 5 秒（capMs 默认 2 秒 < 5 秒）", async () => {
    const clock = fakeClock([]);
    let n = 0;
    const read = async () => Array.from({ length: (n += 1) }, (_, i) => `y${i}`);
    const out = await settleCommandSurface(read, [], { sleep: clock.sleep, now: clock.now });
    expect(out.settled).toBe(false);
    expect(clock.elapsed()).toBe(2000);
  });
});

/* ── ③ 桥级接线（`OPS` 直接调；假 ctx 只实现用到的三个方法） ── */

interface FakeOpts {
  commands?: Array<{ id: string } & Record<string, unknown>>;
  plugins?: unknown[];
  /** `tabs:create` 收到后做什么（模拟池侧挂载 ⇒ 插件注册 ⇒ 命令面变长） */
  onOpenTab?: (type: string) => void;
}

function fakeCtx(opts: FakeOpts = {}) {
  const commands = opts.commands ?? [];
  const seen: string[] = [];
  const ctx: BridgeOpContext = {
    identity: () => ({ pid: 4242 }),
    ledgerEntries: () => [],
    shellRequest: async (channel, args) => {
      seen.push(channel);
      if (channel === IPC.plugins.call && args[0] === "getCommands") return commands.map((c) => ({ ...c }));
      if (channel === IPC.plugins.call && args[0] === "list") return opts.plugins ?? [];
      if (channel === IPC.tabs.create) {
        opts.onOpenTab?.(String(args[0]));
        return undefined;
      }
      if (channel === IPC.commands.execute) return undefined; // 壳侧严格执行——本层只记「碰没碰」
      throw new Error(`意料之外的壳请求：${channel} / ${String(args[0])}`);
    },
  };
  return { ctx, seen, commands };
}

const VIEW_PLUGIN = {
  pluginId: "file-tree",
  manifest: { contributes: { commands: [{ id: "file-tree.compareWithSelected", title: "与选中项比较" }] } },
};

describe("OPS.describe——声明面与执行面分开", () => {
  it("commandsPending 列「已声明未注册」，commands 里没有它（能规划、不能执行）", async () => {
    const { ctx } = fakeCtx({ commands: [{ id: "core.ping" }], plugins: [VIEW_PLUGIN] });
    const out = (await OPS.describe.run({}, ctx)) as {
      commands: Array<{ id: string }>;
      commandCount: number;
      commandsPending: Array<{ id: string; needs: string }>;
    };
    expect(out.commands.map((c) => c.id)).toEqual(["core.ping"]);
    expect(out.commandCount).toBe(1);
    expect(out.commandsPending.map((p) => p.id)).toEqual(["file-tree.compareWithSelected"]);
    expect(out.commandsPending[0].needs).toContain("open-tab file-tree");
  });

  it("视图态命令已注册后就不再出现在 commandsPending（差集跟着注册面走）", async () => {
    const { ctx } = fakeCtx({
      commands: [{ id: "core.ping" }, { id: "file-tree.compareWithSelected" }],
      plugins: [VIEW_PLUGIN],
    });
    const out = (await OPS.describe.run({}, ctx)) as { commandsPending: unknown[] };
    expect(out.commandsPending).toEqual([]);
  });
});

describe("OPS.exec——撞到未注册的声明命令给带指引的 EUNKNOWN", () => {
  it("已声明未注册 ⇒ EUNKNOWN 正文含插件 id 与那一步，且⛔ 不碰执行面", async () => {
    const { ctx, seen } = fakeCtx({ commands: [{ id: "core.ping" }], plugins: [VIEW_PLUGIN] });
    await expect(
      OPS.exec.run({ commandId: "file-tree.compareWithSelected" }, ctx),
    ).rejects.toMatchObject({ code: "EUNKNOWN", message: expect.stringContaining("open-tab file-tree") });
    expect(seen).not.toContain(IPC.commands.execute);
  });

  it("既没注册也没声明 ⇒ 仍是原样的干巴 EUNKNOWN（⛔ 别误报「先开视图」）", async () => {
    const { ctx, seen } = fakeCtx({ commands: [{ id: "core.ping" }], plugins: [VIEW_PLUGIN] });
    const err = await OPS.exec.run({ commandId: "nonexistent.cmd" }, ctx).catch((e: Error) => e);
    expect((err as Error & { code: string }).code).toBe("EUNKNOWN");
    expect(err.message).toContain("不在当前命令面");
    expect(err.message).not.toContain("open-tab");
    expect(seen).not.toContain(IPC.commands.execute);
  });

  it("注册面里有 ⇒ 真执行（走 IPC.commands.execute，token 槽位占位 undefined）", async () => {
    const { ctx } = fakeCtx({ commands: [{ id: "app.openAiManual" }] });
    const out = await OPS.exec.run({ commandId: "app.openAiManual", args: [1] }, ctx);
    expect(out).toEqual({ commandId: "app.openAiManual", result: null });
  });
});

describe("OPS.openTab——开完等命令面落定，并把新挂牌的 id 交回", () => {
  it("晚注册的那一条经 added 回来（AI 不必自己再 describe 一次比对）", async () => {
    const { ctx, commands } = fakeCtx({
      commands: [{ id: "app" }],
      // 模拟池侧挂载 ⇒ 插件注册 ⇒ `commands:register` 回传后命令面变长
      onOpenTab: (type) => {
        if (type === "file-tree") commands.push({ id: "file-tree.compareWithSelected" });
      },
    });
    // 走默认预算（quiet 250 / step 100 / cap 2000）——真实等待 ≈400ms，一次，换「默认值本身可用」也被测到
    const out = (await OPS.openTab.run({ type: "file-tree" }, ctx)) as {
      accepted: boolean; type: string; added: string[]; commandsSettled: boolean;
    };
    expect(out.accepted).toBe(true);
    expect(out.type).toBe("file-tree");
    expect(out.added).toEqual(["file-tree.compareWithSelected"]);
    expect(out.commandsSettled).toBe(true);
  });

  it("type 缺失 ⇒ EARGS（⛔ 不去碰壳）", async () => {
    const { ctx, seen } = fakeCtx();
    await expect(OPS.openTab.run({}, ctx)).rejects.toMatchObject({ code: "EARGS" });
    expect(seen).toEqual([]);
  });
});
