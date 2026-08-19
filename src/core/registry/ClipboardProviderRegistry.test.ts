/**
 * E5#27c：ClipboardProviderRegistry 单元测试。
 * register/resolve/覆盖检测/dispose（E5.8#10：per-entry track——unregisterAll 已摘除）。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { clearRegistrationLayers } from "./registrationTracker";
import { clipboardProviders, type ClipboardProvider } from "./ClipboardProviderRegistry";

// E5.7#98：测试直捣私有内部——窄接口替代 as any（公共面不暴露 reset/_providers）。
// 不与 typeof clipboardProviders 相交——私有 _providers 会让交集坍缩成 never
type InternalRegistry = {
  _providers?: ClipboardProvider[];
};
const internal = clipboardProviders as unknown as InternalRegistry;

// 每个测试前清空注册表 + 追踪器层
beforeEach(() => {
  clearRegistrationLayers();
  const arr = internal._providers;
  if (arr) arr.length = 0;
});

describe("ClipboardProviderRegistry", () => {
  it("register → resolve 返回正确 provider", () => {
    const onCopy = () => {};
    clipboardProviders.register("p1", { when: "explorerFocus", onCopy });
    const p = clipboardProviders.resolve("explorerFocus");
    expect(p).toBeDefined();
    expect(p!.pluginId).toBe("p1");
    expect(p!.onCopy).toBe(onCopy);
  });

  it("resolve 无匹配返回 undefined", () => {
    const p = clipboardProviders.resolve("nonexistent");
    expect(p).toBeUndefined();
  });

  it("同 when → console.warn + 覆盖为新 provider", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    clipboardProviders.register("p1", { when: "explorerFocus", onCopy: () => {} });
    clipboardProviders.register("p2", { when: "explorerFocus", onCut: () => {} });
    const p = clipboardProviders.resolve("explorerFocus");
    expect(p!.pluginId).toBe("p2");
    expect(p!.onCut).toBeDefined();
    expect(p!.onCopy).toBeUndefined(); // p2 未声明 onCopy
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("被覆盖"));
    warn.mockRestore();
  });

  it("register 返 disposer → dispose 后 resolve 返回 undefined（E5.8#10）", () => {
    const dispose = clipboardProviders.register("p1", { when: "explorerFocus", onCopy: () => {} });
    dispose();
    expect(clipboardProviders.resolve("explorerFocus")).toBeUndefined();
  });

  it("不同 when 互不干扰", () => {
    clipboardProviders.register("p1", { when: "explorerFocus", onCopy: () => {} });
    clipboardProviders.register("p2", { when: "editorFocus", onPaste: () => {} });
    expect(clipboardProviders.resolve("explorerFocus")!.pluginId).toBe("p1");
    expect(clipboardProviders.resolve("editorFocus")!.pluginId).toBe("p2");
  });

  it("getAll 返回所有注册 provider（只读）", () => {
    clipboardProviders.register("p1", { when: "explorerFocus" });
    clipboardProviders.register("p2", { when: "editorFocus" });
    const all = clipboardProviders.getAll();
    expect(all.length).toBe(2);
  });
});
