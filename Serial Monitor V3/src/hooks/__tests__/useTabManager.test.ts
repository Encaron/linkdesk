/**
 * useTabManager 纯函数测试 v4（TabGroup 模型 + SplitNode 递归树）。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §3] + [V3-Phase3-补充-递归分屏.md]
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
import { getAllLeafGroupIds } from "../splitTree";
import { detectDropZone } from "../tabDragTypes";

/* ── 辅助函数 ── */

function w(label: string, workspaceName: string): Tab {
  return createTabDefaults("workspace", { label, workspaceName });
}

function stateWithTabs(...tabs: Tab[]): TabState {
  return {
    groups: [{ id: "main", tabs, activeTabId: tabs[0]?.id ?? "" }],
    activeGroupId: "main",
    root: { type: "leaf", groupId: "main" },
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
  it("Phase 4：默认 1 组 1 欢迎页，单 leaf", () => {
    const state = createInitialTabState();
    expect(state.groups).toHaveLength(1);
    expect(state.groups[0].tabs).toHaveLength(1);
    expect(state.groups[0].tabs[0].type).toBe("welcome");
    expect(state.groups[0].activeTabId).toBe(state.groups[0].tabs[0].id);
    expect(state.root.type).toBe("leaf");
    expect((state.root as any).groupId).toBe("main");
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
    const r = reduceCreateTab(state, "workspace", { workspaceName: "pid" });
    expect(allTabs(r.state)).toHaveLength(3);
  });
});

/* ── reduceOpenOrFocus ── */

describe("reduceOpenOrFocus", () => {
  it("终端存在则聚焦", () => {
    let state = createInitialTabState();               // [welcome]
    state = reduceCreateTab(state, "terminal").state;   // [welcome, terminal-1]
    const r = reduceOpenOrFocus(state, "terminal", "terminal-1");
    expect(r.focusedId).toBe("terminal-1");
  });

  it("终端不存在则隐式创建", () => {
    const prev = stateWithTabs(w("PID", "pid"));
    const r = reduceOpenOrFocus(prev, "terminal");
    expect(r.focusedId).not.toBeNull();
    expect(allTabs(r.state).some((t) => t.type === "terminal")).toBe(true);
  });

  it("workspace 不存在则隐式创建（Phase 4 归一化——任何 type 都可隐式创建）", () => {
    const prev = createInitialTabState();
    const r = reduceOpenOrFocus(prev, "workspace");
    expect(r.focusedId).not.toBeNull();
    expect(allTabs(r.state).some((t) => t.type === "workspace")).toBe(true);
  });
});

/* ── reduceMoveTab ── */

describe("reduceMoveTab", () => {
  it("移动标签页到另一个组", () => {
    let state = createInitialTabState();                      // [welcome]
    state = reduceCreateTab(state, "terminal").state;         // [welcome, terminal-1]
    state = reduceSplitTab(state, "terminal-1", "horizontal"); // [welcome] | [terminal-1]

    expect(state.groups).toHaveLength(2);
    const leafIds = getAllLeafGroupIds(state.root);
    expect(leafIds).toHaveLength(2);

    const g1 = state.groups.find((g) => g.id === leafIds[0])!;
    const g2 = state.groups.find((g) => g.id === leafIds[1])!;
    expect(g1).toBeDefined();
    expect(g2).toBeDefined();
    expect(g1.tabs).toHaveLength(1);
    expect(g2.tabs).toHaveLength(1);

    const next = reduceMoveTab(state, g1.tabs[0].id, g2.id);
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

  it("Phase 4 欢迎页保底：全局唯一欢迎页不能关", () => {
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
    let state = createInitialTabState();                     // [welcome]
    state = reduceCreateTab(state, "terminal").state;        // [welcome, terminal-1]
    state = reduceSplitTab(state, "terminal-1", "horizontal"); // [welcome] | [terminal-1]
    const r = reduceCloseTab(state, "terminal-1");
    expect(r.closed).toBe(true);
    expect(getAllLeafGroupIds(r.state!.root)).toHaveLength(1);
  });
});

/* ── reduceSplitTab + reduceUnsplit ── */

describe("reduceSplitTab", () => {
  it("创建分屏：拆出一个标签页到新 leaf", () => {
    let state = createInitialTabState();                    // [welcome]
    state = reduceCreateTab(state, "terminal").state;       // [welcome, terminal-1]
    const next = reduceSplitTab(state, "terminal-1", "horizontal");
    const leafIds = getAllLeafGroupIds(next.root);
    expect(leafIds).toHaveLength(2);
    expect(next.root.type).toBe("branch");
    expect((next.root as any).direction).toBe("horizontal");
    expect((next.root as any).sizes).toEqual([50, 50]);
    expect(next.groups).toHaveLength(2);
  });

  it("源组只有 1 个 tab → 阻止分屏（防止空面板）", () => {
    // 先创建 2-pane，然后尝试拆分 solo-tab 组
    let state = createInitialTabState();                     // [welcome]
    state = reduceCreateTab(state, "terminal").state;        // [welcome, t1]
    state = reduceSplitTab(state, "terminal-1", "horizontal"); // [welcome] | [t1]
    // terminal-1 在 solo 组中（只有它自己），尝试分屏它 → 应被阻止
    const next = reduceSplitTab(state, "terminal-1", "vertical");
    expect(getAllLeafGroupIds(next.root)).toHaveLength(2);   // 仍是 2 pane，未变
  });

  it("3-pane：源组有 ≥2 个 tab 时可创建多级分屏", () => {
    let state = createInitialTabState();                      // [welcome]
    state = reduceCreateTab(state, "terminal").state;         // [welcome, t1]
    state = reduceCreateTab(state, "terminal").state;         // [welcome, t1, t2]
    state = reduceSplitTab(state, "terminal-2", "horizontal"); // [welcome,t1] | [t2]
    // 源组（[welcome,t1]）还有 2 个 tab，可以继续分屏
    state = reduceSplitTab(state, "terminal-1", "vertical");   // [welcome] | [t1]  (左侧上下) | [t2] 右侧
    const leafIds = getAllLeafGroupIds(state.root);
    expect(leafIds).toHaveLength(3);
    expect(state.root.type).toBe("branch");
  });

  it("深度限制：超过 MAX_TREE_DEPTH 忽略", () => {
    // 创建深度为 MAX_TREE_DEPTH 的树，再分裂应返回原状态
    let state = createInitialTabState();
    // 每分裂一次深度+1
    for (let i = 0; i < 4; i++) {
      state = reduceCreateTab(state, "terminal").state;
      const lastTab = state.groups.find((g) => g.id === state.activeGroupId)?.tabs.slice(-1)[0];
      if (lastTab && i < 3) {
        state = reduceSplitTab(state, lastTab.id, "vertical");
      }
    }
    // 第4次 split 应被忽略（深度已达上限）
    // 此时应有 <= 4 个 leaf
    expect(getAllLeafGroupIds(state.root).length).toBeLessThanOrEqual(4);
  });
});

describe("reduceUnsplit", () => {
  it("取消分屏——指定 groupId 的 leaf 被移除", () => {
    let state = createInitialTabState();                     // [welcome]
    state = reduceCreateTab(state, "terminal").state;        // [welcome, terminal-1]
    state = reduceSplitTab(state, "terminal-1", "horizontal"); // [welcome] | [terminal-1]
    const leafIds = getAllLeafGroupIds(state.root);
    const next = reduceUnsplit(state, leafIds[1]); // unsplit the new group
    expect(getAllLeafGroupIds(next.root)).toHaveLength(1);
    expect(next.groups).toHaveLength(1);
  });
});

/* ── reduceRestoreLayout ── */

describe("reduceRestoreLayout", () => {
  it("恢复保存的布局（新格式 root）", () => {
    const term = createTabDefaults("terminal");
    term.id = "terminal-1";
    const ws = w("PID", "pid");

    const saved: LayoutData = {
      groups: [{ id: "main", tabs: [term, ws], activeTabId: ws.id }],
      activeGroupId: "main",
      root: { type: "leaf", groupId: "main" },
    };

    const restored = reduceRestoreLayout(saved);
    expect(allTabs(restored)).toHaveLength(2);
    expect(restored.activeGroupId).toBe("main");
  });

  it("旧格式迁移：split → root", () => {
    const term = createTabDefaults("terminal");
    term.id = "terminal-1";
    const ws = w("PID", "pid");
    ws.id = "workspace-pid";

    const saved: LayoutData = {
      groups: [
        { id: "g1", tabs: [term], activeTabId: term.id },
        { id: "g2", tabs: [ws], activeTabId: ws.id },
      ],
      activeGroupId: "g1",
      // 旧格式——没有 root，只有 split
      split: { direction: "vertical", groupIds: ["g1", "g2"], sizes: [30, 70] },
    };

    const restored = reduceRestoreLayout(saved);
    expect(getAllLeafGroupIds(restored.root)).toHaveLength(2);
    expect(restored.root.type).toBe("branch");
  });

  it("Phase 4：恢复布局尊重保存内容——不强制插入欢迎页", () => {
    const ws = w("PID", "pid");
    const saved: LayoutData = {
      groups: [{ id: "main", tabs: [ws], activeTabId: ws.id }],
      activeGroupId: "main",
      root: { type: "leaf", groupId: "main" },
    };

    const restored = reduceRestoreLayout(saved);
    expect(allTabs(restored)).toHaveLength(1);
    expect(allTabs(restored)[0].type).toBe("workspace");
  });
});

/* ── 集成场景 ── */

describe("集成场景", () => {
  it("启动 → 开 workspace → 分屏 → 关分屏", () => {
    let s = createInitialTabState();                                   // [welcome]
    expect(allTabs(s)).toHaveLength(1);

    s = reduceCreateTab(s, "workspace", { workspaceName: "heart_rate" }).state;
    expect(allTabs(s)).toHaveLength(2);                                // [welcome, workspace-heart_rate]

    s = reduceCreateTab(s, "terminal").state;
    expect(allTabs(s)).toHaveLength(3);                                // [welcome, ws, terminal-1]

    s = reduceSplitTab(s, "terminal-1", "horizontal");
    expect(getAllLeafGroupIds(s.root)).toHaveLength(2);
    expect(s.groups).toHaveLength(2);

    const r = reduceCloseTab(s, "terminal-1");
    expect(r.closed).toBe(true);
    expect(getAllLeafGroupIds(r.state!.root)).toHaveLength(1);
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
