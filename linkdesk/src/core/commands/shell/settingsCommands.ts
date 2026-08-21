/**
 * 壳首选项命令——设置/主题/语言/快捷键。
 * E5#44-3：从 coreCommands.ts 提取。
 */

import { registerCommand } from "../../registry/commands/CommandRegistry";
import { registerMenuItems, MENU_SLOTS } from "../../registry/commands/MenuRegistry";
import { factorySlots } from "../../services/bootstrap/FactorySlots";
import { getCallbacks } from "../infra/CoreCallbacks";
// E5.5#7-p15：CUSTOM_EVENTS.SHOW_THEME_BROWSER / SHOW_LANGUAGE_PICKER 不再使用——走 QuickPickService
import { openKeybindingsSettings } from "../../registry/commands/KeybindingRegistry";
import { requestSettingsGroup, requestScrollToSetting } from "../../registry/ConfigurationRegistry";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import { shellEvents } from "../../react/events/ShellEvents";
import { getFloatingPanelViewId } from "../../../pluginLoader/viewRegistry";

export function registerSettingsCommands(): void {
  const commands = [
    {
      id: "core.openSettings",
      title: "设置",
      category: "视图",
      handler: async (...args: unknown[]) => {
        const ctx = args[0] as { pluginId?: string; scrollTo?: string } | undefined;
        if (ctx?.pluginId) requestSettingsGroup(ctx.pluginId);
        if (ctx?.scrollTo) requestScrollToSetting(ctx.scrollTo);
        // E5.8#41.12 🪡 概念生效接缝：一对多后走 getActive（读持久化激活套；无记录/已卸载回退默认=内置）
        const settingsPluginId = factorySlots.getActive("settings");
        if (!settingsPluginId) return;
        // E5.8#38（I8-3/IX-1 单一实例）：设置已是标签页 → 聚焦该标签页，不弹第二面板
        if (getCallbacks()?.focusTabByPluginId(settingsPluginId)) return;
        // E5.8#38（I8-1/I8-2）：声明制 revealFloating——面板身份开关键（无面板→开/同视图→关/他面板→替换）
        // 走 #39.5 子项 B wire（壳侧 useFloatingPanelReveal 编排），声明未解析 → no-op 不崩
        const fpViewId = getFloatingPanelViewId(settingsPluginId);
        if (fpViewId) shellEvents.emit("panel:reveal-floating", { viewId: fpViewId });
      },
    },
    {
      id: "workbench.action.selectTheme",
      title: "选择颜色主题",
      category: "首选项",
      handler: async (...args: unknown[]) => {
        const ctx = args[0] as { pluginId?: string } | undefined;
        // E5.5#7-p15：直调 QuickPickService——不再 dispatch SHOW_THEME_BROWSER
        const { showThemePicker } = await import("../../../components/shared/theme-browser/ThemeBrowser");
        showThemePicker(ctx?.pluginId);
      },
    },
    {
      id: "workbench.action.selectLanguage",
      title: "选择语言",
      category: "首选项",
      handler: async () => {
        // E5.5#7-p15：直调 QuickPickService——不再 dispatch SHOW_LANGUAGE_PICKER
        const { showLanguagePicker } = await import("../../../components/shared/language-picker/LanguagePicker");
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
  registerMenuItems(MENU_SLOTS.ExtensionGear, APP_PLUGIN_ID, [
    { command: "core.openSettings", group: "navigation" },
    { command: "workbench.action.selectTheme", group: "navigation" },
    { command: "workbench.action.selectLanguage", group: "navigation" },
    { command: "workbench.action.openKeybindingsSettings", group: "navigation" },
  ]);
}
