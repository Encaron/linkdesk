/**
 * 壳级右键菜单注册——ExtensionGear / TabContext / MenuBar / SettingItemGear 等。
 * E5#44-6：从 coreCommands.ts 提取。菜单项通过命令 ID 引用命令——命令由各自模块注册。
 */

import { registerMenuItems, MenuId } from "../registry/MenuRegistry";
import { APP_PLUGIN_ID } from "../services/PluginStateService";
import i18n from "../../i18n";

export function registerShellMenus(): void {
  // ── ☰ 菜单栏 ──
  registerMenuItems(MenuId.MenuBar, APP_PLUGIN_ID, [
    {
      command: "",
      label: i18n.t("文件"),
      group: "file",
      children: [
        { command: "workbench.action.exportWorkspace", group: "file" },
        { command: "workbench.action.importWorkspace", group: "file" },
        { command: "core.openSettings", group: "file" },
      ],
    },
    {
      command: "",
      label: i18n.t("查看"),
      group: "view",
      children: [
        { command: "workbench.action.showCommands", group: "view" },
        { command: "workbench.action.showOutput", group: "view" },
        { command: "workbench.action.selectTheme", group: "view" },
        { command: "workbench.action.selectLanguage", group: "view" },
        { command: "workbench.action.openKeybindingsSettings", group: "view" },
      ],
    },
  ]);

  // ── 设置项齿轮 ──
  registerMenuItems(MenuId.SettingItemGear, APP_PLUGIN_ID, [
    { command: "workbench.action.copySettingAsUrl", group: "phase6", when: "false" },
    { command: "workbench.action.toggleSettingSync", group: "phase6", when: "false" },
  ]);
}
