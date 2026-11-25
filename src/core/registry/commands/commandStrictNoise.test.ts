/**
 * AI 发起的业务失败不弹用户 toast（strict + 带 code ⇒ silent）。
 * 背景：2026-11-25 外部 AI 负向测试时，用户右下角被“命令执行出错”刷屏。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const reportError = vi.fn();
vi.mock("../../services/bootstrap/ErrorService", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

import { registerCommand, executeCommandStrict, executeCommand, clearCommands } from "./CommandRegistry";

describe("AI 业务失败 → 静默上报（⛔ 用户 toast）", () => {
  beforeEach(() => {
    reportError.mockClear();
    clearCommands();
  });

  it("strict + 带 code ⇒ silent:true（仍 console 留诊断，账本照记）", async () => {
    registerCommand("demo-plugin", {
      id: "demo-plugin.coded",
      title: "参数错",
      handler: async () => {
        throw Object.assign(new Error("baudRate 必须是正整数"), { code: "EBADARGS" });
      },
    });
    await expect(executeCommandStrict("demo-plugin.coded")).rejects.toMatchObject({ code: "EBADARGS" });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][0]).toMatchObject({ silent: true });
  });

  it("strict + 无 code（真意外）⇒ 照常弹（不 silent）", async () => {
    registerCommand("demo-plugin", {
      id: "demo-plugin.bug",
      title: "意外",
      handler: async () => {
        throw new Error("boom");
      },
    });
    await expect(executeCommandStrict("demo-plugin.bug")).rejects.toThrow("boom");
    expect(reportError.mock.calls[0][0].silent).toBeUndefined();
  });

  it("UI 路径（strict=false）+ 带 code ⇒ 照常弹（用户自己点的要看见）", async () => {
    registerCommand("demo-plugin", {
      id: "demo-plugin.ui",
      title: "UI",
      handler: async () => {
        throw Object.assign(new Error("x"), { code: "EBADARGS" });
      },
    });
    await executeCommand("demo-plugin.ui");
    expect(reportError.mock.calls[0][0].silent).toBeUndefined();
  });
});
