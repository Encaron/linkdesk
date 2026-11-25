/**
 * 声明面 `risk` / `activation` 必填单测（S7 ＋ T3 · 2026-11-25）。
 *
 * T3 起 loader **硬拒绝**：任一条命令缺 `risk` 或 `activation`（或值非法）⇒ 该命令不注册，
 * 并打一条响亮错误。理由：兜底 R2 在默认 auto 档不弹确认（不是安全兜底），activation 缺省
 * 又让 AI 无法预判可达性——两件都是「声明即可知」的事实，漏写时宁可失败。
 *
 * 本文件同时钉住 async 声明（S6）在 T3 之后的正常路径。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// 隔离注册表：只关心 parseContributions 往 registerCommand 送了什么
const registered: Array<Record<string, unknown>> = [];
vi.mock("../../core/registry/commands/CommandRegistry", () => ({
  registerCommand: (_pluginId: string, cmd: Record<string, unknown>) => {
    registered.push(cmd);
    return () => {};
  },
  getCommands: () => [],
}));

import { parseContributions } from "./contributions";

describe("contributes.commands[] 的 risk/activation（T3 必填）", () => {
  beforeEach(() => {
    registered.length = 0;
  });

  it("齐全且合法 ⇒ 原样落到命令元数据", async () => {
    await parseContributions("demo-plugin", {
      commands: [
        { id: "demo-plugin.read", title: "Read", risk: "R0", activation: "entry" },
        { id: "demo-plugin.write", title: "Write", risk: "R3", activation: "view" },
      ],
    });
    const byId = new Map(registered.map((c) => [c.id, c]));
    expect(byId.get("demo-plugin.read")?.risk).toBe("R0");
    expect(byId.get("demo-plugin.read")?.activation).toBe("entry");
    expect(byId.get("demo-plugin.write")?.risk).toBe("R3");
    expect(byId.get("demo-plugin.write")?.activation).toBe("view");
  });

  it("缺 risk ⇒ 拒绝注册（⛔ 兜底 R2 装成正常命令）", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await parseContributions("demo-plugin", {
      commands: [{ id: "demo-plugin.plain", title: "Plain", activation: "entry" }],
    });
    expect(registered).toEqual([]);
    expect(error.mock.calls.some((c) => String(c[0]).includes("risk"))).toBe(true);
    error.mockRestore();
  });

  it("缺 activation ⇒ 拒绝注册（AI 无法预判可达性）", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await parseContributions("demo-plugin", {
      commands: [{ id: "demo-plugin.no-act", title: "NoAct", risk: "R1" }],
    });
    expect(registered).toEqual([]);
    expect(error.mock.calls.some((c) => String(c[0]).includes("activation"))).toBe(true);
    error.mockRestore();
  });

  it("risk 值非法（R9/数字）⇒ 拒绝注册", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await parseContributions("demo-plugin", {
      commands: [
        { id: "demo-plugin.odd", title: "Odd", risk: "R9", activation: "entry" },
        { id: "demo-plugin.num", title: "Num", risk: 0, activation: "entry" },
      ],
    });
    expect(registered).toEqual([]);
    expect(error.mock.calls.length).toBe(2);
    warn.mockRestore();
    error.mockRestore();
  });

  it("activation 值非法（tab）⇒ 拒绝注册", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await parseContributions("demo-plugin", {
      commands: [{ id: "demo-plugin.tab", title: "Tab", risk: "R1", activation: "tab" }],
    });
    expect(registered).toEqual([]);
    expect(error.mock.calls.length).toBe(1);
    warn.mockRestore();
    error.mockRestore();
  });

  it("一条坏项不吃掉好项（逐条判定）", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await parseContributions("demo-plugin", {
      commands: [
        { id: "demo-plugin.bad", title: "Bad", risk: "R1" },
        { id: "demo-plugin.good", title: "Good", risk: "R1", activation: "entry" },
      ],
    });
    expect(registered.map((c) => c.id)).toEqual(["demo-plugin.good"]);
    error.mockRestore();
  });
});

describe("contributes.commands[].async（S6 声明提示）", () => {
  beforeEach(() => {
    registered.length = 0;
  });

  const ok = (extra: Record<string, unknown>) => ({ risk: "R0", activation: "entry", ...extra });

  it("manifest 声明 async:true ⇒ 命令元数据带 async:true（激活前即可见）", async () => {
    await parseContributions("demo-plugin", {
      commands: [{ id: "demo-plugin.slow", title: "Slow", ...ok({ async: true }) }],
    });
    expect(registered[0]!.async).toBe(true);
  });

  it("未声明 ⇒ 不带 async（默认同步，行为不变）", async () => {
    await parseContributions("demo-plugin", {
      commands: [{ id: "demo-plugin.fast", title: "Fast", ...ok({}) }],
    });
    expect(registered[0]!.async).toBeUndefined();
  });

  it("非 true 值（字符串/1）⇒ 按未声明处理（⛔ 宽松真值）", async () => {
    await parseContributions("demo-plugin", {
      commands: [
        { id: "demo-plugin.s1", title: "S1", ...ok({ async: "true" }) },
        { id: "demo-plugin.s2", title: "S2", ...ok({ async: 1 }) },
      ],
    });
    expect(registered.every((c) => c.async === undefined)).toBe(true);
  });
});
