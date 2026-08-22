/**
 * createTabActionHandler——壳侧池→壳 tab 动作分发（E5.8#44-B 补测）。
 * 测试夹具全用虚构值（硬约束 21：demo-* / tab-*，不指真实插件/文案）。
 * 覆盖：releaseOutsideWindow 新分支（sourceWindowId 透传）+ 常规分支回归（focusTab 直通）。
 */
import { describe, it, expect, vi } from "vitest";
import { createTabActionHandler, type TabActionHandlerDeps } from "./tabCallbacks";
import type { ShellTabAction } from "../core/types/ipc/tabActions";

function makeDeps(): TabActionHandlerDeps & { releaseOutside: ReturnType<typeof vi.fn> } {
  const releaseOutside = vi.fn();
  return {
    handleFocusTab: vi.fn(),
    focusGroup: vi.fn(),
    closeTab: vi.fn(),
    groups: [],
    reorderTab: vi.fn(),
    moveTab: vi.fn(),
    splitTabAt: vi.fn(),
    duplicateTab: vi.fn(),
    pinTab: vi.fn(),
    createTab: vi.fn(() => "tab-new"),
    updateSplitSizes: vi.fn(),
    releaseOutside,
  };
}

describe("createTabActionHandler", () => {
  it("releaseOutsideWindow → releaseOutside(tabId, screenX, screenY, sourceWindowId)", () => {
    const deps = makeDeps();
    const handler = createTabActionHandler(deps);
    const action: ShellTabAction = {
      action: "releaseOutsideWindow",
      tabId: "tab-1",
      screenX: 1200,
      screenY: 800,
      sourceWindowId: "win-detached-1",
    };
    handler(action);
    expect(deps.releaseOutside).toHaveBeenCalledTimes(1);
    expect(deps.releaseOutside).toHaveBeenCalledWith("tab-1", 1200, 800, "win-detached-1");
  });

  it("常规分支不误触 releaseOutside（focusTab 直通 handleFocusTab）", () => {
    const deps = makeDeps();
    const handler = createTabActionHandler(deps);
    const action: ShellTabAction = { action: "focusTab", tabId: "tab-2", sourceWindowId: "main" };
    handler(action);
    expect(deps.handleFocusTab).toHaveBeenCalledWith("tab-2");
    expect(deps.releaseOutside).not.toHaveBeenCalled();
  });
});
