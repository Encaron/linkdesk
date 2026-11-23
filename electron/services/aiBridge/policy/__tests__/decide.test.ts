/**
 * 判定矩阵单测——4×4=16 格 ＋ 非法档位 ＋ 未登记兜底（`01-设计/01` §四）。
 *
 * 纯函数直打：不读配置、不起窗口、不碰 IPC。
 */

import { describe, it, expect } from "vitest";
import { decide } from "../decide.js";
import { POLICY_MODES, type PolicyMode } from "../modes.js";
import {
  riskOfCommand,
  riskOfOp,
  unregisteredOpRisk,
  UNREGISTERED_COMMAND_RISK,
  type Risk,
} from "../risk.js";

const RISKS: Risk[] = ["R0", "R1", "R2", "R3"];

const EXPECTED: Record<PolicyMode, Record<Risk, string>> = {
  read: { R0: "allow", R1: "deny", R2: "deny", R3: "deny" },
  ask: { R0: "allow", R1: "ask", R2: "ask", R3: "ask" },
  auto: { R0: "allow", R1: "allow", R2: "allow", R3: "ask" },
  full: { R0: "allow", R1: "allow", R2: "allow", R3: "allow" },
};

describe("decide：4×4 判定矩阵（16 格）", () => {
  it("四档 × 四级与规格矩阵逐格一致", () => {
    expect(POLICY_MODES).toEqual(["read", "ask", "auto", "full"]);
    expect(RISKS).toEqual(["R0", "R1", "R2", "R3"]);
    for (const mode of POLICY_MODES) {
      for (const risk of RISKS) {
        expect(decide(mode, risk), `${mode} + ${risk}`).toBe(EXPECTED[mode][risk]);
      }
    }
  });

  it("🔴 不变式：`read` 档只有 R0 放行（其余全拒，绝不弹框）", () => {
    expect(decide("read", "R0")).toBe("allow");
    expect([decide("read", "R1"), decide("read", "R2"), decide("read", "R3")]).toEqual(["deny", "deny", "deny"]);
  });

  it("🔴 不变式：`auto`（默认）对 R3 仍问（装更新/删数据不静默）", () => {
    expect(decide("auto", "R3")).toBe("ask");
  });

  it("🔴 不变式：`full` 对 R3 放行（用户已明确全权）", () => {
    expect(decide("full", "R3")).toBe("allow");
  });

  it("非法档位（运行期脏值）⇒ 按 fail-closed 处理（不是 allow）", () => {
    expect(decide("nonsense", "R0")).toBe("allow"); // R0 只读，任何档都放行
    expect(decide("nonsense", "R1")).toBe("ask");
    expect(decide("nonsense", "R3")).toBe("ask");
    expect(decide("", "R2")).toBe("ask");
  });
});

describe("未登记兜底（保守规则：不知道 ≠ 无害）", () => {
  it("未登记命令 ⇒ R1（不是 R0）", () => {
    expect(riskOfCommand("demo.unknown-command")).toBe(UNREGISTERED_COMMAND_RISK);
    expect(UNREGISTERED_COMMAND_RISK).toBe("R1");
  });

  it("未登记 op ⇒ 写按 R2、读按 R1", () => {
    expect(riskOfOp("demoWrite", "write")).toBe("R2");
    expect(riskOfOp("demoRead", "read")).toBe("R1");
    expect(unregisteredOpRisk("write")).toBe("R2");
    expect(unregisteredOpRisk("read")).toBe("R1");
  });

  it("登记项优先于作者声明，作者声明优先于兜底", () => {
    expect(riskOfCommand("update.openUpdateFlow", "R0")).toBe("R3"); // 壳表说了算
    expect(riskOfCommand("demo.declared", "R2")).toBe("R2"); // 作者声明
    expect(riskOfCommand("demo.undeclared")).toBe("R1"); // 兜底
  });
});
