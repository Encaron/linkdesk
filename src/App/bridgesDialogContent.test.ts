/**
 * bridges.resolveDialogContentView 测试——E6#71c 富内容确认声明寻址（壳侧小纯函数）。
 * 覆盖：contributes.views 已注册视图 + loader 运行时附挂 → 解析 pluginId/renderPath；
 * 未注册 id → null（调用方回落纯文字确认，不静默死）；视图存在但缺 _renderPath →
 * null（声明未解析防坏数据穿透）。ViewContainerService mock 共享于 viewContainerMocks.ts（#39.5 同源去重）。
 * fixture 全虚构（硬约束 21）——demo-plugin-a/demo-view-a（Alpha）等明显虚构值。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getViewMock, seedViewContainerMocks } from "./viewContainerMocks";
import { resolveDialogContentView } from "./bridges";

describe("resolveDialogContentView（E6#71c 富内容确认声明寻址）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedViewContainerMocks();
  });

  it("已注册视图（loader 附挂 _pluginId/_renderPath）→ 解析 pluginId/renderPath（仿 resolveFloatingPanelView）", () => {
    expect(resolveDialogContentView("demo-plugin-a", "demo-view-a")).toEqual({
      pluginId: "demo-plugin-a",
      renderPath: "/@fs/plugins/demo-plugin-a/src/views/DemoViewA.tsx",
    });
    expect(getViewMock).toHaveBeenCalledWith("demo-plugin-a", "demo-view-a"); // 复合键精确寻址
  });

  it("从未注册的插件/视图 → null（无贡献——调用方回落纯文字确认，不静默死）", () => {
    expect(resolveDialogContentView("never-plugin", "never-view")).toBeNull();
  });

  it("视图存在但缺运行时附挂 _renderPath → null（声明未解析，防坏数据穿透）", () => {
    getViewMock.mockReturnValue({ id: "ghost", title: "幽灵", _pluginId: "demo-plugin-a" } as never);
    expect(resolveDialogContentView("demo-plugin-a", "ghost")).toBeNull();
  });

  it("视图存在但缺 _pluginId → null（壳侧插件归属未知，无法构造 content.pluginId）", () => {
    getViewMock.mockReturnValue({ id: "orphan", title: "孤儿", _renderPath: "/@fs/x.tsx" } as never);
    expect(resolveDialogContentView("demo-plugin-a", "orphan")).toBeNull();
  });
});
