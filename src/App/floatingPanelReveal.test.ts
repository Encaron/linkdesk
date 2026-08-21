/**
 * floatingPanelReveal 测试——E5.8#39.5 linkdesk.panel.revealFloating 通用 API 壳侧寻址/I8-2 开关键/默认动作。
 * 覆盖：声明寻址（全局视图索引——不限 panel 容器）→ 解析 pluginId/renderPath/title /
 * 缺运行时附挂 → null（声明未解析防坏数据）/ 未注册 id → null（无贡献 no-op）/
 * I8-2 决策（无面板→开 / 同视图→关 / 异或空→开）/ 默认动作两按钮（最大化 toggle + 关闭）。
 * ViewContainerService mock 共享于 viewContainerMocks.ts（#39.5 同源去重）。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getViewMock, seedViewContainerMocks } from "./viewContainerMocks";
import { resolveFloatingPanelView, decideFloatingPanelReveal, buildDefaultFloatingPanelActions } from "./floatingPanelReveal";

describe("resolveFloatingPanelView（E5.8#39.5 revealFloating 声明寻址）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedViewContainerMocks();
  });

  it("已注册视图 → 解析出 pluginId/renderPath/title（全局索引，不限 panel 容器）", () => {
    expect(resolveFloatingPanelView("terminal")).toEqual({
      viewId: "terminal",
      pluginId: "terminal",
      renderPath: "/@fs/plugins/builtin/terminal/src/views/TerminalView.tsx",
      title: "终端",
    });
    // panel 容器视图同样可寻址（声明制 = 任意 contributes.views 已注册视图）
    expect(resolveFloatingPanelView("problems")).toEqual({
      viewId: "problems",
      pluginId: "linter",
      renderPath: "/@fs/plugins/builtin/linter/src/views/ProblemsView.tsx",
      title: "问题",
    });
  });

  it("从未注册的 id → null（无贡献 no-op 不崩）", () => {
    expect(resolveFloatingPanelView("never-registered")).toBeNull();
  });

  it("视图存在但缺运行时附挂 _renderPath → null（声明未解析，防坏数据穿透）", () => {
    getViewMock.mockReturnValue({ id: "ghost", title: "幽灵" } as never);
    expect(resolveFloatingPanelView("ghost")).toBeNull();
  });
});

describe("decideFloatingPanelReveal（I8-2 身份开关键决策）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedViewContainerMocks();
  });

  it("未声明视图 → noop（无贡献 no-op 不崩）", () => {
    expect(decideFloatingPanelReveal("never-registered", null)).toEqual({ action: "noop" });
  });

  it("无面板 / 他面板 → open（决议带解析结果）", () => {
    const d1 = decideFloatingPanelReveal("terminal", null);
    expect(d1.action).toBe("open");
    if (d1.action === "open") {
      expect(d1.result.viewId).toBe("terminal");
      expect(d1.result.pluginId).toBe("terminal");
    }
    // 他面板开着（当前是别的 viewId）→ 替换 = open
    const d2 = decideFloatingPanelReveal("terminal", "problems");
    expect(d2.action).toBe("open");
  });

  it("同视图再点 → toggle-close（面板关）", () => {
    expect(decideFloatingPanelReveal("terminal", "terminal")).toEqual({ action: "toggle-close" });
  });
});

describe("buildDefaultFloatingPanelActions（通用默认动作集）", () => {
  it("最大化（I8-9 池本地 toggle 两态）+ 关闭——文案壳 t() 解析", () => {
    const actions = buildDefaultFloatingPanelActions();
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ id: "maximize", icon: "maximize", toggledIcon: "restore" });
    expect(actions[0].label).toBeTruthy();
    expect(actions[0].toggledLabel).toBeTruthy();
    expect(actions[1]).toMatchObject({ id: "close", icon: "close" });
    expect(actions[1].label).toBeTruthy();
    // 池渲染分支语义按字段判定——open-in 不属通用默认（#38 settings 语义）
    expect(actions.some((a) => a.expandOnHover)).toBe(false);
  });
});
