/**
 * shellTabPriming 单测——恢复期补数的路由判据（哪些类型要 prime、哪些不要）。
 * prime 函数本身 mock 掉（真实现的取数走壳 IPC，jsdom 无）；这里只验证「恢复出的标签页类型 ⇒ 调哪个 prime」。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const primeAbout = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const primeAiManual = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../hooks/useAbout", () => ({ primeAbout }));
vi.mock("../hooks/useAiManual", () => ({ primeAiManual }));

import { primeRestoredShellDataTabs } from "./shellTabPriming";

describe("primeRestoredShellDataTabs", () => {
  beforeEach(() => {
    primeAbout.mockClear();
    primeAiManual.mockClear();
  });

  it("恢复出关于标签页 ⇒ 只 prime 关于", async () => {
    primeRestoredShellDataTabs([{ type: "editor" }, { type: "about" }]);
    // helper 是 fire-and-forget（动态 import 落在微任务里）——等它落地再断言
    await vi.waitFor(() => expect(primeAbout).toHaveBeenCalledTimes(1));
    expect(primeAiManual).not.toHaveBeenCalled();
  });

  it("恢复出 AI 手册标签页 ⇒ 只 prime 手册", async () => {
    primeRestoredShellDataTabs([{ type: "ai-manual" }]);
    await vi.waitFor(() => expect(primeAiManual).toHaveBeenCalledTimes(1));
    expect(primeAbout).not.toHaveBeenCalled();
  });

  it("两种都有 ⇒ 各 prime 一次（幂等由 prime 自身保证，这里不判重）", async () => {
    primeRestoredShellDataTabs([{ type: "about" }, { type: "ai-manual" }, { type: "welcome" }]);
    await vi.waitFor(() => expect(primeAbout).toHaveBeenCalledTimes(1));
    expect(primeAiManual).toHaveBeenCalledTimes(1);
  });

  it("没有壳数据标签页 ⇒ 一个都不调（普通插件标签 / 文件标签 / 发行说明都不在射程）", () => {
    primeRestoredShellDataTabs([
      { type: "editor" },
      { type: "serial-monitor" },
      { type: "release-notes" },
    ]);
    expect(primeAbout).not.toHaveBeenCalled();
    expect(primeAiManual).not.toHaveBeenCalled();
  });

  it("空表 / type 缺失 ⇒ 不调、不抛", () => {
    expect(() => primeRestoredShellDataTabs([])).not.toThrow();
    expect(() => primeRestoredShellDataTabs([{ id: "t1" } as { type?: string }])).not.toThrow();
    expect(primeAbout).not.toHaveBeenCalled();
    expect(primeAiManual).not.toHaveBeenCalled();
  });
});
