/**
 * `AI#52`「壳侧宽进」的判据——**命令桥的具名实参展开**（2026-09-29 用户拍板，出处见
 * `docs/04-软件更新/待抉择池/AI友好化-全自动操作/AI-执行清单.md`）。
 *
 * ── 判据（照拍板原文）──
 *   ① **等价**：`executeCommandStrict(id, undefined, {a, b})` ≡ `executeCommandStrict(id, undefined, a, b)`
 *      ——handler 收到的位置实参逐位相同；
 *   ② **三条负控**（⛔ 一个都不许展开，展开 = 把合法调用改坏）：
 *      arity=1（`params` 只有一条）· 未声明 `params` · 键名全不匹配；
 *   ③ **只动桥那条缝**：UI 面 `executeCommand`（非 strict）保持纯位置语义——对象原样进 handler。
 *
 * ⚠️ 为什么②必须是负控而不是「顺手也展开」：`toggleViewVisibility({viewId})` 这类 arity=1 命令，
 *    「单个对象」就是它的**合法实参**；照具名展开会把它拆成位置实参 ⇒ 静默改坏一条今天好用的命令。
 */

import { describe, expect, it } from "vitest";

import { executeCommand, executeCommandStrict, expandNamedArgs, registerCommand } from "./CommandRegistry";

/** 两条声明（形状抄 `workbench.action.togglePanelViewVisibility`——AI#52 的实证原型） */
const PANEL_PARAMS = [
  { name: "containerId", type: "string" as const, required: true, description: "面板容器 id" },
  { name: "viewId", type: "string" as const, required: true, description: "视图 id" },
];

describe("expandNamedArgs（纯函数）", () => {
  it("正控：单个具名对象 ⇒ 按声明顺序摊成位置实参", () => {
    const r = expandNamedArgs(PANEL_PARAMS, [{ containerId: "c1", viewId: "v1" }]);
    expect(r.args).toEqual(["c1", "v1"]);
    expect(r.expanded).toEqual(["containerId", "viewId"]);
  });

  it("正控：对象键序不影响结果（按 params 声明顺序取）", () => {
    const r = expandNamedArgs(PANEL_PARAMS, [{ viewId: "v1", containerId: "c1" }]);
    expect(r.args).toEqual(["c1", "v1"]);
  });

  it("正控：尾部的可选参数没给 ⇒ 剪掉（等同不传）", () => {
    const params = [
      { name: "a", type: "string" as const, required: true },
      { name: "b", type: "string" as const, required: false },
    ];
    expect(expandNamedArgs(params, [{ a: "x" }]).args).toEqual(["x"]);
  });

  it("正控：只给后面那个 ⇒ 前面留 undefined（与位置调用同形）", () => {
    const r = expandNamedArgs(PANEL_PARAMS, [{ viewId: "v1" }]);
    expect(r.args).toEqual([undefined, "v1"]);
    expect(r.expanded).toEqual(["viewId"]);
  });

  it("负控①：arity=1（params 只有一条）⇒ 不展开", () => {
    const one = [{ name: "viewId", type: "string" as const, required: true }];
    const r = expandNamedArgs(one, [{ viewId: "v1" }]);
    expect(r.args).toEqual([{ viewId: "v1" }]);
    expect(r.expanded).toEqual([]);
  });

  it("负控②：未声明 params（undefined / 空表）⇒ 不展开", () => {
    expect(expandNamedArgs(undefined, [{ a: 1 }]).expanded).toEqual([]);
    expect(expandNamedArgs([], [{ a: 1 }]).expanded).toEqual([]);
    expect(expandNamedArgs(undefined, [{ a: 1 }]).args).toEqual([{ a: 1 }]);
  });

  it("负控③：键名全不匹配 ⇒ 不展开（那是调用方自己的载荷对象）", () => {
    const r = expandNamedArgs(PANEL_PARAMS, [{ folder: "C:/x", recursive: true }]);
    expect(r.args).toEqual([{ folder: "C:/x", recursive: true }]);
    expect(r.expanded).toEqual([]);
  });

  it("负控④：不是一个实参（0 个 / 2 个）⇒ 不展开", () => {
    expect(expandNamedArgs(PANEL_PARAMS, []).expanded).toEqual([]);
    expect(expandNamedArgs(PANEL_PARAMS, ["c1", "v1"]).args).toEqual(["c1", "v1"]);
    expect(expandNamedArgs(PANEL_PARAMS, []).args).toEqual([]);
  });

  it("负控⑤：单个实参是数组 / 字符串 / null ⇒ 不展开", () => {
    expect(expandNamedArgs(PANEL_PARAMS, [["c1", "v1"]]).expanded).toEqual([]);
    expect(expandNamedArgs(PANEL_PARAMS, ["c1"]).args).toEqual(["c1"]);
    expect(expandNamedArgs(PANEL_PARAMS, [null]).args).toEqual([null]);
  });
});

describe("命令桥那条缝（端到端）", () => {
  const seen: unknown[][] = [];
  const id = "test-ai52.togglePanelView";

  registerCommand("test-ai52", {
    id,
    title: "AI#52 探针",
    category: "测试",
    params: PANEL_PARAMS,
    handler: async (...args: unknown[]) => {
      seen.push(args);
      return args;
    },
  });

  it("具名调用 ≡ 位置调用（判据①）", async () => {
    seen.length = 0;
    await executeCommandStrict(id, undefined, { containerId: "c1", viewId: "v1" });
    await executeCommandStrict(id, undefined, "c1", "v1");
    expect(seen).toEqual([
      ["c1", "v1"],
      ["c1", "v1"],
    ]);
  });

  it("负控⑥：UI 面（非 strict）一个字不改——对象原样进 handler", async () => {
    seen.length = 0;
    await executeCommand(id, undefined, { containerId: "c1", viewId: "v1" });
    expect(seen).toEqual([[{ containerId: "c1", viewId: "v1" }]]);
  });
});
