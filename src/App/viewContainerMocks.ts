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

const { getViewContainersMock, getViewsMock, getViewByViewIdMock, isVisibleMock, setVisibleMock } = vi.hoisted(() => ({
  getViewContainersMock: vi.fn(),
  getViewsMock: vi.fn(),
  getViewByViewIdMock: vi.fn(), // E5.8#39.5→#41.9.2：floatingPanelReveal 声明扫描寻址（getViewByViewId 声明扫描基元）
  isVisibleMock: vi.fn(),
  setVisibleMock: vi.fn(),
}));
// isVisibleMock 仅 seed 内部消费（无测试直接 import）——不导出（knip 门禁）
export { getViewContainersMock, getViewsMock, getViewByViewIdMock, setVisibleMock };

vi.mock("../core/services/layout/ViewContainerService", () => ({
  ViewContainerService: {
    getViewContainers: getViewContainersMock,
    getViews: getViewsMock,
    getViewByViewId: getViewByViewIdMock,
    isVisible: isVisibleMock,
    setVisible: setVisibleMock,
  },
}));

/** 种子数据：双 panel 容器 × 各自视图（panel-main 视图带 _pluginId——category 断言用）。仅 output 隐藏。
 *  getViewByViewIdMock = 同 seed 的声明扫描索引（视图带运行时附挂 _pluginId/_renderPath——floatingPanel 声明寻址用）。
 *  调用方 beforeEach 先 vi.clearAllMocks() 再调本函数；特殊场景直接覆盖个别 mock。 */
export function seedViewContainerMocks(): void {
  getViewContainersMock.mockReturnValue([
    { id: "panel-main", title: "面板", location: "panel" },
    { id: "panel-tools", title: "工具", location: "panel" },
  ]);
  getViewsMock.mockImplementation((cid: string) =>
    cid === "panel-main"
      ? [
          { id: "problems", title: "问题", _pluginId: "linter" },
          { id: "output", title: "输出", _pluginId: "panel-demo" },
        ]
      : [{ id: "terminal", title: "终端", _pluginId: "terminal" }],
  );
  isVisibleMock.mockImplementation((_cid: string, vid: string) => vid !== "output");
  // E5.8#39.5：全局索引——视图带 loader 运行时附挂（renderPath 形状 = glob key）
  getViewByViewIdMock.mockImplementation((vid: string) => {
    const table: Record<string, { id: string; title: string; _pluginId: string; _renderPath: string }> = {
      problems: { id: "problems", title: "问题", _pluginId: "linter", _renderPath: "/@fs/plugins/builtin/linter/src/views/ProblemsView.tsx" },
      output: { id: "output", title: "输出", _pluginId: "panel-demo", _renderPath: "/@fs/plugins/builtin/panel-demo/src/views/OutputView.tsx" },
      terminal: { id: "terminal", title: "终端", _pluginId: "terminal", _renderPath: "/@fs/plugins/builtin/terminal/src/views/TerminalView.tsx" },
    };
    return table[vid];
  });
}
