/**
 * panelCommands 测试——E5.8#37.6 侧栏换边 + #37.7 面板位置/对齐命令 + 当前项 √。
 * 覆盖：
 *   - toggleSidebarPosition 执行 → 主侧栏换对边 + rightSidebar 双槽互换（swap 规则）。
 *   - positionPanel ×4 / alignPanel ×4 执行 → dockTo/setAlign + 同边/同对齐 no-op（单选语义）。
 *   - resolvePanelChecked——位置/对齐命令 → 当前 edge/align 命中项 true（getItems 桥的 √ 解析）。
 *   - menu:getItems("panelViewContext") 端到端——子项 checked 壳侧解析透传（wire 契约）。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { clearRegistrationLayers } from "../../registry/registrationTracker";
import { executeCommand, clearCommands } from "../../registry/commands/CommandRegistry";
import { clearMenus } from "../../registry/commands/MenuRegistry";
import type { MenuItemDescriptor } from "../../api/linkdesk-api";
import { handleSettingsChannel } from "../../services/plugins/IpcBridgeHandler/ui"; // #37.7：getItems 桥 checked 解析
import { layoutEngine } from "../../services/layout/LayoutEngine";
import { registerPanelCommands, resolvePanelChecked } from "./panelCommands";

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
