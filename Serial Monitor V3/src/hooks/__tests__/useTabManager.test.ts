/**
 * useTabManager 纯函数测试。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §3]
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  resetTerminalCounter,
  createTabDefaults,
  getDefaultLabel,
  recomputeClosable,
  ensureTerminal,
  pickNextActive,
  createInitialTabState,
  reduceCreateTab,
  reduceOpenOrFocus,
  reduceFocusTab,
  reduceCloseTab,
  reduceForceCloseTab,
  reduceSplitTab,
  reduceDropSplit,
  reduceUnsplit,
  reduceSetDirty,
  reduceReorderTab,
  reduceRestoreLayout,
  type Tab,
  type TabState,
} from "../useTabManager";
import { detectDropZone } from "../tabDragTypes";

/* ── 辅助函数 ── */

function t(label: string, overrides?: Partial<Tab>): Tab {
  return createTabDefaults("terminal", { label, ...overrides });
}

function w(label: string, workspaceName: string, overrides?: Partial<Tab>): Tab {
  return createTabDefaults("workspace", { label, workspaceName, ...overrides });
}

function s(overrides?: Partial<Tab>): Tab {
  return createTabDefaults("settings", overrides);
}

beforeEach(() => {
  resetTerminalCounter(0);
});

/* ══════════════════════════════════════════════════════════════
   工厂函数
   ══════════════════════════════════════════════════════════════ */

describe("createTabDefaults", () => {
  it("终端 ID 递增", () => {
    const t1 = createTabDefaults("terminal");
    const t2 = createTabDefaults("terminal");
    expect(t1.id).toBe("terminal-1");
    expect(t2.id).toBe("terminal-2");
  });

  it("workspace ID 来自 workspaceName", () => {
    const ws = createTabDefaults("workspace", { workspaceName: "heart_rate" });
    expect(ws.id).toBe("workspace-heart_rate");
  });

  it("settings ID 固定为 'settings'", () => {
    const set = createTabDefaults("settings");
    expect(set.id).toBe("settings");
  });

  it("默认 closable=true, dirty=false", () => {
    const tab = createTabDefaults("terminal");
    expect(tab.closable).toBe(true);
    expect(tab.dirty).toBe(false);
  });

  it("label 默认值", () => {
    expect(createTabDefaults("terminal").label).toBe("终端");
    expect(createTabDefaults("workspace").label).toBe("工作台");
    expect(createTabDefaults("workspace", { workspaceName: "PID" }).label).toBe("PID");
    expect(createTabDefaults("settings").label).toBe("设置");
    expect(createTabDefaults("oled").label).toBe("OLED");
  });
});

describe("getDefaultLabel", () => {
  it("workspace 有名称时用名称", () => {
    expect(getDefaultLabel("workspace", "心率检测")).toBe("心率检测");
  });
  it("workspace 无名称时用默认", () => {
    expect(getDefaultLabel("workspace")).toBe("工作台");
  });
});

/* ══════════════════════════════════════════════════════════════
   辅助纯函数
   ══════════════════════════════════════════════════════════════ */

describe("recomputeClosable", () => {
  it("唯一终端标签页 → closable=false", () => {
    const tabs = [t("终端")];
    const result = recomputeClosable(tabs);
    expect(result[0].closable).toBe(false);
  });

  it("多个标签页 → 全部 closable=true", () => {
    const tabs = [t("终端"), w("PID", "pid")];
    const result = recomputeClosable(tabs);
    expect(result.every((t) => t.closable)).toBe(true);
  });

  it("非终端唯一标签页 → 全部 closable=true（不应该出现但防御）", () => {
    const tabs = [s()];
    const result = recomputeClosable(tabs);
    // 即使没有终端，如果只有一个非终端标签页，保留其 closable
    expect(result[0].closable).toBe(true);
  });
});

describe("ensureTerminal", () => {
  it("空数组 → 创建终端", () => {
    const { tabs, createdId } = ensureTerminal([]);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].type).toBe("terminal");
    expect(createdId).toBe(tabs[0].id);
  });

  it("有终端 → 不变", () => {
    const terminal = t("终端");
    const { tabs, createdId } = ensureTerminal([terminal, w("PID", "pid")]);
    expect(tabs).toHaveLength(2);
    expect(createdId).toBeNull();
  });

  it("无终端 → 补终端放在最前", () => {
    const { tabs, createdId } = ensureTerminal([w("PID", "pid")]);
    expect(tabs).toHaveLength(2);
    expect(tabs[0].type).toBe("terminal");
    expect(createdId).toBe(tabs[0].id);
  });
});

describe("pickNextActive", () => {
  it("关闭第一个 → 选第二个", () => {
    const tabs = [t("t1"), t("t2"), t("t3")];
    expect(pickNextActive(tabs, "terminal-1")).toBe("terminal-2");
  });

  it("关闭最后一个 → 选倒数第二个", () => {
    const tabs = [t("t1"), t("t2"), t("t3")];
    expect(pickNextActive(tabs, "terminal-3")).toBe("terminal-2");
  });

  it("replacedActiveTabId 优先", () => {
    const tabs = [t("t1"), w("PID", "pid")];
    expect(pickNextActive(tabs, "terminal-1", "workspace-pid")).toBe("workspace-pid");
  });
});

/* ══════════════════════════════════════════════════════════════
   初始状态
   ══════════════════════════════════════════════════════════════ */

describe("createInitialTabState", () => {
  it("默认：1 个终端标签页，closable=false", () => {
    const state = createInitialTabState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].type).toBe("terminal");
    expect(state.tabs[0].closable).toBe(false);
    expect(state.activeTabId).toBe(state.tabs[0].id);
    expect(state.split).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════
   reduceCreateTab
   ══════════════════════════════════════════════════════════════ */

describe("reduceCreateTab", () => {
  it("创建终端标签页", () => {
    const prev = createInitialTabState();
    const r = reduceCreateTab(prev, "terminal");
    expect(r.state.tabs).toHaveLength(2);
    expect(r.state.activeTabId).toBe(r.createdId);
    // 现在有两个标签页，全部 closable
    expect(r.state.tabs.every((t) => t.closable)).toBe(true);
  });

  it("创建 workspace——去重", () => {
    const prev = createInitialTabState();
    // 先创建一个
    const r1 = reduceCreateTab(prev, "workspace", "heart_rate");
    expect(r1.state.tabs).toHaveLength(2);

    // 再创建同名 → 应该聚焦已有
    const r2 = reduceCreateTab(r1.state, "workspace", "heart_rate");
    expect(r2.state.tabs).toHaveLength(2); // 不新增
    expect(r2.state.activeTabId).toBe(r1.createdId);
    expect(r2.createdId).toBe(r1.createdId);
  });

  it("创建 settings——单例去重", () => {
    const prev = createInitialTabState();
    const r1 = reduceCreateTab(prev, "settings");
    const r2 = reduceCreateTab(r1.state, "settings");
    expect(r2.state.tabs).toHaveLength(2); // terminal + settings
    expect(r2.createdId).toBe(r1.createdId);
  });

  it("分屏时创建——替换 activeTabId 所在面板", () => {
    // 先建两个终端，分屏 [terminal-1 | terminal-2]
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state; // terminal-2 创建后 activeTabId = terminal-2
    state = reduceFocusTab(state, "terminal-1"); // 先聚焦 terminal-1，否则 split 判定为同一标签页
    state = reduceSplitTab(state, "terminal-2", "horizontal");
    // 现在分屏：[terminal-1 | terminal-2]，activeTabId 保持 terminal-1
    expect(state.split).not.toBeNull();
    expect(state.split!.tabIds).toEqual(["terminal-1", "terminal-2"]);

    // 在分屏时创建 workspace → 替换 activeTabId("terminal-1") 所在面板
    const r2 = reduceCreateTab(state, "workspace", "pid");
    expect(r2.state.split!.tabIds).toContain(r2.createdId);
    expect(r2.state.tabs).toHaveLength(3); // terminal-1, terminal-2, workspace-pid
  });
});

/* ══════════════════════════════════════════════════════════════
   reduceOpenOrFocus
   ══════════════════════════════════════════════════════════════ */

describe("reduceOpenOrFocus", () => {
  it("终端：存在则聚焦最近活跃的", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "workspace", "pid").state;
    state = reduceCreateTab(state, "terminal").state; // terminal-2

    // 聚焦 terminal，传 lastFocusedId = terminal-2
    const r = reduceOpenOrFocus(state, "terminal", "terminal-2");
    expect(r.focusedId).toBe("terminal-2");
    expect(r.state.activeTabId).toBe("terminal-2");
  });

  it("终端：没有则隐式创建", () => {
    // 创造只有 workspace 的状态
    const ws = w("PID", "pid");
    const prev: TabState = { tabs: [ws], activeTabId: ws.id, split: null };

    const r = reduceOpenOrFocus(prev, "terminal");
    expect(r.focusedId).not.toBeNull();
    expect(r.state.tabs.some((t) => t.type === "terminal")).toBe(true);
  });

  it("workspace：存在则聚焦，不存在则不创建", () => {
    const prev = createInitialTabState();

    // 不存在 → 不创建
    const r1 = reduceOpenOrFocus(prev, "workspace");
    expect(r1.focusedId).toBeNull();
    expect(r1.state).toBe(prev); // 状态不变

    // 创建后再试
    const wsTab = w("PID", "pid");
    const withWs: TabState = { tabs: [prev.tabs[0], wsTab], activeTabId: wsTab.id, split: null };
    const r2 = reduceOpenOrFocus(withWs, "workspace", wsTab.id);
    expect(r2.focusedId).toBe(wsTab.id);
  });

  it("settings：无则创建（用户预期）", () => {
    const prev = createInitialTabState();
    const r = reduceOpenOrFocus(prev, "settings");
    expect(r.focusedId).not.toBeNull();
    expect(r.state.tabs.some((t) => t.type === "settings")).toBe(true);
  });
});

describe("reduceFocusTab", () => {
  it("切换到指定标签页", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "workspace", "pid").state;
    const next = reduceFocusTab(state, "terminal-1");
    expect(next.activeTabId).toBe("terminal-1");
  });

  it("不存在的 ID → 不变", () => {
    const prev = createInitialTabState();
    const next = reduceFocusTab(prev, "nonexistent");
    expect(next).toBe(prev);
  });
});

/* ══════════════════════════════════════════════════════════════
   reduceCloseTab + reduceForceCloseTab
   ══════════════════════════════════════════════════════════════ */

describe("reduceCloseTab", () => {
  it("关闭普通标签页", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "workspace", "pid").state;
    state = reduceCreateTab(state, "terminal").state; // terminal-2

    const r = reduceCloseTab(state, "workspace-pid");
    expect(r.result.closed).toBe(true);
    expect(r.state.tabs).toHaveLength(2);
    expect(r.state.tabs.every((t) => t.type === "terminal")).toBe(true);
  });

  it("终端保底：唯一终端不能关", () => {
    const prev = createInitialTabState();
    const r = reduceCloseTab(prev, prev.tabs[0].id);
    expect(r.result.closed).toBe(false);
    expect(r.result.reason).toBe("blocked");
    expect(r.state.tabs).toHaveLength(1);
  });

  it("多个标签页时终端可关", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state; // terminal-2

    const r = reduceCloseTab(state, "terminal-1");
    expect(r.result.closed).toBe(true);
    expect(r.state.tabs).toHaveLength(1);
    expect(r.state.tabs[0].id).toBe("terminal-2");
  });

  it("关闭后只剩 workspace → 自动补终端", () => {
    // terminal-1 + workspace-pid，关 terminal-1
    let state = createInitialTabState();
    state = reduceCreateTab(state, "workspace", "pid").state;

    const r = reduceCloseTab(state, "terminal-1");
    expect(r.result.closed).toBe(true);
    // 关掉终端后只剩 workspace，ensureTerminal 自动补
    expect(r.state.tabs.some((t) => t.type === "terminal")).toBe(true);
  });

  it("dirty 标签页返回 blocked+dirty", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "workspace", "pid").state;
    state = reduceSetDirty(state, "workspace-pid", true);

    const r = reduceCloseTab(state, "workspace-pid");
    expect(r.result.closed).toBe(false);
    expect(r.result.reason).toBe("dirty");
  });

  it("关闭分屏面板中的标签页 → unsplit", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state; // terminal-2, activeTabId = terminal-2
    state = reduceFocusTab(state, "terminal-1"); // 聚焦 terminal-1
    state = reduceSplitTab(state, "terminal-2", "horizontal");
    // 分屏: [terminal-1 | terminal-2], activeTabId = terminal-1

    const r = reduceCloseTab(state, "terminal-2");
    expect(r.result.closed).toBe(true);
    expect(r.result.reason).toBe("unsplit");
    expect(r.state.split).toBeNull();
    // 活跃标签页应该指向另一个面板的标签页
    expect(r.state.activeTabId).toBe("terminal-1");
  });

  it("关闭不存在的标签页", () => {
    const prev = createInitialTabState();
    const r = reduceCloseTab(prev, "ghost");
    expect(r.result.closed).toBe(false);
    expect(r.result.reason).toBe("blocked");
  });
});

describe("reduceForceCloseTab", () => {
  it("跳过 dirty 检查强制关闭", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "workspace", "pid").state;
    state = reduceSetDirty(state, "workspace-pid", true);

    const r = reduceForceCloseTab(state, "workspace-pid");
    expect(r.result.closed).toBe(true);
  });

  it("终端保底仍然生效", () => {
    const prev = createInitialTabState();
    const r = reduceForceCloseTab(prev, prev.tabs[0].id);
    expect(r.result.closed).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════
   reduceSplitTab + reduceUnsplit
   ══════════════════════════════════════════════════════════════ */

describe("reduceSplitTab", () => {
  it("创建左右分屏", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state; // terminal-2, activeTabId = terminal-2
    state = reduceFocusTab(state, "terminal-1"); // 先聚焦 terminal-1，否则 split 同 tab 被拒绝

    const next = reduceSplitTab(state, "terminal-2", "horizontal");
    expect(next.split).not.toBeNull();
    expect(next.split!.direction).toBe("horizontal");
    expect(next.split!.tabIds).toEqual(["terminal-1", "terminal-2"]);
    expect(next.split!.sizes).toEqual([50, 50]);
  });

  it("同一标签页 + 有多个标签页 → 自动找下一个标签页配对", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state; // terminal-2, activeTabId = terminal-2
    // 对 activeTabId 分屏 → 自动配对 terminal-1
    const next = reduceSplitTab(state, "terminal-2");
    expect(next.split).not.toBeNull();
    expect(next.split!.tabIds).toContain("terminal-1");
    expect(next.split!.tabIds).toContain("terminal-2");
  });

  it("只有一个标签页 → 不分", () => {
    const prev = createInitialTabState();
    const next = reduceSplitTab(prev, prev.activeTabId);
    expect(next.split).toBeNull();
  });

  it("已分屏时 → 替换面板", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state; // terminal-2, activeTabId = terminal-2
    state = reduceFocusTab(state, "terminal-1"); // 聚焦 terminal-1
    state = reduceSplitTab(state, "terminal-2", "horizontal");
    // 分屏: [terminal-1 | terminal-2], activeTabId = terminal-1
    state = reduceCreateTab(state, "workspace", "pid").state; // 创建在分屏中，替换 activeTabId(terminal-1) 的面板
    // 分屏: [workspace-pid | terminal-2], activeTabId = workspace-pid
    // 替换: 用 terminal-1 替换 activeTabId(workspace-pid) 所在面板
    const next = reduceSplitTab(state, "terminal-1", "horizontal");
    expect(next.split!.tabIds).toContain("terminal-1");
    expect(next.split!.tabIds).toContain("terminal-2");
    // workspace-pid 被替换，回到 tabs[] 中但不在面板
  });
});

describe("reduceUnsplit", () => {
  it("取消分屏", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state;
    state = reduceSplitTab(state, "terminal-2", "horizontal");

    const next = reduceUnsplit(state);
    expect(next.split).toBeNull();
  });

  it("activeTabId 不在面板中 → 用第一个面板的 tab", () => {
    // 制造场景：分屏 [t1 | t3]，但 activeTabId 指向不在面板中的 t2
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state; // t2, activeTabId=t2
    state = reduceFocusTab(state, "terminal-1"); // 聚焦 terminal-1
    state = reduceSplitTab(state, "terminal-2", "horizontal"); // [t1 | t2], activeId=t1
    state = reduceCreateTab(state, "terminal").state; // t3，创建在分屏中替换 t1 → [t3 | t2], activeId=t3
    // 手动把 activeTabId 改成不在面板中的 t1
    state = { ...state, activeTabId: "terminal-1" }; // t1 在 tabs[] 中但不在面板

    const next = reduceUnsplit(state);
    expect(next.split).toBeNull();
    expect(next.activeTabId).toBe("terminal-3"); // 第一个面板的 tab
  });
});

/* ══════════════════════════════════════════════════════════════
   reduceSetDirty
   ══════════════════════════════════════════════════════════════ */

describe("reduceSetDirty", () => {
  it("设置 dirty 标记", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "workspace", "pid").state;

    const next = reduceSetDirty(state, "workspace-pid", true);
    const ws = next.tabs.find((t) => t.id === "workspace-pid")!;
    expect(ws.dirty).toBe(true);
  });

  it("清除 dirty 标记", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "workspace", "pid").state;
    state = reduceSetDirty(state, "workspace-pid", true);

    const next = reduceSetDirty(state, "workspace-pid", false);
    const ws = next.tabs.find((t) => t.id === "workspace-pid")!;
    expect(ws.dirty).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════
   reduceReorderTab
   ══════════════════════════════════════════════════════════════ */

describe("reduceReorderTab", () => {
  it("标签栏内拖拽重排", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state; // terminal-2
    state = reduceCreateTab(state, "workspace", "pid").state;
    // tabs: [t1, t2, workspace-pid]
    expect(state.tabs.map((t) => t.id)).toEqual(["terminal-1", "terminal-2", "workspace-pid"]);

    // 拖 t1 到位置 2
    const next = reduceReorderTab(state, "terminal-1", 2);
    expect(next.tabs.map((t) => t.id)).toEqual(["terminal-2", "workspace-pid", "terminal-1"]);
  });

  it("不存在的 ID → 不变", () => {
    const prev = createInitialTabState();
    const next = reduceReorderTab(prev, "ghost", 0);
    expect(next).toBe(prev);
  });
});

/* ══════════════════════════════════════════════════════════════
   reduceRestoreLayout
   ══════════════════════════════════════════════════════════════ */

describe("reduceRestoreLayout", () => {
  it("恢复保存的布局", () => {
    const terminal = createTabDefaults("terminal");
    terminal.id = "terminal-1"; // 覆盖递增计数器
    const workspace = w("PID", "pid");

    const saved: TabState = {
      tabs: [terminal, workspace],
      activeTabId: "workspace-pid",
      split: null,
    };

    const restored = reduceRestoreLayout(saved);
    expect(restored.tabs).toHaveLength(2);
    expect(restored.activeTabId).toBe("workspace-pid");
  });

  it("保存的 activeTabId 无效 → fallback 到第一个", () => {
    const terminal = createTabDefaults("terminal");
    terminal.id = "terminal-1";
    const saved: TabState = {
      tabs: [terminal],
      activeTabId: "ghost",
      split: null,
    };

    const restored = reduceRestoreLayout(saved);
    expect(restored.activeTabId).toBe("terminal-1");
  });

  it("保存的 split tabIds 无效 → 忽略分屏", () => {
    const terminal = createTabDefaults("terminal");
    terminal.id = "terminal-1";
    const saved: TabState = {
      tabs: [terminal],
      activeTabId: "terminal-1",
      split: { direction: "horizontal", tabIds: ["terminal-1", "ghost"], sizes: [50, 50] },
    };

    const restored = reduceRestoreLayout(saved);
    expect(restored.split).toBeNull();
  });

  it("无终端 → 自动补", () => {
    const workspace = w("PID", "pid");
    const saved: TabState = {
      tabs: [workspace],
      activeTabId: "workspace-pid",
      split: null,
    };

    const restored = reduceRestoreLayout(saved);
    expect(restored.tabs.some((t) => t.type === "terminal")).toBe(true);
  });

  it("脏数据过滤——缺字段的标签页被跳过", () => {
    const terminal = createTabDefaults("terminal");
    terminal.id = "terminal-1";
    const saved: TabState = {
      tabs: [terminal, { id: "", type: "terminal" as const, label: "", dirty: false, closable: true }],
      activeTabId: "terminal-1",
      split: null,
    };

    const restored = reduceRestoreLayout(saved);
    // 缺 id 的应该被过滤
    expect(restored.tabs).toHaveLength(1);
  });
});

/* ══════════════════════════════════════════════════════════════
   集成场景
   ══════════════════════════════════════════════════════════════ */

describe("集成场景", () => {
  it("典型工作流：启动 → 开 workspace → 分屏 → 关分屏 → 关 workspace", () => {
    // 1. 初始：1 终端
    let s = createInitialTabState();
    expect(s.tabs).toHaveLength(1);

    // 2. 打开 workspace
    const rWs = reduceCreateTab(s, "workspace", "heart_rate");
    s = rWs.state;
    expect(s.tabs).toHaveLength(2);
    expect(s.activeTabId).toBe("workspace-heart_rate");

    // 3. 再开一个终端
    const rT2 = reduceCreateTab(s, "terminal");
    s = rT2.state;
    expect(s.tabs).toHaveLength(3);

    // 4. 切回 workspace
    s = reduceFocusTab(s, "workspace-heart_rate");
    expect(s.activeTabId).toBe("workspace-heart_rate");

    // 5. 分屏：workspace + terminal-2
    s = reduceSplitTab(s, "terminal-2", "horizontal");
    expect(s.split).not.toBeNull();
    expect(s.split!.tabIds).toEqual(["workspace-heart_rate", "terminal-2"]);

    // 6. 关闭分屏中的 terminal-2 → unsplit
    const rClose = reduceCloseTab(s, "terminal-2");
    s = rClose.state;
    expect(rClose.result.closed).toBe(true);
    expect(s.split).toBeNull();
    expect(s.activeTabId).toBe("workspace-heart_rate");
    expect(s.tabs).toHaveLength(2); // t1 + workspace

    // 7. 关闭 workspace
    const rCloseWs = reduceCloseTab(s, "workspace-heart_rate");
    s = rCloseWs.state;
    expect(rCloseWs.result.closed).toBe(true);
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].type).toBe("terminal"); // 终端保底
  });

  it("dirty workspace 关闭流程：拒绝 → forceCloseTab", () => {
    let s = createInitialTabState();
    s = reduceCreateTab(s, "workspace", "pid").state;

    // 设置 dirty
    s = reduceSetDirty(s, "workspace-pid", true);

    // 尝试关闭 → 被拒绝
    const r1 = reduceCloseTab(s, "workspace-pid");
    expect(r1.result.closed).toBe(false);
    expect(r1.result.reason).toBe("dirty");

    // 强制关闭 → 成功
    const r2 = reduceForceCloseTab(s, "workspace-pid");
    expect(r2.result.closed).toBe(true);
  });

  it("多个 workspace 去重", () => {
    let s = createInitialTabState();
    s = reduceCreateTab(s, "workspace", "pid").state;
    s = reduceCreateTab(s, "workspace", "heart_rate").state;

    // 再创建同名 → 聚焦不新增
    const r = reduceCreateTab(s, "workspace", "pid");
    expect(r.state.tabs).toHaveLength(3); // t1 + pid + heart_rate
    expect(r.state.activeTabId).toBe("workspace-pid");
  });
});

/* ══════════════════════════════════════════════════════════════
   reduceDropSplit + detectDropZone
   ══════════════════════════════════════════════════════════════ */

describe("reduceDropSplit", () => {
  it("拖到右侧 → [active | dragged]", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state; // terminal-2, activeTabId=terminal-2
    state = reduceFocusTab(state, "terminal-1");
    // active=terminal-1, drag terminal-2 to right
    const next = reduceDropSplit(state, "terminal-2", "horizontal", 1);
    expect(next.split!.tabIds).toEqual(["terminal-1", "terminal-2"]);
  });

  it("拖到左侧 → [dragged | active]", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state;
    state = reduceFocusTab(state, "terminal-1");
    const next = reduceDropSplit(state, "terminal-2", "horizontal", 0);
    expect(next.split!.tabIds).toEqual(["terminal-2", "terminal-1"]);
  });

  it("已分屏时拖拽替换面板", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state;
    state = reduceFocusTab(state, "terminal-1");
    state = reduceSplitTab(state, "terminal-2", "horizontal");
    // [t1 | t2], activeTabId=t1
    state = reduceCreateTab(state, "workspace", "pid").state; // replaces t1 → [ws | t2], activeTabId=ws
    const next = reduceDropSplit(state, "terminal-1", "horizontal", 1);
    // t1 replaces ws → [t1 | t2]
    expect(next.split!.tabIds).toContain("terminal-1");
    expect(next.split!.tabIds).toContain("terminal-2");
  });
});

describe("detectDropZone", () => {
  const rect: DOMRect = { left: 100, top: 100, width: 400, height: 300 } as DOMRect;

  it("左上区域 → up", () => {
    expect(detectDropZone(300, 130, rect)).toBe("up");
  });

  it("左下区域 → down", () => {
    expect(detectDropZone(300, 350, rect)).toBe("down");
  });

  it("左中区域 → left", () => {
    expect(detectDropZone(140, 250, rect)).toBe("left");
  });

  it("右中区域 → right", () => {
    expect(detectDropZone(450, 250, rect)).toBe("right");
  });

  it("正中 → center", () => {
    expect(detectDropZone(300, 250, rect)).toBe("center");
  });

  it("区域外 → null", () => {
    expect(detectDropZone(50, 250, rect)).toBeNull();
  });
});
