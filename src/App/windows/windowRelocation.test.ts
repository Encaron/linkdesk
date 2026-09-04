/**
 * useWindowRelocation——窗口间标签页搬迁（E5.8#44）——C6 吸附 live 高亮命中/提示下发补测。
 * E5.8#46.10：吸附提示改竖线插入指示——命中下发携带 viewportX/Y（目标池算缝隙）、
 * 目标池回传 insertIndex → 释放并窗精确落位。
 * 测试夹具全用虚构值（硬约束 21：demo-* / tab-*，不指真实插件/文案）。
 * 覆盖：跨窗命中→下发（含 viewport）；源窗排除（窗内拖拽非跨窗吸附）；拖回源窗/取消→清旧目标窗提示；
 * 窗口增删→清全部提示；竖线游走重下发/settled 去抖；insertIndex 回传→落位竖线。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWindowRelocation, type UseWindowRelocationDeps } from "./windowRelocation";
import type { TabState, Tab } from "../../hooks/useTabManager";
import type { WindowShellState } from "./index";
import type { ShellTabDragPosition, TabBarRectsPayload, AdsorbIndexPayload } from "../../core/types/ipc/poolActions";
import type { LinkDeskAPI } from "../../core/api/linkdesk-api";

/* ── E5.8#46.1 合并去重——mock 插件声明（虚构类型 demo-editor/demo-term/demo-tool，硬约束 21）──
 * tabIdentity.getMeta 经 getViewPlugin 读 manifest.tabBehavior.identityField/singleton。
 * identityField="filePath" → 资源身份匹配；demo-term 无 identityField → 多实例不去重；
 * demo-tool singleton → 类型级唯一。未知类型（现有测试 "view"）返回 undefined → 与真实一致（null → 不去重）。 */
vi.mock("../../pluginLoader/viewRegistry", () => ({
  getViewPlugin: (type: string) => {
    switch (type) {
      case "demo-editor":
        return { manifest: { name: "Demo Editor", tabBehavior: { identityField: "filePath" } } };
      case "demo-term":
        return { manifest: { name: "Demo Term", tabBehavior: {} } };
      case "demo-tool":
        return { manifest: { name: "Demo Tool", tabBehavior: { singleton: true } } };
      default:
        return undefined;
    }
  },
}));

/* ── 虚构夹具（硬约束 21） ── */

function makeTab(id: string): Tab {
  return { id, type: "view", label: `Demo ${id}`, dirty: false, pinned: true };
}

function makeTabState(tabId: string): TabState {
  const groupId = "grp-1";
  return {
    groups: [{ id: groupId, tabs: [makeTab(tabId)], activeTabId: tabId }],
    activeGroupId: groupId,
    root: { type: "leaf", groupId },
  };
}

/** 主窗 bounds 原点 0,0（TabBar 屏幕 rect = bounds + 视口 rect = 直接可命中）；脱出窗 x 偏移 1000 避开主窗 */
const MAIN_BOUNDS = { x: 0, y: 0, width: 800, height: 600 };
const DET_BOUNDS = { x: 1000, y: 0, width: 700, height: 500 };

function makeWindows(): WindowShellState[] {
  return [
    { windowId: "main", mode: "main", ready: true, tabState: makeTabState("tab-1"), bounds: MAIN_BOUNDS },
    { windowId: "det-1", mode: "detached", ready: true, tabState: makeTabState("tab-2"), bounds: DET_BOUNDS },
  ];
}

/* ── pool mock——壳侧订阅捕获 + 提示下发记录 ── */

let tabBarRectsCb: ((p: TabBarRectsPayload) => void) | null = null;
let dragPosCb: ((pos: ShellTabDragPosition) => void) | null = null;
let adsorbIndexCb: ((p: AdsorbIndexPayload) => void) | null = null;
const pushAdsorbHint = vi.fn();

function installPoolMock(): void {
  tabBarRectsCb = null;
  dragPosCb = null;
  adsorbIndexCb = null;
  pushAdsorbHint.mockClear();
  window.linkdesk = {
    pool: {
      onTabBarRects: (cb: (p: TabBarRectsPayload) => void) => {
        tabBarRectsCb = cb;
        return () => { tabBarRectsCb = null; };
      },
      onDragPosition: (cb: (pos: ShellTabDragPosition) => void) => {
        dragPosCb = cb;
        return () => { dragPosCb = null; };
      },
      // E5.8#46.10：吸附插入缝隙回传订阅（池→壳——壳存注册表供释放并窗落位）
      onAdsorbIndex: (cb: (p: AdsorbIndexPayload) => void) => {
        adsorbIndexCb = cb;
        return () => { adsorbIndexCb = null; };
      },
      pushAdsorbHint,
    },
  } as unknown as LinkDeskAPI;
}

/** 渲染 relocation hook + 填充 TabBar rects 注册表（主/脱出窗各一组，screen rect = bounds 原点 + 视口 rect） */
function setup() {
  installPoolMock();
  const deps: Omit<UseWindowRelocationDeps, "windows"> = {
    createWindow: vi.fn(),
    closeWindow: vi.fn(),
    updateTabState: vi.fn(),
    removeTab: vi.fn(() => makeTab("tab-1")),
    insertTab: vi.fn(),
  };
  const hook = renderHook(({ wins }) => useWindowRelocation({ ...deps, windows: wins }), {
    initialProps: { wins: makeWindows() },
  });
  tabBarRectsCb?.({ windowId: "main", rects: [{ groupId: "grp-1", left: 0, top: 0, width: 200, height: 30 }] });
  tabBarRectsCb?.({ windowId: "det-1", rects: [{ groupId: "grp-1", left: 0, top: 0, width: 200, height: 30 }] });
  return { hook };
}

/** E5.8#46.10 竖线游走共用前置：拖到 det-1 TabBar（source=main）→ 断言下发 viewport 提示 → 清 mock 计数 */
function dragToDetAndExpectHint(screenX: number, viewportX: number): void {
  dragPosCb?.({ tabId: "tab-1", screenX, screenY: 10, sourceWindowId: "main" });
  expect(pushAdsorbHint).toHaveBeenLastCalledWith({ groupId: "grp-1", viewportX, viewportY: 10 }, "det-1");
  pushAdsorbHint.mockClear();
}

describe("useWindowRelocation —— E5.8#44-C 吸附 live 高亮", () => {
  beforeEach(() => {
    installPoolMock();
  });

  it("跨窗命中目标窗 TabBar → 下发高亮提示（#46.10 携带 viewport——目标池算缝隙）", () => {
    setup();
    dragPosCb?.({ tabId: "tab-1", screenX: 100, screenY: 10, sourceWindowId: "det-1" });
    // main bounds 原点 (0,0) → viewport = 屏坐标 − bounds 原点 = (100, 10)
    expect(pushAdsorbHint).toHaveBeenCalledWith({ groupId: "grp-1", viewportX: 100, viewportY: 10 }, "main");
  });

  it("源窗排除——拖在源窗自己 TabBar 上空 → 非跨窗吸附，零提示", () => {
    setup();
    dragPosCb?.({ tabId: "tab-1", screenX: 100, screenY: 10, sourceWindowId: "main" });
    expect(pushAdsorbHint).not.toHaveBeenCalled();
  });

  it("拖回源窗（命中变 null）→ 清旧目标窗提示", () => {
    setup();
    dragToDetAndExpectHint(1100, 100); // det bounds 原点 (1000,0) → viewport = (100, 10)
    dragPosCb?.({ tabId: "tab-1", screenX: 100, screenY: 10, sourceWindowId: "main" });
    expect(pushAdsorbHint).toHaveBeenCalledWith({ groupId: null }, "det-1");
  });

  it("Esc 取消拖拽 → 清旧目标窗提示", () => {
    setup();
    dragPosCb?.({ tabId: "tab-1", screenX: 1100, screenY: 10, sourceWindowId: "main" });
    pushAdsorbHint.mockClear();
    dragPosCb?.({ tabId: "tab-1", screenX: 0, screenY: 0, canceled: true, sourceWindowId: "main" });
    expect(pushAdsorbHint).toHaveBeenCalledWith({ groupId: null }, "det-1");
  });

  it("目标窗被关闭（窗口列表增删）→ 清全部吸附提示防泄漏", () => {
    const { hook } = setup();
    dragToDetAndExpectHint(1100, 100);
    hook.rerender({ wins: [makeWindows()[0]] });
    expect(pushAdsorbHint).toHaveBeenCalledWith({ groupId: null }, "det-1");
  });

  // ── E5.8#46.10：竖线游走——目标不变时 viewport 位移 ≥2px 重下发（竖线随光标移动）──
  it("竖线游走——组内横移 ≥2px 触发重下发（viewportX 更新）", () => {
    setup();
    dragToDetAndExpectHint(1100, 100);
    dragPosCb?.({ tabId: "tab-1", screenX: 1105, screenY: 10, sourceWindowId: "main" });
    expect(pushAdsorbHint).toHaveBeenLastCalledWith({ groupId: "grp-1", viewportX: 105, viewportY: 10 }, "det-1");
  });

  it("竖线游走——组内横移 <2px 免 IPC（settled 去抖，竖线没动不发）", () => {
    setup();
    dragToDetAndExpectHint(1100, 100);
    dragPosCb?.({ tabId: "tab-1", screenX: 1101, screenY: 10, sourceWindowId: "main" }); // diff 1 < 2
    expect(pushAdsorbHint).not.toHaveBeenCalled();
  });

  // ── E5.8#46.10：目标池回传缝隙 → 释放并窗精确落位（竖线指哪插哪）──
  it("insertIndex 回传 → releaseOutside 并窗落位竖线缝隙（非组尾追加）", () => {
    installPoolMock();
    const detState: TabState = {
      groups: [{ id: "grp-1", tabs: [makeTab("t-a"), makeTab("t-b"), makeTab("t-c")], activeTabId: "t-b" }],
      activeGroupId: "grp-1",
      root: { type: "leaf", groupId: "grp-1" },
    };
    const updateTabState = vi.fn();
    const deps: Omit<UseWindowRelocationDeps, "windows"> = {
      createWindow: vi.fn(),
      closeWindow: vi.fn(),
      updateTabState,
      removeTab: vi.fn(() => makeTab("tab-1")),
      insertTab: vi.fn(),
    };
    const detWin: WindowShellState = { windowId: "det-1", mode: "detached", ready: true, tabState: detState, bounds: DET_BOUNDS };
    const hook = renderHook(({ wins }) => useWindowRelocation({ ...deps, windows: wins }), {
      initialProps: { wins: [makeWindows()[0], detWin] },
    });
    tabBarRectsCb?.({ windowId: "main", rects: [{ groupId: "grp-1", left: 0, top: 0, width: 200, height: 30 }] });
    tabBarRectsCb?.({ windowId: "det-1", rects: [{ groupId: "grp-1", left: 0, top: 0, width: 200, height: 30 }] });

    dragPosCb?.({ tabId: "tab-1", screenX: 1100, screenY: 10, sourceWindowId: "main" }); // 命中 det-1
    adsorbIndexCb?.({ windowId: "det-1", groupId: "grp-1", insertIndex: 1 });
    hook.result.current.releaseOutside("tab-1", 1100, 10, "main");
    // 3 tabs + insertIndex=1 → splice 中插（有 index 才能进 t-a 与 t-b 之间；无 index 则 push 末尾）
    expect(updateTabState).toHaveBeenCalledWith(
      "det-1",
      expect.objectContaining({
        groups: [expect.objectContaining({
          tabs: ["t-a", "tab-1", "t-b", "t-c"].map((id) => expect.objectContaining({ id })),
        })],
      }),
    );
  });
});

/* ── E5.8#46.1 合并去重——跨窗口 merge 目标组身份去重（VS Code 组内每资源唯一）── */

/** demo-editor（identityField=filePath）——资源身份标签 */
function editorTab(id: string, filePath: string): Tab {
  return { id, type: "demo-editor", label: `Demo ${id}`, filePath, dirty: false, pinned: true };
}

/** demo-term（identityField=null）——多实例类型 */
function termTab(id: string): Tab {
  return { id, type: "demo-term", label: `Demo ${id}`, dirty: false, pinned: true };
}

/** demo-tool（singleton）——类型级唯一 */
function toolTab(id: string): Tab {
  return { id, type: "demo-tool", label: `Demo ${id}`, dirty: false, pinned: true };
}

/** 单组 TabState——groupId 恒 "grp-1" */
function groupTabState(tabs: Tab[]): TabState {
  const groupId = "grp-1";
  return { groups: [{ id: groupId, tabs, activeTabId: tabs[0].id }], activeGroupId: groupId, root: { type: "leaf", groupId } };
}

/** 渲染 relocation + 主窗 target 固定（det-1 持有被拖 tab，经 mergeTabToMain 合并到 main）——返回 hook + mocks */
function setupMerge(mainState: TabState, detTab: Tab) {
  const insertTab = vi.fn();
  const closeWindow = vi.fn();
  const updateTabState = vi.fn();
  const deps: Omit<UseWindowRelocationDeps, "windows"> = {
    createWindow: vi.fn(),
    closeWindow,
    updateTabState,
    removeTab: vi.fn(() => makeTab("tab-1")), // main 分支摘除——本组测试源窗全是 detached，不触发
    insertTab,
  };
  const mainWin: WindowShellState = { windowId: "main", mode: "main", ready: true, tabState: mainState, bounds: MAIN_BOUNDS };
  const detWin: WindowShellState = { windowId: "det-1", mode: "detached", ready: true, tabState: groupTabState([detTab]), bounds: DET_BOUNDS };
  const hook = renderHook(() => useWindowRelocation({ ...deps, windows: [mainWin, detWin] }));
  return { hook, insertTab, closeWindow, updateTabState };
}

describe("useWindowRelocation —— E5.8#46.1 合并去重", () => {
  it("目标组已有同文件 → 消除被拖的（不插入，源窗照常摘除自灭）", () => {
    const { hook, insertTab, closeWindow } = setupMerge(groupTabState([editorTab("t-ed", "/a/hello.c")]), editorTab("tab-1", "/a/hello.c"));
    hook.result.current.mergeTabToMain("tab-1");
    expect(insertTab).not.toHaveBeenCalled(); // 被消除
    expect(closeWindow).toHaveBeenCalledWith("det-1"); // 源窗摘空自灭（既有行为不变）
  });

  it("目标组无同文件 → 正常插入（并回主窗）", () => {
    const { hook, insertTab } = setupMerge(groupTabState([editorTab("t-ed", "/a/hello.c")]), editorTab("tab-1", "/b/world.c"));
    hook.result.current.mergeTabToMain("tab-1");
    expect(insertTab).toHaveBeenCalledWith(expect.objectContaining({ id: "tab-1", type: "demo-editor", filePath: "/b/world.c" }), undefined, undefined);
  });

  it("多实例类型（identityField=null）→ 不去重，两个 terminal 并存", () => {
    const { hook, insertTab } = setupMerge(groupTabState([termTab("t-1")]), termTab("tab-1"));
    hook.result.current.mergeTabToMain("tab-1");
    expect(insertTab).toHaveBeenCalledWith(expect.objectContaining({ id: "tab-1", type: "demo-term" }), undefined, undefined);
  });

  it("singleton 类型 → 组内已有同 type 即消除", () => {
    const { hook, insertTab } = setupMerge(groupTabState([toolTab("t-tool")]), toolTab("tab-1"));
    hook.result.current.mergeTabToMain("tab-1");
    expect(insertTab).not.toHaveBeenCalled();
  });

  it("去重范围 = 目标组——同窗另一组有同文件不阻断插入（分屏两栏各放一个允许）", () => {
    const mainState: TabState = {
      groups: [
        { id: "grp-a", tabs: [editorTab("t-ed1", "/a/hello.c")], activeTabId: "t-ed1" },
        { id: "grp-b", tabs: [editorTab("t-ed2", "/b/world.c")], activeTabId: "t-ed2" },
      ],
      activeGroupId: "grp-b",
      root: { type: "branch", direction: "horizontal", children: [{ type: "leaf", groupId: "grp-a" }, { type: "leaf", groupId: "grp-b" }], sizes: [0.5, 0.5] },
    };
    // det 拖入的同文件 hello.c 在 grp-a——目标组 activeGroupId=grp-b 没有 → 插入
    const { hook, insertTab } = setupMerge(mainState, editorTab("tab-1", "/a/hello.c"));
    hook.result.current.mergeTabToMain("tab-1");
    expect(insertTab).toHaveBeenCalledWith(expect.objectContaining({ id: "tab-1", type: "demo-editor", filePath: "/a/hello.c" }), undefined, undefined);
  });
});
