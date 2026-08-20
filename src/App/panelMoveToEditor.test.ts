/**
 * movePanelViewToEditor 测试——E5.8#35.5 linkdesk.panel.moveToEditor 通用 API 壳侧升级逻辑。
 * 覆盖：可见视图升级主区标签页（createTab 活动 group 尾部 + tab:focused + 面板内移除 setVisible false）/
 * 无贡献插件（viewId 不在 panel 容器）→ no-op 不崩 / 视图无 _pluginId → no-op /
 * createTab 失败（空串）→ 保留面板视图（不 setVisible）。
 * ViewContainerService mock 共享于 viewContainerMocks.ts（#34.5 归一化去重）；shellEvents 独立 mock。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getViewsMock, setVisibleMock, seedViewContainerMocks } from "./viewContainerMocks";

vi.mock("../core/react/events/ShellEvents", () => ({
  shellEvents: {
    on: vi.fn(() => () => {}),
    emit: vi.fn(),
  },
}));

import { movePanelViewToEditor } from "./panelMoveToEditor";
import { shellEvents } from "../core/react/events/ShellEvents";

describe("movePanelViewToEditor（E5.8#35.5 panel.moveToEditor 升级）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedViewContainerMocks();
  });

  it("可见视图——createTab 活动 group 尾部（sourceId=viewId + label=title）+ tab:focused + 面板内移除", () => {
    const createTab = vi.fn((_type: string, _opts?: unknown) => "t1");
    movePanelViewToEditor("terminal", createTab as never);
    // 升级 = openTab 同路径——createTab 传 pluginId（_pluginId）+ sourceId/label
    expect(createTab).toHaveBeenCalledWith("terminal", { sourceId: "terminal", label: "终端" });
    // 同步 activeEditor（pool createTab 同款 Bug A 教训——tab:focused 驱动 when 过滤）
    expect(shellEvents.emit).toHaveBeenCalledWith("tab:focused", { pluginId: "terminal", tabId: "t1" });
    // 面板内移除——setVisible false 落盘 hiddenViews（与 reveal 恢复可见对称）
    expect(setVisibleMock).toHaveBeenCalledWith("panel-tools", "terminal", false);
  });

  it("无贡献插件（viewId 不在任何 panel 容器）→ no-op 不崩", () => {
    const createTab = vi.fn((_type: string, _opts?: unknown) => "t1");
    movePanelViewToEditor("never-registered", createTab as never);
    expect(createTab).not.toHaveBeenCalled();
    expect(shellEvents.emit).not.toHaveBeenCalled();
    expect(setVisibleMock).not.toHaveBeenCalled();
  });

  it("视图无归属插件（loader 未附挂 _pluginId）→ no-op 不崩", () => {
    // 覆盖种子：视图无 _pluginId（理论不达，防御性）——无法建标签页
    getViewsMock.mockImplementation((cid: string) =>
      cid === "panel-main" ? [{ id: "orphan", title: "孤儿" }] : [],
    );
    const createTab = vi.fn((_type: string, _opts?: unknown) => "t1");
    movePanelViewToEditor("orphan", createTab as never);
    expect(createTab).not.toHaveBeenCalled();
    expect(shellEvents.emit).not.toHaveBeenCalled();
    expect(setVisibleMock).not.toHaveBeenCalled();
  });

  it("createTab 失败（返回空串）→ 保留面板视图（不 setVisible）", () => {
    const createTab = vi.fn((_type: string, _opts?: unknown) => "");
    movePanelViewToEditor("terminal", createTab as never);
    expect(shellEvents.emit).not.toHaveBeenCalled();
    expect(setVisibleMock).not.toHaveBeenCalled();
  });
});
