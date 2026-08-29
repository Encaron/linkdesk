/**
 * LayoutService 布局持久化测试。
 * E5.8#31：面板显隐（visible）往返——Ctrl+J 关面板 → 重启恢复显隐态（验收点 2）。
 * E5.8#36.9：面板位置/对齐（edge/align/width）+ 侧栏边（sidebar.edge）往返。
 *
 * mock StorageService（内存 Map）——隔离文件 I/O，聚焦 LayoutService 缓存 + 持久化读写。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  return { store };
});

vi.mock("../configuration/StorageService", () => ({
  read: vi.fn(async (key: string) => store.get(key) ?? null),
  readSync: vi.fn((key: string) => store.get(key) ?? null), // E5.8#71：initLayoutService 保底显式 readSync 优先
  write: vi.fn(async (key: string, data: unknown) => { store.set(key, data); }),
  writeSync: vi.fn(),
}));

import { getPanelLayout, savePanelLayout, getSidebarLayout, saveSidebarLayout, getDetachedWindows, saveDetachedWindows, initLayoutService, clearLayoutCache } from "./LayoutService";

describe("LayoutService 面板布局持久化（E5.8#31 visible + E5.8#36.9 edge/align/width）", () => {
  beforeEach(() => {
    store.clear();
    clearLayoutCache();
  });

  it("缺省（无持久化）时 getPanelLayout 返回 undefined", () => {
    expect(getPanelLayout()).toBeUndefined();
  });

  it("savePanelLayout 带 visible:false → 重启（initLayoutService）读回显隐态", async () => {
    await savePanelLayout({ height: 300, visible: false });
    await initLayoutService();
    expect(getPanelLayout()).toEqual({ height: 300, visible: false });
  });

  it("savePanelLayout 带 activeViewId + visible → 读回完整状态", async () => {
    await savePanelLayout({ height: 240, activeViewId: "terminal", visible: true });
    await initLayoutService();
    expect(getPanelLayout()).toEqual({ height: 240, activeViewId: "terminal", visible: true });
  });

  it("savePanelLayout 带 edge/align/width → 重启读回位置/对齐/轴尺寸（E5.8#36.9）", async () => {
    await savePanelLayout({ height: 200, edge: "right", align: "justify", width: 320, activeViewId: "output", visible: true });
    await initLayoutService();
    expect(getPanelLayout()).toEqual({ height: 200, edge: "right", align: "justify", width: 320, activeViewId: "output", visible: true });
  });

  it("旧状态仅 height → edge/align/width 缺省不落盘（向后兼容：重启归 bottom/center）", async () => {
    await savePanelLayout({ height: 240, visible: true });
    await initLayoutService();
    const p = getPanelLayout();
    expect(p?.edge).toBeUndefined();
    expect(p?.align).toBeUndefined();
    expect(p?.width).toBeUndefined();
  });
});

describe("LayoutService 侧栏布局持久化（E5.8#36.9 sidebar.edge）", () => {
  beforeEach(() => {
    store.clear();
    clearLayoutCache();
  });

  it("缺省（无持久化）时 getSidebarLayout 返回 undefined", () => {
    expect(getSidebarLayout()).toBeUndefined();
  });

  it("saveSidebarLayout 带 edge → 重启读回侧栏边（换边恢复）", async () => {
    await saveSidebarLayout({ edge: "right" });
    await initLayoutService();
    expect(getSidebarLayout()).toEqual({ edge: "right" });
  });
});

describe("LayoutService 脱出窗持久化（E5.8#43-3 A6/I9-14 bounds 落盘 + I9-15 重启恢复）", () => {
  beforeEach(() => {
    store.clear();
    clearLayoutCache();
  });

  it("缺省（从未脱出）时 getDetachedWindows 返回空数组", () => {
    expect(getDetachedWindows()).toEqual([]);
  });

  it("saveDetachedWindows 落盘 → 重启（initLayoutService）读回窗口清单（bounds 恢复源）", async () => {
    await saveDetachedWindows([
      { windowId: "w2", bounds: { x: 120, y: 80, width: 900, height: 600 } },
      { windowId: "w3", bounds: { x: 640, y: 240, width: 720, height: 480 } },
    ]);
    await initLayoutService();
    expect(getDetachedWindows()).toEqual([
      { windowId: "w2", bounds: { x: 120, y: 80, width: 900, height: 600 } },
      { windowId: "w3", bounds: { x: 640, y: 240, width: 720, height: 480 } },
    ]);
  });

  it("saveDetachedWindows 整表替换——关闭某窗后清单不再含它（壳移除 → 重启不恢复已关窗）", async () => {
    await saveDetachedWindows([
      { windowId: "w2", bounds: { x: 120, y: 80, width: 900, height: 600 } },
      { windowId: "w3", bounds: { x: 640, y: 240, width: 720, height: 480 } },
    ]);
    await saveDetachedWindows([{ windowId: "w2", bounds: { x: 200, y: 100, width: 800, height: 500 } }]);
    await initLayoutService();
    expect(getDetachedWindows()).toEqual([{ windowId: "w2", bounds: { x: 200, y: 100, width: 800, height: 500 } }]);
  });
});
