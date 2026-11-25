/**
 * 描述面风险自述单测——S7/T4：`surfaceCommandRisks` 给每条命令贴 `risk` ＋ `riskSource`
 * （壳表只管壳命令、插件只认声明、均无 ⇒ R2 fallback）。
 *
 * 纯函数直打：不起窗口、不碰 IPC。
 */

import { describe, it, expect } from "vitest";
import { IPC } from "../../ipc/channels.js";
import { OPS, askFirstForMode, pageCommands, surfaceCommandRisks } from "./whitelist.js";
import { createOpRegistry } from "./opRegistry.js";

describe("surfaceCommandRisks：describe 命令面的风险自述（S7/T4）", () => {
  it("壳命令（shellOwned）⇒ 壳表；表外 ⇒ R2 fallback", () => {
    const out = surfaceCommandRisks([
      { id: "workbench.action.getConfiguration", shellOwned: true },
      { id: "demo.shell-unknown", shellOwned: true },
    ]);
    expect(out[0]).toMatchObject({ risk: "R0", riskSource: "shell" });
    expect(out[1]).toMatchObject({ risk: "R2", riskSource: "fallback" });
  });

  it("插件命令 ⇒ 只认声明；未声明 ⇒ R2 fallback", () => {
    const out = surfaceCommandRisks([
      { id: "demo.declared", shellOwned: false, risk: "R2" },
      { id: "demo.undeclared", shellOwned: false },
    ]);
    expect(out[0]).toMatchObject({ risk: "R2", riskSource: "declared" });
    expect(out[1]).toMatchObject({ risk: "R2", riskSource: "fallback" });
  });

  it("壳表 ⛔ 覆盖插件声明：撞 id 以声明为准", () => {
    const out = surfaceCommandRisks([{ id: "update.openUpdateFlow", shellOwned: false, risk: "R1" }]);
    expect(out[0]).toMatchObject({ risk: "R1", riskSource: "declared" });
  });

  it("缺 shellOwned（旧 DTO / 外部桩）⇒ 按插件命令保守兜底（⛔ 不落壳表）", () => {
    const out = surfaceCommandRisks([{ id: "demo.legacy" }]);
    expect(out[0]).toMatchObject({ risk: "R2", riskSource: "fallback" });
  });

  it("原字段全保留（spread），只加 risk/riskSource", () => {
    const out = surfaceCommandRisks([{ id: "demo.x", title: "T", shellOwned: false }]);
    expect(out[0].title).toBe("T");
    expect(Object.keys(out[0]).sort()).toEqual(["id", "risk", "riskSource", "shellOwned", "title"]);
  });
});

describe("exec 池侧 miss 三码映射（S4/T8 · 唯一映射点）", () => {
  /** 桩壳：命令面 + 执行拒绝（池侧 miss 的 canonical 错误串 = preload-pool executeLocal 的「未在池内注册」） */
  function execCtx(surface: unknown[], executeError: Error) {
    const ctx = {
      shellRequest: async (channel: string, args: unknown[]): Promise<unknown> => {
        if (channel === IPC.plugins.call && args[0] === "getCommands") return surface;
        if (channel === IPC.plugins.call && args[0] === "list") return [];
        if (channel === IPC.commands.execute) throw executeError;
        return { ok: true };
      },
    };
    return ctx;
  }

  it("activation=view 的命令池 miss ⇒ EVIEWREQUIRED（先 open-tab）", async () => {
    const ctx = execCtx(
      [{ id: "demo-plugin.viewCmd", activation: "view", shellOwned: false, risk: "R0" }],
      new Error('命令 "demo-plugin.viewCmd" 未在池内注册'),
    );
    await expect(OPS.exec!.run({ commandId: "demo-plugin.viewCmd" }, ctx as never)).rejects.toMatchObject({
      code: "EVIEWREQUIRED",
      message: expect.stringContaining("open-tab"),
    });
  });

  it("activation=entry 的命令池 miss ⇒ ENOTACTIVE（入口没认领）", async () => {
    const ctx = execCtx(
      [{ id: "demo-plugin.entryCmd", activation: "entry", shellOwned: false, risk: "R0" }],
      new Error('命令 "demo-plugin.entryCmd" 未在池内注册'),
    );
    await expect(OPS.exec!.run({ commandId: "demo-plugin.entryCmd" }, ctx as never)).rejects.toMatchObject({
      code: "ENOTACTIVE",
      message: expect.stringContaining("入口"),
    });
  });

  it("非池 miss 错误 ⇒ 原样上抛（⛔ 不误判成可达性码）", async () => {
    const boom = new Error("boom");
    const ctx = execCtx([{ id: "demo-plugin.x", activation: "entry", shellOwned: false, risk: "R0" }], boom);
    await expect(OPS.exec!.run({ commandId: "demo-plugin.x" }, ctx as never)).rejects.toBe(boom);
  });
});

describe("exec 异步命令（S6/T11 · A 案声明式）", () => {
  function asyncCtx(opts: { surface: unknown[]; execute: () => Promise<unknown>; confirmAnswer?: boolean }) {
    const ops = createOpRegistry();
    const completed: Array<{ opId: string; commandId: string; state: string; code: string | null }> = [];
    const ctx = {
      ops,
      shellRequest: async (channel: string, args: unknown[]): Promise<unknown> => {
        if (channel === IPC.plugins.call && args[0] === "getCommands") return opts.surface;
        if (channel === IPC.plugins.call && args[0] === "list") return [];
        if (channel === IPC.dialog.confirm) return opts.confirmAnswer ?? true;
        if (channel === IPC.commands.execute) return opts.execute();
        return { ok: true };
      },
      recordOpCompleted: (e: { opId: string; commandId: string; state: "done" | "failed"; code: string | null }) => {
        completed.push(e);
      },
    };
    return { ctx, ops, completed };
  }

  it("async:true ⇒ 立即回 {pending:true, opId, startedAt}，后台结算后 opStatus=done 且账本有 op.completed", async () => {
    let release!: (v: unknown) => void;
    const { ctx, ops, completed } = asyncCtx({
      surface: [{ id: "demo-plugin.slow", shellOwned: false, risk: "R0", async: true }],
      execute: () => new Promise((resolve) => { release = resolve; }),
    });

    const out = (await OPS.exec!.run({ commandId: "demo-plugin.slow" }, ctx as never)) as {
      commandId: string; pending?: boolean; opId?: string; startedAt?: string; result?: unknown;
    };
    expect(out.pending).toBe(true);
    expect(typeof out.opId).toBe("string");
    expect(out.result).toBeUndefined(); // ⛔ 不塞进 result 再包一层
    expect(ops.status(out.opId!)?.state).toBe("running");

    release({ done: 42 });
    await new Promise((r) => setTimeout(r, 0)); // 让 then 链跑完
    const view = ops.status(out.opId!)!;
    expect(view.state).toBe("done");
    expect(view.result).toEqual({ done: 42 });
    expect(completed).toEqual([expect.objectContaining({ opId: out.opId, state: "done", code: null })]);
  });

  it("async 后台失败 ⇒ opStatus=failed 带码，账本行 ok=false", async () => {
    const { ctx, ops, completed } = asyncCtx({
      surface: [{ id: "demo-plugin.boom", shellOwned: false, risk: "R0", async: true }],
      execute: async () => { throw Object.assign(new Error("坏了"), { code: "ESHELLERROR" }); },
    });
    const out = (await OPS.exec!.run({ commandId: "demo-plugin.boom" }, ctx as never)) as { opId: string };
    await new Promise((r) => setTimeout(r, 0));
    const view = ops.status(out.opId)!;
    expect(view.state).toBe("failed");
    expect(view.error).toEqual({ code: "ESHELLERROR", message: "坏了" });
    expect(completed).toEqual([expect.objectContaining({ state: "failed", code: "ESHELLERROR" })]);
  });

  it("🔴 async + R3 命令、用户不点头 ⇒ EUSERDENIED 且**不回 pending**（确认先于 pending）", async () => {
    const { ctx, ops, completed } = asyncCtx({
      surface: [{ id: "update.openUpdateFlow", shellOwned: true, risk: "R3", async: true }],
      execute: async () => "should-not-run",
      confirmAnswer: false,
    });
    await expect(OPS.exec!.run({ commandId: "update.openUpdateFlow" }, ctx as never)).rejects.toMatchObject({
      code: "EUSERDENIED",
    });
    expect(ops.size()).toBe(0); // 没开 op
    expect(completed).toEqual([]);
  });

  it("同步命令 ⛔ 回 pending（不装异步）", async () => {
    const { ctx } = asyncCtx({
      surface: [{ id: "demo-plugin.normal", shellOwned: false, risk: "R0" }],
      execute: async () => ({ ok: 1 }),
    });
    const out = (await OPS.exec!.run({ commandId: "demo-plugin.normal" }, ctx as never)) as { pending?: boolean; result?: unknown };
    expect(out.pending).toBeUndefined();
    expect(out.result).toEqual({ ok: 1 });
  });
});

describe("S3a/T15：describe 筛选与分页（唯一实现）", () => {
  const cmds = [
    { id: "a.one", pluginId: "a", category: "串口", title: "发送", description: "发数据" },
    { id: "a.two", pluginId: "a", category: "串口", title: "读游标", description: "cursor 读取" },
    { id: "b.three", pluginId: "b", category: "文件", title: "新建", description: "建文件" },
  ];

  it("缺省 ⇒ 全量、nextCursor=null（与旧行为一致）", () => {
    const out = pageCommands(cmds, {});
    expect(out.commands.map((c) => c.id)).toEqual(["a.one", "a.two", "b.three"]);
    expect(out.total).toBe(3);
    expect(out.nextCursor).toBeNull();
  });

  it("filter.pluginId / category / query（子串，大小写不敏感）", () => {
    expect(pageCommands(cmds, { filter: { pluginId: "a" } }).commands.map((c) => c.id)).toEqual(["a.one", "a.two"]);
    expect(pageCommands(cmds, { filter: { category: "文件" } }).commands.map((c) => c.id)).toEqual(["b.three"]);
    expect(pageCommands(cmds, { filter: { query: "CURSOR" } }).commands.map((c) => c.id)).toEqual(["a.two"]);
  });

  it("limit+cursor 翻页不漏不重（模拟 600 条）", () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ id: `p.c${i}`, pluginId: "p", category: "x", title: `t${i}`, description: "" }));
    const seen: string[] = [];
    let cursor: string | null = null;
    let rounds = 0;
    do {
      const page = pageCommands(many, { limit: 50, cursor });
      seen.push(...page.commands.map((c) => c.id));
      cursor = page.nextCursor;
      rounds += 1;
    } while (cursor && rounds < 20);
    expect(rounds).toBe(12);
    expect(new Set(seen).size).toBe(600);
    expect(seen.length).toBe(600);
  });

  it("换 filter 复用旧 cursor ⇒ EARGS（游标与筛选绑定）", () => {
    const first = pageCommands(cmds, { limit: 1 });
    expect(first.nextCursor).toBeTruthy();
    expect(() => pageCommands(cmds, { limit: 1, cursor: first.nextCursor, filter: { pluginId: "a" } })).toThrow(/不匹配/);
  });

  it("伪造/坏 cursor ⇒ EARGS（不透明串，⛔ 自己构造）", () => {
    expect(() => pageCommands(cmds, { cursor: "oops" })).toThrow(/游标不合法/);
    expect(() => pageCommands(cmds, { cursor: "c_%%%" })).toThrow(/游标解不开/);
  });
});

describe("S3b/T12：describe 透出 returns/example ＋ 顶层 apiVersion（壳生成）", () => {
  function t12ctx(surface: unknown[]) {
    return {
      appVersion: () => "0.2.65",
      shellRequest: async (channel: string, args: unknown[]): Promise<unknown> => {
        if (channel === IPC.plugins.call && args[0] === "getCommands") return surface;
        if (channel === IPC.plugins.call && args[0] === "list") return [];
        return { ok: true };
      },
    };
  }

  it("命令条目带 returns/example（原样透出，⛔ 壳加工）", async () => {
    const returns = [{ name: "count", type: "number", description: "端口数" }];
    const example = { sessionId: "s1" };
    const out = (await OPS.describe!.run({}, t12ctx([
      { id: "demo.ports", shellOwned: false, risk: "R0", returns, example },
    ]) as never)) as { commands: Array<Record<string, unknown>> };
    expect(out.commands[0].returns).toEqual(returns);
    expect(out.commands[0].example).toEqual(example);
  });

  it("apiVersion = linkdesk/<壳版本>+bridge<结构修订号>（壳生成，⛔ 作者手填）", async () => {
    const out = (await OPS.describe!.run({}, t12ctx([]) as never)) as { apiVersion: string };
    expect(out.apiVersion).toBe("linkdesk/0.2.65+bridge2");
  });
});

describe("S3a 外部实测回归：filter 未知键 fail-closed", () => {
  it("未知键 ⇒ EBADFILTER（⛔ 静默返回全量）", () => {
    expect(() => pageCommands([{ id: "a.x" }], { filter: { commandId: "a.x" } })).toThrow(/不支持的 filter 键/);
    try {
      pageCommands([{ id: "a.x" }], { filter: { commandId: "a.x" } });
    } catch (e) {
      expect((e as Error & { code?: string }).code).toBe("EBADFILTER");
    }
  });

  it("合法键照常筛选（pluginId/category/query）", () => {
    const out = pageCommands([{ id: "a.x", pluginId: "a" }], { filter: { pluginId: "a" } });
    expect(out.total).toBe(1);
  });
});

describe("S7 外部实测回归：askFirst 按档位实算（含插件声明 R3）", () => {
  const surface = [
    { id: "serial-monitor.reset", risk: "R3", title: "复位" },
    { id: "serial-monitor.send", risk: "R2", title: "发送" },
    { id: "demo.read", risk: "R0", title: "读" },
  ];

  it("auto 档：只列 R3（插件声明的也算），R2/R0 不列", () => {
    const out = askFirstForMode(surface, "auto");
    expect(out.commands.map((c) => c.id)).toEqual(["serial-monitor.reset"]);
    expect(out.note).toContain("auto");
  });

  it("full 档：一律不问（命令与 op 都空）", () => {
    const out = askFirstForMode(surface, "full");
    expect(out.commands).toEqual([]);
    expect(out.ops).toEqual([]);
    expect(out.note).toContain("full 档一律不问");
  });

  it("ask 档：R1–R3 都问（R0 不问）", () => {
    const out = askFirstForMode(surface, "ask");
    expect(out.commands.map((c) => c.id).sort()).toEqual(["serial-monitor.reset", "serial-monitor.send"]);
    expect(out.ops.some((o) => o.id === "install")).toBe(true);
  });
});

describe("openTab 回执保真（外部实测：新建成功却回 added:[]）", () => {
  it("新建了标签 ⇒ openedTabs 如实回 1 个（added 只是命令）", async () => {
    let tabsCall = 0;
    const ctx = {
      shellRequest: async (channel: string, args: unknown[]): Promise<unknown> => {
        if (channel === IPC.plugins.call && args[0] === "getCommands") return [{ id: "app.x" }];
        if (channel === IPC.plugins.call && args[0] === "list") return [];
        if (channel === IPC.plugins.call && args[0] === "listTabs") {
          tabsCall += 1;
          // 第 1 次（开前）无；开之后（第 2 次起）有一个新 tab
          return tabsCall === 1
            ? { windows: [{ groups: [{ tabs: [] }] }] }
            : { windows: [{ groups: [{ tabs: [{ id: "serial-monitor-9", pluginId: "serial-monitor" }] }] }] };
        }
        if (channel === IPC.tabs.create) return undefined;
        return { ok: true };
      },
    };
    const out = (await OPS.openTab!.run({ type: "serial-monitor" }, ctx as never)) as {
      openedTabs: string[]; reused: boolean; added: string[];
    };
    expect(out.openedTabs).toEqual(["serial-monitor-9"]);
    expect(out.reused).toBe(false);
    expect(out.added).toEqual([]); // 没有新命令，但标签确已新建
  });

  it("复用已有标签 ⇒ openedTabs 空、reused=true", async () => {
    const ctx = {
      shellRequest: async (channel: string, args: unknown[]): Promise<unknown> => {
        if (channel === IPC.plugins.call && args[0] === "getCommands") return [{ id: "app.x" }];
        if (channel === IPC.plugins.call && args[0] === "list") return [];
        if (channel === IPC.plugins.call && args[0] === "listTabs") {
          return { windows: [{ groups: [{ tabs: [{ id: "t1", pluginId: "app" }] }] }] };
        }
        if (channel === IPC.tabs.create) return undefined;
        return { ok: true };
      },
    };
    const out = (await OPS.openTab!.run({ type: "app" }, ctx as never)) as { openedTabs: string[]; reused: boolean };
    expect(out.openedTabs).toEqual([]);
    expect(out.reused).toBe(true);
  });
});
