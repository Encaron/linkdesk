/**
 * 宿主命令元数据完整性——M1 `AI#8`（AI 友好化系列 · 会话 2）。
 *
 * 判据正典（`03-任务档案/M1-读取面.md` `AI#8`）：「命令索引里**零「只有名字没有说明」**的宿主命令」。
 * 本条把这个判据从**一次性人工 grep** 变成**可复跑的机械证据**（会话 2 的元数据清扫涉及 63 条命令、
 * 11 个文件——没有测试的话，下一个人新增一条命令忘写 description，没有任何东西会叫醒）。
 *
 * 三件事：
 * ① **完整性**：`ensureCoreCommands()` 注册出的每条宿主命令都有非空 `description`；
 * ② **形状**：`params` 逐条合法（`name` 非空 / `type` 四值收敛 / `required` 是布尔）——
 *    字段形状是 AI 与自动化拼调用的依据，写歪了比不写更坏；
 * ③ **说明是真话**：抽样**照 `params` 里写的调用形状真调一次**（不看 handler 源码），
 *    断言壳回调收到参数——证明 description 不是好看的字符串。
 *
 * fixture 卫生（硬约束 21）：id 全虚构（`demo-tab` / `demo-group`），不引任何真实插件身份。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import { ensureCoreCommands } from "./coreCommands";
import { executeCommand, getCommands, resolveCommandOwnership } from "../../registry/commands/CommandRegistry";
import { updateCoreCallbacks, type CoreCallbacks } from "../infra/CoreCallbacks";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";

/** `LinkDeskCommandParam.type` 的四值收敛——契约（`linkdesk-api/types.ts`）与 schema 同款 */
const PARAM_TYPES = ["string", "number", "boolean", "object"];

/** 宿主命令 = 归属为壳（APP_PLUGIN_ID）的那些——插件命令不在本测试射程（作者面自负） */
function hostCommands() {
  return getCommands().filter((c) => resolveCommandOwnership(c.id).pluginId === APP_PLUGIN_ID);
}

const closeTab = vi.fn();
const closeAllTabs = vi.fn();
const focusNthTab = vi.fn();

beforeEach(() => {
  ensureCoreCommands();
  closeTab.mockClear();
  closeAllTabs.mockClear();
  focusNthTab.mockClear();
  // 只喂本测试用到的三个回调——其余字段不是本文件断言对象（壳命令 handler 经 getCallbacks()?. 取用）
  updateCoreCallbacks({ closeTab, closeAllTabs, focusNthTab } as unknown as CoreCallbacks);
});

describe("宿主命令元数据（M1 AI#8）", () => {
  it("① 每条宿主命令都有非空 description（零「只有名字没有说明」）", () => {
    const all = hostCommands();
    // 命令条数是「清扫覆盖面」的兜底断言——元数据清扫漏掉整个文件时，缺说明的清单会「恰好为空」
    expect(all.length).toBeGreaterThan(50);
    expect(all.filter((c) => !c.description?.trim()).map((c) => c.id)).toEqual([]);
  });

  it("① 带参数的命令必须声明 params（只有名字没有参数的命令 = AI 只能猜）", () => {
    // 反控样本：这些命令的 handler 会读 args[0]——没有 params 就是「说明缺一半」
    for (const id of ["core.closeTab", "core.closeAllTabs", "workbench.action.focusNthTab"]) {
      expect(hostCommands().find((c) => c.id === id)?.params?.length).toBeGreaterThan(0);
    }
  });

  it("② params 形状合法（name / type 四值 / required 布尔）", () => {
    const bad: string[] = [];
    for (const cmd of hostCommands()) {
      for (const p of cmd.params ?? []) {
        if (!p.name?.trim()) bad.push(`${cmd.id}: name 空`);
        if (!PARAM_TYPES.includes(p.type)) bad.push(`${cmd.id}: type="${p.type}" 不在四值内`);
        if (p.required !== undefined && typeof p.required !== "boolean") bad.push(`${cmd.id}: required 非布尔`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("③ 照 params 说明盲调能调通——对象载荷（{ tabId } / { groupId }）", async () => {
    // 调用形状完全照 params.description 里写的那一行（不看 handler 源码）
    await executeCommand("core.closeTab", undefined, { tabId: "demo-tab" });
    expect(closeTab).toHaveBeenCalledWith("demo-tab");

    await executeCommand("core.closeAllTabs", undefined, { groupId: "demo-group" });
    expect(closeAllTabs).toHaveBeenCalledWith("demo-group");

    await executeCommand("workbench.action.focusNthTab", undefined, { n: 3 });
    expect(focusNthTab).toHaveBeenCalledWith(3);
  });

  it("③ 说明与行为一致的反控：照说明传错形状 ⇒ 不生效（证明断言真在测参数，不是恒真）", async () => {
    // 裸字符串不是 params 说明的形状（说明要求 { tabId }）——静默无效正是要防的那种「假说明」
    await executeCommand("core.closeTab", undefined, "demo-tab");
    expect(closeTab).not.toHaveBeenCalled();
  });
});
