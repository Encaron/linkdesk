/**
 * floatingPanelReveal 测试——E5.8#39.5 linkdesk.panel.revealFloating 通用 API 壳侧寻址/I8-2 开关键/默认动作。
 * 覆盖：声明寻址（全局视图索引——不限 panel 容器）→ 解析 pluginId/renderPath/title /
 * 缺运行时附挂 → null（声明未解析防坏数据）/ 未注册 id → null（无贡献 no-op）/
 * I8-2 决策（无面板→开 / 同视图→关 / 异或空→开）/ 默认动作两按钮（最大化 toggle + 关闭）。
 * ViewContainerService mock 共享于 viewContainerMocks.ts（#39.5 同源去重）。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { getViewByViewIdMock, getViewMock, seedViewContainerMocks } from "./viewContainerMocks";
import {
  resolveFloatingPanelView,
  decideFloatingPanelReveal,
  buildDefaultFloatingPanelActions,
  useFloatingPanelReveal,
} from "./floatingPanelReveal";
import { registerViewPlugin, clearRegistry } from "../pluginLoader/contributions/viewRegistry";
import { pushPanel, closePanel, registerFloatingPanelRenderer } from "../core/services/ui/FloatingPanelService";

// E5.8#40 显示文本铁律判别——标题/动作文案壳侧 t() 解析（池零自产文本）。mock i18n.t 返回 "T:<key>"
// 前缀：断言能证明「标题经 t() 路径」（若实现是裸声明透传，前缀不存在 → 测试红）。
// languageEmitter：2026-08-22 点修③——useFloatingPanelReveal 订阅 i18n.languageChanged 重推面板文案，
// mock 出 on/off/fire 判定「订阅存在 + 触发时重推」（面板未开 no-op）。
const { tMock, rendererMock, languageEmitter } = vi.hoisted(() => {
  const cbs = new Set<() => void>();
  return {
    tMock: vi.fn((key: string) => `T:${key}`),
    rendererMock: vi.fn(),
    languageEmitter: {
      on: (_evt: string, cb: () => void) => { cbs.add(cb); },
      off: (_evt: string, cb: () => void) => { cbs.delete(cb); },
      fire: () => { cbs.forEach((cb) => cb()); },
      clear: () => { cbs.clear(); },
    },
  };
});
vi.mock("../i18n", () => ({ default: { t: tMock, on: languageEmitter.on, off: languageEmitter.off } }));

describe("resolveFloatingPanelView（E5.8#39.5 revealFloating 声明寻址）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedViewContainerMocks();
  });

  it("已注册视图 → 解析出 pluginId/renderPath/title（全局索引，不限 panel 容器）", () => {
    expect(resolveFloatingPanelView("demo-view-c")).toEqual({
      viewId: "demo-view-c",
      pluginId: "demo-plugin-c",
      renderPath: "/@fs/plugins/demo-plugin-c/src/views/DemoViewC.tsx",
      title: "T:Gamma", // 显示文本铁律——标题走壳侧 t()（i18n.t 返回 "T:<key>" 判别前缀）
    });
    expect(tMock).toHaveBeenCalledWith("Gamma");
    // panel 容器视图同样可寻址（声明制 = 任意 contributes.views 已注册视图）
    expect(resolveFloatingPanelView("demo-view-a")).toEqual({
      viewId: "demo-view-a",
      pluginId: "demo-plugin-a",
      renderPath: "/@fs/plugins/demo-plugin-a/src/views/DemoViewA.tsx",
      title: "T:Alpha",
    });
  });

  it("从未注册的 id → null（无贡献 no-op 不崩）", () => {
    expect(resolveFloatingPanelView("never-registered")).toBeNull();
  });

  it("视图存在但缺运行时附挂 _renderPath → null（声明未解析，防坏数据穿透）", () => {
    getViewByViewIdMock.mockReturnValue({ id: "ghost", title: "幽灵" } as never);
    expect(resolveFloatingPanelView("ghost")).toBeNull();
  });

  it("携带 pluginId → 复合键精确寻址（裸 viewId 多命中 fail-loud 也不影响——#41.8 §4.2）", () => {
    // 双设置套并存场景：裸扫描歧义（getViewByViewId fail-loud → undefined），复合键 getView 精确命中
    getViewByViewIdMock.mockReturnValue(undefined);
    expect(resolveFloatingPanelView("demo-view-c", "demo-plugin-c")).toEqual({
      viewId: "demo-view-c",
      pluginId: "demo-plugin-c",
      renderPath: "/@fs/plugins/demo-plugin-c/src/views/DemoViewC.tsx",
      title: "T:Gamma",
    });
    expect(getViewByViewIdMock).not.toHaveBeenCalled(); // 复合路径不走裸扫描
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
    const d1 = decideFloatingPanelReveal("demo-view-c", null);
    expect(d1.action).toBe("open");
    if (d1.action === "open") {
      expect(d1.result.viewId).toBe("demo-view-c");
      expect(d1.result.pluginId).toBe("demo-plugin-c");
    }
    // 他面板开着（当前是别的 viewId）→ 替换 = open
    const d2 = decideFloatingPanelReveal("demo-view-c", "demo-view-a");
    expect(d2.action).toBe("open");
  });

  it("同视图再点 → toggle-close（面板关）", () => {
    expect(decideFloatingPanelReveal("demo-view-c", "demo-view-c")).toEqual({ action: "toggle-close" });
  });

  it("复合身份开关键：viewId 相同但插件不同（双设置套同名 viewId）→ open 替换内容", () => {
    // 当前面板 = demo-view-c（demo-plugin-c），请求同 viewId 但另一插件 → 不同面板 → open（替换）
    const d = decideFloatingPanelReveal("demo-view-c", "demo-view-c", "demo-plugin-a", "demo-plugin-c");
    expect(d.action).toBe("open");
  });

  it("复合身份开关键：viewId + pluginId 均相同 → toggle-close（同面板再点关）", () => {
    expect(decideFloatingPanelReveal("demo-view-c", "demo-view-c", "demo-plugin-c", "demo-plugin-c")).toEqual({
      action: "toggle-close",
    });
  });

  it("复合路径 resolve 歧义 → noop（getView 精确寻址未命中，声明未注册不崩）", () => {
    getViewMock.mockReturnValue(undefined);
    expect(decideFloatingPanelReveal("demo-view-c", null, "never-plugin")).toEqual({ action: "noop" });
  });
});

describe("buildDefaultFloatingPanelActions（通用默认动作集）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRegistry();
  });

  it("最大化（I8-9 池本地 toggle 两态）+ 关闭——文案壳 t() 解析；未指定插件无 open-in", () => {
    const actions = buildDefaultFloatingPanelActions();
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ id: "maximize", icon: "maximize", toggledIcon: "restore" });
    expect(actions[0].label).toBeTruthy();
    expect(actions[0].toggledLabel).toBeTruthy();
    expect(actions[1]).toMatchObject({ id: "close", icon: "close" });
    expect(actions[1].label).toBeTruthy();
    // 未指定 open-in 插件 → 无 open-in（池渲染分支语义按 expandOnHover 字段判定）
    expect(actions.some((a) => a.expandOnHover)).toBe(false);
  });

  it("内容插件可开成标签页（appearsIn.tabBar + entry）→ open-in 按钮出现且居首（I8-4 面板↔标签页互转）", () => {
    registerViewPlugin({
      pluginId: "floating-panel-demo",
      manifest: {
        name: "悬浮面板演示",
        version: "1.0.0",
        entry: "src/index.tsx",
        appearsIn: { tabBar: true },
      },
    });
    const actions = buildDefaultFloatingPanelActions("floating-panel-demo");
    expect(actions).toHaveLength(3);
    expect(actions[0]).toMatchObject({ id: "open-in", icon: "open-in", expandOnHover: true });
    expect(actions[0].label).toBeTruthy();
    expect(actions[1]).toMatchObject({ id: "maximize", toggledIcon: "restore" });
    expect(actions[2]).toMatchObject({ id: "close" });
  });

  it("内容插件无标签页形态（未注册 / entryless）→ 不出现 open-in（打开动作无 tab 可落）", () => {
    const actions = buildDefaultFloatingPanelActions("never-registered");
    expect(actions).toHaveLength(2);
    expect(actions.some((a) => a.expandOnHover)).toBe(false);
  });
});

describe("useFloatingPanelReveal 语言切换重推（2026-08-22 点修③）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedViewContainerMocks();
    closePanel(); // 清 FloatingPanelService 模块级单实例态（_currentViewId/_currentOpen）
    rendererMock.mockClear();
    registerFloatingPanelRenderer((data) => rendererMock(data));
    languageEmitter.clear();
  });

  it("面板开着时 languageChanged → refreshPanelText 重推（refresh:true + 重解析 title/动作，身份不变）", () => {
    pushPanel({
      viewId: "demo-view-c",
      title: "T:Gamma",
      pluginId: "demo-plugin-c",
      renderPath: "/@fs/plugins/demo-plugin-c/src/views/DemoViewC.tsx",
      actions: [],
    });
    rendererMock.mockClear(); // 清掉 pushPanel 的首次推

    const { unmount } = renderHook(() => useFloatingPanelReveal());
    languageEmitter.fire(); // i18n.changeLanguage 同步触发 languageChanged

    const pushed = rendererMock.mock.calls[rendererMock.mock.calls.length - 1][0] as Extract<
      import("../core/types/pool/poolFloatingPanel").PoolFloatingPanelData,
      { open: true }
    >;
    expect(pushed.refresh).toBe(true); // 池据此跳过焦点获取
    expect(pushed.viewId).toBe("demo-view-c"); // 身份不变（refresh 不是替换）
    expect(pushed.title).toBe("T:Gamma"); // 重解析——t() 前缀判别显示文本铁律
    expect(Array.isArray(pushed.actions) && pushed.actions.length > 0).toBe(true); // 重建成默认动作集
    unmount();
  });

  it("面板未开时 languageChanged → 零重推（no-op，不推不崩）", () => {
    const { unmount } = renderHook(() => useFloatingPanelReveal());
    rendererMock.mockClear();
    languageEmitter.fire();
    expect(rendererMock).not.toHaveBeenCalled();
    unmount();
  });
});
