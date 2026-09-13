/**
 * pool-addressing 单测——E6#47b-1 双向寻址归一（windowId 双重身份，见模块头）。
 * 表格式覆盖两个方向 × 三种 sender（主壳 / ws-N 壳 / 非壳）+ 缺省参数。
 * 纯函数零 mock；fixture 全虚构（硬约束 21）。
 */
import { describe, it, expect } from "vitest";
import { poolKeyFromShell, shellVisiblePoolId } from "./pool-addressing";

describe("poolKeyFromShell —— 壳→池（壳内视角 → 注册表 key）", () => {
  const cases: Array<{ name: string; wsId: string | null; payload?: string; expected: string }> = [
    { name: "主壳 + 缺省 → main（旧行为不变）", wsId: null, expected: "main" },
    { name: "主壳 + 显式 id → 原样", wsId: null, payload: "det-1", expected: "det-1" },
    { name: "ws-2 壳 + 缺省 → 它自己的池 ws-2", wsId: "ws-2", expected: "ws-2" },
    { name: "ws-2 壳 + 'main' → 它自己的池 ws-2（壳内 main = 自身）", wsId: "ws-2", payload: "main", expected: "ws-2" },
    { name: "ws-2 壳 + 自己 id → ws-2（幂等）", wsId: "ws-2", payload: "ws-2", expected: "ws-2" },
    { name: "ws-2 壳 + 他窗 id（脱出窗）→ 原样放行", wsId: "ws-2", payload: "det-9", expected: "det-9" },
  ];
  for (const c of cases) {
    it(c.name, () => {
      expect(poolKeyFromShell(c.wsId, c.payload)).toBe(c.expected);
    });
  }
});

describe("shellVisiblePoolId —— 池→壳（注册表 key → 壳内视角）", () => {
  it("ws-N 池 → 它的壳里叫 'main'", () => {
    expect(shellVisiblePoolId("ws-2", "ws-2")).toBe("main");
  });
  it("主池 main → 原样 'main'", () => {
    expect(shellVisiblePoolId("main", "main")).toBe("main");
  });
  it("脱出池 det-1 → 原样（脱出窗 tab 归主壳，注册表 id 就是它）", () => {
    expect(shellVisiblePoolId("det-1", "det-1")).toBe("det-1");
  });
});
