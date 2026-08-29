/**
 * 壳级右键菜单注册——ExtensionGear / TabContext / MenuBar / SettingItemGear 等。
 * E5#44-6：从 coreCommands.ts 提取。菜单项通过命令 ID 引用命令——命令由各自模块注册。
 */

import { registerCommand } from "../../registry/commands/CommandRegistry";
import { registerMenuItems, MENU_SLOTS } from "../../registry/commands/MenuRegistry";
import { shellEvents } from "../../react/events/ShellEvents";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";

export function registerShellMenus(): void {
  // ── ☰ 菜单栏 ──
  registerMenuItems(MENU_SLOTS.MenuBar, APP_PLUGIN_ID, [
    {
      command: "",
      label: "文件",
      group: "file",
      children: [
        { command: "workbench.action.exportWorkspace", group: "file" },
        { command: "workbench.action.importWorkspace", group: "file" },
        { command: "core.openSettings", group: "file" },
      ],
    },
    {
      command: "",
      label: "查看",
      group: "view",
      children: [
        { command: "workbench.action.showCommands", group: "view" },
        { command: "workbench.action.showOutput", group: "view" },
        { command: "theme.pick", group: "view" }, // E5.8#50.24：theme.pick 归一化命令 id
        { command: "workbench.action.selectLanguage", group: "view" },
        { command: "workbench.action.openKeybindingsSettings", group: "view" },
        // E5.8#37.6：侧栏换边——双 when 门控菜单项（左边 → 显示「移动到右侧」；右边 → 显示「移动到左侧」，
        // 同命令 toggleSidebarPosition，当开关至多一项显示）。when 壳侧一站式过滤
        // （菜单栏序列化 buildTitleBarMenuGroups / 汉堡 / ui.ts getItems）——sidebarPosition
        // context key 由 usePoolSync 随布局推送保持同步。
        { command: "workbench.action.toggleSidebarPosition", label: "移动到右侧", group: "view", when: "sidebarPosition == 'left'" },
        { command: "workbench.action.toggleSidebarPosition", label: "移动到左侧", group: "view", when: "sidebarPosition == 'right'" },
        // E5.8#148：「界面」嵌套子菜单——zone 显隐勾选菜单（对标 VS Code 查看→面板 显隐区）。
        // 主侧栏/面板 两命令 = 显隐 toggle（emit sidebar:toggle / panel:toggle）；勾选态由壳
        // buildTitleBarMenuGroups/汉堡 经 resolveVisibilityChecked 序列化（zone 可见 = ✓）。
        // 递归渲染：顶部下拉 = 查看→界面 两级；汉堡 = 查看→界面 两级（全链路 ContextMenu 递归 #148）。
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

  // ── 设置项齿轮 ──
  registerMenuItems(MENU_SLOTS.SettingItemGear, APP_PLUGIN_ID, [
    { command: "workbench.action.copySettingAsUrl", group: "phase6", when: "false" },
    { command: "workbench.action.toggleSettingSync", group: "phase6", when: "false" },
  ]);

  // ── E5#44c：View header 右键菜单——提供方注册，消费方（SidePanel）只读 menuId ──
  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.toggleContainerCollapse",
    title: "折叠",
    category: "视图",
    handler: async (...args: unknown[]) => {
      const ctx = args[0] as { containerId?: string } | undefined;
      if (ctx?.containerId) shellEvents.emit("view:toggleCollapse", { containerId: ctx.containerId });
    },
  });
  // E5.7#84：侧栏显隐切换（VS Code 标准 Ctrl+B）——矩阵场景 1 验证点「折叠/展开」。
  // 归一化：emit sidebar:toggle 复用池 ◀/▶ 按钮同一转发链（App 侧栏宿主状态机 doCollapse），
  // 零第二套状态——命令只做入口，真相源仍在 zone 宽。
  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.toggleSidebarVisibility",
    title: "切换侧栏可见性",
    category: "视图",
    handler: async () => {
      shellEvents.emit("sidebar:toggle", undefined);
    },
  });

  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.resetContainerPosition",
    title: "重置位置",
    category: "视图",
    handler: async (...args: unknown[]) => {
      const ctx = args[0] as { containerId?: string } | undefined;
      if (ctx?.containerId) shellEvents.emit("view:resetPosition", { containerId: ctx.containerId });
    },
  });

  // E5#44d：view 显隐切换命令——Views 子菜单的每个条目用它
  registerCommand(APP_PLUGIN_ID, {
    id: "workbench.action.toggleViewVisibility",
    title: "切换视图可见性",
    category: "视图",
    handler: async (...args: unknown[]) => {
      const ctx = args[0] as { viewId?: string; containerId?: string } | undefined;
      if (ctx?.viewId) shellEvents.emit("view:toggleVisibility", { viewId: ctx.viewId, containerId: ctx.containerId });
    },
  });

  registerMenuItems(MENU_SLOTS.ViewTitleContext, APP_PLUGIN_ID, [
    { command: "workbench.action.toggleContainerCollapse", group: "navigation" },
    { command: "workbench.action.resetContainerPosition", group: "navigation" },
    // E5.8#37.6：侧栏换边——双 when 门控（当开关至多一项显示），同命令 toggleSidebarPosition。
    // when 过滤壳侧一站式（ui.ts getItems 的 menu:getItems）——sidebarPosition context key
    // 由 usePoolSync 随布局推送保持同步（折叠/重置位置/视图同组 = 侧栏 title 右键）。
    { command: "workbench.action.toggleSidebarPosition", label: "移动到右侧", group: "navigation", when: "sidebarPosition == 'left'" },
    { command: "workbench.action.toggleSidebarPosition", label: "移动到左侧", group: "navigation", when: "sidebarPosition == 'right'" },
    // E5#44d：Views 子菜单——空 children 触发 ContextMenu.resolveChildren 回调
    { command: "", label: "视图", group: "views", children: [] },
  ]);
}
