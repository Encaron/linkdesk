/**
 * E5#107：App 启动集成测试
 *
 * 验证 initAll() 正常路径 + 各步骤降级不崩溃。
 * 所有依赖 mock，不依赖 Electron / React / DOM。
 */

import { describe, it, expect, vi } from "vitest";
import { initAll, type InitDeps } from "./AppInitializer";

// ── 工具：构建成功的 mock deps ──

function mockDeps(overrides?: Partial<InitDeps>): InitDeps {
  return {
    initLayoutService: vi.fn().mockResolvedValue(undefined),
    initPluginStates: vi.fn().mockResolvedValue(undefined),
    initWorkspaceService: vi.fn().mockResolvedValue(undefined), // E5.5#0e
    initPluginLoader: vi.fn().mockResolvedValue(undefined),
    startPluginWatcher: vi.fn(),
    getLoadedPluginManifests: vi.fn().mockReturnValue([
      { pluginId: "editor", manifest: { name: "Editor", version: "1.0" } },
      { pluginId: "file-tree", manifest: { name: "File Tree", version: "1.0" } },
    ]),
    factorySlotsInitialize: vi.fn(),
    mountGlobalKeybindings: vi.fn().mockReturnValue(vi.fn()),
    initUserKeybindings: vi.fn().mockResolvedValue(undefined),
    // E5.7#98：泛型契约 <T>(key) => T | undefined 的 mock——实现 unknown 兜底 + 契约边界窄化（as any 删除）
    getConfigurationValue: vi.fn((key: string): unknown => {
      if (key === "app.theme") return "Dark";
      if (key === "app.language") return "zh";
      return undefined;
    }) as InitDeps["getConfigurationValue"],
    applyConfiguration: vi.fn(),
    getTabLayout: vi.fn().mockReturnValue({
      groups: [{ tabs: [{ id: "tab1", type: "editor" }] }],
    }),
    syncCountersAfterRestore: vi.fn(),
    ...overrides,
  };
}

// ── 测试 ──

describe("App 启动管线 initAll", () => {
  it("全链路正常启动 → 布局恢复 + 插件加载", async () => {
    const deps = mockDeps();
    const result = await initAll(deps);

    expect(result.success).toBe(true);
    expect(result.layoutRestored).toBe(true);
    expect(result.pluginsLoaded).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it("initServices 失败 → 记录错误 + 后续步骤继续", async () => {
    const deps = mockDeps({
      initLayoutService: vi.fn().mockRejectedValue(new Error("layout init failed")),
    });
    const result = await initAll(deps);

    // 错误被记录
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].step).toBe("initServices");

    // 后续步骤不受影响
    expect(result.pluginsLoaded).toBe(2);
    expect(result.layoutRestored).toBe(true);
    expect(result.success).toBe(false);
  });

  it("initPluginLoader 失败 → pluginsLoaded=0 + 后续继续", async () => {
    const deps = mockDeps({
      initPluginLoader: vi.fn().mockRejectedValue(new Error("no plugins found")),
    });
    const result = await initAll(deps);

    expect(result.pluginsLoaded).toBe(0);
    expect(result.errors.some((e) => e.step === "pluginLoader")).toBe(true);
    // 快捷键、配置、布局仍跑完
    expect(deps.mountGlobalKeybindings).toHaveBeenCalled();
    expect(deps.applyConfiguration).toHaveBeenCalled();
    expect(deps.getTabLayout).toHaveBeenCalled();
  });

  it("applyConfiguration 失败 → 配置降级但不崩溃", async () => {
    const deps = mockDeps({
      applyConfiguration: vi.fn().mockImplementation(() => {
        throw new Error("theme not found");
      }),
    });
    const result = await initAll(deps);

    expect(result.errors.some((e) => e.step === "applyConfig")).toBe(true);
    // 布局仍继续
    expect(deps.getTabLayout).toHaveBeenCalled();
  });

  it("getTabLayout 抛异常 → layoutRestored=false + syncCountersAfterRestore 不被调用", async () => {
    const deps = mockDeps({
      getTabLayout: vi.fn().mockImplementation(() => {
        throw new Error("corrupted layout");
      }),
    });
    const result = await initAll(deps);

    expect(result.layoutRestored).toBe(false);
    expect(result.errors.some((e) => e.step === "layoutRestore")).toBe(true);
    expect(deps.syncCountersAfterRestore).not.toHaveBeenCalled();
  });

  it("全部步骤失败 → 返回但不抛异常（降级不崩溃）", async () => {
    const deps = mockDeps({
      initLayoutService: vi.fn().mockRejectedValue(new Error("e1")),
      initPluginStates: vi.fn().mockRejectedValue(new Error("e2")),
      initPluginLoader: vi.fn().mockRejectedValue(new Error("e3")),
      startPluginWatcher: vi.fn().mockImplementation(() => { throw new Error("e4"); }),
      factorySlotsInitialize: vi.fn().mockImplementation(() => { throw new Error("e5"); }),
      mountGlobalKeybindings: vi.fn().mockImplementation(() => { throw new Error("e6"); }),
      initUserKeybindings: vi.fn().mockRejectedValue(new Error("e7")),
      applyConfiguration: vi.fn().mockImplementation(() => { throw new Error("e8"); }),
      getTabLayout: vi.fn().mockImplementation(() => { throw new Error("e10"); }),
    });

    // 不应抛异常
    const result = await initAll(deps);

    expect(result.success).toBe(false);
    expect(result.layoutRestored).toBe(false);
    expect(result.pluginsLoaded).toBe(0);
    // 每个步骤的错误都被记录
    expect(result.errors.length).toBeGreaterThanOrEqual(7);
  });

  it("keybindingCleanup 正确返回", async () => {
    const cleanupFn = vi.fn();
    const deps = mockDeps({
      mountGlobalKeybindings: vi.fn().mockReturnValue(cleanupFn),
    });
    const result = await initAll(deps);

    expect(result.keybindingCleanup).toBe(cleanupFn);
    // 验证 cleanup 函数可被调用
    result.keybindingCleanup?.();
    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });
});
