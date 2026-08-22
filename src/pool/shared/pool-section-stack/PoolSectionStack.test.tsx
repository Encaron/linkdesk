/**
 * @vitest-environment jsdom
 *
 * PoolSectionStack 测试——E5.8#36.6 侧栏 section header 动作区。
 * 覆盖：view.titleActions 声明 → SidebarSection actions 槽注入 ViewTitleActions（与面板 #36.5
 * 同一渲染器同一数据源）；点击执行 command；无声明 → header 无动作区；动作点击不冒泡折叠 section。
 * mock PluginComponent（避免 import.meta.glob / React.lazy 复杂化——只测接线不测插件加载）。
 * i18n：import ../../../i18n 模块级 init（lng zh——t(key) 缺表返回 key 原文，显示文本铁律走 key）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, screen } from "@testing-library/react";
import "../../../i18n";

vi.mock("../plugin-component/PluginComponent", () => ({
  default: () => <div data-testid="mock-plugin-view" />,
}));

// jsdom 无 ResizeObserver——PoolSectionStack 用它测容器高度/内容高度（池 zone 同款依赖）
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

import PoolSectionStack from "./PoolSectionStack";
import type { SidebarViewMeta } from "../../../core/types/pool/poolLayout";
import type { TitleActionWidget } from "../../../core/api/types";

// 测试桩 window.linkdesk.commands mock——与 ViewTitleActions.test 同源脚手架（内联 mock 本仓库常态，
// 结构性重复走 jscpd 逃生舱——RightSidebarZone/PanelZone 同款先例）
/* jscpd:ignore-start */
const { mockExecuteCommand } = vi.hoisted(() => ({
  mockExecuteCommand: vi.fn(),
}));

/** 安装 window.linkdesk.commands mock——preload-pool 同款形状（池侧注册表优先、壳 IPC fallback） */
function installCommandsApi(): void {
  Object.defineProperty(window, "linkdesk", {
    value: {
      commands: {
        executeCommand: mockExecuteCommand,
      },
    },
    writable: true,
    configurable: true,
  });
}
/* jscpd:ignore-end */

/** 构造侧栏 view meta（panel-demo demo-sidebar 同款形状） */
function makeView(overrides: Partial<SidebarViewMeta> = {}): SidebarViewMeta {
  return {
    id: "demo-sidebar",
    title: "侧栏演示",
    pluginId: "panel-demo",
    renderPath: "demo-render",
    ...overrides,
  };
}

/** demo-sidebar 的 titleActions 声明（plugin.json 同源形状） */
const ACTIONS: TitleActionWidget[] = [
  { type: "icon", id: "sidebar-clear-log", command: "panel-demo.sidebarClearLog", icon: "codicon-clear-all", title: "侧栏清空输出" },
];

describe("PoolSectionStack（E5.8#36.6 侧栏 section header 动作区）", () => {
  beforeEach(() => {
    mockExecuteCommand.mockReset();
    installCommandsApi();
  });

  afterEach(() => {
    cleanup();
  });

  it("view.titleActions 声明 → section header 右侧渲染动作区，点击执行 command", () => {
    render(
      <PoolSectionStack
        views={[makeView({ titleActions: ACTIONS })]}
        containerId="panel-demo-sidebar"
        toolbarHeight={0}
        onSidebarAction={vi.fn()}
      />,
    );
    // 动作图标出现在 header（title = i18n key 原文——t 缺表回退；同面板 #36.5 同一渲染器）
    const btn = screen.getByTitle("侧栏清空输出");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(mockExecuteCommand).toHaveBeenCalledWith("panel-demo.sidebarClearLog");
  });

  it("无 titleActions 声明 → header 无动作区（右侧空白——现状保持）", () => {
    render(
      <PoolSectionStack
        views={[makeView()]}
        containerId="panel-demo-sidebar"
        toolbarHeight={0}
        onSidebarAction={vi.fn()}
      />,
    );
    expect(screen.queryByTitle("侧栏清空输出")).toBeNull();
  });

  it("动作点击不冒泡折叠——命令执行 + section body 保持可见 + 无 setCollapsed IPC", () => {
    const onSidebarAction = vi.fn();
    render(
      <PoolSectionStack
        views={[makeView({ titleActions: ACTIONS })]}
        containerId="panel-demo-sidebar"
        toolbarHeight={0}
        onSidebarAction={onSidebarAction}
      />,
    );
    // 点击前 section 展开——mock 视图可见
    expect(screen.getByTestId("mock-plugin-view")).toBeTruthy();
    fireEvent.click(screen.getByTitle("侧栏清空输出"));
    // 命令已执行
    expect(mockExecuteCommand).toHaveBeenCalled();
    // 未触发折叠 IPC（actions span stopPropagation——header onClick=toggle 不冒泡）
    expect(onSidebarAction).not.toHaveBeenCalled();
    // section 未折叠——body 仍在
    expect(screen.getByTestId("mock-plugin-view")).toBeTruthy();
  });
});
