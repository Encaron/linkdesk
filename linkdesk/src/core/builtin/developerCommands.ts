/**
 * 壳开发者命令——DevTools/重载等。
 * E5#44-4：从 coreCommands.ts 提取。
 */

import { registerCommand } from "../registry/CommandRegistry";
import { registerMenuItems, MenuId } from "../registry/MenuRegistry";
import { CUSTOM_EVENTS } from "../react/CoreEvents";
import { APP_PLUGIN_ID } from "../services/PluginStateService";

export function registerDeveloperCommands(): void {
  const commands = [
    {
      id: "workbench.action.togglePluginDevTools",
      title: "切换插件 DevTools",
      category: "开发者",
      handler: async () => {
        window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.SHOW_DEVTOOLS_PICKER));
      },
    },
  ];

  for (const c of commands) {
    registerCommand(APP_PLUGIN_ID, c);
  }

  // 齿轮菜单入口
  registerMenuItems(MenuId.ExtensionGear, APP_PLUGIN_ID, [
    { command: "workbench.action.togglePluginDevTools", group: "navigation" },
  ]);
}
