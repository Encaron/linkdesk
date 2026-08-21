/**
 * FloatingPanelService 测试——E5.8#37 悬浮面板单实例桥 + 语言切换文案重推（2026-08-22 用户点修③）。
 * 覆盖：pushPanel 存 open DTO 底稿 / refreshPanelText 重推 refresh:true + 新标题/动作且不 settle promise /
 * 面板未开 → refreshPanelText no-op 零推送 / closePanel、handleFloatingPanelAction 后底稿失效（重推 no-op）/
 * 单实例语义（I8-10：同 viewId 聚焦复用 pending / 异 viewId 替换 settle 'replaced'）。
 * 渲染器经 registerFloatingPanelRenderer 挂 mock——断言 DTO 形状（显示文本铁律：标题/动作已是壳侧 t() 结果，池原样透传）。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerFloatingPanelRenderer,
  pushPanel,
  closePanel,
  refreshPanelText,
  handleFloatingPanelAction,
} from "./FloatingPanelService";
import type { PoolFloatingPanelData } from "../../types/pool/poolFloatingPanel";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

function sampleOptions() {
  return {
    viewId: "settings",
    title: "设置",
    pluginId: "file-tree",
    renderPath: "/@fs/plugins/builtin/file-tree/src/views/FoldersView.tsx",
    actions: [
      { id: "maximize", label: "最大化", icon: "maximize", toggledIcon: "restore", toggledLabel: "还原" },
      { id: "close", label: "关闭", icon: "close" },
    ],
  };
}

beforeEach(() => {
  // 模块级单实例态（_currentViewId/_currentOpen/_pending）跨用例残留——closePanel() 归零（顺带推 open:false → 清 mock）
  registerFloatingPanelRenderer((data) => pushMock(data));
  closePanel();
  pushMock.mockClear();
});

function lastPush(): Extract<PoolFloatingPanelData, { open: true }> {
  return pushMock.mock.calls[pushMock.mock.calls.length - 1][0] as Extract<PoolFloatingPanelData, { open: true }>;
}

describe("refreshPanelText（语言切换文案重推）", () => {
  it("面板开着 → 重推 refresh:true + 新标题/动作，身份/几何字段不变，不 settle promise", async () => {
    const reason = pushPanel(sampleOptions());
    pushMock.mockClear(); // 清 pushPanel 的首次推

    refreshPanelText("Settings", [{ id: "close", label: "Close", icon: "close" }]);

    const pushed = lastPush();
    expect(pushed.open).toBe(true);
    expect(pushed.viewId).toBe("settings"); // 身份不变（refresh 不是替换）
    expect(pushed.pluginId).toBe("file-tree");
    expect(pushed.renderPath).toBe(sampleOptions().renderPath);
    expect(pushed.title).toBe("Settings");
    expect(pushed.actions).toEqual([{ id: "close", label: "Close", icon: "close" }]);
    expect(pushed.refresh).toBe(true); // 池据此跳过焦点获取

    // 不 settle promise——面板仍打开，consumer await 不到原因
    let settled = false;
    void reason.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it("面板未开 → no-op 零推送", () => {
    refreshPanelText("Settings", [{ id: "close", label: "Close", icon: "close" }]);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("closePanel 后底稿失效——refreshPanelText no-op（面板已关，重推无意义）", () => {
    pushPanel(sampleOptions());
    closePanel();
    pushMock.mockClear();

    refreshPanelText("Settings", [{ id: "close", label: "Close", icon: "close" }]);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("handleFloatingPanelAction（open-in/close）后底稿失效——refreshPanelText no-op", async () => {
    const reason = pushPanel(sampleOptions());
    handleFloatingPanelAction("close");
    pushMock.mockClear();

    refreshPanelText("Settings", [{ id: "close", label: "Close", icon: "close" }]);
    expect(pushMock).not.toHaveBeenCalled();
    await expect(reason).resolves.toBe("close");
  });
});

describe("单实例语义（I8-10）", () => {
  it("同 viewId 再 push → 复用现有 promise（聚焦 no-op），不重复推 DTO", async () => {
    const r1 = pushPanel(sampleOptions());
    pushMock.mockClear();

    const r2 = pushPanel(sampleOptions());
    expect(r2).toBe(r1); // 同一 promise——关闭时两个 consumer 都收到原因
    expect(pushMock).not.toHaveBeenCalled(); // 已开同面板 → 零推送
    closePanel(); // 关闭 → settle，同 promise 两方都收到
    await expect(r2).resolves.toBe("programmatic");
  });

  it("异 viewId 再 push → 替换：旧 promise settle 'replaced'，新面板推送", async () => {
    const oldReason = pushPanel(sampleOptions());
    pushMock.mockClear();

    const newReason = pushPanel({ ...sampleOptions(), viewId: "terminal", title: "终端", pluginId: "terminal" });
    await expect(oldReason).resolves.toBe("replaced"); // 旧 consumer 不永远挂起
    expect(lastPush().viewId).toBe("terminal"); // 新面板推送给池
    expect(newReason).not.toBe(oldReason);
  });
});
