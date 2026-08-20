/**
 * panelCommands 测试——E5.8#37.6 侧栏换边 + #37.7 面板位置/对齐命令 + 当前项 √。
 * 覆盖：
 *   - toggleSidebarPosition 执行 → 主侧栏换对边 + rightSidebar 双槽互换（swap 规则）。
 *   - positionPanel ×4 / alignPanel ×4 执行 → dockTo/setAlign + 同边/同对齐 no-op（单选语义）。
 *   - resolvePanelChecked——位置/对齐命令 → 当前 edge/align 命中项 true（getItems 桥的 √ 解析）。
 *   - menu:getItems("panelViewContext") 端到端——子项 checked 壳侧解析透传（wire 契约）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { clearRegistrationLayers } from "../../registry/registrationTracker";
import { executeCommand, clearCommands } from "../../registry/commands/CommandRegistry";
import { clearMenus } from "../../registry/commands/MenuRegistry";
import { ContextKeyService } from "../../registry/commands/ContextKeyService"; // #37.6 回归：换边当开关 when 门控
import type { MenuItemDescriptor } from "../../api/linkdesk-api";
import { handleSettingsChannel } from "../../services/plugins/IpcBridgeHandler/ui"; // #37.7：getItems 桥 checked 解析
import { layoutEngine, narrowSidebarEdge } from "../../services/layout/LayoutEngine";
import { ViewContainerService } from "../../services/layout/ViewContainerService"; // #37.7.1：面板视图清单数据源
import { clearPluginStates } from "../../services/plugins/PluginStateService"; // #37.7.1：setVisible 落盘测试隔离
import { registerPanelCommands, resolvePanelChecked } from "./panelCommands";
import { registerShellMenus } from "../input-bindings/shellMenus"; // #37.6 回归：viewTitleContext 双 when 门控项真源

/** 重置全局引擎——E5 默认 5 zone + rightSidebar（swap 规则消费方） */
function resetEngine(): void {
  layoutEngine.setLayout([
    { zone: "iconbar", dock: { edge: "left", width: 42, minWidth: 42, maxWidth: 42 } },
    { zone: "sidebar", dock: { edge: "left", width: 280, minWidth: 170, maxWidth: 600 } },
    { zone: "main", dock: { edge: "center", flex: 1 } },
    { zone: "panel", dock: { edge: "bottom", height: 220, minHeight: 120, maxHeight: 600 } },
    { zone: "statusbar", dock: { edge: "bottom", height: 24 } },
    { zone: "rightSidebar", dock: { edge: "right", width: 300, minWidth: 180, maxWidth: 600 } },
  ]);
  layoutEngine.setContainerSize(1200, 800);
}

describe("registerPanelCommands——toggleSidebarPosition（E5.8#37.6）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
    resetEngine();
    registerPanelCommands();
  });

  it("sidebar 在左 → 执行 → 换到右 + rightSidebar 自动跳左（swap 规则）", async () => {
    expect(layoutEngine.getZone("sidebar")?.dock?.edge).toBe("left");
    expect(layoutEngine.getZone("rightSidebar")?.dock?.edge).toBe("right");

    await executeCommand("workbench.action.toggleSidebarPosition");

    expect(layoutEngine.getZone("sidebar")?.dock?.edge).toBe("right");
    expect(layoutEngine.getZone("rightSidebar")?.dock?.edge).toBe("left");
  });

  it("sidebar 在右 → 执行 → 换回左 + rightSidebar 回右", async () => {
    layoutEngine.dockTo("sidebar", "right");
    expect(layoutEngine.getZone("sidebar")?.dock?.edge).toBe("right");

    await executeCommand("workbench.action.toggleSidebarPosition");

    expect(layoutEngine.getZone("sidebar")?.dock?.edge).toBe("left");
    expect(layoutEngine.getZone("rightSidebar")?.dock?.edge).toBe("right");
  });

  it("不改变面板/主区等非侧栏 zone 的 edge", async () => {
    await executeCommand("workbench.action.toggleSidebarPosition");
    expect(layoutEngine.getZone("panel")?.dock?.edge).toBe("bottom");
    expect(layoutEngine.getZone("main")?.dock?.edge).toBe("center");
  });
});

/** 便捷——取某子菜单父项下指定命令的子项（wire children 是 string | MenuItemDescriptor 联合） */
function childOf(parent: MenuItemDescriptor | undefined, command: string): MenuItemDescriptor | undefined {
  return parent?.children?.find(
    (c): c is MenuItemDescriptor => c instanceof Object && c.command === command,
  );
}

describe("registerPanelCommands——positionPanel*/alignPanel*（E5.8#37.7）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
    resetEngine();
    registerPanelCommands();
  });

  it("positionPanelTop → dockTo top；再 Bottom → 回底部", async () => {
    expect(layoutEngine.getZone("panel")?.dock?.edge).toBe("bottom");
    await executeCommand("workbench.action.positionPanelTop");
    expect(layoutEngine.getZone("panel")?.dock?.edge).toBe("top");
    await executeCommand("workbench.action.positionPanelBottom");
    expect(layoutEngine.getZone("panel")?.dock?.edge).toBe("bottom");
  });

  it("positionPanelLeft/Right → 竖条左/右（5 带排布）", async () => {
    await executeCommand("workbench.action.positionPanelLeft");
    expect(layoutEngine.getZone("panel")?.dock?.edge).toBe("left");
    await executeCommand("workbench.action.positionPanelRight");
    expect(layoutEngine.getZone("panel")?.dock?.edge).toBe("right");
  });

  it("同边 no-op——面板已在顶部执行 positionPanelTop → dockTo 不被调用", async () => {
    layoutEngine.dockTo("panel", "top");
    const spy = vi.spyOn(layoutEngine, "dockTo");
    await executeCommand("workbench.action.positionPanelTop");
    expect(spy).not.toHaveBeenCalled();
    expect(layoutEngine.getZone("panel")?.dock?.edge).toBe("top");
  });

  it("alignPanel 四命令——两端/左/右/居中 setAlign", async () => {
    await executeCommand("workbench.action.alignPanelJustify");
    expect(layoutEngine.getZone("panel")?.dock?.align).toBe("justify");
    await executeCommand("workbench.action.alignPanelLeft");
    expect(layoutEngine.getZone("panel")?.dock?.align).toBe("left");
    await executeCommand("workbench.action.alignPanelRight");
    expect(layoutEngine.getZone("panel")?.dock?.align).toBe("right");
    await executeCommand("workbench.action.alignPanelCenter");
    expect(layoutEngine.getZone("panel")?.dock?.align).toBe("center");
  });

  it("同对齐 no-op——面板已 justify 执行 alignPanelJustify → setAlign 不被调用", async () => {
    layoutEngine.setAlign("panel", "justify");
    const spy = vi.spyOn(layoutEngine, "setAlign");
    await executeCommand("workbench.action.alignPanelJustify");
    expect(spy).not.toHaveBeenCalled();
    expect(layoutEngine.getZone("panel")?.dock?.align).toBe("justify");
  });
});

describe("resolvePanelChecked——当前项 √ 单选解析（E5.8#37.7）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
    resetEngine();
    registerPanelCommands();
  });

  it("默认 bottom + align 缺省 → 底部 true；其余位置 false", () => {
    expect(resolvePanelChecked("workbench.action.positionPanelBottom")).toBe(true);
    expect(resolvePanelChecked("workbench.action.positionPanelTop")).toBe(false);
    expect(resolvePanelChecked("workbench.action.positionPanelLeft")).toBe(false);
    expect(resolvePanelChecked("workbench.action.positionPanelRight")).toBe(false);
  });

  it("dockTo top + setAlign justify 后 → 顶部/两端对齐 true，其余 false", () => {
    layoutEngine.dockTo("panel", "top");
    layoutEngine.setAlign("panel", "justify");
    expect(resolvePanelChecked("workbench.action.positionPanelTop")).toBe(true);
    expect(resolvePanelChecked("workbench.action.positionPanelBottom")).toBe(false);
    expect(resolvePanelChecked("workbench.action.alignPanelJustify")).toBe(true);
    expect(resolvePanelChecked("workbench.action.alignPanelCenter")).toBe(false);
  });

  it("非面板位置/对齐命令 → false（不误判）", () => {
    expect(resolvePanelChecked("workbench.action.togglePanel")).toBe(false);
    expect(resolvePanelChecked("workbench.action.toggleSidebarPosition")).toBe(false);
  });
});

describe("panelViewContext getItems——checked 壳侧解析透传（E5.8#37.7 wire 契约）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
    resetEngine();
    registerPanelCommands();
  });

  it("默认 bottom + align 缺省 → 「底部」√、其余位置 ✗、对齐项全 ✗（align 未设 undefined !== center）", async () => {
    const items = await handleSettingsChannel("menu:getItems", ["panelViewContext", undefined]) as MenuItemDescriptor[];
    const pos = items.find((i) => i.label === "面板位置");
    const alignMenu = items.find((i) => i.label === "对齐面板");
    expect(pos?.children?.length).toBe(4);
    expect(alignMenu?.children?.length).toBe(4);
    expect(childOf(pos, "workbench.action.positionPanelBottom")?.checked).toBe(true);
    expect(childOf(pos, "workbench.action.positionPanelTop")?.checked).toBe(false);
    expect(childOf(alignMenu, "workbench.action.alignPanelCenter")?.checked).toBe(false);
  });

  it("dockTo top + setAlign justify → getItems 顶部/两端对齐 √", async () => {
    layoutEngine.dockTo("panel", "top");
    layoutEngine.setAlign("panel", "justify");
    const items = await handleSettingsChannel("menu:getItems", ["panelViewContext", undefined]) as MenuItemDescriptor[];
    const pos = items.find((i) => i.label === "面板位置")!;
    const alignMenu = items.find((i) => i.label === "对齐面板")!;
    expect(childOf(pos, "workbench.action.positionPanelTop")?.checked).toBe(true);
    expect(childOf(pos, "workbench.action.positionPanelBottom")?.checked).toBe(false);
    expect(childOf(alignMenu, "workbench.action.alignPanelJustify")?.checked).toBe(true);
    expect(childOf(alignMenu, "workbench.action.alignPanelCenter")?.checked).toBe(false);
  });
});

describe("panelViewContext getItems——视图显隐清单动态注入（E5.8#37.7.1）", () => {
  const PLUGIN_ID = "panel-views-test";
  const dummy = () => null;

  /** 注册面板容器 + 两视图（默认可见）——单一声明面：插件声明视图即自动进清单 */
  function seedPanelViews(): void {
    ViewContainerService.registerViewContainer(PLUGIN_ID, { id: "panel-out", title: "输出", location: "panel" });
    ViewContainerService.registerView(PLUGIN_ID, "panel-out", { id: "out-log", title: "输出日志", render: dummy });
    ViewContainerService.registerView(PLUGIN_ID, "panel-out", { id: "out-problems", title: "问题", render: dummy });
  }

  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
    resetEngine();
    registerPanelCommands();
    seedPanelViews();
  });

  afterEach(() => {
    ViewContainerService.unregisterAll(PLUGIN_ID);
    clearPluginStates(); // setVisible 落盘——清隐藏持久化防跨测试泄漏
  });

  it("视图清单 = 面板容器全部视图，与位置/对齐同级（顶层项，非子菜单），默认全可见 ✓", async () => {
    const items = await handleSettingsChannel("menu:getItems", ["panelViewContext", undefined]) as MenuItemDescriptor[];
    const views = items.filter((i) => i.command === "workbench.action.togglePanelViewVisibility");
    expect(views).toHaveLength(2);
    expect(views[0]).toMatchObject({ label: "输出日志", group: "panelViews", checked: true, commandArgs: ["panel-out", "out-log"] });
    expect(views[1]).toMatchObject({ label: "问题", group: "panelViews", checked: true, commandArgs: ["panel-out", "out-problems"] });
  });

  it("点击 = 显隐往返——toggle 命令携 commandArgs 执行 → visible 翻转 → getItems ✓ 跟随", async () => {
    // 隐藏 out-log（模拟点击清单项）
    await executeCommand("workbench.action.togglePanelViewVisibility", undefined, "panel-out", "out-log");
    expect(ViewContainerService.isVisible("panel-out", "out-log")).toBe(false);
    expect(ViewContainerService.isVisible("panel-out", "out-problems")).toBe(true);

    // 重开菜单 → out-log ✗、out-problems ✓（打勾集合 = 标签栏 tab 集合，两端状态一致）
    const items = await handleSettingsChannel("menu:getItems", ["panelViewContext", undefined]) as MenuItemDescriptor[];
    const views = items.filter((i) => i.command === "workbench.action.togglePanelViewVisibility");
    expect(views.find((v) => (v.commandArgs as string[])[1] === "out-log")?.checked).toBe(false);
    expect(views.find((v) => (v.commandArgs as string[])[1] === "out-problems")?.checked).toBe(true);

    // 再点 → 恢复可见
    await executeCommand("workbench.action.togglePanelViewVisibility", undefined, "panel-out", "out-log");
    expect(ViewContainerService.isVisible("panel-out", "out-log")).toBe(true);
  });

  it("缺参守卫——containerId/viewId 非字符串 → 不动作（坏值不崩）", async () => {
    await executeCommand("workbench.action.togglePanelViewVisibility", undefined);
    expect(ViewContainerService.isVisible("panel-out", "out-log")).toBe(true);
  });

  it("空面板容器（无贡献视图）→ 无视图项（壳侧不推空清单）", async () => {
    ViewContainerService.unregisterAll(PLUGIN_ID);
    clearPluginStates();
    const items = await handleSettingsChannel("menu:getItems", ["panelViewContext", undefined]) as MenuItemDescriptor[];
    expect(items.filter((i) => i.command === "workbench.action.togglePanelViewVisibility")).toHaveLength(0);
  });
});

describe("viewTitleContext getItems——侧栏换边双 when 门控（E5.8#37.6 回归）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
    ContextKeyService.clear(); // 当开关 context key 重置——防跨测试污染
    resetEngine();
    registerPanelCommands(); // toggleSidebarPosition 命令（menu item 引用）
    registerShellMenus();    // viewTitleContext 双 when 门控项真源（shellMenus.ts 原样）
  });

  it("sidebar=left → 只显示「移动到右侧」；dockTo right 后 → 只显示「移动到左侧」", async () => {
    // 初始在左——「移动到右侧」项 when="sidebarPosition == 'left'" 命中
    ContextKeyService.setValue("sidebarPosition", narrowSidebarEdge(layoutEngine.getZone("sidebar")?.dock?.edge));
    let items = await handleSettingsChannel("menu:getItems", ["viewTitleContext", undefined]) as MenuItemDescriptor[];
    let toggle = items.filter((i) => i.command === "workbench.action.toggleSidebarPosition");
    expect(toggle).toHaveLength(1);
    expect(toggle[0].label).toBe("移动到右侧");

    // 换到右——「移动到左侧」项 when="sidebarPosition == 'right'" 命中，另一项被过滤
    layoutEngine.dockTo("sidebar", "right");
    ContextKeyService.setValue("sidebarPosition", narrowSidebarEdge(layoutEngine.getZone("sidebar")?.dock?.edge));
    items = await handleSettingsChannel("menu:getItems", ["viewTitleContext", undefined]) as MenuItemDescriptor[];
    toggle = items.filter((i) => i.command === "workbench.action.toggleSidebarPosition");
    expect(toggle).toHaveLength(1);
    expect(toggle[0].label).toBe("移动到左侧");
  });
});
