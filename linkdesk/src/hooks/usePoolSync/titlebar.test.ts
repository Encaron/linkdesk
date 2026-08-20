/**
 * titlebar 菜单栏序列化测试——E5.8#33 菜单栏「面板」菜单归并。
 *
 * 覆盖：壳招牌「面板/打开面板」→ 面板顶级菜单（order 100 排文件/查看后）/
 * 插件 contributes.menus.menuBar + group:"panel" 自动归并 / 插件 contributes.menus.panel（新槽直连）同样归并 /
 * 招牌项在菜单首位（面板槽在前）+ 组标签不被插件项抢 / 汉堡菜单同样归并（父项不展平）。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { clearRegistrationLayers } from "../../core/registry/registrationTracker";
import { registerCommand, clearCommands } from "../../core/registry/commands/CommandRegistry";
import { registerMenuItems, MENU_SLOTS, clearMenus } from "../../core/registry/commands/MenuRegistry";
import { buildTitleBarMenuGroups, buildHamburgerMenuGroups } from "./titlebar";

const SHELL = "linkdesk.shell";
const PLUGIN = "panel-plugin";
const id = (s: string) => s;

/** 注册壳侧面板招牌——panelCommands.ts 同款形状（E5.8#33） */
function registerShellPanelMenu(): void {
  registerMenuItems(MENU_SLOTS.Panel, SHELL, [
    {
      command: "",
      label: "面板",
      group: "panel",
      order: 100,
      children: [{ command: "workbench.action.togglePanel", label: "打开面板", group: "panel" }],
    },
  ]);
}

/** 注册壳侧 文件/查看 顶级菜单——shellMenus.ts 同款形状 */
function registerShellFileViewMenus(): void {
  registerMenuItems(MENU_SLOTS.MenuBar, SHELL, [
    {
      command: "",
      label: "文件",
      group: "file",
      children: [{ command: "workbench.action.exportWorkspace", group: "file" }],
    },
    {
      command: "",
      label: "查看",
      group: "view",
      children: [{ command: "workbench.action.showCommands", group: "view" }],
    },
  ]);
}

/** 壳招牌命令——togglePanel（panelCommands.ts 注册） */
function registerTogglePanelCommand(): void {
  registerCommand(SHELL, {
    id: "workbench.action.togglePanel",
    title: "切换底部面板可见性",
    handler: async () => {},
  });
}

describe("buildTitleBarMenuGroups（E5.8#33 面板菜单）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
  });

  it("壳招牌 → 面板顶级菜单，item = 打开面板（togglePanel 同命令）", () => {
    registerShellPanelMenu();
    registerTogglePanelCommand();

    const groups = buildTitleBarMenuGroups(id);
    const panel = groups.find((g) => g.group === "panel");
    expect(panel).toBeDefined();
    expect(panel!.label).toBe("面板");
    expect(panel!.items).toEqual([{ label: "打开面板", command: "workbench.action.togglePanel" }]);
  });

  it("插件 contributes.menus.menuBar + group:\"panel\" 自动归并——招牌首位，组序 文件/查看/面板", () => {
    registerShellPanelMenu();
    registerShellFileViewMenus();
    registerTogglePanelCommand();
    // 插件声明（loader 从 contributes.menus 转 registerMenuItems）——插件侧零改动，group:"panel" 即归并
    registerMenuItems(MENU_SLOTS.MenuBar, PLUGIN, [{ command: "panel-plugin.newTerminal", group: "panel" }]);
    registerCommand(PLUGIN, { id: "panel-plugin.newTerminal", title: "新建终端", handler: async () => {} });

    const groups = buildTitleBarMenuGroups(id);
    const panel = groups.find((g) => g.group === "panel")!;
    expect(panel.label).toBe("面板"); // 组标签 = 壳招牌父项，不被插件项抢
    expect(panel.items).toEqual([
      { label: "打开面板", command: "workbench.action.togglePanel" },
      { label: "新建终端", command: "panel-plugin.newTerminal" },
    ]);
    expect(groups.map((g) => g.group)).toEqual(["file", "view", "panel"]);
  });

  it("插件 contributes.menus.panel（新槽直连）同样自动归并", () => {
    registerShellPanelMenu();
    registerTogglePanelCommand();
    registerMenuItems(MENU_SLOTS.Panel, PLUGIN, [{ command: "panel-plugin.showOutput", group: "panel" }]);
    registerCommand(PLUGIN, { id: "panel-plugin.showOutput", title: "显示输出", handler: async () => {} });

    const panel = buildTitleBarMenuGroups(id).find((g) => g.group === "panel")!;
    expect(panel.items.map((i) => i.command)).toEqual(["workbench.action.togglePanel", "panel-plugin.showOutput"]);
  });

  it("无壳招牌时组标签回退 groupName（行为不变）", () => {
    registerMenuItems(MENU_SLOTS.MenuBar, PLUGIN, [{ command: "panel-plugin.only", group: "panel" }]);
    registerCommand(PLUGIN, { id: "panel-plugin.only", title: "仅插件项", handler: async () => {} });

    const panel = buildTitleBarMenuGroups(id).find((g) => g.group === "panel")!;
    expect(panel.label).toBe("panel");
  });
});

describe("buildHamburgerMenuGroups（E5.8#33 汉堡同样归并）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
  });

  it("面板槽招牌 → 汉堡面板组——父项保留（不展平），子项 = 打开面板", () => {
    registerShellPanelMenu();
    registerTogglePanelCommand();

    const panel = buildHamburgerMenuGroups(id).find((g) => g.group === "panel")!;
    expect(panel.label).toBe("面板");
    // 汉堡不展平——父项（command 空 + children）保留，hover 弹出子面板
    expect(panel.items[0]).toMatchObject({ label: "面板", command: "" });
    expect(panel.items[0].children).toEqual([{ label: "打开面板", command: "workbench.action.togglePanel" }]);
  });
});
