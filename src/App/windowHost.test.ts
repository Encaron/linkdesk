/**
 * windowHost 纯函数测试——mapResourceAcrossWindows（E5.8#46.2 跨窗资源广播映射）。
 * 纯函数零 React——测试只验映射语义：main 跳过 / 脱出窗应用 / 空窗收集 / 无变化 bailout。
 * 虚构 fixture：demo-view / E:/demo/* 路径。
 */

import { describe, it, expect, vi } from "vitest";
import { mapResourceAcrossWindows } from "./windowHost";
import type { TabState } from "../hooks/useTabManager";
import type { WindowShellState, WindowMode } from "./windows";

function makeState(tabId: string, label = "Alpha", sourceId = "E:/demo/a.txt"): TabState {
  return {
    groups: [{
      id: "g-demo",
      tabs: [{ id: tabId, type: "demo-view", label, sourceId, filePath: sourceId, dirty: false, pinned: true }],
      activeTabId: tabId,
    }],
    activeGroupId: "g-demo",
    root: { type: "leaf", groupId: "g-demo" },
  };
}

function makeWindow(windowId: string, mode: WindowMode, tabState: TabState): WindowShellState {
  return { windowId, mode, ready: true, tabState };
}

describe("mapResourceAcrossWindows（E5.8#46.2）", () => {
  it("main 窗跳过 reduce——脱出窗才应用（主窗归 useTabManager 真相源）", () => {
    const main = makeWindow("main", "main", makeState("m1"));
    const det = makeWindow("det-1", "detached", makeState("t1"));
    const reduce = vi.fn((ts: TabState) => ts);
    const r = mapResourceAcrossWindows([main, det], reduce);
    expect(reduce).toHaveBeenCalledTimes(1);
    expect(r.windows[0]).toBe(main); // main 原引用（未触碰）
    expect(r.emptyWindows).toEqual([]);
  });

  it("脱出窗 reduce 应用 → 新窗口对象 + 其余窗口原引用保持", () => {
    const main = makeWindow("main", "main", makeState("m1"));
    const det = makeWindow("det-1", "detached", makeState("t1"));
    const next = makeState("t1", "Gamma"); // label 迁移
    const r = mapResourceAcrossWindows([main, det], () => next);
    expect(r.windows[0]).toBe(main);
    expect(r.windows[1]).not.toBe(det); // 更新窗是新对象
    expect(r.windows[1].tabState).toBe(next);
    expect(r.emptyWindows).toEqual([]);
  });

  it("reduce 后空窗 → 收 emptyWindows + 窗口原引用不写回（壳 closeWindow 收尾 I9-8）", () => {
    const det = makeWindow("det-1", "detached", makeState("t1"));
    const empty: TabState = { groups: [], activeGroupId: "", root: { type: "leaf", groupId: "" } };
    const r = mapResourceAcrossWindows([det], () => empty);
    expect(r.emptyWindows).toEqual(["det-1"]);
    expect(r.windows[0]).toBe(det); // 空窗不写回，原引用保留
  });

  it("reduce 后空组保留（单面板末 tab 删）→ 也算空窗", () => {
    const det = makeWindow("det-1", "detached", makeState("t1"));
    const emptyGroup: TabState = {
      groups: [{ id: "g-demo", tabs: [], activeTabId: "" }],
      activeGroupId: "g-demo",
      root: { type: "leaf", groupId: "g-demo" },
    };
    const r = mapResourceAcrossWindows([det], () => emptyGroup);
    expect(r.emptyWindows).toEqual(["det-1"]);
  });

  it("全窗无变化 → 返回原 windows 引用（React bailout——#46.12 死循环止血）", () => {
    const main = makeWindow("main", "main", makeState("m1"));
    const det = makeWindow("det-1", "detached", makeState("t1"));
    const windows = [main, det];
    const reduce = (ts: TabState) => ts; // 恒返回原引用
    const r = mapResourceAcrossWindows(windows, reduce);
    expect(r.windows).toBe(windows); // 数组原引用（setWindows 不触发重渲染）
    expect(r.emptyWindows).toEqual([]);
  });

  it("drift 窗（恒空 tabState）reduce 空 state → 无变化不误收 emptyWindows", () => {
    const drift = makeWindow("drift-1", "drift", { groups: [], activeGroupId: "", root: { type: "leaf", groupId: "" } });
    const r = mapResourceAcrossWindows([drift], (ts) => ts);
    expect(r.emptyWindows).toEqual([]);
    expect(r.windows[0]).toBe(drift);
  });
});
