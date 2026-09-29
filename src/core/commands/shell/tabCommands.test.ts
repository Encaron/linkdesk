/**
 * tabCommands——`AI#21` 的 `workbench.action.resetSplitSizes`（分屏比例复位的**非鼠标路径**）
 * ＋ 生长格 `AI#53` 的 `workbench.action.setSplitSizes`（比例**精确设**）。
 *
 * 判据（`AI#21`）：「每条动作另有非鼠标路径」——拖分隔线调比例这条鼠标独有的路，补一条命令出口。
 * 那次**只挂门牌**：命令只把既有能力（`reduceResetSplitSizes` 纯 reducer）经 `getCallbacks()` 暴露，
 * ⛔ 不改 `updateSplitSizes` 的既有行为（`AI#53` 同守这条：老 reducer 降为 `.state` 皮）。
 *
 * 这里钉两件（reset）＋ 四件（set）：
 * ① 命令真把回调调起来一次（description 的「把所有分屏分支恢复成均分」不是好看的字符串）；
 * ② 宿主未注册该回调时**静默 no-op 而不崩**——`resetSplitSizes` 是 `CoreCallbacks` 的**可选**成员
 *    （无 tab 管理器的宿主，如纯池测试宿主），这是「可选」二字的机器证据；
 * ③ `setSplitSizes` 的回执**原样透出**（`AI#55` 三态是 AI 读到的答案，⛔ 命令层不吞不改）；
 * ④ 位置形与**具名对象形**等价（`AI#52` 的展开在 ≥2 params 的命令上生效）；
 * ⑤ 调用面失败自己有话（缺定位 / 坏 index）——⛔ 不像 `resetSplitSizes` 那样只能静默（它无回执）；
 * ⑥ `sizes` 形状**不预校验**：判定单点在 reducer（⛔ 不造第二份真相源）。
 *
 * fixture：全虚构 tabId，不引任何真实插件身份（硬约束 21）。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { clearRegistrationLayers } from "../../registry/registrationTracker";
import { executeCommand, executeCommandStrict, clearCommands } from "../../registry/commands/CommandRegistry";
import { updateCoreCallbacks, type CoreCallbacks } from "../infra/CoreCallbacks";
import { registerTabCommands } from "./tabCommands";

const resetSplitSizes = vi.fn();
const setSplitSizes = vi.fn();

function registerWith(cb: Partial<CoreCallbacks>): void {
  clearRegistrationLayers();
  clearCommands();
  updateCoreCallbacks(cb as unknown as CoreCallbacks);
  registerTabCommands();
}

beforeEach(() => {
  resetSplitSizes.mockClear();
  setSplitSizes.mockClear();
  setSplitSizes.mockReturnValue({ ok: true });
  registerWith({ resetSplitSizes, setSplitSizes });
});

describe("workbench.action.resetSplitSizes（M2 AI#21）", () => {
  it("执行 → 回调被调用一次（命令是回调的薄出口）", async () => {
    await executeCommand("workbench.action.resetSplitSizes");
    expect(resetSplitSizes).toHaveBeenCalledTimes(1);
  });

  it("载体传来的多余参数不穿透（命令无 params——比例复位不按 group 寻址）", async () => {
    await executeCommand("workbench.action.resetSplitSizes", undefined, "demo-group", 123);
    expect(resetSplitSizes).toHaveBeenCalledTimes(1);
    expect(resetSplitSizes).toHaveBeenCalledWith(); // 零实参——⛔ 不把 args 转发给回调
  });

  it("宿主未注册该回调（可选成员缺失）→ 静默 no-op，不抛", async () => {
    registerWith({}); // 无 resetSplitSizes
    await expect(executeCommand("workbench.action.resetSplitSizes")).resolves.toBeUndefined();
  });
});

describe("workbench.action.setSplitSizes（生长格 AI#53）", () => {
  it("位置形：anchorGroupId ＋ sizes ⇒ 回调按位收到，回执**原样**透出", async () => {
    const receipt = { ok: true, noop: true, reason: "not-split" };
    setSplitSizes.mockReturnValue(receipt);

    const ret = await executeCommand("workbench.action.setSplitSizes", undefined, "g2", [70, 30]);

    expect(setSplitSizes).toHaveBeenCalledWith("g2", [70, 30], undefined);
    expect(ret).toEqual(receipt); // ⛔ 不被吞成 undefined（AI 读到的就是它）
  });

  it("具名对象形（AI 的自然写法）：按 params 声明序展开 ⇒ 与位置形等价", async () => {
    await executeCommandStrict("workbench.action.setSplitSizes", undefined, { sizes: [70, 30], anchorGroupId: "g2" });

    expect(setSplitSizes).toHaveBeenCalledWith("g2", [70, 30], undefined);
  });

  it("branchIndex 单独给（鼠标那套形）：anchor 空串照样原样传下去", async () => {
    await executeCommand("workbench.action.setSplitSizes", undefined, "", [70, 30], 2);

    expect(setSplitSizes).toHaveBeenCalledWith("", [70, 30], 2);
  });

  it("缺定位（既无 anchor 也无 index）⇒ 调用面如实报 no-anchor-id，回调**不**被调", async () => {
    await expect(executeCommand("workbench.action.setSplitSizes", undefined, "", [70, 30]))
      .resolves.toEqual({ ok: false, noop: true, reason: "no-anchor-id" });
    expect(setSplitSizes).not.toHaveBeenCalled();
  });

  it("branchIndex 给了却不是数字 ⇒ bad-branch-index（⛔ 不说成「没给」）", async () => {
    await expect(executeCommand("workbench.action.setSplitSizes", undefined, "g2", [70, 30], "2"))
      .resolves.toEqual({ ok: false, noop: true, reason: "bad-branch-index" });
    expect(setSplitSizes).not.toHaveBeenCalled();
  });

  it("宿主未注册（可选成员缺失）⇒ ok:false ＋ reason:'no-callbacks'，不抛（⛔ 不静默）", async () => {
    registerWith({ resetSplitSizes }); // 无 setSplitSizes

    await expect(executeCommand("workbench.action.setSplitSizes", undefined, "g2", [70, 30]))
      .resolves.toEqual({ ok: false, noop: true, reason: "no-callbacks" });
  });

  it("`sizes` 形状**不预校验**：坏载荷也照原样交给回调（判定单点在 reducer，⛔ 不造第二份真相源）", async () => {
    await executeCommand("workbench.action.setSplitSizes", undefined, "g2", [70]);

    expect(setSplitSizes).toHaveBeenCalledWith("g2", [70], undefined);
  });
});
