/**
 * titlebar 菜单栏序列化测试——E5.8#148 界面显隐勾选 + group:"panel" 归并。
 *
 * 覆盖：E5.8#148「查看→界面」嵌套子菜单的勾选态序列化（zone 可见 = ✓，buildTitleBarMenuGroups/
 * buildHamburgerMenuGroups 经 resolveVisibilityChecked）/ 面板顶级招牌删除后无 "panel" 组 /
 * 插件 contributes.menus.menuBar + group:"panel" 自动归并 / 插件 contributes.menus.panel（新槽直连）同样归并 /
 * 汉堡菜单同样归并（父项不展平）/ E5.8#37.6 when 过滤（对换菜单当开关至多一项显示）。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { clearRegistrationLayers } from "../../core/registry/registrationTracker";
import { registerCommand, clearCommands } from "../../core/registry/commands/CommandRegistry";
import { registerMenuItems, MENU_SLOTS, clearMenus } from "../../core/registry/commands/MenuRegistry";
import { ContextKeyService } from "../../core/registry/commands/ContextKeyService"; // E5.8#37.6：when 过滤全局 context key
import { buildTitleBarMenuGroups, buildHamburgerMenuGroups } from "./titlebar";

const SHELL = "linkdesk.shell";
const PLUGIN = "panel-plugin";
const id = (s: string) => s;
/** E5.8#148：zone 显隐勾选上下文——buildTitleBarMenuGroups/汉堡 第二参（真实调用 usePoolSync 传 App state） */
const VIS = (panelVisible: boolean, sidebarVisible: boolean) => ({ panelVisible, sidebarVisible });

/** 注册壳侧 文件/查看 顶级菜单——shellMenus.ts 同款形状（查看含 #148「界面」子菜单） */
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
      children: [
        { command: "workbench.action.showCommands", group: "view" },
        {
          command: "",
          label: "界面",
          group: "view",
          children: [
            { command: "workbench.action.toggleSidebarVisibility", label: "主侧栏", group: "view" },
            { command: "workbench.action.togglePanel", label: "面板", group: "view" },
          ],
        },
      ],
    },
  ]);
}

describe("buildTitleBarMenuGroups（E5.8#148 面板招牌删除 + group:\"panel\" 归并保留）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
  });

  it("无面板槽 + 无 group:\"panel\" 项 → 无 \"panel\" 组（招牌已删，面板入口在 查看→界面）", () => {
    registerShellFileViewMenus();

    const groups = buildTitleBarMenuGroups(id, VIS(true, true));
    expect(groups.find((g) => g.group === "panel")).toBeUndefined();
    expect(groups.map((g) => g.group)).toEqual(["file", "view"]);
  });

  it("插件 contributes.menus.menuBar + group:\"panel\" 自动归并——无招牌时独立成组，标签回退 groupName", () => {
    registerShellFileViewMenus();
    registerMenuItems(MENU_SLOTS.MenuBar, PLUGIN, [{ command: "panel-plugin.newTerminal", group: "panel" }]);
    registerCommand(PLUGIN, { id: "panel-plugin.newTerminal", title: "新建终端", handler: async () => {} });

    const panel = buildTitleBarMenuGroups(id, VIS(true, true)).find((g) => g.group === "panel")!;
    expect(panel).toBeDefined();
    expect(panel.label).toBe("panel"); // 无招牌父项 → 组标签回退 groupName
    expect(panel.items).toEqual([{ label: "新建终端", command: "panel-plugin.newTerminal" }]);
  });

  it("插件 contributes.menus.panel（新槽直连）同样自动归并", () => {
    registerMenuItems(MENU_SLOTS.Panel, PLUGIN, [{ command: "panel-plugin.showOutput", group: "panel" }]);
    registerCommand(PLUGIN, { id: "panel-plugin.showOutput", title: "显示输出", handler: async () => {} });

    const panel = buildTitleBarMenuGroups(id, VIS(true, true)).find((g) => g.group === "panel")!;
    expect(panel.items.map((i) => i.command)).toEqual(["panel-plugin.showOutput"]);
  });
});

describe("E5.8#148 界面显隐勾选子菜单——checked 序列化（zone 可见 = ✓）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
  });

  /** 断言「查看」组里「界面」子项的两个勾选叶子——0 = 主侧栏 / 1 = 面板 */
  function findUiSubmenu(viewItems: Array<{ label?: string; command?: string; children?: Array<{ label: string; command: string; checked?: boolean }> }>) {
    return viewItems.find((i) => i.label === "界面")!.children!;
  }

  it("顶部菜单栏——侧栏可见 + 面板隐藏 → 主侧栏 ✓ / 面板空白", () => {
    registerShellFileViewMenus();

    const view = buildTitleBarMenuGroups(id, VIS(false, true)).find((g) => g.group === "view")!;
    const ui = findUiSubmenu(view.items);
    expect(ui[0]).toEqual({ label: "主侧栏", command: "workbench.action.toggleSidebarVisibility", checked: true });
    expect(ui[1]).toEqual({ label: "面板", command: "workbench.action.togglePanel", checked: false });
  });

  it("顶部菜单栏——状态翻转 → 勾选翻转（zone 显隐变化即重推 ✓）", () => {
    registerShellFileViewMenus();

    const view = buildTitleBarMenuGroups(id, VIS(true, false)).find((g) => g.group === "view")!;
    const ui = findUiSubmenu(view.items);
    expect(ui[0].checked).toBe(false);
    expect(ui[1].checked).toBe(true);
  });

  it("汉堡同款——界面嵌套子项同样勾选（递归 resolveItemNode 序列化）", () => {
    registerShellFileViewMenus();

    const view = buildHamburgerMenuGroups(id, VIS(true, false)).find((g) => g.group === "view")!;
    // 汉堡不展平——「查看」父项保留，子面板含「界面」父项，再展开是两勾选叶子
    const viewParent = view.items[0];
    expect(viewParent).toMatchObject({ label: "查看", command: "" });
    const ui = findUiSubmenu(viewParent.children ?? []);
    expect(ui[0]).toEqual({ label: "主侧栏", command: "workbench.action.toggleSidebarVisibility", checked: false });
    expect(ui[1]).toEqual({ label: "面板", command: "workbench.action.togglePanel", checked: true });
  });

  it("界面父项自身不带 checked（无命令无谓词命中 → undefined 省略）", () => {
    registerShellFileViewMenus();

    const view = buildTitleBarMenuGroups(id, VIS(true, true)).find((g) => g.group === "view")!;
    const uiParent = view.items.find((i) => i.label === "界面")!;
    expect(uiParent).toMatchObject({ command: "" });
    expect("checked" in uiParent).toBe(false);
  });
});

describe("when 过滤（E5.8#37.6 侧栏换边菜单项——当开关至多一项显示）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
    ContextKeyService.clear();
  });

  /** 注册完整「查看」组 + 换边双 when 门控项——shellMenus.ts 同款形状（菜单栏/汉堡共用 MenuBar 槽） */
  function registerViewMenuWithToggle(): void {
    registerMenuItems(MENU_SLOTS.MenuBar, SHELL, [
      {
        command: "",
        label: "查看",
        group: "view",
        children: [
          { command: "workbench.action.showCommands", group: "view" },
          { command: "workbench.action.toggleSidebarPosition", label: "移动到右侧", group: "view", when: "sidebarPosition == 'left'" },
          { command: "workbench.action.toggleSidebarPosition", label: "移动到左侧", group: "view", when: "sidebarPosition == 'right'" },
        ],
      },
    ]);
    registerCommand(SHELL, { id: "workbench.action.toggleSidebarPosition", title: "切换侧栏位置", handler: async () => {} });
  }

  it("菜单栏「查看」——sidebarPosition=left → 只显示「移动到右侧」；=right → 只显示「移动到左侧」", () => {
    registerViewMenuWithToggle();

    ContextKeyService.setValue("sidebarPosition", "left");
    const left = buildTitleBarMenuGroups(id, VIS(true, true)).find((g) => g.group === "view")!;
    expect(left.items.filter((i) => i.command === "workbench.action.toggleSidebarPosition"))
      .toEqual([{ label: "移动到右侧", command: "workbench.action.toggleSidebarPosition" }]);

    ContextKeyService.setValue("sidebarPosition", "right");
    const right = buildTitleBarMenuGroups(id, VIS(true, true)).find((g) => g.group === "view")!;
    expect(right.items.filter((i) => i.command === "workbench.action.toggleSidebarPosition"))
      .toEqual([{ label: "移动到左侧", command: "workbench.action.toggleSidebarPosition" }]);
  });

  it("汉堡同款——when 不满足项隐藏（原灰显）", () => {
    registerViewMenuWithToggle();

    ContextKeyService.setValue("sidebarPosition", "left");
    const view = buildHamburgerMenuGroups(id, VIS(true, true)).find((g) => g.group === "view")!;
    // 父项保留（汉堡不展平）——子面板只含 when 命中的换边项（另一项被过滤隐藏）
    expect(view.items[0].children!.filter((c) => c.command === "workbench.action.toggleSidebarPosition"))
      .toEqual([{ label: "移动到右侧", command: "workbench.action.toggleSidebarPosition" }]);
  });
});
