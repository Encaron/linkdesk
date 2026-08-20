/**
 * sidebar-panel 序列化测试——E5.8#34 容器切换器 DTO。
 *
 * 覆盖：buildPanelSwitcherGroups 按容器分组列全部视图（含隐藏）/ visible+active 标记 /
 * t() 解析容器与视图标题 / 空容器跳过 / 非 panel 容器不列。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ViewContainerService } from "../../core/services/layout/ViewContainerService";
import type { ViewDescriptor } from "../../core/services/layout/ViewContainerService";
import { clearPluginStates } from "../../core/services/plugins/PluginStateService";
import { buildPanelSwitcherGroups } from "./sidebar-panel";

const PLUGIN_ID = "switcher-test";
const id = (s: string) => s;

/** 占位 render 组件 */
const DummyView = () => null;

function makeView(overrides: Partial<ViewDescriptor> = {}): ViewDescriptor {
  return {
    id: "pv1",
    title: "输出",
    render: DummyView,
    ...overrides,
  };
}

/** 注册一个含 2 视图的 panel 容器（同 panel-demo 形状） */
function registerPanelContainer(): void {
  ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "panel-demo", title: "面板演示", location: "panel" });
  ViewContainerService.registerView(PLUGIN_ID, "panel-demo", makeView({ id: "demo-output", title: "输出" }));
  ViewContainerService.registerView(PLUGIN_ID, "panel-demo", makeView({ id: "demo-todo", title: "待办" }));
}

describe("buildPanelSwitcherGroups（E5.8#34 容器切换器 DTO）", () => {
  beforeEach(() => {
    ViewContainerService.unregisterAll(PLUGIN_ID);
    clearPluginStates();
  });

  it("按容器分组列全部视图——visible/active 标记 + t() 解析标题", () => {
    registerPanelContainer();

    const groups = buildPanelSwitcherGroups(id, "demo-output");
    expect(groups).toEqual([
      {
        containerId: "panel-demo",
        containerTitle: "面板演示",
        items: [
          { viewId: "demo-output", title: "输出", pluginId: PLUGIN_ID, visible: true, active: true },
          { viewId: "demo-todo", title: "待办", pluginId: PLUGIN_ID, visible: true, active: false },
        ],
      },
    ]);
  });

  it("含隐藏视图——visible:false 标记，getActiveViews 不含但仍在下拉", () => {
    registerPanelContainer();
    ViewContainerService.setVisible("panel-demo", "demo-todo", false);

    const groups = buildPanelSwitcherGroups(id, "demo-output");
    const todo = groups[0].items.find((i) => i.viewId === "demo-todo");
    expect(todo).toMatchObject({ visible: false, active: false });
    // 活跃视图仍在列表
    expect(groups[0].items.find((i) => i.viewId === "demo-output")).toMatchObject({ visible: true, active: true });
  });

  it("t() 解析容器与视图标题（非恒等 t 验证翻译调用）", () => {
    registerPanelContainer();
    const t = (k: string) => (k === "面板演示" ? "Panel Demo" : k === "输出" ? "Output" : k);

    const groups = buildPanelSwitcherGroups(t, "");
    expect(groups[0].containerTitle).toBe("Panel Demo");
    expect(groups[0].items[0].title).toBe("Output");
  });

  it("空容器（无注册视图）跳过——不列空组", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "empty-c", title: "空容器", location: "panel" });
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "panel-demo", title: "面板演示", location: "panel" });
    ViewContainerService.registerView(PLUGIN_ID, "panel-demo", makeView({ id: "demo-output", title: "输出" }));

    const groups = buildPanelSwitcherGroups(id, "");
    expect(groups).toHaveLength(1);
    expect(groups[0].containerId).toBe("panel-demo");
  });

  it("非 panel 容器不列（location 过滤）", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "explorer", title: "资源管理器", location: "sidebar" });
    ViewContainerService.registerView(PLUGIN_ID, "explorer", makeView({ id: "folders", title: "文件夹" }));

    expect(buildPanelSwitcherGroups(id, "")).toEqual([]);
  });
});
