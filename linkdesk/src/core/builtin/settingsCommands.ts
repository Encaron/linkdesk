/**
 * 壳首选项命令——设置/主题/语言/快捷键。
 * E5#44-3：从 coreCommands.ts 提取。
 */

import { registerCommand } from "../registry/CommandRegistry";
import { registerMenuItems, MenuId } from "../registry/MenuRegistry";
import { factorySlots } from "../data/FactorySlots";
import { getCallbacks } from "./CoreCallbacks";
import { CUSTOM_EVENTS } from "../react/CoreEvents";
import { openKeybindingsSettings } from "../registry/KeybindingRegistry";
import { requestSettingsGroup, requestScrollToSetting } from "../registry/ConfigurationRegistry";
import { APP_PLUGIN_ID } from "../services/PluginStateService";
import i18n from "../../i18n";

export function registerSettingsCommands(): void {
  const commands = [
    {
      id: "core.openSettings",
      title: i18n.t("设置"),
      category: i18n.t("视图"),
      handler: async (_token: unknown, ...args: unknown[]) => {
        const ctx = args[0] as { pluginId?: string; scrollTo?: string } | undefined;
        if (ctx?.pluginId) requestSettingsGroup(ctx.pluginId);
        if (ctx?.scrollTo) requestScrollToSetting(ctx.scrollTo);
        const settingsId = factorySlots.getPluginId("settings");
        if (settingsId) getCallbacks()?.openTab(settingsId);
      },
    },
    {
      id: "workbench.action.selectTheme",
      title: i18n.t("选择颜色主题"),
      category: i18n.t("首选项"),
      handler: async (_token: unknown, ...args: unknown[]) => {
        const ctx = args[0] as { pluginId?: string } | undefined;
        window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.SHOW_THEME_BROWSER, {
          detail: { pluginId: ctx?.pluginId },
        }));
      },
    },
    {
      id: "workbench.action.selectLanguage",
      title: i18n.t("选择语言"),
      category: i18n.t("首选项"),
      handler: async () => {
        window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.SHOW_LANGUAGE_PICKER));
      },
    },
    {
      id: "workbench.action.openKeybindingsSettings",
      title: i18n.t("打开键盘快捷方式"),
      category: i18n.t("首选项"),
      handler: async () => { await openKeybindingsSettings(); },
    },
  ];

  for (const c of commands) {
    registerCommand(APP_PLUGIN_ID, c);
  }

  // 齿轮菜单——设置/主题/语言 三个入口
  registerMenuItems(MenuId.ExtensionGear, APP_PLUGIN_ID, [
    { command: "core.openSettings", group: "navigation" },
    { command: "workbench.action.selectTheme", group: "navigation" },
    { command: "workbench.action.selectLanguage", group: "navigation" },
  ]);
}
