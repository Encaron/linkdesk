/**
 * E6#162（2026-09-30）：池侧 on-command 激活的**存在性闸**——属主不在盘上 ⇒ 不 import、不出声。
 *
 * 现场依据：`protocol-debug.log`（2026-08-27→09-30，211,603 行 / 22.79 MB）里
 * `[PluginComponent] 动态加载插件 "X" 失败` 一族占 25.6%（33,550 行 / 5.84 MB），
 * 其中 `app`（壳自己的命令——现场打点最多的 `workbench.action.showOutput`，已随本轮退场留档）、
 * `workbench`（`workbench.action.*` 的第一段
 * 名字推定）、`ai-bridge`（设置页 3 s 轮询状态命令）、`update`（已退役宿主身份）**都不是可加载插件**。
 * 本测试钉住闸的三条语义：不在盘上 ⇒ false ＋ 不碰 loader；在盘上 ⇒ 照走 #62e 原语义；
 * 非法 id / IPC 失败 ⇒ false 且不抛。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loaderSpy = vi.fn();

vi.mock("./PluginComponent", () => ({
  resolvePluginViewLoader: (pluginId: string, renderPath?: string) => {
    loaderSpy(pluginId, renderPath);
    return async () => ({ default: () => null });
  },
}));

import { activatePluginEntryForCommands } from "./entryActivation";

function stubResolveEntry(impl: unknown): void {
  Object.defineProperty(window, "linkdesk", {
    value: { plugins: { resolveEntry: impl } },
    configurable: true,
    writable: true,
  });
}

describe("activatePluginEntryForCommands 存在性闸（E6#162）", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    loaderSpy.mockClear();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
    // 清掉本文件注入的 window.linkdesk——不给同进程其他测试留全局状态
    delete (window as unknown as Record<string, unknown>).linkdesk;
  });

  it("属主不在盘上（root:null）⇒ false，且**不碰** loader（不拼那条必然 404 的 URL）、不出声", async () => {
    stubResolveEntry(async () => ({ root: null, entry: null, bundle: false }));
    await expect(activatePluginEntryForCommands("app")).resolves.toBe(false);
    await expect(activatePluginEntryForCommands("workbench")).resolves.toBe(false);
    await expect(activatePluginEntryForCommands("ai-bridge")).resolves.toBe(false);
    expect(loaderSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("属主在盘上 ⇒ 照走 #62e 原语义（import 属主入口一次，返回 true）", async () => {
    stubResolveEntry(async () => ({ root: "E:/x/plugins/serial-monitor", entry: "index.bundle.js", bundle: true }));
    await expect(activatePluginEntryForCommands("serial-monitor")).resolves.toBe(true);
    expect(loaderSpy).toHaveBeenCalledWith("serial-monitor", undefined);
  });

  it("非法 id（对象当 pluginId——#37f 族）⇒ resolveEntry 抛 ⇒ false，不向外抛、不出声", async () => {
    stubResolveEntry(async () => {
      throw new TypeError("ERR_INVALID_ARG_TYPE: Received an instance of Object");
    });
    await expect(activatePluginEntryForCommands({ evil: true } as unknown as string)).resolves.toBe(false);
    expect(loaderSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("老壳无 resolveEntry（API 缺失）⇒ 不设闸，保持 #62e 兼容档", async () => {
    Object.defineProperty(window, "linkdesk", {
      value: { plugins: { resolvePath: async () => "E:/x/plugins/demo" } },
      configurable: true,
      writable: true,
    });
    await expect(activatePluginEntryForCommands("demo")).resolves.toBe(true);
    expect(loaderSpy).toHaveBeenCalledWith("demo", undefined);
  });
});
