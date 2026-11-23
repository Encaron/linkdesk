/**
 * 风险登记表单测——**唯一真相源**的三条守则（`01-设计/01` §三）。
 *
 *   ① `OPS` 全覆盖：白名单里每个 op 都在 `OP_RISK` 有登记（漏登记 = 新 op 静默按兜底走）；
 *   ② R3 必带 what/why（确认框正文靠它，⛔ 不是裸 id）；
 *   ③ `describe.askFirst` **派生**自本表（⛔ 不手抄第二份）。
 */

import { describe, it, expect } from "vitest";
import { OPS } from "../../whitelist.js";
import { COMMAND_RISK, OP_RISK, askFirstCatalog, askTextForCommand, askTextForOp } from "../risk.js";
import { POLICY_MODES } from "../modes.js";

const RISKS = ["R0", "R1", "R2", "R3"];

describe("风险登记表：OPS 全覆盖", () => {
  it("每个 op 都有登记（新 op 必须同笔登记，⛔ 不许靠兜底静默放行）", () => {
    const missing = Object.keys(OPS).filter((op) => !(op in OP_RISK));
    expect(missing).toEqual([]);
  });

  it("登记表里没有已不存在的 op（死条目 = 风险判断过期）", () => {
    const ghost = Object.keys(OP_RISK).filter((op) => !(op in OPS));
    expect(ghost).toEqual([]);
  });

  it("每个登记的风险值都是合法级（没有手写错的值）", () => {
    for (const entry of [...Object.values(OP_RISK), ...Object.values(COMMAND_RISK)]) {
      expect(RISKS).toContain(entry.risk);
    }
  });
});

describe("风险登记表：R3 必须写清 what/why", () => {
  it("op 侧 R3 逐条有 what/why（确认框正文靠它）", () => {
    for (const [op, entry] of Object.entries(OP_RISK)) {
      if (entry.risk !== "R3") continue;
      expect(entry.what, `${op} 缺 what`).toBeTruthy();
      expect(entry.why, `${op} 缺 why`).toBeTruthy();
    }
  });

  it("命令侧 R3 逐条有 what/why", () => {
    for (const [id, entry] of Object.entries(COMMAND_RISK)) {
      if (entry.risk !== "R3") continue;
      expect(entry.what, `${id} 缺 what`).toBeTruthy();
      expect(entry.why, `${id} 缺 why`).toBeTruthy();
    }
  });

  it("D9：install 落在 R3（自主档仍问；⛔ 不许静默安装陌生代码）", () => {
    expect(OP_RISK.install?.risk).toBe("R3");
    expect(askTextForOp("install").why).toContain("陌生代码");
  });
});

describe("describe.askFirst：从风险表派生（⛔ 不手抄）", () => {
  it("ops/commands 与 R3 登记逐条一致", () => {
    const catalog = askFirstCatalog();
    const r3Ops = Object.entries(OP_RISK).filter(([, e]) => e.risk === "R3").map(([id]) => id);
    const r3Commands = Object.entries(COMMAND_RISK).filter(([, e]) => e.risk === "R3").map(([id]) => id);
    expect(catalog.ops.map((r) => r.id)).toEqual(r3Ops);
    expect(catalog.commands.map((r) => r.id)).toEqual(r3Commands);
    expect(catalog.note.length).toBeGreaterThan(0);
  });

  it("既有两条敏感动作仍在自述面里（装插件 / 装更新）", () => {
    const ids = [...askFirstCatalog().ops, ...askFirstCatalog().commands].map((r) => r.id);
    expect(ids).toContain("install");
    expect(ids).toContain("update.openUpdateFlow");
  });

  it("确认文案取自已登记项；未登记 = 空（调用点退回 id，⛔ 不编话术）", () => {
    expect(askTextForCommand("update.openUpdateFlow").why).toContain("不可回退");
    expect(askTextForOp("requestElevation").why).toContain("点头");
    expect(askTextForCommand("demo.unregistered")).toEqual({ what: undefined, why: undefined });
  });
});

describe("档位字符串不出圈（modes.ts 是唯一常量源）", () => {
  it("POLICY_MODES 与矩阵/登记表用的档位集合一致", () => {
    expect(POLICY_MODES).toEqual(["read", "ask", "auto", "full"]);
  });
});
