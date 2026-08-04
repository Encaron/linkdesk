/**
 * 壳开发者命令——DevTools/重载等。
 * E5#44-4：从 coreCommands.ts 提取。
 */

import { registerCommand } from "../registry/CommandRegistry";
import { CUSTOM_EVENTS } from "../react/CoreEvents";
import { APP_PLUGIN_ID } from "../services/PluginStateService";
import i18n from "../../i18n";

export function registerDeveloperCommands(): void {
  const commands = [
    {
      id: "workbench.action.togglePluginDevTools",
      title: i18n.t("切换插件 DevTools"),
      category: i18n.t("开发者"),
      handler: async () => {
        window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.SHOW_DEVTOOLS_PICKER));
      },
    },
  ];

  for (const c of commands) {
    registerCommand(APP_PLUGIN_ID, c);
  }
}
