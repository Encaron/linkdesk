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
  riskOfPluginCommand,
  riskOfShellCommand,
  unregisteredOpRisk,
  UNREGISTERED_COMMAND_RISK,
  type Risk,
} from "../risk.js";

const RISKS: Risk[] = ["R0", "R1", "R2", "R3"];

/* 规格矩阵的**独立复述**（oracle）：测试故意不 import 实现里的 MATRIX，
 * 否则「实现即预言」——实现写错测试也照绿。与 decide.ts 的克隆命中按此豁免。 */
/* jscpd:ignore-start */
const EXPECTED: Record<PolicyMode, Record<Risk, string>> = {
  read: { R0: "allow", R1: "deny", R2: "deny", R3: "deny" },
  ask: { R0: "allow", R1: "ask", R2: "ask", R3: "ask" },
  auto: { R0: "allow", R1: "allow", R2: "allow", R3: "ask" },
  full: { R0: "allow", R1: "allow", R2: "allow", R3: "allow" },
};
/* jscpd:ignore-end */

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

describe("未登记兜底与风险来源分层（S7：壳表只管壳命令，插件只认声明）", () => {
  it("未登记命令 ⇒ R2 保守兜底（⛔ 不是 R0/R1；source=fallback）", () => {
    expect(UNREGISTERED_COMMAND_RISK).toBe("R2");
    expect(riskOfShellCommand("demo.unknown-command")).toEqual({ risk: "R2", source: "fallback" });
    expect(riskOfPluginCommand(undefined)).toEqual({ risk: "R2", source: "fallback" });
  });

  it("未登记 op ⇒ 写按 R2、读按 R1", () => {
    expect(riskOfOp("demoWrite", "write")).toBe("R2");
    expect(riskOfOp("demoRead", "read")).toBe("R1");
    expect(unregisteredOpRisk("write")).toBe("R2");
    expect(unregisteredOpRisk("read")).toBe("R1");
  });

  it("壳命令：壳表唯一，声明压不过壳表（source=shell）", () => {
    expect(riskOfShellCommand("update.openUpdateFlow")).toEqual({ risk: "R3", source: "shell" });
    expect(riskOfCommand("update.openUpdateFlow", true, "R0")).toEqual({ risk: "R3", source: "shell" });
  });

  it("插件命令：只认声明，壳表 ⛔ 覆盖（撞 id 以声明为准）", () => {
    // 同 id 壳表有 R3，但插件归属仍按声明走——壳表不覆盖插件命令
    expect(riskOfCommand("update.openUpdateFlow", false, "R1")).toEqual({ risk: "R1", source: "declared" });
    expect(riskOfCommand("demo.declared", false, "R2")).toEqual({ risk: "R2", source: "declared" });
    expect(riskOfCommand("demo.undeclared", false)).toEqual({ risk: "R2", source: "fallback" });
  });

  it("S7 兜底语义：未声明插件命令在 ask 档被问；auto 档按已落地矩阵 = allow（要 auto 档被问须声明 R3）", () => {
    const { risk } = riskOfCommand("demo.undeclared", false);
    expect(decide("ask", risk)).toBe("ask");
    expect(decide("auto", risk)).toBe("allow");
  });
});
