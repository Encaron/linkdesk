/**
 * E6#111b 单测——命令归属（归遵从身份来，不从名字来）。
 *
 * 覆盖 1.31 判据③④⑤ 与 02 档 §四 负控 N4 / N5 / N6 ＋ 02 档 §1.2 的两条硬注意：
 *  - ① 声明面查表（loader 用真身份注册）压过 ③ 名字推定 —— 借他人前缀的命令归属正确；
 *  - ② 注册方显式申报（meta.pluginId）——未声明命令也能有真属主；
 *  - ③ 名字推定只在①②都拿不到时兜底；
 *  - N4 两个**不同真身份**注册同一 id ⇒ 不覆盖 ＋ console.error 点名双方 ＋ 不抛错；
 *  - N5 **同一真身份**重注册 ⇒ 不出声 ＋ 必须生效（防改坏既有重注册设计）；
 *  - N6 `beta` 申报 `alpha.borrowed` ⇒ 卸载 `alpha` 后 `alpha.borrowed` 仍在（按真属主摘，不按前缀）；
 *  - 乱序到达 ⇒ 声明后到时**重挂归属**（02 档 §1.2-1，与「同插件重注册」是两条不同触发路径）。
 *
 * 命令 id 恒虚构（硬约束 21：`alpha.*` / `beta.*` / `demo.*` 均为虚构插件名）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { clearRegistrationLayers } from "../registrationTracker";
import {
  registerCommand, getCommand, executeCommand, getPluginCommands, clearCommands,
  registerPoolCommandMetadata, unregisterPoolCommands, resolveCommandOwnership,
} from "./CommandRegistry";

const ALPHA = "alpha";
const BETA = "beta";

/** 池侧运行时注册的最小载荷（placeholder 条目：命令面板可见，执行走转发桥） */
function poolRegister(id: string, pluginId?: string) {
  return registerPoolCommandMetadata(id, pluginId ? { title: id, pluginId } : { title: id }, "main");
}

describe("命令归属（E6#111b）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("① 声明面查表压过名字推定：借他人前缀的命令归属仍取声明面", () => {
    // loader 声明面：真身份 alpha 声明了名字里带 beta 前缀的命令（= file-tree 声明 editor.selectForCompare 的同形）
    registerCommand(ALPHA, { id: "beta.borrowed", title: "借名命令", handler: async () => "alpha" });
    // 池侧运行时注册同一 id 且**不申报**——归属必须仍是声明面的 alpha，不是名字里的 beta
    const owner = poolRegister("beta.borrowed");

    expect(owner.pluginId).toBe(ALPHA);
    expect(owner.source).toBe("declared");
    expect(resolveCommandOwnership("beta.borrowed")).toEqual({ pluginId: ALPHA, source: "declared" });
  });

  it("② 注册方显式申报：未声明命令也有真属主（meta.pluginId 优先于名字推定）", () => {
    const owner = poolRegister("alpha.borrowed", BETA);

    expect(owner).toEqual({ pluginId: BETA, source: "reported" });
    expect(getPluginCommands(BETA)).toContain("alpha.borrowed");
    expect(getPluginCommands(ALPHA)).not.toContain("alpha.borrowed");
  });

  it("③ 名字推定只在①②都拿不到时兜底（老第三方零申报的兼容档）", () => {
    const owner = poolRegister("legacy.old");

    expect(owner).toEqual({ pluginId: "legacy", source: "inferred" });
    expect(resolveCommandOwnership("legacy.old")).toEqual({ pluginId: "legacy", source: "inferred" });
  });

  it("N4 异归属注册同一 id ⇒ 不覆盖 + console.error 点名双方 + 不抛错", async () => {
    const first = vi.fn(async () => "第一位");
    registerCommand(ALPHA, { id: "demo.cmd", title: "首位", handler: first });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    // 第二个**不同真身份**注册同一 id——不许抛错（抛错 = 整只插件装不上）
    expect(() => {
      registerCommand(BETA, { id: "demo.cmd", title: "篡位", handler: async () => "第二位" });
    }).not.toThrow();

    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0][0])).toContain("demo.cmd");
    expect(String(err.mock.calls[0][0])).toContain(ALPHA); // 原属主点名
    expect(String(err.mock.calls[0][0])).toContain(BETA);  // 新注册者点名
    expect(getCommand("demo.cmd")!.title).toBe("首位");      // 未覆盖（title 也没动）
    await expect(executeCommand("demo.cmd")).resolves.toBe("第一位"); // 原 handler 保留
  });

  it("N4（池侧路径）异归属自报 ⇒ 显示面不更新 + 出声", () => {
    registerCommand(ALPHA, { id: "demo.pool", title: "原题", handler: async () => {} });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    registerPoolCommandMetadata("demo.pool", { title: "改题", pluginId: BETA }, "main");

    expect(err).toHaveBeenCalledTimes(1);
    expect(getCommand("demo.pool")!.title).toBe("原题");
  });

  it("N5 同一真身份重注册 ⇒ 不出声 + 必须生效（既有重注册语义未破）", async () => {
    registerCommand(ALPHA, { id: "demo.same", title: "旧题", handler: async () => "旧" });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    registerCommand(ALPHA, { id: "demo.same", title: "新题", handler: async () => "新" });

    expect(err).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(getCommand("demo.same")!.title).toBe("新题"); // title 更新生效
    await expect(executeCommand("demo.same")).resolves.toBe("新"); // handler 覆盖生效
  });

  it("N6 借前缀命令按真属主摘 ⇒ 卸载 alpha 不动 beta 申报的 alpha.borrowed", () => {
    poolRegister("alpha.own");            // alpha 自己的运行时命令（推定档 = alpha）
    poolRegister("alpha.borrowed", BETA); // beta 申报的借前缀命令

    unregisterPoolCommands(ALPHA);

    expect(getCommand("alpha.own")).toBeUndefined();
    expect(getCommand("alpha.borrowed")).toBeDefined(); // 🔴 H2：旧实现按前缀整片删会连它一起删
    expect(resolveCommandOwnership("alpha.borrowed").pluginId).toBe(BETA);
  });

  it("乱序到达 ⇒ 声明后到时重挂归属（推定 → 声明面）", () => {
    // 池侧先到：命令尚无人声明 ⇒ 归属落推定档（名字第一段）
    poolRegister("alpha.late");
    expect(resolveCommandOwnership("alpha.late")).toEqual({ pluginId: ALPHA, source: "inferred" });

    // 声明后到：真身份 beta（= file-tree 声明 editor.* 的同形）⇒ 重挂归属，且不出声（是纠正不是冲突）
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    registerCommand(BETA, { id: "alpha.late", title: "迟到", handler: async () => {} });

    expect(err).not.toHaveBeenCalled();
    expect(resolveCommandOwnership("alpha.late")).toEqual({ pluginId: BETA, source: "declared" });
    expect(getPluginCommands(BETA)).toContain("alpha.late");
    expect(getPluginCommands(ALPHA)).not.toContain("alpha.late");
  });

  it("清表（测试夹具）连同归属两册一起清——不留跨用例残影", () => {
    registerCommand(ALPHA, { id: "demo.reset", title: "题", handler: async () => {} });
    clearCommands();

    expect(resolveCommandOwnership("demo.reset")).toEqual({ pluginId: "demo", source: "inferred" });
    expect(getPluginCommands(ALPHA)).toEqual([]);
  });
});
