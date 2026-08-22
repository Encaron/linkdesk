/**
 * ViewContainerService 共享测试桩——E5.8#34.5 归一化去重（jscpd 门禁 60 tokens）。
 * panelCreatePicker（#32）/ panelReveal（#34.5）/ floatingPanelReveal（#39.5）同 mock 同一壳服务
 * （getViewContainers/getViews/getView/isVisible/setVisible）→ 唯一事实源。
 * 测试文件 import 本模块即注册 mock（helper 先于 SUT 求值，vitest 模块依赖序保证）。
 *
 * 纪律：本文件只被测试 import（knip 门禁——导出须有消费方）；vi.mock 工厂引用同模块 vi.hoisted
 * 变量（vitest hoist 优先级：vi.hoisted > vi.mock，契约保证）。
 */

import { vi } from "vitest";

const { getViewContainersMock, getViewsMock, getViewByViewIdMock, getViewMock, isVisibleMock, setVisibleMock } = vi.hoisted(() => ({
  getViewContainersMock: vi.fn(),
  getViewsMock: vi.fn(),
  getViewByViewIdMock: vi.fn(), // E5.8#39.5→#41.9.2：floatingPanelReveal 声明扫描寻址（getViewByViewId 声明扫描基元）
  getViewMock: vi.fn(), // E5.8#41.16：floatingPanelReveal 复合寻址（getView(pluginId, viewId) 复合键）
  isVisibleMock: vi.fn(),
  setVisibleMock: vi.fn(),
}));
// isVisibleMock 仅 seed 内部消费（无测试直接 import）——不导出（knip 门禁）
export { getViewContainersMock, getViewsMock, getViewByViewIdMock, getViewMock, setVisibleMock };

vi.mock("../core/services/layout/ViewContainerService", () => ({
  ViewContainerService: {
    getViewContainers: getViewContainersMock,
    getViews: getViewsMock,
    getViewByViewId: getViewByViewIdMock,
    getView: getViewMock,
    isVisible: isVisibleMock,
    setVisible: setVisibleMock,
  },
}));

/** 种子数据：双 panel 容器 × 各自视图（demo-panel-a 视图带 _pluginId——category 断言用）。仅 demo-view-b 隐藏。
 *  getViewByViewIdMock = 同 seed 的声明扫描索引（视图带运行时附挂 _pluginId/_renderPath——floatingPanel 声明寻址用）。
 *  调用方 beforeEach 先 vi.clearAllMocks() 再调本函数；特殊场景直接覆盖个别 mock。
 *  插件/视图身份与显示文本全部用明显虚构值（demo-plugin-a/b/c、demo-view-a/b/c、Alpha/Beta/Gamma）——
 *  测试桩惰性数据，不用真实插件名/真实 UI 文案避免误导（2026-08-22 用户「没有硬编码」标准）。 */
export function seedViewContainerMocks(): void {
  getViewContainersMock.mockReturnValue([
    { id: "demo-panel-a", title: "Demo A", location: "panel" },
    { id: "demo-panel-b", title: "Demo B", location: "panel" },
  ]);
  getViewsMock.mockImplementation((cid: string) =>
    cid === "demo-panel-a"
      ? [
          { id: "demo-view-a", title: "Alpha", _pluginId: "demo-plugin-a" },
          { id: "demo-view-b", title: "Beta", _pluginId: "demo-plugin-b" },
        ]
      : [{ id: "demo-view-c", title: "Gamma", _pluginId: "demo-plugin-c" }],
  );
  isVisibleMock.mockImplementation((_cid: string, vid: string) => vid !== "demo-view-b");
  // E5.8#39.5：全局索引——视图带 loader 运行时附挂（renderPath 形状 = glob key）
  getViewByViewIdMock.mockImplementation((vid: string) => {
    const table: Record<string, { id: string; title: string; _pluginId: string; _renderPath: string }> = {
      "demo-view-a": { id: "demo-view-a", title: "Alpha", _pluginId: "demo-plugin-a", _renderPath: "/@fs/plugins/demo-plugin-a/src/views/DemoViewA.tsx" },
      "demo-view-b": { id: "demo-view-b", title: "Beta", _pluginId: "demo-plugin-b", _renderPath: "/@fs/plugins/demo-plugin-b/src/views/DemoViewB.tsx" },
      "demo-view-c": { id: "demo-view-c", title: "Gamma", _pluginId: "demo-plugin-c", _renderPath: "/@fs/plugins/demo-plugin-c/src/views/DemoViewC.tsx" },
    };
    return table[vid];
  });
  // E5.8#41.16 复合键 mock——getView(pluginId, viewId)：按插件解析（任意 viewId 命中该插件的 descriptor，
  // 镜像真实 _viewIndex 复合键索引的 O(1) 语义）。插件未知 → undefined。
  getViewMock.mockImplementation((pid: string, vid: string) => {
    const byPlugin: Record<string, { title: string; _renderPath: string }> = {
      "demo-plugin-a": { title: "Alpha", _renderPath: "/@fs/plugins/demo-plugin-a/src/views/DemoViewA.tsx" },
      "demo-plugin-b": { title: "Beta", _renderPath: "/@fs/plugins/demo-plugin-b/src/views/DemoViewB.tsx" },
      "demo-plugin-c": { title: "Gamma", _renderPath: "/@fs/plugins/demo-plugin-c/src/views/DemoViewC.tsx" },
    };
    const p = byPlugin[pid];
    if (!p) return undefined;
    return { id: vid, title: p.title, _pluginId: pid, _renderPath: p._renderPath };
  });
}
