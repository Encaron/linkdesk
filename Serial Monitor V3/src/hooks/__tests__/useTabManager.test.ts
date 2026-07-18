/**
 * useTabManager 纯函数测试 v4（TabGroup 模型）。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §3]
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  resetTerminalCounter,
  createTabDefaults,
  allTabs,
  createInitialTabState,
  reduceCreateTab,
  reduceOpenOrFocus,
  reduceCloseTab,
  reduceMoveTab,
  reduceSplitTab,
  reduceUnsplit,
  reduceSetDirty,
  reduceRestoreLayout,
  type Tab,
  type TabState,
  type LayoutData,
} from "../useTabManager";
import { detectDropZone } from "../tabDragTypes";

/* ── 辅助函数 ── */

function w(label: string, workspaceName: string): Tab {
  return createTabDefaults("workspace", { label, workspaceName });
}

function stateWithTabs(...tabs: Tab[]): TabState {
  return {
    groups: [{ id: "main", tabs, activeTabId: tabs[0]?.id ?? "" }],
    activeGroupId: "main",
    split: null,
  };
}

beforeEach(() => {
  resetTerminalCounter(0);
});

/* ── 工厂函数 ── */

describe("createTabDefaults", () => {
  it("终端 ID 递增", () => {
    expect(createTabDefaults("terminal").id).toBe("terminal-1");
    expect(createTabDefaults("terminal").id).toBe("terminal-2");
  });

  it("workspace ID 来自 workspaceName", () => {
    expect(createTabDefaults("workspace", { workspaceName: "heart_rate" }).id).toBe("workspace-heart_rate");
  });

  it("初始 dirty=false", () => {
    expect(createTabDefaults("terminal").dirty).toBe(false);
  });

  it("label 默认值", () => {
    expect(createTabDefaults("terminal").label).toBe("终端");
    expect(createTabDefaults("workspace").label).toBe("工作台");
    expect(createTabDefaults("workspace", { workspaceName: "PID" }).label).toBe("PID");
    expect(createTabDefaults("settings").label).toBe("设置");
  });
});

/* ── 初始状态 ── */

describe("createInitialTabState", () => {
  it("默认：1 组 1 终端标签页", () => {
    const state = createInitialTabState();
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0].tabs).toHaveLength(1);
    expect(state.groups[0].tabs[0].type).toBe("terminal");
    expect(state.groups[0].activeTabId).toBe(state.groups[0].tabs[0].id);
    expect(state.split).toBeNull();
  });
});

/* ── reduceCreateTab ── */

describe("reduceCreateTab", () => {
  it("创建终端标签页", () => {
    const prev = createInitialTabState();
    const r = reduceCreateTab(prev, "terminal");
    expect(r.state.groups[0].tabs).toHaveLength(2);
    expect(r.state.groups[0].activeTabId).toBe(r.createdId);
  });

  it("workspace 去重——同名聚焦不新增", () => {
    const prev = createInitialTabState();
    const r1 = reduceCreateTab(prev, "workspace", { workspaceName: "heart_rate" });
    expect(r1.state.groups[0].tabs).toHaveLength(2);

    const r2 = reduceCreateTab(r1.state, "workspace", { workspaceName: "heart_rate" });
    expect(r2.state.groups[0].tabs).toHaveLength(2);
    expect(r2.createdId).toBe(r1.createdId);
  });

  it("settings 单例去重", () => {
    const prev = createInitialTabState();
    const r1 = reduceCreateTab(prev, "settings");
    const r2 = reduceCreateTab(r1.state, "settings");
    expect(r2.createdId).toBe(r1.createdId);
  });

  it("分屏时在 activeGroupId 组中创建", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state;
    state = reduceSplitTab(state, "terminal-2", "horizontal");
    // split: [main=terminal-2] | [new group=terminal-1]
    const r = reduceCreateTab(state, "workspace", { workspaceName: "pid" });
    // 在 activeGroupId 所在组创建
    expect(allTabs(r.state)).toHaveLength(3);
  });
});

/* ── reduceOpenOrFocus ── */

describe("reduceOpenOrFocus", () => {
  it("终端存在则聚焦", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state;
    const r = reduceOpenOrFocus(state, "terminal", "terminal-2");
    expect(r.focusedId).toBe("terminal-2");
  });

  it("终端不存在则隐式创建", () => {
    const prev = stateWithTabs(w("PID", "pid"));
    const r = reduceOpenOrFocus(prev, "terminal");
    expect(r.focusedId).not.toBeNull();
    expect(allTabs(r.state).some((t) => t.type === "terminal")).toBe(true);
  });

  it("workspace 不存在则不创建", () => {
    const prev = createInitialTabState();
    const r = reduceOpenOrFocus(prev, "workspace");
    expect(r.focusedId).toBeNull();
  });
});

/* ── reduceMoveTab ── */

describe("reduceMoveTab", () => {
  it("移动标签页到另一个组", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state;
    state = reduceSplitTab(state, "terminal-2", "horizontal");
    // groups: [main=t1] [group-2=terminal-2]

    // 移 t1 到 group-2
    const g1 = state.groups[0];
    const g2 = state.groups[1];
    const next = reduceMoveTab(state, g1.tabs[0].id, g2.id);
    // t1 现在在 group-2 中，main 组空了
    const g2New = next.groups.find((g) => g.id === g2.id)!;
    expect(g2New.tabs).toHaveLength(2);
  });
});

/* ── reduceCloseTab ── */

describe("reduceCloseTab", () => {
  it("关闭普通标签页", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "workspace", { workspaceName: "pid" }).state;
    const r = reduceCloseTab(state, "workspace-pid");
    expect(r.closed).toBe(true);
    expect(allTabs(r.state!)).toHaveLength(1);
  });

  it("终端保底：全局唯一终端不能关", () => {
    const prev = createInitialTabState();
    const r = reduceCloseTab(prev, prev.groups[0].tabs[0].id);
    expect(r.closed).toBe(false);
    expect(r.reason).toBe("blocked");
  });

  it("dirty 标签页拒绝关闭", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "workspace", { workspaceName: "pid" }).state;
    state = reduceSetDirty(state, "workspace-pid", true);
    const r = reduceCloseTab(state, "workspace-pid");
    expect(r.closed).toBe(false);
    expect(r.reason).toBe("dirty");
  });

  it("关闭分屏面板中的标签页 → unsplit", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state;
    state = reduceSplitTab(state, "terminal-2", "horizontal");
    const r = reduceCloseTab(state, "terminal-2");
    expect(r.closed).toBe(true);
    expect(r.state!.split).toBeNull();
  });
});

/* ── reduceSplitTab + reduceUnsplit ── */

describe("reduceSplitTab", () => {
  it("创建分屏：拆出一个标签页到新组", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state;
    const next = reduceSplitTab(state, "terminal-2", "horizontal");
    expect(next.split).not.toBeNull();
    expect(next.split!.direction).toBe("horizontal");
    expect(next.split!.sizes).toEqual([50, 50]);
    expect(next.groups).toHaveLength(2);
  });

  it("已分屏 → 忽略", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state;
    state = reduceSplitTab(state, "terminal-2", "horizontal");
    const next = reduceSplitTab(state, "terminal-1", "horizontal");
    expect(next).toBe(state); // 不变
  });
});

describe("reduceUnsplit", () => {
  it("取消分屏合所有标签页到一组", () => {
    let state = createInitialTabState();
    state = reduceCreateTab(state, "terminal").state;
    state = reduceSplitTab(state, "terminal-2", "horizontal");
    const next = reduceUnsplit(state);
    expect(next.split).toBeNull();
    expect(next.groups).toHaveLength(1);
    expect(next.groups[0].tabs).toHaveLength(2);
  });
});

/* ── reduceRestoreLayout ── */

describe("reduceRestoreLayout", () => {
  it("恢复保存的布局", () => {
    const term = createTabDefaults("terminal");
    term.id = "terminal-1";
    const ws = w("PID", "pid");

    const saved: LayoutData = {
      groups: [{ id: "main", tabs: [term, ws], activeTabId: ws.id }],
      activeGroupId: "main",
      split: null,
    };

    const restored = reduceRestoreLayout(saved);
    expect(allTabs(restored)).toHaveLength(2);
    expect(restored.activeGroupId).toBe("main");
  });

  it("无终端 → 自动补", () => {
    const ws = w("PID", "pid");
    const saved: LayoutData = {
      groups: [{ id: "main", tabs: [ws], activeTabId: ws.id }],
      activeGroupId: "main",
      split: null,
    };

    const restored = reduceRestoreLayout(saved);
    expect(allTabs(restored).some((t) => t.type === "terminal")).toBe(true);
  });
});

/* ── 集成场景 ── */

describe("集成场景", () => {
  it("启动 → 开 workspace → 分屏 → 关分屏", () => {
    let s = createInitialTabState();
    expect(allTabs(s)).toHaveLength(1);

    s = reduceCreateTab(s, "workspace", { workspaceName: "heart_rate" }).state;
    expect(allTabs(s)).toHaveLength(2);

    s = reduceCreateTab(s, "terminal").state;
    expect(allTabs(s)).toHaveLength(3);

    s = reduceSplitTab(s, "terminal-2", "horizontal");
    expect(s.split).not.toBeNull();
    expect(s.groups).toHaveLength(2);

    const r = reduceCloseTab(s, "terminal-2");
    expect(r.closed).toBe(true);
    expect(r.state!.split).toBeNull();
  });
});

/* ── detectDropZone ── */

describe("detectDropZone", () => {
  const rect: DOMRect = { left: 100, top: 100, width: 400, height: 300 } as DOMRect;

  it("左 → left, 右 → right, 上 → up, 下 → down, 中 → center, 外 → null", () => {
    expect(detectDropZone(140, 250, rect)).toBe("left");
    expect(detectDropZone(450, 250, rect)).toBe("right");
    expect(detectDropZone(300, 130, rect)).toBe("up");
    expect(detectDropZone(300, 350, rect)).toBe("down");
    expect(detectDropZone(300, 250, rect)).toBe("center");
    expect(detectDropZone(50, 250, rect)).toBeNull();
  });
});
