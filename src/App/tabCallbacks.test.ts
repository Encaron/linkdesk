/**
 * createTabActionHandler——按 sourceWindowId 路由（E5.8#46.4）+ createCoreCallbacks.closeActiveTab 按聚焦窗路由（E5.8#46.8）测试。
 * 覆盖：#46.4 脱出窗 tab 操作走注册表 tabState + 纯 reducer + updateTabState（分屏/关闭）；
 *       空窗自灭 closeWindow；窗口外释放恒走 relocation（不随源窗分流）；主窗 action 走 useTabManager。
 *       #46.8 Ctrl+W 按聚焦窗——脱出窗关该窗 active tab / 空窗自灭 / 主窗路径不变 / 窗口缺失 no-op / dirty 否决。
 * 测试夹具全用虚构值（硬约束 21：demo-plugin/Demo Alpha/Demo Beta，非真实插件）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTabActionHandler, createCoreCallbacks, createSourceIdRouters, type TabActionHandlerDeps, type SourceIdRouterDeps } from "./tabCallbacks";
import type { WindowShellState } from "./windows";
import type { TabState } from "../hooks/useTabManager";

// E5.8#46.8：closeActiveTab 的 dirty 确认走 viewRegistry.invokeBeforeCloseTab——mock 隔离插件层
vi.mock("../pluginLoader/viewRegistry", () => ({
  invokeBeforeCloseTab: vi.fn(async () => true),
}));
// E5.8#46.12 Step3：脱出窗 close 路径的 dirty 确认走 DialogService.showConfirm——mock 隔离真实弹窗
vi.mock("../core/services/ui/DialogService", () => ({
  showConfirm: vi.fn(async () => true),
}));
import { showConfirm } from "../core/services/ui/DialogService";

const TAB1 = { id: "t1", type: "demo-plugin", label: "Demo Alpha", dirty: false, pluginId: "demo-plugin" };
const TAB2 = { id: "t2", type: "demo-plugin", label: "Demo Beta", dirty: false, pluginId: "demo-plugin" };
/** E5.8#46.12 Step3：脏 tab fixture——dirty:true 字段路径（EditorTab 另一表现是 label ● 前缀，由 isTabDirty 覆盖） */
const DIRTY = { id: "t3", type: "demo-plugin", label: "Demo Gamma", dirty: true, pluginId: "demo-plugin" };

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
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("脱出窗 splitTab → 该窗 tabState 纯 reducer 分屏 + updateTabState（窗内分屏失效修复）", async () => {
    const { deps, updateTabState } = makeDeps();
    const handler = createTabActionHandler(deps);
    await handler({ action: "splitTab", tabId: "t1", direction: "horizontal", zone: "right", targetGroupId: "g1", sourceWindowId: "det-1" });
    expect(updateTabState).toHaveBeenCalledTimes(1);
    const [wid, state] = updateTabState.mock.calls[0] as [string, TabState];
    expect(wid).toBe("det-1");
    expect(state.groups.length).toBe(2); // 分屏成功——t1 移入新组，t2 留源组
  });

  it("脱出窗关闭一个标签（窗仍非空）→ updateTabState，不关窗", async () => {
    const { deps, updateTabState, closeWindow } = makeDeps();
    const handler = createTabActionHandler(deps);
    await handler({ action: "closeTab", tabId: "t1", sourceWindowId: "det-1" });
    expectDetachedUpdate(updateTabState, "det-1", 1);
    expect(closeWindow).not.toHaveBeenCalled();
  });

  it("脱出窗关闭最后一个标签 → 空窗自灭 closeWindow（I9-8，不 updateTabState）", async () => {
    const { deps, updateTabState, closeWindow } = makeDeps();
    deps.windows[0].tabState = makeState([TAB1]); // 只剩一个标签
    const handler = createTabActionHandler(deps);
    await handler({ action: "closeTab", tabId: "t1", sourceWindowId: "det-1" });
    expect(closeWindow).toHaveBeenCalledWith("det-1");
    expect(updateTabState).not.toHaveBeenCalled();
  });

  it("窗口外释放（脱出源窗）→ 恒走 releaseOutside relocation，不随源窗分流", async () => {
    const { deps, releaseOutside, updateTabState, closeWindow } = makeDeps();
    const handler = createTabActionHandler(deps);
    await handler({ action: "releaseOutsideWindow", tabId: "t1", screenX: 300, screenY: 200, sourceWindowId: "det-1" });
    expect(releaseOutside).toHaveBeenCalledWith("t1", 300, 200, "det-1");
    expect(updateTabState).not.toHaveBeenCalled();
    expect(closeWindow).not.toHaveBeenCalled();
  });

  it("主窗 action → 走 useTabManager 主路径（reorderTab），不碰注册表", async () => {
    const { deps, reorderTab, updateTabState, closeWindow } = makeDeps();
    const handler = createTabActionHandler(deps);
    await handler({ action: "reorderTab", groupId: "g1", tabId: "t1", newIndex: 1, oldIndex: 0, sourceWindowId: "main" });
    expect(reorderTab).toHaveBeenCalledWith("t1", 1);
    expect(updateTabState).not.toHaveBeenCalled();
    expect(closeWindow).not.toHaveBeenCalled();
  });

  it("脱出窗已关闭的迟到动作 → 静默丢弃（window 找不到）", async () => {
    const { deps, updateTabState, closeWindow } = makeDeps();
    const handler = createTabActionHandler(deps);
    await handler({ action: "closeTab", tabId: "t1", sourceWindowId: "gone-1" });
    expect(updateTabState).not.toHaveBeenCalled();
    expect(closeWindow).not.toHaveBeenCalled();
  });

  // E5.8#46.12 Step3：脱出窗池侧 × 关脏 tab 补 dirty 确认（此前静默关脏丢数据）
  it("脱出窗池侧 × 关非脏 tab → 不弹确认，直接关", async () => {
    const { deps, updateTabState } = makeDeps();
    const handler = createTabActionHandler(deps);
    await handler({ action: "closeTab", tabId: "t1", sourceWindowId: "det-1" });
    expect(showConfirm).not.toHaveBeenCalled();
    expectDetachedUpdate(updateTabState, "det-1", 1);
  });

  it("脱出窗池侧 × 关脏 tab → dirty 确认否决 → 不关（showConfirm 被调）", async () => {
    vi.mocked(showConfirm).mockResolvedValueOnce(false);
    const { deps, updateTabState, closeWindow } = makeDeps({ windows: [{ windowId: "det-1", mode: "detached", ready: true, tabState: makeState([DIRTY, TAB2]) }] });
    const handler = createTabActionHandler(deps);
    await handler({ action: "closeTab", tabId: "t3", sourceWindowId: "det-1" });
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(updateTabState).not.toHaveBeenCalled();
    expect(closeWindow).not.toHaveBeenCalled();
  });

  it("脱出窗池侧 × 关脏 tab → dirty 确认通过 → 关闭 + updateTabState", async () => {
    vi.mocked(showConfirm).mockResolvedValueOnce(true);
    const { deps, updateTabState, closeWindow } = makeDeps({ windows: [{ windowId: "det-1", mode: "detached", ready: true, tabState: makeState([DIRTY, TAB2]) }] });
    const handler = createTabActionHandler(deps);
    await handler({ action: "closeTab", tabId: "t3", sourceWindowId: "det-1" });
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expectDetachedUpdate(updateTabState, "det-1", 1);
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

  // E5.8#46.12 Step3：脱出窗 Ctrl+W 关脏 tab 走 DialogService dirty 确认（此前静默关脏丢数据）
  it("脱出窗 Ctrl+W 关脏 tab → dirty 确认否决 → 不关（showConfirm 被调）", async () => {
    vi.mocked(showConfirm).mockResolvedValueOnce(false);
    const { callbacks, updateTabState, closeWindow } = makeCoreCallbacks([DIRTY, TAB2]);
    await callbacks.closeActiveTab("det-1");
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(updateTabState).not.toHaveBeenCalled();
    expect(closeWindow).not.toHaveBeenCalled();
  });

  it("脱出窗 Ctrl+W 关脏 tab → dirty 确认通过 → 关闭 + updateTabState", async () => {
    vi.mocked(showConfirm).mockResolvedValueOnce(true);
    const { callbacks, updateTabState, closeWindow } = makeCoreCallbacks([DIRTY, TAB2]);
    await callbacks.closeActiveTab("det-1");
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expectDetachedUpdate(updateTabState, "det-1", 1);
    expect(closeWindow).not.toHaveBeenCalled();
  });
});

/* ── E5.8#46.12：createSourceIdRouters 按来源窗路由 sourceId 族（信封章）── */

function makeSourceIdDeps(overrides: Partial<SourceIdRouterDeps> = {}) {
  const updateTabState = vi.fn();
  const closeWindow = vi.fn();
  const focusTabBySourceId = vi.fn();
  const updateTabLabelBySourceId = vi.fn();
  const closeTabBySourceId = vi.fn();
  const win: WindowShellState = { windowId: "det-1", mode: "detached", ready: true, tabState: makeState([TAB1, TAB2]) };
  const deps: SourceIdRouterDeps = {
    windows: [win],
    updateTabState,
    closeWindow,
    focusTabBySourceId,
    updateTabLabelBySourceId,
    closeTabBySourceId,
    ...overrides,
  };
  const routers = createSourceIdRouters(deps);
  return { routers, updateTabState, closeWindow, focusTabBySourceId, updateTabLabelBySourceId, closeTabBySourceId };
}

describe("createSourceIdRouters —— E5.8#46.12 按来源窗路由 sourceId 族", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("脱出窗 updateLabelBySourceId → 该窗注册表 label 更新 + updateTabState（黑点同步根修）", () => {
    const { routers, updateTabState, updateTabLabelBySourceId } = makeSourceIdDeps();
    routers.updateTabLabelBySourceId("t1", "● Demo Alpha", "det-1");
    expect(updateTabLabelBySourceId).not.toHaveBeenCalled();
    expect(updateTabState).toHaveBeenCalledTimes(1);
    const [wid, state] = updateTabState.mock.calls[0] as [string, TabState];
    expect(wid).toBe("det-1");
    expect(state.groups[0].tabs[0].label).toBe("● Demo Alpha");
  });

  it("主窗/未注 updateLabelBySourceId → 走 useTabManager 主路径", () => {
    const { routers, updateTabState, updateTabLabelBySourceId } = makeSourceIdDeps();
    routers.updateTabLabelBySourceId("t1", "● Demo Alpha", "main");
    routers.updateTabLabelBySourceId("t1", "● Demo Alpha");
    expect(updateTabLabelBySourceId).toHaveBeenCalledTimes(2);
    expect(updateTabState).not.toHaveBeenCalled();
  });

  it("脱出窗 updateLabelBySourceId 但窗内无此 tab → 静默 no-op（不误触主窗同名 tab）", () => {
    const { routers, updateTabState, updateTabLabelBySourceId } = makeSourceIdDeps();
    routers.updateTabLabelBySourceId("ghost", "● Demo", "det-1");
    expect(updateTabState).not.toHaveBeenCalled();
    expect(updateTabLabelBySourceId).not.toHaveBeenCalled();
  });

  it("脱出窗 closeBySourceId → 关该窗 tab + updateTabState（窗仍非空，不关窗）", () => {
    const { routers, updateTabState, closeWindow, closeTabBySourceId } = makeSourceIdDeps();
    routers.closeTabBySourceId("t1", "det-1");
    expect(closeTabBySourceId).not.toHaveBeenCalled();
    expectDetachedUpdate(updateTabState, "det-1", 1);
    expect(closeWindow).not.toHaveBeenCalled();
  });

  it("脱出窗 closeBySourceId 关最后一个 tab → 空窗自灭 closeWindow（不 updateTabState）", () => {
    const { routers, updateTabState, closeWindow } = makeSourceIdDeps({ windows: [{ windowId: "det-1", mode: "detached", ready: true, tabState: makeState([TAB1]) }] });
    routers.closeTabBySourceId("t1", "det-1");
    expect(closeWindow).toHaveBeenCalledWith("det-1");
    expect(updateTabState).not.toHaveBeenCalled();
  });

  // E5.8#46.12 Step3：脱出窗 sourceId 关脏 tab 静默阻断（镜像主窗 reduceCloseTab dirty 阻断，不弹窗）
  it("脱出窗 closeBySourceId 关脏 tab → 静默阻断（不 updateTabState/不关窗/不弹确认）", () => {
    const { routers, updateTabState, closeWindow } = makeSourceIdDeps({ windows: [{ windowId: "det-1", mode: "detached", ready: true, tabState: makeState([DIRTY, TAB2]) }] });
    routers.closeTabBySourceId("t3", "det-1");
    expect(showConfirm).not.toHaveBeenCalled();
    expect(updateTabState).not.toHaveBeenCalled();
    expect(closeWindow).not.toHaveBeenCalled();
  });

  it("主窗/未注 closeBySourceId → 走 useTabManager 主路径", () => {
    const { routers, updateTabState, closeTabBySourceId } = makeSourceIdDeps();
    routers.closeTabBySourceId("t1", "main");
    routers.closeTabBySourceId("t1");
    expect(closeTabBySourceId).toHaveBeenCalledTimes(2);
    expect(updateTabState).not.toHaveBeenCalled();
  });

  it("脱出窗 focusBySourceId → 该窗 activeTabId 切到目标（reduceFocusTab + updateTabState）", () => {
    // 初始 active 为 t2（makeState 默认 t1）——聚焦 t1 验证真的发生切换
    const win: WindowShellState = { windowId: "det-1", mode: "detached", ready: true, tabState: { groups: [{ id: "g1", tabs: [TAB1, TAB2], activeTabId: "t2" }], activeGroupId: "g1", root: { type: "leaf", groupId: "g1" } } };
    const { routers, updateTabState, focusTabBySourceId } = makeSourceIdDeps({ windows: [win] });
    routers.focusTabBySourceId("t1", "det-1");
    expect(focusTabBySourceId).not.toHaveBeenCalled();
    expect(updateTabState).toHaveBeenCalledTimes(1);
    const [wid, state] = updateTabState.mock.calls[0] as [string, TabState];
    expect(wid).toBe("det-1");
    expect(state.groups[0].activeTabId).toBe("t1");
  });

  it("主窗/未注 focusBySourceId → 走 useTabManager 主路径", () => {
    const { routers, updateTabState, focusTabBySourceId } = makeSourceIdDeps();
    routers.focusTabBySourceId("t1", "main");
    routers.focusTabBySourceId("t1");
    expect(focusTabBySourceId).toHaveBeenCalledTimes(2);
    expect(updateTabState).not.toHaveBeenCalled();
  });

  it("脱出窗已关（章指 gone-1）→ sourceId 族全静默丢弃（#46.4 同语义，不误触主窗）", () => {
    const { routers, updateTabState, closeWindow, focusTabBySourceId, updateTabLabelBySourceId, closeTabBySourceId } = makeSourceIdDeps();
    routers.updateTabLabelBySourceId("t1", "● Demo Alpha", "gone-1");
    routers.closeTabBySourceId("t1", "gone-1");
    routers.focusTabBySourceId("t1", "gone-1");
    expect(updateTabState).not.toHaveBeenCalled();
    expect(closeWindow).not.toHaveBeenCalled();
    expect(focusTabBySourceId).not.toHaveBeenCalled();
    expect(updateTabLabelBySourceId).not.toHaveBeenCalled();
    expect(closeTabBySourceId).not.toHaveBeenCalled();
  });
});
