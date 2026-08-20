/**
 * panelCommands 测试——E5.8#37.6 侧栏换边命令。
 * 覆盖：toggleSidebarPosition 执行 → 主侧栏换对边 + rightSidebar 双槽互换（swap 规则）。
 * 命令 = 切到对边（toggle 语义）；真相源 = LayoutEngine dock.edge。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { clearRegistrationLayers } from "../../registry/registrationTracker";
import { executeCommand, clearCommands } from "../../registry/commands/CommandRegistry";
import { layoutEngine } from "../../services/layout/LayoutEngine";
import { registerPanelCommands } from "./panelCommands";

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
