/**
 * tabCommands——M2 `AI#21` 的 `workbench.action.resetSplitSizes`（分屏比例复位的**非鼠标路径**）。
 *
 * 判据（`03-任务档案/M2-操作面.md` AI#21）：「每条动作另有非鼠标路径」——拖分隔线调比例这条
 * 鼠标独有的路，补一条命令出口。本格**只挂门牌**：命令只把既有能力（`reduceResetSplitSizes`
 * 纯 reducer，另有自己的用例集）经 `getCallbacks()` 暴露，⛔ 不改 `updateSplitSizes` 的既有行为。
 *
 * 这里钉两件事：
 * ① 命令真把回调调起来一次（description 的「把所有分屏分支恢复成均分」不是好看的字符串）；
 * ② 宿主未注册该回调时**静默 no-op 而不崩**——`resetSplitSizes` 是 `CoreCallbacks` 的**可选**成员
 *    （无 tab 管理器的宿主，如纯池测试宿主），这是「可选」二字的机器证据。
 *
 * fixture：全虚构 tabId，不引任何真实插件身份（硬约束 21）。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { clearRegistrationLayers } from "../../registry/registrationTracker";
import { executeCommand, clearCommands } from "../../registry/commands/CommandRegistry";
import { updateCoreCallbacks, type CoreCallbacks } from "../infra/CoreCallbacks";
import { registerTabCommands } from "./tabCommands";

const resetSplitSizes = vi.fn();

function registerWith(cb: Partial<CoreCallbacks>): void {
  clearRegistrationLayers();
  clearCommands();
  updateCoreCallbacks(cb as unknown as CoreCallbacks);
  registerTabCommands();
}

beforeEach(() => {
  resetSplitSizes.mockClear();
  registerWith({ resetSplitSizes });
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
