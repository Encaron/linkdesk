/**
 * LayoutService 布局持久化测试。
 * E5.8#31：面板显隐（visible）往返——Ctrl+J 关面板 → 重启恢复显隐态（验收点 2）。
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
  write: vi.fn(async (key: string, data: unknown) => { store.set(key, data); }),
  writeSync: vi.fn(),
}));

import { getPanelLayout, savePanelLayout, initLayoutService, clearLayoutCache } from "./LayoutService";

describe("LayoutService 面板布局持久化（E5.8#31 visible）", () => {
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
});
