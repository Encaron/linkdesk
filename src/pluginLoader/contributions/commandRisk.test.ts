/**
 * 声明面风险级（`contributes.commands[].risk`）单测——2026-11-24 · AI 权限档位。
 *
 * 钉三件：已知值原样进命令元数据；未知值**明确告警**且退回兜底（⛔ 不静默按 R1 装作没事）；
 * 未声明 = 不写该字段（壳兜底 R1）。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// 隔离注册表：只关心 parseContributions 往 registerCommand 送了什么
const registered: Array<Record<string, unknown>> = [];
vi.mock("../../core/registry/commands/CommandRegistry", () => ({
  registerCommand: (_pluginId: string, cmd: Record<string, unknown>) => {
    registered.push(cmd);
    return () => {};
  },
  // parseContributions 里其他分支可能用到（保持形状）
  getCommands: () => [],
}));

import { parseContributions } from "./contributions";

describe("contributes.commands[].risk", () => {
  beforeEach(() => {
    registered.length = 0;
  });

  it("已知值原样落到命令元数据", async () => {
    await parseContributions("demo-plugin", {
      commands: [
        { id: "demo-plugin.read", title: "Read", risk: "R0" },
        { id: "demo-plugin.write", title: "Write", risk: "R3" },
      ],
    });
    const byId = new Map(registered.map((c) => [c.id, c]));
    expect(byId.get("demo-plugin.read")?.risk).toBe("R0");
    expect(byId.get("demo-plugin.write")?.risk).toBe("R3");
  });

  it("未声明 ⇒ 不带 risk 字段（壳兜底 R1）", async () => {
    await parseContributions("demo-plugin", { commands: [{ id: "demo-plugin.plain", title: "Plain" }] });
    expect(registered[0]!.risk).toBeUndefined();
  });

  it("未知值 ⇒ 告警 + 退回兜底（不把脏值写进注册表）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await parseContributions("demo-plugin", { commands: [{ id: "demo-plugin.odd", title: "Odd", risk: "R9" }] });
    expect(registered[0]!.risk).toBeUndefined();
    expect(warn.mock.calls.some((c) => String(c[0]).includes("R9"))).toBe(true);
    warn.mockRestore();
  });
});

describe("contributes.commands[].async（S6 声明提示 · 2026-11-25 批准）", () => {
  beforeEach(() => {
    registered.length = 0;
  });

  it("manifest 声明 async:true ⇒ 命令元数据带 async:true（激活前即可见，首调不再同步阻塞）", async () => {
    await parseContributions("demo-plugin", {
      commands: [{ id: "demo-plugin.slow", title: "Slow", async: true }],
    });
    expect(registered[0]!.async).toBe(true);
  });

  it("未声明 ⇒ 不带 async（默认同步，行为不变）", async () => {
    await parseContributions("demo-plugin", { commands: [{ id: "demo-plugin.fast", title: "Fast" }] });
    expect(registered[0]!.async).toBeUndefined();
  });

  it("非 true 值（字符串/1）⇒ 按未声明处理（⛔ 宽松真值）", async () => {
    await parseContributions("demo-plugin", {
      commands: [
        { id: "demo-plugin.s1", title: "S1", async: "true" },
        { id: "demo-plugin.s2", title: "S2", async: 1 },
      ],
    });
    expect(registered.every((c) => c.async === undefined)).toBe(true);
  });
});
