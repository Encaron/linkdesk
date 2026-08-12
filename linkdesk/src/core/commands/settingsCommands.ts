/**
 * 壳首选项命令——设置/主题/语言/快捷键。
 * E5#44-3：从 coreCommands.ts 提取。
 */

import { registerCommand } from "../registry/CommandRegistry";
import { registerMenuItems, MenuId } from "../registry/MenuRegistry";
import { factorySlots } from "../services/FactorySlots";
import { getCallbacks } from "./CoreCallbacks";
// E5.5#7-p15：CUSTOM_EVENTS.SHOW_THEME_BROWSER / SHOW_LANGUAGE_PICKER 不再使用——走 QuickPickService
import { openKeybindingsSettings } from "../registry/KeybindingRegistry";
import { requestSettingsGroup, requestScrollToSetting } from "../registry/ConfigurationRegistry";
import { APP_PLUGIN_ID } from "../services/PluginStateService";

export function registerSettingsCommands(): void {
  const commands = [
    {
      id: "core.openSettings",
      title: "设置",
      category: "视图",
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
      title: "选择颜色主题",
      category: "首选项",
      handler: async (_token: unknown, ...args: unknown[]) => {
        const ctx = args[0] as { pluginId?: string } | undefined;
        // E5.5#7-p15：直调 QuickPickService——不再 dispatch SHOW_THEME_BROWSER
        const { showThemePicker } = await import("../../components/ThemeBrowser");
        showThemePicker(ctx?.pluginId);
      },
    },
    {
      id: "workbench.action.selectLanguage",
      title: "选择语言",
      category: "首选项",
      handler: async () => {
        // E5.5#7-p15：直调 QuickPickService——不再 dispatch SHOW_LANGUAGE_PICKER
        const { showLanguagePicker } = await import("../../components/LanguagePicker");
        showLanguagePicker();
      },
    },
    {
      id: "workbench.action.openKeybindingsSettings",
      title: "打开键盘快捷方式",
      category: "首选项",
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
    { command: "workbench.action.openKeybindingsSettings", group: "navigation" },
  ]);
}
