/**
 * useWindowRelocation——窗口间标签页搬迁（E5.8#44）——C6 吸附 live 高亮命中/提示下发补测。
 * 测试夹具全用虚构值（硬约束 21：demo-* / tab-*，不指真实插件/文案）。
 * 覆盖：跨窗命中→下发高亮；源窗排除（窗内拖拽非跨窗吸附）；拖回源窗/取消→清旧目标窗提示；窗口增删→清全部提示。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWindowRelocation, type UseWindowRelocationDeps } from "./windowRelocation";
import type { TabState, Tab } from "../hooks/useTabManager";
import type { WindowShellState } from "./windows";
import type { ShellTabDragPosition, TabBarRectsPayload } from "../core/types/ipc/poolActions";
import type { LinkDeskAPI } from "../core/api/linkdesk-api";

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
const pushAdsorbHint = vi.fn();

function installPoolMock(): void {
  tabBarRectsCb = null;
  dragPosCb = null;
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

describe("useWindowRelocation —— E5.8#44-C 吸附 live 高亮", () => {
  beforeEach(() => {
    installPoolMock();
  });

  it("跨窗命中目标窗 TabBar → 下发高亮提示", () => {
    setup();
    dragPosCb?.({ tabId: "tab-1", screenX: 100, screenY: 10, sourceWindowId: "det-1" });
    expect(pushAdsorbHint).toHaveBeenCalledWith({ groupId: "grp-1" }, "main");
  });

  it("源窗排除——拖在源窗自己 TabBar 上空 → 非跨窗吸附，零提示", () => {
    setup();
    dragPosCb?.({ tabId: "tab-1", screenX: 100, screenY: 10, sourceWindowId: "main" });
    expect(pushAdsorbHint).not.toHaveBeenCalled();
  });

  it("拖回源窗（命中变 null）→ 清旧目标窗提示", () => {
    setup();
    dragPosCb?.({ tabId: "tab-1", screenX: 1100, screenY: 10, sourceWindowId: "main" });
    expect(pushAdsorbHint).toHaveBeenLastCalledWith({ groupId: "grp-1" }, "det-1");
    pushAdsorbHint.mockClear();
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
    dragPosCb?.({ tabId: "tab-1", screenX: 1100, screenY: 10, sourceWindowId: "main" });
    expect(pushAdsorbHint).toHaveBeenLastCalledWith({ groupId: "grp-1" }, "det-1");
    pushAdsorbHint.mockClear();
    hook.rerender({ wins: [makeWindows()[0]] });
    expect(pushAdsorbHint).toHaveBeenCalledWith({ groupId: null }, "det-1");
  });
});
