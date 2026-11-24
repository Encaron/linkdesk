/**
 * 脱出窗恢复的回归（2026-11-25 · 用户实机白屏）。
 *
 * 用户路径：把「设置」拖成独立 OS 窗 → 插件更新后点 [立即重启]（或在该窗 F5）
 *   ⇒ 那扇窗回来是**白的**，主窗正常。
 *
 * 根因：脱出窗的持久化只记 `windowId + bounds`，恢复时 shell 给 `emptyTabState()`
 *   ——窗在、标签页全丢 ⇒ 池没有内容可画。
 *
 * 本文件钉三件事：
 *   ① 序列化带 `tabs`（与主窗同一份 `LayoutData` 形状）；
 *   ② bounds 缺失的窗也落盘（用户没拖过窗 ≠ 这扇窗不存在）；
 *   ③ 反序列化走**主窗同款** reducer，标签/激活组原样回来；空数据回落空窗（不补欢迎页）。
 */

import { describe, expect, it } from "vitest";
import type { TabState } from "../../hooks/useTabManager";
import type { WindowShellState } from "../windows";
import { serializeDetachedWindows } from "../persistence";
import { restoredDetachedTabState } from "./windowHost";

const tabState: TabState = {
  groups: [
    {
      id: "g1",
      tabs: [
        { id: "t1", type: "plugin", label: "设置", pluginId: "settings", dirty: false },
        { id: "t2", type: "plugin", label: "快捷键", pluginId: "settings", dirty: false, pinned: true },
      ],
      activeTabId: "t2",
    },
  ],
  activeGroupId: "g1",
  root: { type: "leaf", groupId: "g1" },
};

const windows: WindowShellState[] = [
  { windowId: "main", mode: "main", ready: true, tabState: { groups: [], activeGroupId: "", root: { type: "leaf", groupId: "" } } },
  { windowId: "ws-2", mode: "detached", ready: true, tabState, bounds: { x: 100, y: 80, width: 900, height: 600 } },
  { windowId: "ws-3", mode: "detached", ready: true, tabState },
  { windowId: "drift-1", mode: "drift", ready: true, tabState },
];

describe("serializeDetachedWindows", () => {
  it("只记脱出窗（主窗/漂移面板窗不进账），且带 tabs 快照", () => {
    const out = serializeDetachedWindows(windows);
    expect(out.map((d) => d.windowId)).toEqual(["ws-2", "ws-3"]);
    expect(out[0].tabs?.groups[0].tabs.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(out[0].tabs?.groups[0].activeTabId).toBe("t2");
  });

  it("bounds 缺失也落盘（旧实现按 bounds 过滤 ⇒ 没拖过窗的那扇直接消失）", () => {
    const out = serializeDetachedWindows(windows);
    expect(out[1]).toEqual({ windowId: "ws-3", tabs: expect.any(Object) });
    expect(out[1].bounds).toBeUndefined();
  });
});

describe("restoredDetachedTabState（round-trip）", () => {
  it("标签页/激活组/固定态原样回来", () => {
    const d = serializeDetachedWindows(windows)[0];
    const restored = restoredDetachedTabState(d.tabs);
    expect(restored.groups).toHaveLength(1);
    expect(restored.groups[0].activeTabId).toBe("t2");
    const tabs = restored.groups[0].tabs;
    expect(tabs.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(tabs[1].pinned).toBe(true);
    expect(tabs[0].pluginId).toBe("settings");
    expect(restored.activeGroupId).toBe("g1");
  });

  it("空/缺省快照 ⇒ 空窗（脱出窗不补欢迎页）", () => {
    expect(restoredDetachedTabState(undefined).groups).toEqual([]);
    expect(restoredDetachedTabState({ groups: [], activeGroupId: "", root: { type: "leaf", groupId: "" } }).groups).toEqual([]);
  });
});
