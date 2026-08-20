/**
 * resolvePanelReveal 测试——E5.8#34.5 linkdesk.panel.reveal 通用 API 壳侧寻址/恢复可见。
 * 覆盖：声明寻址（仅 panel 容器）→ 返回所在容器 / 隐藏视图自动恢复可见（setVisible true 落盘）/
 * 无贡献插件（viewId 不在 panel 容器）→ null no-op 不崩 / 空容器跳过。
 * ViewContainerService mock 共享于 viewContainerMocks.ts（#34.5 归一化去重）。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getViewContainersMock, getViewsMock, setVisibleMock, seedViewContainerMocks } from "./viewContainerMocks";

import { resolvePanelReveal } from "./panelReveal";

describe("resolvePanelReveal（E5.8#34.5 panel.reveal 寻址）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedViewContainerMocks();
  });

  it("可见视图——仅返回所在容器，不调 setVisible", () => {
    const r = resolvePanelReveal("terminal");
    expect(r).toEqual({ containerId: "panel-tools" });
    expect(setVisibleMock).not.toHaveBeenCalled();
  });

  it("隐藏视图——自动恢复可见（setVisible true，落盘 hiddenViews）+ 返回容器", () => {
    const r = resolvePanelReveal("output");
    expect(r).toEqual({ containerId: "panel-main" });
    expect(setVisibleMock).toHaveBeenCalledWith("panel-main", "output", true);
  });

  it("无贡献插件（viewId 不在任何 panel 容器）→ null，no-op 不崩", () => {
    // sidebar 视图 / 从未注册的 id——一律 null（声明寻址仅 location:"panel"）
    expect(resolvePanelReveal("sidebar-view")).toBeNull();
    expect(resolvePanelReveal("never-registered")).toBeNull();
    expect(setVisibleMock).not.toHaveBeenCalled();
  });

  it("空容器（无视图）跳过——view 只在非空容器中查找", () => {
    // 覆盖种子：插入空容器（无视图）验证跳过逻辑
    getViewContainersMock.mockReturnValue([
      { id: "panel-empty", title: "空容器", location: "panel" },
      { id: "panel-main", title: "面板", location: "panel" },
    ]);
    getViewsMock.mockImplementation((cid: string) => (cid === "panel-empty" ? [] : [{ id: "v1", title: "唯一" }]));
    expect(resolvePanelReveal("v1")).toEqual({ containerId: "panel-main" });
    expect(setVisibleMock).not.toHaveBeenCalled();
  });
});
