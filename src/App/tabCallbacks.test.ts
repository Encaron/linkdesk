/**
 * createTabActionHandler——按 sourceWindowId 路由（E5.8#46.4）+ createCoreCallbacks.closeActiveTab 按聚焦窗路由（E5.8#46.8）测试。
 * 覆盖：#46.4 脱出窗 tab 操作走注册表 tabState + 纯 reducer + updateTabState（分屏/关闭）；
 *       空窗自灭 closeWindow；窗口外释放恒走 relocation（不随源窗分流）；主窗 action 走 useTabManager。
 *       #46.8 Ctrl+W 按聚焦窗——脱出窗关该窗 active tab / 空窗自灭 / 主窗路径不变 / 窗口缺失 no-op / dirty 否决。
 * 测试夹具全用虚构值（硬约束 21：demo-plugin/Demo Alpha/Demo Beta，非真实插件）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTabActionHandler, createCoreCallbacks, type TabActionHandlerDeps } from "./tabCallbacks";
import type { WindowShellState } from "./windows";
import type { TabState } from "../hooks/useTabManager";

// E5.8#46.8：closeActiveTab 的 dirty 确认走 viewRegistry.invokeBeforeCloseTab——mock 隔离插件层
vi.mock("../pluginLoader/viewRegistry", () => ({
  invokeBeforeCloseTab: vi.fn(async () => true),
}));

const TAB1 = { id: "t1", type: "demo-plugin", label: "Demo Alpha", dirty: false, pluginId: "demo-plugin" };
const TAB2 = { id: "t2", type: "demo-plugin", label: "Demo Beta", dirty: false, pluginId: "demo-plugin" };

function makeState(tabs: Array<typeof TAB1>): TabState {
  return { groups: [{ id: "g1", tabs, activeTabId: tabs[0].id }], activeGroupId: "g1", root: { type: "leaf", groupId: "g1" } };
}

function makeDeps(overrides: Partial<TabActionHandlerDeps> = {}) {
  const updateTabState = vi.fn();
  const closeWindow = vi.fn();
  const releaseOutside = vi.fn();
  const reorderTab = vi.fn();
  const win: WindowShellState = { windowId: "det-1", mode: "detached", ready: true, tabState: makeState([TAB1, TAB2]) };
  const deps: TabActionHandlerDeps = {
    handleFocusTab: vi.fn(),
    focusGroup: vi.fn(),
    closeTab: vi.fn(async () => ({ closed: true, tabId: "" })),
    groups: [],
    reorderTab,
    moveTab: vi.fn(),
    splitTabAt: vi.fn(),
    duplicateTab: vi.fn(),
    pinTab: vi.fn(),
    createTab: vi.fn(),
    updateSplitSizes: vi.fn(),
    releaseOutside,
    windows: [win],
    updateTabState,
    closeWindow,
    ...overrides,
  };
  return { deps, updateTabState, closeWindow, releaseOutside, reorderTab };
}

/** 断言脱出窗 updateTabState 结果（窗仍非空，剩 remainingTabs 个）——#46.4/#46.8 共用 */
function expectDetachedUpdate(updateTabState: ReturnType<typeof vi.fn>, wid: string, remainingTabs: number) {
  expect(updateTabState).toHaveBeenCalledTimes(1);
  const [w, state] = updateTabState.mock.calls[0] as [string, TabState];
  expect(w).toBe(wid);
  expect(state.groups[0].tabs.length).toBe(remainingTabs);
}

describe("createTabActionHandler —— E5.8#46.4 按 sourceWindowId 路由", () => {
  it("脱出窗 splitTab → 该窗 tabState 纯 reducer 分屏 + updateTabState（窗内分屏失效修复）", () => {
    const { deps, updateTabState } = makeDeps();
    const handler = createTabActionHandler(deps);
    handler({ action: "splitTab", tabId: "t1", direction: "horizontal", zone: "right", targetGroupId: "g1", sourceWindowId: "det-1" });
    expect(updateTabState).toHaveBeenCalledTimes(1);
    const [wid, state] = updateTabState.mock.calls[0] as [string, TabState];
    expect(wid).toBe("det-1");
    expect(state.groups.length).toBe(2); // 分屏成功——t1 移入新组，t2 留源组
  });

  it("脱出窗关闭一个标签（窗仍非空）→ updateTabState，不关窗", () => {
    const { deps, updateTabState, closeWindow } = makeDeps();
    const handler = createTabActionHandler(deps);
    handler({ action: "closeTab", tabId: "t1", sourceWindowId: "det-1" });
    expectDetachedUpdate(updateTabState, "det-1", 1);
    expect(closeWindow).not.toHaveBeenCalled();
  });

  it("脱出窗关闭最后一个标签 → 空窗自灭 closeWindow（I9-8，不 updateTabState）", () => {
    const { deps, updateTabState, closeWindow } = makeDeps();
    deps.windows[0].tabState = makeState([TAB1]); // 只剩一个标签
    const handler = createTabActionHandler(deps);
    handler({ action: "closeTab", tabId: "t1", sourceWindowId: "det-1" });
    expect(closeWindow).toHaveBeenCalledWith("det-1");
    expect(updateTabState).not.toHaveBeenCalled();
  });

  it("窗口外释放（脱出源窗）→ 恒走 releaseOutside relocation，不随源窗分流", () => {
    const { deps, releaseOutside, updateTabState, closeWindow } = makeDeps();
    const handler = createTabActionHandler(deps);
    handler({ action: "releaseOutsideWindow", tabId: "t1", screenX: 300, screenY: 200, sourceWindowId: "det-1" });
    expect(releaseOutside).toHaveBeenCalledWith("t1", 300, 200, "det-1");
    expect(updateTabState).not.toHaveBeenCalled();
    expect(closeWindow).not.toHaveBeenCalled();
  });

  it("主窗 action → 走 useTabManager 主路径（reorderTab），不碰注册表", () => {
    const { deps, reorderTab, updateTabState, closeWindow } = makeDeps();
    const handler = createTabActionHandler(deps);
    handler({ action: "reorderTab", groupId: "g1", tabId: "t1", newIndex: 1, oldIndex: 0, sourceWindowId: "main" });
    expect(reorderTab).toHaveBeenCalledWith("t1", 1);
    expect(updateTabState).not.toHaveBeenCalled();
    expect(closeWindow).not.toHaveBeenCalled();
  });

  it("脱出窗已关闭的迟到动作 → 静默丢弃（window 找不到）", () => {
    const { deps, updateTabState, closeWindow } = makeDeps();
    const handler = createTabActionHandler(deps);
    handler({ action: "closeTab", tabId: "t1", sourceWindowId: "gone-1" });
    expect(updateTabState).not.toHaveBeenCalled();
    expect(closeWindow).not.toHaveBeenCalled();
  });
});

/* ── E5.8#46.8：createCoreCallbacks.closeActiveTab 按聚焦窗路由（Ctrl+W）── */

function makeCoreCallbacks(tabs: Array<typeof TAB1> = [TAB1, TAB2]) {
  const closeTab = vi.fn(async () => ({ closed: true, tabId: "" }));
  const updateTabState = vi.fn();
  const closeWindow = vi.fn();
  const win: WindowShellState = { windowId: "det-1", mode: "detached", ready: true, tabState: makeState(tabs) };
  const callbacks = createCoreCallbacks({
    closeTab,
    splitTab: vi.fn(),
    tabState: makeState([TAB1, TAB2]),
    handleFocusTab: vi.fn(),
    unsplit: vi.fn(),
    openOrFocusTab: vi.fn(),
    restoreClosedTab: vi.fn(),
    duplicateTab: vi.fn(),
    pinTab: vi.fn(),
    detachTab: vi.fn(),
    mergeTabToMain: vi.fn(),
    findTabWindow: vi.fn(),
    windows: [win],
    updateTabState,
    closeWindow,
  });
  return { callbacks, closeTab, updateTabState, closeWindow };
}

describe("createCoreCallbacks.closeActiveTab —— E5.8#46.8 按聚焦窗路由", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("脱出窗 Ctrl+W → 关该窗 active tab（窗仍非空）→ updateTabState，不关窗、不碰主窗 closeTab", async () => {
    const { callbacks, closeTab, updateTabState, closeWindow } = makeCoreCallbacks();
    await callbacks.closeActiveTab("det-1");
    expectDetachedUpdate(updateTabState, "det-1", 1); // t1 被关，t2 留
    expect(closeWindow).not.toHaveBeenCalled();
    expect(closeTab).not.toHaveBeenCalled();
  });

  it("脱出窗 Ctrl+W 关最后一个标签 → 空窗自灭 closeWindow（不 updateTabState）", async () => {
    const { callbacks, closeWindow, updateTabState } = makeCoreCallbacks([TAB1]);
    await callbacks.closeActiveTab("det-1");
    expect(closeWindow).toHaveBeenCalledWith("det-1");
    expect(updateTabState).not.toHaveBeenCalled();
  });

  it("主窗 Ctrl+W（sourceWindowId='main'）→ 走 useTabManager closeTab，不碰注册表", async () => {
    const { callbacks, closeTab, updateTabState, closeWindow } = makeCoreCallbacks();
    await callbacks.closeActiveTab("main");
    expect(closeTab).toHaveBeenCalledTimes(1);
    expect(updateTabState).not.toHaveBeenCalled();
    expect(closeWindow).not.toHaveBeenCalled();
  });

  it("sourceWindowId 未注（undefined）→ 主窗路径不变", async () => {
    const { callbacks, closeTab } = makeCoreCallbacks();
    await callbacks.closeActiveTab();
    expect(closeTab).toHaveBeenCalledTimes(1);
  });

  it("脱出窗已关（窗口缺失）→ no-op", async () => {
    const { callbacks, closeTab, updateTabState, closeWindow } = makeCoreCallbacks();
    await callbacks.closeActiveTab("gone-1");
    expect(closeTab).not.toHaveBeenCalled();
    expect(updateTabState).not.toHaveBeenCalled();
    expect(closeWindow).not.toHaveBeenCalled();
  });

  it("脱出窗 Ctrl+W 被 dirty 确认否决 → 不关", async () => {
    const { invokeBeforeCloseTab } = await import("../pluginLoader/viewRegistry");
    vi.mocked(invokeBeforeCloseTab).mockResolvedValueOnce(false);
    const { callbacks, updateTabState, closeWindow } = makeCoreCallbacks();
    await callbacks.closeActiveTab("det-1");
    expect(updateTabState).not.toHaveBeenCalled();
    expect(closeWindow).not.toHaveBeenCalled();
  });
});
