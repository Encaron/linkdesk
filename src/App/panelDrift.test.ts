/**
 * usePanelDrift——面板脱出到独立窗口（E5.8#45）测试。
 * 覆盖：detachPanel 无 drift 窗 → 建 mode:"drift" 窗（空 tabState + 主窗级联 bounds + 主进程建窗）；
 *       已有 drift 窗 → 幂等 no-op（面板独占——面板恒只在一个窗口渲染）。
 * 测试夹具全用虚构值（硬约束 21：windowId 用 "main"/"drift-1" 模式域 id，非真实插件）。
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePanelDrift } from "./panelDrift";
import type { WindowShellState } from "./windows";
import type { TabState } from "../hooks/useTabManager";

const EMPTY: TabState = { groups: [], activeGroupId: "", root: { type: "leaf", groupId: "" } };

function makeWindows(withDrift = false): WindowShellState[] {
  const wins: WindowShellState[] = [
    { windowId: "main", mode: "main", ready: true, tabState: EMPTY, bounds: { x: 0, y: 0, width: 800, height: 600 } },
  ];
  if (withDrift) {
    wins.push({ windowId: "drift-1", mode: "drift", ready: false, tabState: EMPTY });
  }
  return wins;
}

function setup(withDrift = false) {
  const createWindow = vi.fn();
  const hook = renderHook(({ wins }) => usePanelDrift({ windows: wins, createWindow }), {
    initialProps: { wins: makeWindows(withDrift) },
  });
  return { hook, createWindow };
}

describe("usePanelDrift —— E5.8#45", () => {
  it("无 drift 窗 → detachPanel 建 mode:drift 窗（空 tabState + 主窗级联 bounds + 主进程建窗）", () => {
    const { hook, createWindow } = setup(false);
    hook.result.current.detachPanel();
    expect(createWindow).toHaveBeenCalledTimes(1);
    const [windowId, tabState, bounds, mode] = createWindow.mock.calls[0];
    expect(typeof windowId).toBe("string"); // crypto.randomUUID 壳生成
    expect(tabState).toEqual(EMPTY); // 漂移面板窗恒空（主区空占位 I9-13）
    expect(bounds).toEqual({ x: 40, y: 40, width: 800, height: 600 }); // 主窗级联偏移（+40）
    expect(mode).toBe("drift");
  });

  it("已有 drift 窗 → detachPanel 幂等 no-op（面板独占——不重复建）", () => {
    const { hook, createWindow } = setup(true);
    hook.result.current.detachPanel();
    expect(createWindow).not.toHaveBeenCalled();
  });
});
