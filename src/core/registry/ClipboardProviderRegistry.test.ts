/**
 * E5#27c：ClipboardProviderRegistry 单元测试。
 * register/resolve/覆盖检测/unregisterAll
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { clipboardProviders, type ClipboardProvider } from "./ClipboardProviderRegistry";

// E5.7#98：测试直捣私有内部——窄接口替代 as any（公共面不暴露 reset/unregisterAll）。
// 不与 typeof clipboardProviders 相交——私有 _providers 会让交集坍缩成 never
type InternalRegistry = {
  unregisterAll?: (pluginId: string) => void;
  _providers?: ClipboardProvider[];
};
// protected unregisterAll → public 测试访问——两步 cast 穿刺（E5.7#98 替代 as any）
const internal = clipboardProviders as unknown as InternalRegistry;

// 每个测试前清空注册表
beforeEach(() => {
  // RegistryBase 不支持 reset——直接操作内部
  internal.unregisterAll?.("p1");
  internal.unregisterAll?.("p2");
  // 暴力清空
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

  it("unregisterAll → resolve 返回 undefined", () => {
    clipboardProviders.register("p1", { when: "explorerFocus", onCopy: () => {} });
    internal.unregisterAll?.("p1");
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
