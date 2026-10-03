/**
 * sidebar-panel 序列化测试——E5.8#34 容器切换器 DTO。
 *
 * 覆盖：buildPanelSwitcherGroups 按容器分组列全部视图（含隐藏）/ visible+active 标记 /
 * t() 解析容器与视图标题 / 空容器跳过 / 非 panel 容器不列。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ViewContainerService } from "../../core/services/layout/ViewContainerService";
import type { ViewDescriptor } from "../../core/services/layout/ViewContainerService";
import type { TitleActionWidget } from "../../core/api/types";
import { clearPluginStates } from "../../core/services/plugins/PluginStateService";
import { buildPanelSwitcherGroups, buildPanelViewMetas, buildSidebarViewMetas, buildEffectiveCollapsedViewIds } from "./sidebar-panel";

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

/** 注册一个含 2 视图的 panel 容器（同 demo-plugin 形状） */
function registerPanelContainer(): void {
  ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "demo-plugin", title: "面板演示", location: "panel" });
  ViewContainerService.registerView(PLUGIN_ID, "demo-plugin", makeView({ id: "demo-output", title: "输出" }));
  ViewContainerService.registerView(PLUGIN_ID, "demo-plugin", makeView({ id: "demo-todo", title: "待办" }));
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
        containerId: "demo-plugin",
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
    ViewContainerService.setVisible("demo-plugin", "demo-todo", false);

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
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "demo-plugin", title: "面板演示", location: "panel" });
    ViewContainerService.registerView(PLUGIN_ID, "demo-plugin", makeView({ id: "demo-output", title: "输出" }));

    const groups = buildPanelSwitcherGroups(id, "");
    expect(groups).toHaveLength(1);
    expect(groups[0].containerId).toBe("demo-plugin");
  });

  it("非 panel 容器不列（location 过滤）", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "explorer", title: "资源管理器", location: "sidebar" });
    ViewContainerService.registerView(PLUGIN_ID, "explorer", makeView({ id: "folders", title: "文件夹" }));

    expect(buildPanelSwitcherGroups(id, "")).toEqual([]);
  });
});

describe("buildPanelViewMetas / buildSidebarViewMetas（E5.8#36.5 titleActions 声明透传）", () => {
  beforeEach(() => {
    ViewContainerService.unregisterAll(PLUGIN_ID);
    clearPluginStates();
  });

  it("面板视图——titleActions 原样透传到 PanelViewMeta", () => {
    const titleActions: TitleActionWidget[] = [
      { type: "icon", id: "clear", command: "demo.clear", icon: "codicon-clear-all", title: "清空输出" },
    ];
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "demo-plugin", title: "面板演示", location: "panel" });
    ViewContainerService.registerView(PLUGIN_ID, "demo-plugin", makeView({ id: "demo-output", title: "输出", titleActions }));

    const metas = buildPanelViewMetas((k) => k);
    expect(metas).toHaveLength(1);
    expect(metas[0].id).toBe("demo-output");
    expect(metas[0].titleActions).toEqual(titleActions);
  });

  it("面板视图——无 titleActions 声明 → 字段缺省（右侧空白）", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "demo-plugin", title: "面板演示", location: "panel" });
    ViewContainerService.registerView(PLUGIN_ID, "demo-plugin", makeView({ id: "demo-output", title: "输出" }));

    const metas = buildPanelViewMetas((k) => k);
    expect(metas[0].titleActions).toBeUndefined();
  });

  it("侧栏视图——同一声明透传到 SidebarViewMeta（#36.6 两处消费）", () => {
    const titleActions: TitleActionWidget[] = [{ type: "dropdown", id: "samples", items: [{ label: "重载", command: "demo.reload" }] }];
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "explorer", title: "资源管理器", location: "sidebar" });
    ViewContainerService.registerView(PLUGIN_ID, "explorer", makeView({ id: "folders", title: "文件夹", titleActions }));

    const metas = buildSidebarViewMetas("explorer", (k) => k);
    expect(metas).toHaveLength(1);
    expect(metas[0].titleActions).toEqual(titleActions);
  });

  it("🔥 title 壳 t() 解析后推送（E5.8#37.9 P2 回归——侧栏/面板标题此前原样推中文）", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "demo-plugin", title: "面板演示", location: "panel" });
    ViewContainerService.registerView(PLUGIN_ID, "demo-plugin", makeView({ id: "demo-output", title: "输出" }));
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "explorer", title: "资源管理器", location: "sidebar" });
    ViewContainerService.registerView(PLUGIN_ID, "explorer", makeView({ id: "folders", title: "文件夹" }));

    const dict: Record<string, string> = { "输出": "Output", "文件夹": "Folder" };
    const t = (k: string) => dict[k] ?? k;

    expect(buildPanelViewMetas(t)[0].title).toBe("Output");
    expect(buildSidebarViewMetas("explorer", t)[0].title).toBe("Folder");
    // 无 key → 原文兜底（parseMissingKeyHandler 语义——P1 补 key 而不是吞掉）
    expect(buildPanelViewMetas(t)[0].id).toBe("demo-output");
  });
});

describe("buildEffectiveCollapsedViewIds（04 有效折叠集——三类真相合并）", () => {
  beforeEach(() => {
    ViewContainerService.unregisterAll(PLUGIN_ID);
    clearPluginStates();
  });

  /** 侧栏容器 + 三个视图：声明折叠 / 未声明 / 声明折叠（供逐项对照） */
  function registerSidebar(): void {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "explorer", title: "资源管理器", location: "sidebar" });
    ViewContainerService.registerView(PLUGIN_ID, "explorer", makeView({ id: "declared", title: "声明折叠", collapsed: true }));
    ViewContainerService.registerView(PLUGIN_ID, "explorer", makeView({ id: "plain", title: "普通" }));
  }

  it("插件声明 collapsed:true → 入集（此前只算持久化列，声明折叠的 section 被漏判为展开）", () => {
    registerSidebar();
    expect(buildEffectiveCollapsedViewIds()).toEqual(["declared"]);
  });

  it("用户显式折叠未声明的视图 → 入集", () => {
    registerSidebar();
    ViewContainerService.setCollapsed(PLUGIN_ID, "plain", true);
    expect(buildEffectiveCollapsedViewIds()).toEqual(["declared", "plain"]);
  });

  it("🔥 声明折叠 + 用户显式展开 → 出集（旧单列记录法表达不了 → 勾选态印反、点击空操作）", () => {
    registerSidebar();
    ViewContainerService.setCollapsed(PLUGIN_ID, "declared", false);
    expect(buildEffectiveCollapsedViewIds()).toEqual([]);
  });

  it("双向切换互斥——展开后再折叠回集内（同键不在两列同时存在）", () => {
    registerSidebar();
    ViewContainerService.setCollapsed(PLUGIN_ID, "declared", false);
    expect(buildEffectiveCollapsedViewIds()).toEqual([]);
    expect(ViewContainerService.isCollapsed(PLUGIN_ID, "declared")).toBe(false);

    ViewContainerService.setCollapsed(PLUGIN_ID, "declared", true);
    expect(buildEffectiveCollapsedViewIds()).toEqual(["declared"]);
    expect(ViewContainerService.loadExpandedKeys().has(`${PLUGIN_ID}:declared`)).toBe(false);
  });

  it("隐藏视图折叠态一并保留——隐藏再显示不丢（不用 getActiveViews 过滤）", () => {
    registerSidebar();
    ViewContainerService.setVisible("explorer", "plain", false);
    ViewContainerService.setCollapsed(PLUGIN_ID, "plain", true);
    expect(buildEffectiveCollapsedViewIds()).toContain("plain");
  });

  it("只收 sidebar/auxiliarybar——面板容器不参与（面板无 section 折叠语义）", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "demo-plugin", title: "面板演示", location: "panel" });
    ViewContainerService.registerView(PLUGIN_ID, "demo-plugin", makeView({ id: "demo-output", title: "输出", collapsed: true }));
    expect(buildEffectiveCollapsedViewIds()).toEqual([]);
  });

  it("同名视图复合键各存各的——只折叠其一，集合只收被折的那个", () => {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "explorer", title: "资源管理器", location: "sidebar" });
    ViewContainerService.registerView(PLUGIN_ID, "explorer", makeView({ id: "fold", title: "折叠" }));
    ViewContainerService.registerViewContainer("switcher-test-2", { id: "explorer-2", title: "另一容器", location: "sidebar" });
    ViewContainerService.registerView("switcher-test-2", "explorer-2", makeView({ id: "fold", title: "折叠" }));

    ViewContainerService.setCollapsed("switcher-test-2", "fold", true);
    // 集合是裸 viewId（zone 级扁平契约）——但只有被折叠的那份被收录：集合大小 1 证明判定走复合键
    expect(buildEffectiveCollapsedViewIds()).toEqual(["fold"]);
    ViewContainerService.unregisterAll("switcher-test-2");
  });
});
